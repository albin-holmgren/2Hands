export const runtime = 'nodejs'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { executeAgentTask as executeInProcessAgentTask } from '@/lib/computer-use/executor'
import { executeAgentTask as executeNemoClawAgentTask } from '@/lib/nemoclaw/executor'
import { ensureAgentSession, getAgentSession } from '@/lib/compute/session-manager'
import {
  claimQueuedAgentRuns,
  updateAgentRunStatus,
  appendAgentRunEvent,
  enqueueAgentRun,
} from '@/lib/agents/run-queue'
import {
  reserveCredits,
  commitCreditReservation,
  releaseCreditReservation,
  calculateCreditsForRun,
} from '@/lib/credits'
import { appendMissionEvent, getMission, updateMissionGoalTree } from '@/lib/missions/mission-service'
import { advanceProjectTask, advanceToNextProject, deserializeGoalTree } from '@/lib/computer-use/subgoal-planner'
import { startRunMetrics } from '@/lib/proactive/observability'
import { shouldAutoRetry, recordFailure } from '@/lib/agents/auto-retry'
import { onAgentComplete } from '@/lib/proactive/agent-completion-events'

interface QueuedRunLike {
  run_id: string
  agent_id: string
  user_id: string
  task_description: string
  trigger_type: string
  metadata: Record<string, unknown> | null
}

interface AgentRow {
  id: string
  user_id: string
  name: string
  status: string
  vm_ip: string | null
  config: Record<string, unknown> | null
}

