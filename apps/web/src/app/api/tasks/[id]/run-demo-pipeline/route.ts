import { NextRequest } from 'next/server'
import { uuidSchema } from '@/lib/validation/schemas'
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { getTask, transitionTask } from '@/lib/v3/tasks'
import { runMultiAgentFix } from '@/lib/v3/agent-pipeline'

/**
 * Run the deterministic multi-agent demo pipeline (Demo Codex implement →
 * checkpoint → Demo Claude review → reconcile → verify) on a Demo computer.
 * The task must be draft/planning/queued; draft and planning are walked
 * forward to queued first. The task is left at `verifying` — publication is
 * a separate approval-gated step.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const rateKey = createRateLimitKey(scope.userId, 'v3-run-demo-pipeline')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.general)
    if (!rateCheck.allowed) {
      return failure(429, 'rate_limited', 'Too many requests', scope.requestId, true)
    }

    const { id } = await params
    if (!uuidSchema.safeParse(id).success) {
      return failure(400, 'invalid_id', 'Invalid task ID format', scope.requestId)
    }
    const body = await request.json().catch(() => null)
    const computerId = typeof body?.computerId === 'string' ? body.computerId : ''
    if (!uuidSchema.safeParse(computerId).success) {
      return failure(400, 'invalid_computer_id', 'computerId must be a UUID', scope.requestId)
    }

    const task = await getTask(id, scope.workspaceId)
    if (!task) return failure(404, 'not_found', 'Task not found', scope.requestId)
    if (!['draft', 'planning', 'queued'].includes(task.status)) {
      return failure(409, 'conflict', `Task is ${task.status}; pipeline requires draft/planning/queued`, scope.requestId)
    }

    // Walk draft → planning → queued as needed (server-validated transitions).
    if (task.status === 'draft') {
      await transitionTask({
        taskId: task.id,
        expectedStatus: 'draft',
        newStatus: 'planning',
        actorKind: '2hands',
        eventType: 'task.plan.updated',
        payload: { plan: 'demo_multi_agent_fix' },
      })
      task.status = 'planning'
    }
    if (task.status === 'planning') {
      await transitionTask({
        taskId: task.id,
        expectedStatus: 'planning',
        newStatus: 'queued',
        actorKind: '2hands',
        payload: { computerId },
      })
    }

    const result = await runMultiAgentFix({
      taskId: task.id,
      computerId,
      workspaceId: scope.workspaceId,
    })
    return success({ result }, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
