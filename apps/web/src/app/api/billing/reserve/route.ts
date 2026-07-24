/**
 * Internal-only credit reservation. Called by server-side workers before
 * expensive work (estimate → reserve maximum). Guarded by INTERNAL_API_SECRET
 * — never callable by end-user clients.
 */
import { NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { newRequestId } from '@2hands/core'
import { success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { reserveCredits } from '@/lib/v3/billing'

function isAuthorizedInternal(request: NextRequest): boolean {
  const secret = (process.env.INTERNAL_API_SECRET || '').trim()
  const header = (request.headers.get('x-internal-secret') || '').trim()
  if (!secret || !header) return false
  const a = Buffer.from(secret)
  const b = Buffer.from(header)
  return a.length === b.length && timingSafeEqual(a, b)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const requestId = newRequestId()
  if (!isAuthorizedInternal(request)) {
    return failure(403, 'forbidden', 'Internal endpoint', requestId)
  }
  try {
    const body = await request.json().catch(() => null)
    const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : ''
    const taskId = typeof body?.taskId === 'string' ? body.taskId : undefined
    const estimatedCredits = Number(body?.estimatedCredits)
    if (!UUID_RE.test(workspaceId) || (taskId && !UUID_RE.test(taskId))) {
      return failure(400, 'invalid_request', 'workspaceId (uuid) is required', requestId)
    }
    if (!Number.isFinite(estimatedCredits) || estimatedCredits <= 0) {
      return failure(400, 'invalid_request', 'estimatedCredits must be > 0', requestId)
    }

    const reservationId = await reserveCredits({ workspaceId, taskId, estimatedCredits })
    return success({ reservationId }, requestId, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/insufficient_credits/.test(message)) {
      return failure(402, 'insufficient_credits', 'Not enough credits for this reservation', requestId)
    }
    return failureFromError(error, requestId)
  }
}
