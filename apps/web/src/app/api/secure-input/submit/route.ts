/**
 * Isolated Secure Input segment — sealed value submission.
 *
 * The body carries transport-sealed ciphertext only; it is validated in
 * memory and never logged, echoed, or forwarded. Errors return safe machine
 * codes with no request-derived detail.
 */
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveV3Scope, success, failure } from '@/lib/v3/route-helpers'
import { submitSecureInput } from '@/lib/v3/secure-input'

const hex = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .regex(/^[0-9a-f]+$/i)

const sealedValueSchema = z.object({
  fieldId: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  kind: z.enum(['username', 'email', 'password', 'otp', 'api_key']),
  sealed: z.object({
    ephemeralPublicKeyHex: hex(64, 64),
    nonceHex: hex(48, 48),
    ciphertextHex: hex(32, 16384),
  }),
  retain: z.boolean().optional(),
})

const submitBodySchema = z.object({
  requestId: z.string().min(1).max(100),
  sealedValues: z.array(sealedValueSchema).min(1).max(8),
})

const ERROR_RESPONSES: Record<string, { status: number; code: string; message: string }> = {
  challenge_not_found: { status: 404, code: 'challenge_not_found', message: 'Challenge not found' },
  challenge_scope_mismatch: { status: 403, code: 'forbidden', message: 'Challenge scope mismatch' },
  challenge_consumed: { status: 409, code: 'challenge_consumed', message: 'Challenge already used' },
  challenge_expired: { status: 409, code: 'challenge_expired', message: 'Challenge expired' },
  unknown_field: { status: 400, code: 'unknown_field', message: 'Unknown field id' },
  field_kind_mismatch: { status: 400, code: 'field_kind_mismatch', message: 'Field kind mismatch' },
  retention_not_permitted: { status: 400, code: 'retention_not_permitted', message: 'Retention not permitted for field' },
  sealed_value_invalid: { status: 400, code: 'sealed_value_invalid', message: 'Sealed value could not be opened' },
}

export async function POST(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const body = await request.json().catch(() => null)
    const parsed = submitBodySchema.safeParse(body)
    if (!parsed.success) {
      return failure(400, 'invalid_request', 'Invalid secure input submission', scope.requestId)
    }

    const receipt = await submitSecureInput({
      requestId: parsed.data.requestId,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      sealedValues: parsed.data.sealedValues,
    })
    return success({ receipt }, scope.requestId, 201)
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    const mapped = ERROR_RESPONSES[code]
    if (mapped) return failure(mapped.status, mapped.code, mapped.message, scope.requestId)
    // Deliberately silent: nothing from this segment reaches logs.
    return failure(500, 'secure_input_failed', 'Secure input submission failed', scope.requestId, true)
  }
}
