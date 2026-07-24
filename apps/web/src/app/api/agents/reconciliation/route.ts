export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { commitCreditReservation } from '@/lib/credits'
import { appendAgentRunEvent } from '@/lib/agents/run-queue'

type ReconciliationStatus = 'resolved' | 'pending' | 'invalid' | 'escalated'

interface ReconciliationResult {
  agentId: string
  runId: string | null
  reservationId: string | null
  status: ReconciliationStatus
  message: string
}

function verifyCronAuth(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get('authorization')
  const cronSecret = (process.env.CRON_SECRET || '').trim()

  if (!cronSecret) {
    console.error('SECURITY: CRON_SECRET not configured - rejecting reconciliation request')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}

function asPositiveInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }
  return undefined
}

async function reconcileAgent(
  agent: { id: string; user_id: string; config: Record<string, unknown> | null },
  maxAttempts: number
): Promise<ReconciliationResult> {
  const supabase = createAdminClient()
  const config = (agent.config || {}) as Record<string, unknown>
  const nowIso = new Date().toISOString()

  const reservationId = typeof config.billing_reconciliation_reservation_id === 'string'
    ? config.billing_reconciliation_reservation_id
    : null
  const runId = typeof config.billing_reconciliation_run_id === 'string'
    ? config.billing_reconciliation_run_id
    : null
  const amount = asPositiveInteger(config.billing_reconciliation_amount)
  const currentAttempts = typeof config.billing_reconciliation_attempts === 'number'
    ? config.billing_reconciliation_attempts
    : 0

  if (!reservationId) {
    await supabase
      .from('agents')
      .update({
        config: {
          ...config,
          billing_reconciliation_required: false,
          billing_reconciliation_escalated: true,
          billing_reconciliation_escalated_at: nowIso,
          billing_reconciliation_escalation_reason: 'missing_reservation_id',
          billing_reconciliation_last_attempt_at: nowIso,
          billing_reconciliation_last_error: 'Missing billing_reconciliation_reservation_id',
        },
      } as never)
      .eq('id', agent.id)

    return {
      agentId: agent.id,
      runId,
      reservationId: null,
      status: 'escalated',
      message: 'Missing reservation id; escalated for manual reconciliation',
    }
  }

  const committed = await commitCreditReservation(reservationId, amount)

  if (committed) {
    await supabase
      .from('agents')
      .update({
        config: {
          ...config,
          billing_reconciliation_required: false,
          billing_reconciliation_escalated: false,
          billing_reconciliation_escalated_at: null,
          billing_reconciliation_escalation_reason: null,
          billing_reconciliation_resolved_at: nowIso,
          billing_reconciliation_last_attempt_at: nowIso,
          billing_reconciliation_last_error: null,
        },
      } as never)
      .eq('id', agent.id)

    if (runId) {
      await appendAgentRunEvent({
        runId,
        agentId: agent.id,
        userId: agent.user_id,
        kind: 'credit',
        name: 'credit_reconciliation_committed',
        event: 'credit_reconciliation_committed',
        message: 'Billing reconciliation committed reserved credits',
        payload: {
          credit_reservation_id: reservationId,
          reconciliation_amount: amount || null,
          reconciled_at: nowIso,
        },
      })
    }

    return {
      agentId: agent.id,
      runId,
      reservationId,
      status: 'resolved',
      message: 'Reservation commit reconciled',
    }
  }

  const attempts = currentAttempts + 1
  const shouldEscalate = attempts >= maxAttempts

  await supabase
    .from('agents')
    .update({
      config: {
        ...config,
        billing_reconciliation_required: shouldEscalate ? false : true,
        billing_reconciliation_escalated: shouldEscalate,
        billing_reconciliation_escalated_at: shouldEscalate ? nowIso : config.billing_reconciliation_escalated_at || null,
        billing_reconciliation_escalation_reason: shouldEscalate
          ? `max_attempts_reached:${attempts}`
          : config.billing_reconciliation_escalation_reason || null,
        billing_reconciliation_attempts: attempts,
        billing_reconciliation_last_attempt_at: nowIso,
        billing_reconciliation_last_error: shouldEscalate
          ? `commit_credit_reservation returned false after ${attempts} attempts`
          : 'commit_credit_reservation returned false',
      },
    } as never)
    .eq('id', agent.id)

  if (runId) {
    await appendAgentRunEvent({
      runId,
      agentId: agent.id,
      userId: agent.user_id,
      kind: 'credit',
      name: 'credit_reconciliation_pending',
      event: 'credit_reconciliation_pending',
      message: 'Billing reconciliation still pending',
      payload: {
        credit_reservation_id: reservationId,
        reconciliation_attempts: attempts,
        reconciliation_amount: amount || null,
        max_attempts: maxAttempts,
      },
    })

    if (shouldEscalate) {
      await appendAgentRunEvent({
        runId,
        agentId: agent.id,
        userId: agent.user_id,
        kind: 'credit',
        name: 'credit_reconciliation_escalated',
        event: 'credit_reconciliation_escalated',
        message: `Billing reconciliation escalated after ${attempts} attempts`,
        payload: {
          credit_reservation_id: reservationId,
          reconciliation_attempts: attempts,
          max_attempts: maxAttempts,
        },
      })
    }
  }

  return {
    agentId: agent.id,
    runId,
    reservationId,
    status: shouldEscalate ? 'escalated' : 'pending',
    message: shouldEscalate
      ? `Reservation not committed after ${attempts} attempts; escalated for manual reconciliation`
      : 'Reservation still not committed',
  }
}

