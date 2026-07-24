import { NextRequest } from 'next/server'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { listLedger } from '@/lib/v3/billing'

export async function GET(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const rawLimit = request.nextUrl.searchParams.get('limit')
    const limit = rawLimit ? Number.parseInt(rawLimit, 10) : 100
    if (rawLimit && (!Number.isFinite(limit) || limit < 1)) {
      return failure(400, 'invalid_request', 'limit must be a positive integer', scope.requestId)
    }
    const ledger = await listLedger(scope.workspaceId, limit)
    return success({ ledger }, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
