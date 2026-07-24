/**
 * 2Hands v3 core trust-domain contracts: tasks, steps, approvals, receipts,
 * risk classes, policy, usage. Frozen names per docs/v3/IMPLEMENTATION_MAP.md
 * (authority: CODEX_ONE_SHOT_PROMPT.md + v3 docs).
 */

/** Canonical task state machine (CODEX_ONE_SHOT_PROMPT §5). */
export type TaskStatus =
  | 'draft'
  | 'planning'
  | 'awaiting_auth'
  | 'awaiting_approval'
  | 'queued'
  | 'running'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled'

export const TASK_STATUSES: readonly TaskStatus[] = [
  'draft',
  'planning',
  'awaiting_auth',
  'awaiting_approval',
  'queued',
  'running',
  'verifying',
  'completed',
  'failed',
  'cancelled',
]

/** Terminal task states. Once entered, no further transitions are legal. */
export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = ['completed', 'failed', 'cancelled']

/**
 * Legal task transitions. A task may wait multiple times and must resume
 * after an app restart or deployment; `awaiting_*` states are re-enterable.
 */
export const TASK_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  draft: ['planning', 'cancelled'],
  planning: ['awaiting_auth', 'awaiting_approval', 'queued', 'failed', 'cancelled'],
  awaiting_auth: ['planning', 'queued', 'running', 'failed', 'cancelled'],
  awaiting_approval: ['planning', 'queued', 'running', 'failed', 'cancelled'],
  queued: ['running', 'awaiting_auth', 'awaiting_approval', 'failed', 'cancelled'],
  running: ['verifying', 'awaiting_auth', 'awaiting_approval', 'queued', 'failed', 'cancelled'],
  verifying: ['completed', 'running', 'awaiting_approval', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
}

/** Risk classification (SECURITY.md). */
export type RiskClass = 'r0_read' | 'r1_reversible' | 'r2_external_write' | 'r3_high_impact' | 'r4_blocked'

export const RISK_CLASSES: readonly RiskClass[] = [
  'r0_read',
  'r1_reversible',
  'r2_external_write',
  'r3_high_impact',
  'r4_blocked',
]

/** Display categories carried in approval payloads (not a second enum). */
export type ApprovalCategory =
  | 'external_communication'
  | 'publication'
  | 'financial'
  | 'account_security'
  | 'destructive'
  | 'legal'

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'cancelled' | 'consumed'

export const APPROVAL_STATUSES: readonly ApprovalStatus[] = [
  'pending',
  'approved',
  'denied',
  'expired',
  'cancelled',
  'consumed',
]

/**
 * Exact approval record. The canonical action is hashed over the normalized
 * payload; any material payload change invalidates the approval.
 */
export interface Approval {
  id: string
  workspaceId: string
  taskId?: string
  stepId?: string
  riskClass: RiskClass
  category?: ApprovalCategory
  title: string
  summary: string
  /** Canonical, exact action; the object that is hashed. */
  canonicalAction: Record<string, unknown>
  canonicalActionHash: string
  reversibility: 'reversible' | 'partially_reversible' | 'irreversible'
  estimatedMaxCostCredits?: number
  status: ApprovalStatus
  challenge: string
  respondedBy?: string
  respondedAt?: string
  consumedAt?: string
  consumedByReceiptId?: string
  expiresAt: string
  createdAt: string
  updatedAt: string
}

export interface TaskStep {
  id: string
  taskId: string
  workspaceId: string
  index: number
  title: string
  status: 'pending' | 'running' | 'waiting' | 'completed' | 'failed' | 'skipped' | 'cancelled'
  riskClass: RiskClass
  /** Side-effect outcome tracking for external writes. */
  sideEffectState?: 'none' | 'pending' | 'waiting_external' | 'confirmed' | 'failed_unknown_outcome'
  idempotencyKey?: string
  providerRequestRef?: string
  approvalId?: string
  evidenceRefs: string[]
  startedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  workspaceId: string
  userId: string
  conversationId?: string
  parentTaskId?: string
  goal: string
  normalizedIntent?: string
  status: TaskStatus
  plan?: { steps: Array<{ id: string; title: string; status: string }> }
  policySnapshot?: Record<string, unknown>
  waitingReason?: 'authentication' | 'approval' | 'verification' | 'external_event'
  waitingResourceId?: string
  usageReservationId?: string
  receiptId?: string
  safeError?: { code: string; message: string; retryable: boolean }
  createdAt: string
  updatedAt: string
  completedAt?: string
}

