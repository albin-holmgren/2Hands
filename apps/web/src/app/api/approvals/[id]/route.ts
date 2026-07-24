import { NextRequest } from 'next/server'
import { uuidSchema } from '@/lib/validation/schemas'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { getApproval } from '@/lib/v3/approvals'

/**
 * GET /api/approvals/:id — fetch one v3 exact approval (workspace-scoped).
 *
 * Used by the shell to restore a pending ApprovalCard after a reload
 * (reconnect-from-cursor): events carry only the approvalId, while the
 * respond call needs the challenge + canonical action hash, which only the
 * authorized approver may read. Secrets never appear here — the canonical
 * action is the exact preview the user approves.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const { id } = await params
    if (!uuidSchema.safeParse(id).success) {
      return failure(400, 'invalid_id', 'Invalid approval ID format', scope.requestId)
    }
    const approval = await getApproval(id, scope.workspaceId)
    if (!approval) return failure(404, 'not_found', 'Approval not found', scope.requestId)
    return success(
      {
        approval: {
          id: approval.id,
          taskId: approval.task_id,
          riskClass: approval.risk_class,
          category: approval.category,
          title: approval.title,
          summary: approval.summary,
          canonicalAction: approval.canonical_action,
          canonicalActionHash: approval.canonical_action_hash,
          reversibility: approval.reversibility,
          estimatedMaxCostCredits: approval.estimated_max_cost_credits,
          status: approval.status,
          challenge: approval.challenge,
          expiresAt: approval.expires_at,
          createdAt: approval.created_at,
        },
      },
      scope.requestId,
    )
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
