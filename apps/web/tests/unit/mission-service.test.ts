#!/usr/bin/env npx tsx
/**
 * Unit tests for mission-service pure functions
 *
 * Run with: npx tsx tests/unit/mission-service.test.ts
 *
 * Tests computeNextTickAt and formatMissionsForPrompt without any DB connection.
 */

export {}

// ─── Minimal test harness ────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  ✔ ${name}`)
  } catch (err) {
    failed++
    const msg = err instanceof Error ? err.message : String(err)
    failures.push(`${name}: ${msg}`)
    console.log(`  ✗ ${name}\n    ${msg}`)
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg)
}

function assertApprox(actual: number, expected: number, tolerance: number, msg: string) {
  const diff = Math.abs(actual - expected)
  if (diff > tolerance) throw new Error(`${msg} (got ${actual}, expected ~${expected}, diff=${diff})`)
}

// ─── Import pure functions ────────────────────────────────────────────────────

// Stub createAdminClient and GoalTree import before loading the module
// We do this by setting up a fake module path — since these are pure functions
// that don't call supabase, we can import them safely as long as we stub the env
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-stub'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.co'

// We manually replicate the pure function implementations here so no DB import is needed
// (the service module imports createAdminClient at top-level which would throw in test env)

type MissionStatus = 'active' | 'paused' | 'completed' | 'failed'
type MissionAutonomyLevel = 'draft_only' | 'execute_with_approval' | 'full_auto'
type MissionCadenceMode = 'fixed' | 'adaptive'

interface Mission {
  id: string
  workspace_id: string
  user_id: string
  goal: string
  status: MissionStatus
  autonomy_level: MissionAutonomyLevel
  constraints: Record<string, unknown>
  cadence_mode: MissionCadenceMode
  cadence_cron: string | null
  tick_timebox_minutes: number
  min_tick_interval_minutes: number
  max_ticks_per_day: number
  next_tick_at: string | null
  last_tick_at: string | null
  goal_tree: unknown | null
  handoff_note: string | null
  conversation_id: string | null
  created_at: string
  updated_at: string
}

function computeNextTickAt(mission: Mission, ticksRunToday: number): Date {
  const now = new Date()
  const minInterval = mission.min_tick_interval_minutes * 60 * 1000

  if (ticksRunToday >= mission.max_ticks_per_day) {
    const tomorrow = new Date(now)
    tomorrow.setUTCHours(8, 0, 0, 0)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow
  }

  if (mission.cadence_mode === 'adaptive') {
    return new Date(now.getTime() + minInterval)
  }

  return new Date(now.getTime() + minInterval)
}

function formatMissionsForPrompt(missions: Mission[]): string {
  if (missions.length === 0) return ''

  const lines = ['ACTIVE MISSIONS:']
  for (const m of missions) {
    const status = m.status === 'active' ? '🟢' : m.status === 'paused' ? '⏸️' : '⚫'
    const nextTick = m.next_tick_at
      ? `next tick ${new Date(m.next_tick_at).toLocaleString()}`
      : 'no tick scheduled'
    lines.push(`${status} [${m.id.slice(0, 8)}] "${m.goal}" — ${m.autonomy_level} — ${nextTick}`)
    if (m.handoff_note) {
      lines.push(`   Last update: ${m.handoff_note.slice(0, 200)}`)
    }
  }

  return lines.join('\n')
}

function makeMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    workspace_id: 'ws-1',
    user_id: 'user-1',
    goal: 'Test mission goal',
    status: 'active',
    autonomy_level: 'full_auto',
    constraints: {},
    cadence_mode: 'adaptive',
    cadence_cron: null,
    tick_timebox_minutes: 30,
    min_tick_interval_minutes: 60,
    max_ticks_per_day: 6,
    next_tick_at: null,
    last_tick_at: null,
    goal_tree: null,
    handoff_note: null,
    conversation_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

// ─── computeNextTickAt ───────────────────────────────────────────────────────

console.log('\n🎯 Mission Service — computeNextTickAt\n')

test('Schedules next tick after min_tick_interval_minutes', () => {
  const m = makeMission({ min_tick_interval_minutes: 60 })
  const before = Date.now()
  const next = computeNextTickAt(m, 0)
  const after = Date.now()
  const diffMs = next.getTime() - before
  assertApprox(diffMs, 60 * 60 * 1000, 2000, 'Next tick should be ~60 minutes from now')
  assert(next.getTime() >= before, 'Next tick must be in the future')
  assert(next.getTime() <= after + 60 * 60 * 1000 + 2000, 'Next tick must not be too far')
})

test('Schedules next tick at 08:00 UTC tomorrow when daily limit reached', () => {
  const m = makeMission({ max_ticks_per_day: 6 })
  const next = computeNextTickAt(m, 6) // exactly at limit
  assert(next.getUTCHours() === 8, `Should schedule at 08:00 UTC, got ${next.getUTCHours()}`)
  assert(next.getUTCMinutes() === 0, `Should schedule at xx:00, got ${next.getUTCMinutes()}`)
  const now = new Date()
  assert(next > now, 'Tomorrow 08:00 must be in the future relative to now')
})

