/**
 * Canonical auth-run state machine (14 states — Appendix 3.2).
 * Mirrors public.v3_is_legal_auth_transition in
 * supabase/migrations/20260401000003_v3_account_broker.sql EXACTLY.
 * The database RPC is the enforcement point; this module lets application
 * code (client + server) fail fast and render legal next actions.
 */
import type { AuthRunStatus } from '@2hands/types/v3'

export const AUTH_RUN_TRANSITIONS: Readonly<Record<AuthRunStatus, readonly AuthRunStatus[]>> = {
  created: ['selecting_method', 'failed', 'cancelled', 'expired'],
  selecting_method: [
    'awaiting_oauth',
    'awaiting_secure_input',
    'browser_running',
    'awaiting_email_verification',
    'awaiting_user_takeover',
    'awaiting_terms',
    'awaiting_payment',
    'validating_session',
    'failed',
    'cancelled',
    'expired',
  ],
  awaiting_oauth: [
    'validating_session',
    'awaiting_email_verification',
    'awaiting_user_takeover',
    'awaiting_terms',
    'failed',
    'cancelled',
    'expired',
  ],
  awaiting_secure_input: [
    'browser_running',
    'awaiting_email_verification',
    'validating_session',
    'awaiting_user_takeover',
    'failed',
    'cancelled',
    'expired',
  ],
  browser_running: [
    'awaiting_secure_input',
    'awaiting_email_verification',
    'awaiting_user_takeover',
    'awaiting_terms',
    'awaiting_payment',
    'validating_session',
    'failed',
    'cancelled',
    'expired',
  ],
  awaiting_email_verification: [
    'browser_running',
    'validating_session',
    'awaiting_user_takeover',
    'failed',
    'cancelled',
    'expired',
  ],
  awaiting_user_takeover: [
    'browser_running',
    'awaiting_email_verification',
    'awaiting_terms',
    'awaiting_payment',
    'validating_session',
    'failed',
    'cancelled',
    'expired',
  ],
  awaiting_terms: ['awaiting_payment', 'browser_running', 'validating_session', 'failed', 'cancelled', 'expired'],
  awaiting_payment: ['awaiting_user_takeover', 'validating_session', 'failed', 'cancelled', 'expired'],
  validating_session: [
    'completed',
    'awaiting_email_verification',
    'awaiting_user_takeover',
    'failed',
    'cancelled',
    'expired',
  ],
  completed: [],
  failed: [],
  cancelled: [],
  expired: [],
}

export const TERMINAL_AUTH_RUN_STATUSES: readonly AuthRunStatus[] = [
  'completed',
  'failed',
  'cancelled',
  'expired',
]

export function isLegalAuthTransition(from: AuthRunStatus, to: AuthRunStatus): boolean {
  return (AUTH_RUN_TRANSITIONS[from] ?? []).includes(to)
}

export function isTerminalAuthRunStatus(status: AuthRunStatus): boolean {
  return TERMINAL_AUTH_RUN_STATUSES.includes(status)
}

export function legalNextAuthRunStatuses(from: AuthRunStatus): readonly AuthRunStatus[] {
  return AUTH_RUN_TRANSITIONS[from] ?? []
}

export class IllegalAuthTransitionError extends Error {
  constructor(
    public readonly from: AuthRunStatus,
    public readonly to: AuthRunStatus,
  ) {
    super(`Illegal auth-run transition ${from} -> ${to}`)
    this.name = 'IllegalAuthTransitionError'
  }
}

export function assertLegalAuthTransition(from: AuthRunStatus, to: AuthRunStatus): void {
  if (!isLegalAuthTransition(from, to)) {
    throw new IllegalAuthTransitionError(from, to)
  }
}
