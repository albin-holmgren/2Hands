import { NextRequest } from 'next/server'
import { uuidSchema } from '@/lib/validation/schemas'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { getComputerDetail } from '@/lib/v3/computers'

/** Computer detail: row + latest session + recent checkpoints. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const { id } = await params
    if (!uuidSchema.safeParse(id).success) {
      return failure(400, 'invalid_id', 'Invalid computer ID format', scope.requestId)
    }
    const detail = await getComputerDetail(id, scope.workspaceId)
    if (!detail) return failure(404, 'not_found', 'Computer not found', scope.requestId)
    return success(detail, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