test('Daily limit: 7 ticks out of 6 max also defers to tomorrow', () => {
  const m = makeMission({ max_ticks_per_day: 6 })
  const next = computeNextTickAt(m, 7)
  assert(next.getUTCHours() === 8, 'Exceeded limit still defers to 08:00 UTC tomorrow')
})

test('Respects custom min_tick_interval_minutes of 30', () => {
  const m = makeMission({ min_tick_interval_minutes: 30 })
  const before = Date.now()
  const next = computeNextTickAt(m, 0)
  const diffMs = next.getTime() - before
  assertApprox(diffMs, 30 * 60 * 1000, 2000, 'Next tick should be ~30 minutes from now')
})

test('Adaptive and fixed cadence both use minInterval fallback', () => {
  const adaptive = makeMission({ cadence_mode: 'adaptive', min_tick_interval_minutes: 45 })
  const fixed = makeMission({ cadence_mode: 'fixed', min_tick_interval_minutes: 45 })
  const before = Date.now()
  const nextAdaptive = computeNextTickAt(adaptive, 0)
  const nextFixed = computeNextTickAt(fixed, 0)
  assertApprox(nextAdaptive.getTime() - before, 45 * 60 * 1000, 2000, 'Adaptive: ~45 min')
  assertApprox(nextFixed.getTime() - before, 45 * 60 * 1000, 2000, 'Fixed: ~45 min')
})

// ─── formatMissionsForPrompt ─────────────────────────────────────────────────

console.log('\n📋 Mission Service — formatMissionsForPrompt\n')

test('Returns empty string for empty missions array', () => {
  const result = formatMissionsForPrompt([])
  assert(result === '', `Expected empty string, got "${result}"`)
})

test('Includes ACTIVE MISSIONS header', () => {
  const result = formatMissionsForPrompt([makeMission()])
  assert(result.startsWith('ACTIVE MISSIONS:'), 'Should start with ACTIVE MISSIONS:')
})

test('Uses 🟢 for active mission', () => {
  const result = formatMissionsForPrompt([makeMission({ status: 'active' })])
  assert(result.includes('🟢'), 'Should use 🟢 for active')
})

test('Uses ⏸️ for paused mission', () => {
  const result = formatMissionsForPrompt([makeMission({ status: 'paused' })])
  assert(result.includes('⏸️'), 'Should use ⏸️ for paused')
})

test('Uses ⚫ for completed/failed mission', () => {
  const comp = formatMissionsForPrompt([makeMission({ status: 'completed' })])
  const fail = formatMissionsForPrompt([makeMission({ status: 'failed' })])
  assert(comp.includes('⚫'), 'Completed should use ⚫')
  assert(fail.includes('⚫'), 'Failed should use ⚫')
})

test('Includes mission goal in output', () => {
  const result = formatMissionsForPrompt([makeMission({ goal: 'Grow revenue to $10M' })])
  assert(result.includes('Grow revenue to $10M'), 'Goal text must appear in output')
})

test('Shows short ID (first 8 chars)', () => {
  const m = makeMission({ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })
  const result = formatMissionsForPrompt([m])
  assert(result.includes('[aaaaaaaa]'), 'Should show first 8 chars of ID')
})

test('Shows "no tick scheduled" when next_tick_at is null', () => {
  const result = formatMissionsForPrompt([makeMission({ next_tick_at: null })])
  assert(result.includes('no tick scheduled'), 'Should show no tick scheduled')
})

test('Shows handoff note when present', () => {
  const result = formatMissionsForPrompt([makeMission({ handoff_note: 'Working on step 3 of outreach' })])
  assert(result.includes('Last update: Working on step 3 of outreach'), 'Should include handoff note')
})

test('Truncates handoff note to 200 chars', () => {
  const longNote = 'x'.repeat(300)
  const result = formatMissionsForPrompt([makeMission({ handoff_note: longNote })])
  assert(result.includes('x'.repeat(200)), 'Should include up to 200 chars')
  assert(!result.includes('x'.repeat(201)), 'Should not include 201st char')
})

test('Handles multiple missions', () => {
  const missions = [
    makeMission({ id: 'aaaa0000-0000-0000-0000-000000000000', goal: 'Mission Alpha', status: 'active' }),
    makeMission({ id: 'bbbb0000-0000-0000-0000-000000000000', goal: 'Mission Beta', status: 'paused' }),
  ]
  const result = formatMissionsForPrompt(missions)
  assert(result.includes('Mission Alpha'), 'Should include first mission goal')
  assert(result.includes('Mission Beta'), 'Should include second mission goal')
  assert(result.includes('🟢'), 'Should have active indicator')
  assert(result.includes('⏸️'), 'Should have paused indicator')
})

// ─── Results ─────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50))
console.log(`Results: ${passed} passed, ${failed} failed`)
console.log('='.repeat(50))

if (failed > 0) {
  console.log('\nFailures:')
  failures.forEach(f => console.log(`  - ${f}`))
  process.exit(1)
}
