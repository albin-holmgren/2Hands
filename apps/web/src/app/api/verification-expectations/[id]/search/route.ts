import { NextRequest } from 'next/server'
import { uuidSchema } from '@/lib/validation/schemas'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import {
  getVerificationExpectation,
  searchDemoInboxForExpectation,
} from '@/lib/v3/email-verification'

/**
 * Search the Demo Inbox for a message satisfying this expectation. The
 * response carries safe metadata and an opaque secret ref only — raw codes
 * and magic links never appear in API output.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const { id } = await params
    if (!uuidSchema.safeParse(id).success) {
      return failure(400, 'invalid_id', 'Invalid expectation ID format', scope.requestId)
    }

    const expectation = await getVerificationExpectation(id, scope.workspaceId)
    if (!expectation) return failure(404, 'not_found', 'Expectation not found', scope.requestId)

    const result = await searchDemoInboxForExpectation(id)
    return success({ result }, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
