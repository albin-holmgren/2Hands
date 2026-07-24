import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionPoolStats } from '@/lib/compute/session-manager'
import { checkEnv } from '@/lib/confidence/env-check'
import { detectStaleRuns, detectStaleMissionLocks } from '@/lib/confidence/stale-recovery'
import type { HealthLevel, CheckStatus, ConfidenceFinding } from '@/lib/confidence/types'
import { deriveHealthLevel, summarizeFindings } from '@/lib/confidence/types'
import { alertIfUnhealthy } from '@/lib/confidence/alerting'

const startTime = Date.now()

function isInternalRequest(request: NextRequest): boolean {
  const internalHeader = request.headers.get('x-health-check-secret')
  const internalSecret = (process.env.INTERNAL_API_SECRET || '').trim()
  if (internalHeader && internalSecret && internalHeader === internalSecret) return true

  const forwarded = request.headers.get('x-forwarded-for')
  if (!forwarded) return false
  const ip = forwarded.split(',')[0].trim()
  return ip.startsWith('10.') || ip.startsWith('172.16.') || ip.startsWith('192.168.') || ip === '127.0.0.1'
}

export async function GET(request: NextRequest) {
  const findings: ConfidenceFinding[] = []
  const supabase = createAdminClient()

  // ── 1. Environment ───────────────────────────────────────────────────────
  const envResult = checkEnv()
  findings.push({
    id: 'env-configuration',
    severity: envResult.ok ? 'info' : 'critical',
    status: envResult.ok ? 'pass' : 'fail',
    title: envResult.ok ? 'Environment is fully configured' : 'Environment configuration problems',
    recommendation: envResult.ok
      ? 'All required environment variables are present and valid.'
      : envResult.missing.join('; '),
    details: envResult.ok ? undefined : {
      missing: envResult.missing,
      warnings: envResult.warnings,
    },
  })

  // ── 2. Database ───────────────────────────────────────────────────────────
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1)
    findings.push({
      id: 'database-connectivity',
      severity: 'critical',
      status: error ? 'fail' : 'pass',
      title: error ? 'Database is unreachable' : 'Database is reachable',
      recommendation: error
        ? 'Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY configuration.'
        : 'Database connection is healthy.',
      details: error ? { supabase_error: error.message } : undefined,
    })
  } catch (err) {
    findings.push({
      id: 'database-connectivity',
      severity: 'critical',
      status: 'fail',
      title: 'Database connectivity check threw an exception',
      recommendation: 'Check Supabase credentials and network access.',
      details: { error: err instanceof Error ? err.message : String(err) },
    })
  }

  // ── 3. Stale runs ─────────────────────────────────────────────────────────
  try {
    const staleRuns = await detectStaleRuns()
    const staleCount = staleRuns.length
    findings.push({
      id: 'stale-agent-runs',
      severity: 'high',
      status: staleCount > 5 ? 'fail' : staleCount > 0 ? 'warn' : 'pass',
      title: staleCount === 0
        ? 'No stale agent runs detected'
        : `${staleCount} stale run${staleCount !== 1 ? 's' : ''} detected`,
      recommendation: staleCount > 0
        ? 'Call POST /api/confidence/recover to clean up stale runs, or wait for the next health-check cron.'
        : 'Agent run queue is healthy.',
      details: staleCount > 0 ? { stale_runs: staleRuns.map(r => ({ run_id: r.run_id, status: r.status, stale_since_minutes: r.stale_since_minutes })) } : undefined,
    })
  } catch {
    findings.push({
      id: 'stale-agent-runs',
      severity: 'high',
      status: 'warn',
      title: 'Could not check for stale agent runs',
      recommendation: 'Ensure agent_runs table is accessible.',
    })
  }

  // ── 4. Stale mission locks ────────────────────────────────────────────────
  try {
    const staleLocks = await detectStaleMissionLocks()
    findings.push({
      id: 'stale-mission-locks',
      severity: 'high',
      status: staleLocks.length > 3 ? 'fail' : staleLocks.length > 0 ? 'warn' : 'pass',
      title: staleLocks.length === 0
        ? 'No stale mission tick locks'
        : `${staleLocks.length} stale mission lock${staleLocks.length !== 1 ? 's' : ''}`,
      recommendation: staleLocks.length > 0
        ? 'Mission tick locks are held beyond expected timebox. The next runner cron will clean up expired locks.'
        : 'Mission tick locks are healthy.',
      details: staleLocks.length > 0 ? { stale_locks: staleLocks.map(l => ({ mission_id: l.mission_id, stale_since_minutes: l.stale_since_minutes })) } : undefined,
    })
  } catch {
    findings.push({
      id: 'stale-mission-locks',
      severity: 'high',
      status: 'warn',
      title: 'Could not check for stale mission locks',
      recommendation: 'Ensure mission_tick_locks table is accessible.',
    })
  }

  // ── 5. Outbound delivery queue ────────────────────────────────────────────
  try {
    const staleProcessingCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { count, error } = await supabase
      .from('outbound_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'processing')
      .lt('updated_at', staleProcessingCutoff)

    const staleCount = count || 0
    findings.push({
      id: 'outbound-delivery-queue',
      severity: 'high',
      status: error ? 'warn' : staleCount >= 50 ? 'fail' : staleCount > 0 ? 'warn' : 'pass',
      title: error
        ? 'Could not verify outbound delivery queue'
        : staleCount === 0
          ? 'Outbound delivery queue is healthy'
          : `${staleCount} stale outbound deliveries`,
      recommendation: staleCount > 0
        ? 'Delivery workers may be stalled. Check cron jobs and outbound_deliveries table.'
        : 'Outbound queue is clear.',
      details: staleCount > 0 ? { stale_processing_count: staleCount } : undefined,
    })
  } catch {
    findings.push({
      id: 'outbound-delivery-queue',
      severity: 'high',
      status: 'warn',
      title: 'Could not verify outbound delivery queue',
      recommendation: 'Check outbound_deliveries table health.',
    })
  }

  // ── 6. Session pool ───────────────────────────────────────────────────────
  try {
    const poolStats = await getSessionPoolStats()
    const depleted = poolStats.total > 0 && poolStats.availableHealthy === 0
    const rpcUnavailable = poolStats.claimRpcAvailability === 'unavailable'
    const staleLeases = poolStats.expiredLeases > 0
    const poolStatus: CheckStatus = depleted || rpcUnavailable ? 'fail' : staleLeases ? 'warn' : 'pass'

    findings.push({
      id: 'session-pool',
      severity: 'high',
      status: poolStatus,
      title: depleted
        ? 'Session pool is depleted — no healthy slots available'
        : rpcUnavailable
          ? 'Session pool claim RPC is unavailable'
          : 'Session pool has healthy capacity',
      recommendation: depleted
        ? 'Provision additional VM sessions or release stale leases.'
        : rpcUnavailable
          ? 'Check session pool RPC function availability in Supabase.'
          : 'Session pool is healthy.',
      details: {
        total: poolStats.total,
        available_healthy: poolStats.availableHealthy,
        leased: poolStats.leased,
        warming: poolStats.warming,
        expired_leases: poolStats.expiredLeases,
        claim_rpc: poolStats.claimRpcAvailability,
      },
    })
  } catch {
    findings.push({
      id: 'session-pool',
      severity: 'high',
      status: 'warn',
      title: 'Could not check session pool',
      recommendation: 'Check session_pool table access.',
    })
  }

  // ── 7. Billing reconciliation ─────────────────────────────────────────────
  try {
    const billingCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const [failedRes, escalatedRes] = await Promise.all([
      supabase
        .from('agent_run_events')
        .select('id', { count: 'exact', head: true })
        .eq('name', 'credit_commit_failed')
        .gte('created_at', billingCutoff),
      supabase
        .from('agents')
        .select('id', { count: 'exact', head: true })
        .contains('config', { billing_reconciliation_escalated: true }),
    ])

    if (failedRes.error || escalatedRes.error) {
      findings.push({
        id: 'billing-reconciliation',
        severity: 'high',
        status: 'warn',
        title: 'Could not verify billing reconciliation',
        recommendation: 'Check agent_run_events and agents table access.',
      })
    } else {
      const failedCommits = failedRes.count || 0
      const escalated = escalatedRes.count || 0
      findings.push({
        id: 'billing-reconciliation',
        severity: 'high',
        status: escalated > 0 || failedCommits >= 10 ? 'fail' : failedCommits > 0 ? 'warn' : 'pass',
        title: escalated > 0
          ? `${escalated} billing reconciliation issue${escalated !== 1 ? 's' : ''} need attention`
          : failedCommits > 0
            ? `${failedCommits} credit commit failure${failedCommits !== 1 ? 's' : ''} in the last hour`
            : 'Credit reservation commits are healthy',
        recommendation: escalated > 0
          ? 'Manually reconcile flagged agent runs in the billing admin view.'
          : failedCommits > 0
            ? 'Monitor commit_credit_reservation failures — may auto-recover on next run.'
            : 'Billing is healthy.',
        details: { failed_commits_last_hour: failedCommits, escalated_reconciliations: escalated },
      })
    }
  } catch {
    findings.push({
      id: 'billing-reconciliation',
      severity: 'high',
      status: 'warn',
      title: 'Could not verify billing reconciliation',
      recommendation: 'Check agent_run_events query permissions.',
    })
  }

  // ── Aggregate ─────────────────────────────────────────────────────────────
  const level: HealthLevel = deriveHealthLevel(findings)
  const summary = summarizeFindings(findings)
  const statusCode = level === 'healthy' ? 200 : 503

  // ── Alert on severe conditions (best-effort, non-blocking) ────────────────
  const staleRunsFinding = findings.find(f => f.id === 'stale-agent-runs')
  const staleLocksFinding = findings.find(f => f.id === 'stale-mission-locks')
  const sessionFinding = findings.find(f => f.id === 'session-pool')
  const billingFinding = findings.find(f => f.id === 'billing-reconciliation')
  void alertIfUnhealthy({
    level,
    findings,
    source: 'health',
    staleRuns: typeof staleRunsFinding?.details?.stale_runs === 'object'
      ? (staleRunsFinding.details.stale_runs as unknown[]).length
      : 0,
    staleLocks: typeof staleLocksFinding?.details?.stale_locks === 'object'
      ? (staleLocksFinding.details.stale_locks as unknown[]).length
      : 0,
    sessionPoolDepleted: sessionFinding?.status === 'fail',
    billingErrors: typeof billingFinding?.details?.failed_commits_last_hour === 'number'
      ? billingFinding.details.failed_commits_last_hour as number
      : 0,
  })

  if (!isInternalRequest(request)) {
    return NextResponse.json(
      {
        status: level,
        timestamp: new Date().toISOString(),
        summary: { fail: summary.fail, warn: summary.warn },
      },
      { status: statusCode }
    )
  }

  return NextResponse.json(
    {
      status: level,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
      summary,
      findings,
    },
    { status: statusCode }
  )
}
