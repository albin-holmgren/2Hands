#!/usr/bin/env npx tsx

import { NextRequest } from 'next/server'
import { GET, POST } from '../../src/app/api/agents/reconciliation/route'

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

function makeRequest(method: 'GET' | 'POST', headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/agents/reconciliation', {
    method,
    headers,
  })
}

console.log('\n💳 Agents Reconciliation Route Tests\n')

async function run() {
  const originalEnv = { ...process.env }

  try {
    delete process.env.CRON_SECRET

    {
      const res = await POST(makeRequest('POST'))
      const body = await res.json() as Record<string, unknown>
      assert(res.status === 500, 'POST returns 500 when CRON_SECRET is not configured')
      assert(body.error === 'Server configuration error', 'POST reports server configuration error')
    }

    {
      const res = await GET(makeRequest('GET'))
      const body = await res.json() as Record<string, unknown>
      assert(res.status === 500, 'GET returns 500 when CRON_SECRET is not configured')
      assert(body.error === 'Server configuration error', 'GET reports server configuration error')
    }

    process.env.CRON_SECRET = 'cron-test-secret'

    {
      const res = await POST(makeRequest('POST'))
      assert(res.status === 401, 'POST returns 401 when auth header is missing')
    }

    {
      const res = await GET(makeRequest('GET'))
      assert(res.status === 401, 'GET returns 401 when auth header is missing')
    }

    {
      const res = await POST(makeRequest('POST', { authorization: 'Bearer wrong-secret' }))
      assert(res.status === 401, 'POST returns 401 when auth header does not match CRON_SECRET')
    }

    {
      const res = await GET(makeRequest('GET', { authorization: 'Bearer wrong-secret' }))
      assert(res.status === 401, 'GET returns 401 when auth header does not match CRON_SECRET')
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
  console.error(error)
  process.exit(1)
})
