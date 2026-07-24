#!/usr/bin/env npx tsx
// v3 Slice 3 — BrowserProvider unit tests (pure parts only, no chromium):
// demo pageKind mapping from pathname, allowlist origin checks,
// ambiguous-field decision logic, safe-observation sanitization,
// demo-adapter next-step decisions.
//
// Relative imports: apps/web does not (yet) declare @2hands/browser as a
// dependency — the integrate step adds it and can switch these to the
// package specifier.

import {
  DEMO_PAGE_EXPECTATIONS,
  DEMO_PROVIDER_ID,
  demoDecideNextStep,
  demoExpectationForPage,
  demoExpectationForPathname,
  demoPageKindFromPathname,
} from '../../../../packages/browser/src/demo-adapter'
import {
  buildSafeObservation,
  fieldMatchDecision,
  isUrlOriginAllowed,
  isValidActionTarget,
  normalizeAllowedOrigins,
  originOf,
  sanitizeSafeTexts,
  sanitizeSemanticFields,
} from '../../../../packages/browser/src/safety'
import type { PageKind, SafeObservation } from '../../../../packages/browser/src/types'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++
    console.log(`  ✓ ${message}`)
  } else {
    failed++
    console.log(`  ✗ ${message}`)
  }
}

function throws(fn: () => unknown, message: string): void {
  try {
    fn()
    failed++
    console.log(`  ✗ ${message} (did not throw)`)
  } catch {
    passed++
    console.log(`  ✓ ${message}`)
  }
}

console.log('\n=== 1. Demo pageKind mapping from pathname ===')

const expectedKinds: Array<[string, PageKind]> = [
  ['/login/password', 'login_password'],
  ['/login/otp', 'login_otp'],
  ['/login/magic-link', 'login_magic_link'],
  ['/login/mfa', 'login_mfa'],
  ['/signup', 'signup'],
  ['/terms', 'terms'],
  ['/checkout', 'checkout'],
  ['/account', 'account'],
  ['/logout', 'logout'],
]
for (const [path, kind] of expectedKinds) {
  assert(demoPageKindFromPathname(path) === kind, `${path} → ${kind}`)
}
assert(demoPageKindFromPathname('/login/password/') === 'login_password', 'trailing slash tolerated')
assert(demoPageKindFromPathname('/') === 'unknown', 'root path is unknown')
assert(demoPageKindFromPathname('/admin') === 'unknown', 'unlisted path is unknown')
assert(demoPageKindFromPathname('/login') === 'unknown', 'partial login path is unknown')
assert(demoPageKindFromPathname('/login/password/extra') === 'unknown', 'deeper path is not a prefix match')
assert(demoPageKindFromPathname('/LOGIN/PASSWORD') === 'unknown', 'path matching is exact (case-sensitive)')
assert(DEMO_PROVIDER_ID === 'demo-account-provider', 'demo provider id frozen')

console.log('\n=== 2. Allowlist origin checks ===')

const allowed = ['https://demo.2hands.local:8443']
assert(isUrlOriginAllowed('https://demo.2hands.local:8443/login/password', allowed), 'exact origin allowed')
assert(isUrlOriginAllowed('HTTPS://DEMO.2HANDS.LOCAL:8443/x', allowed), 'origin check is case-insensitive')
assert(!isUrlOriginAllowed('http://demo.2hands.local:8443/login', allowed), 'scheme mismatch rejected')
assert(!isUrlOriginAllowed('https://demo.2hands.local/login', allowed), 'port mismatch rejected')
assert(!isUrlOriginAllowed('https://evil.demo.2hands.local:8443/', allowed), 'subdomain rejected')
assert(!isUrlOriginAllowed('https://demo.2hands.local.evil.com:8443/', allowed), 'suffix-spoof domain rejected')
assert(!isUrlOriginAllowed('about:blank', allowed), 'about:blank rejected (opaque origin)')
assert(!isUrlOriginAllowed('not a url', allowed), 'unparsable URL rejected')
assert(!isUrlOriginAllowed('https://demo.2hands.local:8443/x', []), 'empty allowlist matches nothing')
assert(
  !isUrlOriginAllowed('https://demo.2hands.local:8443/x', ['https://demo.2hands.local:8443/path']),
  'malformed allowlist entry (has path) never matches — fails closed'
)

assert(originOf('https://Demo.Example.com/x?q=1') === 'https://demo.example.com', 'originOf normalizes to bare lowercase origin')
assert(originOf('garbage') === null, 'originOf returns null on unparsable input')

const normalized = normalizeAllowedOrigins(['https://B.example.com', 'https://a.example.com', 'https://a.example.com/'])
assert(
  normalized.length === 2 && normalized[0] === 'https://a.example.com' && normalized[1] === 'https://b.example.com',
  'normalizeAllowedOrigins lowercases, dedupes, sorts'
)
throws(() => normalizeAllowedOrigins([]), 'empty allowlist rejected at session creation')
throws(() => normalizeAllowedOrigins(['https://a.example.com/login']), 'allowlist entry with path rejected')
throws(() => normalizeAllowedOrigins(['https://a.example.com?q=1']), 'allowlist entry with query rejected')

console.log('\n=== 3. Ambiguous-field decision logic ===')

