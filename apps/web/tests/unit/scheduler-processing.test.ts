#!/usr/bin/env npx tsx

import { processClaimedAgent } from '../../src/app/api/agents/scheduler/route'

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

console.log('\n⚙️ Scheduler Processing Tests\n')

function createAdminClientStub() {
  return {
    from: () => ({
      update: () => ({
        eq: async () => ({})
      })
    })
  }
}

async function run() {
  {
    const result = await processClaimedAgent(
      { agent_id: 'agent-1', user_id: 'user-1', name: 'Agent One', config: { description: 'Task' } },
      {
        checkCreditsAdminFn: async () => ({ canRun: false, credits: 0 }),
        provisionAgentVMFn: async () => ({ vmId: 'vm-unused', vmIp: null }),
        enqueueAgentRunFn: async () => ({ success: true, runId: 'run-unused' }),
        createAdminClientFn: createAdminClientStub as never,
      }
    )

    assert(result.status === 'skipped', 'Returns skipped when user has insufficient credits')
    assert(result.reason === 'insufficient_credits', 'Returns insufficient_credits reason when credits are low')
  }

  {
    let enqueueCalled = false
    const result = await processClaimedAgent(
      { agent_id: 'agent-2', user_id: 'user-2', name: 'Agent Two', config: { description: 'Task' } },
      {
        checkCreditsAdminFn: async () => ({ canRun: true, credits: 100 }),
        provisionAgentVMFn: async () => ({ vmId: 'vm-2', vmIp: '1.2.3.4' }),
        enqueueAgentRunFn: async () => {
          enqueueCalled = true
          return { success: true, runId: 'run-2' }
        },
        createAdminClientFn: createAdminClientStub as never,
      }
    )

    assert(result.status === 'started', 'Returns started when VM provisioning succeeds')
    assert(result.vmId === 'vm-2', 'Returns VM id for started agent')
    assert(enqueueCalled, 'Enqueues run when VM IP is available')
  }

  {
    const result = await processClaimedAgent(
      { agent_id: 'agent-3', user_id: 'user-3', name: 'Agent Three', config: { description: 'Task' } },
      {
        checkCreditsAdminFn: async () => ({ canRun: true, credits: 100 }),
        provisionAgentVMFn: async () => {
          throw new Error('provision failed')
        },
        enqueueAgentRunFn: async () => ({ success: true, runId: 'run-3' }),
        createAdminClientFn: createAdminClientStub as never,
      }
    )

    assert(result.status === 'failed', 'Returns failed when processing throws')
    assert(result.error === 'provision failed', 'Returns processing error message on failure')
  }

  console.log('\n' + '='.repeat(50))
  console.log(`Results: ${passed} passed, ${failed} failed`)
  console.log('='.repeat(50))

  if (failed > 0) {
    process.exit(1)
  }

  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
