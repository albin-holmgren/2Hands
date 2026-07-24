#!/usr/bin/env npx tsx

import { checkRateLimit, createRateLimitKey } from '../../src/lib/rate-limit'

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

console.log('\n🚦 Rate Limit Tests\n')

async function run() {
  const baseKey = createRateLimitKey('user-rate-limit-test', `endpoint-${Date.now()}`)
  const config = { limit: 2, windowSeconds: 60 }

  const first = await checkRateLimit(baseKey, config)
  assert(first.allowed, 'First request is allowed')
  assert(first.remaining === 1, 'First request decrements remaining to 1')

  const second = await checkRateLimit(baseKey, config)
  assert(second.allowed, 'Second request is allowed')
  assert(second.remaining === 0, 'Second request decrements remaining to 0')

  const third = await checkRateLimit(baseKey, config)
  assert(!third.allowed, 'Third request is rate limited')
  assert(third.resetAt >= second.resetAt, 'Reset time is stable across same window')

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