assert(fieldMatchDecision(1).ok === true, 'exactly one match → ok')
const zero = fieldMatchDecision(0)
assert(!zero.ok && zero.safeErrorCode === 'ambiguous_field', 'zero matches → abort ambiguous_field')
const two = fieldMatchDecision(2)
assert(!two.ok && two.safeErrorCode === 'ambiguous_field', 'two matches → abort ambiguous_field (duplicate fields)')
const many = fieldMatchDecision(7)
assert(!many.ok && many.safeErrorCode === 'ambiguous_field', 'many matches → abort ambiguous_field')

assert(isValidActionTarget('submit'), 'plain action target valid')
assert(isValidActionTarget('accept-terms'), 'hyphenated action target valid')
assert(!isValidActionTarget(''), 'empty action target invalid')
assert(!isValidActionTarget('a"] , body [x="'), 'selector-injection action target invalid')
assert(!isValidActionTarget('Submit'), 'uppercase action target invalid')

console.log('\n=== 4. SafeObservation sanitization ===')

const fields = sanitizeSemanticFields(['password', 'email', 'password', 'credit_card', null, undefined, ''])
assert(fields.length === 2, 'unknown semantics dropped, duplicates collapsed')
assert(
  fields.every((f) => f.present === true && Object.keys(f).length === 2),
  'descriptors are structurally empty: only {semantic, present:true}'
)
assert(
  fields.map((f) => f.semantic).join(',') === 'email,password',
  'descriptor order is stable'
)

const texts = sanitizeSafeTexts(['  Sign in  ', 'Sign in', '', null, undefined, '  a\n\n b ', 'x'.repeat(500)])
assert(texts[0] === 'Sign in' && texts.length === 3, 'texts trimmed, deduped, empties dropped')
assert(texts[1] === 'a b', 'whitespace collapsed')
assert(texts[2].length === 200, 'individual text capped at 200 chars')
const flood = sanitizeSafeTexts(Array.from({ length: 100 }, (_, i) => `t${i}`))
assert(flood.length === 40, 'safeTexts capped at 40 entries')

const observation = buildSafeObservation({
  url: 'https://demo.2hands.local:8443/login/password?next=%2Faccount',
  pageKind: 'login_password',
  rawSemantics: ['email', 'password'],
  rawTexts: ['Sign in to Demo'],
})
assert(observation.origin === 'https://demo.2hands.local:8443', 'observation carries bare origin')
assert(observation.semanticFields.length === 2, 'observation carries semantic descriptors only')
assert(
  !JSON.stringify(observation).includes('value'),
  'observation shape has no value-bearing keys'
)

console.log('\n=== 5. Demo adapter expectations + next-step decisions ===')

assert(
  demoExpectationForPage('login_password').expectedSemantics.join(',') === 'email,password',
  'login_password expects email+password'
)
assert(demoExpectationForPage('login_otp').expectedSemantics.join(',') === 'otp', 'login_otp expects otp only')
assert(demoExpectationForPage('login_mfa').step === 'requires_user_takeover', 'mfa always requires user takeover')
assert(demoExpectationForPage('login_magic_link').step === 'await_email_verification', 'magic link waits on verification broker')
assert(demoExpectationForPage('terms').step === 'await_terms', 'terms routes to consent flow')
assert(demoExpectationForPage('checkout').step === 'await_payment', 'checkout routes to payment flow')
assert(demoExpectationForPage('unknown').step === 'requires_user_takeover', 'unknown page kind → user takeover')
assert(demoExpectationForPage('unknown').expectedSemantics.length === 0, 'unknown page kind expects no fields')
assert(demoExpectationForPathname('/nope').step === 'requires_user_takeover', 'unknown pathname → user takeover')
assert(
  Object.keys(DEMO_PAGE_EXPECTATIONS).length === 9,
  'all nine demo page kinds have frozen expectations'
)

function obs(pageKind: PageKind, semantics: Array<'username' | 'email' | 'password' | 'otp'>): SafeObservation {
  return buildSafeObservation({
    url: 'https://demo.2hands.local:8443/x',
    pageKind,
    rawSemantics: semantics,
    rawTexts: [],
  })
}

assert(
  demoDecideNextStep(obs('login_password', ['email', 'password'])) === 'inject_and_submit',
  'matching password page → inject_and_submit'
)
assert(
  demoDecideNextStep(obs('login_password', ['password'])) === 'requires_user_takeover',
  'missing expected field → user takeover'
)
assert(
  demoDecideNextStep(obs('login_password', ['email', 'password', 'otp'])) === 'requires_user_takeover',
  'unexpected extra protected field (overlay/tamper) → user takeover'
)
assert(
  demoDecideNextStep(obs('login_otp', ['otp'])) === 'inject_and_submit',
  'matching otp page → inject_and_submit'
)
assert(
  demoDecideNextStep(obs('account', [])) === 'observe_only',
  'account page with no fields → observe_only'
)
assert(
  demoDecideNextStep(obs('account', ['password'])) === 'requires_user_takeover',
  'protected field on a page that should have none → user takeover'
)
assert(
  demoDecideNextStep(obs('unknown', ['email', 'password'])) === 'requires_user_takeover',
  'unknown page never acted on, regardless of fields'
)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
