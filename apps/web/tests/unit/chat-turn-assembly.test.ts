#!/usr/bin/env npx tsx
/**
 * Regression tests for chat turn text assembly.
 *
 * Verifies that multi-iteration narration blocks are joined with paragraph
 * breaks (\n\n) rather than raw concatenation, and that final cleanup
 * normalises excess blank lines and strips placeholder prefixes.
 *
 * Run: npx tsx tests/unit/chat-turn-assembly.test.ts
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

function assertEqual(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected:\n  ${JSON.stringify(expected)}\nGot:\n  ${JSON.stringify(actual)}`)
  }
}

// ---------------------------------------------------------------------------
// Inline helpers — mirrors route.ts logic so tests have no server-side deps
// ---------------------------------------------------------------------------

function appendIteration(accumulated: string, iterationText: string): string {
  if (!iterationText.trim()) return accumulated
  return accumulated.trim()
    ? accumulated.trimEnd() + '\n\n' + iterationText.trimStart()
    : iterationText
}

function composeFallback(preceding: string, msg: string): string {
  return preceding.trim()
    ? preceding.trimEnd() + '\n\n' + msg
    : msg
}

function cleanupFinal(text: string): string {
  return text
    .replace(/^(Thinking|Analyzing|Working|Processing)[.…\s]*/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ---------------------------------------------------------------------------
// appendIteration
// ---------------------------------------------------------------------------

console.log('\nchat turn assembly — appendIteration')

test('starts with first iteration when accumulated is empty', () => {
  assertEqual(appendIteration('', 'Running Oscar now.'), 'Running Oscar now.')
})

test('joins two iterations with a single blank line', () => {
  assertEqual(
    appendIteration('Running Oscar now.', 'Oscar is working.'),
    'Running Oscar now.\n\nOscar is working.'
  )
})

test('does NOT produce a run-on space-joined string', () => {
  const result = appendIteration('Let me check the agent IDs.', 'Let me run Oscar.')
  assert(!result.includes('Let me check the agent IDs.Let me run Oscar.'), 'joined without separator')
  assert(!result.includes('Let me check the agent IDs. Let me run Oscar.'), 'joined with space')
  assertEqual(result, 'Let me check the agent IDs.\n\nLet me run Oscar.')
})

test('trims trailing whitespace from accumulated before joining', () => {
  assertEqual(appendIteration('First block.  \n', 'Second block.'), 'First block.\n\nSecond block.')
})

test('trims leading whitespace from iterationText before joining', () => {
  assertEqual(appendIteration('First.', '\n\nSecond block.'), 'First.\n\nSecond block.')
})

test('skips whitespace-only iterations', () => {
  assertEqual(appendIteration('First.', '   \n  '), 'First.')
})

test('accumulates three iterations correctly', () => {
  let acc = ''
  acc = appendIteration(acc, 'A.')
  acc = appendIteration(acc, 'B.')
  acc = appendIteration(acc, 'C.')
  assertEqual(acc, 'A.\n\nB.\n\nC.')
})

// ---------------------------------------------------------------------------
// composeFallback
// ---------------------------------------------------------------------------

console.log('\nchat turn assembly — composeFallback')

test('returns fallback alone when no preceding narration', () => {
  assertEqual(composeFallback('', 'I can run that agent — just confirm.'), 'I can run that agent — just confirm.')
})

test('joins preceding narration and fallback with \\n\\n', () => {
  assertEqual(
    composeFallback('Let me get the agent list.', 'I can run that agent — just confirm.'),
    'Let me get the agent list.\n\nI can run that agent — just confirm.'
  )
})

test('does NOT space-concatenate', () => {
  const result = composeFallback('Preamble.', 'Fallback.')
  assert(!result.includes('Preamble. Fallback.'), 'space-joined instead of paragraph-separated')
})

// ---------------------------------------------------------------------------
// cleanupFinal
// ---------------------------------------------------------------------------

console.log('\nchat turn assembly — cleanupFinal')

test('strips leading Thinking placeholder', () => {
  const result = cleanupFinal('Thinking... Running Oscar now.')
  assert(!/^Thinking/i.test(result), 'Thinking prefix not stripped')
})

test('strips leading Analyzing placeholder', () => {
  const result = cleanupFinal('Analyzing… Let me run the agents.')
  assert(!/^Analyzing/i.test(result), 'Analyzing prefix not stripped')
})

test('collapses 3+ consecutive newlines to 2', () => {
  assertEqual(cleanupFinal('Block A.\n\n\n\nBlock B.'), 'Block A.\n\nBlock B.')
})

test('collapses 5 newlines to 2', () => {
  assertEqual(cleanupFinal('A.\n\n\n\n\nB.'), 'A.\n\nB.')
})

test('preserves exactly 2 newlines unchanged', () => {
  assertEqual(cleanupFinal('A.\n\nB.'), 'A.\n\nB.')
})

test('trims surrounding whitespace', () => {
  assertEqual(cleanupFinal('\n\nSome response.\n\n'), 'Some response.')
})

test('handles empty string', () => {
  assertEqual(cleanupFinal(''), '')
})

// ---------------------------------------------------------------------------
// Source-level checks: verify route.ts contains the required code patterns
// ---------------------------------------------------------------------------

console.log('\nsystem-prompt TOOL LOOP NARRATION rule')

const routePath = path.resolve(__dirname, '../../src/app/api/chat/route.ts')
const routeSource = fs.readFileSync(routePath, 'utf8')

test('route.ts system prompt contains TOOL LOOP NARRATION section', () => {
  assert(routeSource.includes('TOOL LOOP NARRATION'), 'TOOL LOOP NARRATION section missing')
  assert(routeSource.includes('NEVER REPEAT STATUS LINES'), 'NEVER REPEAT STATUS LINES missing')
  assert(routeSource.includes('do NOT emit a "Let me..."'), '"Let me..." rule missing')
})

test('route.ts uses \\n\\n separator in iteration join code', () => {
  assert(
    routeSource.includes("finalAssistantContentForDb.trimEnd() + '\\n\\n' + iterationContentForDb.trimStart()"),
    'trimEnd + \\n\\n + trimStart pattern not found in route.ts'
  )
})

test('route.ts final cleanup collapses excess newlines', () => {
  assert(
    routeSource.includes(".replace(/\\n{3,}/g, '\\n\\n')"),
    'excess-newline collapse regex not found in route.ts'
  )
})

test('route.ts no longer uses raw space-concatenation for fallback paths', () => {
  assert(
    !routeSource.includes("iterationContentForDb + ' ') + fallbackMsg"),
    'old space-concat pattern still present for fallbackMsg'
  )
  assert(
    !routeSource.includes("iterationContentForDb + ' ') + limitMsg"),
    'old space-concat pattern still present for limitMsg'
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
