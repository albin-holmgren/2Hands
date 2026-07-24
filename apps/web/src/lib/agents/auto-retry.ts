/**
 * Agent Auto-Retry System
 *
 * When an agent run fails, this system decides whether to automatically retry
 * based on the failure type, history, and user preferences.
 *
 * Key principles:
 * - Retry silently for transient errors (network, timeout, rate limit)
 * - Escalate immediately for auth/permission errors
 * - Learn from repeated failures to avoid wasting credits
 * - Notify user only when manual intervention is needed
 * - Cap retries to prevent runaway costs
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { detectErrorType, type ErrorType } from '@/lib/proactive/error-recovery'

export interface RetryDecision {
  shouldRetry: boolean
  reason: string
  delayMs: number
  retryCount: number
  maxRetries: number
  escalate: boolean
  escalationMessage?: string
}

export function decideAutoRetryFromInputs(
  errorType: ErrorType,
  errorMessage: string,
  currentRetryAttempt: number,
  recentFailures: number
): RetryDecision {
  const config = RETRYABLE_ERRORS[errorType]

  if (!config || config.maxRetries === 0) {
    return {
      shouldRetry: false,
      reason: `Error type "${errorType}" requires manual intervention`,
      delayMs: 0,
      retryCount: currentRetryAttempt,
      maxRetries: 0,
      escalate: true,
      escalationMessage: getEscalationMessage(errorType, errorMessage),
    }
  }

  if (currentRetryAttempt >= config.maxRetries) {
    return {
      shouldRetry: false,
      reason: `Max retries reached (${currentRetryAttempt}/${config.maxRetries})`,
      delayMs: 0,
      retryCount: currentRetryAttempt,
      maxRetries: config.maxRetries,
      escalate: true,
      escalationMessage: `Agent failed after ${currentRetryAttempt} retry attempts. Error: ${errorMessage.slice(0, 200)}`,
    }
  }

  if (recentFailures >= 5) {
    return {
      shouldRetry: false,
      reason: `Too many failures today (${recentFailures}). Backing off.`,
      delayMs: 0,
      retryCount: currentRetryAttempt,
      maxRetries: config.maxRetries,
      escalate: true,
      escalationMessage: `Agent has failed ${recentFailures} times in the last 24 hours. It may need reconfiguration.`,
    }
  }

  const delayMs = Math.round(config.baseDelayMs * Math.pow(config.backoff, currentRetryAttempt))

  return {
    shouldRetry: true,
    reason: `Retryable error "${errorType}" — attempt ${currentRetryAttempt + 1}/${config.maxRetries}`,
    delayMs,
    retryCount: currentRetryAttempt + 1,
    maxRetries: config.maxRetries,
    escalate: false,
  }
}

export interface FailureRecord {
  agentId: string
  runId: string
  errorType: ErrorType
  errorMessage: string
  timestamp: string
  retryAttempt: number
  wasRetried: boolean
  retrySucceeded: boolean | null
}

// Which error types are safe to auto-retry
const RETRYABLE_ERRORS: Record<ErrorType, { maxRetries: number; baseDelayMs: number; backoff: number }> = {
  network_error:       { maxRetries: 3, baseDelayMs: 5000,  backoff: 2 },
  page_load_timeout:   { maxRetries: 3, baseDelayMs: 10000, backoff: 2 },
  rate_limited:        { maxRetries: 3, baseDelayMs: 30000, backoff: 2 },
  session_expired:     { maxRetries: 2, baseDelayMs: 5000,  backoff: 1 },
  element_not_found:   { maxRetries: 2, baseDelayMs: 10000, backoff: 1.5 },
  service_unavailable: { maxRetries: 3, baseDelayMs: 60000, backoff: 2 },
  unexpected_popup:    { maxRetries: 2, baseDelayMs: 3000,  backoff: 1 },
  unknown:             { maxRetries: 1, baseDelayMs: 15000, backoff: 1 },
  // These should NOT be retried automatically
  login_failed:          { maxRetries: 0, baseDelayMs: 0, backoff: 0 },
  captcha_detected:      { maxRetries: 0, baseDelayMs: 0, backoff: 0 },
  permission_denied:     { maxRetries: 0, baseDelayMs: 0, backoff: 0 },
  verification_required: { maxRetries: 0, baseDelayMs: 0, backoff: 0 },
  two_factor_required:   { maxRetries: 0, baseDelayMs: 0, backoff: 0 },
  account_locked:        { maxRetries: 0, baseDelayMs: 0, backoff: 0 },
}

/**
 * Decide whether a failed agent run should be automatically retried.
 */
export async function shouldAutoRetry(
  agentId: string,
  errorMessage: string,
  currentRetryAttempt: number = 0
): Promise<RetryDecision> {
  const errorType = detectErrorType(errorMessage)

  // Check recent failure history — if agent has failed 5+ times today, stop retrying
  const recentFailures = await getRecentFailureCount(agentId, 24)
  return decideAutoRetryFromInputs(errorType, errorMessage, currentRetryAttempt, recentFailures)
}

