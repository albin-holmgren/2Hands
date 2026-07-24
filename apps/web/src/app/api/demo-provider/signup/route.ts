/**
 * Demo Account Provider — signup.
 * Creates a fixture account in the signed demo_provider_account cookie
 * (password stored as SHA-256 digest only), signs in, then requires terms
 * acceptance before the account is usable.
 */
import { NextRequest } from 'next/server'
import { DEMO_FIXTURE_EMAIL, normalizeScenario, withScenario } from '@/lib/demo-provider/config'
import {
  DEMO_COOKIE_ACCOUNT,
  DEMO_COOKIE_SESSION,
  DEMO_SESSION_TTL_MS,
  setSignedCookie,
  sha256Hex,
  type DemoAccount,
  type DemoSession,
} from '@/lib/demo-provider/session'
import { formString, readForm, seeOther } from '@/lib/demo-provider/respond'

const ACCOUNT_COOKIE_TTL_SECONDS = 30 * 24 * 60 * 60 // 30 days

export async function POST(request: NextRequest) {
  const form = await readForm(request)
  const scenario = normalizeScenario(formString(form, 'scenario'))
  const email = formString(form, 'email').trim().toLowerCase()
  const password = formString(form, 'password')

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return seeOther(request, withScenario('/demo-provider/signup?error=invalid_email', scenario))
  }
  if (password.length < 8) {
    return seeOther(request, withScenario('/demo-provider/signup?error=weak_password', scenario))
  }
  if (email === DEMO_FIXTURE_EMAIL) {
    return seeOther(request, withScenario('/demo-provider/signup?error=account_exists', scenario))
  }

  const now = Date.now()
  const account: DemoAccount = {
    email,
    passwordSha256: sha256Hex(password),
    plan: 'free',
    createdAt: new Date(now).toISOString(),
  }
  const session: DemoSession = {
    email,
    plan: 'free',
    // termsVersion intentionally absent: signup requires terms acceptance next.
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + DEMO_SESSION_TTL_MS).toISOString(),
  }

  const response = seeOther(request, withScenario('/demo-provider/terms', scenario))
  setSignedCookie(response, DEMO_COOKIE_ACCOUNT, account, ACCOUNT_COOKIE_TTL_SECONDS)
  setSignedCookie(response, DEMO_COOKIE_SESSION, session, Math.ceil(DEMO_SESSION_TTL_MS / 1000))
  return response
}

export const dynamic = 'force-dynamic'
