import { cookies } from 'next/headers'
import {
  DEMO_FIXTURE_EMAIL,
  maskEmail,
  normalizeScenario,
  paramString,
  withScenario,
  type DemoSearchParams,
} from '@/lib/demo-provider/config'
import { readDemoPending } from '@/lib/demo-provider/session'
import {
  DemoCard,
  DemoError,
  DemoField,
  DemoLinks,
  DemoNotice,
  DemoSubmit,
  PromptInjectionFixture,
  ScenarioInput,
} from '../../ui'

export const dynamic = 'force-dynamic'

export default async function OtpLoginPage({
  searchParams,
}: {
  searchParams: Promise<DemoSearchParams>
}) {
  const params = await searchParams
  const scenario = normalizeScenario(paramString(params, 'scenario'))
  const error = paramString(params, 'error')

  const cookieStore = await cookies()
  const pending = readDemoPending(cookieStore)
  // ?restart=1 shows the request form again; a new request overwrites the
  // pending challenge cookie.
  const awaitingCode = pending?.kind === 'otp' && paramString(params, 'restart') !== '1'

  if (awaitingCode) {
    return (
      <DemoCard title="Enter your code">
        <DemoNotice id="otp-sent-notice">
          A 6-digit code was sent to {maskEmail(pending.email)} (delivered to the demo inbox).
        </DemoNotice>
        <DemoError code={error} />
        {scenario === 'prompt_injection' && <PromptInjectionFixture />}
        <form id="otp-verify-form" method="POST" action="/api/demo-provider/otp/verify">
          <ScenarioInput scenario={scenario} />
          <DemoField
            id="otp"
            label="One-time code"
            name="code"
            type="text"
            semantic="otp"
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
          />
          <DemoSubmit id="otp-verify-submit">Verify code</DemoSubmit>
        </form>
        <p className="mt-4 text-sm">
          <a href={withScenario('/demo-provider/login/otp?restart=1', scenario)} className="text-[#2563eb] underline">
            Request a new code
          </a>
        </p>
        <DemoLinks scenario={scenario} current="/demo-provider/login/otp" />
      </DemoCard>
    )
  }

  return (
    <DemoCard title="Sign in with a one-time code">
      <DemoError code={error} />
      {scenario === 'prompt_injection' && <PromptInjectionFixture />}
      <form id="otp-request-form" method="POST" action="/api/demo-provider/otp/request">
        <ScenarioInput scenario={scenario} />
        <DemoField
          id="otp-email"
          label="Email"
          name="email"
          type="email"
          semantic="email"
          autoComplete="username"
          inputMode="email"
          defaultValue={DEMO_FIXTURE_EMAIL}
        />
        <DemoSubmit id="otp-request-submit">Send code</DemoSubmit>
      </form>
      <DemoLinks scenario={scenario} current="/demo-provider/login/otp" />
    </DemoCard>
  )
}
