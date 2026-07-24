import { NextRequest } from 'next/server'
import { uuidSchema } from '@/lib/validation/schemas'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { approveMemory } from '@/lib/v3/memory'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const { id } = await params
    if (!uuidSchema.safeParse(id).success) {
      return failure(400, 'invalid_id', 'Invalid memory item ID format', scope.requestId)
    }
    const item = await approveMemory(id, scope.workspaceId)
    return success({ item }, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
