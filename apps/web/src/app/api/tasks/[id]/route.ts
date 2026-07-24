import { NextRequest } from 'next/server'
import { uuidSchema } from '@/lib/validation/schemas'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { getTask } from '@/lib/v3/tasks'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const { id } = await params
    if (!uuidSchema.safeParse(id).success) {
      return failure(400, 'invalid_id', 'Invalid task ID format', scope.requestId)
    }
    const task = await getTask(id, scope.workspaceId)
    if (!task) return failure(404, 'not_found', 'Task not found', scope.requestId)
    return success({ task }, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
