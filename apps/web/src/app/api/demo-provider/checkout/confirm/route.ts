/**
 * Demo Account Provider — confirm the fixed Demo Pro purchase.
 * Provider-hosted checkout semantics: no card fields, one confirm action.
 * Requires a live session with terms accepted.
 */
import { NextRequest } from 'next/server'
import { normalizeScenario, withScenario } from '@/lib/demo-provider/config'
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
  if (!session.termsVersion) {
    return seeOther(request, withScenario('/demo-provider/terms?error=terms_required', scenario))
  }

  const updatedSession: DemoSession = { ...session, plan: 'demo_pro' }
  const response = seeOther(request, withScenario('/demo-provider/account?purchased=1', scenario))
  setSignedCookie(response, DEMO_COOKIE_SESSION, updatedSession, Math.ceil(DEMO_SESSION_TTL_MS / 1000))

  const account = readDemoAccount(request.cookies)
  if (account && account.email === session.email) {
    setSignedCookie(response, DEMO_COOKIE_ACCOUNT, { ...account, plan: 'demo_pro' }, ACCOUNT_COOKIE_TTL_SECONDS)
  }
  return response
}

export const dynamic = 'force-dynamic'
