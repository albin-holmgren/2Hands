import { NextRequest } from 'next/server'
import { uuidSchema } from '@/lib/validation/schemas'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { getComputer, listComputerEvents } from '@/lib/v3/computers'

/** Cursor-based replay over the computer's append-only event stream. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const cursorRaw = request.nextUrl.searchParams.get('cursor')
    const cursor = cursorRaw ? Number(cursorRaw) : 0
    if (Number.isNaN(cursor) || cursor < 0) {
      return failure(400, 'invalid_cursor', 'cursor must be a non-negative integer', scope.requestId)
    }
    const limitRaw = request.nextUrl.searchParams.get('limit')
    const limit = Math.min(Math.max(Number(limitRaw) || 200, 1), 500)

    const { events, nextCursor } = await listComputerEvents({
      computerId: id,
      workspaceId: scope.workspaceId,
      cursor,
      limit,
    })
    return success({ events, nextCursor, computerState: computer.state }, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