/**
 * Record a failure for learning purposes.
 */
export async function recordFailure(
  agentId: string,
  runId: string,
  errorMessage: string,
  retryAttempt: number,
  wasRetried: boolean
): Promise<void> {
  const supabase = createAdminClient()
  const errorType = detectErrorType(errorMessage)

  try {
    await supabase.from('agent_failures').insert({
      agent_id: agentId,
      run_id: runId,
      error_type: errorType,
      error_message: errorMessage.slice(0, 1000),
      retry_attempt: retryAttempt,
      was_retried: wasRetried,
      retry_succeeded: null, // updated later if retry succeeds
      created_at: new Date().toISOString(),
    } as never)
  } catch (err) {
    console.error('[AutoRetry] Failed to record failure:', err)
  }
}

/**
 * Mark a retry as successful (so we know the recovery worked).
 */
export async function markRetrySuccess(
  agentId: string,
  runId: string
): Promise<void> {
  const supabase = createAdminClient()

  try {
    await supabase
      .from('agent_failures')
      .update({ retry_succeeded: true } as never)
      .eq('agent_id', agentId)
      .eq('run_id', runId)
      .eq('was_retried', true)
  } catch (err) {
    console.error('[AutoRetry] Failed to mark retry success:', err)
  }
}

/**
 * Get the count of recent failures for an agent.
 */
async function getRecentFailureCount(agentId: string, hoursBack: number): Promise<number> {
  const supabase = createAdminClient()
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString()

  const { count } = await supabase
    .from('agent_failures')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agentId)
    .gte('created_at', since)

  return count || 0
}

/**
 * Get agent health score based on recent success/failure ratio.
 * Returns 0-100 where 100 = perfectly healthy.
 */
export async function getAgentHealthScore(agentId: string): Promise<{
  score: number
  status: 'healthy' | 'degraded' | 'unhealthy' | 'critical'
  recentFailures: number
  consecutiveFailures: number
  recommendation: string | null
}> {
  const supabase = createAdminClient()
  const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString() // 72 hours

  const { data: recentProgress } = await supabase
    .from('agent_progress')
    .select('status, created_at')
    .eq('agent_id', agentId)
    .gte('created_at', since)
    .in('status', ['completed', 'failed'])
    .order('created_at', { ascending: false })
    .limit(20)

  const runs = (recentProgress || []) as Array<{ status: string; created_at: string }>

  if (runs.length === 0) {
    return { score: 100, status: 'healthy', recentFailures: 0, consecutiveFailures: 0, recommendation: null }
  }

  const failures = runs.filter(r => r.status === 'failed').length
  const successes = runs.filter(r => r.status === 'completed').length
  const total = failures + successes

  // Count consecutive failures from most recent
  let consecutiveFailures = 0
  for (const run of runs) {
    if (run.status === 'failed') {
      consecutiveFailures++
    } else {
      break
    }
  }

  const successRate = total > 0 ? (successes / total) * 100 : 100
  const score = Math.round(successRate)

  let status: 'healthy' | 'degraded' | 'unhealthy' | 'critical'
  let recommendation: string | null = null

  if (consecutiveFailures >= 3) {
    status = 'critical'
    recommendation = 'Agent has failed 3+ times in a row. Consider checking credentials or reconfiguring the task.'
  } else if (score >= 80) {
    status = 'healthy'
  } else if (score >= 50) {
    status = 'degraded'
    recommendation = 'Agent success rate is below 80%. Some runs are failing.'
  } else {
    status = 'unhealthy'
    recommendation = 'Agent is failing more than half the time. It may need reconfiguration.'
  }

  return { score, status, recentFailures: failures, consecutiveFailures, recommendation }
}

/**
 * Generate a user-friendly escalation message based on error type.
 */
function getEscalationMessage(errorType: ErrorType, errorMessage: string): string {
  switch (errorType) {
    case 'login_failed':
      return 'Your agent couldn\'t log in. The password may have changed or the account may be locked.'
    case 'captcha_detected':
      return 'Your agent encountered a CAPTCHA it can\'t solve. You may need to log in manually once to clear it.'
    case 'permission_denied':
      return 'Your agent doesn\'t have permission to complete this task. Check the account\'s access level.'
    case 'two_factor_required':
      return 'Two-factor authentication is blocking your agent. You\'ll need to complete it manually.'
    case 'verification_required':
      return 'The service requires identity verification before your agent can continue.'
    case 'account_locked':
      return 'The account appears to be locked. You\'ll need to unlock it before the agent can resume.'
    default:
      return `Your agent ran into an issue: ${errorMessage.slice(0, 200)}`
  }
}
