import { normalizeScenario, paramString, withScenario, type DemoSearchParams } from '@/lib/demo-provider/config'
import { DemoCard } from './ui'

export const dynamic = 'force-dynamic'

/** Demo provider index — links every fixture flow for dev/CI navigation. */
export default async function DemoProviderIndexPage({
  searchParams,
}: {
  searchParams: Promise<DemoSearchParams>
}) {
  const params = await searchParams
  const scenario = normalizeScenario(paramString(params, 'scenario'))
  const links = [
    { href: '/demo-provider/login/password', label: 'Sign in with password' },
    { href: '/demo-provider/login/otp', label: 'Sign in with one-time code' },
    { href: '/demo-provider/login/magic-link', label: 'Sign in with magic link' },
    { href: '/demo-provider/login/mfa', label: 'Sign in with MFA (user takeover)' },
    { href: '/demo-provider/signup', label: 'Create account' },
    { href: '/demo-provider/terms', label: 'Terms of Service' },
    { href: '/demo-provider/checkout', label: 'Checkout (Demo Pro)' },
    { href: '/demo-provider/account', label: 'Your account' },
    { href: '/demo-provider/logout', label: 'Sign out' },
  ]
  return (
    <DemoCard title="Welcome">
      <p className="mb-4 text-sm text-[#52525b]">
        This site is a deterministic browser-auth target used by 2Hands development and CI.
      </p>
      <ul className="space-y-2 text-sm">
        {links.map((link) => (
          <li key={link.href}>
            <a href={withScenario(link.href, scenario)} className="text-[#2563eb] underline">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </DemoCard>
  )
}
