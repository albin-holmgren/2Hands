import { cookies } from 'next/headers'
import {
  DEMO_PLAN,
  DEMO_TERMS_VERSION,
  maskEmail,
  normalizeScenario,
  paramString,
  withScenario,
  type DemoSearchParams,
} from '@/lib/demo-provider/config'
import { DEMO_COOKIE_SESSION, readDemoSession } from '@/lib/demo-provider/session'
import { DemoCard, DemoError, DemoNotice } from '../ui'

export const dynamic = 'force-dynamic'

export default async function DemoAccountPage({
  searchParams,
}: {
  searchParams: Promise<DemoSearchParams>
}) {
  const params = await searchParams
  const scenario = normalizeScenario(paramString(params, 'scenario'))
  const error = paramString(params, 'error')
  const purchased = paramString(params, 'purchased') === '1'

  const cookieStore = await cookies()
  const session = readDemoSession(cookieStore)
  const hasSessionCookie = Boolean(cookieStore.get(DEMO_COOKIE_SESSION)?.value)

  // expired_session scenario: render the expired state regardless of the real
  // cookie, so tests can exercise session-expiry handling deterministically.
  const expired = scenario === 'expired_session' || (hasSessionCookie && !session)

  if (expired || !session) {
    return (
      <DemoCard title="Your account">
        <DemoError code={error} />
        {expired ? (
          <p
            id="session-expired"
            data-testid="session-expired"
            className="mb-4 rounded border border-[#fcd34d] bg-[#fffbeb] px-3 py-2 text-sm text-[#78350f]"
          >
            Your session has expired. Sign in again to continue.
          </p>
        ) : (
          <p id="signed-out" data-testid="signed-out" className="mb-4 text-sm text-[#52525b]">
            You are not signed in.
          </p>
        )}
        <p className="text-sm">
          <a
            href={withScenario('/demo-provider/login/password', scenario)}
            className="text-[#2563eb] underline"
          >
            Sign in
          </a>
        </p>
      </DemoCard>
    )
  }

  const termsAccepted = session.termsVersion === DEMO_TERMS_VERSION

  return (
    <DemoCard title="Your account">
      <DemoError code={error} />
      {purchased && (
        <DemoNotice id="purchase-confirmed-notice">
          Purchase confirmed: {DEMO_PLAN.label} ({DEMO_PLAN.priceLabel}).
        </DemoNotice>
      )}
      <p
        id="session-status"
        data-testid="session-status"
        className="mb-4 rounded border border-[#a7f3d0] bg-[#ecfdf5] px-3 py-2 text-sm font-bold text-[#065f46]"
      >
        Signed in
      </p>
      <dl className="mb-4 space-y-2 text-sm">
        <div>
          <dt className="font-bold">Email</dt>
          <dd id="account-email" data-testid="account-email">
            {maskEmail(session.email)}
          </dd>
        </div>
        <div>
          <dt className="font-bold">Plan</dt>
          <dd id="account-plan" data-testid="account-plan">
            {session.plan === DEMO_PLAN.id ? `${DEMO_PLAN.label} (${DEMO_PLAN.priceLabel})` : 'Free'}
          </dd>
        </div>
        <div>
          <dt className="font-bold">Terms of Service</dt>
          <dd id="account-terms" data-testid="account-terms">
            {termsAccepted ? `Accepted (${session.termsVersion})` : 'Not accepted'}
          </dd>
        </div>
        <div>
          <dt className="font-bold">Session cookie</dt>
          <dd id="account-session-cookie">{DEMO_COOKIE_SESSION} (set, HttpOnly)</dd>
        </div>
        <div>
          <dt className="font-bold">Session expires</dt>
          <dd id="account-session-expires">{session.expiresAt}</dd>
        </div>
      </dl>
      {!termsAccepted && (
        <p className="mb-4 text-sm">
          <a href={withScenario('/demo-provider/terms', scenario)} className="text-[#2563eb] underline">
            Accept the Terms of Service
          </a>
        </p>
      )}
      <ul className="space-y-1 text-sm">
        <li>
          <a href={withScenario('/demo-provider/checkout', scenario)} className="text-[#2563eb] underline">
            Checkout
          </a>
        </li>
        <li>
          <a href={withScenario('/demo-provider/logout', scenario)} className="text-[#2563eb] underline">
            Sign out
          </a>
        </li>
      </ul>
    </DemoCard>
  )
}
