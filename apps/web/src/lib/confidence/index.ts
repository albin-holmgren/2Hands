/**
 * Unified confidence system.
 * Answers three distinct questions:
 *   doctor()    → "Is the system configured safely?"
 *   health()    → "Is the system healthy right now?"
 *   readiness() → "Is this safe to roll out?"
 *
 * All three use shared types from ./types so callers get consistent shapes.
 */

export { checkEnv, envCheckToFindings, logEnvCheck } from './env-check'
export type {
  Severity,
  CheckStatus,
  HealthLevel,
  RolloutStatus,
  RunState,
  TickState,
  BlockedReason,
  TriggerType,
  ConfidenceFinding,
  CheckGroup,
  ConfidenceSnapshot,
  RolloutGateResult,
  EnvCheckResult,
} from './types'
export { deriveHealthLevel, summarizeFindings } from './types'
export { classifyBlockedReason, TERMINAL_BLOCKED_REASONS, RETRYABLE_BLOCKED_REASONS } from './failure-taxonomy'
export { detectStaleRuns, detectStaleMissionLocks, recoverStaleRuns } from './stale-recovery'
export { alertIfUnhealthy, buildAlertPayload, ALERT_THRESHOLDS } from './alerting'
export { writeSnapshot, readRecentSnapshots, summarizeRecentHealth } from './snapshot'
