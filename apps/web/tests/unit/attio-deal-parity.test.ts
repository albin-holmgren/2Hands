#!/usr/bin/env npx tsx
/**
 * Attio Deal Parity Regression Tests
 *
 * Verifies the fixes from attio-deal-parity-and-learning-loop-ffba13.md:
 * 1. attio_create_deal tool exposes owner_actor_id parameter
 * 2. attio_create_deal uses plural "companies" slug (not singular "company")
 * 3. attio_create_deal wraps associated_company in array format
 * 4. attio_create_deal supports owner as workspace-member actor reference
 * 5. attio_inspect_workspace now returns workspace_members
 * 6. attio_get_workspace_members tool exists and describes actor_id
 * 7. Attio playbook in buildIntegrationToolsPrompt includes plural slug rule
 * 8. Attio playbook includes OBJECT SLUG RULE section
 * 9. Attio playbook includes owner_actor_id in deal creation steps
 * 10. Attio playbook includes recovery path for HTTP 400 errors
 *
 * Run: npx tsx tests/unit/attio-deal-parity.test.ts
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

const attioTools = readFile('../../src/lib/integrations/provider-packs/attio-tools.ts')
const agentToolsBridge = readFile('../../src/lib/integrations/agent-tools-bridge.ts')

// ─── 1. attio_create_deal payload fixes ───────────────────────────────────

console.log('\n=== 1. attio_create_deal tool schema ===')

test('attio_create_deal exposes owner_actor_id parameter', () => {
  assert(
    attioTools.includes('owner_actor_id'),
    'attio_create_deal must expose owner_actor_id parameter for workspace member assignment'
  )
})

test('attio_create_deal uses plural "companies" slug in association', () => {
  const createDealSection = attioTools.slice(attioTools.indexOf('attio_create_deal'))
  const updateDealIdx = createDealSection.indexOf('attio_update_deal')
  const createDealBody = updateDealIdx > -1 ? createDealSection.slice(0, updateDealIdx) : createDealSection
  assert(
    createDealBody.includes("target_object: 'companies'"),
    'attio_create_deal must use plural "companies" slug in associated_company (not "company")'
  )
})

test('attio_create_deal does NOT use singular "company" slug in association', () => {
  // Check the execute function body doesn't use singular slug
  const createDealSection = attioTools.slice(attioTools.indexOf("name: 'attio_create_deal'"))
  const updateDealIdx = createDealSection.indexOf("name: 'attio_update_deal'")
  const body = updateDealIdx > -1 ? createDealSection.slice(0, updateDealIdx) : createDealSection
  assert(
    !body.includes("target_object: 'company'"),
    'attio_create_deal must not use singular "company" slug — must be "companies"'
  )
})

test('attio_create_deal wraps associated_company in array', () => {
  const createDealSection = attioTools.slice(attioTools.indexOf("name: 'attio_create_deal'"))
  const updateDealIdx = createDealSection.indexOf("name: 'attio_update_deal'")
  const body = updateDealIdx > -1 ? createDealSection.slice(0, updateDealIdx) : createDealSection
  assert(
    body.includes('associated_company = [{'),
    'attio_create_deal must wrap associated_company value in array [{...}]'
  )
})

test('attio_create_deal builds owner as workspace-member actor reference', () => {
  assert(
    attioTools.includes("referenced_actor_type: 'workspace-member'"),
    'attio_create_deal must include workspace-member actor reference for owner field'
  )
})

test('attio_create_deal has fallback retry on HTTP 400', () => {
  const createDealSection = attioTools.slice(attioTools.indexOf("name: 'attio_create_deal'"))
  const updateDealIdx = createDealSection.indexOf("name: 'attio_update_deal'")
  const body = updateDealIdx > -1 ? createDealSection.slice(0, updateDealIdx) : createDealSection
  assert(
    body.includes('statusCode === 400') && body.includes('fallbackValues'),
    'attio_create_deal must have a fallback retry path when Attio returns HTTP 400'
  )
})

// ─── 2. attio_update_deal ───────────────────────────────────────────────────

console.log('\n=== 2. attio_update_deal ===')

test('attio_update_deal exposes owner_actor_id parameter', () => {
  const updateDealSection = attioTools.slice(attioTools.indexOf("name: 'attio_update_deal'"))
  const pipelineIdx = updateDealSection.indexOf("name: 'attio_get_pipeline_stages'")
  const body = pipelineIdx > -1 ? updateDealSection.slice(0, pipelineIdx) : updateDealSection
  assert(
    body.includes('owner_actor_id'),
    'attio_update_deal must expose owner_actor_id parameter'
  )
})

test('attio_update_deal builds owner actor reference on update', () => {
  const updateDealSection = attioTools.slice(attioTools.indexOf("name: 'attio_update_deal'"))
  const pipelineIdx = updateDealSection.indexOf("name: 'attio_get_pipeline_stages'")
  const body = pipelineIdx > -1 ? updateDealSection.slice(0, pipelineIdx) : updateDealSection
  assert(
    body.includes("referenced_actor_type: 'workspace-member'"),
    'attio_update_deal must build workspace-member actor reference when owner_actor_id is provided'
  )
})

// ─── 3. attio_inspect_workspace returns workspace_members ─────────────────

console.log('\n=== 3. attio_inspect_workspace workspace members ===')

test('attio_inspect_workspace calls /workspace-members endpoint', () => {
  assert(
    attioTools.includes("'/workspace-members'"),
    'attio_inspect_workspace must call /workspace-members to discover valid owner actor IDs'
  )
})

test('attio_inspect_workspace returns workspace_members in response', () => {
  const inspectSection = attioTools.slice(attioTools.indexOf("name: 'attio_inspect_workspace'"))
  const getMembersIdx = inspectSection.indexOf("name: 'attio_get_workspace_members'")
  const body = getMembersIdx > -1 ? inspectSection.slice(0, getMembersIdx) : inspectSection
  assert(
    body.includes('workspace_members'),
    'attio_inspect_workspace result must include workspace_members array'
  )
})

test('attio_inspect_workspace instructions mention plural slug rule', () => {
  const inspectSection = attioTools.slice(attioTools.indexOf("name: 'attio_inspect_workspace'"))
  const getMembersIdx = inspectSection.indexOf("name: 'attio_get_workspace_members'")
  const body = getMembersIdx > -1 ? inspectSection.slice(0, getMembersIdx) : inspectSection
  assert(
    body.includes('PLURAL') || body.includes('plural'),
    'attio_inspect_workspace instructions must mention that object slugs are always plural'
  )
})

// ─── 4. attio_get_workspace_members tool exists ───────────────────────────

console.log('\n=== 4. attio_get_workspace_members tool ===')

test('attio_get_workspace_members tool exists', () => {
  assert(
    attioTools.includes("name: 'attio_get_workspace_members'"),
    'attio_get_workspace_members tool must be defined in attio-tools.ts'
  )
})

test('attio_get_workspace_members surfaces actor_id', () => {
  const membersSection = attioTools.slice(attioTools.indexOf("name: 'attio_get_workspace_members'"))
  const addToPipelineIdx = membersSection.indexOf("name: 'attio_add_to_pipeline'")
  const body = addToPipelineIdx > -1 ? membersSection.slice(0, addToPipelineIdx) : membersSection
  assert(
    body.includes('actor_id'),
    'attio_get_workspace_members must return actor_id for each member'
  )
})

test('attio_get_workspace_members usage hint mentions owner_actor_id', () => {
  const membersSection = attioTools.slice(attioTools.indexOf("name: 'attio_get_workspace_members'"))
  assert(
    membersSection.includes('owner_actor_id'),
    'attio_get_workspace_members must include usage hint linking actor_id to owner_actor_id in deal creation'
  )
})

// ─── 5. Attio playbook in agent-tools-bridge ────────────────────────────

console.log('\n=== 5. Attio operational playbook in agent-tools-bridge ===')

test('playbook includes OBJECT SLUG RULE section', () => {
  assert(
    agentToolsBridge.includes('OBJECT SLUG RULE'),
    'Attio playbook must include an explicit OBJECT SLUG RULE section'
  )
})

test('playbook explicitly says companies not company', () => {
  assert(
    agentToolsBridge.includes('"companies"') && agentToolsBridge.includes('NOT "company"'),
    'Attio playbook must explicitly state companies (plural) is correct and company (singular) is wrong'
  )
})

test('playbook mentions owner_actor_id in deal creation steps', () => {
  assert(
    agentToolsBridge.includes('owner_actor_id'),
    'Attio playbook must mention owner_actor_id in deal creation steps'
  )
})

test('playbook mentions workspace_members for owner lookup', () => {
  assert(
    agentToolsBridge.includes('workspace_members'),
    'Attio playbook must tell the model to look up workspace_members for the owner actor_id'
  )
})

test('playbook has RECOVERY section for HTTP 400', () => {
  assert(
    agentToolsBridge.includes('RECOVERY') && agentToolsBridge.includes('HTTP 400'),
    'Attio playbook must have a RECOVERY section covering HTTP 400 deal write failures'
  )
})

test('playbook covers slug error recovery (singular → plural)', () => {
  assert(
    agentToolsBridge.includes('slug') && agentToolsBridge.includes('singular'),
    'Attio playbook RECOVERY must cover singular slug as a root cause of HTTP 400'
  )
})

test('playbook covers owner error recovery', () => {
  assert(
    agentToolsBridge.includes('owner') && agentToolsBridge.includes('actor'),
    'Attio playbook RECOVERY must cover missing owner/actor as a root cause'
  )
})

test('playbook says object slugs are always plural', () => {
  assert(
    agentToolsBridge.includes('PLURAL') || agentToolsBridge.includes('always PLURAL') || agentToolsBridge.includes('always plural'),
    'Attio playbook must state object slugs are always plural'
  )
})

// ─── 6. verifyDealWrite checks confirmed_stage ────────────────────────────

console.log('\n=== 6. verifyDealWrite response verification ===')

test('verifyDealWrite function exists in attio-tools', () => {
  assert(
    attioTools.includes('function verifyDealWrite'),
    'verifyDealWrite helper must exist to verify deal stage on every write'
  )
})

test('verifyDealWrite checks confirmed_stage match', () => {
  assert(
    attioTools.includes('confirmedStage') && attioTools.includes('_verification'),
    'verifyDealWrite must compare confirmed stage against requested stage and return _verification block'
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
