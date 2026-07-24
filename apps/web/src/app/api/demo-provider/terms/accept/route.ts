/**
 * Demo Account Provider — accept Terms of Service.
 * Requires a live session, a ticked checkbox, and the exact displayed terms
 * version (a changed version invalidates the acceptance).
 */
import { NextRequest } from 'next/server'
import { DEMO_TERMS_VERSION, normalizeScenario, withScenario } from '@/lib/demo-provider/config'
import {
  DEMO_COOKIE_ACCOUNT,
  DEMO_COOKIE_SESSION,
  DEMO_SESSION_TTL_MS,
  readDemoAccount,
  readDemoSession,
  setSignedCookie,
  type DemoSession,
} from '@/lib/demo-provider/session'
import { formString, readForm, seeOther } from '@/lib/demo-provider/respond'

const ACCOUNT_COOKIE_TTL_SECONDS = 30 * 24 * 60 * 60 // 30 days

export async function POST(request: NextRequest) {
  const form = await readForm(request)
  const scenario = normalizeScenario(formString(form, 'scenario'))
  const session = readDemoSession(request.cookies)
  if (!session) {
    return seeOther(request, withScenario('/demo-provider/login/password?error=signin_required', scenario))
  }
  if (formString(form, 'accept') !== 'on') {
    return seeOther(request, withScenario('/demo-provider/terms?error=must_accept', scenario))
  }
  if (formString(form, 'terms_version') !== DEMO_TERMS_VERSION) {
    return seeOther(request, withScenario('/demo-provider/terms?error=version_mismatch', scenario))
  }

  const updatedSession: DemoSession = { ...session, termsVersion: DEMO_TERMS_VERSION }
  const response = seeOther(request, withScenario('/demo-provider/account', scenario))
  setSignedCookie(response, DEMO_COOKIE_SESSION, updatedSession, Math.ceil(DEMO_SESSION_TTL_MS / 1000))

  const account = readDemoAccount(request.cookies)
  if (account && account.email === session.email) {
    setSignedCookie(
      response,
      DEMO_COOKIE_ACCOUNT,
      { ...account, termsVersion: DEMO_TERMS_VERSION },
      ACCOUNT_COOKIE_TTL_SECONDS,
    )
  }
  return response
}

export const dynamic = 'force-dynamic'
