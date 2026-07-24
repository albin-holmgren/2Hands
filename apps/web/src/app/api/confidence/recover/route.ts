/**
 * POST /api/confidence/recover
 *
 * Triggered by cron or manually to:
 *   1. Move stale agent runs to `failed` with a structured reason
 *   2. Release abandoned mission tick locks
 *   3. Run the existing agent health reconciliation checks
 *
 * Auth: cron secret, internal secret, OR authenticated dashboard user.
 *
 * Guardrails:
 *   - 30-second cooldown per actor to prevent spam/repeated invocations
 *   - Actor attribution recorded in response and audit log
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recoverStaleRuns } from '@/lib/confidence/stale-recovery'
import { runHealthChecks } from '@/lib/monitoring/agent-health'
import { alertIfUnhealthy } from '@/lib/confidence/alerting'

export const runtime = 'nodejs'
export const maxDuration = 60

// ── Cooldown guard ─────────────────────────────────────────────────────────
// Keyed by actor ID (user_id or 'system') to prevent rapid re-triggering.
const COOLDOWN_MS = 30_000
const lastTriggered = new Map<string, number>()

function checkCooldown(actorId: string): { allowed: boolean; remainingMs: number } {
  const last = lastTriggered.get(actorId) ?? 0
  const elapsed = Date.now() - last
  if (elapsed < COOLDOWN_MS) {
    return { allowed: false, remainingMs: COOLDOWN_MS - elapsed }
  }
  return { allowed: true, remainingMs: 0 }
}

function recordTrigger(actorId: string) {
  lastTriggered.set(actorId, Date.now())
}

// ── Auth helpers ───────────────────────────────────────────────────────────

function hasSecretAuth(request: NextRequest): boolean {
  const auth = request.headers.get('authorization')
  const cronSecret = (process.env.CRON_SECRET || '').trim()
  const internalSecret = (process.env.INTERNAL_API_SECRET || '').trim()

  if (cronSecret && auth === `Bearer ${cronSecret}`) return true
  if (internalSecret && auth === `Bearer ${internalSecret}`) return true

  const headerSecret = request.headers.get('x-health-check-secret')
  if (internalSecret && headerSecret === internalSecret) return true

  return false
}

async function getAuthenticatedUser(): Promise<{ id: string } | null> {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (!error && user) return { id: user.id }
    return null
  } catch {
    return null
  }
}

// ── Audit logging ──────────────────────────────────────────────────────────

async function writeAuditLog(entry: {
  run_id: string
  actor_type: 'secret' | 'user'
  actor_id: string
  total_fixed: number
  summary: string[]
  errors: string[]
}) {
  try {
    const supabase = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('agent_run_events')
      .insert({
        run_id:   entry.run_id,
        agent_id: null,
        user_id:  entry.actor_type === 'user' ? entry.actor_id : null,
        kind:     'lifecycle',
        name:     'confidence_recovery',
        event:    'confidence_recovery',
        message:  `Recovery triggered by ${entry.actor_type} ${entry.actor_id} — fixed ${entry.total_fixed} issue${entry.total_fixed !== 1 ? 's' : ''}`,
        payload: {
          actor_type:   entry.actor_type,
          actor_id:     entry.actor_id,
          total_fixed:  entry.total_fixed,
          summary:      entry.summary,
          errors:       entry.errors,
          triggered_at: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
      })
  } catch {
    // Audit log write is best-effort — never block the recovery response
  }
}

// ── Route handlers ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Determine actor type and identity
  const isSecret = hasSecretAuth(request)
  const authedUser = isSecret ? null : await getAuthenticatedUser()

  if (!isSecret && !authedUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const actorType: 'secret' | 'user' = isSecret ? 'secret' : 'user'
  const actorId = isSecret ? 'system' : authedUser!.id

  // Cron/secret invocations are never cooldown-gated (they're rate-limited by cron schedule)
  if (!isSecret) {
    const cooldown = checkCooldown(actorId)
    if (!cooldown.allowed) {
      return NextResponse.json(
        { error: `Recovery is on cooldown — try again in ${Math.ceil(cooldown.remainingMs / 1000)}s` },
        { status: 429 },
      )
    }
  }

  recordTrigger(actorId)
  const runId = `recover-${Date.now()}`
  console.log(`[ConfidenceRecover] Starting recovery run ${runId} (actor: ${actorType}/${actorId})`)

  const [staleResult, agentHealthResult] = await Promise.allSettled([
    recoverStaleRuns(),
    runHealthChecks(),
  ])

  const stale = staleResult.status === 'fulfilled'
    ? staleResult.value
    : { error: staleResult.reason?.message ?? 'stale recovery failed', stale_runs_detected: 0, stale_runs_recovered: 0, stale_locks_detected: 0, stale_locks_released: 0, errors: [] }

  const agentHealth = agentHealthResult.status === 'fulfilled'
    ? agentHealthResult.value
    : { error: agentHealthResult.reason?.message ?? 'agent health check failed', stuckAgentsFixed: 0, locksCleanedUp: 0, reservationsCleanedUp: 0 }

  const totalFixed =
    (stale.stale_runs_recovered ?? 0) +
    (stale.stale_locks_released ?? 0) +
    ((agentHealth as { stuckAgentsFixed?: number }).stuckAgentsFixed ?? 0) +
    ((agentHealth as { locksCleanedUp?: number }).locksCleanedUp ?? 0) +
    ((agentHealth as { reservationsCleanedUp?: number }).reservationsCleanedUp ?? 0)

  const summary = [
    stale.stale_runs_recovered  > 0 ? `${stale.stale_runs_recovered} stale run${stale.stale_runs_recovered !== 1 ? 's' : ''} recovered` : null,
    stale.stale_locks_released  > 0 ? `${stale.stale_locks_released} stale lock${stale.stale_locks_released !== 1 ? 's' : ''} released` : null,
    ((agentHealth as { stuckAgentsFixed?: number }).stuckAgentsFixed ?? 0) > 0
      ? `${(agentHealth as { stuckAgentsFixed?: number }).stuckAgentsFixed} stuck agent${(agentHealth as { stuckAgentsFixed?: number }).stuckAgentsFixed !== 1 ? 's' : ''} fixed`
      : null,
  ].filter(Boolean) as string[]

  const allErrors = [
    ...((stale.errors as string[]) ?? []),
    ...((agentHealth as { error?: string }).error ? [(agentHealth as { error: string }).error] : []),
  ]

  console.log(`[ConfidenceRecover] Run ${runId} complete — fixed ${totalFixed} issues (actor: ${actorType}/${actorId})`)

  // Write durable audit record (best-effort)
  await writeAuditLog({ run_id: runId, actor_type: actorType, actor_id: actorId, total_fixed: totalFixed, summary, errors: allErrors })

  // Alert if recovery found significant issues or failed with errors (best-effort)
  void alertIfUnhealthy({
    level: stale.stale_runs_detected > 10 ? 'unhealthy' : stale.stale_runs_detected > 0 ? 'degraded' : 'healthy',
    staleRuns: stale.stale_runs_detected,
    staleLocks: stale.stale_locks_detected,
    recoveryErrors: allErrors,
    source: 'recover',
  })

  return NextResponse.json({
    run_id: runId,
    timestamp: new Date().toISOString(),
    actor: { type: actorType, id: actorId },
    stale_recovery: stale,
    agent_health: agentHealth,
    total_issues_fixed: totalFixed,
    summary,
  })
}

export async function GET(request: NextRequest) {
  const isSecret = hasSecretAuth(request)
  const authedUser = isSecret ? null : await getAuthenticatedUser()

  if (!isSecret && !authedUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // GET = dry-run, detect only, no writes
  const { detectStaleRuns, detectStaleMissionLocks } = await import('@/lib/confidence/stale-recovery')
  const [staleRuns, staleLocks] = await Promise.all([detectStaleRuns(), detectStaleMissionLocks()])

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    dry_run: true,
    actor: { type: isSecret ? 'secret' : 'user', id: isSecret ? 'system' : authedUser!.id },
    stale_runs: staleRuns,
    stale_mission_locks: staleLocks,
    summary: {
      stale_runs: staleRuns.length,
      stale_mission_locks: staleLocks.length,
    },
  })
}
