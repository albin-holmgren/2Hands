/**
 * POST /api/agents/connect/complete — bind a stored credential to a
 * connected Claude account.
 *
 * Body: { secretRef: string, label?: string } — the ref returned by the
 * sealed submit. The ref is opaque; this endpoint never sees the credential
 * itself, and the account row records only the pointer.
 */
import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { completeAgentConnect } from '@/lib/v3/agent-connect'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'

export const runtime = 'nodejs'

const bodySchema = z.object({
  secretRef: z.string().min(8).max(200),
  label: z.string().max(80).optional(),
})

export async function POST(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { userId, requestId } = scoped.scope

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return failure(400, 'invalid_body', 'secretRef is required', requestId)
  }

  try {
    const result = await completeAgentConnect({
      userId,
      secretRef: parsed.data.secretRef,
      label: parsed.data.label,
    })
    return success(result, requestId)
  } catch (error) {
    return failureFromError(error, requestId)
  }
}
