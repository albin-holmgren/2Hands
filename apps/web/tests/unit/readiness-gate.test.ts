#!/usr/bin/env npx tsx

import { evaluateBroadRolloutReadiness } from '../../src/lib/readiness/gate'

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

console.log('\n🚦 Readiness Gate Tests\n')

const ready = evaluateBroadRolloutReadiness({
  pilotWindowDays: 7,
  runSuccessRate: 0.92,
  retryRunawayCount: 0,
  p0Incidents: 0,
  p1Incidents: 0,
  securityCriticalFailures: 0,
  securityHighFailures: 0,
  minimumRunSampleReached: true,
  ciGreen: true,
  opsRunbookApproved: true,
})

assert(ready.readyForBroadRollout === true, 'Marks ready when all criteria pass')
assert(ready.failedCriteria.length === 0, 'Has no failed criteria when all signals pass')

const notReady = evaluateBroadRolloutReadiness({
  pilotWindowDays: 3,
  runSuccessRate: 0.8,
  retryRunawayCount: 2,
  p0Incidents: 1,
  p1Incidents: 0,
  securityCriticalFailures: 1,
  securityHighFailures: 0,
  minimumRunSampleReached: false,
  ciGreen: false,
  opsRunbookApproved: false,
})

assert(notReady.readyForBroadRollout === false, 'Marks not ready when one or more criteria fail')
assert(notReady.failedCriteria.includes('reliability'), 'Includes reliability in failed criteria')
assert(notReady.failedCriteria.includes('security'), 'Includes security in failed criteria')
assert(notReady.failedCriteria.includes('observability'), 'Includes observability in failed criteria')
assert(notReady.failedCriteria.includes('quality_gates'), 'Includes quality gates in failed criteria')
assert(notReady.failedCriteria.includes('operations'), 'Includes operations in failed criteria')

console.log('\n' + '='.repeat(50))
console.log(`Results: ${passed} passed, ${failed} failed`)
console.log('='.repeat(50))

if (failed > 0) {
  process.exit(1)
}

process.exit(0)
