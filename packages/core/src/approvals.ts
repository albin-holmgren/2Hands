/**
 * Exact-approval domain logic: canonical action construction, hash binding,
 * risk classification helpers. The database RPCs enforce single-use and
 * challenge binding; this module builds the payloads they verify.
 */
import type { ApprovalCategory, RiskClass } from '@2hands/types/v3'
import { canonicalActionHash } from './canonical'

/**
 * The canonical exact action. Every field that would change what actually
 * happens must be present here — the hash covers this object and any material
 * change invalidates a prior approval.
 */
export interface CanonicalAction {
  /** Machine action identifier, e.g. 'gmail.send', 'github.push_branch'. */
  action: string
  taskId?: string
  runId?: string
  capability?: string
  /** Exact external target: recipient, repository, merchant, environment. */
  target?: Record<string, string>
  /** Normalized input payload (subject/body hash, branch, commit, amounts…). */
  input?: Record<string, unknown>
  /** Content digests for large bodies/attachments/diffs. */
  contentHashes?: Record<string, string>
  costCeilingCredits?: number
  policyVersion?: string | number
  expiresAt?: string
}

export interface ApprovalDraft {
  workspaceId: string
  taskId?: string
  stepId?: string
  riskClass: RiskClass
  category?: ApprovalCategory
  title: string
  summary: string
  canonicalAction: CanonicalAction
  canonicalActionHash: string
  reversibility: 'reversible' | 'partially_reversible' | 'irreversible'
  estimatedMaxCostCredits?: number
  expiresAt: string
}

export interface BuildApprovalInput {
  workspaceId: string
  taskId?: string
  stepId?: string
  riskClass: RiskClass
  category?: ApprovalCategory
  title: string
  summary: string
  action: CanonicalAction
  reversibility?: ApprovalDraft['reversibility']
  estimatedMaxCostCredits?: number
  /** Time-to-live in milliseconds. Default 15 minutes; max 24h. */
  ttlMs?: number
  now?: Date
}

export const DEFAULT_APPROVAL_TTL_MS = 15 * 60 * 1000
export const MAX_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000

export function buildApprovalDraft(input: BuildApprovalInput): ApprovalDraft {
  const now = input.now ?? new Date()
  const ttl = Math.min(input.ttlMs ?? DEFAULT_APPROVAL_TTL_MS, MAX_APPROVAL_TTL_MS)
  const expiresAt = new Date(now.getTime() + ttl).toISOString()
  const action: CanonicalAction = { ...input.action, expiresAt }
  return {
    workspaceId: input.workspaceId,
    taskId: input.taskId,
    stepId: input.stepId,
    riskClass: input.riskClass,
    category: input.category,
    title: input.title,
    summary: input.summary,
    canonicalAction: action,
    canonicalActionHash: canonicalActionHash(action as unknown as Record<string, unknown>),
    reversibility: input.reversibility ?? 'irreversible',
    estimatedMaxCostCredits: input.estimatedMaxCostCredits,
    expiresAt,
  }
}

/** Does this risk class require an exact approval in the MVP? */
export function requiresExactApproval(riskClass: RiskClass): boolean {
  return riskClass === 'r2_external_write' || riskClass === 'r3_high_impact'
}

/** Is this risk class executable at all? */
export function isExecutableRiskClass(riskClass: RiskClass): boolean {
  return riskClass !== 'r4_blocked'
}
