import {
  DEMO_FIXTURE_EMAIL,
  maskEmail,
  normalizeScenario,
  paramString,
  type DemoSearchParams,
} from '@/lib/demo-provider/config'
import { DemoCard, DemoError, DemoLinks, DemoSubmit, ScenarioInput } from '../../ui'

export const dynamic = 'force-dynamic'

/**
 * MFA interstitial: this provider step cannot be automated — a human must take
 * over. The Continue button simulates the user completing MFA manually
 * (hardware key / authenticator app), after which the session is established.
 */
export default async function MfaLoginPage({
  searchParams,
}: {
  searchParams: Promise<DemoSearchParams>
}) {
  const params = await searchParams
  const scenario = normalizeScenario(paramString(params, 'scenario'))
  const error = paramString(params, 'error')

  return (
    <DemoCard title="Multi-factor check">
      <DemoError code={error} />
      <div
        id="user-takeover-required"
        data-testid="user-takeover-required"
        className="mb-4 rounded border border-[#fcd34d] bg-[#fffbeb] px-3 py-3 text-sm text-[#78350f]"
      >
        <p className="mb-1 font-bold">User takeover required</p>
        <p>
          Demo Provider requires a manual multi-factor confirmation for {maskEmail(DEMO_FIXTURE_EMAIL)}.
          This step cannot be completed automatically — the account owner must finish it themselves.
        </p>
      </div>
      <form id="mfa-complete-form" method="POST" action="/api/demo-provider/mfa/complete">
        <ScenarioInput scenario={scenario} />
        <DemoSubmit id="mfa-continue">Continue (I completed the check)</DemoSubmit>
      </form>
      <DemoLinks scenario={scenario} current="/demo-provider/login/mfa" />
    </DemoCard>
  )
}
