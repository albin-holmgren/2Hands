import { NextRequest, NextResponse } from 'next/server'
import { handleAuthRedirect } from '@/lib/auth/handle-auth-redirect'

/**
 * Email confirmation / password recovery landing route.
 *
 * Handles the `token_hash` + `type` form (verified server-side, so it survives
 * the request-on-laptop / open-on-phone case that PKCE cannot), and falls back
 * to `code` exchange when the email template produced a PKCE link instead.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleAuthRedirect(request)
}
