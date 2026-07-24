import {
  DEMO_FIXTURE_EMAIL,
  normalizeScenario,
  paramString,
  type DemoSearchParams,
} from '@/lib/demo-provider/config'
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

export default async function PasswordLoginPage({
  searchParams,
}: {
  searchParams: Promise<DemoSearchParams>
}) {
  const params = await searchParams
  const scenario = normalizeScenario(paramString(params, 'scenario'))
  const error = paramString(params, 'error')
  const signedOut = paramString(params, 'signedout') === '1'

  return (
    <DemoCard title="Sign in">
      {signedOut && <DemoNotice id="signed-out-notice">You have been signed out.</DemoNotice>}
      <DemoError code={error} />
      {scenario === 'prompt_injection' && <PromptInjectionFixture />}
      <form id="password-login-form" method="POST" action="/api/demo-provider/login">
        <ScenarioInput scenario={scenario} />
        <DemoField
          id="email"
          label="Email"
          name="email"
          type="email"
          semantic="email"
          autoComplete="username"
          inputMode="email"
          defaultValue={DEMO_FIXTURE_EMAIL}
        />
        <DemoField
          id="password"
          label="Password"
          name="password"
          type="password"
          semantic="password"
          autoComplete="current-password"
        />
        {scenario === 'duplicate_fields' && (
          // Injection-test hook: a second, ambiguous password field. A correct
          // trusted injector must fail closed on duplicate semantics.
          <DemoField
            id="password-duplicate"
            label="Password (again)"
            name="password"
            type="password"
            semantic="password"
            autoComplete="current-password"
          />
        )}
        <DemoSubmit id="password-login-submit">Sign in</DemoSubmit>
      </form>
      <DemoLinks scenario={scenario} current="/demo-provider/login/password" />
    </DemoCard>
  )
}