export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const limitParam = request.nextUrl.searchParams.get('limit')
  const limit = Math.max(1, Math.min(100, Number(limitParam || '25') || 25))
  const maxAttemptsParam = request.nextUrl.searchParams.get('maxAttempts')
  const maxAttempts = Math.max(1, Math.min(50, Number(maxAttemptsParam || '6') || 6))

  const supabase = createAdminClient()
  const { data: flaggedAgents, error } = await supabase
    .from('agents')
    .select('id, user_id, config')
    .contains('config', { billing_reconciliation_required: true })
    .limit(limit)

  if (error) {
    console.error('[Reconciliation] Failed to load flagged agents:', error)
    return NextResponse.json({ error: 'Failed to load flagged agents' }, { status: 500 })
  }

  const agents = (flaggedAgents || []) as Array<{ id: string; user_id: string; config: Record<string, unknown> | null }>
  if (agents.length === 0) {
    return NextResponse.json({
      success: true,
      scanned: 0,
      maxAttempts,
      resolved: 0,
      pending: 0,
      invalid: 0,
      escalated: 0,
      results: [],
    })
  }

  const results: ReconciliationResult[] = []
  for (const agent of agents) {
    const result = await reconcileAgent(agent, maxAttempts)
    results.push(result)
  }

  const resolved = results.filter(r => r.status === 'resolved').length
  const pending = results.filter(r => r.status === 'pending').length
  const invalid = results.filter(r => r.status === 'invalid').length
  const escalated = results.filter(r => r.status === 'escalated').length

  return NextResponse.json({
    success: true,
    scanned: agents.length,
    maxAttempts,
    resolved,
    pending,
    invalid,
    escalated,
    results,
    currentTime: new Date().toISOString(),
  })
}

export async function GET(request: NextRequest) {
  // Vercel cron jobs send GET requests with the x-vercel-cron: 1 header.
  // When invoked by the cron, run actual reconciliation (same as POST).
  const isCron = request.headers.get('x-vercel-cron') === '1'

  if (isCron) {
    const authError = verifyCronAuth(request)
    if (authError) return authError

    const limitParam = request.nextUrl.searchParams.get('limit')
    const limit = Math.max(1, Math.min(100, Number(limitParam || '25') || 25))
    const maxAttemptsParam = request.nextUrl.searchParams.get('maxAttempts')
    const maxAttempts = Math.max(1, Math.min(50, Number(maxAttemptsParam || '6') || 6))

    const supabase = createAdminClient()
    const { data: flaggedAgents, error } = await supabase
      .from('agents')
      .select('id, user_id, config')
      .contains('config', { billing_reconciliation_required: true })
      .limit(limit)

    if (error) {
      console.error('[Reconciliation] Cron: Failed to load flagged agents:', error)
      return NextResponse.json({ error: 'Failed to load flagged agents' }, { status: 500 })
    }

    const agents = (flaggedAgents || []) as Array<{ id: string; user_id: string; config: Record<string, unknown> | null }>
    if (agents.length === 0) {
      return NextResponse.json({ success: true, scanned: 0, maxAttempts, resolved: 0, pending: 0, invalid: 0, escalated: 0, results: [] })
    }

    const results: ReconciliationResult[] = []
    for (const agent of agents) {
      const result = await reconcileAgent(agent, maxAttempts)
      results.push(result)
    }

    return NextResponse.json({
      success: true,
      scanned: agents.length,
      maxAttempts,
      resolved: results.filter(r => r.status === 'resolved').length,
      pending: results.filter(r => r.status === 'pending').length,
      invalid: results.filter(r => r.status === 'invalid').length,
      escalated: results.filter(r => r.status === 'escalated').length,
      results,
      currentTime: new Date().toISOString(),
    })
  }

  // Non-cron GET: return counts only
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const supabase = createAdminClient()

  const [{ count: flaggedCount }, { count: escalatedCount }, { count: recentFailedCommits }] = await Promise.all([
    supabase
      .from('agents')
      .select('id', { count: 'exact', head: true })
      .contains('config', { billing_reconciliation_required: true }),
    supabase
      .from('agents')
      .select('id', { count: 'exact', head: true })
      .contains('config', { billing_reconciliation_escalated: true }),
    supabase
      .from('agent_run_events')
      .select('id', { count: 'exact', head: true })
      .eq('name', 'credit_commit_failed')
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()),
  ])

  return NextResponse.json({
    pendingReconciliations: flaggedCount || 0,
    escalatedReconciliations: escalatedCount || 0,
    failedCommitsLastHour: recentFailedCommits || 0,
    currentTime: new Date().toISOString(),
  })
}
