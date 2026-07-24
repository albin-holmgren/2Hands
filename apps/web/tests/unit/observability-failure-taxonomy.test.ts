#!/usr/bin/env npx tsx

import {
  classifyRunFailureReason,
  formatFailureReasonForMetrics,
} from '../../src/lib/proactive/observability'

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

console.log('\n📊 Observability Failure Taxonomy Tests\n')

assert(classifyRunFailureReason('Unauthorized request') === 'auth', 'Classifies auth failures')
assert(classifyRunFailureReason('Too many requests from client') === 'rate_limit', 'Classifies rate limit failures')
assert(classifyRunFailureReason('Request timed out while running') === 'timeout', 'Classifies timeout failures')
assert(classifyRunFailureReason('DNS connection error') === 'network', 'Classifies network failures')
assert(classifyRunFailureReason('Permission denied for action') === 'permission', 'Classifies permission failures')
assert(classifyRunFailureReason('Invalid payload required field missing') === 'validation', 'Classifies validation failures')
assert(classifyRunFailureReason('VM not available for this run') === 'resource', 'Classifies resource failures')
assert(classifyRunFailureReason('something unexpected') === 'unknown', 'Classifies unknown failures')

const formatted = formatFailureReasonForMetrics('  Too   many   requests  ')
assert(formatted === '[rate_limit] Too many requests', 'Formats and prefixes failure reason with taxonomy category')

const noReason = formatFailureReasonForMetrics('   ')
assert(typeof noReason === 'undefined', 'Returns undefined for blank failure reason')

console.log('\n' + '='.repeat(50))
console.log(`Results: ${passed} passed, ${failed} failed`)
console.log('='.repeat(50))

if (failed > 0) {
  process.exit(1)
}

process.exit(0)
