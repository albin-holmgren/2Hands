import { NextRequest } from 'next/server'
import { uuidSchema } from '@/lib/validation/schemas'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { getApproval } from '@/lib/v3/approvals'
import { sendEmail } from '@/lib/v3/demo-gmail'

/**
 * Demo Gmail — R2 send. The trust loop: requires an APPROVED exact approval
 * whose canonical hash still matches, consumed exactly once immediately before
 * the send. Idempotency key makes retries replay instead of duplicating.
 */
export async function POST(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const body = await request.json().catch(() => null)
    const approvalId = body?.approvalId
    const actionHash = body?.actionHash
    const draftArtifactId = body?.draftArtifactId
    const idempotencyKey = body?.idempotencyKey
    const taskId = typeof body?.taskId === 'string' ? body.taskId : undefined

    if (!uuidSchema.safeParse(approvalId).success) {
      return failure(400, 'invalid_approval_id', 'approvalId (uuid) is required', scope.requestId)
    }
    if (typeof actionHash !== 'string' || !actionHash.startsWith('sha256:')) {
      return failure(400, 'missing_action_hash', 'actionHash (sha256:…) is required', scope.requestId)
    }
    if (!uuidSchema.safeParse(draftArtifactId).success) {
      return failure(400, 'invalid_draft_id', 'draftArtifactId (uuid) is required', scope.requestId)
    }
    if (typeof idempotencyKey !== 'string' || !idempotencyKey || idempotencyKey.length > 200) {
      return failure(400, 'missing_idempotency_key', 'idempotencyKey is required', scope.requestId)
    }
    if (taskId && !uuidSchema.safeParse(taskId).success) {
      return failure(400, 'invalid_task_id', 'Invalid task ID format', scope.requestId)
    }

    // The approval must belong to this workspace before we consume anything.
    const approval = await getApproval(approvalId, scope.workspaceId)
    if (!approval) return failure(404, 'approval_not_found', 'Approval not found', scope.requestId)

    const result = await sendEmail({
      workspaceId: scope.workspaceId,
      taskId,
      approvalId,
      actionHash,
      draftArtifactId,
      idempotencyKey,
    })
    if (result.status === 'rejected') {
      const message =
        result.reason === 'draft_not_found'
          ? 'Draft not found in this workspace'
          : 'Approval is not consumable (not approved, expired, already consumed, or hash mismatch)'
      return failure(409, result.reason, message, scope.requestId)
    }
    return success(
      {
        messageId: result.messageId,
        receiptId: result.receipt.id,
        replayed: result.replayed,
        provider: 'demo-gmail',
      },
      scope.requestId,
    )
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
