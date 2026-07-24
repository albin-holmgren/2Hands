#!/usr/bin/env npx tsx

import {
  normalizeQueueMode,
  normalizeOverrideTaskDescription,
  getQueuedEventName,
  appendQueuedInstruction,
} from '../../src/app/api/agents/run/route'

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

console.log('\n🧭 Agents Run Route Helper Tests\n')

assert(normalizeQueueMode('collect') === 'collect', 'Keeps valid collect queue mode')
assert(normalizeQueueMode('followup') === 'followup', 'Keeps valid followup queue mode')
assert(normalizeQueueMode('steer') === 'steer', 'Keeps valid steer queue mode')
assert(normalizeQueueMode('steer-backlog') === 'steer-backlog', 'Keeps valid steer-backlog queue mode')
assert(normalizeQueueMode('unknown-mode') === 'collect', 'Falls back to collect on unknown queue mode')

assert(normalizeOverrideTaskDescription(' run it ') === '', 'Strips run-command-only override task descriptions')
assert(normalizeOverrideTaskDescription('Execute task now please') === '', 'Strips execute-command-only override task descriptions')
assert(normalizeOverrideTaskDescription('Find leads in stockholm') === 'Find leads in stockholm', 'Keeps meaningful override task descriptions')

assert(getQueuedEventName('collect') === 'assistant_collect', 'Maps collect to assistant_collect event')
assert(getQueuedEventName('followup') === 'assistant_followup', 'Maps followup to assistant_followup event')
assert(getQueuedEventName('steer') === 'assistant_steer', 'Maps steer to assistant_steer event')
assert(getQueuedEventName('steer-backlog') === 'assistant_steer', 'Maps steer-backlog to assistant_steer event')

const fullQueue = Array.from({ length: 50 }, (_, i) => ({
  id: `q-${i}`,
  created_at: '2026-01-01T00:00:00.000Z',
  mode: 'collect',
  content: `item-${i}`,
}))

const fullEvents = Array.from({ length: 200 }, (_, i) => ({
  timestamp: '2026-01-01T00:00:00.000Z',
  run_id: 'run-existing',
  kind: 'assistant',
  name: 'assistant_collect',
  event: `existing-${i}`,
}))

const { nextConfig } = appendQueuedInstruction(
  {
    run_queue: fullQueue,
    run_events: fullEvents,
  },
  {
    activeRunId: 'run-123',
    nowIso: '2026-01-02T00:00:00.000Z',
    queuedItemId: 'queued-new',
    mode: 'followup',
    content: 'New instruction',
  }
)

const nextQueue = (nextConfig.run_queue as Array<Record<string, unknown>>) || []
const nextEvents = (nextConfig.run_events as Array<Record<string, unknown>>) || []

assert(nextQueue.length === 50, 'Caps queued instruction backlog at 50 items')
assert(String(nextQueue[nextQueue.length - 1]?.id) === 'queued-new', 'Appends latest queued instruction')
assert(nextEvents.length === 200, 'Caps run events at 200 items')
assert(String(nextEvents[nextEvents.length - 1]?.name) === 'assistant_followup', 'Appends correct run event name for queued mode')

console.log('\n' + '='.repeat(50))
console.log(`Results: ${passed} passed, ${failed} failed`)
console.log('='.repeat(50))

if (failed > 0) {
  process.exit(1)
}

process.exit(0)
