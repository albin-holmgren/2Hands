import { cookies } from 'next/headers'
import {
  normalizeScenario,
  paramString,
  withScenario,
  type DemoSearchParams,
} from '@/lib/demo-provider/config'
import { readDemoSession } from '@/lib/demo-provider/session'
import { DemoCard, DemoSubmit, ScenarioInput } from '../ui'

export const dynamic = 'force-dynamic'

export default async function DemoLogoutPage({
  searchParams,
}: {
  searchParams: Promise<DemoSearchParams>
}) {
  const params = await searchParams
  const scenario = normalizeScenario(paramString(params, 'scenario'))

  const cookieStore = await cookies()
  const session = readDemoSession(cookieStore)

  if (!session) {
    return (
      <DemoCard title="Sign out">
        <p id="signed-out" data-testid="signed-out" className="mb-4 text-sm text-[#52525b]">
          You are not signed in.
        </p>
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

  return (
    <DemoCard title="Sign out">
      <p className="mb-4 text-sm text-[#52525b]">
        This clears the demo_provider_session cookie and any pending sign-in challenge.
      </p>
      <form id="logout-form" method="POST" action="/api/demo-provider/logout">
        <ScenarioInput scenario={scenario} />
        <DemoSubmit id="sign-out">Sign out</DemoSubmit>
      </form>
    </DemoCard>
  )
}
