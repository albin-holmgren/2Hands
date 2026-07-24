import { cookies } from 'next/headers'
import {
  DEMO_PLAN,
  normalizeScenario,
  paramString,
  withScenario,
  type DemoSearchParams,
} from '@/lib/demo-provider/config'
import { readDemoSession } from '@/lib/demo-provider/session'
import { DemoCard, DemoError, DemoNotice, DemoSubmit, ScenarioInput } from '../ui'

export const dynamic = 'force-dynamic'

/**
 * Provider-hosted checkout semantics: a fixed plan and a single confirm
 * action. Deliberately no card fields — raw payment data never passes through
 * automated flows.
 */
export default async function DemoCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<DemoSearchParams>
}) {
  const params = await searchParams
  const scenario = normalizeScenario(paramString(params, 'scenario'))
  const error = paramString(params, 'error')

  const cookieStore = await cookies()
  const session = readDemoSession(cookieStore)

  if (!session) {
    return (
      <DemoCard title="Checkout">
        <DemoError code={error ?? 'signin_required'} />
        <p className="text-sm">
          <a
            href={withScenario('/demo-provider/login/password', scenario)}
            className="text-[#2563eb] underline"
          >
            Sign in to continue
          </a>
        </p>
      </DemoCard>
    )
  }

  const alreadyPurchased = session.plan === DEMO_PLAN.id

  return (
    <DemoCard title="Checkout">
      <DemoError code={error} />
      <div
        id="checkout-plan"
        data-testid="checkout-plan"
        className="mb-4 rounded border border-[#e4e4e7] bg-[#fafafa] p-4"
      >
        <p className="text-base font-bold">{DEMO_PLAN.label}</p>
        <p id="checkout-price" className="text-2xl font-bold">
          {DEMO_PLAN.priceLabel}
        </p>
        <p className="mt-1 text-sm text-[#52525b]">
          Simulated subscription. Billed to your Demo Provider account — no card required.
        </p>
      </div>
      {alreadyPurchased ? (
        <DemoNotice id="already-purchased-notice">
          You are already subscribed to {DEMO_PLAN.label}.
        </DemoNotice>
      ) : (
        <form id="checkout-form" method="POST" action="/api/demo-provider/checkout/confirm">
          <ScenarioInput scenario={scenario} />
          <DemoSubmit id="confirm-purchase">Confirm purchase</DemoSubmit>
        </form>
      )}
      <p className="mt-4 text-sm">
        <a href={withScenario('/demo-provider/account', scenario)} className="text-[#2563eb] underline">
          Back to account
        </a>
      </p>
    </DemoCard>
  )
}
