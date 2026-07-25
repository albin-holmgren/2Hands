import { NextRequest, NextResponse } from 'next/server'
import { handleAuthRedirect } from '@/lib/auth/handle-auth-redirect'

/**
 * OAuth / PKCE callback. Also accepts `token_hash` + `type` so that email
 * templates using {{ .TokenHash }} land somewhere that works.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleAuthRedirect(request)
}
