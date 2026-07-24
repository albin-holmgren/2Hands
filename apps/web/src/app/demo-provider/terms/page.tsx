import { cookies } from 'next/headers'
import {
  DEMO_TERMS_VERSION,
  normalizeScenario,
  paramString,
  withScenario,
  type DemoSearchParams,
} from '@/lib/demo-provider/config'
import { readDemoSession } from '@/lib/demo-provider/session'
import { DemoCard, DemoError, DemoNotice, DemoSubmit, ScenarioInput } from '../ui'

export const dynamic = 'force-dynamic'

export default async function DemoTermsPage({
  searchParams,
}: {
  searchParams: Promise<DemoSearchParams>
}) {
  const params = await searchParams
  const scenario = normalizeScenario(paramString(params, 'scenario'))
  const error = paramString(params, 'error')

  const cookieStore = await cookies()
  const session = readDemoSession(cookieStore)
  const alreadyAccepted = session?.termsVersion === DEMO_TERMS_VERSION

  return (
    <DemoCard title="Terms of Service">
      <DemoError code={error} />
      <p id="terms-version" data-testid="terms-version" className="mb-2 text-sm font-bold">
        Version: {DEMO_TERMS_VERSION}
      </p>
      <div className="mb-4 max-h-48 overflow-y-auto rounded border border-[#e4e4e7] bg-[#fafafa] p-3 text-sm text-[#3f3f46]">
        <p className="mb-2">
          1. Demo Provider is a fictional service used as a deterministic test target. Nothing here
          creates a real agreement, account, or obligation.
        </p>
        <p className="mb-2">
          2. Fixture accounts may be created, modified, and deleted at any time. No real personal
          data should ever be entered on this site.
        </p>
        <p className="mb-2">
          3. The Demo Pro plan is a simulated subscription. No payment is collected and no money
          changes hands.
        </p>
        <p>4. These terms exist so automated flows can exercise consent capture end to end.</p>
      </div>
      {alreadyAccepted ? (
        <>
          <DemoNotice id="terms-accepted-notice">
            You accepted version {DEMO_TERMS_VERSION}.
          </DemoNotice>
          <p className="text-sm">
            <a href={withScenario('/demo-provider/account', scenario)} className="text-[#2563eb] underline">
              Go to your account
            </a>
          </p>
        </>
      ) : (
        <form id="terms-form" method="POST" action="/api/demo-provider/terms/accept">
          <ScenarioInput scenario={scenario} />
          <input type="hidden" name="terms_version" value={DEMO_TERMS_VERSION} />
          <label htmlFor="accept-terms" className="mb-4 flex items-start gap-2 text-sm">
            <input id="accept-terms" name="accept" type="checkbox" className="mt-0.5" />
            <span>
              I have read and accept the Demo Provider Terms of Service ({DEMO_TERMS_VERSION}).
            </span>
          </label>
          <DemoSubmit id="accept-terms-submit">Accept terms</DemoSubmit>
        </form>
      )}
    </DemoCard>
  )
}
