/**
 * Demo Account Provider — password login.
 * Deterministic fake backend: fixture user + signup-created cookie accounts.
 * Scenarios: wrong_password (always rejects), redirect_wrong_origin (redirects
 * the POST to a different origin), expired_session (issues an already-expired
 * session cookie).
 */
import { NextRequest } from 'next/server'
import {
  DEMO_FIXTURE_EMAIL,
  DEMO_TERMS_VERSION,
  fixturePassword,
  normalizeScenario,
  withScenario,
} from '@/lib/demo-provider/config'
import {
  DEMO_COOKIE_SESSION,
  DEMO_SESSION_TTL_MS,
  digestsEqual,
  readDemoAccount,
  setSignedCookie,
  sha256Hex,
  type DemoSession,
} from '@/lib/demo-provider/session'
import { formString, readForm, seeOther } from '@/lib/demo-provider/respond'

export async function POST(request: NextRequest) {
  const form = await readForm(request)
  const scenario = normalizeScenario(formString(form, 'scenario'))
  const email = formString(form, 'email').trim().toLowerCase()
  const password = formString(form, 'password')

  if (scenario === 'redirect_wrong_origin') {
    // Injection-test hook: a login POST that redirects to a foreign origin.
    // Automated browser auth must detect the origin change and fail closed.
    return seeOther(request, 'http://localhost:3999/evil')
  }

  let valid = false
  let termsVersion: string | undefined
  let plan: DemoSession['plan'] = 'free'

  if (email === DEMO_FIXTURE_EMAIL) {
    valid = digestsEqual(sha256Hex(password), sha256Hex(fixturePassword()))
    termsVersion = DEMO_TERMS_VERSION
  } else {
    const account = readDemoAccount(request.cookies)
    if (account && account.email === email) {
      valid = digestsEqual(sha256Hex(password), account.passwordSha256)
      termsVersion = account.termsVersion
      plan = account.plan
    }
  }

  if (scenario === 'wrong_password') valid = false
  if (!valid) {
    return seeOther(request, withScenario('/demo-provider/login/password?error=invalid_credentials', scenario))
  }

  const now = Date.now()
  const expiresAt = scenario === 'expired_session' ? new Date(now - 1000) : new Date(now + DEMO_SESSION_TTL_MS)
  const session: DemoSession = {
    email,
    plan,
    termsVersion,
    createdAt: new Date(now).toISOString(),
    expiresAt: expiresAt.toISOString(),
  }

  const destination = termsVersion
    ? withScenario('/demo-provider/account', scenario)
    : withScenario('/demo-provider/terms', scenario)
  const response = seeOther(request, destination)
  setSignedCookie(response, DEMO_COOKIE_SESSION, session, Math.ceil(DEMO_SESSION_TTL_MS / 1000))
  return response
}

export const dynamic = 'force-dynamic'
