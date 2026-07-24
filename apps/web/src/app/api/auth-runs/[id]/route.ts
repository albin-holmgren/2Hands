import { NextRequest } from 'next/server'
import { uuidSchema } from '@/lib/validation/schemas'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { getAuthRun } from '@/lib/v3/auth-runs'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const { id } = await params
    if (!uuidSchema.safeParse(id).success) {
      return failure(400, 'invalid_id', 'Invalid auth run ID format', scope.requestId)
    }
    const authRun = await getAuthRun(id, scope.workspaceId)
    if (!authRun) return failure(404, 'not_found', 'Auth run not found', scope.requestId)
    return success({ authRun }, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
