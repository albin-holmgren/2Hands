#!/usr/bin/env npx tsx
/**
 * Execute-First Policy Regression Tests
 *
 * Verifies the runtime policy module introduced in execute-first-runtime-hardening-b2ef54.md:
 * 1. classifyExecution — correct mode for integration tools, agent tasks, dangerous actions
 * 2. diagnoseIntegrationError — structured diagnosis for known error patterns
 * 3. formatProgressStep / formatRunSummary — consistent step phrasing
 * 4. Confirm _diagnosis enrichment exists in chat/route.ts
 *
 * Run: npx tsx tests/unit/execute-first-policy.test.ts
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

// ─── Import the module under test ────────────────────────────────────────────

import {
  classifyExecution,
  diagnoseIntegrationError,
  formatProgressStep,
  formatRunSummary,
  DESTRUCTIVE_TEXT_PATTERNS,
  RECURRING_TEXT_PATTERNS,
} from '../../src/lib/execution/execute-first-policy'

// ─── 1. classifyExecution ─────────────────────────────────────────────────────

console.log('\n=== 1. classifyExecution: integration tools ===')

test('integration_attio_create_deal → direct_execute, safe', () => {
  const r = classifyExecution({ taskDescription: 'create a deal', actionType: 'integration_attio_create_deal' })
  assert(r.mode === 'direct_execute', `mode should be direct_execute, got ${r.mode}`)
  assert(r.risk === 'safe', `risk should be safe, got ${r.risk}`)
  assert(r.canProceedImmediately, 'should be able to proceed immediately')
})

test('integration_call → direct_execute, safe', () => {
  const r = classifyExecution({ taskDescription: 'list deals', actionType: 'integration_call' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
  assert(r.risk === 'safe', `risk=${r.risk}`)
})

test('github_list_repos → direct_execute, safe', () => {
  const r = classifyExecution({ taskDescription: 'list my repos', actionType: 'github_list_repos' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
  assert(r.risk === 'safe', `risk=${r.risk}`)
})

test('integration_hubspot_create_company → direct_execute, safe', () => {
  const r = classifyExecution({ taskDescription: 'create company in HubSpot', actionType: 'integration_hubspot_create_company' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
  assert(r.canProceedImmediately, 'should proceed immediately')
})

console.log('\n=== 1b. classifyExecution: description patterns ===')

test('"create a company in Attio" → direct_execute by description', () => {
  const r = classifyExecution({ taskDescription: 'create a company in Attio' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
})

test('"add a deal to the pipeline" → direct_execute by description', () => {
  const r = classifyExecution({ taskDescription: 'add a deal to the pipeline' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
})

test('"verify the Attio connection" → direct_execute by description', () => {
  const r = classifyExecution({ taskDescription: 'verify the Attio connection' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
})

test('"find 25 leads and research them" → direct_execute (≤25 bounded threshold)', () => {
  const r = classifyExecution({ taskDescription: 'find 25 leads and research them for outreach' })
  assert(r.mode === 'direct_execute', `mode=${r.mode} — 25 is within the ≤25 bounded direct-execute threshold`)
})

test('"scrape 50 company websites" → background_agent', () => {
  const r = classifyExecution({ taskDescription: 'scrape 50 company websites and extract contact details' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

console.log('\n=== 1c. classifyExecution: dangerous actions ===')

test('send_payment → needs_confirmation, approval_required', () => {
  const r = classifyExecution({ taskDescription: 'send $100', actionType: 'send_payment' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
  assert(r.risk === 'approval_required', `risk=${r.risk}`)
  assert(!r.canProceedImmediately, 'should not proceed immediately')
})

test('delete_data → needs_confirmation, approval_required', () => {
  const r = classifyExecution({ taskDescription: 'wipe all records', actionType: 'delete_data' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
  assert(r.risk === 'approval_required', `risk=${r.risk}`)
})

test('post_public → needs_confirmation, approval_required', () => {
  const r = classifyExecution({ taskDescription: 'publish to LinkedIn', actionType: 'post_public' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('isFinancial=true flag → needs_confirmation regardless of actionType', () => {
  const r = classifyExecution({ taskDescription: 'pay invoice', actionType: 'integration_stripe_pay', isFinancial: true })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('isDestructive=true flag → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'delete all contacts', isDestructive: true })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

console.log('\n=== 1c2. classifyExecution: text-based destructive detection (no explicit flags) ===')

test('"delete all deals" text → needs_confirmation via DESTRUCTIVE_TEXT_PATTERNS', () => {
  const r = classifyExecution({ taskDescription: 'delete all deals' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode} — "delete all deals" must require confirmation`)
  assert(r.risk === 'approval_required', `risk=${r.risk}`)
  assert(!r.canProceedImmediately, 'should not proceed immediately')
})

test('"delete all contacts" text → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'delete all contacts' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"remove all companies" text → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'remove all companies' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"delete everything in the pipeline" text → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'delete everything in the pipeline' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"delete records" text → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'delete records' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"spend $500 on ads" text → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'spend $500 on ads' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

console.log('\n=== 1c3. classifyExecution: RECURRING_TEXT_PATTERNS ===')

test('"find 10 leads per day" → recurring_operation (not direct, not background_agent)', () => {
  const r = classifyExecution({ taskDescription: 'find 10 leads per day and add to Attio' })
  assert(r.mode === 'recurring_operation', `mode=${r.mode} — recurring should be recurring_operation`)
})

test('"find leads daily" → recurring_operation', () => {
  const r = classifyExecution({ taskDescription: 'find leads daily' })
  assert(r.mode === 'recurring_operation', `mode=${r.mode}`)
})

test('"add 5 leads every morning" → recurring_operation', () => {
  const r = classifyExecution({ taskDescription: 'add 5 leads every morning' })
  assert(r.mode === 'recurring_operation', `mode=${r.mode}`)
})

test('"find 5 leads" (no schedule) → still direct_execute', () => {
  const r = classifyExecution({ taskDescription: 'find 5 leads' })
  assert(r.mode === 'direct_execute', `mode=${r.mode} — bounded one-shot should still be direct`)
})

console.log('\n=== 1d. classifyExecution: safe read-only actions ===')

test('screenshot → direct_execute, safe, immediate', () => {
  const r = classifyExecution({ taskDescription: 'take a screenshot', actionType: 'screenshot' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
  assert(r.risk === 'safe', `risk=${r.risk}`)
  assert(r.canProceedImmediately, 'should proceed immediately')
})

test('search → direct_execute, safe', () => {
  const r = classifyExecution({ taskDescription: 'search for companies', actionType: 'search' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
  assert(r.risk === 'safe', `risk=${r.risk}`)
})

// ─── 2. diagnoseIntegrationError ─────────────────────────────────────────────

console.log('\n=== 2. diagnoseIntegrationError: known error patterns ===')

test('singular slug error → retry with inspect_workspace fix', () => {
  const d = diagnoseIntegrationError('HTTP 400: plural slug required, "company" should be "companies"')
  assert(d.shouldRetry, 'should retry')
  assert(!d.isTerminal, 'should not be terminal')
  assert(d.fix.includes('inspect_workspace') || d.fix.includes('slug'), `fix should mention inspect_workspace or slug, got: ${d.fix}`)
})

test('HTTP 400 validation error → retry with field fix', () => {
  const d = diagnoseIntegrationError('HTTP 400: Bad Request: Missing required field')
  assert(d.shouldRetry, 'should retry')
  assert(!d.isTerminal, 'should not be terminal')
  assert(d.cause.includes('400') || d.cause.includes('invalid') || d.cause.includes('missing'), `cause should mention 400/invalid/missing, got: ${d.cause}`)
})

test('invalid stage name → retry with inspect_workspace or get_deal_stages', () => {
  const d = diagnoseIntegrationError('unknown stage: "Leads" is not a valid status')
  assert(d.shouldRetry, 'should retry')
  assert(d.fix.toLowerCase().includes('stage') || d.fix.toLowerCase().includes('inspect'), `fix should mention stage or inspect, got: ${d.fix}`)
})

test('record not found 404 → retry with valid record ID', () => {
  const d = diagnoseIntegrationError('HTTP 404: Record not found')
  assert(d.shouldRetry, 'should retry')
  assert(d.fix.toLowerCase().includes('record') || d.fix.toLowerCase().includes('id'), `fix should mention record/id, got: ${d.fix}`)
})

test('401 unauthorized → terminal, no retry', () => {
  const d = diagnoseIntegrationError('HTTP 401: Unauthorized — invalid API key')
  assert(!d.shouldRetry, 'should NOT retry (terminal auth failure)')
  assert(d.isTerminal, 'should be terminal')
  assert(d.fix.toLowerCase().includes('reconnect') || d.fix.toLowerCase().includes('integration') || d.fix.toLowerCase().includes('api key'), `fix should suggest reconnecting, got: ${d.fix}`)
})

test('403 forbidden → terminal, no retry', () => {
  const d = diagnoseIntegrationError('HTTP 403: Forbidden')
  assert(!d.shouldRetry, 'should NOT retry')
  assert(d.isTerminal, 'should be terminal')
})

test('rate limit 429 → retry', () => {
  const d = diagnoseIntegrationError('HTTP 429: Too Many Requests — rate limit exceeded')
  assert(d.shouldRetry, 'should retry after rate limit')
  assert(!d.isTerminal, 'should not be terminal')
})

test('network timeout → retry', () => {
  const d = diagnoseIntegrationError('ETIMEDOUT: connection timed out')
  assert(d.shouldRetry, 'should retry on timeout')
  assert(!d.isTerminal, 'should not be terminal')
})

test('500 server error → retry', () => {
  const d = diagnoseIntegrationError('HTTP 500: Internal Server Error')
  assert(d.shouldRetry, 'should retry on 500')
})

test('unknown error → retry once, not terminal', () => {
  const d = diagnoseIntegrationError('something went wrong unexpectedly')
  assert(d.shouldRetry, 'unknown error should still attempt retry')
  assert(!d.isTerminal, 'unknown should not be terminal')
})

test('terminal diagnosis instruction starts with STOP', () => {
  const d = diagnoseIntegrationError('HTTP 401: Unauthorized')
  const { diagnoseIntegrationError: diag } = require('../../src/lib/execution/execute-first-policy')
  // The instruction field used by chat/route.ts
  const instruction = d.isTerminal
    ? `STOP: ${d.fix}. Report this to the user and do not retry.`
    : `RETRY NOW: ${d.fix}. Apply the fix immediately in the next tool call.`
  assert(instruction.startsWith('STOP:'), `Terminal instruction should start with STOP:, got: ${instruction}`)
})

test('retryable diagnosis instruction starts with RETRY NOW', () => {
  const d = diagnoseIntegrationError('HTTP 400: Bad Request')
  const instruction = d.isTerminal
    ? `STOP: ${d.fix}. Report this to the user and do not retry.`
    : `RETRY NOW: ${d.fix}. Apply the fix immediately in the next tool call.`
  assert(instruction.startsWith('RETRY NOW:'), `Retryable instruction should start with RETRY NOW:, got: ${instruction}`)
})

// ─── 3. formatProgressStep ───────────────────────────────────────────────────

console.log('\n=== 3. formatProgressStep ===')

test('running step uses 🔍 prefix', () => {
  const s = formatProgressStep({ index: 1, total: 3, label: 'Searching leads', status: 'running' })
  assert(s.includes('🔍'), `Should use 🔍 for running, got: ${s}`)
  assert(s.includes('1/3'), `Should include 1/3, got: ${s}`)
  assert(s.includes('Searching leads'), `Should include label, got: ${s}`)
})

test('done step uses ✅ prefix', () => {
  const s = formatProgressStep({ index: 2, total: 3, label: 'Created deal', status: 'done', detail: 'record_id=abc123' })
  assert(s.includes('✅'), `Should use ✅ for done, got: ${s}`)
  assert(s.includes('record_id=abc123'), `Should include detail, got: ${s}`)
})

test('failed step uses ❌ prefix', () => {
  const s = formatProgressStep({ index: 2, total: 3, label: 'Create company', status: 'failed', detail: 'HTTP 400' })
  assert(s.includes('❌'), `Should use ❌ for failed, got: ${s}`)
  assert(s.includes('HTTP 400'), `Should include detail, got: ${s}`)
})

test('blocked step uses ⚠️ prefix', () => {
  const s = formatProgressStep({ index: 2, total: 3, label: 'Send email', status: 'blocked' })
  assert(s.includes('⚠️'), `Should use ⚠️ for blocked, got: ${s}`)
})

test('retrying step uses 🔄 prefix', () => {
  const s = formatProgressStep({ index: 2, total: 3, label: 'Create deal', status: 'retrying', detail: 'fixing slug' })
  assert(s.includes('🔄'), `Should use 🔄 for retrying, got: ${s}`)
  assert(s.includes('fixing slug'), `Should include detail, got: ${s}`)
})

test('step without detail omits the dash separator', () => {
  const s = formatProgressStep({ index: 1, total: 4, label: 'Init', status: 'running' })
  assert(!s.includes('—'), `Should not include dash when no detail, got: ${s}`)
})

// ─── 4. formatRunSummary ─────────────────────────────────────────────────────

console.log('\n=== 4. formatRunSummary ===')

test('all success summary', () => {
  const s = formatRunSummary({ done: 10, failed: 0, total: 10, entity: 'deal' })
  assert(s.includes('10/10'), `Should include 10/10, got: ${s}`)
  assert(s.includes('deals'), `Should use plural, got: ${s}`)
  assert(!s.includes('failed'), `Should not mention failed when 0, got: ${s}`)
})

test('partial failure summary', () => {
  const s = formatRunSummary({ done: 8, failed: 2, total: 10, entity: 'company' })
  assert(s.includes('8/10'), `Should include 8/10, got: ${s}`)
  assert(s.includes('2 failed'), `Should include "2 failed", got: ${s}`)
})

test('singular entity uses singular form', () => {
  const s = formatRunSummary({ done: 1, failed: 0, total: 1, entity: 'deal' })
  assert(s.includes('deal') && !s.includes('deals'), `Should use singular "deal", got: ${s}`)
})

test('summary starts with 📊', () => {
  const s = formatRunSummary({ done: 5, failed: 1, total: 6, entity: 'lead' })
  assert(s.startsWith('📊'), `Should start with 📊, got: ${s}`)
})

// ─── 5. Integration with chat/route.ts ────────────────────────────────────────

console.log('\n=== 5. chat/route.ts wiring ===')

const fs = require('fs')
const path = require('path')
const routeSource: string = fs.readFileSync(
  path.resolve(__dirname, '../../src/app/api/chat/route.ts'),
  'utf8'
)

test('chat/route.ts imports diagnoseIntegrationError from execute-first-policy', () => {
  assert(
    routeSource.includes('diagnoseIntegrationError') && routeSource.includes('execute-first-policy'),
    'Should import diagnoseIntegrationError from execute-first-policy'
  )
})

test('chat/route.ts injects _diagnosis field on integration tool failures', () => {
  assert(routeSource.includes('_diagnosis'), 'Should inject _diagnosis into failed tool results')
})

test('chat/route.ts _diagnosis includes RETRY NOW instruction for retryable errors', () => {
  assert(routeSource.includes('RETRY NOW:'), 'Should include RETRY NOW instruction')
})

test('chat/route.ts _diagnosis includes STOP instruction for terminal errors', () => {
  assert(routeSource.includes('STOP:'), 'Should include STOP instruction for terminal errors')
})

test('chat/route.ts _diagnosis instruction says NOT to narrate', () => {
  assert(routeSource.includes('Do NOT narrate'), 'Should instruct the model not to narrate')
})

// ─── 6. Generic task routing (non-lead domains) ───────────────────────────────
//
// These tests prove that routing works by TASK CHARACTERISTICS, not by CRM/lead
// nouns. The same five categories apply regardless of domain.

console.log('\n=== 6a. Generic bounded tasks → direct_execute ===')

test('"summarize 3 articles about AI" → direct_execute (bounded count, any domain)', () => {
  const r = classifyExecution({ taskDescription: 'summarize 3 articles about AI' })
  assert(r.mode === 'direct_execute', `mode=${r.mode} — bounded count should be direct`)
})

test('"create 5 GitHub issues" → direct_execute (bounded count)', () => {
  const r = classifyExecution({ taskDescription: 'create 5 GitHub issues for the sprint' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
})

test('"fix 8 bugs" → direct_execute', () => {
  const r = classifyExecution({ taskDescription: 'fix 8 bugs in the backlog' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
})

test('"review 10 pull requests" → direct_execute', () => {
  const r = classifyExecution({ taskDescription: 'review 10 pull requests' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
})

test('"add a ticket" → direct_execute (single write)', () => {
  const r = classifyExecution({ taskDescription: 'add a ticket for the payment bug' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
})

test('"create a branch" → direct_execute (single write)', () => {
  const r = classifyExecution({ taskDescription: 'create a branch called feature/onboarding' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
})

console.log('\n=== 6b. Generic recurring tasks → recurring_operation ===')

test('"check website daily" → recurring_operation', () => {
  const r = classifyExecution({ taskDescription: 'check website daily for downtime' })
  assert(r.mode === 'recurring_operation', `mode=${r.mode}`)
})

test('"backup database weekly" → recurring_operation', () => {
  const r = classifyExecution({ taskDescription: 'backup database weekly' })
  assert(r.mode === 'recurring_operation', `mode=${r.mode}`)
})

test('"post tweet every morning" → recurring_operation', () => {
  const r = classifyExecution({ taskDescription: 'post tweet every morning at 9 AM' })
  assert(r.mode === 'recurring_operation', `mode=${r.mode}`)
})

test('"send report every Monday" → recurring_operation', () => {
  const r = classifyExecution({ taskDescription: 'send performance report every Monday morning' })
  assert(r.mode === 'recurring_operation', `mode=${r.mode}`)
})

test('"monitor competitors weekly" → recurring_operation', () => {
  const r = classifyExecution({ taskDescription: 'monitor competitor pricing weekly' })
  assert(r.mode === 'recurring_operation', `mode=${r.mode}`)
})

console.log('\n=== 6c. Generic destructive / approval tasks → needs_confirmation ===')

test('"delete all files" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'delete all files from the project' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
  assert(r.risk === 'approval_required', `risk=${r.risk}`)
})

test('"remove all users" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'remove all users from the workspace' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"wipe database" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'wipe the entire database' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"drop the users table" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'drop the users table' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"buy software for $500" → needs_confirmation (financial)', () => {
  const r = classifyExecution({ taskDescription: 'buy software for $500' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
  assert(r.risk === 'approval_required', `risk=${r.risk}`)
})

test('"transfer $200 to vendor" → needs_confirmation (financial)', () => {
  const r = classifyExecution({ taskDescription: 'transfer $200 to vendor account' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"blast email to all subscribers" → needs_confirmation (broadcast)', () => {
  const r = classifyExecution({ taskDescription: 'blast email to all subscribers' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

console.log('\n=== 6d. Generic large / unbounded tasks → background_agent ===')

test('"analyze 10000 customer records" → background_agent (large batch)', () => {
  const r = classifyExecution({ taskDescription: 'analyze 10000 customer records for churn patterns' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
  assert(r.canProceedImmediately, 'should proceed immediately without confirmation')
})

test('"process 500 invoices" → background_agent', () => {
  const r = classifyExecution({ taskDescription: 'process 500 invoices from last quarter' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

test('"scrape entire website" → background_agent (browser-heavy)', () => {
  const r = classifyExecution({ taskDescription: 'scrape entire website for all product pages' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

test('"crawl competitor site" → background_agent (browser-heavy)', () => {
  const r = classifyExecution({ taskDescription: 'crawl competitor site and extract all pricing' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

test('"deep dive analysis of market" → background_agent (complex research)', () => {
  const r = classifyExecution({ taskDescription: 'deep dive analysis of the European SaaS market' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

test('"comprehensive audit of entire codebase" → background_agent', () => {
  const r = classifyExecution({ taskDescription: 'comprehensive audit of entire codebase for security issues' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

test('"generate 100 blog posts" → background_agent (large batch)', () => {
  const r = classifyExecution({ taskDescription: 'generate 100 blog posts about our product features' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

console.log('\n=== 6e. Boundary cases — do NOT over-route to confirmation or background ===')

test('"find 5 articles" is NOT needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'find 5 articles about TypeScript' })
  assert(r.mode !== 'needs_confirmation', `Should NOT need confirmation, mode=${r.mode}`)
})

test('"check the pipeline" is NOT background_agent', () => {
  const r = classifyExecution({ taskDescription: 'check the pipeline status' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
})

test('"find 26 leads" tips into background_agent (just above 25 threshold)', () => {
  const r = classifyExecution({ taskDescription: 'find 26 leads from startups in Sweden' })
  assert(r.mode !== 'direct_execute', `26 is above the ≤25 direct-execute threshold, mode=${r.mode}`)
})

// ─── 7. OpenClaw regression — safety gaps ────────────────────────────────────
//
// Tests that correspond to the 6 failing cases OpenClaw identified during QA.
// All assertions reference the real DESTRUCTIVE_TEXT_PATTERNS /
// BACKGROUND_AGENT_PATTERNS constants so they break if the patterns are removed.

console.log('\n=== 7a. Email-to-team safety (needs_confirmation) ===')

test('"Send email to team" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'Send email to team' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode} — direct team email must require confirmation`)
  assert(r.risk === 'approval_required', `risk=${r.risk}`)
})

test('"Send an email to the team" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'Send an email to the team about the new release' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"Send email to all customers" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'Send email to all customers about the update' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"Send email to all staff" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'Send email to all staff about the meeting' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"write a follow-up email to 3 prospects" → NOT needs_confirmation (targeted, not broadcast)', () => {
  const r = classifyExecution({ taskDescription: 'write a follow-up email to 3 prospects' })
  assert(r.mode !== 'needs_confirmation', `Should NOT need confirmation for personal targeted emails, mode=${r.mode}`)
})

console.log('\n=== 7b. Subscription / recurring purchase safety (needs_confirmation) ===')

test('"Subscribe to Pro plan for $99/month" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'Subscribe to Pro plan for $99/month' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode} — subscription commitment must require confirmation`)
  assert(r.risk === 'approval_required', `risk=${r.risk}`)
})

test('"Sign up for the Business plan" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'Sign up for the Business plan' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"$50/month plan" → needs_confirmation (recurring price indicator)', () => {
  const r = classifyExecution({ taskDescription: 'Upgrade to the $50/month subscription' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"subscribe to the newsletter" alone is NOT confirmation-required (not a financial commitment)', () => {
  const r = classifyExecution({ taskDescription: 'subscribe to the newsletter' })
  // "newsletter" doesn't contain plan/subscription/membership/tier, so it should NOT trigger
  assert(r.mode !== 'needs_confirmation', `Newsletter subscribe should not require confirmation, mode=${r.mode}`)
})

console.log('\n=== 7c. Research ambiguity → background_agent ===')

test('"Research market deeply" → background_agent (depth qualifier, no count)', () => {
  const r = classifyExecution({ taskDescription: 'Research market deeply' })
  assert(r.mode === 'background_agent', `mode=${r.mode} — depth qualifier with no count must route to agent`)
})

test('"Analyze the competition in depth" → background_agent', () => {
  const r = classifyExecution({ taskDescription: 'Analyze the competition in depth' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

test('"Thoroughly investigate the SaaS sector" → background_agent', () => {
  const r = classifyExecution({ taskDescription: 'Thoroughly investigate the SaaS sector' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

test('"Research the market" → background_agent (open-ended market research)', () => {
  const r = classifyExecution({ taskDescription: 'Research the market for our new product' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

test('"Analyze competition" → background_agent (open-ended)', () => {
  const r = classifyExecution({ taskDescription: 'Analyze competition in the CRM space' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

test('"Comprehensive research report" → background_agent', () => {
  const r = classifyExecution({ taskDescription: 'Comprehensive research report on enterprise buyers' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

console.log('\n=== 7d. Count + intensive verb → background_agent ===')

test('"Research 50 companies in depth" → background_agent', () => {
  const r = classifyExecution({ taskDescription: 'Research 50 companies in depth' })
  assert(r.mode === 'background_agent', `mode=${r.mode} — intensive verb + large count must route to agent`)
})

test('"Investigate 30 competitors" → background_agent', () => {
  const r = classifyExecution({ taskDescription: 'Investigate 30 competitors in our space' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

test('"Audit 100 records" → background_agent', () => {
  const r = classifyExecution({ taskDescription: 'Audit 100 records for compliance' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

console.log('\n=== 7e. Large simple batches → background_agent ===')

test('"Archive 100 old emails" → background_agent (large simple batch)', () => {
  const r = classifyExecution({ taskDescription: 'Archive 100 old emails' })
  assert(r.mode === 'background_agent', `mode=${r.mode} — 100-item batch must route to agent`)
})

test('"Migrate 200 records" → background_agent', () => {
  const r = classifyExecution({ taskDescription: 'Migrate 200 records to the new system' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

test('"Export 500 contacts" → background_agent', () => {
  const r = classifyExecution({ taskDescription: 'Export 500 contacts to CSV' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

console.log('\n=== 7f. Negative controls — bounded tasks still direct_execute ===')

test('"Find 5 leads" unchanged → direct_execute', () => {
  const r = classifyExecution({ taskDescription: 'Find 5 leads' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
})

test('"Create a deal in Attio" unchanged → direct_execute', () => {
  const r = classifyExecution({ taskDescription: 'Create a deal in Attio' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
})

test('"Review 10 pull requests" unchanged → direct_execute', () => {
  const r = classifyExecution({ taskDescription: 'Review 10 pull requests' })
  assert(r.mode === 'direct_execute', `mode=${r.mode}`)
})

test('"send me a report" does NOT trigger email-group confirmation', () => {
  const r = classifyExecution({ taskDescription: 'send me a report on the pipeline' })
  assert(r.mode !== 'needs_confirmation', `"send me" should not be confused with group email, mode=${r.mode}`)
})

test('"research 5 companies" (small count) → direct_execute (below intensive threshold)', () => {
  const r = classifyExecution({ taskDescription: 'research 5 companies for my pitch' })
  assert(r.mode === 'direct_execute', `mode=${r.mode} — single-digit research count should still be direct`)
})

// ─── 8. Advanced routing fixes (OpenClaw advanced test findings) ─────────────
//
// Covers schedule detection, public publishing safety, personalized outreach,
// large content-creation tasks, and high-count lead qualifiers.

console.log('\n=== 8a. Schedule / follow-up detection → recurring_operation ===')

test('"Schedule a follow-up" → recurring_operation', () => {
  const r = classifyExecution({ taskDescription: 'Schedule a follow-up' })
  assert(r.mode === 'recurring_operation', `mode=${r.mode} — schedule follow-up must route to recurring_operation`)
})

test('"Schedule follow-up in 3 days" → recurring_operation', () => {
  const r = classifyExecution({ taskDescription: 'Schedule follow-up in 3 days' })
  assert(r.mode === 'recurring_operation', `mode=${r.mode}`)
})

test('"Follow up in 2 weeks" → recurring_operation', () => {
  const r = classifyExecution({ taskDescription: 'Follow up in 2 weeks with the prospect' })
  assert(r.mode === 'recurring_operation', `mode=${r.mode}`)
})

test('"Remind me in 3 days" → recurring_operation', () => {
  const r = classifyExecution({ taskDescription: 'Remind me in 3 days to check on this deal' })
  assert(r.mode === 'recurring_operation', `mode=${r.mode}`)
})

test('"Create a follow-up task" (no time qualifier) → NOT recurring (just create)', () => {
  const r = classifyExecution({ taskDescription: 'Create a follow-up task for John' })
  // "Create a task" is a bounded direct action; no time qualifier present
  assert(r.mode !== 'recurring_operation', `"create a follow-up task" without time qualifier should not be recurring, mode=${r.mode}`)
})

console.log('\n=== 8b. Public posting / publishing safety → needs_confirmation ===')

test('"Publish to blog" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'Publish to blog' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode} — publishing to blog must require confirmation`)
  assert(r.risk === 'approval_required', `risk=${r.risk}`)
})

test('"Post on LinkedIn" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'Post on LinkedIn' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"Share on Twitter" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'Share on Twitter' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"Publish it on LinkedIn" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'Write a post about our product launch and publish it on LinkedIn' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"Post to the blog" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'Post to the blog' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"Create a draft blog post" → NOT confirmation (drafting, not publishing)', () => {
  const r = classifyExecution({ taskDescription: 'Create a draft blog post about our product' })
  assert(r.mode !== 'needs_confirmation', `Drafting should not require confirmation, mode=${r.mode}`)
})

console.log('\n=== 8c. Personalized outreach email safety → needs_confirmation ===')

test('"Draft personalized outreach emails" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'Draft personalized outreach emails' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode} — outreach email prep must require confirmation`)
})

test('"Prepare outreach emails for the leads" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'Prepare outreach emails for the leads' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"Create personalized outreach campaign" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'Create personalized outreach campaign for our prospects' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"Write a follow-up email to John" → NOT confirmation (single targeted email)', () => {
  const r = classifyExecution({ taskDescription: 'Write a follow-up email to John about his order' })
  assert(r.mode !== 'needs_confirmation', `Single targeted email should not require confirmation, mode=${r.mode}`)
})

console.log('\n=== 8d. Large content-creation tasks → background_agent ===')

test('"Write 1500 word article" → background_agent', () => {
  const r = classifyExecution({ taskDescription: 'Write 1500 word article about our product' })
  assert(r.mode === 'background_agent', `mode=${r.mode} — 1500 word task must route to agent`)
})

test('"Write a 2000-word blog post" → background_agent', () => {
  const r = classifyExecution({ taskDescription: 'Write a 2000-word blog post about AI trends' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

test('"Write 500 word summary" → background_agent (≥500 words)', () => {
  const r = classifyExecution({ taskDescription: 'Write 500 word summary of the meeting' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

test('"Write a comprehensive guide" → background_agent', () => {
  const r = classifyExecution({ taskDescription: 'Write a comprehensive guide to our onboarding process' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

test('"Write a detailed whitepaper" → background_agent', () => {
  const r = classifyExecution({ taskDescription: 'Write a detailed whitepaper on enterprise security' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

test('"Create long-form content" → background_agent', () => {
  const r = classifyExecution({ taskDescription: 'Create long-form content for the website' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

test('"Write a short bio" → NOT background_agent (no large count/qualifier)', () => {
  const r = classifyExecution({ taskDescription: 'Write a short bio for the website' })
  assert(r.mode !== 'background_agent', `Short writing should not be background, mode=${r.mode}`)
})

console.log('\n=== 8e. High-count lead qualifiers → background_agent ===')

test('"Find enterprise leads (500+)" → background_agent', () => {
  const r = classifyExecution({ taskDescription: 'Find enterprise leads (500+) in the US market' })
  assert(r.mode === 'background_agent', `mode=${r.mode} — (500+) qualifier must route to agent`)
})

test('"Contacts (1000+)" → background_agent', () => {
  const r = classifyExecution({ taskDescription: 'Pull contacts (1000+) from the CRM export' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

test('"Hundreds of leads" → background_agent', () => {
  const r = classifyExecution({ taskDescription: 'Find hundreds of leads in the European market' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

test('"Thousands of prospects" → background_agent', () => {
  const r = classifyExecution({ taskDescription: 'We need thousands of prospects for the campaign' })
  assert(r.mode === 'background_agent', `mode=${r.mode}`)
})

// ── Intentional design decision: 10-lead threshold ──────────────────────────
// "Find 10 leads in Sweden" → direct_execute (10 is within ≤25 bounded threshold).
// OpenClaw suggests >10 should be background, but 10 leads is easily done inline.
// The threshold is intentionally kept at 25 for generic tasks.
test('"Find 10 leads in Sweden" → direct_execute (intentional: ≤25 is always inline)', () => {
  const r = classifyExecution({ taskDescription: 'Find 10 leads in Sweden' })
  assert(r.mode === 'direct_execute', `mode=${r.mode} — 10 leads is within the ≤25 direct-execute threshold by design`)
})

// ─── 9. Edge-case follow-up fixes ────────────────────────────────────────────
//
// Covers relative-time scheduling phrases, generic publish-content safety,
// and group-targeted email-draft safety.

console.log('\n=== 9a. Relative-time schedule phrases → recurring_operation ===')

test('"Remind me next week" → recurring_operation', () => {
  const r = classifyExecution({ taskDescription: 'Remind me next week about this deal' })
  assert(r.mode === 'recurring_operation', `mode=${r.mode} — relative-time reminder must be recurring`)
})

test('"Follow up next week" → recurring_operation', () => {
  const r = classifyExecution({ taskDescription: 'Follow up next week with the client' })
  assert(r.mode === 'recurring_operation', `mode=${r.mode}`)
})

test('"Follow up tomorrow" → recurring_operation', () => {
  const r = classifyExecution({ taskDescription: 'Follow up tomorrow about the proposal' })
  assert(r.mode === 'recurring_operation', `mode=${r.mode}`)
})

test('"Check again in 1 hour" → recurring_operation', () => {
  const r = classifyExecution({ taskDescription: 'Check again in 1 hour to see if it updated' })
  assert(r.mode === 'recurring_operation', `mode=${r.mode}`)
})

test('"Check back in 2 days" → recurring_operation', () => {
  const r = classifyExecution({ taskDescription: 'Check back in 2 days on this ticket' })
  assert(r.mode === 'recurring_operation', `mode=${r.mode}`)
})

test('"Check status" (no time qualifier) → NOT recurring', () => {
  const r = classifyExecution({ taskDescription: 'Check status of the pipeline' })
  assert(r.mode !== 'recurring_operation', `Generic "check status" should not be recurring, mode=${r.mode}`)
})

console.log('\n=== 9b. Generic publish-content → needs_confirmation ===')

test('"Publish article now" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'Publish article now' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode} — publish article must require confirmation`)
})

test('"Publish the blog post" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'Publish the blog post' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"Publish this post" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'Publish this post' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"Publish my update" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'Publish my update to the site' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"Draft a blog post" → NOT confirmation (drafting, not publishing)', () => {
  const r = classifyExecution({ taskDescription: 'Draft a blog post about our product launch' })
  assert(r.mode !== 'needs_confirmation', `Drafting should not require confirmation, mode=${r.mode}`)
})

console.log('\n=== 9c. Group-targeted email draft → needs_confirmation ===')

test('"Draft email to team" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'Draft email to team' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode} — group-targeted email draft must require confirmation`)
})

test('"Draft email to all staff" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'Draft email to all staff' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"Write email to all customers" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'Write email to all customers about the outage' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"Prepare email for leads" → needs_confirmation', () => {
  const r = classifyExecution({ taskDescription: 'Prepare email for leads in the pipeline' })
  assert(r.mode === 'needs_confirmation', `mode=${r.mode}`)
})

test('"Write email draft" (no audience) → NOT confirmation (no group target)', () => {
  const r = classifyExecution({ taskDescription: 'Write email draft' })
  assert(r.mode !== 'needs_confirmation', `Ambiguous draft without audience should not require confirmation, mode=${r.mode}`)
})

test('"Create email template" → NOT confirmation (template, not live send)', () => {
  const r = classifyExecution({ taskDescription: 'Create email template for the onboarding flow' })
  assert(r.mode !== 'needs_confirmation', `Email template creation should not require confirmation, mode=${r.mode}`)
})

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(55)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failures.length > 0) {
  console.log('\nFailures:')
  failures.forEach(f => console.log(`  ✗ ${f}`))
}
process.exit(failed > 0 ? 1 : 0)
