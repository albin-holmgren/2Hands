#!/usr/bin/env npx tsx

import { resolveAvailableAtIso } from '../../src/lib/agents/run-queue'

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

console.log('\n📦 Run Queue Helper Tests\n')

async function run() {
  {
    const resolved = resolveAvailableAtIso()
    assert(Boolean(resolved.iso), 'Defaults availableAt to now when omitted')
    assert(!resolved.error, 'No error when availableAt is omitted')
  }

  {
    const input = '2026-02-16T10:00:00.000Z'
    const resolved = resolveAvailableAtIso(input)
    assert(resolved.iso === input, 'Keeps valid ISO datetime unchanged')
    assert(!resolved.error, 'No error for valid ISO datetime')
  }

  {
    const resolved = resolveAvailableAtIso('not-a-date')
    assert(Boolean(resolved.error), 'Returns error for invalid datetime')
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
