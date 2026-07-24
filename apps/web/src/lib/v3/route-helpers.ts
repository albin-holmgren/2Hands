/**
 * Shared request scaffolding for v3 API routes: auth + workspace scope +
 * the ApiSuccess/ApiFailure envelope with requestId.
 */
import { NextRequest, NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'
import { newRequestId } from '@2hands/core'
import type { ApiFailure, ApiSuccess } from '@2hands/types/v3'

export interface V3RequestScope {
  userId: string
  workspaceId: string
  role: string
  requestId: string
}

export type V3ScopeResult =
  | { ok: true; scope: V3RequestScope }
  | { ok: false; response: NextResponse }

export async function resolveV3Scope(request: NextRequest): Promise<V3ScopeResult> {
  const requestId = newRequestId()

  // Bearer token (mobile) or cookies (web) — same dual pattern as /api/chat.
  let user: User | null = null
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    const { createClient: createTokenClient } = await import('@supabase/supabase-js')
    const tokenClient = createTokenClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const { data, error } = await tokenClient.auth.getUser(token)
    if (!error) user = data.user
  } else {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (!error) user = data.user
  }
  if (!user) {
    return { ok: false, response: failure(401, 'unauthorized', 'Unauthorized', requestId) }
  }

  const requestedWorkspaceId =
    request.nextUrl.searchParams.get('workspaceId') ||
    request.cookies.get('2hands_active_workspace_id')?.value ||
    null

  const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
    strictPreferred: Boolean(requestedWorkspaceId),
  })
  if (!scope.workspaceId || !scope.role) {
    return {
      ok: false,
      response: failure(403, 'workspace_access_denied', 'Workspace not found or access denied', requestId),
    }
  }

  return {
    ok: true,
    scope: { userId: user.id, workspaceId: scope.workspaceId, role: scope.role, requestId },
  }
}

export function success<T>(data: T, requestId: string, status = 200): NextResponse {
  const body: ApiSuccess<T> = { ok: true, data, requestId }
  return NextResponse.json(body, { status })
}

export function failure(
  status: number,
  code: string,
  message: string,
  requestId: string,
  retryable?: boolean,
): NextResponse {
  const body: ApiFailure = { ok: false, error: { code, message, retryable }, requestId }
  return NextResponse.json(body, { status })
}

/** Map service-layer errors to safe API failures. */
export function failureFromError(error: unknown, requestId: string): NextResponse {
  const message = error instanceof Error ? error.message : 'Internal error'
  if (/not found/i.test(message)) return failure(404, 'not_found', message, requestId)
  if (/stale transition|serialization/i.test(message)) return failure(409, 'stale_state', message, requestId, true)
  if (/illegal transition|not pending|expired|mismatch|already/i.test(message)) {
    return failure(409, 'conflict', message, requestId)
  }
  if (/forbidden|not a member/i.test(message)) return failure(403, 'forbidden', message, requestId)
  console.error('[v3] route error:', message)
  return failure(500, 'internal_error', 'Internal error', requestId, true)
}
