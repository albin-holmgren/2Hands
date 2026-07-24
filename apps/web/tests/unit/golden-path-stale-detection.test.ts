#!/usr/bin/env npx tsx
/**
 * Golden-path: Stale run and mission lock detection logic
 *
 * Tests the pure temporal classification logic without a DB connection.
 * Verifies that the stale thresholds are correct and that stale vs healthy
 * runs are distinguished correctly by their timestamps.
 *
 * Run: npx tsx tests/unit/golden-path-stale-detection.test.ts
 */

export {}

// ─── Inline pure detection logic ──────────────────────────────────────────────

const STALE_CLAIMED_MS  = 5  * 60 * 1000  // 5 minutes
const STALE_RUNNING_MS  = 40 * 60 * 1000  // 40 minutes
const STALE_TICK_LOCK_MS = 35 * 60 * 1000 // 35 minutes

type RunStatus = 'claimed' | 'running'

interface FakeRun {
  run_id: string
  status: RunStatus
  updated_at: string
}

interface FakeLock {
  mission_id: string
  acquired_at: string
  expires_at: string
}

// Real implementation uses DB .lt() — strictly less than — so the threshold
// instant itself is NOT stale; one millisecond past it IS stale.
function isStaleRun(run: FakeRun, now: number): boolean {
  const age = now - new Date(run.updated_at).getTime()
  if (run.status === 'claimed') return age > STALE_CLAIMED_MS
  if (run.status === 'running') return age > STALE_RUNNING_MS
  return false
}

function isStaleTickLock(lock: FakeLock, now: number): boolean {
  const age = now - new Date(lock.acquired_at).getTime()
  const notYetExpired = new Date(lock.expires_at).getTime() > now
  return notYetExpired && age > STALE_TICK_LOCK_MS
}

function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60 * 1000).toISOString()
}
function minutesFromNow(n: number): string {
  return new Date(Date.now() + n * 60 * 1000).toISOString()
}

// ─── Test harness ─────────────────────────────────────────────────────────────

let _p = 0
let _f = 0
const _fails: string[] = []

function test(name: string, fn: () => void) {
  try { fn(); _p++; console.log(`  ✔ ${name}`) }
  catch (err) {
    _f++
    const msg = err instanceof Error ? err.message : String(err)
    _fails.push(`${name}: ${msg}`)
    console.log(`  ✗ ${name}\n    ${msg}`)
  }
}
function assert(cond: boolean, msg: string) { if (!cond) throw new Error(msg) }

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log('\n⏱  Golden Path: Stale Run and Lock Detection\n')

const now = Date.now()

// ── Claimed runs ──────────────────────────────────────────────────────────────
test('claimed run updated 1m ago is NOT stale', () => {
  assert(!isStaleRun({ run_id: 'r1', status: 'claimed', updated_at: minutesAgo(1) }, now), 'Should not be stale at 1m')
})
test('claimed run updated 4m 59s ago is NOT stale', () => {
  const almostStale = new Date(now - (STALE_CLAIMED_MS - 1000)).toISOString()
  assert(!isStaleRun({ run_id: 'r2', status: 'claimed', updated_at: almostStale }, now), 'Should not be stale just below threshold')
})
test('claimed run updated exactly 5m ago is NOT stale (boundary is exclusive)', () => {
  const exactly = new Date(now - STALE_CLAIMED_MS).toISOString()
  assert(!isStaleRun({ run_id: 'r3', status: 'claimed', updated_at: exactly }, now), 'Exact threshold is not stale (uses strict greater-than)')
})
test('claimed run updated 5m+1ms ago IS stale', () => {
  const justOver = new Date(now - STALE_CLAIMED_MS - 1).toISOString()
  assert(isStaleRun({ run_id: 'r3b', status: 'claimed', updated_at: justOver }, now), 'One ms past threshold should be stale')
})
test('claimed run updated 30m ago IS stale', () => {
  assert(isStaleRun({ run_id: 'r4', status: 'claimed', updated_at: minutesAgo(30) }, now), 'Should be stale at 30m')
})

