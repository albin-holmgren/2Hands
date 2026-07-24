#!/usr/bin/env npx tsx
/**
 * Execute-First Lead-Finding Regression Tests
 *
 * Verifies that:
 * 1. classifyExecution() routes bounded lead-finding to direct_execute (not background_agent)
 * 2. Recurring lead-finding requests are NOT classified as direct_execute (leave them for compile_operation)
 * 3. Large/unbounded requests go to background_agent
 * 4. The system prompt contains the required BOUNDED LEAD-FINDING rule
 * 5. The system prompt contains the "Find 5 leads" direct-execute example
 * 6. The execute-first intercept is wired in chat/route.ts
 *
 * Run: npx tsx tests/unit/execute-first-lead-finding.test.ts
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

import { classifyExecution } from '../../src/lib/execution/execute-first-policy'

// ─── 1. Bounded lead-finding → direct_execute ────────────────────────────────

console.log('\n=== 1. Bounded lead-finding → direct_execute ===')

test('"find 5 leads" → direct_execute', () => {
  const r = classifyExecution({ taskDescription: 'find 5 leads' })
  assert(r.mode === 'direct_execute', `mode=${r.mode} (expected direct_execute)`)
  assert(r.canProceedImmediately, 'should proceed immediately')
})

test('"add 10 leads" → direct_execute', () => {
  const r = classifyExecution({ taskDescription: 'add 10 leads' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
})

test('"find me 8 companies" → direct_execute', () => {
  const r = classifyExecution({ taskDescription: 'find me 8 companies' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
})

test('"find 5 leads and add them to Attio" → direct_execute', () => {
  const r = classifyExecution({ taskDescription: 'find 5 leads and add them to Attio' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
})

test('"add 10 companies to the pipeline" → direct_execute', () => {
  const r = classifyExecution({ taskDescription: 'add 10 companies to the pipeline' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
})

test('"get me 3 contacts" → direct_execute', () => {
  const r = classifyExecution({ taskDescription: 'get me 3 contacts' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
})

test('"source 15 prospects" → direct_execute', () => {
  const r = classifyExecution({ taskDescription: 'source 15 prospects' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
})

test('"find leads" (no count) → direct_execute', () => {
  const r = classifyExecution({ taskDescription: 'find leads' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
})

test('"add leads" (no count) → direct_execute', () => {
  const r = classifyExecution({ taskDescription: 'add leads' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
})

test('"find some leads" → direct_execute', () => {
  const r = classifyExecution({ taskDescription: 'find some leads' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
})

test('"get contacts" → direct_execute', () => {
  const r = classifyExecution({ taskDescription: 'get contacts for these companies' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
})

// ─── 2. Recurring → recurring_operation (must go through compile_operation) ──

console.log('\n=== 2. Recurring lead-finding → recurring_operation ===')

test('"find 10 leads per day" → recurring_operation', () => {
  const r = classifyExecution({ taskDescription: 'find 10 leads per day and add to Attio' })
  assert(r.mode === 'recurring_operation', `mode=${r.mode} (expected recurring_operation)`)
  assert(r.canProceedImmediately, 'should be allowed to proceed to compile_operation')
})

test('"find 5 leads daily" → recurring_operation (overrides bounded count)', () => {
  const r = classifyExecution({ taskDescription: 'find 5 leads daily' })
  assert(r.mode === 'recurring_operation', `mode=${r.mode} — scheduling keyword overrides small count`)
})

test('"monitor leads weekly" → recurring_operation', () => {
  const r = classifyExecution({ taskDescription: 'monitor leads weekly and update pipeline' })
  assert(r.mode === 'recurring_operation', `mode=${r.mode} (recurring monitor should be recurring_operation)`)
})

test('"add 10 leads every morning" → recurring_operation', () => {
  const r = classifyExecution({ taskDescription: 'add 10 leads every morning to Attio' })
  assert(r.mode === 'recurring_operation', `mode=${r.mode}`)
})

// ─── 3. Large / unbounded → background_agent (deploy immediately) ───────────

console.log('\n=== 3. Large/unbounded → background_agent (immediate, no confirmation) ===')

test('"find 50 leads" → background_agent (threshold)', () => {
  const r = classifyExecution({ taskDescription: 'find 50 leads from LinkedIn' })
  assert(r.mode === 'background_agent', `mode=${r.mode} (50 leads should be background)`)
})

test('"find 100 companies" → background_agent', () => {
  const r = classifyExecution({ taskDescription: 'find 100 companies in Europe' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

test('"find 1000 leads" → background_agent (deploy immediately, no confirmation)', () => {
  const r = classifyExecution({ taskDescription: 'find 1000 leads' })
  assert(r.mode === 'background_agent', `mode=${r.mode} — 1000 leads must be background_agent`)
  assert(r.canProceedImmediately, 'background_agent should be allowed to proceed without confirmation')
})

test('"scrape leads from LinkedIn" → background_agent', () => {
  const r = classifyExecution({ taskDescription: 'scrape leads from LinkedIn' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

// ─── 4. Dangerous actions → needs_confirmation ───────────────────────────────

console.log('\n=== 4. Dangerous actions still require confirmation ===')

test('"delete all my deals" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'delete all my deals', isDestructive: true })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('send_payment action → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'send payment', actionType: 'send_payment' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

// ─── 5. System prompt content checks ─────────────────────────────────────────

console.log('\n=== 5. System prompt content ===')

const fs = require('fs')
const path = require('path')
const routeSource: string = fs.readFileSync(
  path.resolve(__dirname, '../../src/app/api/chat/route.ts'),
  'utf8'
)

test('prompt contains BOUNDED LEAD-FINDING rule section', () => {
  assert(routeSource.includes('BOUNDED LEAD-FINDING'), 'Missing BOUNDED LEAD-FINDING section')
})

test('prompt explicitly says NO AGENT, NO CONFIRMATION for bounded lead-finding', () => {
  assert(routeSource.includes('DO NOT create an agent, DO NOT ask for confirmation'), 'Missing no-agent/no-confirm instruction')
})

test('prompt names the bug: "I can create that agent — just confirm"', () => {
  assert(routeSource.includes('I can create that agent'), 'Missing explicit bug identification')
  assert(routeSource.includes('That is the bug'), 'Missing "That is the bug" labeling')
})

test('prompt contains "Find 5 leads" example with inline execution steps', () => {
  assert(routeSource.includes('"Find 5 leads"'), 'Missing "Find 5 leads" example')
  assert(routeSource.includes('NO AGENT CREATED. NO CONFIRMATION ASKED'), 'Missing "NO AGENT CREATED. NO CONFIRMATION ASKED" in example')
})

test('prompt contains "Find 10 leads per day" as the ONLY recurring agent case', () => {
  assert(routeSource.includes('"Find 10 leads per day and add to Attio"'), 'Missing recurring agent case example')
  assert(routeSource.includes('ONLY case where "find N leads" routes through an agent'), 'Missing ONLY case clarification')
})

test('prompt PLAN-FIRST GATE has bounded lead-finding exception', () => {
  assert(routeSource.includes('BOUNDED LEAD-FINDING EXCEPTION'), 'Missing BOUNDED LEAD-FINDING EXCEPTION in PLAN-FIRST GATE')
  assert(routeSource.includes('bypass ALL gates below'), 'Missing bypass instruction in PLAN-FIRST GATE')
})

test('prompt WHEN PLANNING IS NOT REQUIRED includes bounded lead-finding', () => {
  assert(
    routeSource.includes('Bounded lead-finding') && routeSource.includes('execute directly'),
    'WHEN PLANNING IS NOT REQUIRED should list bounded lead-finding as direct'
  )
})

test('prompt ONE-SHOT rule has exception for bounded lead-finding', () => {
  assert(
    routeSource.includes('EXCEPTION') && routeSource.includes('do NOT use create_agent for bounded lead-finding'),
    'ONE-SHOT rule should have bounded lead-finding exception'
  )
})

test('prompt recurring lead-finding example routes through compile_operation', () => {
  assert(
    routeSource.includes('compile_operation') && routeSource.includes('cadence: daily'),
    'Recurring lead-finding example should use compile_operation'
  )
})

// ─── 6. Wiring: execute-first intercept in chat/route.ts ─────────────────────

console.log('\n=== 6. Code-level wiring ===')

test('chat/route.ts has EXECUTE-FIRST INTERCEPT comment block', () => {
  assert(routeSource.includes('EXECUTE-FIRST INTERCEPT'), 'Missing EXECUTE-FIRST INTERCEPT code block')
})

test('intercept imports classifyExecution from execute-first-policy', () => {
  assert(routeSource.includes('classifyExecution:'), 'Missing classifyExecution import in intercept')
  assert(routeSource.includes('execute-first-policy'), 'Missing execute-first-policy import path')
})

test('intercept has scheduling guard to preserve recurring agent path', () => {
  assert(routeSource.includes('_hasSchedule'), 'Missing _hasSchedule guard')
  assert(routeSource.includes('daily|weekly|per day'), 'Missing scheduling keyword patterns in guard')
})

test('intercept returns EXECUTE-FIRST POLICY correction to model', () => {
  assert(routeSource.includes('EXECUTE-FIRST POLICY:'), 'Missing EXECUTE-FIRST POLICY correction message')
  assert(routeSource.includes('Do NOT create an agent'), 'Correction should tell model not to create agent')
})

test('intercept continues the tool loop (does not break/end stream)', () => {
  assert(
    routeSource.includes('Continue the loop') || routeSource.includes('Continue the loop — model will now execute directly'),
    'Intercept should continue the loop comment'
  )
})

test('execute-first-policy.ts DIRECT_EXECUTION_PATTERNS has generic bounded-count pattern (1-25, any domain)', () => {
  const policySource: string = fs.readFileSync(
    path.resolve(__dirname, '../../src/lib/execution/execute-first-policy.ts'),
    'utf8'
  )
  assert(
    policySource.includes('[1-9]|1\\d|2[0-5]') || policySource.includes('[1-9]|1\\\\d|2[0-5]'),
    'Policy should have generic bounded count range patterns (1-25 threshold)'
  )
})

test('execute-first-policy.ts BACKGROUND_AGENT_PATTERNS uses 26+ threshold (above direct-execute ceiling)', () => {
  const policySource: string = fs.readFileSync(
    path.resolve(__dirname, '../../src/lib/execution/execute-first-policy.ts'),
    'utf8'
  )
  assert(
    policySource.includes('\\d{2,}'),
    'Background threshold should cover 26+ items (any 2-digit or higher count above the direct-execute ceiling)'
  )
})

// ─── 7. Dangerous action confirmation gate ────────────────────────────────────

console.log('\n=== 7. Dangerous action confirmation gate ===')

test('execute-first-policy.ts exports DESTRUCTIVE_TEXT_PATTERNS', () => {
  const policySource: string = fs.readFileSync(
    path.resolve(__dirname, '../../src/lib/execution/execute-first-policy.ts'),
    'utf8'
  )
  assert(policySource.includes('export const DESTRUCTIVE_TEXT_PATTERNS'), 'Should export DESTRUCTIVE_TEXT_PATTERNS')
  assert(policySource.includes('delete\\s+all'), 'Should include delete all pattern')
})

test('execute-first-policy.ts exports RECURRING_TEXT_PATTERNS', () => {
  const policySource: string = fs.readFileSync(
    path.resolve(__dirname, '../../src/lib/execution/execute-first-policy.ts'),
    'utf8'
  )
  assert(policySource.includes('export const RECURRING_TEXT_PATTERNS'), 'Should export RECURRING_TEXT_PATTERNS')
  assert(policySource.includes('per\\s+(day|week'), 'Should include per day/week recurring pattern')
})

test('chat/route.ts has PRE-FLIGHT DESTRUCTIVE GUARD', () => {
  assert(routeSource.includes('PRE-FLIGHT DESTRUCTIVE GUARD'), 'Missing PRE-FLIGHT DESTRUCTIVE GUARD')
  assert(routeSource.includes('setPendingConfirmation'), 'Should call setPendingConfirmation for destructive requests')
  assert(routeSource.includes('destructive_action'), 'Should use destructive_action confirmation type')
})

test('chat/route.ts destructive guard blocks before model loop', () => {
  assert(
    routeSource.includes('_preClassification.mode === \'needs_confirmation\''),
    'Guard should check needs_confirmation before model loop'
  )
  assert(routeSource.includes('Heads up — this is a destructive action'), 'Guard should surface confirmation prompt')
})

test('chat/route.ts clears pending destructive confirmation when user affirms', () => {
  assert(routeSource.includes('_isAlreadyConfirmingDestructive'), 'Should track whether already confirming')
  assert(routeSource.includes('clearPendingConfirmation(user.id)'), 'Should clear confirmation after affirmation')
})

// ─── 8. Scheduled agents: no immediate first run ─────────────────────────────

console.log('\n=== 8. Scheduled agents: no immediate first run ===')

test('chat/route.ts sets runImmediately = false for scheduled agents', () => {
  assert(
    routeSource.includes('runImmediately = false') &&
    routeSource.includes('Recurring agents run on their schedule'),
    'Scheduled agents must NOT run immediately on creation'
  )
})

test('chat/route.ts scheduled agent status text says "scheduled" not "starting now"', () => {
  assert(
    routeSource.includes('is scheduled and will start its first run at'),
    'Status text should say agent is scheduled, not starting now'
  )
})

// ─── 9. Large-task narration backstop ────────────────────────────────────────

console.log('\n=== 9. Large-task narration backstop ===')

test('chat/route.ts has LARGE-TASK NARRATION BACKSTOP', () => {
  assert(routeSource.includes('LARGE-TASK NARRATION BACKSTOP'), 'Missing LARGE-TASK NARRATION BACKSTOP')
})

test('chat/route.ts backstop detects agent-deployment narration without real tool call', () => {
  assert(
    routeSource.includes('LARGE_TASK_NARRATION_RE'),
    'Should have regex to detect narrated agent deployment without real create_agent call'
  )
})

test('chat/route.ts backstop forces create_agent for large tasks', () => {
  assert(
    routeSource.includes('you MUST call create_agent now'),
    'Backstop should force create_agent for large tasks that were only narrated'
  )
})

test('chat/route.ts prompt contains LARGE LEAD-FINDING section for >25 records', () => {
  assert(
    routeSource.includes('LARGE LEAD-FINDING (>25 records)'),
    'Prompt should have explicit section for large lead requests routing to background agent'
  )
  assert(
    routeSource.includes('Do NOT call web_search directly for large requests'),
    'Prompt should say not to use web_search for large lead requests'
  )
})

// ─── 10. Recurring intercept + large-task guardrail skip ─────────────────────

console.log('\n=== 10. Recurring intercept + large-task guardrail skip ===')

test('execute-first-policy.ts exports recurring_operation mode', () => {
  const policySource: string = fs.readFileSync(
    path.resolve(__dirname, '../../src/lib/execution/execute-first-policy.ts'),
    'utf8'
  )
  assert(policySource.includes("'recurring_operation'"), 'ExecutionMode should include recurring_operation')
  assert(policySource.includes("mode: 'recurring_operation'"), 'classifyExecution should return recurring_operation for recurring tasks')
})

test('chat/route.ts has RECURRING INTERCEPT block', () => {
  assert(routeSource.includes('RECURRING INTERCEPT'), 'Missing RECURRING INTERCEPT block in chat/route.ts')
})

test('chat/route.ts recurring intercept blocks create_agent and forces compile_operation', () => {
  assert(
    routeSource.includes("reason: 'RECURRING POLICY:"),
    'RECURRING INTERCEPT should return a RECURRING POLICY correction to the model'
  )
  assert(
    routeSource.includes('compile_operation with action="compile"'),
    'RECURRING INTERCEPT correction must direct model to call compile_operation'
  )
})

test('chat/route.ts recurring intercept checks both recurring_operation mode and _hasSchedule', () => {
  assert(
    routeSource.includes("_cls.mode === 'recurring_operation'"),
    'Intercept should check recurring_operation classification mode'
  )
  assert(
    routeSource.includes('_hasSchedule && _cls.mode !== \'direct_execute\''),
    'Intercept should also check _hasSchedule as a fallback guard'
  )
})

test('chat/route.ts has BACKGROUND POLICY / GUARDRAIL SKIP for large tasks', () => {
  assert(routeSource.includes('BACKGROUND POLICY'), 'Missing BACKGROUND POLICY log for large task approval')
  assert(routeSource.includes('GUARDRAIL SKIP'), 'Missing GUARDRAIL SKIP log')
})

test('chat/route.ts sensitiveTools is empty when policy-approved background agent', () => {
  assert(
    routeSource.includes('_policyApprovedBackground && toolCall.name === \'create_agent\''),
    'Guardrail should check _policyApprovedBackground before enforcing confirmation'
  )
  assert(
    routeSource.includes('? [] // empty = no confirmation for large background tasks'),
    'sensitiveTools should be empty (skip confirmation) for policy-approved background tasks'
  )
})

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(55)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failures.length > 0) {
  console.log('\nFailures:')
  failures.forEach(f => console.log(`  ✗ ${f}`))
}
process.exit(failed > 0 ? 1 : 0)
