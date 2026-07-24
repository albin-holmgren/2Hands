import { NextRequest } from 'next/server'
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { createTask, listTasks } from '@/lib/v3/tasks'

export async function GET(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const tasks = await listTasks(scope.workspaceId)
    return success({ tasks }, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}

export async function POST(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const rateKey = createRateLimitKey(scope.userId, 'v3-tasks-create')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.general)
    if (!rateCheck.allowed) {
      return failure(429, 'rate_limited', 'Too many requests', scope.requestId, true)
    }

    const body = await request.json().catch(() => null)
    const goal = typeof body?.goal === 'string' ? body.goal.trim() : ''
    if (!goal || goal.length > 4000) {
      return failure(400, 'invalid_goal', 'goal must be a non-empty string (max 4000 chars)', scope.requestId)
    }

    const task = await createTask({
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      goal,
      conversationId: typeof body?.conversationId === 'string' ? body.conversationId : undefined,
      parentTaskId: typeof body?.parentTaskId === 'string' ? body.parentTaskId : undefined,
    })
    return success({ task }, scope.requestId, 201)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
