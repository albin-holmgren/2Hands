/**
 * Demo Account Provider — magic-link landing endpoint.
 * GET /api/demo-provider/magic?token=...
 * Verifies the HMAC-signed token, consumes the pending challenge cookie when
 * present (single-use within the requesting browser context), and signs in.
 */
import { NextRequest } from 'next/server'
import { DEMO_FIXTURE_EMAIL, DEMO_TERMS_VERSION } from '@/lib/demo-provider/config'
import {
  DEMO_COOKIE_PENDING,
  DEMO_COOKIE_SESSION,
  DEMO_SESSION_TTL_MS,
  clearDemoCookie,
  decodeSigned,
  digestsEqual,
  readDemoAccount,
  readDemoPending,
  setSignedCookie,
  sha256Hex,
  type DemoMagicToken,
  type DemoSession,
} from '@/lib/demo-provider/session'
import { seeOther } from '@/lib/demo-provider/respond'

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('token')
  const token = decodeSigned<DemoMagicToken>(raw)
  if (!token) {
    return seeOther(request, '/demo-provider/login/magic-link?error=invalid_link')
  }
  const expiresAt = Date.parse(token.expiresAt)
  if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
    return seeOther(request, '/demo-provider/login/magic-link?error=link_expired')
  }

  // Single-use within this browser context: if a pending magic-link challenge
  // exists it must match this token, and it is consumed on success.
  const pending = readDemoPending(request.cookies)
  if (pending && pending.kind === 'magic_link' && !digestsEqual(sha256Hex(raw ?? ''), pending.proofSha256)) {
    return seeOther(request, '/demo-provider/login/magic-link?error=invalid_link')
  }

  let termsVersion: string | undefined
  let plan: DemoSession['plan'] = 'free'
  if (token.email === DEMO_FIXTURE_EMAIL) {
    termsVersion = DEMO_TERMS_VERSION
  } else {
    const account = readDemoAccount(request.cookies)
    if (account && account.email === token.email) {
      termsVersion = account.termsVersion
      plan = account.plan
    } else {
      return seeOther(request, '/demo-provider/login/magic-link?error=unknown_account')
    }
  }

  const now = Date.now()
  const session: DemoSession = {
    email: token.email,
    plan,
    termsVersion,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + DEMO_SESSION_TTL_MS).toISOString(),
  }
  const response = seeOther(request, termsVersion ? '/demo-provider/account' : '/demo-provider/terms')
  clearDemoCookie(response, DEMO_COOKIE_PENDING)
  setSignedCookie(response, DEMO_COOKIE_SESSION, session, Math.ceil(DEMO_SESSION_TTL_MS / 1000))
  return response
}

export const dynamic = 'force-dynamic'
