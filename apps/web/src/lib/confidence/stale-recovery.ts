/**
 * Stale-state detection and recovery for runs and mission ticks.
 *
 * A run is stale when it has been `claimed` or `running` for longer than
 * the expected maximum duration without being completed or heartbeated.
 *
 * A mission tick lock is stale when it exists past its expiry.
 * The mission runner already cleans expired locks; this adds detection
 * for still-valid but abandoned locks.
 */

import { createAdminClient } from '@/lib/supabase/admin'

// ── Configuration ──────────────────────────────────────────────────────────

/** A run that has been claimed but not started within this window is stale. */
const STALE_CLAIMED_MINUTES = 5
/** A run that has been running without completion within this window is stale. */
const STALE_RUNNING_MINUTES = 40
/** A mission tick lock that has been held without progress is stale at this threshold. */
const STALE_TICK_LOCK_MINUTES = 35

// ── Types ──────────────────────────────────────────────────────────────────

export interface StaleRun {
  run_id: string
  agent_id: string
  user_id: string
  status: 'claimed' | 'running'
  queued_at: string
  started_at: string | null
  stale_since_minutes: number
}

export interface StaleMissionLock {
  mission_id: string
  worker_id: string
  acquired_at: string
  expires_at: string
  stale_since_minutes: number
}

export interface StaleRecoveryResult {
  stale_runs_detected: number
  stale_runs_recovered: number
  stale_locks_detected: number
  stale_locks_released: number
  errors: string[]
}

// ── Detection ──────────────────────────────────────────────────────────────

/**
 * Find agent runs that are stuck in `claimed` or `running` state.
 * Does NOT modify any data — pure read for observability/health checks.
 */
export async function detectStaleRuns(): Promise<StaleRun[]> {
  const supabase = createAdminClient()
  const now = Date.now()
  const staleClaimed = new Date(now - STALE_CLAIMED_MINUTES * 60 * 1000).toISOString()
  const staleRunning = new Date(now - STALE_RUNNING_MINUTES * 60 * 1000).toISOString()

  const [claimedRes, runningRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('agent_runs')
      .select('run_id, agent_id, user_id, status, queued_at, started_at, updated_at')
      .eq('status', 'claimed')
      .lt('updated_at', staleClaimed),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('agent_runs')
      .select('run_id, agent_id, user_id, status, queued_at, started_at, updated_at')
      .eq('status', 'running')
      .lt('updated_at', staleRunning),
  ])

  const rows = [
    ...((claimedRes.data || []) as Array<{ run_id: string; agent_id: string; user_id: string; status: string; queued_at: string; started_at: string | null; updated_at: string }>),
    ...((runningRes.data || []) as Array<{ run_id: string; agent_id: string; user_id: string; status: string; queued_at: string; started_at: string | null; updated_at: string }>),
  ]

  return rows.map(r => ({
    run_id:  r.run_id,
    agent_id: r.agent_id,
    user_id:  r.user_id,
    status:   r.status as 'claimed' | 'running',
    queued_at: r.queued_at,
    started_at: r.started_at,
    stale_since_minutes: Math.round((now - new Date(r.updated_at).getTime()) / 60000),
  }))
}

/**
 * Find mission tick locks that are still within expiry but have been held
 * beyond the expected timebox — indicates an abandoned tick.
 */
export async function detectStaleMissionLocks(): Promise<StaleMissionLock[]> {
  const supabase = createAdminClient()
  const now = Date.now()
  const staleThreshold = new Date(now - STALE_TICK_LOCK_MINUTES * 60 * 1000).toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('mission_tick_locks')
    .select('mission_id, worker_id, acquired_at, expires_at')
    .gt('expires_at', new Date().toISOString()) // still technically valid
    .lt('acquired_at', staleThreshold) // but held too long

  return ((data || []) as Array<{ mission_id: string; worker_id: string; acquired_at: string; expires_at: string }>)
    .map(r => ({
      mission_id: r.mission_id,
      worker_id:  r.worker_id,
      acquired_at: r.acquired_at,
      expires_at:  r.expires_at,
      stale_since_minutes: Math.round((now - new Date(r.acquired_at).getTime()) / 60000),
    }))
}

// ── Recovery ───────────────────────────────────────────────────────────────

/**
 * Recover stale agent runs by moving them to `failed` with a structured reason.
 * Records a lifecycle event so the run has an auditable terminal state.
 * Safe to call from a cron or health-check worker.
 */
export async function recoverStaleRuns(): Promise<StaleRecoveryResult> {
  const supabase = createAdminClient()
  const staleRuns = await detectStaleRuns()
  const staleLocks = await detectStaleMissionLocks()
  const errors: string[] = []
  let recovered = 0
  let locksReleased = 0

  // Recover stale runs
  for (const run of staleRuns) {
    try {
      const reason = run.status === 'claimed'
        ? `worker_crash: Run was claimed but never started — stuck for ${run.stale_since_minutes}m`
        : `timeout: Run was running without progress for ${run.stale_since_minutes}m`

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('agent_runs')
        .update({
          status: 'failed',
          error_message: reason,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('run_id', run.run_id)
        .in('status', ['claimed', 'running']) // guard: only move if still in stale state

      // Append lifecycle event for auditability
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rpc = (supabase as any).rpc.bind(supabase)
      await rpc('append_agent_run_event', {
        p_run_id:   run.run_id,
        p_agent_id: run.agent_id,
        p_user_id:  run.user_id,
        p_kind:     'lifecycle',
        p_name:     'stale_recovery',
        p_event:    'stale_recovery',
        p_message:  reason,
        p_payload:  {
          previous_status: run.status,
          stale_since_minutes: run.stale_since_minutes,
          recovered_at: new Date().toISOString(),
        },
      }).catch(() => {}) // event append is best-effort

      recovered++
      console.log(`[StaleRecovery] Recovered stale run ${run.run_id} (${run.status} for ${run.stale_since_minutes}m)`)
    } catch (err) {
      const msg = `Failed to recover stale run ${run.run_id}: ${err instanceof Error ? err.message : String(err)}`
      errors.push(msg)
      console.error(`[StaleRecovery] ${msg}`)
    }
  }

  // Release stale mission tick locks that should have expired
  for (const lock of staleLocks) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('mission_tick_locks')
        .delete()
        .eq('mission_id', lock.mission_id)
        .eq('worker_id', lock.worker_id)

      locksReleased++
      console.log(`[StaleRecovery] Released stale tick lock for mission ${lock.mission_id} (held for ${lock.stale_since_minutes}m)`)
    } catch (err) {
      const msg = `Failed to release stale lock for mission ${lock.mission_id}: ${err instanceof Error ? err.message : String(err)}`
      errors.push(msg)
      console.error(`[StaleRecovery] ${msg}`)
    }
  }

  return {
    stale_runs_detected:  staleRuns.length,
    stale_runs_recovered: recovered,
    stale_locks_detected: staleLocks.length,
    stale_locks_released: locksReleased,
    errors,
  }
}
