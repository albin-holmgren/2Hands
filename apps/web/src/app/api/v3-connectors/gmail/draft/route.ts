import { NextRequest } from 'next/server'
import { uuidSchema } from '@/lib/validation/schemas'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { createDraft } from '@/lib/v3/demo-gmail'
import { getTask } from '@/lib/v3/tasks'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Demo Gmail — R1 draft creation. The draft is stored as an artifact and is
 * the exact content a later gmail.send approval previews.
 */
export async function POST(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const body = await request.json().catch(() => null)
    const to = typeof body?.to === 'string' ? body.to.trim() : ''
    const subject = typeof body?.subject === 'string' ? body.subject.trim() : ''
    const draftBody = typeof body?.body === 'string' ? body.body : ''
    const taskId = typeof body?.taskId === 'string' ? body.taskId : undefined

    if (!to || to.length > 320 || !EMAIL_PATTERN.test(to)) {
      return failure(400, 'invalid_recipient', 'to must be a valid email address', scope.requestId)
    }
    if (!subject || subject.length > 500) {
      return failure(400, 'invalid_subject', 'subject is required (max 500 chars)', scope.requestId)
    }
    if (!draftBody || draftBody.length > 100_000) {
      return failure(400, 'invalid_body', 'body is required (max 100000 chars)', scope.requestId)
    }
    if (taskId) {
      if (!uuidSchema.safeParse(taskId).success) {
        return failure(400, 'invalid_task_id', 'Invalid task ID format', scope.requestId)
      }
      const task = await getTask(taskId, scope.workspaceId)
      if (!task) return failure(404, 'task_not_found', 'Task not found', scope.requestId)
    }

    const draft = await createDraft({
      workspaceId: scope.workspaceId,
      taskId,
      to,
      subject,
      body: draftBody,
    })
    return success({ draft, provider: 'demo-gmail' }, scope.requestId, 201)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
