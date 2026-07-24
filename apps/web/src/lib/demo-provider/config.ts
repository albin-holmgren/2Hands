/**
 * Demo Account Provider — fixture configuration.
 *
 * The demo provider is a first-party deterministic test site used as a
 * browser-auth target for dev/CI (Slice 3). It is intentionally NOT wired to
 * product auth: it simulates an external third-party service. All of its state
 * lives in HMAC-signed `demo_provider_*` cookies plus the `public.demo_inbox`
 * fixture table (the simulated external email inbox).
 */

export const DEMO_FIXTURE_EMAIL = 'demo-user@demo-provider.test'
export const DEMO_FROM_DOMAIN = 'demo-provider.test'
export const DEMO_TERMS_VERSION = 'v1 2026-07-24'
export const DEMO_PLAN = { id: 'demo_pro', label: 'Demo Pro', priceLabel: '$5/mo' } as const

/**
 * The fixture password. Env-overridable so CI can rotate it; the default is a
 * published fixture value (not a canary — leak scanners use their own canaries).
 */
export function fixturePassword(): string {
  return (process.env.DEMO_PROVIDER_PASSWORD || 'demo-password-fixture').trim()
}

/** Injection-test scenarios switchable via `?scenario=` on every demo page. */
export const DEMO_SCENARIOS = [
  'default',
  'wrong_password',
  'redirect_wrong_origin',
  'duplicate_fields',
  'prompt_injection',
  'expired_session',
] as const

export type DemoScenario = (typeof DEMO_SCENARIOS)[number]

export function normalizeScenario(value: unknown): DemoScenario {
  const raw = typeof value === 'string' ? value.trim() : ''
  return (DEMO_SCENARIOS as readonly string[]).includes(raw) ? (raw as DemoScenario) : 'default'
}

/** Append the scenario to a redirect path so flows stay in-scenario. */
export function withScenario(path: string, scenario: DemoScenario): string {
  if (scenario === 'default') return path
  return `${path}${path.includes('?') ? '&' : '?'}scenario=${scenario}`
}

/** Mask an email for display (never render the full local part). */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain || !local) return '***'
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain}`
}

export type DemoSearchParams = Record<string, string | string[] | undefined>

export function paramString(params: DemoSearchParams, key: string): string | undefined {
  const value = params[key]
  return typeof value === 'string' ? value : undefined
}

/** User-facing copy for `?error=` codes on demo pages. */
export const DEMO_ERROR_MESSAGES: Record<string, string> = {
  invalid_request: 'The request could not be read. Please try again.',
  invalid_credentials: 'Incorrect email or password.',
  unknown_account: 'No Demo Provider account exists for that email.',
  account_exists: 'An account already exists for that email. Sign in instead.',
  invalid_email: 'Enter a valid email address.',
  weak_password: 'Password must be at least 8 characters.',
  invalid_code: 'That code is incorrect.',
  code_expired: 'No active code. Request a new one.',
  invalid_link: 'That sign-in link is not valid.',
  link_expired: 'That sign-in link has expired. Request a new one.',
  must_accept: 'You must tick the checkbox to accept the terms.',
  version_mismatch: 'The terms changed while you were reading. Review and accept again.',
  signin_required: 'Sign in to continue.',
  terms_required: 'Accept the Terms of Service to continue.',
  inbox_unavailable:
    'Demo inbox unavailable: the public.demo_inbox table is missing. Apply the latest Supabase migrations (supabase db reset) and retry.',
  session_expired: 'Your session has expired. Sign in again.',
}

export function demoErrorMessage(code: string | undefined): string | null {
  if (!code) return null
  return DEMO_ERROR_MESSAGES[code] ?? 'Something went wrong. Please try again.'
}
