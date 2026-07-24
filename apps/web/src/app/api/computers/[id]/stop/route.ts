import { NextRequest } from 'next/server'
import { uuidSchema } from '@/lib/validation/schemas'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { getComputer, stopComputerSession } from '@/lib/v3/computers'

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
    const sessionId = typeof body?.sessionId === 'string' && uuidSchema.safeParse(body.sessionId).success
      ? body.sessionId
      : undefined

    const session = await stopComputerSession({
      computerId: id,
      workspaceId: scope.workspaceId,
      sessionId,
    })
    return success({ session }, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
