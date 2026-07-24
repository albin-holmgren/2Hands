#!/usr/bin/env npx tsx
// v3 Slice 5 — runner-protocol unit tests: lease signing/validation matrix,
// path jail (traversal + prefix), event normalization map.

import {
  isPathAllowed,
  newRunnerLeaseId,
  newRunnerNonce,
  RUNNER_EVENT_NORMALIZATION,
  RUNNER_INTERNAL_EVENTS,
  signRunnerLease,
  validateRunnerLease,
  type UnsignedRunnerLease,
} from '@2hands/runner-protocol'

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

console.log('\n=== 1. Lease signing + validation ===')

const key = 'd'.repeat(64)
const unsigned: UnsignedRunnerLease = {
  id: newRunnerLeaseId(),
  workspaceId: 'ws-1',
  userId: 'user-1',
  computerId: 'comp-1',
  sessionId: 'sess-1',
  taskId: 'task-1',
  allowedPaths: ['/workspace/repo'],
  allowedOperations: ['read_file', 'write_file', 'run_command', 'git'],
  commandPolicyId: 'default',
  networkPolicyId: 'deny_default',
  maximumRuntimeMs: 600000,
  maximumCredits: 10,
  publishAllowed: false,
  expiresAt: new Date(Date.now() + 60000).toISOString(),
  nonce: newRunnerNonce(),
}
const lease = signRunnerLease(unsigned, key)

const base = {
  lease,
  signingKeyHex: key,
  operation: 'run_command' as const,
  sessionId: 'sess-1',
  computerId: 'comp-1',
}

assert(validateRunnerLease(base).valid, 'exact-match lease validates')
assert(!validateRunnerLease({ ...base, signingKeyHex: 'e'.repeat(64) }).valid, 'wrong key rejected')

const tamperedLease = { ...lease, publishAllowed: true }
const tampered = validateRunnerLease({ ...base, lease: tamperedLease })
assert(!tampered.valid && (tampered as { reason: string }).reason === 'signature_mismatch', 'publish-flag tamper breaks signature')

const wrongSession = validateRunnerLease({ ...base, sessionId: 'sess-2' })
assert(!wrongSession.valid && (wrongSession as { reason: string }).reason === 'session_mismatch', 'cross-session use rejected')

const wrongComputer = validateRunnerLease({ ...base, computerId: 'comp-2' })
assert(!wrongComputer.valid && (wrongComputer as { reason: string }).reason === 'computer_mismatch', 'cross-computer use rejected')

const wrongOp = validateRunnerLease({ ...base, operation: 'preview' as const })
assert(!wrongOp.valid && (wrongOp as { reason: string }).reason === 'operation_not_allowed', 'unlisted operation rejected')

const expired = signRunnerLease({ ...unsigned, expiresAt: new Date(Date.now() - 1000).toISOString() }, key)
const expiredResult = validateRunnerLease({ ...base, lease: expired })
assert(!expiredResult.valid && (expiredResult as { reason: string }).reason === 'expired', 'expired lease rejected')

const seen = new Set([lease.nonce])
const replayed = validateRunnerLease({ ...base, seenNonces: seen })
assert(!replayed.valid && (replayed as { reason: string }).reason === 'replay', 'nonce replay rejected')

console.log('\n=== 2. Path jail ===')

const paths = ['/workspace/repo']
assert(isPathAllowed('/workspace/repo/src/index.ts', paths).allowed, 'in-jail path allowed')
assert(isPathAllowed('/workspace/repo', paths).allowed, 'jail root itself allowed')
assert(!isPathAllowed('/workspace/other/file', paths).allowed, 'sibling path denied')
assert(!isPathAllowed('/workspace/repository/file', paths).allowed, 'prefix-collision path denied (repo vs repository)')
assert(!isPathAllowed('/workspace/repo/../other/file', paths).allowed, 'traversal out of jail denied')
assert(isPathAllowed('/workspace/repo/a/../b', paths).allowed, 'internal traversal that stays inside allowed')
assert(!isPathAllowed('relative/path', paths).allowed, 'relative path denied')
assert(!isPathAllowed('/../../etc/passwd', paths).allowed, 'root escape denied')
assert(!isPathAllowed('/workspace/repo/file\u0000.txt', paths).allowed, 'NUL byte denied')

const validated = validateRunnerLease({ ...base, operation: 'write_file' as const, targetPath: '/etc/passwd' })
assert(!validated.valid && (validated as { reason: string }).reason === 'path_not_allowed', 'lease validation enforces path jail')

console.log('\n=== 3. Event normalization ===')

assert(RUNNER_INTERNAL_EVENTS.length === Object.keys(RUNNER_EVENT_NORMALIZATION).length, 'every internal event has a normalization entry')
assert(RUNNER_EVENT_NORMALIZATION['runner.agent.started'] === 'agent.run.started', 'agent events normalize to agent.run.*')
assert(RUNNER_EVENT_NORMALIZATION['runner.checkpoint.created'] === 'computer.checkpoint.created', 'checkpoint normalizes to computer family')
assert(RUNNER_EVENT_NORMALIZATION['runner.heartbeat'] === null, 'heartbeat stays internal')

console.log('\n───────────────────────────────────────────────────────')
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
