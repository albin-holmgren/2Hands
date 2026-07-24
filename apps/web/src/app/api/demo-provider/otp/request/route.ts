/**
 * Demo Account Provider — request a one-time sign-in code.
 * Writes the code into public.demo_inbox (the simulated external inbox) and
 * stores only a SHA-256 digest of it in the signed pending cookie.
 */
import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { DEMO_FIXTURE_EMAIL, normalizeScenario, withScenario } from '@/lib/demo-provider/config'
import { DEMO_INBOX_UNAVAILABLE, insertDemoInboxRow } from '@/lib/demo-provider/inbox'
import {
  DEMO_COOKIE_PENDING,
  DEMO_PENDING_TTL_MS,
  readDemoAccount,
  setSignedCookie,
  sha256Hex,
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
    return seeOther(request, withScenario('/demo-provider/login/otp?error=unknown_account', scenario))
  }

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
  try {
    await insertDemoInboxRow({
      toEmail: email,
      kind: 'otp',
      subject: 'Your Demo Provider sign-in code',
      bodyText: `Your Demo Provider code is ${code}`,
    })
  } catch (error) {
    const code_ = error instanceof Error && error.message === DEMO_INBOX_UNAVAILABLE ? 'inbox_unavailable' : 'invalid_request'
    return seeOther(request, withScenario(`/demo-provider/login/otp?error=${code_}`, scenario))
  }

  const pending: DemoPending = {
    kind: 'otp',
    email,
    proofSha256: sha256Hex(code),
    expiresAt: new Date(Date.now() + DEMO_PENDING_TTL_MS).toISOString(),
  }
  const response = seeOther(request, withScenario('/demo-provider/login/otp?sent=1', scenario))
  setSignedCookie(response, DEMO_COOKIE_PENDING, pending, Math.ceil(DEMO_PENDING_TTL_MS / 1000))
  return response
}

export const dynamic = 'force-dynamic'
