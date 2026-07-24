#!/usr/bin/env npx tsx

import { buildRuntimeReadinessReportFromRows, percentile } from '../../src/lib/proactive/runtime-readiness-report'

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

console.log('\n📈 Runtime Readiness Report Tests\n')

assert(percentile([], 95) === 0, 'Percentile returns 0 for empty values')
assert(percentile([100, 200, 300, 400, 500], 95) === 500, 'Percentile returns expected p95 value')

const report = buildRuntimeReadinessReportFromRows(
  [
    { status: 'completed', started_at: '2026-01-01T10:00:00.000Z', completed_at: '2026-01-01T10:00:10.000Z', failure_reason: null },
    { status: 'failed', started_at: '2026-01-01T11:00:00.000Z', completed_at: '2026-01-01T11:00:30.000Z', failure_reason: '[network] DNS error' },
    { status: 'timeout', started_at: '2026-01-01T12:00:00.000Z', completed_at: '2026-01-01T12:00:20.000Z', failure_reason: '[timeout] Timed out' },
  ],
  [
    { was_retried: true, retry_succeeded: false },
    { was_retried: true, retry_succeeded: true },
    { was_retried: false, retry_succeeded: null },
  ],
  7
)

assert(report.totalRuns === 3, 'Report computes total runs')
assert(report.successRate > 0.3 && report.successRate < 0.34, 'Report computes success rate')
assert(report.failureRate > 0.66 && report.failureRate < 0.67, 'Report computes failure rate')
assert(report.retryExhaustedCount === 1, 'Report computes retry exhausted count')
assert(report.topFailureReasons.length === 2, 'Report keeps top failure reasons')
assert(report.p95DurationMs === 30000, 'Report computes p95 duration from run durations')

console.log('\n' + '='.repeat(50))
console.log(`Results: ${passed} passed, ${failed} failed`)
console.log('='.repeat(50))

if (failed > 0) {
  process.exit(1)
}

process.exit(0)
