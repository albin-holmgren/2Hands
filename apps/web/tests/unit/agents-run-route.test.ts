#!/usr/bin/env npx tsx

import { NextRequest } from 'next/server'
import { POST } from '../../src/app/api/agents/run/route'

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

function makeRequest(headers: Record<string, string> = {}, body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/agents/run', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

console.log('\n▶️ Agents Run Route Tests\n')

async function run() {
  // No auth (cookie or bearer) should be rejected before any run starts
  {
    const res = await POST(makeRequest({}, { agentId: 'any-agent-id' }))
    const body = await res.json() as Record<string, unknown>
    assert(res.status >= 400, 'POST fails closed when request is unauthenticated')
    assert(typeof body.error === 'string' && body.error.length > 0, 'POST returns an error message when unauthenticated')
  }

  // Malformed bearer token should also fail auth path
  {
    const res = await POST(makeRequest({ Authorization: 'Bearer invalid-token' }, { agentId: 'any-agent-id' }))
    const body = await res.json() as Record<string, unknown>
    assert(res.status >= 400, 'POST fails closed when bearer token cannot be resolved to a user')
    assert(typeof body.error === 'string' && body.error.length > 0, 'POST keeps error response shape for invalid bearer token')
  }

  console.log('\n' + '='.repeat(50))
  console.log(`Results: ${passed} passed, ${failed} failed`)
  console.log('='.repeat(50))

  if (failed > 0) {
    process.exit(1)
  }

  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
