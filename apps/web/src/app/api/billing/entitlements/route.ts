import { NextRequest } from 'next/server'
import { resolveV3Scope, success, failureFromError } from '@/lib/v3/route-helpers'
import { getEntitlements } from '@/lib/v3/billing'

export async function GET(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const entitlements = await getEntitlements(scope.workspaceId)
    return success({ entitlements }, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
