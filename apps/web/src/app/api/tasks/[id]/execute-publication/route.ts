import { NextRequest } from 'next/server'
import { uuidSchema } from '@/lib/validation/schemas'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { executePublication } from '@/lib/v3/publication'

/**
 * Slice 7 — execute a previously approved publication. The approval must be
 * `approved` and belong to this task; the exact action (repo/branch/commit/
 * title) comes from the approval's canonical action, never from this request.
 * Exactly-once under retry via an idempotency key derived from the canonical
 * action hash. On success: task resumes → verifies postconditions → completes
 * with the immutable publication receipt.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const { id } = await params
    if (!uuidSchema.safeParse(id).success) {
      return failure(400, 'invalid_id', 'Invalid task ID format', scope.requestId)
    }

    const body = await request.json().catch(() => null)
    const approvalId = body?.approvalId
    if (typeof approvalId !== 'string' || !uuidSchema.safeParse(approvalId).success) {
      return failure(400, 'invalid_approval_id', 'approvalId must be a UUID', scope.requestId)
    }

    const result = await executePublication({
      taskId: id,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      approvalId,
    })
    return success({ result }, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