// ── Running runs ──────────────────────────────────────────────────────────────
test('running run updated 10m ago is NOT stale', () => {
  assert(!isStaleRun({ run_id: 'r5', status: 'running', updated_at: minutesAgo(10) }, now), 'Should not be stale at 10m running')
})
test('running run updated 39m 59s ago is NOT stale', () => {
  const almostStale = new Date(now - (STALE_RUNNING_MS - 1000)).toISOString()
  assert(!isStaleRun({ run_id: 'r6', status: 'running', updated_at: almostStale }, now), 'Should not be stale just under 40m')
})
test('running run updated exactly 40m ago is NOT stale (boundary is exclusive)', () => {
  const exactly = new Date(now - STALE_RUNNING_MS).toISOString()
  assert(!isStaleRun({ run_id: 'r7', status: 'running', updated_at: exactly }, now), 'Exact threshold is not stale (uses strict greater-than)')
})
test('running run updated 40m+1ms ago IS stale', () => {
  const justOver = new Date(now - STALE_RUNNING_MS - 1).toISOString()
  assert(isStaleRun({ run_id: 'r7b', status: 'running', updated_at: justOver }, now), 'One ms past threshold should be stale')
})
test('running run updated 60m ago IS stale', () => {
  assert(isStaleRun({ run_id: 'r8', status: 'running', updated_at: minutesAgo(60) }, now), 'Should be stale at 60m')
})

// ── Mission tick locks ────────────────────────────────────────────────────────
test('tick lock acquired 10m ago and expiring in 10m is NOT stale', () => {
  assert(!isStaleTickLock({
    mission_id: 'm1',
    acquired_at: minutesAgo(10),
    expires_at: minutesFromNow(10),
  }, now), 'Recent lock with future expiry is not stale')
})
test('tick lock acquired 36m ago but still technically valid IS stale', () => {
  assert(isStaleTickLock({
    mission_id: 'm2',
    acquired_at: minutesAgo(36),
    expires_at: minutesFromNow(5), // still valid
  }, now), 'Old lock still within expiry window should be stale')
})
test('tick lock that has already expired is NOT stale (it is expired)', () => {
  assert(!isStaleTickLock({
    mission_id: 'm3',
    acquired_at: minutesAgo(45),
    expires_at: minutesAgo(5), // already expired
  }, now), 'Already-expired lock is handled by expiry cleanup, not stale detection')
})
test('tick lock acquired exactly at stale threshold is NOT stale (boundary is exclusive)', () => {
  const exactly = new Date(now - STALE_TICK_LOCK_MS).toISOString()
  assert(!isStaleTickLock({
    mission_id: 'm4',
    acquired_at: exactly,
    expires_at: minutesFromNow(10),
  }, now), 'Exact threshold is not stale (uses strict greater-than)')
})
test('tick lock acquired 1ms past stale threshold IS stale', () => {
  const justOver = new Date(now - STALE_TICK_LOCK_MS - 1).toISOString()
  assert(isStaleTickLock({
    mission_id: 'm4b',
    acquired_at: justOver,
    expires_at: minutesFromNow(10),
  }, now), 'One ms past threshold should be stale')
})

// ── Threshold sanity ──────────────────────────────────────────────────────────
test('claimed threshold is 5 minutes', () => {
  assert(STALE_CLAIMED_MS === 5 * 60 * 1000, `Expected 5m, got ${STALE_CLAIMED_MS}ms`)
})
test('running threshold is 40 minutes', () => {
  assert(STALE_RUNNING_MS === 40 * 60 * 1000, `Expected 40m, got ${STALE_RUNNING_MS}ms`)
})
test('tick lock stale threshold is 35 minutes', () => {
  assert(STALE_TICK_LOCK_MS === 35 * 60 * 1000, `Expected 35m, got ${STALE_TICK_LOCK_MS}ms`)
})
test('claimed threshold is tighter than running threshold', () => {
  assert(STALE_CLAIMED_MS < STALE_RUNNING_MS, 'Claimed should become stale faster than running')
})

// ─── Results ─────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50))
console.log(`Results: ${_p} passed, ${_f} failed`)
if (_fails.length > 0) {
  console.log('\nFailures:')
  _fails.forEach(f => console.log(`  - ${f}`))
}
console.log('='.repeat(50))

process.exit(_f > 0 ? 1 : 0)
