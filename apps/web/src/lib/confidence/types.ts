/**
 * Shared confidence vocabulary used across health, doctor, readiness, and monitoring.
 * This is the single source of truth for status enums, finding shapes, and check results.
 */

// ── Status levels ──────────────────────────────────────────────────────────

/** Fine-grained severity for a single finding or check */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

/** Three-tier outcome for a check */
export type CheckStatus = 'pass' | 'warn' | 'fail'

/** High-level health of a system or the whole runtime */
export type HealthLevel = 'healthy' | 'degraded' | 'unhealthy'

/** Whether a deploy should proceed */
export type RolloutStatus = 'ready' | 'not_ready'

// ── Run and mission state machines ────────────────────────────────────────

/** All valid lifecycle states for an agent run */
export type RunState =
  | 'queued'
  | 'claimed'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout'
  | 'stale' // claimed/running with no heartbeat — needs recovery

/** All valid lifecycle states for a mission tick */
export type TickState =
  | 'scheduled'
  | 'claimed'
  | 'planning'
  | 'delegating'
  | 'waiting_on_agents'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'stale' // lock acquired but no progress — needs recovery

/** Reason a run or tick was blocked or failed */
export type BlockedReason =
  | 'approval_required'
  | 'credits_exhausted'
  | 'budget_exceeded'
  | 'policy_blocked'
  | 'provider_error'
  | 'vm_unavailable'
  | 'integration_missing'
  | 'rate_limited'
  | 'auth_error'
  | 'validation_error'
  | 'parsing_error'
  | 'timeout'
  | 'worker_crash'
  | 'concurrency_limit'
  | 'daily_quota_reached'
  | 'unknown'

// ── Trigger provenance ────────────────────────────────────────────────────

/** Why an execution was triggered */
export type TriggerType =
  | 'manual'
  | 'scheduled'
  | 'heartbeat'
  | 'mission_tick'
  | 'event_trigger'
  | 'dependency_unblocked'
  | 'follow_up'
  | 'system'

// ── Finding / check types ─────────────────────────────────────────────────

/** A single diagnostic finding (used by doctor, health, readiness) */
export interface ConfidenceFinding {
  id: string
  severity: Severity
  status: CheckStatus
  title: string
  recommendation: string
  details?: Record<string, unknown>
}

/** Result of a group of related checks */
export interface CheckGroup {
  name: string
  status: CheckStatus
  findings: ConfidenceFinding[]
}

/** Unified runtime confidence snapshot */
export interface ConfidenceSnapshot {
  level: HealthLevel
  timestamp: string
  uptime_seconds?: number
  groups: CheckGroup[]
  summary: {
    critical: number
    high: number
    medium: number
    pass: number
    warn: number
    fail: number
  }
}

// ── Rollout gate ──────────────────────────────────────────────────────────

export interface RolloutGateResult {
  status: RolloutStatus
  failedCriteria: string[]
  criteria: {
    reliability: boolean
    security: boolean
    observability: boolean
    quality_gates: boolean
    operations: boolean
  }
}

// ── Env check ─────────────────────────────────────────────────────────────

export interface EnvCheckResult {
  ok: boolean
  missing: string[]
  warnings: string[]
  message: string
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Derive the aggregate health level from a list of findings */
export function deriveHealthLevel(findings: ConfidenceFinding[]): HealthLevel {
  if (findings.some(f => f.status === 'fail')) return 'unhealthy'
  if (findings.some(f => f.status === 'warn')) return 'degraded'
  return 'healthy'
}

/** Build a summary count from findings */
export function summarizeFindings(findings: ConfidenceFinding[]) {
  return {
    critical: findings.filter(f => f.severity === 'critical' && f.status === 'fail').length,
    high:     findings.filter(f => f.severity === 'high'     && f.status === 'fail').length,
    medium:   findings.filter(f => f.severity === 'medium'   && f.status === 'fail').length,
    pass:     findings.filter(f => f.status === 'pass').length,
    warn:     findings.filter(f => f.status === 'warn').length,
    fail:     findings.filter(f => f.status === 'fail').length,
  }
}
