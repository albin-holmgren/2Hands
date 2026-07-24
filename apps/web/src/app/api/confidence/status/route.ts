/**
 * GET /api/confidence/status
 *
 * Lightweight confidence snapshot for the UI widget.
 * User-scoped signals (approvals, missions) are filtered to the authenticated user.
 * Platform signals (env, db, stale runs, session pool, billing) are system-wide.
 * Requires authentication.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkEnv } from '@/lib/confidence/env-check'
import { detectStaleRuns, detectStaleMissionLocks } from '@/lib/confidence/stale-recovery'

export const runtime = 'nodejs'
export const maxDuration = 15

export interface ConfidenceStatusResponse {
  level: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  indicators: {
    env: 'ok' | 'warn' | 'error'
    database: 'ok' | 'warn' | 'error'
    stale_runs: number
    stale_locks: number
    queue_backlog: number
    pending_approvals: number
    blocked_missions: number
    session_pool: 'ok' | 'warn' | 'error'
    billing: 'ok' | 'warn' | 'error'
  }
  actions_needed: string[]
  /** Signals that are scoped to the current user vs the whole platform */
  scope: { user_id: string | null }
}

export async function GET(_request: NextRequest) {
  // Resolve the authenticated user via the cookie-scoped client (RLS-safe)
  let userId: string | null = null
  let userClient: Awaited<ReturnType<typeof createClient>> | null = null
  try {
    userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()
    userId = user?.id ?? null
  } catch { /* non-fatal — platform signals still work */ }

  if (!userId || !userClient) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Admin client is ONLY used for platform-wide signals that require bypassing RLS
  const supabase = createAdminClient()
  const actions: string[] = []

  // ── Env ───────────────────────────────────────────────────────────────────
  const envResult = checkEnv()
  const envStatus: 'ok' | 'warn' | 'error' = envResult.ok
    ? (envResult.warnings.length > 0 ? 'warn' : 'ok')
    : 'error'
  if (!envResult.ok) actions.push(`Fix ${envResult.missing.length} environment configuration problem${envResult.missing.length !== 1 ? 's' : ''}`)

  // ── Database ──────────────────────────────────────────────────────────────
  let dbStatus: 'ok' | 'warn' | 'error' = 'error' as 'ok' | 'warn' | 'error'
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1)
    dbStatus = error ? 'error' : 'ok'
    if (error) actions.push('Database is unreachable — check Supabase credentials')
  } catch {
    actions.push('Database connectivity check failed')
  }

  // ── Stale runs & locks ────────────────────────────────────────────────────
  let staleRuns = 0
  let staleLocks = 0
  try {
    const [runs, locks] = await Promise.all([detectStaleRuns(), detectStaleMissionLocks()])
    staleRuns = runs.length
    staleLocks = locks.length
    if (staleRuns > 0) actions.push(`${staleRuns} stale agent run${staleRuns !== 1 ? 's' : ''} — call POST /api/confidence/recover`)
    if (staleLocks > 0) actions.push(`${staleLocks} stale mission lock${staleLocks !== 1 ? 's' : ''} — will auto-clear on next cron`)
  } catch { /* non-fatal */ }

  // ── Queue backlog ─────────────────────────────────────────────────────────
  let queueBacklog = 0
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any)
      .from('agent_runs')
      .select('run_id', { count: 'exact', head: true })
      .eq('status', 'queued')
    queueBacklog = count ?? 0
    if (queueBacklog > 20) actions.push(`${queueBacklog} runs queued — worker may be stalled`)
  } catch { /* non-fatal */ }

  // ── Pending approvals (user-scoped via RLS-safe client) ──────────────────
  // Uses the same two tables the /api/approvals route reads from.
  // userClient enforces RLS so no user_id filter is needed — Supabase scopes
  // these rows to the authenticated user automatically.
  let pendingApprovals = 0
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [r1, r2] = await Promise.all([
      (userClient as any)
        .from('agent_approvals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      (userClient as any)
        .from('agent_pending_approvals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
    ])
    pendingApprovals = (r1.count ?? 0) + (r2.count ?? 0)
    if (pendingApprovals > 0) actions.push(`Approve ${pendingApprovals} pending action${pendingApprovals !== 1 ? 's' : ''} waiting for your review`)
  } catch { /* non-fatal */ }

  // ── Blocked missions (user-scoped via RLS-safe client) ───────────────────
  // Uses mission_events.kind (the column used by appendMissionEvent).
  // userClient enforces RLS so the missions query is already user-scoped.
  let blockedMissions = 0
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: activeMissions } = await (userClient as any)
      .from('missions')
      .select('id')
      .eq('status', 'active')
    if (activeMissions && (activeMissions as Array<{ id: string }>).length > 0) {
      const missionIds = (activeMissions as Array<{ id: string }>).map(m => m.id)
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (userClient as any)
        .from('mission_events')
        .select('id', { count: 'exact', head: true })
        .in('mission_id', missionIds)
        .eq('kind', 'mission_blocked')
        .gte('created_at', cutoff)
      blockedMissions = count ?? 0
      if (blockedMissions > 0) actions.push(`${blockedMissions} mission${blockedMissions !== 1 ? 's' : ''} blocked — check your credits or pending approvals`)
    }
  } catch { /* non-fatal */ }

  // ── Session pool ──────────────────────────────────────────────────────────
  let sessionPool: 'ok' | 'warn' | 'error' = 'ok'
  try {
    const { getSessionPoolStats } = await import('@/lib/compute/session-manager')
    const stats = await getSessionPoolStats()
    if (stats.total > 0 && stats.availableHealthy === 0) {
      sessionPool = 'error'
      actions.push('Session pool is depleted — browser agents cannot run')
    } else if (stats.expiredLeases > 0) {
      sessionPool = 'warn'
    }
  } catch { sessionPool = 'warn' }

  // ── Billing ───────────────────────────────────────────────────────────────
  let billing: 'ok' | 'warn' | 'error' = 'ok'
  try {
    const billingCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any)
      .from('agent_run_events')
      .select('id', { count: 'exact', head: true })
      .eq('name', 'credit_commit_failed')
      .gte('created_at', billingCutoff)
    if ((count ?? 0) >= 10) {
      billing = 'error'
      actions.push('Multiple credit commit failures in the last hour — check billing config')
    } else if ((count ?? 0) > 0) {
      billing = 'warn'
    }
  } catch { billing = 'warn' }

  // ── Aggregate level ───────────────────────────────────────────────────────
  const hasError = envStatus === 'error' || dbStatus === 'error' || sessionPool === 'error' || billing === 'error' || staleRuns > 5
  const hasWarn  = envStatus === 'warn'  || dbStatus === 'warn'  || sessionPool === 'warn'  || billing === 'warn'  || staleRuns > 0 || staleLocks > 0 || pendingApprovals > 0 || blockedMissions > 0

  const level: 'healthy' | 'degraded' | 'unhealthy' = hasError ? 'unhealthy' : hasWarn ? 'degraded' : 'healthy'

  const response: ConfidenceStatusResponse = {
    level,
    timestamp: new Date().toISOString(),
    indicators: {
      env: envStatus,
      database: dbStatus,
      stale_runs: staleRuns,
      stale_locks: staleLocks,
      queue_backlog: queueBacklog,
      pending_approvals: pendingApprovals,
      blocked_missions: blockedMissions,
      session_pool: sessionPool,
      billing,
    },
    actions_needed: actions,
    scope: { user_id: userId },
  }

  return NextResponse.json(response)
}
