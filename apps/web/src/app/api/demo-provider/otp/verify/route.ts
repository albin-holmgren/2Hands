/**
 * Demo Account Provider — verify a one-time sign-in code.
 * The code is accepted exactly once: the pending challenge cookie is consumed
 * on success. Failed attempts do not consume the challenge.
 */
import { NextRequest } from 'next/server'
import {
  DEMO_FIXTURE_EMAIL,
  DEMO_TERMS_VERSION,
  normalizeScenario,
  withScenario,
} from '@/lib/demo-provider/config'
import {
  DEMO_COOKIE_PENDING,
  DEMO_COOKIE_SESSION,
  DEMO_SESSION_TTL_MS,
  clearDemoCookie,
  digestsEqual,
  readDemoAccount,
  readDemoPending,
  setSignedCookie,
  sha256Hex,
  type DemoSession,
} from '@/lib/demo-provider/session'
import { formString, readForm, seeOther } from '@/lib/demo-provider/respond'

export async function POST(request: NextRequest) {
  const form = await readForm(request)
  const scenario = normalizeScenario(formString(form, 'scenario'))
  const code = formString(form, 'code').trim()

  const pending = readDemoPending(request.cookies)
  if (!pending || pending.kind !== 'otp') {
    return seeOther(request, withScenario('/demo-provider/login/otp?error=code_expired', scenario))
  }
  if (!/^\d{6}$/.test(code) || !digestsEqual(sha256Hex(code), pending.proofSha256)) {
    return seeOther(request, withScenario('/demo-provider/login/otp?sent=1&error=invalid_code', scenario))
  }

  let termsVersion: string | undefined
  let plan: DemoSession['plan'] = 'free'
  if (pending.email === DEMO_FIXTURE_EMAIL) {
    termsVersion = DEMO_TERMS_VERSION
  } else {
    const account = readDemoAccount(request.cookies)
    if (account && account.email === pending.email) {
      termsVersion = account.termsVersion
      plan = account.plan
    }
  }

  const now = Date.now()
  const session: DemoSession = {
    email: pending.email,
    plan,
    termsVersion,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + DEMO_SESSION_TTL_MS).toISOString(),
  }
  const destination = termsVersion
    ? withScenario('/demo-provider/account', scenario)
    : withScenario('/demo-provider/terms', scenario)
  const response = seeOther(request, destination)
  clearDemoCookie(response, DEMO_COOKIE_PENDING)
  setSignedCookie(response, DEMO_COOKIE_SESSION, session, Math.ceil(DEMO_SESSION_TTL_MS / 1000))
  return response
}

export const dynamic = 'force-dynamic'
