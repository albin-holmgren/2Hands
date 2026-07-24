#!/usr/bin/env npx tsx
/**
 * Unit tests for API request validation (Batch A routes)
 * 
 * Run with: npx tsx tests/unit/api/agents-validation.test.ts
 * 
 * Tests validation of:
 * - POST /api/agents (createAgentRequestSchema)
 * - PATCH /api/agents/[id] (updateAgentRequestSchema)
 * - POST /api/agents/provision (provisionAgentRequestSchema)
 * - POST /api/agents/terminate (terminateAgentRequestSchema)
 */

import {
  parseAndValidate,
  createAgentRequestSchema,
  updateAgentRequestSchema,
  provisionAgentRequestSchema,
  terminateAgentRequestSchema,
  uuidSchema,
  validationErrorResponse,
} from '../../../src/lib/validation/schemas'

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

function createMockRequest(body: unknown): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function createMalformedRequest(): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not valid json {{{',
  })
}

console.log('\n🔍 API Request Validation Tests\n')

// Main async test runner
async function runTests() {

// ============================================
// createAgentRequestSchema Tests
// ============================================
console.log('POST /api/agents (createAgentRequestSchema):')

async function testCreateAgentSchema() {
  // Valid request
  const validReq = createMockRequest({ name: 'Test Agent', type: 'worker' })
  const validResult = await parseAndValidate(validReq, createAgentRequestSchema)
  assert(validResult.success === true, 'Valid request passes validation')

  // Missing name
  const missingNameReq = createMockRequest({ type: 'worker' })
  const missingNameResult = await parseAndValidate(missingNameReq, createAgentRequestSchema)
  assert(missingNameResult.success === false, 'Missing name is rejected')
  if (!missingNameResult.success) {
    assert(missingNameResult.error.toLowerCase().includes('name') || missingNameResult.error.includes('required'), 'Error mentions name or required')
    assert(missingNameResult.status === 400, 'Returns 400 status')
  }

  // Missing type
  const missingTypeReq = createMockRequest({ name: 'Test' })
  const missingTypeResult = await parseAndValidate(missingTypeReq, createAgentRequestSchema)
  assert(missingTypeResult.success === false, 'Missing type is rejected')

  // Empty name
  const emptyNameReq = createMockRequest({ name: '', type: 'worker' })
  const emptyNameResult = await parseAndValidate(emptyNameReq, createAgentRequestSchema)
  assert(emptyNameResult.success === false, 'Empty name is rejected')

  // Name too long (>100 chars)
  const longNameReq = createMockRequest({ name: 'x'.repeat(101), type: 'worker' })
  const longNameResult = await parseAndValidate(longNameReq, createAgentRequestSchema)
  assert(longNameResult.success === false, 'Name over 100 chars is rejected')

  // Malformed JSON
  const malformedReq = createMalformedRequest()
  const malformedResult = await parseAndValidate(malformedReq, createAgentRequestSchema)
  assert(malformedResult.success === false, 'Malformed JSON is rejected')
  if (!malformedResult.success) {
    assert(malformedResult.error === 'Invalid JSON body', 'Returns "Invalid JSON body" error')
  }

  // With optional config
  const withConfigReq = createMockRequest({ 
    name: 'Agent', 
    type: 'worker',
    config: { description: 'A test agent' }
  })
  const withConfigResult = await parseAndValidate(withConfigReq, createAgentRequestSchema)
  assert(withConfigResult.success === true, 'Request with optional config passes')
}

await testCreateAgentSchema()

// ============================================
// updateAgentRequestSchema Tests
// ============================================
console.log('\nPATCH /api/agents/[id] (updateAgentRequestSchema):')

async function testUpdateAgentSchema() {
  // Valid partial update (name only)
  const nameOnlyReq = createMockRequest({ name: 'New Name' })
  const nameOnlyResult = await parseAndValidate(nameOnlyReq, updateAgentRequestSchema)
  assert(nameOnlyResult.success === true, 'Partial update (name only) passes')

  // Valid status update
  const statusReq = createMockRequest({ status: 'working' })
  const statusResult = await parseAndValidate(statusReq, updateAgentRequestSchema)
  assert(statusResult.success === true, 'Valid status update passes')

  // Invalid status enum
  const invalidStatusReq = createMockRequest({ status: 'invalid_status' })
  const invalidStatusResult = await parseAndValidate(invalidStatusReq, updateAgentRequestSchema)
  assert(invalidStatusResult.success === false, 'Invalid status enum is rejected')

  // Empty object (valid - no updates)
  const emptyReq = createMockRequest({})
  const emptyResult = await parseAndValidate(emptyReq, updateAgentRequestSchema)
  assert(emptyResult.success === true, 'Empty update object is valid')

  // Schedule type validation
  const validScheduleReq = createMockRequest({ schedule_type: 'scheduled' })
  const validScheduleResult = await parseAndValidate(validScheduleReq, updateAgentRequestSchema)
  assert(validScheduleResult.success === true, 'Valid schedule_type passes')

  const invalidScheduleReq = createMockRequest({ schedule_type: 'invalid' })
  const invalidScheduleResult = await parseAndValidate(invalidScheduleReq, updateAgentRequestSchema)
  assert(invalidScheduleResult.success === false, 'Invalid schedule_type is rejected')
}

await testUpdateAgentSchema()

// ============================================
// provisionAgentRequestSchema Tests
// ============================================
console.log('\nPOST /api/agents/provision (provisionAgentRequestSchema):')

async function testProvisionAgentSchema() {
  // Valid UUID
  const validUuidReq = createMockRequest({ agentId: '123e4567-e89b-12d3-a456-426614174000' })
  const validUuidResult = await parseAndValidate(validUuidReq, provisionAgentRequestSchema)
  assert(validUuidResult.success === true, 'Valid UUID passes validation')

  // Invalid UUID format
  const invalidUuidReq = createMockRequest({ agentId: 'not-a-uuid' })
  const invalidUuidResult = await parseAndValidate(invalidUuidReq, provisionAgentRequestSchema)
  assert(invalidUuidResult.success === false, 'Invalid UUID is rejected')
  if (!invalidUuidResult.success) {
    assert(invalidUuidResult.error.includes('Invalid'), 'Error mentions invalid format')
  }

  // Missing agentId
  const missingIdReq = createMockRequest({})
  const missingIdResult = await parseAndValidate(missingIdReq, provisionAgentRequestSchema)
  assert(missingIdResult.success === false, 'Missing agentId is rejected')

  // Null agentId
  const nullIdReq = createMockRequest({ agentId: null })
  const nullIdResult = await parseAndValidate(nullIdReq, provisionAgentRequestSchema)
  assert(nullIdResult.success === false, 'Null agentId is rejected')

  // Number instead of string
  const numberIdReq = createMockRequest({ agentId: 12345 })
  const numberIdResult = await parseAndValidate(numberIdReq, provisionAgentRequestSchema)
  assert(numberIdResult.success === false, 'Number agentId is rejected')

  // Malformed JSON
  const malformedReq = createMalformedRequest()
  const malformedResult = await parseAndValidate(malformedReq, provisionAgentRequestSchema)
  assert(malformedResult.success === false, 'Malformed JSON is rejected')
}

await testProvisionAgentSchema()

// ============================================
// terminateAgentRequestSchema Tests
// ============================================
console.log('\nPOST /api/agents/terminate (terminateAgentRequestSchema):')

async function testTerminateAgentSchema() {
  // Valid UUID
  const validUuidReq = createMockRequest({ agentId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  const validUuidResult = await parseAndValidate(validUuidReq, terminateAgentRequestSchema)
  assert(validUuidResult.success === true, 'Valid UUID passes validation')

  // Invalid UUID format
  const invalidUuidReq = createMockRequest({ agentId: 'abc123' })
  const invalidUuidResult = await parseAndValidate(invalidUuidReq, terminateAgentRequestSchema)
  assert(invalidUuidResult.success === false, 'Invalid UUID is rejected')

  // Missing agentId
  const missingIdReq = createMockRequest({})
  const missingIdResult = await parseAndValidate(missingIdReq, terminateAgentRequestSchema)
  assert(missingIdResult.success === false, 'Missing agentId is rejected')

  // Empty string
  const emptyIdReq = createMockRequest({ agentId: '' })
  const emptyIdResult = await parseAndValidate(emptyIdReq, terminateAgentRequestSchema)
  assert(emptyIdResult.success === false, 'Empty agentId is rejected')
}

await testTerminateAgentSchema()

// ============================================
// UUID Schema Tests (for path params)
// ============================================
console.log('\nUUID Path Parameter Validation:')

function testUuidSchema() {
  // Valid UUIDs
  assert(uuidSchema.safeParse('123e4567-e89b-12d3-a456-426614174000').success, 'Standard UUID passes')
  assert(uuidSchema.safeParse('00000000-0000-0000-0000-000000000000').success, 'Nil UUID passes')

  // Invalid UUIDs
  assert(!uuidSchema.safeParse('not-a-uuid').success, 'Non-UUID string rejected')
  assert(!uuidSchema.safeParse('').success, 'Empty string rejected')
  assert(!uuidSchema.safeParse('123e4567-e89b-12d3-a456').success, 'Truncated UUID rejected')
  assert(!uuidSchema.safeParse('123e4567-e89b-12d3-a456-426614174000-extra').success, 'UUID with extra chars rejected')
  assert(!uuidSchema.safeParse(null).success, 'Null rejected')
  assert(!uuidSchema.safeParse(undefined).success, 'Undefined rejected')
  assert(!uuidSchema.safeParse(12345).success, 'Number rejected')
}

testUuidSchema()

// ============================================
// validationErrorResponse Tests
// ============================================
console.log('\nvalidationErrorResponse Helper:')

function testValidationErrorResponse() {
  const response = validationErrorResponse('Test error message')
  assert(response.error === 'Test error message', 'Error message is set correctly')
  assert(response.code === 'VALIDATION_ERROR', 'Code is VALIDATION_ERROR')
}

testValidationErrorResponse()

// ============================================
// Summary
// ============================================
console.log('\n' + '='.repeat(50))
console.log(`Results: ${passed} passed, ${failed} failed`)
console.log('='.repeat(50))

if (failed > 0) {
  console.log('\n❌ Some tests failed!')
  process.exit(1)
} else {
  console.log('\n✅ All validation tests passed!')
  process.exit(0)
}

} // End runTests()

// Run all tests
runTests().catch(err => {
  console.error('Test runner failed:', err)
  process.exit(1)
})
