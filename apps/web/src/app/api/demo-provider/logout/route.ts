/**
 * Demo Account Provider — sign out.
 * Clears the session and any pending challenge. The account cookie is kept so
 * signup-created fixture accounts can sign back in.
 */
import { NextRequest } from 'next/server'
import { normalizeScenario, withScenario } from '@/lib/demo-provider/config'
import {
  DEMO_COOKIE_PENDING,
  DEMO_COOKIE_SESSION,
  clearDemoCookie,
} from '@/lib/demo-provider/session'
import { formString, readForm, seeOther } from '@/lib/demo-provider/respond'

export async function POST(request: NextRequest) {
  const form = await readForm(request)
  const scenario = normalizeScenario(formString(form, 'scenario'))
  const response = seeOther(request, withScenario('/demo-provider/login/password?signedout=1', scenario))
  clearDemoCookie(response, DEMO_COOKIE_SESSION)
  clearDemoCookie(response, DEMO_COOKIE_PENDING)
  return response
}

export const dynamic = 'force-dynamic'
