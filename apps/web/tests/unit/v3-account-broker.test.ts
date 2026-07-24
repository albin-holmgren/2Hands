#!/usr/bin/env npx tsx
// v3 Slice 3 — Account Broker unit tests:
// manifest validator (schema parity, fail-closed consts, unknown keys),
// demo manifest registry, 14-state auth-run machine parity spot checks,
// ensureCapability pure decision logic.

import {
  AUTH_RUN_TRANSITIONS,
  PROVIDER_MANIFEST_REGISTRY,
  TERMINAL_AUTH_RUN_STATUSES,
  assertLegalAuthTransition,
  demoAccountProviderManifest,
  ensureCapability,
  getProviderManifest,
  isLegalAuthTransition,
  isTerminalAuthRunStatus,
  supportedInteractiveModes,
  validateProviderManifest,
  type CapabilityGrant,
  type ProviderAuthManifest,
} from '@2hands/account-broker'
import type { AuthRunStatus, EnsureCapabilityRequest, ProviderAccount } from '@2hands/types/v3'

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

function invalidWith(manifest: unknown, pathFragment: string, message: string): void {
  const result = validateProviderManifest(manifest)
  assert(
    !result.valid && result.errors.some((e) => e.includes(pathFragment)),
    `${message}${result.valid ? ' (validated but should not)' : ''}`,
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function clone(manifest: ProviderAuthManifest): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return structuredClone(manifest) as unknown as Record<string, any>
}

console.log('\n=== 1. Manifest validator ===')

const demoResult = validateProviderManifest(demoAccountProviderManifest)
assert(demoResult.valid, 'demo manifest validates')
assert(
  demoResult.valid && demoResult.manifest.providerId === 'demo-account-provider',
  'validated manifest passes through',
)

assert(getProviderManifest('demo-account-provider') === demoAccountProviderManifest, 'registry resolves demo manifest')
assert(PROVIDER_MANIFEST_REGISTRY.size === 1, 'registry only contains built-in manifests')
assert(getProviderManifest('nope') === undefined, 'unknown provider not in registry')

assert(!validateProviderManifest(null).valid, 'null rejected')
assert(!validateProviderManifest('manifest').valid, 'non-object rejected')
assert(!validateProviderManifest([demoAccountProviderManifest]).valid, 'array rejected')

const missingRequired = clone(demoAccountProviderManifest)
delete missingRequired.revocation
invalidWith(missingRequired, '$.revocation', 'missing required root key rejected')

const missingPolicyKey = clone(demoAccountProviderManifest)
delete missingPolicyKey.policy.reviewOwner
invalidWith(missingPolicyKey, '$.policy.reviewOwner', 'missing required nested key rejected')

const badVersion = clone(demoAccountProviderManifest)
badVersion.version = 2
invalidWith(badVersion, '$.version', 'version must be const 1')

for (const bad of ['Demo Provider', 'UPPER', 'x', '-leading', 'a'.repeat(65)]) {
  const m = clone(demoAccountProviderManifest)
  m.providerId = bad
  invalidWith(m, '$.providerId', `bad providerId pattern rejected (${JSON.stringify(bad)})`)
}

const recordingOn = clone(demoAccountProviderManifest)
recordingOn.browser.recording = true
invalidWith(recordingOn, '$.browser.recording', 'recording: true rejected (const false)')

const rawPayments = clone(demoAccountProviderManifest)
rawPayments.payments.rawPaymentDataTo2Hands = true
invalidWith(rawPayments, '$.payments.rawPaymentDataTo2Hands', 'rawPaymentDataTo2Hands: true rejected (const false)')

const extraRootKey = clone(demoAccountProviderManifest)
extraRootKey.telemetry = { enabled: true }
invalidWith(extraRootKey, '$.telemetry', 'unknown root key rejected')

const extraNestedKey = clone(demoAccountProviderManifest)
extraNestedKey.browser.screenshotUploads = true
invalidWith(extraNestedKey, '$.browser.screenshotUploads', 'unknown nested key rejected')

const extraAuthModeKey = clone(demoAccountProviderManifest)
extraAuthModeKey.authModes[0].plaintextFallback = true
invalidWith(extraAuthModeKey, '$.authModes[0].plaintextFallback', 'unknown authMode key rejected')

const emptyCapabilities = clone(demoAccountProviderManifest)
emptyCapabilities.capabilities = []
invalidWith(emptyCapabilities, '$.capabilities', 'empty capabilities rejected (minItems 1)')

const dupCapabilities = clone(demoAccountProviderManifest)
dupCapabilities.capabilities = ['demo.account', 'demo.account']
invalidWith(dupCapabilities, '$.capabilities', 'duplicate capabilities rejected (uniqueItems)')

const badCapabilityPattern = clone(demoAccountProviderManifest)
badCapabilityPattern.capabilities = ['Demo Account!']
invalidWith(badCapabilityPattern, '$.capabilities[0]', 'capability pattern enforced')

const emptyAuthModes = clone(demoAccountProviderManifest)
emptyAuthModes.authModes = []
invalidWith(emptyAuthModes, '$.authModes', 'empty authModes rejected (minItems 1)')

const badMode = clone(demoAccountProviderManifest)
badMode.authModes[0].mode = 'password_paste'
invalidWith(badMode, '$.authModes[0].mode', 'unknown auth mode enum rejected')

const badPriority = clone(demoAccountProviderManifest)
badPriority.authModes[0].priority = 1001
invalidWith(badPriority, '$.authModes[0].priority', 'priority above maximum rejected')

const fractionalPriority = clone(demoAccountProviderManifest)
fractionalPriority.authModes[0].priority = 1.5
invalidWith(fractionalPriority, '$.authModes[0].priority', 'non-integer priority rejected')

const badOrigin = clone(demoAccountProviderManifest)
badOrigin.browser.allowedOrigins = ['not a url']
invalidWith(badOrigin, '$.browser.allowedOrigins[0]', 'non-uri allowedOrigin rejected')

const dupOrigins = clone(demoAccountProviderManifest)
dupOrigins.browser.allowedOrigins = ['http://localhost:3000', 'http://localhost:3000']
invalidWith(dupOrigins, '$.browser.allowedOrigins', 'duplicate origins rejected (uniqueItems)')

const badModelVision = clone(demoAccountProviderManifest)
badModelVision.browser.modelVision = 'full'
invalidWith(badModelVision, '$.browser.modelVision', 'modelVision enum enforced (no full vision)')

const emptySecretKinds = clone(demoAccountProviderManifest)
emptySecretKinds.browser.secretFields[0].allowedSecretKinds = []
invalidWith(emptySecretKinds, '$.browser.secretFields[0].allowedSecretKinds', 'empty allowedSecretKinds rejected')

const badBlockedKind = clone(demoAccountProviderManifest)
badBlockedKind.browser.blockedPageKinds = ['password_reset', 'profile_page']
invalidWith(badBlockedKind, '$.browser.blockedPageKinds[1]', 'unknown blockedPageKind rejected')

const badMaxAge = clone(demoAccountProviderManifest)
badMaxAge.emailVerification.maximumAgeSeconds = 10
invalidWith(badMaxAge, '$.emailVerification.maximumAgeSeconds', 'maximumAgeSeconds below minimum rejected')

const badDate = clone(demoAccountProviderManifest)
badDate.policy.lastReviewedAt = 'yesterday'
invalidWith(badDate, '$.policy.lastReviewedAt', 'non date-time lastReviewedAt rejected')

const longDisplayName = clone(demoAccountProviderManifest)
longDisplayName.displayName = 'x'.repeat(101)
invalidWith(longDisplayName, '$.displayName', 'displayName over maxLength rejected')

const badHealthInterval = clone(demoAccountProviderManifest)
badHealthInterval.health.intervalSeconds = 30
invalidWith(badHealthInterval, '$.health.intervalSeconds', 'health interval below minimum rejected')

const badRevocationMethod = clone(demoAccountProviderManifest)
badRevocationMethod.revocation.method = 'email'
invalidWith(badRevocationMethod, '$.revocation.method', 'unknown revocation method rejected')

console.log('\n=== 2. Demo manifest shape ===')

assert(demoAccountProviderManifest.status === 'enabled', 'demo provider enabled')
assert(demoAccountProviderManifest.capabilities.includes('demo.account'), 'demo.account capability present')
assert(demoAccountProviderManifest.browser?.recording === false, 'recording is false')
assert(demoAccountProviderManifest.browser?.modelVision === 'disabled', 'model vision disabled')
assert(demoAccountProviderManifest.browser?.blockedPageKinds?.length === 6, 'all six page kinds blocked')
assert(demoAccountProviderManifest.payments?.rawPaymentDataTo2Hands === false, 'raw payment data never transits 2Hands')
assert(
  demoAccountProviderManifest.authModes.map((m) => m.mode).join(',') === 'user_browser_session,assisted_signup',
  'demo auth modes: browser session + assisted signup',
)

console.log('\n=== 3. Auth-run state machine (mirrors v3_is_legal_auth_transition) ===')

const ALL_STATUSES = Object.keys(AUTH_RUN_TRANSITIONS) as AuthRunStatus[]
assert(ALL_STATUSES.length === 14, 'all 14 states in transition map')

const legalCases: Array<[AuthRunStatus, AuthRunStatus]> = [
  ['created', 'selecting_method'],
  ['selecting_method', 'awaiting_secure_input'],
  ['selecting_method', 'awaiting_oauth'],
  ['awaiting_secure_input', 'browser_running'],
  ['browser_running', 'awaiting_email_verification'],
  ['browser_running', 'awaiting_payment'],
  ['awaiting_email_verification', 'validating_session'],
  ['awaiting_user_takeover', 'browser_running'],
  ['awaiting_terms', 'awaiting_payment'],
  ['awaiting_payment', 'validating_session'],
  ['validating_session', 'completed'],
  ['validating_session', 'awaiting_email_verification'],
]
for (const [from, to] of legalCases) {
  assert(isLegalAuthTransition(from, to), `legal: ${from} -> ${to}`)
}

const illegalCases: Array<[AuthRunStatus, AuthRunStatus]> = [
  ['created', 'completed'],
  ['created', 'browser_running'],
  ['awaiting_oauth', 'browser_running'],
  ['awaiting_payment', 'browser_running'],
  ['awaiting_terms', 'awaiting_secure_input'],
  ['validating_session', 'browser_running'],
  ['completed', 'browser_running'],
  ['failed', 'created'],
  ['expired', 'failed'],
]
for (const [from, to] of illegalCases) {
  assert(!isLegalAuthTransition(from, to), `illegal: ${from} -> ${to}`)
}

for (const terminal of TERMINAL_AUTH_RUN_STATUSES) {
  assert(isTerminalAuthRunStatus(terminal), `${terminal} is terminal`)
  assert(AUTH_RUN_TRANSITIONS[terminal].length === 0, `${terminal} has no outgoing transitions`)
}
assert(TERMINAL_AUTH_RUN_STATUSES.length === 4, 'exactly 4 terminal states')

for (const from of ALL_STATUSES) {
  if (isTerminalAuthRunStatus(from)) continue
  assert(
    isLegalAuthTransition(from, 'failed') &&
      isLegalAuthTransition(from, 'cancelled') &&
      isLegalAuthTransition(from, 'expired'),
    `${from} can always fail/cancel/expire`,
  )
}

assertLegalAuthTransition('created', 'selecting_method')
passed++
console.log('  ✓ assertLegalAuthTransition passes legal transition')
throws(() => assertLegalAuthTransition('completed', 'browser_running'), 'assertLegalAuthTransition throws on terminal exit')
throws(() => assertLegalAuthTransition('created', 'validating_session'), 'assertLegalAuthTransition throws on skip')

console.log('\n=== 4. ensureCapability decision logic ===')

const request: EnsureCapabilityRequest = {
  workspaceId: 'ws-1',
  userId: 'user-1',
  providerId: 'demo-account-provider',
  capability: 'demo.account',
  taskId: 'task-1',
  allowInteractiveAuth: true,
}

const connectedAccount: ProviderAccount = {
  id: 'acct-1',
  workspaceId: 'ws-1',
  userId: 'user-1',
  providerId: 'demo-account-provider',
  accountOwner: 'user',
  billingOwner: 'user',
  mode: 'user_browser_session',
  status: 'connected',
  grantedCapabilities: ['demo.account'],
  grantedScopes: [],
  createdAt: '2026-07-24T00:00:00Z',
  updatedAt: '2026-07-24T00:00:00Z',
}

const liveGrant: CapabilityGrant = {
  id: 'grant-1',
  providerAccountId: 'acct-1',
  capability: 'demo.account',
  mode: 'user_browser_session',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
}

const ready = ensureCapability(request, demoAccountProviderManifest, [connectedAccount], [liveGrant])
assert(ready.state === 'ready', 'live grant on connected account -> ready')
assert(ready.state === 'ready' && ready.grantId === 'grant-1', 'ready carries grant id')
assert(ready.state === 'ready' && ready.providerAccountId === 'acct-1', 'ready carries account id')
assert(ready.state === 'ready' && ready.mode === 'user_browser_session', 'ready carries grant mode')

const noGrants = ensureCapability(request, demoAccountProviderManifest, [connectedAccount], [])
assert(noGrants.state === 'authentication_required', 'no grant -> authentication_required')
assert(
  noGrants.state === 'authentication_required' &&
    noGrants.supportedModes.join(',') === 'user_browser_session,assisted_signup',
  'supported modes sorted by manifest priority',
)

const expiredGrant = { ...liveGrant, expiresAt: new Date(Date.now() - 1000).toISOString() }
const expired = ensureCapability(request, demoAccountProviderManifest, [connectedAccount], [expiredGrant])
assert(expired.state === 'authentication_required', 'expired grant ignored')

const revokedGrant = { ...liveGrant, revokedAt: '2026-07-24T00:00:00Z' }
const revoked = ensureCapability(request, demoAccountProviderManifest, [connectedAccount], [revokedGrant])
assert(revoked.state === 'authentication_required', 'revoked grant ignored')

const reauthAccount: ProviderAccount = { ...connectedAccount, status: 'needs_reauth' }
const reauth = ensureCapability(request, demoAccountProviderManifest, [reauthAccount], [liveGrant])
assert(reauth.state === 'authentication_required', 'grant on needs_reauth account ignored')

const preferred = ensureCapability(
  { ...request, preferredModes: ['assisted_signup'] },
  demoAccountProviderManifest,
  [],
  [],
)
assert(
  preferred.state === 'authentication_required' && preferred.supportedModes[0] === 'assisted_signup',
  'preferredModes reorders supported modes',
)
assert(
  preferred.state === 'authentication_required' && preferred.supportedModes.length === 2,
  'preferredModes is a preference, not a restriction',
)

const disabledManifest: ProviderAuthManifest = { ...demoAccountProviderManifest, status: 'disabled' }
const disabled = ensureCapability(request, disabledManifest, [connectedAccount], [liveGrant])
assert(
  disabled.state === 'unsupported' && disabled.reasonCode === 'provider_disabled',
  'disabled provider -> unsupported/provider_disabled (even with live grant)',
)

const comingSoonManifest: ProviderAuthManifest = { ...demoAccountProviderManifest, status: 'coming_soon' }
const comingSoon = ensureCapability(request, comingSoonManifest, [], [])
assert(
  comingSoon.state === 'unsupported' && comingSoon.reasonCode === 'provider_disabled',
  'coming_soon provider -> unsupported/provider_disabled',
)

const wrongCapability = ensureCapability(
  { ...request, capability: 'demo.payments' },
  demoAccountProviderManifest,
  [],
  [],
)
assert(
  wrongCapability.state === 'unsupported' && wrongCapability.reasonCode === 'capability_not_offered',
  'unknown capability -> unsupported/capability_not_offered',
)

const noModesManifest: ProviderAuthManifest = {
  ...demoAccountProviderManifest,
  authModes: demoAccountProviderManifest.authModes.map((m) => ({ ...m, enabled: false })),
}
const noModes = ensureCapability(request, noModesManifest, [], [])
assert(
  noModes.state === 'unsupported' && noModes.reasonCode === 'no_supported_modes',
  'all modes disabled -> unsupported/no_supported_modes',
)

const unhostedManifest: ProviderAuthManifest = {
  ...demoAccountProviderManifest,
  authModes: demoAccountProviderManifest.authModes.map((m) => ({ ...m, hosted: undefined })),
}
assert(
  supportedInteractiveModes(unhostedManifest).length === 0,
  'modes without explicit hosted: true excluded (fail closed)',
)

console.log('\n───────────────────────────────────────────────────────')
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
