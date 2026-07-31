/**
 * POST /api/agents/connect/start — begin connecting the user's Claude account.
 *
 * Returns a sealed-input challenge. The client encrypts the credential
 * against the challenge's public key and posts it to /api/secure-input/submit
 * — the plaintext never travels the ordinary conversation path, per the
 * AUTH_SECRETS trust boundary. /complete then binds the stored secret to a
 * connected provider account.
 */
import { type NextRequest } from 'next/server'
import { startAgentConnect } from '@/lib/v3/agent-connect'
import { resolveV3Scope, success, failureFromError } from '@/lib/v3/route-helpers'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { userId, requestId } = scoped.scope

  try {
    const result = await startAgentConnect(userId)
    return success(result, requestId)
  } catch (error) {
    return failureFromError(error, requestId)
  }
}
