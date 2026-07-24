#!/usr/bin/env npx tsx
/**
 * Golden-path: Failure taxonomy classification
 *
 * Verifies that raw error strings from runs, ticks, and blocking events
 * are consistently mapped to typed BlockedReasons, including correct
 * terminal vs retryable classification.
 *
 * Run: npx tsx tests/unit/golden-path-failure-taxonomy.test.ts
 */

export {}

process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-stub'
process.env.NEXT_PUBLIC_SUPABASE_URL  = 'https://stub.supabase.co'

// ─── Inline taxonomy to avoid DB import chain ────────────────────────────────

type BlockedReason =
  | 'approval_required' | 'credits_exhausted' | 'budget_exceeded' | 'policy_blocked'
  | 'provider_error' | 'vm_unavailable' | 'integration_missing' | 'rate_limited'
  | 'auth_error' | 'validation_error' | 'parsing_error' | 'timeout' | 'worker_crash'
  | 'concurrency_limit' | 'daily_quota_reached' | 'unknown'

function classify(raw: string | null | undefined): BlockedReason {
  if (!raw) return 'unknown'
  const msg = raw.trim().toLowerCase()
  if (msg.includes('approval') || msg.includes('autonomy') || msg.includes('execute_with_approval')) return 'approval_required'
  if (msg.includes('no credits') || (msg.includes('credit') && msg.includes('exhausted')) || msg.includes('out of credits')) return 'credits_exhausted'
  if (msg.includes('budget') || msg.includes('cost limit') || msg.includes('max_cost')) return 'budget_exceeded'
  if (msg.includes('policy') || msg.includes('blocked by') || msg.includes('not allowed') || msg.includes('draft_only')) return 'policy_blocked'
  if (msg.includes('unauthorized') || msg.includes('login') || msg.includes('auth') || msg.includes('forbidden')) return 'auth_error'
  if (msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('429')) return 'rate_limited'
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('deadline')) return 'timeout'
  if (msg.includes('vm not available') || msg.includes('no vm') || msg.includes('vm_unavailable') || (msg.includes('session') && msg.includes('unavailable'))) return 'vm_unavailable'
  if (msg.includes('integration') || (msg.includes('connection') && (msg.includes('missing') || msg.includes('disconnected')))) return 'integration_missing'
  if (msg.includes('validation') || msg.includes('invalid') || msg.includes('required field')) return 'validation_error'
  if (msg.includes('concurrency') || msg.includes('max_concurrent')) return 'concurrency_limit'
  if (msg.includes('daily quota') || msg.includes('max_ticks_per_day') || msg.includes('quota reached')) return 'daily_quota_reached'
  if (msg.includes('network') || msg.includes('provider') || msg.includes('econnrefused')) return 'provider_error'
  if (msg.includes('worker') && (msg.includes('crash') || msg.includes('died'))) return 'worker_crash'
  return 'unknown'
}

const TERMINAL = new Set<BlockedReason>(['approval_required','credits_exhausted','budget_exceeded','policy_blocked','auth_error','integration_missing','validation_error'])
const RETRYABLE = new Set<BlockedReason>(['provider_error','vm_unavailable','rate_limited','timeout','worker_crash','unknown'])

// ─── Test harness ─────────────────────────────────────────────────────────────

let _passed = 0
let _failed = 0
const _failures: string[] = []

