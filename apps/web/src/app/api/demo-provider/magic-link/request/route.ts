/**
 * Demo Account Provider — request a magic sign-in link.
 * Writes the link into public.demo_inbox. The token is HMAC-signed and short
 * lived; the pending cookie stores only a digest of it.
 */
import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { DEMO_FIXTURE_EMAIL, normalizeScenario, withScenario } from '@/lib/demo-provider/config'
import { DEMO_INBOX_UNAVAILABLE, insertDemoInboxRow } from '@/lib/demo-provider/inbox'
import {
  DEMO_COOKIE_PENDING,
  DEMO_PENDING_TTL_MS,
  encodeSigned,
  readDemoAccount,
  setSignedCookie,
  sha256Hex,
  type DemoMagicToken,
  type DemoPending,
} from '@/lib/demo-provider/session'
import { formString, readForm, seeOther } from '@/lib/demo-provider/respond'

export async function POST(request: NextRequest) {
  const form = await readForm(request)
  const scenario = normalizeScenario(formString(form, 'scenario'))
  const email = formString(form, 'email').trim().toLowerCase()

  const account = readDemoAccount(request.cookies)
  const known = email === DEMO_FIXTURE_EMAIL || (account !== null && account.email === email)
  if (!known) {
    return seeOther(request, withScenario('/demo-provider/login/magic-link?error=unknown_account', scenario))
  }

  const expiresAt = new Date(Date.now() + DEMO_PENDING_TTL_MS).toISOString()
  const token: DemoMagicToken = { email, nonce: crypto.randomBytes(16).toString('hex'), expiresAt }
  const signedToken = encodeSigned(token)
  const origin = request.nextUrl.origin || 'http://localhost:3000'
  const magicUrl = `${origin}/api/demo-provider/magic?token=${encodeURIComponent(signedToken)}`

  try {
    await insertDemoInboxRow({
      toEmail: email,
      kind: 'magic_link',
      subject: 'Your Demo Provider sign-in link',
      bodyText: `Sign in to Demo Provider by opening this link: ${magicUrl}`,
    })
  } catch (error) {
    const code = error instanceof Error && error.message === DEMO_INBOX_UNAVAILABLE ? 'inbox_unavailable' : 'invalid_request'
    return seeOther(request, withScenario(`/demo-provider/login/magic-link?error=${code}`, scenario))
  }

  const pending: DemoPending = {
    kind: 'magic_link',
    email,
    proofSha256: sha256Hex(signedToken),
    expiresAt,
  }
  const response = seeOther(request, withScenario('/demo-provider/login/magic-link?sent=1', scenario))
  setSignedCookie(response, DEMO_COOKIE_PENDING, pending, Math.ceil(DEMO_PENDING_TTL_MS / 1000))
  return response
}

export const dynamic = 'force-dynamic'
