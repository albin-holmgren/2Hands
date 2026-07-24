#!/usr/bin/env npx tsx
/**
 * OpenClaw Gap Regression Tests
 *
 * Verifies the 6 fixes from execution-reliability-openclaw-gap-plan-47406c.md:
 * 1. System prompt: INTEGRATION-FIRST rule is present and explicit
 * 2. System prompt: DEBUG-FIRST failure rule overrides agent-swapping
 * 3. Guardrail patterns: run/confirm phrases pass the guardrail
 * 4. Guardrail patterns: integration_* tools are explicitly excluded from the gate
 * 5. Agent status: last_error, last_progress, and active_task are included
 * 6. Memory correction detection: integration correction patterns match correctly
 *
 * Run: npx tsx tests/unit/openclaw-gap-regression.test.ts
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

// ─── Helpers: inline the exact logic extracted from chat/route.ts ──────────

function buildSystemPromptFragment(): string {
  // We load the real system prompt by importing it (avoids DB calls since getSystemPrompt is a pure string function)
  // We import the file source directly as a string and check text markers.
  // This is intentionally a content-level test — if the text is removed, tests fail.
  const fs = require('fs')
  const path = require('path')
  const routePath = path.resolve(__dirname, '../../src/app/api/chat/route.ts')
  return fs.readFileSync(routePath, 'utf8')
}

// Guardrail logic inline-replicated from chat/route.ts (must match exactly)
function guardrailPasses(toolName: string, latestUserMsg: string): boolean {
  const sensitiveTools = ['create_agent', 'delete_agent', 'delete_all_agents', 'run_agent']
  if (!sensitiveTools.includes(toolName)) return true // not gated

  const msg = latestUserMsg.toLowerCase()
  const createPatterns = /\b(create|make|build|set up|setup|start|add|launch|spin up|get me|give me|i need|i want)\b.*(agent|automation|bot|teammate|one|it)|\b(agent|bot|automation)\b.*(create|make|build|start|launch)/i
  const schedulingPatterns = /\b(every|daily|weekly|morning|evening|hourly|each day|each week|regularly|automatically|monitor|track|alert me|notify me|keep me updated|give me .* (every|daily|weekly))\b/i
  const delegatedTaskPatterns = /\b(i want you to|i need you to|can you|could you|please|help me)\b.*\b(find|research|monitor|track|watch|analyze|write|qualify|validate|collect|scrape|review|check|report)\b/i
  const runPatterns = /\b(run|execute|trigger|start|launch|do it|fetch|get|make them run|run them|run (it|now|again))\b/i
  const deletePatterns = /\b(delete|remove|stop|cancel|kill|nuke|clear|wipe|purge|get rid of|clean|throw away|destroy|drop|delet)\b.*(agent|automation|bot|teammate|them|all|everything|it|one|agents)|\b(clean|wipe|nuke|purge)\b.*(it|them|all|up|everything)/i
  const searchPatterns = /\b(search|look up|find|google|research|reaserch|look into|investigate)\b/i
  const confirmPatterns = /\b(yes|go|go ahead|do it|confirm|please|sure|ok|okay|proceed|yep|yup|absolutely|let's go|sounds good|do that|run it|start it|start them|make them|fire it|fire them|do this)\b/i
  const isScheduledSubstantiveWork = /\b(daily|weekly|every day|each day|every week|regularly|automatically|each morning|every morning)\b/i.test(msg)
    && /\b(find|research|monitor|track|collect|analyze|add|report|check|review|scrape|send|draft)\b/i.test(msg)

  if (toolName === 'create_agent') {
    return createPatterns.test(msg)
      || delegatedTaskPatterns.test(msg)
      || confirmPatterns.test(msg)
      || isScheduledSubstantiveWork
      || (schedulingPatterns.test(msg) && !searchPatterns.test(msg))
  }
  if (toolName === 'run_agent') {
    return runPatterns.test(msg) || confirmPatterns.test(msg)
  }
  if (toolName === 'delete_agent' || toolName === 'delete_all_agents') {
    return deletePatterns.test(msg) || confirmPatterns.test(msg) || msg.includes('delet')
  }
  return false
}

// Integration correction pattern (replicated from chat/route.ts)
const integrationCorrectionPatterns = /\b(slug|field|stage|endpoint|path|parameter|attribute|object|record|method|api|format|key|token)\b.{0,60}\b(should be|is|are|use|not|instead|plural|singular|correct|wrong|actually|fix|fixed)\b|\b(use|it'?s|they'?re|the|correct|right|actually)\b.{0,40}\b(plural|singular|companies|contacts|people|deals|records|stages|objects)\b/i

// Integration memory keyword pattern (replicated from chat/route.ts)
const integrationMemoryKeywords = /\b(attio|hubspot|salesforce|pipedrive|crm|deal|pipeline|company|companies|contact|contacts|lead|stage|integration|connector|api[- ]?key|slack|github|shopify|notion|google sheets|airtable|stripe|intercom|zendesk|outreach|apollo|close\.io|monday|asana|jira|linear|clickup|webhook|oauth|token|endpoint|slug|object|record|field|attribute|list|collection|workspace|sync|create deal|create company|add lead|add deal|add contact|update deal|update record)\b/i

// Agent status enrichment logic (replicated from chat/route.ts)
function buildAgentStatusLine(a: {
  name: string; id: string; status: string; schedule_type: string;
  last_run_at: string | null; next_run_at: string | null;
  config: {
    last_error?: string | null;
    last_progress?: { message?: string } | null;
    last_run_summary?: string | null;
    active_run_task?: string | null;
  } | null;
  total_credits_used: number
}): string {
  const lastRun = a.last_run_at ? new Date(a.last_run_at).toLocaleString() : 'Never'
  const nextRun = a.next_run_at ? new Date(a.next_run_at).toLocaleString() : 'N/A'
  const cfg = a.config || {}
  const errorNote = cfg.last_error ? ` | LastError=${cfg.last_error.slice(0, 120)}` : ''
  const progressNote = cfg.last_progress?.message ? ` | LastProgress=${cfg.last_progress.message.slice(0, 120)}` : ''
  const summaryNote = cfg.last_run_summary ? ` | LastRunSummary=${cfg.last_run_summary.slice(0, 200)}` : ''
  const taskNote = (a.status === 'working' || a.status === 'initializing') && cfg.active_run_task ? ` | ActiveTask=${cfg.active_run_task.slice(0, 100)}` : ''
  return `- ${a.name} (${a.id}): Status=${a.status}${taskNote}, Type=${a.schedule_type}, LastRun=${lastRun}, NextRun=${nextRun}, Credits=${a.total_credits_used || 0}${errorNote}${progressNote}${summaryNote}`
}

// ─── 1. System prompt: INTEGRATION-FIRST rule ─────────────────────────────

console.log('\n=== 1. System prompt: INTEGRATION-FIRST rule ===')

const routeSource = buildSystemPromptFragment()

test('system prompt includes INTEGRATION-FIRST RULE section', () => {
  assert(routeSource.includes('INTEGRATION-FIRST RULE'), 'Missing INTEGRATION-FIRST RULE')
})

test('system prompt states CRM actions must NOT use create_agent', () => {
  assert(routeSource.includes('NOT by creating an agent'), 'Missing "NOT by creating an agent" rule')
})

test('system prompt lists bounded CRM actions as direct examples', () => {
  assert(routeSource.includes('create a company'), 'Missing "create a company" example')
  assert(routeSource.includes('create a test record') || routeSource.includes('make a test record') || routeSource.includes('test the connection'), 'Missing test record example')
})

test('system prompt includes direct-execution example for Attio', () => {
  assert(routeSource.includes('NO AGENT CREATED'), 'Missing "NO AGENT CREATED" example')
})

test('system prompt states agents are for long-running/background work only', () => {
  assert(routeSource.includes('WHAT YOU DELEGATE TO AN AGENT'), 'Missing WHAT YOU DELEGATE TO AN AGENT section')
  assert(routeSource.includes('long-running') || routeSource.includes('background'), 'Missing background/long-running qualifier')
})

// ─── 2. System prompt: DEBUG-FIRST failure rule ───────────────────────────

console.log('\n=== 2. System prompt: DEBUG-FIRST failure rule ===')

test('system prompt includes INTEGRATION FAILURE — DEBUG FIRST section', () => {
  assert(routeSource.includes('INTEGRATION FAILURE'), 'Missing INTEGRATION FAILURE section')
  assert(routeSource.includes('DEBUG FIRST'), 'Missing DEBUG FIRST instruction')
})

test('system prompt forbids creating a new agent after failure', () => {
  assert(routeSource.includes('NEVER respond to an integration failure by creating a new agent'), 'Missing explicit ban on agent-swapping after failure')
})

test('system prompt requires reading the exact error message', () => {
  assert(routeSource.includes('Read the exact error message'), 'Missing instruction to read exact error')
})

test('system prompt instructs diagnosing root cause before retrying', () => {
  assert(routeSource.includes('Diagnose the root cause'), 'Missing root cause diagnosis instruction')
})

test('system prompt identifies the "different approach + spawn agent" bug', () => {
  assert(routeSource.includes('let me try a different approach') && routeSource.includes('that is the bug'), 'Missing explicit identification of the agent-swap bug pattern')
})

// ─── 3. Guardrail patterns: run/confirm phrases pass ─────────────────────

console.log('\n=== 3. Guardrail patterns: run/confirm phrases ===')

test('"yes" passes create_agent guardrail', () => {
  assert(guardrailPasses('create_agent', 'yes'), '"yes" should pass create_agent guardrail')
})

test('"yes, go ahead" passes create_agent guardrail', () => {
  assert(guardrailPasses('create_agent', 'yes, go ahead'), '"yes, go ahead" should pass')
})

test('"make them run now" passes run_agent guardrail', () => {
  assert(guardrailPasses('run_agent', 'make them run now so i see deals in the lead pipeline'), '"make them run now" should pass run_agent')
})

test('"yes" passes run_agent guardrail', () => {
  assert(guardrailPasses('run_agent', 'yes'), '"yes" should pass run_agent guardrail')
})

test('"sounds good" passes create_agent guardrail', () => {
  assert(guardrailPasses('create_agent', 'sounds good'), '"sounds good" should pass')
})

test('"do it" passes run_agent guardrail', () => {
  assert(guardrailPasses('run_agent', 'do it'), '"do it" should pass run_agent')
})

test('"find 10 leads daily and add to Attio" passes create_agent (scheduled substantive work)', () => {
  assert(guardrailPasses('create_agent', 'find 10 leads daily and add to Attio'), 'scheduled substantive work should pass')
})

test('"please help me find leads" passes create_agent (delegated task)', () => {
  assert(guardrailPasses('create_agent', 'please help me find leads'), 'delegated task pattern should pass')
})

test('"run them" passes run_agent guardrail', () => {
  assert(guardrailPasses('run_agent', 'run them'), '"run them" should pass run_agent')
})

test('"start them" passes run_agent guardrail', () => {
  assert(guardrailPasses('run_agent', 'start them'), '"start them" should pass run_agent')
})

test('ambiguous "what should I do?" does NOT pass create_agent guardrail', () => {
  assert(!guardrailPasses('create_agent', 'what should I do?'), 'Vague message should not pass create_agent')
})

test('integration_* tool is not in the sensitive list (no guardrail)', () => {
  // Verify the guardrail function returns true immediately for integration tools
  assert(guardrailPasses('integration_attio_create_deal', ''), 'integration_attio_create_deal should never be gated')
  assert(guardrailPasses('integration_call', ''), 'integration_call should never be gated')
  assert(guardrailPasses('setup_integration', ''), 'setup_integration should never be gated')
})

test('source code comment confirms integration_* tools are not in sensitiveTools', () => {
  assert(
    routeSource.includes('integration_* tools are NOT in this list'),
    'Source should document that integration_* is not gated'
  )
})

// ─── 4. Agent status: enriched progress fields ────────────────────────────

console.log('\n=== 4. Agent status: enriched progress fields ===')

const workingAgentWithError = {
  name: 'Elsa',
  id: 'agent-001',
  status: 'failed',
  schedule_type: 'realtime',
  last_run_at: '2026-03-09T08:00:00Z',
  next_run_at: null,
  config: {
    last_error: 'HTTP 400: Invalid slug "company" — use "companies"',
    last_progress: { message: 'Attempted to create deal, received 400 error' },
    last_run_summary: 'Failed after 2 attempts. API returned 400 on all write operations.',
    active_run_task: null,
  },
  total_credits_used: 12,
}

const activeAgent = {
  name: 'Oscar',
  id: 'agent-002',
  status: 'working',
  schedule_type: 'realtime',
  last_run_at: '2026-03-09T10:00:00Z',
  next_run_at: null,
  config: {
    last_error: null,
    last_progress: null,
    last_run_summary: null,
    active_run_task: 'Searching LinkedIn for Swedish SME companies in manufacturing',
  },
  total_credits_used: 3,
}

const cleanAgent = {
  name: 'Nova',
  id: 'agent-003',
  status: 'idle',
  schedule_type: 'scheduled',
  last_run_at: null,
  next_run_at: null,
  config: null,
  total_credits_used: 0,
}

test('failed agent status line includes last_error', () => {
  const line = buildAgentStatusLine(workingAgentWithError)
  assert(line.includes('LastError='), 'Should include LastError field')
  assert(line.includes('HTTP 400'), 'Should include the actual error text')
})

test('failed agent status line includes last_progress', () => {
  const line = buildAgentStatusLine(workingAgentWithError)
  assert(line.includes('LastProgress='), 'Should include LastProgress field')
})

test('failed agent status line includes last_run_summary', () => {
  const line = buildAgentStatusLine(workingAgentWithError)
  assert(line.includes('LastRunSummary='), 'Should include LastRunSummary field')
})

test('working agent status line includes active_task', () => {
  const line = buildAgentStatusLine(activeAgent)
  assert(line.includes('ActiveTask='), 'Working agent should show ActiveTask')
  assert(line.includes('Searching LinkedIn'), 'Should include the specific task text')
})

test('idle agent with no config does not crash', () => {
  const line = buildAgentStatusLine(cleanAgent)
  assert(line.includes('Nova'), 'Should include agent name')
  assert(!line.includes('LastError='), 'Clean agent should not include LastError')
  assert(!line.includes('ActiveTask='), 'Idle agent should not include ActiveTask')
})

test('idle agent does not show active_task even if config has it', () => {
  const idleWithTask = { ...workingAgentWithError, status: 'idle', config: { ...workingAgentWithError.config, active_run_task: 'old task' } }
  const line = buildAgentStatusLine(idleWithTask)
  assert(!line.includes('ActiveTask='), 'Idle agent should not show active_task')
})

test('active_run_task is truncated to 100 chars', () => {
  const longTask = 'A'.repeat(200)
  const agent = { ...activeAgent, config: { active_run_task: longTask } }
  const line = buildAgentStatusLine(agent)
  // taskNote sits right after Status=working, before the next comma: "Status=working | ActiveTask=AAA..., Type=..."
  const match = line.match(/ActiveTask=([^,|]+)/)
  assert(!!match, 'ActiveTask should appear in line for working agent')
  if (match) {
    assert(match[1].trim().length <= 100, `active_task should be truncated to 100 chars, got ${match[1].trim().length}`)
  }
})

// ─── 5. Integration correction detection ──────────────────────────────────

console.log('\n=== 5. Integration correction detection ===')

test('detects "the slug should be plural" correction', () => {
  assert(
    integrationCorrectionPatterns.test('the slug should be plural, use companies not company'),
    'Should detect slug correction'
  )
})

test('detects "use companies not company" correction', () => {
  assert(
    integrationCorrectionPatterns.test('use companies not company for the Attio object'),
    'Should detect companies vs company correction'
  )
})

test('detects "the stage is actually called Lead" correction', () => {
  assert(
    integrationCorrectionPatterns.test("the stage is actually called Lead, not Leads"),
    'Should detect stage name correction'
  )
})

test('detects "the field should be email_address not email" correction', () => {
  assert(
    integrationCorrectionPatterns.test('the field should be email_address not email'),
    'Should detect field name correction'
  )
})

test('detects "objects are plural" hint', () => {
  assert(
    integrationCorrectionPatterns.test('the objects are plural in Attio'),
    'Should detect plural objects hint'
  )
})

test('does NOT detect normal messages as corrections', () => {
  assert(
    !integrationCorrectionPatterns.test('what time is it in Tokyo?'),
    'Normal message should not be detected as correction'
  )
  assert(
    !integrationCorrectionPatterns.test('how are you today?'),
    'Greeting should not be detected as correction'
  )
})

// ─── 6. Integration memory keyword breadth ────────────────────────────────

console.log('\n=== 6. Integration memory keyword breadth ===')

test('keyword regex matches "attio"', () => {
  assert(integrationMemoryKeywords.test('check my attio pipeline'), 'Should match attio')
})

test('keyword regex matches "companies" (new addition)', () => {
  assert(integrationMemoryKeywords.test('use companies instead'), 'Should match companies')
})

test('keyword regex matches "slug"', () => {
  assert(integrationMemoryKeywords.test('the slug is wrong'), 'Should match slug')
})

test('keyword regex matches "create deal"', () => {
  assert(integrationMemoryKeywords.test('create deal in the pipeline'), 'Should match create deal')
})

test('keyword regex matches "webhook"', () => {
  assert(integrationMemoryKeywords.test('set up a webhook for this'), 'Should match webhook')
})

test('keyword regex matches "endpoint"', () => {
  assert(integrationMemoryKeywords.test('the endpoint is wrong'), 'Should match endpoint')
})

test('keyword regex does NOT match unrelated messages', () => {
  assert(!integrationMemoryKeywords.test('what is the weather today?'), 'Weather message should not trigger')
  assert(!integrationMemoryKeywords.test('hello how are you'), 'Greeting should not trigger')
})

// ─── Summary ──────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(55)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failures.length > 0) {
  console.log('\nFailures:')
  failures.forEach(f => console.log(`  ✗ ${f}`))
}
process.exit(failed > 0 ? 1 : 0)
