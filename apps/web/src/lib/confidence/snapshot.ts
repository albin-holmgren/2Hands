/**
 * Confidence snapshot persistence.
 *
 * Writes a lightweight record of the system's health level + key counts to
 * `confidence_snapshots` (persisted) so the Health tab can show a "recent
 * stability" signal and CI gates can query the latest state.
 *
 * Table DDL (run once in Supabase):
 *
 *   create table if not exists confidence_snapshots (
 *     id          bigserial primary key,
 *     level       text not null check (level in ('healthy','degraded','unhealthy')),
 *     stale_runs  int  not null default 0,
 *     stale_locks int  not null default 0,
 *     fail_count  int  not null default 0,
 *     warn_count  int  not null default 0,
 *     source      text not null default 'cron',
 *     top_issues  jsonb,
 *     created_at  timestamptz not null default now()
 *   );
 *   -- Keep only 7 days of snapshots via row-level TTL (or a periodic purge job)
 *   create index if not exists confidence_snapshots_created_at_idx
 *     on confidence_snapshots (created_at desc);
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { HealthLevel, ConfidenceFinding } from './types'

export interface ConfidenceSnapshot {
  id?: number
  level: HealthLevel
  stale_runs: number
  stale_locks: number
  fail_count: number
  warn_count: number
  source: string
  top_issues: string[]
  created_at?: string
}

/**
 * Write a confidence snapshot to persistent storage.
 * Safe to call from cron handlers — never throws.
 */
export async function writeSnapshot(opts: {
  level: HealthLevel
  staleRuns: number
  staleLocks: number
  findings: ConfidenceFinding[]
  source?: string
}): Promise<void> {
  try {
    const supabase = createAdminClient()
    const { level, staleRuns, staleLocks, findings, source = 'cron' } = opts

    const failedFindings = findings.filter(f => f.status === 'fail')
    const warnFindings   = findings.filter(f => f.status === 'warn')

    const topIssues = failedFindings.slice(0, 3).map(f => f.title)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('confidence_snapshots')
      .insert({
        level,
        stale_runs:  staleRuns,
        stale_locks: staleLocks,
        fail_count:  failedFindings.length,
        warn_count:  warnFindings.length,
        source,
        top_issues:  topIssues,
        created_at:  new Date().toISOString(),
      })
  } catch {
    // Snapshot write is best-effort — never fail the caller
  }
}

/**
 * Read recent confidence snapshots (last N hours).
 * Returns empty array if the table does not exist yet.
 */
export async function readRecentSnapshots(hours = 24): Promise<ConfidenceSnapshot[]> {
  try {
    const supabase = createAdminClient()
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('confidence_snapshots')
      .select('id, level, stale_runs, stale_locks, fail_count, warn_count, source, top_issues, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(48) // at most 48 snapshots (every 30 min over 24h)

    return (data ?? []) as ConfidenceSnapshot[]
  } catch {
    return []
  }
}

/**
 * Derive a simple stability summary from recent snapshots.
 * Returns the ratio of healthy snapshots and the most recent level.
 */
export function summarizeRecentHealth(snapshots: ConfidenceSnapshot[]): {
  total: number
  healthy: number
  degraded: number
  unhealthy: number
  healthyPercent: number
  latestLevel: HealthLevel | null
} {
  if (snapshots.length === 0) {
    return { total: 0, healthy: 0, degraded: 0, unhealthy: 0, healthyPercent: 100, latestLevel: null }
  }

  const healthy   = snapshots.filter(s => s.level === 'healthy').length
  const degraded  = snapshots.filter(s => s.level === 'degraded').length
  const unhealthy = snapshots.filter(s => s.level === 'unhealthy').length

  return {
    total: snapshots.length,
    healthy,
    degraded,
    unhealthy,
    healthyPercent: Math.round((healthy / snapshots.length) * 100),
    latestLevel: snapshots[0].level,
  }
}
