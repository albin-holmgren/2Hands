/**
 * Deterministic adapter for the Demo Account Provider (CODEX_ONE_SHOT §9).
 *
 * A reviewed adapter — not the model — decides what kind of page the browser
 * is on and which semantic fields it is allowed to carry. The demo site is a
 * first-party fixture: its URL paths and `data-semantic` attributes are a
 * frozen contract, so classification is a pure lookup. Unsupported or
 * unexpected pages resolve to `requires_user_takeover`; the adapter never
 * guesses selectors or improvises on unknown UI.
 */
import type { ObservedSemantic, PageKind, SafeObservation } from './types'

export const DEMO_PROVIDER_ID = 'demo-account-provider'

/** Demo site URL paths → page kinds (the §9 route set, frozen). */
export const DEMO_PATH_TO_PAGE_KIND: Readonly<Record<string, PageKind>> = {
  '/login/password': 'login_password',
  '/login/otp': 'login_otp',
  '/login/magic-link': 'login_magic_link',
  '/login/mfa': 'login_mfa',
  '/signup': 'signup',
  '/terms': 'terms',
  '/checkout': 'checkout',
  '/account': 'account',
  '/logout': 'logout',
}

/**
 * Classify a demo-site pathname. Trailing slashes are tolerated; query/hash
 * must already be stripped (pass `URL.pathname`). Anything not in the frozen
 * route map is `unknown` — never a best-effort guess.
 */
export function demoPageKindFromPathname(pathname: string): PageKind {
  const normalized =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  return DEMO_PATH_TO_PAGE_KIND[normalized] ?? 'unknown'
}

/** What the auth orchestrator should do on a given demo page kind. */
export type DemoAuthStep =
  | 'inject_and_submit'
  | 'await_email_verification'
  | 'requires_user_takeover'
  | 'await_terms'
  | 'await_payment'
  | 'observe_only'

export interface DemoPageExpectation {
  pageKind: PageKind
  /** Exactly the semantic fields this page kind carries — no more, no less. */
  expectedSemantics: ObservedSemantic[]
  step: DemoAuthStep
}

/**
 * Frozen page-kind → expected-field map for the demo provider.
 * - password/otp/signup pages are handled by deterministic lease injection;
 * - magic-link waits on the Email Verification Broker;
 * - MFA always requires protected user takeover (authenticator/push is never
 *   automated);
 * - terms/checkout route to their dedicated consent/payment flows.
 */
export const DEMO_PAGE_EXPECTATIONS: Readonly<Record<Exclude<PageKind, 'unknown'>, DemoPageExpectation>> = {
  login_password: { pageKind: 'login_password', expectedSemantics: ['email', 'password'], step: 'inject_and_submit' },
  login_otp: { pageKind: 'login_otp', expectedSemantics: ['otp'], step: 'inject_and_submit' },
  login_magic_link: { pageKind: 'login_magic_link', expectedSemantics: ['email'], step: 'await_email_verification' },
  login_mfa: { pageKind: 'login_mfa', expectedSemantics: [], step: 'requires_user_takeover' },
  signup: { pageKind: 'signup', expectedSemantics: ['email', 'password'], step: 'inject_and_submit' },
  terms: { pageKind: 'terms', expectedSemantics: [], step: 'await_terms' },
  checkout: { pageKind: 'checkout', expectedSemantics: [], step: 'await_payment' },
  account: { pageKind: 'account', expectedSemantics: [], step: 'observe_only' },
  logout: { pageKind: 'logout', expectedSemantics: [], step: 'observe_only' },
}

/**
 * Expectation for a page kind. Unknown/unsupported kinds fail closed to
 * `requires_user_takeover` with no expected fields.
 */
export function demoExpectationForPage(pageKind: PageKind): DemoPageExpectation {
  if (pageKind !== 'unknown' && pageKind in DEMO_PAGE_EXPECTATIONS) {
    return DEMO_PAGE_EXPECTATIONS[pageKind as Exclude<PageKind, 'unknown'>]
  }
  return { pageKind, expectedSemantics: [], step: 'requires_user_takeover' }
}

export function demoExpectationForPathname(pathname: string): DemoPageExpectation {
  return demoExpectationForPage(demoPageKindFromPathname(pathname))
}

/**
 * Decide the orchestrator's next step from a live SafeObservation.
 * The observed semantic fields must match the frozen expectation exactly —
 * a page presenting extra protected fields (duplicate/overlaid inputs, DOM
 * tampering, provider UI change) or missing expected ones is not acted on;
 * it requires user takeover instead.
 */
export function demoDecideNextStep(observation: SafeObservation): DemoAuthStep {
  const expectation = demoExpectationForPage(observation.pageKind)
  if (expectation.step === 'requires_user_takeover') return 'requires_user_takeover'

  const observed = observation.semanticFields.map((field) => field.semantic).sort()
  const expected = [...expectation.expectedSemantics].sort()
  const matches =
    observed.length === expected.length && observed.every((semantic, i) => semantic === expected[i])
  if (!matches) return 'requires_user_takeover'

  return expectation.step
}
