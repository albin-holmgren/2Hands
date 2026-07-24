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

export default async function MagicLinkLoginPage({
  searchParams,
}: {
  searchParams: Promise<DemoSearchParams>
}) {
  const params = await searchParams
  const scenario = normalizeScenario(paramString(params, 'scenario'))
  const error = paramString(params, 'error')

  const cookieStore = await cookies()
  const pending = readDemoPending(cookieStore)
  const linkSent = pending?.kind === 'magic_link' && paramString(params, 'restart') !== '1'

  return (
    <DemoCard title="Sign in with a magic link">
      {linkSent && (
        <DemoNotice id="magic-link-sent-notice">
          A sign-in link was sent to {maskEmail(pending.email)} (delivered to the demo inbox). Open
          the link in the email to finish signing in.
        </DemoNotice>
      )}
      <DemoError code={error} />
      {scenario === 'prompt_injection' && <PromptInjectionFixture />}
      {!linkSent && (
        <form id="magic-link-request-form" method="POST" action="/api/demo-provider/magic-link/request">
          <ScenarioInput scenario={scenario} />
          <DemoField
            id="magic-link-email"
            label="Email"
            name="email"
            type="email"
            semantic="email"
            autoComplete="username"
            inputMode="email"
            defaultValue={DEMO_FIXTURE_EMAIL}
          />
          <DemoSubmit id="magic-link-request-submit">Send magic link</DemoSubmit>
        </form>
      )}
      {linkSent && (
        <p className="mt-2 text-sm">
          <a
            href={withScenario('/demo-provider/login/magic-link?restart=1', scenario)}
            className="text-[#2563eb] underline"
          >
            Request a new link
          </a>
        </p>
      )}
      <DemoLinks scenario={scenario} current="/demo-provider/login/magic-link" />
    </DemoCard>
  )
}