/** Immutable record of a meaningful action: provenance, cost, evidence. */
export interface ActionReceipt {
  id: string
  workspaceId: string
  taskId?: string
  stepId?: string
  approvalId?: string
  kind: string
  title: string
  summary: string
  /** Safe evidence only. Never secret values. */
  evidence: Array<{ kind: string; ref: string; label?: string }>
  provider?: string
  providerRequestRef?: string
  idempotencyKey?: string
  usage?: { credits?: number; providerCostMicros?: number }
  outcome: 'success' | 'denied' | 'failed' | 'cancelled'
  createdAt: string
}

export interface Artifact {
  id: string
  workspaceId: string
  taskId?: string
  kind: 'diff' | 'file' | 'log' | 'test_report' | 'preview' | 'screenshot' | 'document' | 'link'
  title: string
  storageRef?: string
  url?: string
  mimeType?: string
  sizeBytes?: number
  safeMetadata?: Record<string, unknown>
  createdAt: string
}

export interface CapabilityGrant {
  id: string
  workspaceId: string
  userId: string
  taskId?: string
  providerId: string
  capability: string
  providerAccountId?: string
  mode?: string
  expiresAt: string
  revokedAt?: string
  createdAt: string
}

/** Orb states (ARCHITECTURE.md — 12 states tied to real state). */
export type OrbState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'planning'
  | 'computer_waking'
  | 'workspace_preparing'
  | 'agent_working'
  | 'running_tests'
  | 'waiting_approval'
  | 'preview_ready'
  | 'speaking'
  | 'error'

export const ORB_STATES: readonly OrbState[] = [
  'idle',
  'listening',
  'thinking',
  'planning',
  'computer_waking',
  'workspace_preparing',
  'agent_working',
  'running_tests',
  'waiting_approval',
  'preview_ready',
  'speaking',
  'error',
]

/** Indicative plans — server-side configuration, product hypotheses. */
export interface PlanConfig {
  id: 'free' | 'pro' | 'pro_5x' | 'pro_20x'
  displayName: string
  priceUsdMonthly: number
  weeklyCredits: number
}

export const PLAN_CONFIGS: readonly PlanConfig[] = [
  { id: 'free', displayName: 'Free', priceUsdMonthly: 0, weeklyCredits: 50 },
  { id: 'pro', displayName: 'Pro', priceUsdMonthly: 20, weeklyCredits: 500 },
  { id: 'pro_5x', displayName: 'Pro 5x', priceUsdMonthly: 100, weeklyCredits: 2500 },
  { id: 'pro_20x', displayName: 'Pro 20x', priceUsdMonthly: 200, weeklyCredits: 10000 },
]

export type UsageCategory =
  | 'model_tokens'
  | 'speech'
  | 'browser_time'
  | 'active_compute'
  | 'storage'
  | 'network_egress'
  | 'premium_tool'
  | 'retry'

export interface UsageReservation {
  id: string
  workspaceId: string
  taskId?: string
  estimatedCredits: number
  reservedCredits: number
  settledCredits?: number
  status: 'reserved' | 'settled' | 'released' | 'expired'
  createdAt: string
  settledAt?: string
}

/** API envelope conventions. */
export interface ApiSuccess<T> {
  ok: true
  data: T
  requestId: string
}

export interface ApiFailure {
  ok: false
  error: { code: string; message: string; retryable?: boolean }
  requestId: string
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure
