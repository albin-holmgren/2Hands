/**
 * Operational alerting for severe confidence conditions.
 *
 * Sends Sentry events when the runtime health degrades beyond thresholds.
 * Uses module-level deduplication to avoid flooding Sentry with repeated alerts
 * for persistent issues — alerts fire at most once per DEDUPE_WINDOW_MS per key.
 *
 * Usage:
 *   import { alertIfUnhealthy } from '@/lib/confidence/alerting'
 *   await alertIfUnhealthy({ level, staleRuns, staleLocks, ... })
 */

import type { HealthLevel, ConfidenceFinding } from './types'

// ── Deduplication ──────────────────────────────────────────────────────────

const DEDUPE_WINDOW_MS = 5 * 60 * 1000 // 5 minutes between repeated alerts
const lastAlerted = new Map<string, number>()

function shouldAlert(key: string): boolean {
  const last = lastAlerted.get(key) ?? 0
  const elapsed = Date.now() - last
  if (elapsed >= DEDUPE_WINDOW_MS) {
    lastAlerted.set(key, Date.now())
    return true
  }
  return false
}

// ── Alert thresholds ───────────────────────────────────────────────────────

export const ALERT_THRESHOLDS = {
  /** Stale run count that triggers a warning alert */
  STALE_RUNS_WARN: 3,
  /** Stale run count that triggers a critical alert */
  STALE_RUNS_CRITICAL: 10,
  /** Stale lock count that triggers an alert */
  STALE_LOCKS_WARN: 5,
  /** Recovery error count before alerting */
  RECOVERY_ERRORS_WARN: 2,
} as const

// ── Core alert function ────────────────────────────────────────────────────

export interface AlertPayload {
  level: HealthLevel
  staleRuns?: number
  staleLocks?: number
  sessionPoolDepleted?: boolean
  billingErrors?: number
  findings?: ConfidenceFinding[]
  source?: string
  recoveryErrors?: string[]
}

/**
 * Fire Sentry alerts for severe confidence conditions.
 * Safe to call from cron handlers and API routes — never throws.
 */
export async function alertIfUnhealthy(payload: AlertPayload): Promise<void> {
  try {
    const Sentry = await import('@sentry/nextjs')
    const { level, staleRuns = 0, staleLocks = 0, sessionPoolDepleted = false, billingErrors = 0, findings = [], source = 'health', recoveryErrors = [] } = payload

    // ── Unhealthy level ───────────────────────────────────────────────────
    if (level === 'unhealthy' && shouldAlert(`unhealthy:${source}`)) {
      const failedFindings = findings.filter(f => f.status === 'fail')
      Sentry.captureMessage(`[2Hands] Runtime is UNHEALTHY (${source})`, {
        level: 'error',
        tags: { confidence_level: level, source },
        extra: {
          failed_findings: failedFindings.map(f => ({ id: f.id, severity: f.severity, title: f.title })),
          stale_runs: staleRuns,
          stale_locks: staleLocks,
        },
      })
    }

    // ── Degraded level ────────────────────────────────────────────────────
    if (level === 'degraded' && shouldAlert(`degraded:${source}`)) {
      Sentry.captureMessage(`[2Hands] Runtime is DEGRADED (${source})`, {
        level: 'warning',
        tags: { confidence_level: level, source },
        extra: { stale_runs: staleRuns, stale_locks: staleLocks },
      })
    }

    // ── Critical stale runs ───────────────────────────────────────────────
    if (staleRuns >= ALERT_THRESHOLDS.STALE_RUNS_CRITICAL && shouldAlert('stale_runs:critical')) {
      Sentry.captureMessage(`[2Hands] CRITICAL: ${staleRuns} stale agent runs detected`, {
        level: 'error',
        tags: { alert_type: 'stale_runs', severity: 'critical' },
        extra: { stale_runs: staleRuns, threshold: ALERT_THRESHOLDS.STALE_RUNS_CRITICAL },
      })
    } else if (staleRuns >= ALERT_THRESHOLDS.STALE_RUNS_WARN && shouldAlert('stale_runs:warn')) {
      Sentry.captureMessage(`[2Hands] WARNING: ${staleRuns} stale agent runs detected`, {
        level: 'warning',
        tags: { alert_type: 'stale_runs', severity: 'warn' },
        extra: { stale_runs: staleRuns, threshold: ALERT_THRESHOLDS.STALE_RUNS_WARN },
      })
    }

    // ── Stale locks ───────────────────────────────────────────────────────
    if (staleLocks >= ALERT_THRESHOLDS.STALE_LOCKS_WARN && shouldAlert('stale_locks:warn')) {
      Sentry.captureMessage(`[2Hands] WARNING: ${staleLocks} stale mission tick locks`, {
        level: 'warning',
        tags: { alert_type: 'stale_locks' },
        extra: { stale_locks: staleLocks, threshold: ALERT_THRESHOLDS.STALE_LOCKS_WARN },
      })
    }

    // ── Session pool depleted ─────────────────────────────────────────────
    if (sessionPoolDepleted && shouldAlert('session_pool:depleted')) {
      Sentry.captureMessage('[2Hands] CRITICAL: Session pool is depleted — browser agents cannot run', {
        level: 'error',
        tags: { alert_type: 'session_pool', severity: 'critical' },
      })
    }

    // ── Billing errors ────────────────────────────────────────────────────
    if (billingErrors >= 10 && shouldAlert('billing:critical')) {
      Sentry.captureMessage(`[2Hands] CRITICAL: ${billingErrors} credit commit failures in the last hour`, {
        level: 'error',
        tags: { alert_type: 'billing', severity: 'critical' },
        extra: { billing_errors: billingErrors },
      })
    }

    // ── Recovery errors ───────────────────────────────────────────────────
    if (recoveryErrors.length >= ALERT_THRESHOLDS.RECOVERY_ERRORS_WARN && shouldAlert('recovery:errors')) {
      Sentry.captureMessage(`[2Hands] Recovery completed with ${recoveryErrors.length} error(s)`, {
        level: 'warning',
        tags: { alert_type: 'recovery_errors' },
        extra: { errors: recoveryErrors.slice(0, 5) },
      })
    }
  } catch {
    // Alerting is best-effort — never fail the caller
  }
}

/**
 * Build an AlertPayload from a set of ConfidenceFindings plus stale counters.
 * Convenience helper for routes that already have findings arrays.
 */
export function buildAlertPayload(
  level: HealthLevel,
  findings: ConfidenceFinding[],
  extras: Omit<AlertPayload, 'level' | 'findings'> = {},
): AlertPayload {
  return { level, findings, ...extras }
}
