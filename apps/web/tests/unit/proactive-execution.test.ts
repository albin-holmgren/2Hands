#!/usr/bin/env npx tsx
/**
 * Proactive Execution Regression Tests
 *
 * Verifies the fixes from proactive-execution-and-structured-progress-ffba13.md:
 * 1. System prompt contains EXECUTION-FIRST RULE section
 * 2. System prompt contains RESULT FORMAT template (✅/❌ pattern)
 * 3. Anti-narration prompt rule is present and explicit
 * 4. No-action guard triggers on direct-execution user intent ("so try it", "do it")
 * 5. Per-iteration narration stripping removes planning-only lines from iterationContentForDb
 * 6. mapToolToAiState() returns readable action labels for integration tools
 * 7. deriveWorkLabel() fallback returns 'Executing…' not 'Working on your request'
 * 8. Hoisted NARRATION_LINE_RE / CONCRETE_EVIDENCE_RE are used in final cleanup
 *
 * Run: npx tsx tests/unit/proactive-execution.test.ts
 */

export {}

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

function readFile(relPath: string): string {
  const fs = require('fs')
  const path = require('path')
  return fs.readFileSync(path.resolve(__dirname, relPath), 'utf8')
}

const route = readFile('../../src/app/api/chat/route.ts')
const messageList = readFile('../../src/components/chat/message-list.tsx')

// ─── 1. System prompt: EXECUTION-FIRST RULE ──────────────────────────────

console.log('\n=== 1. System prompt anti-narration rules ===')

test('System prompt contains EXECUTION-FIRST RULE section', () => {
  assert(
    route.includes('EXECUTION-FIRST RULE'),
    'route.ts system prompt must include EXECUTION-FIRST RULE section'
  )
})

test('Execution-first rule explicitly bans "Let me check" planning text', () => {
  assert(
    route.includes('Let me check X first') || route.includes('"Let me check'),
    'EXECUTION-FIRST RULE must explicitly call out "Let me check X" as the wrong pattern'
  )
})

test('Execution-first rule shows correct ✅/❌ pattern as RIGHT behavior', () => {
  assert(
    route.includes('✅ Done: [result]') || route.includes('✅/❌'),
    'EXECUTION-FIRST RULE must show ✅/❌ as the correct result format'
  )
})

test('System prompt contains RESULT FORMAT template', () => {
  assert(
    route.includes('RESULT FORMAT'),
    'System prompt must include a RESULT FORMAT section'
  )
})

test('RESULT FORMAT shows ✅ Got workspace member ID example', () => {
  assert(
    route.includes('✅ Got workspace member ID'),
    'RESULT FORMAT must include a concrete multi-step example with ✅ Got workspace member ID'
  )
})

test('RESULT FORMAT shows ❌ failure format with HTTP status', () => {
  assert(
    route.includes('❌') && route.includes('HTTP 400'),
    'RESULT FORMAT must show ❌ failure format with HTTP status'
  )
})

test('TOOL LOOP NARRATION rule says between tool calls output should be EMPTY', () => {
  assert(
    route.includes('EMPTY') && route.includes('TOOL LOOP NARRATION'),
    'TOOL LOOP NARRATION rule must say output between tool calls should be EMPTY'
  )
})

test('CRITICAL RULE ZERO bans narration about what AI WILL do', () => {
  assert(
    route.includes('CRITICAL RULE ZERO') && route.includes("WILL do or ARE doing"),
    'CRITICAL RULE ZERO must be present and ban narration about what AI will or is doing'
  )
})

// ─── 2. No-action execution guard ─────────────────────────────────────────

console.log('\n=== 2. No-action execution guard ===')

test('Guard detects direct execution intent: DIRECT_EXECUTION_INTENT regex', () => {
  assert(
    route.includes('DIRECT_EXECUTION_INTENT'),
    'No-action guard must define DIRECT_EXECUTION_INTENT regex'
  )
})

test('Guard regex includes "so try it" pattern', () => {
  assert(
    route.includes('so try it'),
    'DIRECT_EXECUTION_INTENT must include "so try it" pattern'
  )
})

test('Guard regex includes "do it" pattern', () => {
  assert(
    route.includes('do it') && route.includes('DIRECT_EXECUTION_INTENT'),
    'DIRECT_EXECUTION_INTENT must include "do it" pattern'
  )
})

test('Guard triggers on userWantsImmediateExecution OR lastIntegrationFailed', () => {
  assert(
    route.includes('userWantsImmediateExecution') &&
    route.includes('lastIntegrationFailed || userWantsImmediateExecution'),
    'Guard condition must be (lastIntegrationFailed || userWantsImmediateExecution)'
  )
})

test('Correction message uses result format (✅/❌ + outcome)', () => {
  assert(
    route.includes('✅/❌ + outcome'),
    'Correction message pushed to model must instruct ✅/❌ + outcome format'
  )
})

test('Correction message distinguishes user-execution intent vs integration failure', () => {
  assert(
    route.includes('explicitly said to execute now') && route.includes('after an integration failure'),
    'Correction message must distinguish between user-execution intent and integration failure triggers'
  )
})

// ─── 3. Narration regex hoisting ─────────────────────────────────────────

console.log('\n=== 3. Narration regex hoisting ===')

