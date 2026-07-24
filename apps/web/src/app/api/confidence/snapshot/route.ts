/**
 * POST /api/confidence/snapshot
 *
 * Cron-triggered endpoint that takes a point-in-time confidence snapshot
 * and persists it to `confidence_snapshots`. Allows the Health tab to
 * display a "recent stability" signal without running expensive checks
 * on every page load.
 *
 * Auth: CRON_SECRET or INTERNAL_API_SECRET header.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkEnv } from '@/lib/confidence/env-check'
import { detectStaleRuns, detectStaleMissionLocks } from '@/lib/confidence/stale-recovery'
import { writeSnapshot } from '@/lib/confidence/snapshot'
import { alertIfUnhealthy } from '@/lib/confidence/alerting'
import type { ConfidenceFinding } from '@/lib/confidence/types'
import { deriveHealthLevel } from '@/lib/confidence/types'

export const runtime = 'nodejs'
export const maxDuration = 30

function hasAuth(request: NextRequest): boolean {
  const auth = request.headers.get('authorization')
  const cronSecret = (process.env.CRON_SECRET || '').trim()
  const internalSecret = (process.env.INTERNAL_API_SECRET || '').trim()
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true
  if (internalSecret && auth === `Bearer ${internalSecret}`) return true
  const header = request.headers.get('x-health-check-secret')
  if (internalSecret && header === internalSecret) return true
  return false
}

export async function POST(request: NextRequest) {
  if (!hasAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const findings: ConfidenceFinding[] = []
  let staleRuns = 0
  let staleLocks = 0

  // ── Env ──────────────────────────────────────────────────────────────────
  const envResult = checkEnv()
  findings.push({
    id: 'env',
    severity: envResult.ok ? 'info' : 'critical',
    status: envResult.ok ? 'pass' : 'fail',
    title: envResult.ok ? 'Environment configured' : `${envResult.missing.length} env problem(s)`,
    recommendation: envResult.ok ? 'All env vars present.' : envResult.missing.join('; '),
  })

  // ── Stale detection ───────────────────────────────────────────────────────
  try {
    const [runs, locks] = await Promise.all([detectStaleRuns(), detectStaleMissionLocks()])
    staleRuns = runs.length
    staleLocks = locks.length
    findings.push({
      id: 'stale-runs',
      severity: 'high',
      status: staleRuns > 5 ? 'fail' : staleRuns > 0 ? 'warn' : 'pass',
      title: `${staleRuns} stale run(s)`,
      recommendation: staleRuns > 0 ? 'POST /api/confidence/recover' : 'Queue is healthy.',
    })
    findings.push({
      id: 'stale-locks',
      severity: 'high',
      status: staleLocks > 3 ? 'fail' : staleLocks > 0 ? 'warn' : 'pass',
      title: `${staleLocks} stale lock(s)`,
      recommendation: staleLocks > 0 ? 'Will auto-clear on next cron.' : 'No stale locks.',
    })
  } catch {
    findings.push({
      id: 'stale-runs',
      severity: 'high',
      status: 'warn',
      title: 'Could not check stale state',
      recommendation: 'Check agent_runs / mission_tick_locks table access.',
    })
  }

  const level = deriveHealthLevel(findings)

  await writeSnapshot({ level, staleRuns, staleLocks, findings, source: 'cron-snapshot' })

  void alertIfUnhealthy({ level, staleRuns, staleLocks, findings, source: 'snapshot' })

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    level,
    stale_runs: staleRuns,
    stale_locks: staleLocks,
  })
}
