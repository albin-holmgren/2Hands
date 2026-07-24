/**
 * v3 approval service — exact approvals with hash binding, challenge, expiry,
 * single-use consumption, and immutable receipts. Writes go through the
 * privileged RPCs; the canonical action hash is computed in @2hands/core.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildApprovalDraft,
  type BuildApprovalInput,
} from '@2hands/core'
import { appendTaskEvent } from './tasks'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (sb: ReturnType<typeof createAdminClient>, name: string) => (sb as any).from(name)
const rpc = (sb: ReturnType<typeof createAdminClient>, name: string, args: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb as any).rpc(name, args)

export interface ApprovalRow {
  id: string
  workspace_id: string
  task_id: string | null
  step_id: string | null
  risk_class: string
  category: string | null
  title: string
  summary: string
  canonical_action: Record<string, unknown>
  canonical_action_hash: string
  reversibility: string
  estimated_max_cost_credits: number | null
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'cancelled' | 'consumed'
  challenge: string
  responded_by: string | null
  responded_at: string | null
  consumed_at: string | null
  expires_at: string
  created_at: string
}

/** Create a pending exact approval and emit approval.requested. */
export async function createApproval(input: BuildApprovalInput): Promise<ApprovalRow> {
  const draft = buildApprovalDraft(input)
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'approvals')
    .insert({
      workspace_id: draft.workspaceId,
      task_id: draft.taskId ?? null,
      step_id: draft.stepId ?? null,
      risk_class: draft.riskClass,
      category: draft.category ?? null,
      title: draft.title,
      summary: draft.summary,
      canonical_action: draft.canonicalAction,
      canonical_action_hash: draft.canonicalActionHash,
      reversibility: draft.reversibility,
      estimated_max_cost_credits: draft.estimatedMaxCostCredits ?? null,
      expires_at: draft.expiresAt,
    })
    .select('*')
    .single()
  if (error) throw new Error(`createApproval failed: ${error.message}`)
  const row = data as ApprovalRow

  if (row.task_id) {
    await appendTaskEvent({
      taskId: row.task_id,
      type: 'approval.requested',
      actorKind: '2hands',
      payload: {
        approvalId: row.id,
        riskClass: row.risk_class,
        title: row.title,
        summary: row.summary,
        canonicalActionHash: row.canonical_action_hash,
        expiresAt: row.expires_at,
      },
    })
  }
  return row
}

export async function getApproval(approvalId: string, workspaceId: string): Promise<ApprovalRow | null> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'approvals')
    .select('*')
    .eq('id', approvalId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (error) throw new Error(`getApproval failed: ${error.message}`)
  return (data as ApprovalRow) ?? null
}

export interface RespondApprovalInput {
  approvalId: string
  workspaceId: string
  userId: string
  challenge: string
  /** The hash the client saw. Must equal the stored canonical hash. */
  actionHash: string
  response: 'approved' | 'denied'
  idempotencyKey: string
}

export interface RespondApprovalResult {
  approvalId: string
  status: string
  respondedAt: string | null
}

export async function respondApproval(input: RespondApprovalInput): Promise<RespondApprovalResult> {
  const admin = createAdminClient()
  const { data, error } = await rpc(admin, 'v3_respond_approval', {
    p_approval_id: input.approvalId,
    p_challenge: input.challenge,
    p_action_hash: input.actionHash,
    p_response: input.response,
    p_user_id: input.userId,
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) throw new Error(`respondApproval failed: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data

  const approval = await getApproval(input.approvalId, input.workspaceId)
  if (approval?.task_id) {
    await appendTaskEvent({
      taskId: approval.task_id,
      type: input.response === 'approved' ? 'approval.approved' : 'approval.denied',
      actorKind: 'user',
      actorId: input.userId,
      payload: { approvalId: input.approvalId, canonicalActionHash: input.actionHash },
    })
  }

  return {
    approvalId: row.approval_id,
    status: row.status,
    respondedAt: row.responded_at ?? null,
  }
}

/**
 * Consume an approved approval exactly once, immediately before executing the
 * side effect. Returns false when already consumed/expired/mismatched —
 * callers must NOT execute in that case.
 */
export async function consumeApproval(input: {
  approvalId: string
  actionHash: string
}): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await rpc(admin, 'v3_consume_approval', {
    p_approval_id: input.approvalId,
    p_action_hash: input.actionHash,
  })
  if (error) throw new Error(`consumeApproval failed: ${error.message}`)
  return data === true
}

export interface CreateReceiptInput {
  workspaceId: string
  taskId?: string
  stepId?: string
  approvalId?: string
  kind: string
  title: string
  summary: string
  evidence?: Array<{ kind: string; ref: string; label?: string }>
  provider?: string
  providerRequestRef?: string
  idempotencyKey?: string
  usage?: { credits?: number; providerCostMicros?: number }
  outcome?: 'success' | 'denied' | 'failed' | 'cancelled'
}

export interface ReceiptRow {
  id: string
  workspace_id: string
  task_id: string | null
  kind: string
  title: string
  summary: string
  evidence: Array<{ kind: string; ref: string; label?: string }>
  outcome: string
  created_at: string
}

export async function createReceipt(input: CreateReceiptInput): Promise<ReceiptRow> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'action_receipts')
    .insert({
      workspace_id: input.workspaceId,
      task_id: input.taskId ?? null,
      step_id: input.stepId ?? null,
      approval_id: input.approvalId ?? null,
      kind: input.kind,
      title: input.title,
      summary: input.summary,
      evidence: input.evidence ?? [],
      provider: input.provider ?? null,
      provider_request_ref: input.providerRequestRef ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      usage: input.usage ?? null,
      outcome: input.outcome ?? 'success',
    })
    .select('*')
    .single()
  if (error) throw new Error(`createReceipt failed: ${error.message}`)
  const row = data as ReceiptRow

  if (input.taskId) {
    await appendTaskEvent({
      taskId: input.taskId,
      type: 'receipt.created',
      actorKind: '2hands',
      payload: { receiptId: row.id, kind: row.kind, outcome: row.outcome },
    })
  }
  return row
}

export async function listApprovals(workspaceId: string, status?: string): Promise<ApprovalRow[]> {
  const admin = createAdminClient()
  let query = table(admin, 'approvals')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw new Error(`listApprovals failed: ${error.message}`)
  return (data ?? []) as ApprovalRow[]
}
