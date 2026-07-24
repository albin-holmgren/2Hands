import { NextRequest } from 'next/server'
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { createComputer, listComputers } from '@/lib/v3/computers'

export async function GET(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const computers = await listComputers(scope.workspaceId)
    return success({ computers }, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}

export async function POST(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const rateKey = createRateLimitKey(scope.userId, 'v3-computers-create')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.general)
    if (!rateCheck.allowed) {
      return failure(429, 'rate_limited', 'Too many requests', scope.requestId, true)
    }

    const body = await request.json().catch(() => null)
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 120) {
      return failure(400, 'invalid_name', 'name must be a non-empty string (max 120 chars)', scope.requestId)
    }

    const computer = await createComputer({
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      name,
      imageRef: typeof body?.imageRef === 'string' ? body.imageRef : undefined,
    })
    return success({ computer }, scope.requestId, 201)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
