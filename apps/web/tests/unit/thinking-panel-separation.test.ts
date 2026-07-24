#!/usr/bin/env npx tsx
/**
 * Regression tests for Think-panel source separation.
 *
 * Verifies that:
 * 1. progress_update events no longer feed thinkingContent in the client.
 * 2. Real thinking/thinking_start events still populate thinkingContent.
 * 3. Tool/API status strings are filtered out by JUNK_LINE in the formatter.
 * 4. route.ts enqueueProgressUpdate does NOT write into thinkingContentForDb.
 *
 * Run: npx tsx tests/unit/thinking-panel-separation.test.ts
 */

export {}

import * as fs from 'fs'
import * as path from 'path'

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

// ---------------------------------------------------------------------------
// Inline the JUNK_LINE filter from message-list.tsx for isolated unit testing
// ---------------------------------------------------------------------------

const JUNK_LINE =
  /^(Setting up integration|Testing .* connection[.…]*|Connecting[.…]*|Verifying[.…]*|Fetching[.…]*|Working on[.…]*|Working on agent:.*|Calling [\w\s]+ API[.…]*|Running:.*|Thinking[.…]*|Analyzing[.…]*|Processing[.…]*|Searching[.…]*|Browsing[.…]*|Analyzing (simple|medium|complex) query[.…]*)$/i

function isJunkLine(line: string): boolean {
  return JUNK_LINE.test(line.trim())
}

// ---------------------------------------------------------------------------
// Source reads
// ---------------------------------------------------------------------------

const routePath = path.resolve(__dirname, '../../src/app/api/chat/route.ts')
const pagePath  = path.resolve(__dirname, '../../src/app/(dashboard)/app/page.tsx')
const routeSource = fs.readFileSync(routePath, 'utf8')
const pageSource  = fs.readFileSync(pagePath, 'utf8')

// ---------------------------------------------------------------------------
// 1. JUNK_LINE filter behaviour
// ---------------------------------------------------------------------------

console.log('\nJUNK_LINE filter — operational lines should be filtered')

const junkLines = [
  'Calling attio API…',
  'Calling attio API...',
  'Calling Slack API…',
  'Running: integration_attio_create_record',
  'Running: web_search…',
  'Working on agent: Oscar…',
  'Testing attio connection…',
  'Testing stripe payment connection',
  'Connecting…',
  'Verifying...',
  'Fetching...',
  'Thinking...',
  'Analyzing...',
  'Processing...',
  'Searching...',
  'Browsing...',
  'Analyzing complex query...',
  'Analyzing simple query...',
]

junkLines.forEach(line => {
  test(`JUNK_LINE filters: "${line}"`, () => {
    assert(isJunkLine(line), `Expected "${line}" to be filtered as junk but it was not`)
  })
})

const nonJunkLines = [
  'The user wants to add a company to Attio',
  'I need to check the record exists before creating it',
  'Considering two approaches: direct API vs agent delegation',
  'Found 3 matching records in CRM',
]

nonJunkLines.forEach(line => {
  test(`JUNK_LINE passes through: "${line}"`, () => {
    assert(!isJunkLine(line), `Expected "${line}" to pass through but it was filtered as junk`)
  })
})

// ---------------------------------------------------------------------------
// 2. route.ts — enqueueProgressUpdate must NOT write to thinkingContentForDb
// ---------------------------------------------------------------------------

console.log('\nroute.ts — enqueueProgressUpdate must not touch thinkingContentForDb')

test('enqueueProgressUpdate body contains no thinkingContentForDb assignment', () => {
  // Locate the function body
  const fnStart = routeSource.indexOf('const enqueueProgressUpdate = (')
  assert(fnStart !== -1, 'enqueueProgressUpdate function not found in route.ts')
  // Find the closing brace of the function (next top-level }) after fnStart
  const fnEnd = routeSource.indexOf('\n        }', fnStart + 10)
  assert(fnEnd !== -1, 'Could not find end of enqueueProgressUpdate in route.ts')
  const fnBody = routeSource.slice(fnStart, fnEnd + 10)
  assert(
    !fnBody.includes('thinkingContentForDb'),
    'enqueueProgressUpdate still writes into thinkingContentForDb'
  )
})

test('route.ts has comment explaining progress_update must not feed thinkingContentForDb', () => {
  assert(
    routeSource.includes('must NOT be appended to thinkingContentForDb'),
    'Explanatory comment missing in enqueueProgressUpdate'
  )
})

// ---------------------------------------------------------------------------
// 3. page.tsx — progress_update handler must not write to thinkingContent
// ---------------------------------------------------------------------------

console.log('\npage.tsx — progress_update handler must not touch thinkingContent')

test('progress_update handler does not call setThinkingContent', () => {
  // Locate the progress_update branch in the SSE event loop
  const branchStart = pageSource.indexOf("parsed.type === 'progress_update'")
  assert(branchStart !== -1, "progress_update branch not found in page.tsx")
  // The branch ends at the next } else if — look for the next 'else if' after the branch
  const branchEnd = pageSource.indexOf('} else if (parsed.type === ', branchStart + 10)
  assert(branchEnd !== -1, 'Could not find end of progress_update branch in page.tsx')
  const branchBody = pageSource.slice(branchStart, branchEnd)
  assert(
    !branchBody.includes('setThinkingContent'),
    'progress_update branch still calls setThinkingContent'
  )
  assert(
    !branchBody.includes('allThinkingContentRef'),
    'progress_update branch still writes to allThinkingContentRef'
  )
  assert(
    !branchBody.includes('thinkingContentRef.current'),
    'progress_update branch still writes to thinkingContentRef'
  )
})

test('page.tsx has comment explaining progress_update must not feed thinkingContent', () => {
  assert(
    pageSource.includes('Do NOT feed into thinkingContent'),
    'Explanatory comment missing in page.tsx progress_update handler'
  )
})

// ---------------------------------------------------------------------------
// 4. thinking/thinking_start events still populate thinkingContent
// ---------------------------------------------------------------------------

console.log('\npage.tsx — real thinking events must still populate thinkingContent')

test('thinking_start event sets isThinking to true', () => {
  assert(
    pageSource.includes("parsed.type === 'thinking_start'") &&
    pageSource.includes('setIsThinking(true)'),
    'thinking_start no longer sets isThinking'
  )
})

test('thinking event appends to thinkingContent', () => {
  assert(
    pageSource.includes("parsed.type === 'thinking'") &&
    pageSource.includes('setThinkingContent(prev =>'),
    'thinking event no longer appends to thinkingContent'
  )
})

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
if (failures.length > 0) {
  console.log('\nFailed:')
  failures.forEach(f => console.log(`  • ${f}`))
  process.exit(1)
}
