/**
 * Isolated Secure Input segment — challenge issuance.
 *
 * This route segment is intentionally separate from the conversation
 * pipeline: no chat serialization, no analytics, no model calls, and no
 * logging of request bodies.
 */
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveV3Scope, success, failure } from '@/lib/v3/route-helpers'
import { getAuthRun } from '@/lib/v3/auth-runs'
import { createSecureInputChallenge } from '@/lib/v3/secure-input'

const fieldSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  kind: z.enum(['username', 'email', 'password', 'otp', 'api_key']),
  label: z.string().min(1).max(120),
  autocomplete: z.string().max(60).optional(),
  retainOption: z.boolean().optional(),
})

const challengeBodySchema = z.object({
  authRunId: z.string().uuid(),
  fields: z.array(fieldSchema).min(1).max(8),
})

export async function POST(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const body = await request.json().catch(() => null)
    const parsed = challengeBodySchema.safeParse(body)
    if (!parsed.success) {
      return failure(400, 'invalid_request', 'Invalid secure input challenge request', scope.requestId)
    }

    const run = await getAuthRun(parsed.data.authRunId, scope.workspaceId)
    if (!run) return failure(404, 'not_found', 'Auth run not found', scope.requestId)
    if (run.user_id !== scope.userId) {
      return failure(403, 'forbidden', 'Auth run belongs to a different user', scope.requestId)
    }
    if (run.status !== 'awaiting_secure_input' && run.status !== 'selecting_method') {
      return failure(409, 'invalid_state', 'Auth run is not awaiting secure input', scope.requestId)
    }
    if (new Date(run.expires_at).getTime() <= Date.now()) {
      return failure(409, 'expired', 'Auth run has expired', scope.requestId)
    }

    const challenge = await createSecureInputChallenge({
      authRunId: run.id,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      fields: parsed.data.fields,
    })
    return success({ challenge }, scope.requestId, 201)
  } catch {
    // Deliberately silent: nothing from this segment reaches logs.
    return failure(500, 'secure_input_failed', 'Secure input challenge failed', scope.requestId, true)
  }
}
