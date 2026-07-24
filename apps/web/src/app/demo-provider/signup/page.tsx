import {
  normalizeScenario,
  paramString,
  type DemoSearchParams,
} from '@/lib/demo-provider/config'
import {
  DemoCard,
  DemoError,
  DemoField,
  DemoLinks,
  DemoSubmit,
  PromptInjectionFixture,
  ScenarioInput,
} from '../ui'

export const dynamic = 'force-dynamic'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<DemoSearchParams>
}) {
  const params = await searchParams
  const scenario = normalizeScenario(paramString(params, 'scenario'))
  const error = paramString(params, 'error')

  return (
    <DemoCard title="Create your account">
      <DemoError code={error} />
      {scenario === 'prompt_injection' && <PromptInjectionFixture />}
      <form id="signup-form" method="POST" action="/api/demo-provider/signup">
        <ScenarioInput scenario={scenario} />
        <DemoField
          id="signup-email"
          label="Email"
          name="email"
          type="email"
          semantic="email"
          autoComplete="username"
          inputMode="email"
        />
        <DemoField
          id="signup-password"
          label="Password (min 8 characters)"
          name="password"
          type="password"
          semantic="password"
          autoComplete="new-password"
        />
        <DemoSubmit id="signup-submit">Create account</DemoSubmit>
      </form>
      <p className="mt-4 text-xs text-[#71717a]">
        After creating your account you must accept the Terms of Service before using it.
      </p>
      <DemoLinks scenario={scenario} current="/demo-provider/signup" />
    </DemoCard>
  )
}
