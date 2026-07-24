#!/usr/bin/env npx tsx

import { decideAutoRetryFromInputs } from '../../src/lib/agents/auto-retry'

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

console.log('\n🔁 Auto Retry Decision Tests\n')

const nonRetryable = decideAutoRetryFromInputs('login_failed', 'bad credentials', 0, 0)
assert(nonRetryable.shouldRetry === false, 'Non-retryable error type does not retry')
assert(nonRetryable.escalate === true, 'Non-retryable error escalates')

const firstRetry = decideAutoRetryFromInputs('network_error', 'temporary network issue', 0, 0)
assert(firstRetry.shouldRetry === true, 'Retryable network error retries on first attempt')
assert(firstRetry.retryCount === 1, 'Retry count increments for first retry')
assert(firstRetry.delayMs === 5000, 'First network retry uses base backoff delay')

const secondRetry = decideAutoRetryFromInputs('network_error', 'temporary network issue', 1, 0)
assert(secondRetry.shouldRetry === true, 'Retryable network error retries on second attempt')
assert(secondRetry.delayMs === 10000, 'Second network retry applies exponential backoff')

const maxRetriesReached = decideAutoRetryFromInputs('network_error', 'still failing', 3, 0)
assert(maxRetriesReached.shouldRetry === false, 'Stops retrying at max retries')
assert(maxRetriesReached.escalate === true, 'Escalates when max retries reached')

const tooManyDailyFailures = decideAutoRetryFromInputs('network_error', 'still failing', 1, 5)
assert(tooManyDailyFailures.shouldRetry === false, 'Stops retrying after daily failure threshold')
assert(tooManyDailyFailures.escalate === true, 'Escalates when daily failure threshold is reached')

console.log('\n' + '='.repeat(50))
console.log(`Results: ${passed} passed, ${failed} failed`)
console.log('='.repeat(50))

if (failed > 0) {
  process.exit(1)
}

process.exit(0)
