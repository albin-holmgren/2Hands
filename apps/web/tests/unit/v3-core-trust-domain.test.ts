#!/usr/bin/env npx tsx
// v3 Slice 2 — core trust domain unit tests:
// task state machine, canonical hashing, approval binding, safe events,
// idempotency derivation.

import {
  actionMatchesHash,
  assertLegalTaskTransition,
  assertSafeEventPayload,
  buildApprovalDraft,
  buildEventEnvelope,
  canonicalActionHash,
  canonicalJson,
  deriveIdempotencyKey,
  envelopeFromRow,
  IllegalTaskTransitionError,
  isKnownEventType,
  isLegalTaskTransition,
  isTerminalTaskStatus,
  isWaitingStatus,
  legalNextStatuses,
  requiresExactApproval,
  UnsafeEventPayloadError,
} from '@2hands/core'
import { TASK_STATUSES, type TaskStatus } from '@2hands/types/v3'

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

function throws(fn: () => unknown, message: string, errorName?: string): void {
  try {
    fn()
    failed++
    console.log(`  ✗ ${message} (did not throw)`)
  } catch (error) {
    if (errorName && (error as Error).name !== errorName) {
      failed++
      console.log(`  ✗ ${message} (threw ${(error as Error).name}, expected ${errorName})`)
    } else {
      passed++
      console.log(`  ✓ ${message}`)
    }
  }
}

console.log('\n=== 1. Task state machine ===')

assert(isLegalTaskTransition('draft', 'planning'), 'draft → planning is legal')
assert(isLegalTaskTransition('planning', 'awaiting_auth'), 'planning → awaiting_auth is legal')
assert(isLegalTaskTransition('planning', 'awaiting_approval'), 'planning → awaiting_approval is legal')
assert(isLegalTaskTransition('planning', 'queued'), 'planning → queued is legal')
assert(isLegalTaskTransition('queued', 'running'), 'queued → running is legal')
assert(isLegalTaskTransition('running', 'verifying'), 'running → verifying is legal')
assert(isLegalTaskTransition('verifying', 'completed'), 'verifying → completed is legal')
assert(isLegalTaskTransition('running', 'awaiting_approval'), 'task can wait mid-run (running → awaiting_approval)')
assert(isLegalTaskTransition('awaiting_approval', 'running'), 'task resumes after approval (awaiting_approval → running)')
assert(isLegalTaskTransition('running', 'awaiting_auth'), 'task can wait for auth mid-run')
assert(isLegalTaskTransition('verifying', 'running'), 'verification failure can return to running')

assert(!isLegalTaskTransition('draft', 'running'), 'draft → running is illegal')
assert(!isLegalTaskTransition('completed', 'running'), 'completed is terminal')
assert(!isLegalTaskTransition('failed', 'queued'), 'failed is terminal')
assert(!isLegalTaskTransition('cancelled', 'planning'), 'cancelled is terminal')
assert(!isLegalTaskTransition('draft', 'completed'), 'draft → completed is illegal')

for (const status of ['completed', 'failed', 'cancelled'] as TaskStatus[]) {
  assert(legalNextStatuses(status).length === 0, `${status} has no legal next states`)
  assert(isTerminalTaskStatus(status), `${status} is terminal`)
}
assert(!isTerminalTaskStatus('running'), 'running is not terminal')
assert(isWaitingStatus('awaiting_auth') && isWaitingStatus('awaiting_approval'), 'waiting statuses identified')

// every status can be cancelled unless terminal
for (const status of TASK_STATUSES) {
  if (isTerminalTaskStatus(status)) continue
  assert(isLegalTaskTransition(status, 'cancelled'), `${status} → cancelled is legal`)
}

throws(
  () => assertLegalTaskTransition('completed', 'running'),
  'assertLegalTaskTransition throws IllegalTaskTransitionError',
  'IllegalTaskTransitionError',
)
assert(new IllegalTaskTransitionError('draft', 'running').message.includes('draft'), 'error message names states')

console.log('\n=== 2. Canonical JSON + action hash ===')

assert(canonicalJson({ b: 1, a: 2 }) === '{"a":2,"b":1}', 'object keys sorted')
assert(canonicalJson({ a: { d: 1, c: [3, 1] } }) === '{"a":{"c":[3,1],"d":1}}', 'nested keys sorted, arrays ordered')
assert(canonicalJson({ a: undefined, b: 1 }) === '{"b":1}', 'undefined members dropped')
throws(() => canonicalJson({ n: NaN }), 'NaN rejected')
throws(() => canonicalJson([undefined]), 'undefined array slot rejected')

const action = {
  action: 'gmail.send',
  taskId: 't-1',
  target: { recipient: 'a@example.com' },
  input: { subject: 'Hello', bodyHash: 'sha256:abc' },
}
const hash1 = canonicalActionHash(action)
const hash2 = canonicalActionHash({ ...action, input: { bodyHash: 'sha256:abc', subject: 'Hello' } })
assert(hash1 === hash2, 'key order does not change hash')
assert(hash1.startsWith('sha256:'), 'hash carries algorithm prefix')

const mutated = canonicalActionHash({ ...action, target: { recipient: 'b@example.com' } })
assert(mutated !== hash1, 'changed recipient changes hash (payload mutation invalidates approval)')
assert(actionMatchesHash(action, hash1), 'actionMatchesHash true for exact payload')
assert(!actionMatchesHash({ ...action, action: 'gmail.send_all' }, hash1), 'actionMatchesHash false after change')

