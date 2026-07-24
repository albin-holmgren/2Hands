#!/usr/bin/env npx tsx

import {
  getHandoffRunId,
  findExistingRunHandoff,
  type TaskHandoff,
} from '../../src/lib/collaboration/task-handoff'

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

function makeHandoff(overrides: Partial<TaskHandoff>): TaskHandoff {
  return {
    id: 'handoff-1',
    source_agent_id: 'agent-a',
    source_agent_name: 'Agent A',
    user_id: 'user-1',
    reason: 'Need specialization',
    handoff_type: 'specialization',
    original_task: 'Do task',
    subtask_description: 'Do subtask',
    context_data: {},
    status: 'pending',
    priority: 'medium',
    ...overrides,
  }
}

console.log('\n🤝 Task Handoff Tests\n')

const runIdExtraction = getHandoffRunId(
  makeHandoff({ context_data: { run_id: ' run-123 ' } })
)
assert(runIdExtraction === 'run-123', 'Extracts and trims run_id from handoff context')

const noRunIdExtraction = getHandoffRunId(
  makeHandoff({ context_data: { run_id: 123 } as unknown as Record<string, unknown> })
)
assert(noRunIdExtraction === '', 'Returns empty run_id when context value is not a string')

const handoffs: TaskHandoff[] = [
  makeHandoff({ id: 'completed-run', status: 'completed', context_data: { run_id: 'run-abc' } }),
  makeHandoff({ id: 'different-agent', source_agent_id: 'agent-b', context_data: { run_id: 'run-abc' } }),
  makeHandoff({ id: 'accepted-run', status: 'accepted', context_data: { run_id: 'run-abc' } }),
]

const existingAccepted = findExistingRunHandoff(handoffs, 'agent-a', 'run-abc')
assert(existingAccepted?.id === 'accepted-run', 'Finds accepted handoff for matching source agent and run')

const missingForDifferentRun = findExistingRunHandoff(handoffs, 'agent-a', 'run-other')
assert(missingForDifferentRun === null, 'Returns null when no pending/accepted handoff matches run')

const emptyRunLookup = findExistingRunHandoff(handoffs, 'agent-a', '   ')
assert(emptyRunLookup === null, 'Returns null for empty run id lookup')

console.log('\n' + '='.repeat(50))
console.log(`Results: ${passed} passed, ${failed} failed`)
console.log('='.repeat(50))

if (failed > 0) {
  process.exit(1)
}

process.exit(0)
