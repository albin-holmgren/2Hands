import { NextRequest } from 'next/server'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { searchInbox } from '@/lib/v3/demo-gmail'

/**
 * Demo Gmail — R0 search. Safe metadata only (id, fromDomain, subject, kind,
 * createdAt); bodies are never returned from search.
 */
export async function POST(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const body = await request.json().catch(() => null)
    const toEmail = typeof body?.toEmail === 'string' ? body.toEmail.trim() : undefined
    const fromDomain = typeof body?.fromDomain === 'string' ? body.fromDomain.trim() : undefined
    const sinceIso = typeof body?.sinceIso === 'string' ? body.sinceIso : undefined
    const limit = typeof body?.limit === 'number' ? body.limit : undefined

    if (sinceIso && Number.isNaN(Date.parse(sinceIso))) {
      return failure(400, 'invalid_since', 'sinceIso must be an ISO timestamp', scope.requestId)
    }
    if ((toEmail && toEmail.length > 320) || (fromDomain && fromDomain.length > 255)) {
      return failure(400, 'invalid_query', 'Query fields too long', scope.requestId)
    }

    const messages = await searchInbox({
      workspaceId: scope.workspaceId,
      query: { toEmail, fromDomain, sinceIso },
      limit,
    })
    return success({ messages, provider: 'demo-gmail' }, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
