/**
 * Demo Account Provider — MFA takeover completion.
 * The MFA page is a "user takeover required" interstitial; pressing Continue
 * simulates the human completing the provider's MFA challenge manually, after
 * which the fixture user is signed in.
 */
import { NextRequest } from 'next/server'
import {
  DEMO_FIXTURE_EMAIL,
  DEMO_TERMS_VERSION,
  normalizeScenario,
  withScenario,
} from '@/lib/demo-provider/config'
import {
  DEMO_COOKIE_SESSION,
  DEMO_SESSION_TTL_MS,
  setSignedCookie,
  type DemoSession,
} from '@/lib/demo-provider/session'
import { formString, readForm, seeOther } from '@/lib/demo-provider/respond'

export async function POST(request: NextRequest) {
  const form = await readForm(request)
  const scenario = normalizeScenario(formString(form, 'scenario'))
  const now = Date.now()
  const session: DemoSession = {
    email: DEMO_FIXTURE_EMAIL,
    plan: 'free',
    termsVersion: DEMO_TERMS_VERSION,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + DEMO_SESSION_TTL_MS).toISOString(),
  }
  const response = seeOther(request, withScenario('/demo-provider/account', scenario))
  setSignedCookie(response, DEMO_COOKIE_SESSION, session, Math.ceil(DEMO_SESSION_TTL_MS / 1000))
  return response
}

export const dynamic = 'force-dynamic'
