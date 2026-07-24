/**
 * Normalised failure taxonomy for runs, ticks, and blocked actions.
 *
 * Provides a single classification function that maps raw error messages
 * to a typed BlockedReason, plus sets of terminal vs retryable reasons.
 * Used by the worker, mission runner, auto-retry, and observability.
 */

import type { BlockedReason } from './types'

/** Reasons that must not be auto-retried — require human action. */
export const TERMINAL_BLOCKED_REASONS = new Set<BlockedReason>([
  'approval_required',
  'credits_exhausted',
  'budget_exceeded',
  'policy_blocked',
  'auth_error',
  'integration_missing',
  'validation_error',
])

/** Reasons that are safe to auto-retry with backoff. */
export const RETRYABLE_BLOCKED_REASONS = new Set<BlockedReason>([
  'provider_error',
  'vm_unavailable',
  'rate_limited',
  'timeout',
  'worker_crash',
  'unknown',
])

/** Classify a raw error string or status keyword into a typed BlockedReason. */
export function classifyBlockedReason(raw: string | null | undefined): BlockedReason {
  if (!raw) return 'unknown'
  const msg = raw.trim().toLowerCase()

  if (msg.includes('approval') || msg.includes('autonomy') || msg.includes('execute_with_approval')) {
    return 'approval_required'
  }
  if (msg.includes('no credits') || msg.includes('credit') && msg.includes('exhausted') || msg.includes('out of credits') || msg.includes('credits_balance') && msg.includes('0')) {
    return 'credits_exhausted'
  }
  if (msg.includes('budget') || msg.includes('cost limit') || msg.includes('max_cost')) {
    return 'budget_exceeded'
  }
  if (msg.includes('policy') || msg.includes('blocked by') || msg.includes('not allowed') || msg.includes('draft_only') || msg.includes('permission denied')) {
    return 'policy_blocked'
  }
  if (msg.includes('unauthorized') || msg.includes('login') || msg.includes('auth') || msg.includes('permission') || msg.includes('forbidden')) {
    return 'auth_error'
  }
  if (msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('429')) {
    return 'rate_limited'
  }
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('deadline')) {
    return 'timeout'
  }
  if (msg.includes('vm not available') || msg.includes('no vm') || msg.includes('vm_unavailable') || msg.includes('session') && msg.includes('unavailable')) {
    return 'vm_unavailable'
  }
  if (msg.includes('integration') || msg.includes('connection') && (msg.includes('missing') || msg.includes('not found') || msg.includes('disconnected'))) {
    return 'integration_missing'
  }
  if (msg.includes('validation') || msg.includes('invalid') || msg.includes('required field') || msg.includes('parse error')) {
    return 'validation_error'
  }
  if (msg.includes('parsing') || msg.includes('json') && msg.includes('error') || msg.includes('unexpected token')) {
    return 'parsing_error'
  }
  if (msg.includes('concurrency') || msg.includes('too many ticks') || msg.includes('max_concurrent')) {
    return 'concurrency_limit'
  }
  if (msg.includes('daily quota') || msg.includes('max_ticks_per_day') || msg.includes('quota reached')) {
    return 'daily_quota_reached'
  }
  if (msg.includes('network') || msg.includes('dns') || msg.includes('econnrefused') || msg.includes('provider')) {
    return 'provider_error'
  }
  if (msg.includes('worker') && (msg.includes('crash') || msg.includes('died') || msg.includes('killed'))) {
    return 'worker_crash'
  }

  return 'unknown'
}

/** Human-readable labels for each reason — used in UI and notifications. */
export const BLOCKED_REASON_LABELS: Record<BlockedReason, string> = {
  approval_required:   'Waiting for approval',
  credits_exhausted:   'Out of credits',
  budget_exceeded:     'Budget limit reached',
  policy_blocked:      'Blocked by policy',
  provider_error:      'AI provider error',
  vm_unavailable:      'Browser session unavailable',
  integration_missing: 'Integration not connected',
  rate_limited:        'Rate limited',
  auth_error:          'Authentication failed',
  validation_error:    'Invalid input',
  parsing_error:       'Response parsing failed',
  timeout:             'Timed out',
  worker_crash:        'Worker crashed',
  concurrency_limit:   'Concurrency limit reached',
  daily_quota_reached: 'Daily run quota reached',
  unknown:             'Unknown error',
}

/** Suggested next action for each terminal reason. */
export const BLOCKED_REASON_ACTIONS: Partial<Record<BlockedReason, string>> = {
  approval_required:   'Approve or reject this action in the Approvals panel.',
  credits_exhausted:   'Go to Settings → Billing to top up credits.',
  budget_exceeded:     'Increase the mission budget limit in Settings.',
  policy_blocked:      'Review autonomy level or outbound policy in Mission settings.',
  auth_error:          'Check that your integration credentials are still valid.',
  integration_missing: 'Connect the required integration in Settings → Integrations.',
}
