import { NextRequest } from 'next/server'
import { uuidSchema } from '@/lib/validation/schemas'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { readMessage } from '@/lib/v3/demo-gmail'

/**
 * Demo Gmail — R0 read. The body is returned ONLY for kind 'other' messages;
 * verification mail (otp/magic_link) bodies are withheld and flow exclusively
 * through the Email Verification Broker.
 */
export async function POST(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const body = await request.json().catch(() => null)
    const messageId = body?.messageId
    if (!uuidSchema.safeParse(messageId).success) {
      return failure(400, 'invalid_message_id', 'messageId (uuid) is required', scope.requestId)
    }

    const result = await readMessage(messageId)
    if (!result) return failure(404, 'not_found', 'Message not found', scope.requestId)
    return success({ ...result, provider: 'demo-gmail' }, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
