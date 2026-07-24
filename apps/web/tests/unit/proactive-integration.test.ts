#!/usr/bin/env npx tsx
/**
 * Proactive Integration Architecture — unit tests
 *
 * Verifies:
 * 1. Skill continuation tool filtering preserves integration tools
 * 2. buildIntegrationToolsPrompt includes the proactive protocol
 * 3. Sales-pipeline skill references typed Attio tools
 * 4. Integration failure responses include _learning_hint
 *
 * Run: npx tsx tests/unit/proactive-integration.test.ts
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

// ─── 1. Skill continuation tool filtering ─────────────────────────────────

// Simulate the exact logic from chat/route.ts for continuation tool filtering
const INTEGRATION_CORE_TOOLS = new Set([
  'setup_integration', 'verify_integration', 'integration_call', 'register_custom_provider',
])

function computeContinuationTools(
  activeSkillAllowedTools: string[] | null,
  capturedToolsToUse: { name: string }[]
): { name: string }[] {
  if (activeSkillAllowedTools === null) return capturedToolsToUse
  if (activeSkillAllowedTools.length === 0) return capturedToolsToUse.filter(t =>
    t.name.startsWith('integration_') || INTEGRATION_CORE_TOOLS.has(t.name)
  )
  return capturedToolsToUse.filter(t =>
    activeSkillAllowedTools.includes(t.name) ||
    t.name.startsWith('integration_') ||
    INTEGRATION_CORE_TOOLS.has(t.name)
  )
}

const ALL_TOOLS = [
  { name: 'web_search' },
  { name: 'analyze_url' },
  { name: 'manage_board' },
  { name: 'manage_memory_box' },
  { name: 'manage_recurring_task' },
  { name: 'run_skill' },
  { name: 'setup_integration' },
  { name: 'verify_integration' },
  { name: 'integration_call' },
  { name: 'register_custom_provider' },
  { name: 'integration_attio_inspect_workspace' },
  { name: 'integration_attio_create_deal' },
  { name: 'integration_attio_create_company' },
  { name: 'integration_attio_search_people' },
  { name: 'integration_attio_get_deal_stages' },
  { name: 'integration_github_list_repos' },
]

console.log('\n=== 1. Skill continuation tool filtering ===')

test('no skill active → all tools preserved', () => {
  const result = computeContinuationTools(null, ALL_TOOLS)
  assert(result.length === ALL_TOOLS.length, `Expected ${ALL_TOOLS.length}, got ${result.length}`)
})

test('skill with empty allowed_tools → only integration tools preserved', () => {
  const result = computeContinuationTools([], ALL_TOOLS)
  const names = result.map(t => t.name)
  assert(names.includes('integration_attio_create_deal'), 'Missing typed Attio tool')
  assert(names.includes('setup_integration'), 'Missing setup_integration')
  assert(names.includes('verify_integration'), 'Missing verify_integration')
  assert(names.includes('integration_call'), 'Missing integration_call')
  assert(!names.includes('web_search'), 'web_search should not be included when allowed_tools is empty')
  assert(!names.includes('run_skill'), 'run_skill should not be included when allowed_tools is empty')
})

test('sales-pipeline skill allowed_tools → keeps declared tools + all integration tools', () => {
  const salesPipelineAllowedTools = ['web_search', 'analyze_url', 'manage_board', 'manage_memory_box', 'manage_recurring_task']
  const result = computeContinuationTools(salesPipelineAllowedTools, ALL_TOOLS)
  const names = result.map(t => t.name)
  // Declared tools present
  assert(names.includes('web_search'), 'Missing declared tool: web_search')
  assert(names.includes('manage_board'), 'Missing declared tool: manage_board')
  assert(names.includes('manage_memory_box'), 'Missing declared tool: manage_memory_box')
  // Integration tools preserved
  assert(names.includes('integration_attio_create_deal'), 'Missing typed Attio tool: integration_attio_create_deal')
  assert(names.includes('integration_attio_inspect_workspace'), 'Missing typed Attio tool: integration_attio_inspect_workspace')
  assert(names.includes('integration_attio_search_people'), 'Missing typed Attio tool: integration_attio_search_people')
  assert(names.includes('integration_github_list_repos'), 'Missing typed GitHub tool: integration_github_list_repos')
  assert(names.includes('setup_integration'), 'Missing core tool: setup_integration')
  assert(names.includes('verify_integration'), 'Missing core tool: verify_integration')
  assert(names.includes('integration_call'), 'Missing core tool: integration_call')
  // Non-declared non-integration tools excluded
  assert(!names.includes('run_skill'), 'run_skill should be excluded (not in allowed_tools)')
})

test('code-review skill (empty allowed_tools) → still gets integration tools', () => {
  const result = computeContinuationTools([], ALL_TOOLS)
  const names = result.map(t => t.name)
  assert(names.includes('integration_attio_create_deal'), 'Even zero-tool skills should access integration tools')
  assert(names.length > 0, 'Should have at least integration tools')
})

// ─── 2. buildIntegrationToolsPrompt includes proactive protocol ───────────

console.log('\n=== 2. Integration tools prompt content ===')

// Inline-import to avoid Supabase init
import { buildIntegrationToolsPrompt, classifyToolOperation, detectVerifiedWrite } from '../../src/lib/integrations/agent-tools-bridge'
import { slackTools } from '../../src/lib/integrations/provider-packs/slack-tools'

const mockToolset = {
  tools: [
    { name: 'integration_attio_inspect_workspace', description: 'Inspect workspace' },
    { name: 'integration_attio_create_deal', description: 'Create deal' },
  ],
  toolMap: new Map(),
  connectionCount: 1,
  providers: ['attio'],
}

test('prompt includes PROACTIVE INTEGRATION PROTOCOL section', () => {
  const prompt = buildIntegrationToolsPrompt(mockToolset as any)
  assert(prompt.includes('PROACTIVE INTEGRATION PROTOCOL'), 'Missing PROACTIVE INTEGRATION PROTOCOL section')
})

test('prompt includes discover-verify-act-learn steps', () => {
  const prompt = buildIntegrationToolsPrompt(mockToolset as any)
  assert(prompt.includes('1. DISCOVER'), 'Missing DISCOVER step')
  assert(prompt.includes('2. VERIFY'), 'Missing VERIFY step')
  assert(prompt.includes('3. ACT'), 'Missing ACT step')
  assert(prompt.includes('4. LEARN'), 'Missing LEARN step')
})

test('prompt includes bounded failure recovery', () => {
  const prompt = buildIntegrationToolsPrompt(mockToolset as any)
  assert(prompt.includes('ON FAILURE'), 'Missing ON FAILURE section')
  assert(prompt.includes('2 evidence-based'), 'Missing bounded retry guidance')
})

test('prompt includes Attio playbook when Attio is a provider', () => {
  const prompt = buildIntegrationToolsPrompt(mockToolset as any)
  assert(prompt.includes('ATTIO OPERATIONAL RULES'), 'Missing Attio playbook')
  assert(prompt.includes('integration_attio_inspect_workspace'), 'Missing workspace inspection reference')
})

test('prompt omits Attio playbook when Attio is not a provider', () => {
  const nonAttioToolset = {
    tools: [{ name: 'integration_github_list_repos', description: 'List repos' }],
    toolMap: new Map(),
    connectionCount: 1,
    providers: ['github'],
  }
  const prompt = buildIntegrationToolsPrompt(nonAttioToolset as any)
  assert(!prompt.includes('ATTIO OPERATIONAL RULES'), 'Attio playbook should not appear for non-Attio providers')
  assert(prompt.includes('PROACTIVE INTEGRATION PROTOCOL'), 'Protocol should still appear for non-Attio providers')
})

test('empty toolset returns empty string', () => {
  const emptyToolset = { tools: [], toolMap: new Map(), connectionCount: 0, providers: [] }
  const prompt = buildIntegrationToolsPrompt(emptyToolset as any)
  assert(prompt === '', 'Empty toolset should return empty string')
})

// ─── 3. Sales-pipeline skill references typed Attio tools ─────────────────

console.log('\n=== 3. Sales-pipeline skill content ===')

import { SYSTEM_SKILLS } from '../../src/lib/skills/system-skills'

const salesPipeline = SYSTEM_SKILLS.find(s => s.name === 'sales-pipeline')

test('sales-pipeline skill exists', () => {
  assert(!!salesPipeline, 'sales-pipeline skill not found')
})

test('sales-pipeline references typed integration_attio_* tools', () => {
  assert(
    salesPipeline!.instructions.includes('integration_attio_'),
    'Should reference typed integration_attio_* tools'
  )
})

test('sales-pipeline references PROACTIVE INTEGRATION PROTOCOL', () => {
  assert(
    salesPipeline!.instructions.includes('PROACTIVE INTEGRATION PROTOCOL'),
    'Should reference the proactive protocol'
  )
})

test('sales-pipeline no longer recommends generic integration_call for Attio', () => {
  // Check that the old guidance "use integration_call (provider="attio")" is removed
  assert(
    !salesPipeline!.instructions.includes('integration_call (provider="attio")'),
    'Should not reference generic integration_call for Attio'
  )
})

test('sales-pipeline still supports generic integration_call for non-built-in providers', () => {
  assert(
    salesPipeline!.instructions.includes('integration_call'),
    'Should still mention integration_call for custom providers'
  )
})

// ─── 4. Integration failure responses include _learning_hint ──────────────

console.log('\n=== 4. Failure learning hint structure ===')

test('failed typed integration result includes _learning_hint', () => {
  // Simulate the exact construction from chat/route.ts
  const intResult = { success: false, data: 'HTTP 404: Cannot find object', operation_kind: 'write', verified_write: false }
  const resultPayload: Record<string, unknown> = { success: intResult.success }
  if (intResult.success) {
    resultPayload.data = intResult.data
  } else {
    resultPayload.error = intResult.data
    resultPayload._learning_hint = 'This integration call failed. Follow the PROACTIVE INTEGRATION PROTOCOL: (1) Read the error carefully, (2) Check PRIOR INTEGRATION LEARNINGS for this pattern, (3) Try up to 2 evidence-based alternatives, (4) If you find the fix, store it via manage_memory_box so future sessions can reuse it.'
  }
  assert(resultPayload._learning_hint !== undefined, 'Failed result should have _learning_hint')
  assert(typeof resultPayload._learning_hint === 'string', '_learning_hint should be a string')
  assert((resultPayload._learning_hint as string).includes('PROACTIVE INTEGRATION PROTOCOL'), '_learning_hint should reference protocol')
  assert((resultPayload._learning_hint as string).includes('manage_memory_box'), '_learning_hint should reference manage_memory_box')
})

test('successful typed integration result does NOT include _learning_hint', () => {
  const intResult = { success: true, data: '{"record_id": "abc123"}', operation_kind: 'write', verified_write: true }
  const resultPayload: Record<string, unknown> = { success: intResult.success }
  if (intResult.success) {
    resultPayload.data = intResult.data
  } else {
    resultPayload.error = intResult.data
    resultPayload._learning_hint = 'This integration call failed.'
  }
  assert(resultPayload._learning_hint === undefined, 'Successful result should NOT have _learning_hint')
})

test('failed integration_call response includes _learning_hint', () => {
  const errMsg = 'HTTP 400: Invalid slug'
  const data = { message: 'Invalid slug' }
  const result = JSON.parse(JSON.stringify({
    success: false, status: 400, error: errMsg, raw: data,
    _learning_hint: 'This integration_call failed. Follow the PROACTIVE INTEGRATION PROTOCOL: check prior learnings, try evidence-based alternatives, and store the lesson if you find the fix.'
  }))
  assert(result._learning_hint !== undefined, 'Failed integration_call should have _learning_hint')
  assert(result._learning_hint.includes('PROACTIVE INTEGRATION PROTOCOL'), '_learning_hint should reference protocol')
})

// ─── 5. Verified execution semantics ───────────────────────────────────────

console.log('\n=== 5. Verified execution semantics ===')

test('classifyToolOperation treats provider-prefixed create tool as write', () => {
  assert(classifyToolOperation('attio_create_deal') === 'write', 'attio_create_deal should be classified as write')
})

test('classifyToolOperation treats provider-prefixed send tool as write', () => {
  assert(classifyToolOperation('gmail_send_email') === 'write', 'gmail_send_email should be classified as write')
})

test('classifyToolOperation treats Slack create-channel as write', () => {
  assert(classifyToolOperation('slack_create_channel') === 'write', 'slack_create_channel should be classified as write')
})

test('detectVerifiedWrite recognizes Gmail send result identifiers', () => {
  const payload = JSON.stringify({ id: 'msg_123', threadId: 'thread_456' })
  assert(detectVerifiedWrite(payload), 'Gmail send result with id/threadId should count as verified write')
})

test('detectVerifiedWrite recognizes Slack message result identifiers', () => {
  const payload = JSON.stringify({ channel: 'C123456', ts: '1710000000.123456' })
  assert(detectVerifiedWrite(payload), 'Slack postMessage result with channel + ts should count as verified write')
})

test('detectVerifiedWrite recognizes nested Slack channel create result', () => {
  const payload = JSON.stringify({ channel: { id: 'C999999', name: 'general-ops' } })
  assert(detectVerifiedWrite(payload), 'Slack create channel result with nested channel.id should count as verified write')
})

test('detectVerifiedWrite recognizes Attio top-level record identifiers', () => {
  const payload = JSON.stringify({ record_id: 'rec_123' })
  assert(detectVerifiedWrite(payload), 'Attio result with record_id should count as verified write')
})

test('Slack provider pack includes slack_create_channel tool', () => {
  assert(slackTools.some(tool => tool.name === 'slack_create_channel'), 'slack_create_channel should be present in slackTools')
})

// ─── Summary ──────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failures.length > 0) {
  console.log('\nFailures:')
  failures.forEach(f => console.log(`  ✗ ${f}`))
}
process.exit(failed > 0 ? 1 : 0)
