import { NextRequest } from 'next/server'
import { uuidSchema } from '@/lib/validation/schemas'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { getComputer, startComputerSession } from '@/lib/v3/computers'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const { id } = await params
    if (!uuidSchema.safeParse(id).success) {
      return failure(400, 'invalid_id', 'Invalid computer ID format', scope.requestId)
    }
    const computer = await getComputer(id, scope.workspaceId)
    if (!computer) return failure(404, 'not_found', 'Computer not found', scope.requestId)

    const body = await request.json().catch(() => null)
    const taskId = typeof body?.taskId === 'string' && uuidSchema.safeParse(body.taskId).success
      ? body.taskId
      : undefined

    const session = await startComputerSession({
      computerId: id,
      workspaceId: scope.workspaceId,
      taskId,
    })
    return success({ session }, scope.requestId, 201)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