console.log('\n=== 3. Approval drafts ===')

const draft = buildApprovalDraft({
  workspaceId: 'ws-1',
  taskId: 't-1',
  riskClass: 'r2_external_write',
  category: 'external_communication',
  title: 'Send email to a@example.com',
  summary: 'Sends the drafted reply',
  action: { action: 'gmail.send', taskId: 't-1', target: { recipient: 'a@example.com' } },
  now: new Date('2026-07-24T12:00:00Z'),
})
assert(draft.canonicalActionHash.startsWith('sha256:'), 'draft hash computed')
assert(draft.expiresAt === '2026-07-24T12:15:00.000Z', 'default 15-minute expiry')
assert(draft.canonicalAction.expiresAt === draft.expiresAt, 'expiry bound into the hashed action')
assert(
  actionMatchesHash(draft.canonicalAction as unknown as Record<string, unknown>, draft.canonicalActionHash),
  'draft action matches its own hash',
)

const longTtl = buildApprovalDraft({
  workspaceId: 'ws-1',
  riskClass: 'r3_high_impact',
  title: 'x',
  summary: 'y',
  action: { action: 'noop' },
  ttlMs: 999 * 60 * 60 * 1000,
  now: new Date('2026-07-24T12:00:00Z'),
})
assert(longTtl.expiresAt === '2026-07-25T12:00:00.000Z', 'TTL clamped to 24h max')

assert(requiresExactApproval('r2_external_write'), 'R2 requires exact approval')
assert(requiresExactApproval('r3_high_impact'), 'R3 requires exact approval')
assert(!requiresExactApproval('r0_read'), 'R0 does not require approval')
assert(!requiresExactApproval('r1_reversible'), 'R1 does not require approval')

console.log('\n=== 4. Safe events ===')

assert(isKnownEventType('task.created'), 'task.created is a known event type')
assert(isKnownEventType('auth.secure_input.supplied'), 'auth.secure_input.supplied known')
assert(isKnownEventType('computer.checkpoint.created'), 'computer.checkpoint.created known')
assert(!isKnownEventType('task.password.leaked'), 'unknown type rejected')

assertSafeEventPayload({ goal: 'do a thing', nested: { ok: true } })
passed++
console.log('  ✓ benign payload accepted')

throws(
  () => assertSafeEventPayload({ password: 'hunter2' }),
  'payload with password key rejected',
  'UnsafeEventPayloadError',
)
throws(
  () => assertSafeEventPayload({ deep: { list: [{ apiKey: 'sk-x' }] } }),
  'nested apiKey rejected at any depth',
  'UnsafeEventPayloadError',
)
throws(
  () => assertSafeEventPayload({ Access_Token: 'x' }),
  'case-insensitive key match',
  'UnsafeEventPayloadError',
)
try {
  assertSafeEventPayload({ deep: { otp: '123456' } })
} catch (error) {
  assert(error instanceof UnsafeEventPayloadError && error.path === 'payload.deep.otp', 'error reports exact path')
}

const envelope = buildEventEnvelope({
  id: 'evt-1',
  type: 'task.created',
  workspaceId: 'ws-1',
  taskId: 't-1',
  sequence: 1,
  actor: { kind: '2hands' },
  payload: { goal: 'demo' },
})
assert(envelope.version === 1 && envelope.sequence === 1, 'envelope carries version and sequence')
throws(
  () =>
    buildEventEnvelope({
      id: 'evt-2',
      type: 'auth.secure_input.supplied',
      workspaceId: 'ws-1',
      sequence: 2,
      actor: { kind: 'system' },
      payload: { suppliedFieldIds: ['f1'], otp: '111111' },
    }),
  'envelope builder refuses secret-bearing payloads',
  'UnsafeEventPayloadError',
)

const rowEnvelope = envelopeFromRow({
  id: 'evt-3',
  version: 1,
  task_id: 't-9',
  workspace_id: 'ws-9',
  conversation_id: null,
  run_id: null,
  type: 'task.completed',
  sequence: '7',
  actor_kind: 'system',
  actor_id: null,
  occurred_at: '2026-07-24T12:00:00Z',
  payload: { receiptId: 'r-1' },
})
assert(rowEnvelope.sequence === 7, 'bigint-as-string sequence normalized to number')
assert(rowEnvelope.taskId === 't-9' && rowEnvelope.conversationId === undefined, 'row nulls become undefined')

console.log('\n=== 5. Idempotency keys ===')

const keyA = deriveIdempotencyKey({ workspaceId: 'ws-1', action: 'gmail.send', canonicalActionHash: hash1 })
const keyB = deriveIdempotencyKey({ workspaceId: 'ws-1', action: 'gmail.send', canonicalActionHash: hash1 })
const keyC = deriveIdempotencyKey({ workspaceId: 'ws-2', action: 'gmail.send', canonicalActionHash: hash1 })
const keyD = deriveIdempotencyKey({
  workspaceId: 'ws-1',
  action: 'gmail.send',
  canonicalActionHash: hash1,
  attemptScope: 1,
})
assert(keyA === keyB, 'same inputs → same idempotency key (retry-safe)')
assert(keyA !== keyC, 'different workspace → different key')
assert(keyA !== keyD, 'deliberate re-run scope → different key')
assert(keyA.startsWith('idem_'), 'key namespaced')

console.log('\n───────────────────────────────────────────────────────')
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
