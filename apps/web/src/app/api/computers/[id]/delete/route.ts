import { NextRequest } from 'next/server'
import { uuidSchema } from '@/lib/validation/schemas'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { deleteComputer } from '@/lib/v3/computers'

/**
 * Delete a computer: requires no active sessions; calls the provider's
 * deleteWorkspace and marks the row deleted.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const { id } = await params
    if (!uuidSchema.safeParse(id).success) {
      return failure(400, 'invalid_id', 'Invalid computer ID format', scope.requestId)
    }
    const computer = await deleteComputer({ computerId: id, workspaceId: scope.workspaceId })
    return success({ computer }, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