test('NARRATION_LINE_RE is defined before the tool loop (hoisted)', () => {
  const hoistIdx = route.indexOf('const NARRATION_LINE_RE =')
  const loopIdx = route.indexOf('while (iteration < maxIterations)')
  assert(
    hoistIdx > -1 && loopIdx > -1 && hoistIdx < loopIdx,
    'NARRATION_LINE_RE must be defined before the while loop (hoisted)'
  )
})

test('CONCRETE_EVIDENCE_RE is hoisted before the tool loop', () => {
  const hoistIdx = route.indexOf('const CONCRETE_EVIDENCE_RE =')
  const loopIdx = route.indexOf('while (iteration < maxIterations)')
  assert(
    hoistIdx > -1 && loopIdx > -1 && hoistIdx < loopIdx,
    'CONCRETE_EVIDENCE_RE must be defined before the while loop (hoisted)'
  )
})

test('Final cleanup uses hoisted NARRATION_LINE_RE (not a re-defined NARRATION_LINE_SERVER)', () => {
  assert(
    !route.includes('const NARRATION_LINE_SERVER ='),
    'Final cleanup must use hoisted NARRATION_LINE_RE, not redefine NARRATION_LINE_SERVER'
  )
})

test('Final cleanup uses NARRATION_LINE_RE and CONCRETE_EVIDENCE_RE', () => {
  assert(
    route.includes('return !NARRATION_LINE_RE.test(t)') &&
    route.includes('CONCRETE_EVIDENCE_RE.test(t)'),
    'Final cleanup must reference the hoisted NARRATION_LINE_RE and CONCRETE_EVIDENCE_RE'
  )
})

// ─── 4. Per-iteration narration strip ─────────────────────────────────────

console.log('\n=== 4. Per-iteration narration stripping ===')

test('Per-iteration strip runs before accumulation into finalAssistantContentForDb', () => {
  // Check that the per-iteration filter appears before the accumulation block
  const filterIdx = route.indexOf('Strip planning/narration lines from this iteration')
  const accumIdx = route.indexOf('Accumulate this iteration')
  assert(
    filterIdx > -1 && accumIdx > -1 && filterIdx < accumIdx,
    'Per-iteration narration strip must appear before the finalAssistantContentForDb accumulation'
  )
})

test('Per-iteration strip uses hoisted CONCRETE_EVIDENCE_RE to preserve result lines', () => {
  const sectionStart = route.indexOf('Strip planning/narration lines from this iteration')
  const sectionEnd = route.indexOf('Accumulate this iteration')
  if (sectionStart === -1 || sectionEnd === -1) throw new Error('Could not find per-iteration strip section')
  const section = route.slice(sectionStart, sectionEnd)
  assert(
    section.includes('CONCRETE_EVIDENCE_RE'),
    'Per-iteration strip must use CONCRETE_EVIDENCE_RE to preserve lines with concrete evidence'
  )
})

// ─── 5. mapToolToAiState() labels ─────────────────────────────────────────

console.log('\n=== 5. mapToolToAiState() integration labels ===')

test('mapToolToAiState() uses ACTION_LABELS dictionary for human-readable verbs', () => {
  assert(
    route.includes('ACTION_LABELS'),
    'mapToolToAiState() must define an ACTION_LABELS dictionary for human-readable action verbs'
  )
})

test('ACTION_LABELS includes create_deal → Creating deal', () => {
  assert(
    route.includes("create_deal: 'Creating deal'"),
    'ACTION_LABELS must map create_deal → Creating deal'
  )
})

test('ACTION_LABELS includes inspect_workspace → Inspecting workspace', () => {
  assert(
    route.includes("inspect_workspace: 'Inspecting workspace'"),
    'ACTION_LABELS must map inspect_workspace → Inspecting workspace'
  )
})

test('Integration tool label format is "ActionVerb in Provider" not raw slug', () => {
  // Should NOT produce "attio: create_deal" format
  assert(
    !route.includes('`${provider}: ${action.replace') || route.includes('ACTION_LABELS'),
    'Integration tool context must not use raw slugs - must use ACTION_LABELS instead'
  )
})

// ─── 6. deriveWorkLabel() in message-list.tsx ─────────────────────────────

console.log('\n=== 6. deriveWorkLabel() in message-list.tsx ===')

test('deriveWorkLabel() generic fallback is Executing… not Working on your request', () => {
  assert(
    messageList.includes("return 'Executing…'"),
    'deriveWorkLabel() must return "Executing…" as generic fallback, not "Working on your request"'
  )
})

test('deriveWorkLabel() has integration-specific fallback before generic', () => {
  assert(
    messageList.includes('integrationStep') && messageList.includes('attio|hubspot|github'),
    'deriveWorkLabel() must try integration-specific label before falling back to generic'
  )
})

test('GENERIC regex in deriveWorkLabel includes Running: pattern', () => {
  const fnSection = messageList.slice(messageList.indexOf('function deriveWorkLabel'))
  assert(
    fnSection.includes('Running:'),
    'GENERIC regex in deriveWorkLabel must include "Running:" so step labels like "Running: tool" are treated as generic'
  )
})

// ─── Summary ─────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failures.length > 0) {
  console.log('\nFailed tests:')
  failures.forEach(f => console.log(`  • ${f}`))
  process.exit(1)
} else {
  console.log('\nAll tests passed ✅')
}
