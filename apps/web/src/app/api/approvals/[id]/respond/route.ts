import { NextRequest } from 'next/server'
import { uuidSchema } from '@/lib/validation/schemas'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { getApproval, respondApproval } from '@/lib/v3/approvals'

/**
 * Exact approval response. The client must echo the challenge AND the
 * canonical action hash it displayed; any payload drift server-side means the
 * hash no longer matches and the response is rejected. Single-use via the
 * response idempotency key.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const { id } = await params
    if (!uuidSchema.safeParse(id).success) {
      return failure(400, 'invalid_id', 'Invalid approval ID format', scope.requestId)
    }

    const body = await request.json().catch(() => null)
    const response = body?.response
    const challenge = body?.challenge
    const actionHash = body?.actionHash
    const idempotencyKey = body?.idempotencyKey

    if (response !== 'approved' && response !== 'denied') {
      return failure(400, 'invalid_response', "response must be 'approved' or 'denied'", scope.requestId)
    }
    if (typeof challenge !== 'string' || !challenge) {
      return failure(400, 'missing_challenge', 'challenge is required', scope.requestId)
    }
    if (typeof actionHash !== 'string' || !actionHash.startsWith('sha256:')) {
      return failure(400, 'missing_action_hash', 'actionHash (sha256:…) is required', scope.requestId)
    }
    if (typeof idempotencyKey !== 'string' || !idempotencyKey) {
      return failure(400, 'missing_idempotency_key', 'idempotencyKey is required', scope.requestId)
    }

    const approval = await getApproval(id, scope.workspaceId)
    if (!approval) return failure(404, 'not_found', 'Approval not found', scope.requestId)

    const result = await respondApproval({
      approvalId: id,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      challenge,
      actionHash,
      response,
      idempotencyKey,
    })
    return success({ result }, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