function verifyWorkerAuth(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get('authorization')
  const cronSecret = (process.env.CRON_SECRET || '').trim()

  if (!cronSecret) {
    console.error('SECURITY: CRON_SECRET not configured - rejecting agent worker request')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}

function normalizeVmIp(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

async function resolveVmIpForRun(agent: AgentRow, userId: string): Promise<string | null> {
  const requestedVmIp = normalizeVmIp((agent.config || {}).requested_vm_ip)
  if (requestedVmIp) return requestedVmIp

  let vmIp = normalizeVmIp(agent.vm_ip)
  if (!vmIp) {
    const session = await getAgentSession(agent.id)
    vmIp = normalizeVmIp(session?.ipAddress)
  }

  if (!vmIp) {
    const session = await ensureAgentSession(agent.id, userId)
    vmIp = normalizeVmIp(session?.ipAddress)
  }

  if (vmIp) return vmIp

  // Fallback: use SHARED_VM_IP if configured (covers single-VM production setups)
  const sharedVmIp = (process.env.SHARED_VM_IP || process.env.VM_IP)?.trim()
  if (sharedVmIp) {
    console.log('[AgentWorker] No session found, falling back to VM_IP:', sharedVmIp)
    return sharedVmIp
  }

  const supabase = createAdminClient()
  const { data: activeConns } = await supabase
    .from('integration_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)

  if (activeConns && activeConns.length > 0) {
    return 'api-only'
  }

  // No VM and no integrations — fall back to api-only rather than failing.
  // In-process executor handles 'api-only' (integrations + web tools, no live browser VM).
  console.log('[AgentWorker] No VM or integrations found, falling back to api-only mode')
  return 'api-only'
}

function shouldUseNemoClawExecutor(vmIp: string): boolean {
  const enabled = (process.env.NEMOCLAW_EXECUTOR || '').trim().toLowerCase() === 'true'
  return enabled && Boolean(vmIp) && vmIp !== 'api-only'
}

async function processQueuedRun(workerId: string, run: QueuedRunLike): Promise<{ runId: string; status: 'completed' | 'failed'; error?: string }> {
  const supabase = createAdminClient()
  const metadata = (run.metadata || {}) as Record<string, unknown>

  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id, user_id, name, status, vm_ip, config')
    .eq('id', run.agent_id)
    .single()

  if (agentError || !agent) {
    const errorMessage = 'Agent not found for queued run'
    await updateAgentRunStatus(run.run_id, 'failed', {
      workerId,
      errorMessage,
      completedAt: new Date().toISOString(),
    })
    return { runId: run.run_id, status: 'failed', error: errorMessage }
  }

  const agentRow = agent as AgentRow
  const nowIso = new Date().toISOString()

  await updateAgentRunStatus(run.run_id, 'running', {
    workerId,
    startedAt: nowIso,
  })

  const requestedVmIpFromRun = normalizeVmIp(metadata.requested_vm_ip)
  const vmIp = requestedVmIpFromRun || await resolveVmIpForRun(agentRow, run.user_id)
  if (!vmIp) {
    const errorMessage = 'VM not available'
    await appendAgentRunEvent({
      runId: run.run_id,
      agentId: run.agent_id,
      userId: run.user_id,
      kind: 'lifecycle',
      name: 'run_failed',
      event: 'run_failed',
      message: errorMessage,
      payload: { reason: 'no_vm' },
    })
    await updateAgentRunStatus(run.run_id, 'failed', {
      workerId,
      errorMessage,
      completedAt: new Date().toISOString(),
    })

    await supabase
      .from('agents')
      .update({
        status: 'failed',
        config: {
          ...(agentRow.config || {}),
          execution_started: false,
          active_run_id: null,
          active_run_ended_at: new Date().toISOString(),
          last_error: errorMessage,
          last_error_at: new Date().toISOString(),
        },
      } as never)
      .eq('id', run.agent_id)

    return { runId: run.run_id, status: 'failed', error: errorMessage }
  }

  const reservationAmount = calculateCreditsForRun(Boolean((metadata as { is_heavy_run?: unknown }).is_heavy_run))
  const reservation = await reserveCredits(run.user_id, reservationAmount, 'agent_run', run.run_id)
  if (!reservation.success || !reservation.reservationId) {
    const errorMessage = reservation.error || 'Insufficient credits'
    await appendAgentRunEvent({
      runId: run.run_id,
      agentId: run.agent_id,
      userId: run.user_id,
      kind: 'credit',
      name: 'credit_reservation_failed',
      event: 'credit_reservation_failed',
      message: errorMessage,
      payload: {
        requested_credits: reservationAmount,
      },
    })

    await updateAgentRunStatus(run.run_id, 'failed', {
      workerId,
      errorMessage,
      completedAt: new Date().toISOString(),
    })

    await supabase
      .from('agents')
      .update({
        status: 'failed',
        config: {
          ...(agentRow.config || {}),
          execution_started: false,
          active_run_id: null,
          active_run_ended_at: new Date().toISOString(),
          last_error: errorMessage,
          last_error_at: new Date().toISOString(),
        },
      } as never)
      .eq('id', run.agent_id)

    return { runId: run.run_id, status: 'failed', error: errorMessage }
  }

  const reservationId = reservation.reservationId

  await supabase
    .from('agents')
    .update({
      status: 'working',
      vm_ip: vmIp,
      config: {
        ...(agentRow.config || {}),
        execution_started: true,
        active_run_id: run.run_id,
        active_run_started_at: nowIso,
        active_run_task: run.task_description,
        active_run_mode: 'worker',
        worker_id: workerId,
      },
      last_active: nowIso,
    } as never)
    .eq('id', run.agent_id)

  await appendAgentRunEvent({
    runId: run.run_id,
    agentId: run.agent_id,
    userId: run.user_id,
    kind: 'lifecycle',
    name: 'run_started',
    event: 'run_started',
    message: 'Worker started run execution',
    payload: {
      worker_id: workerId,
      trigger_type: run.trigger_type,
      vm_ip: vmIp,
      credit_reservation_id: reservationId,
      reserved_credits: reservationAmount,
    },
  })

  try {
    await startRunMetrics(run.agent_id, run.user_id, run.run_id)
  } catch (metricsError) {
    console.error('[AgentWorker] Failed to start run metrics:', metricsError)
  }

  try {
    const runTask = shouldUseNemoClawExecutor(vmIp) ? executeNemoClawAgentTask : executeInProcessAgentTask
    await runTask({
      agentId: run.agent_id,
      runId: run.run_id,
      vmIp,
      taskDescription: run.task_description,
      userId: run.user_id,
    })

    const reservationCommitted = await commitCreditReservation(reservationId, reservationAmount)
    let commitFailureMessage: string | null = null
    if (!reservationCommitted) {
      commitFailureMessage = 'Failed to commit reserved credits; reconciliation required'
      await appendAgentRunEvent({
        runId: run.run_id,
        agentId: run.agent_id,
        userId: run.user_id,
        kind: 'credit',
        name: 'credit_commit_failed',
        event: 'credit_commit_failed',
        message: commitFailureMessage,
        payload: {
          credit_reservation_id: reservationId,
          reserved_credits: reservationAmount,
          requires_manual_reconciliation: true,
        },
      })

      await supabase
        .from('agents')
        .update({
          config: {
            ...(agentRow.config || {}),
            billing_reconciliation_required: true,
            billing_reconciliation_run_id: run.run_id,
            billing_reconciliation_reservation_id: reservationId,
            billing_reconciliation_amount: reservationAmount,
            billing_reconciliation_flagged_at: new Date().toISOString(),
          },
        } as never)
        .eq('id', run.agent_id)
    }

    await appendAgentRunEvent({
      runId: run.run_id,
      agentId: run.agent_id,
      userId: run.user_id,
      kind: 'lifecycle',
      name: 'run_completed',
      event: 'run_completed',
      message: 'Worker completed run execution',
      payload: {
        worker_id: workerId,
        credit_commit_ok: reservationCommitted,
      },
    })

    await updateAgentRunStatus(run.run_id, 'completed', {
      workerId,
      completedAt: new Date().toISOString(),
      ...(commitFailureMessage ? { errorMessage: commitFailureMessage } : {}),
    })

    // Feed completion back to the parent mission so the next tick has context
    const missionId = typeof metadata.mission_id === 'string' ? metadata.mission_id : null
    const missionWorkspaceId = typeof (agentRow.config as Record<string, unknown> | null)?.['workspace_id'] === 'string'
      ? String((agentRow.config as Record<string, unknown>)['workspace_id'])
      : null
    if (missionId && metadata.mission_spawned) {
      // Lookup workspace_id from agent row if not in config
      const { data: agentFull } = await supabase
        .from('agents')
        .select('workspace_id')
        .eq('id', run.agent_id)
        .single()
      const wsId = missionWorkspaceId || (agentFull as { workspace_id?: string } | null)?.workspace_id || ''
      if (wsId) {
        // Read last_run_summary from agent config (written by task_complete in executor)
        const { data: agentAfterRun } = await supabase
          .from('agents')
          .select('config')
          .eq('id', run.agent_id)
          .single()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const agentSummary = ((agentAfterRun as any)?.config as Record<string, unknown> | null)?.last_run_summary as string | undefined
        appendMissionEvent(
          missionId, wsId, run.user_id,
          'agent_completed',
          `Agent "${agentRow.name}" completed task: ${run.task_description.slice(0, 120)}`,
          {
            agent_id: run.agent_id,
            run_id: run.run_id,
            task: run.task_description,
            agent_name: agentRow.name,
            agent_summary: agentSummary || run.task_description.slice(0, 300),
          }
        ).catch(() => {})

        // Advance GoalTree: mark current task done, advance project if all tasks done
        const missionForTree = await getMission(missionId)
        if (missionForTree?.goal_tree) {
          const tree = missionForTree.goal_tree
          if (tree) {
            const { tree: updatedTree, projectCompleted } = advanceProjectTask(tree)
            if (projectCompleted) {
              const advancedTree = advanceToNextProject(updatedTree)
              await updateMissionGoalTree(missionId, advancedTree, agentSummary || '')
            } else {
              await updateMissionGoalTree(missionId, updatedTree, agentSummary || '')
            }
          }
        }

        // Event-driven: immediately schedule next mission tick so it doesn't wait for cron
        try {
          await supabase
            .from('missions')
            .update({ next_tick_at: new Date().toISOString() } as never)
            .eq('id', missionId)
            .eq('status', 'active')

          // Kick the mission runner so it picks up the next tick within seconds
          const cronSecret = (process.env.CRON_SECRET || '').trim()
          if (cronSecret) {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'
            fetch(`${baseUrl}/api/missions/runner`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
            }).catch(() => {})
          }
        } catch { /* non-critical: mission tick kick failed */ }

        // If we have a rich summary, post it to the mission's AI Manager conversation
        if (agentSummary && agentSummary.length > 50) {
          const { data: missionRow } = await supabase
            .from('missions')
            .select('conversation_id')
            .eq('id', missionId)
            .single()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const convId = (missionRow as any)?.conversation_id as string | null
          if (convId) {
            const content = `🔍 **${agentRow.name} — findings ready**\n\n${agentSummary}`
            void supabase.from('messages').insert({
              conversation_id: convId,
              role: 'assistant',
              content,
              metadata: {
                type: 'agent_finding',
                agent_id: run.agent_id,
                agent_name: agentRow.name,
                mission_id: missionId,
              },
            } as never)
          }
        }
      }
    }

    // Notify user via AI Manager conversation, push notifications, etc.
    try {
      const { data: agentAfterComplete } = await supabase
        .from('agents')
        .select('config')
        .eq('id', run.agent_id)
        .single()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const agentCfg = ((agentAfterComplete as any)?.config as Record<string, unknown> | null)
      const completeSummary = agentCfg?.last_run_summary as string | undefined
      // last_run_verified: true = confirmed, false = write attempted but unconfirmed, undefined = unknown (treat as verified)
      const completeVerified = agentCfg?.last_run_verified !== false
      await onAgentComplete({
        agentId: run.agent_id,
        agentName: agentRow.name,
        userId: run.user_id,
        runId: run.run_id,
        status: 'completed',
        summary: completeSummary || `Completed task: ${run.task_description.slice(0, 200)}`,
        verified: completeVerified,
      })
    } catch (completionErr) {
      console.error('[AgentWorker] onAgentComplete error (non-fatal):', completionErr)
    }

    return { runId: run.run_id, status: 'completed' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    await releaseCreditReservation(reservationId).catch(releaseError => {
      console.error('[AgentWorker] Failed to release credit reservation:', releaseError)
    })

    const retryAttempt = typeof (agentRow.config as { retry_attempt?: unknown } | null)?.retry_attempt === 'number'
      ? ((agentRow.config as { retry_attempt?: number }).retry_attempt || 0)
      : 0

    await recordFailure(run.agent_id, run.run_id, message, retryAttempt, false).catch(() => {})
    const retryDecision = await shouldAutoRetry(run.agent_id, message, retryAttempt).catch(() => null)

    let nextRunId: string | null = null
    let retryAvailableAtIso: string | null = null
    if (retryDecision?.shouldRetry) {
      nextRunId = randomUUID()
      retryAvailableAtIso = new Date(Date.now() + retryDecision.delayMs).toISOString()
      const retryEnqueue = await enqueueAgentRun({
        runId: nextRunId,
        agentId: run.agent_id,
        userId: run.user_id,
        triggerType: 'system',
        taskDescription: run.task_description,
        availableAt: retryAvailableAtIso,
        metadata: {
          retry_of_run_id: run.run_id,
          retry_count: retryDecision.retryCount,
          retry_reason: retryDecision.reason,
          retry_delay_ms: retryDecision.delayMs,
          retry_available_at: retryAvailableAtIso,
          requested_vm_ip: vmIp,
        },
      })

      if (!retryEnqueue.success) {
        nextRunId = null
        retryAvailableAtIso = null
      } else {
        await appendAgentRunEvent({
          runId: run.run_id,
          agentId: run.agent_id,
          userId: run.user_id,
          kind: 'lifecycle',
          name: 'run_retry_scheduled',
          event: 'run_retry_scheduled',
          message: `Retry scheduled in ${Math.round(retryDecision.delayMs / 1000)}s`,
          payload: {
            retry_run_id: nextRunId,
            retry_count: retryDecision.retryCount,
            retry_delay_ms: retryDecision.delayMs,
            retry_available_at: retryAvailableAtIso,
          },
        })
      }
    }

    await appendAgentRunEvent({
      runId: run.run_id,
      agentId: run.agent_id,
      userId: run.user_id,
      kind: 'lifecycle',
      name: 'run_failed',
      event: 'run_failed',
      message,
      payload: {
        worker_id: workerId,
        retry_scheduled: Boolean(nextRunId),
        retry_run_id: nextRunId,
        retry_reason: retryDecision?.reason || null,
        retry_delay_ms: retryDecision?.delayMs || null,
        retry_available_at: retryAvailableAtIso,
      },
    })

    await updateAgentRunStatus(run.run_id, 'failed', {
      workerId,
      errorMessage: message,
      completedAt: new Date().toISOString(),
    })

    await supabase
      .from('agents')
      .update({
        status: nextRunId ? 'idle' : 'failed',
        next_run_at: retryAvailableAtIso,
        config: {
          ...(agentRow.config || {}),
          execution_started: false,
          active_run_id: null,
          active_run_ended_at: new Date().toISOString(),
          last_error: message,
          last_error_at: new Date().toISOString(),
          retry_attempt: retryDecision?.retryCount || 0,
          retry_reason: retryDecision?.reason || null,
          auto_retry_scheduled: Boolean(nextRunId),
          retry_run_id: nextRunId,
        },
      } as never)
      .eq('id', run.agent_id)

    // Notify user of failure (only if not auto-retrying)
    if (!nextRunId) {
      try {
        await onAgentComplete({
          agentId: run.agent_id,
          agentName: agentRow.name,
          userId: run.user_id,
          runId: run.run_id,
          status: 'failed',
          summary: message,
        })
      } catch (completionErr) {
        console.error('[AgentWorker] onAgentComplete (failure) error (non-fatal):', completionErr)
      }
    }

    return { runId: run.run_id, status: 'failed', error: message }
  }
}

async function processQueuedRunsWithConcurrency(
  workerId: string,
  queuedRuns: QueuedRunLike[],
  concurrency: number
): Promise<Array<{ runId: string; status: 'completed' | 'failed'; error?: string }>> {
  const boundedConcurrency = Math.max(1, Math.min(concurrency, queuedRuns.length))
  const results: Array<{ runId: string; status: 'completed' | 'failed'; error?: string } | null> = new Array(queuedRuns.length).fill(null)
  let nextIndex = 0

  const workers = Array.from({ length: boundedConcurrency }, async () => {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= queuedRuns.length) {
        return
      }

      results[index] = await processQueuedRun(workerId, queuedRuns[index])
    }
  })

  await Promise.all(workers)
  return results.filter((result): result is { runId: string; status: 'completed' | 'failed'; error?: string } => Boolean(result))
}

export async function POST(request: NextRequest) {
  const authError = verifyWorkerAuth(request)
  if (authError) return authError

  const limitParam = request.nextUrl.searchParams.get('limit')
  const limit = Math.max(1, Math.min(10, Number(limitParam || '2') || 2))
  const concurrencyParam = request.nextUrl.searchParams.get('concurrency')
  const concurrency = Math.max(1, Math.min(limit, Number(concurrencyParam || '2') || 2))

  const workerId = `agent_worker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const queuedRuns = await claimQueuedAgentRuns(workerId, limit)

  if (queuedRuns.length === 0) {
    return NextResponse.json({ success: true, claimed: 0, completed: 0, failed: 0, results: [] })
  }

  const results = await processQueuedRunsWithConcurrency(workerId, queuedRuns, concurrency)

  const completed = results.filter(r => r.status === 'completed').length
  const failed = results.filter(r => r.status === 'failed').length

  return NextResponse.json({
    success: true,
    workerId,
    claimed: queuedRuns.length,
    concurrency,
    completed,
    failed,
    results,
  })
}

export async function GET(request: NextRequest) {
  // Vercel cron jobs send GET requests with the x-vercel-cron: 1 header.
  // When invoked by the cron, we process queued runs exactly like POST does.
  const isCron = request.headers.get('x-vercel-cron') === '1'

  if (isCron) {
    const authError = verifyWorkerAuth(request)
    if (authError) return authError

    const limitParam = request.nextUrl.searchParams.get('limit')
    const limit = Math.max(1, Math.min(10, Number(limitParam || '2') || 2))
    const concurrencyParam = request.nextUrl.searchParams.get('concurrency')
    const concurrency = Math.max(1, Math.min(limit, Number(concurrencyParam || '2') || 2))

    const workerId = `agent_worker_cron_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const queuedRuns = await claimQueuedAgentRuns(workerId, limit)

    if (queuedRuns.length === 0) {
      return NextResponse.json({ success: true, claimed: 0, completed: 0, failed: 0, results: [] })
    }

    const results = await processQueuedRunsWithConcurrency(workerId, queuedRuns, concurrency)
    const completed = results.filter(r => r.status === 'completed').length
    const failed = results.filter(r => r.status === 'failed').length

    return NextResponse.json({
      success: true,
      workerId,
      claimed: queuedRuns.length,
      concurrency,
      completed,
      failed,
      results,
    })
  }

  // Non-cron GET: return queue stats only
  const authError = verifyWorkerAuth(request)
  if (authError) return authError

  const supabase = createAdminClient()
  const nowIso = new Date().toISOString()

  const { count: queuedCount } = await supabase
    .from('agent_runs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'queued')

  let dueQueuedRuns = 0
  let deferredQueuedRuns = 0
  let oldestQueuedRun: { run_id: string; queued_at: string | null; available_at: string | null } | null = null
  let oldestDueQueuedRun: { run_id: string; queued_at: string | null; available_at: string | null } | null = null
  try {
    const [
      { count: dueCount },
      { count: deferredCount },
      { data: oldestQueued },
      { data: oldestDueQueued },
    ] = await Promise.all([
      supabase
        .from('agent_runs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'queued')
        .lte('available_at', nowIso),
      supabase
        .from('agent_runs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'queued')
        .gt('available_at', nowIso),
      supabase
        .from('agent_runs')
        .select('run_id, queued_at, available_at')
        .eq('status', 'queued')
        .order('queued_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('agent_runs')
        .select('run_id, queued_at, available_at')
        .eq('status', 'queued')
        .lte('available_at', nowIso)
        .order('available_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ])

    dueQueuedRuns = dueCount || 0
    deferredQueuedRuns = deferredCount || 0
    oldestQueuedRun = (oldestQueued as { run_id: string; queued_at: string | null; available_at: string | null } | null) || null
    oldestDueQueuedRun = (oldestDueQueued as { run_id: string; queued_at: string | null; available_at: string | null } | null) || null
  } catch {
    // available_at might not exist until migrations are fully rolled out
  }

  const { count: runningCount } = await supabase
    .from('agent_runs')
    .select('id', { count: 'exact', head: true })
    .in('status', ['claimed', 'running'])

  const queueState = dueQueuedRuns > 0
    ? 'waiting_for_worker'
    : deferredQueuedRuns > 0
      ? 'waiting_for_available_at'
      : 'idle'

  const nowMs = Date.now()
  const oldestQueuedAgeSeconds = oldestQueuedRun?.queued_at
    ? Math.max(0, Math.round((nowMs - new Date(oldestQueuedRun.queued_at).getTime()) / 1000))
    : null
  const oldestDueWaitSeconds = oldestDueQueuedRun?.available_at
    ? Math.max(0, Math.round((nowMs - new Date(oldestDueQueuedRun.available_at).getTime()) / 1000))
    : null

  const queueDiagnostics = {
    state: queueState,
    waiting_for_available_at: deferredQueuedRuns,
    waiting_for_worker: dueQueuedRuns,
    hint: queueState === 'waiting_for_available_at'
      ? 'Runs are deferred until available_at. This is expected for retries/scheduled delays.'
      : queueState === 'waiting_for_worker'
        ? 'Runs are due now and waiting for worker claim. Check worker cron/invocation frequency.'
        : 'No queued backlog right now.',
  }

  return NextResponse.json({
    queuedRuns: queuedCount || 0,
    dueQueuedRuns,
    deferredQueuedRuns,
    inFlightRuns: runningCount || 0,
    queueDiagnostics,
    oldestQueuedRun,
    oldestDueQueuedRun,
    oldestQueuedAgeSeconds,
    oldestDueWaitSeconds,
    currentTime: new Date().toISOString(),
  })
}
