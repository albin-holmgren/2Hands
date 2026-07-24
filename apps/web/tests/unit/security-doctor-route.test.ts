#!/usr/bin/env npx tsx

import { NextRequest } from 'next/server'
import { GET } from '../../src/app/api/security/doctor/route'

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

async function getJson(res: Response): Promise<Record<string, unknown>> {
  return await res.json() as Record<string, unknown>
}

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/security/doctor', {
    method: 'GET',
    headers,
  })
}

console.log('\n🩺 Security Doctor Route Tests\n')

async function run() {
  const originalEnv = { ...process.env }

  try {
    process.env.INTERNAL_API_SECRET = 'test-internal-secret'

    {
      const res = await GET(makeRequest())
      assert(res.status === 401, 'Returns 401 when request is not authorized')
    }

    {
      delete process.env.CREDENTIAL_ENCRYPTION_KEY
      delete process.env.VM_SECRET
      process.env.CRON_SECRET = 'cron-secret'
      process.env.AI_GATEWAY_API_KEY = 'gateway-key'

      const res = await GET(makeRequest({ 'x-security-audit-secret': 'test-internal-secret' }))
      const body = await getJson(res)

      assert(res.status === 503, 'Returns 503 when critical runtime security checks fail')
      assert(body.status === 'unhealthy', 'Marks doctor status as unhealthy on critical failures')
      assert(Array.isArray(body.findings), 'Returns findings array')
    }

    {
      process.env.CREDENTIAL_ENCRYPTION_KEY = 'a'.repeat(64)
      process.env.VM_SECRET = 'vm-secret'
      process.env.CRON_SECRET = 'cron-secret'
      process.env.AI_GATEWAY_API_KEY = 'gateway-key'

      const res = await GET(makeRequest({ 'x-security-audit-secret': 'test-internal-secret' }))
      const body = await getJson(res)

      assert(res.status === 200, 'Returns 200 when doctor checks pass without high/critical failures')
      assert(body.status === 'healthy', 'Marks doctor status as healthy when no high/critical failures exist')
      assert(typeof body.summary === 'object' && body.summary !== null, 'Returns summary object')
    }
  } finally {
    process.env = originalEnv
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
  console.error('Doctor route tests failed with error:', error)
  process.exit(1)
})