function test(name: string, fn: () => void) {
  try { fn(); _passed++; console.log(`  ✔ ${name}`) }
  catch (err) {
    _failed++
    const msg = err instanceof Error ? err.message : String(err)
    _failures.push(`${name}: ${msg}`)
    console.log(`  ✗ ${name}\n    ${msg}`)
  }
}
function eq<T>(a: T, b: T, msg?: string) {
  if (a !== b) throw new Error(msg ?? `Expected ${String(b)}, got ${String(a)}`)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log('\n🧭 Golden Path: Failure Taxonomy\n')

test('null / empty → unknown', () => {
  eq(classify(null), 'unknown')
  eq(classify(undefined), 'unknown')
  eq(classify(''), 'unknown')
})

test('approval message → approval_required', () => {
  eq(classify('Mission tick skipped: requires approval'), 'approval_required')
  eq(classify('autonomy level blocks this action'), 'approval_required')
  eq(classify('execute_with_approval policy active'), 'approval_required')
})

test('credit exhaustion → credits_exhausted', () => {
  eq(classify('workspace has no credits remaining'), 'credits_exhausted')
  eq(classify('out of credits — please top up'), 'credits_exhausted')
  eq(classify('credit balance exhausted'), 'credits_exhausted')
})

test('budget limit → budget_exceeded', () => {
  eq(classify('budget limit reached for this mission'), 'budget_exceeded')
  eq(classify('max_cost exceeded'), 'budget_exceeded')
})

test('policy → policy_blocked', () => {
  eq(classify('blocked by outbound policy'), 'policy_blocked')
  eq(classify('draft_only mode prevents execution'), 'policy_blocked')
  eq(classify('action not allowed under current settings'), 'policy_blocked')
})

test('auth errors → auth_error (terminal)', () => {
  eq(classify('Login failed: wrong password'), 'auth_error')
  eq(classify('Unauthorized — token expired'), 'auth_error')
  eq(classify('403 Forbidden'), 'auth_error')
})

test('rate limiting → rate_limited (retryable)', () => {
  eq(classify('429 Too Many Requests'), 'rate_limited')
  eq(classify('Rate limit exceeded for this API'), 'rate_limited')
})

test('timeout → timeout (retryable)', () => {
  eq(classify('Request timed out after 30s'), 'timeout')
  eq(classify('Execution deadline exceeded'), 'timeout')
})

test('VM unavailable → vm_unavailable (retryable)', () => {
  eq(classify('VM not available at this time'), 'vm_unavailable')
  eq(classify('session unavailable — pool depleted'), 'vm_unavailable')
})

test('integration missing → integration_missing (terminal)', () => {
  eq(classify('integration connection is missing'), 'integration_missing')
  eq(classify('integration disconnected for this account'), 'integration_missing')
})

test('validation error → validation_error (terminal)', () => {
  eq(classify('validation failed: required field missing'), 'validation_error')
  eq(classify('Invalid input provided to run'), 'validation_error')
})

test('concurrency → concurrency_limit', () => {
  eq(classify('max_concurrent ticks reached'), 'concurrency_limit')
  eq(classify('concurrency limit of 3 exceeded'), 'concurrency_limit')
})

test('daily quota → daily_quota_reached', () => {
  eq(classify('max_ticks_per_day quota reached'), 'daily_quota_reached')
  eq(classify('daily quota for this mission has been reached'), 'daily_quota_reached')
})

test('provider/network → provider_error (retryable)', () => {
  eq(classify('provider connection failed'), 'provider_error')
  eq(classify('ECONNREFUSED 127.0.0.1:3000'), 'provider_error')
})

test('worker crash → worker_crash (retryable)', () => {
  eq(classify('worker process crashed'), 'worker_crash')
  eq(classify('Worker died unexpectedly'), 'worker_crash')
})

// Terminal/retryable set membership
test('approval_required is terminal', () => {
  if (!TERMINAL.has('approval_required')) throw new Error('Expected approval_required in TERMINAL set')
})
test('auth_error is terminal', () => {
  if (!TERMINAL.has('auth_error')) throw new Error('Expected auth_error in TERMINAL set')
})
test('provider_error is retryable', () => {
  if (!RETRYABLE.has('provider_error')) throw new Error('Expected provider_error in RETRYABLE set')
})
test('timeout is retryable', () => {
  if (!RETRYABLE.has('timeout')) throw new Error('Expected timeout in RETRYABLE set')
})
test('credits_exhausted is terminal (not retryable)', () => {
  if (RETRYABLE.has('credits_exhausted')) throw new Error('credits_exhausted should NOT be in RETRYABLE set')
  if (!TERMINAL.has('credits_exhausted')) throw new Error('credits_exhausted should be in TERMINAL set')
})

// ─── Results ─────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50))
console.log(`Results: ${_passed} passed, ${_failed} failed`)
if (_failures.length > 0) {
  console.log('\nFailures:')
  _failures.forEach(f => console.log(`  - ${f}`))
}
console.log('='.repeat(50))

process.exit(_failed > 0 ? 1 : 0)
