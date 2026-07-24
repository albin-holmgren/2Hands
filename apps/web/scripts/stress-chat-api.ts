/**
 * Stress test for /api/chat streaming endpoint
 * 
 * Tests:
 * - TTFB (time to first byte/chunk)
 * - Total response time
 * - Stream stalls (gaps > 3s between chunks)
 * - Error rates (4xx, 5xx, timeouts)
 * 
 * Run:
 *   npx tsx scripts/stress-chat-api.ts
 * 
 * Environment:
 *   Uses .env.local for Supabase credentials
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const API_BASE = process.env.STRESS_API_URL || 'http://localhost:3000'

function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>
    if (typeof obj.message === 'string') return obj.message
  }
  return String(err)
}

// Test configuration
const CONFIG = {
  // Sequential test (respects rate limit of 60/min = 1/sec)
  totalRequests: 10,
  // Delay between requests (ms) - 1500ms = ~40 req/min, safely under 60/min limit
  delayBetweenRequestsMs: 1500,
  durationSeconds: 300,
  userCount: 1,
  conversationTurns: 12,
  // Test prompts (short to minimize Anthropic cost)
  prompts: [
    'Hi',
    'What is 2+2?',
    'Tell me a one-sentence joke.',
  ],
  // Timeouts
  requestTimeoutMs: 60_000,
  staleChunkThresholdMs: 5_000,
}

type StressMode = 'sequential' | 'soak' | 'multi' | 'conversation'

function readInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const MODE = (process.env.STRESS_MODE as StressMode) || 'sequential'
const TOTAL_REQUESTS = readInt('STRESS_TOTAL_REQUESTS', CONFIG.totalRequests)
const DELAY_MS = readInt('STRESS_DELAY_MS', CONFIG.delayBetweenRequestsMs)
const DURATION_SECONDS = readInt('STRESS_DURATION_SECONDS', CONFIG.durationSeconds)
const USER_COUNT = Math.max(1, readInt('STRESS_USER_COUNT', CONFIG.userCount))
const CONVERSATION_TURNS = Math.max(1, readInt('STRESS_CONVERSATION_TURNS', CONFIG.conversationTurns))
const RUN_ID = process.env.STRESS_RUN_ID || ''

interface TestResult {
  id: number
  prompt: string
  status: number | 'timeout' | 'error'
  ttfb: number | null // ms to first chunk
  totalTime: number // ms total
  chunksReceived: number
  stalls: number // gaps > threshold
  error?: string
  responsePreview?: string
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function getTestUserToken(index: number): Promise<{ token: string; userId: string } | null> {
  const base = USER_COUNT <= 1 ? 'stress-test' : `stress-test-${index + 1}`
  const testEmail = RUN_ID ? `${base}-${RUN_ID}@2hands.local` : `${base}@2hands.local`
  const testPassword = 'StressTest123!'

  // Try to sign in with existing test user first
  const supabaseClient = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  })

  if (!signInError && signInData.session) {
    console.log('Using existing test user')
    return { token: signInData.session.access_token, userId: signInData.user.id }
  }

  // Create new test user if sign-in failed
  console.log('Creating new test user...')
  const { error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: testEmail,
    email_confirm: true,
    password: testPassword,
  })

  if (createError) {
    const msg = getErrorMessage(createError)
    if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists')) {
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
      const existing = usersData?.users?.find(u => u.email === testEmail)
      if (existing) {
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
          password: testPassword,
          email_confirm: true,
        })
        if (!updateError) {
          const { data: retrySignIn, error: retrySignInError } = await supabaseClient.auth.signInWithPassword({
            email: testEmail,
            password: testPassword,
          })
          if (!retrySignInError && retrySignIn.session) {
            console.log('Using existing test user (password reset)')
            return { token: retrySignIn.session.access_token, userId: retrySignIn.user.id }
          }
        }
      }
    }
    console.error('Failed to create test user:', createError)
    return null
  }

  // Sign in with new user
  const { data: newSignIn, error: newSignInError } = await supabaseClient.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  })

  if (newSignInError || !newSignIn.session) {
    console.error('Failed to sign in new test user:', newSignInError)
    return null
  }

  return { token: newSignIn.session.access_token, userId: newSignIn.user.id }
}

async function runSingleRequest(
  requestId: number,
  token: string,
  conversationId: string | null
): Promise<TestResult> {
  const prompt = CONFIG.prompts[requestId % CONFIG.prompts.length]
  const startTime = Date.now()
  let ttfb: number | null = null
  let chunksReceived = 0
  let stalls = 0
  let lastChunkTime = startTime
  let responseText = ''

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CONFIG.requestTimeoutMs)

  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        ...(conversationId && { conversationId }),
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errorBody = await res.text()
      clearTimeout(timeout)
      return {
        id: requestId,
        prompt,
        status: res.status,
        ttfb: null,
        totalTime: Date.now() - startTime,
        chunksReceived: 0,
        stalls: 0,
        error: `HTTP ${res.status}: ${errorBody.slice(0, 200)}`,
      }
    }

    // Read streaming response
    const reader = res.body?.getReader()
    if (!reader) {
      clearTimeout(timeout)
      return {
        id: requestId,
        prompt,
        status: res.status,
        ttfb: null,
        totalTime: Date.now() - startTime,
        chunksReceived: 0,
        stalls: 0,
        error: 'No response body',
      }
    }

    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const now = Date.now()
      chunksReceived++

      if (ttfb === null) {
        ttfb = now - startTime
        lastChunkTime = now
      } else {
        if (now - lastChunkTime > CONFIG.staleChunkThresholdMs) {
          stalls++
        }
        lastChunkTime = now
      }

      // Accumulate response text (limit to 200 chars for preview)
      const text = decoder.decode(value, { stream: true })
      if (responseText.length < 200) {
        responseText += text
      }
    }

    clearTimeout(timeout)
    return {
      id: requestId,
      prompt,
      status: res.status,
      ttfb,
      totalTime: Date.now() - startTime,
      chunksReceived,
      stalls,
      responsePreview: responseText.slice(0, 100),
    }
  } catch (err: unknown) {
    clearTimeout(timeout)
    
    const isTimeout = (err as { name?: string } | null)?.name === 'AbortError'
    return {
      id: requestId,
      prompt,
      status: isTimeout ? 'timeout' : 'error',
      ttfb,
      totalTime: Date.now() - startTime,
      chunksReceived,
      stalls,
      error: isTimeout ? 'Request timeout' : getErrorMessage(err),
    }
  }
}

async function createConversationForUser(userId: string): Promise<string | null> {
  const title = RUN_ID ? `Stress Test (${RUN_ID})` : 'Stress Test'
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .insert({ user_id: userId, title })
    .select('id')
    .single()

  if (error || !data) {
    console.error('Failed to create conversation:', error)
    return null
  }

  return data.id as string
}

function printSummary(results: TestResult[], concurrency: number) {
  const successful = results.filter(r => r.status === 200)
  const failed = results.filter(r => r.status !== 200)
  const timeouts = results.filter(r => r.status === 'timeout')
  const errors = results.filter(r => r.status === 'error')
  const http4xx = results.filter(r => typeof r.status === 'number' && r.status >= 400 && r.status < 500)
  const http5xx = results.filter(r => typeof r.status === 'number' && r.status >= 500)

  const ttfbs = successful.map(r => r.ttfb!).filter(t => t !== null).sort((a, b) => a - b)
  const totalTimes = successful.map(r => r.totalTime).sort((a, b) => a - b)
  const totalStalls = results.reduce((sum, r) => sum + r.stalls, 0)

  const p50 = (arr: number[]) => arr[Math.floor(arr.length * 0.5)] || 0
  const p95 = (arr: number[]) => arr[Math.floor(arr.length * 0.95)] || 0
  const p99 = (arr: number[]) => arr[Math.floor(arr.length * 0.99)] || 0

  console.log(`\n📊 Summary for concurrency=${concurrency}:`)
  console.log(`   Total requests: ${results.length}`)
  console.log(`   ✅ Successful:  ${successful.length} (${(successful.length / results.length * 100).toFixed(1)}%)`)
  console.log(`   ❌ Failed:      ${failed.length}`)
  console.log(`      - Timeouts:  ${timeouts.length}`)
  console.log(`      - Errors:    ${errors.length}`)
  console.log(`      - 4xx:       ${http4xx.length}`)
  console.log(`      - 5xx:       ${http5xx.length}`)
  console.log(`   ⏱️  TTFB (ms):   p50=${p50(ttfbs).toFixed(0)}, p95=${p95(ttfbs).toFixed(0)}, p99=${p99(ttfbs).toFixed(0)}`)
  console.log(`   ⏱️  Total (ms):  p50=${p50(totalTimes).toFixed(0)}, p95=${p95(totalTimes).toFixed(0)}, p99=${p99(totalTimes).toFixed(0)}`)
  console.log(`   🔴 Stalls:      ${totalStalls}`)

  // Show sample errors
  if (failed.length > 0) {
    console.log(`\n   Sample errors:`)
    failed.slice(0, 3).forEach(r => {
      console.log(`     - [${r.status}] ${r.error}`)
    })
  }
}

async function main() {
  console.log('🧪 2Hands Chat API Stress Test')
  console.log('================================')
  console.log(`Target: ${API_BASE}`)
  console.log(`Mode: ${MODE}`)
  console.log(`Users: ${USER_COUNT}`)
  console.log(`Delay between requests: ${DELAY_MS}ms`)

  // Get test user token
  console.log('\n🔐 Getting test user tokens...')
  const auths = (await Promise.all(Array.from({ length: USER_COUNT }, (_, i) => getTestUserToken(i))))
    .filter(Boolean) as Array<{ token: string; userId: string }>

  if (auths.length !== USER_COUNT) {
    console.error(`❌ Could not get enough test user tokens (${auths.length}/${USER_COUNT}). Aborting.`)
    process.exit(1)
  }

  console.log(`✅ Got ${auths.length} token(s)`)

  const results: TestResult[] = []

  if (MODE === 'conversation') {
    const auth = auths[0]
    const conversationId = await createConversationForUser(auth.userId)
    if (!conversationId) {
      console.error('❌ Could not create conversation. Aborting.')
      process.exit(1)
    }
    console.log(`\n🚀 Running conversation test (${CONVERSATION_TURNS} turns) with conversationId=${conversationId}`)
    for (let i = 0; i < CONVERSATION_TURNS; i++) {
      const result = await runSingleRequest(i, auth.token, conversationId)
      results.push(result)
      const status = result.status === 200 ? '✅' : '❌'
      console.log(`  ${status} Turn ${i + 1}/${CONVERSATION_TURNS}: ${result.status} | TTFB: ${result.ttfb || 'N/A'}ms | Total: ${result.totalTime}ms`)
      if (result.error) {
        console.log(`     Error: ${result.error}`)
      }
      if (i < CONVERSATION_TURNS - 1) {
        await sleep(DELAY_MS)
      }
    }
  } else if (MODE === 'soak') {
    const auth = auths[0]
    const endAt = Date.now() + DURATION_SECONDS * 1000
    let i = 0
    console.log(`\n🚀 Running soak test for ${DURATION_SECONDS}s...`)
    while (Date.now() < endAt) {
      const result = await runSingleRequest(i, auth.token, null)
      results.push(result)
      i++
      if (result.status !== 200) {
        console.log(`  ❌ Request ${i}: ${result.status} | ${result.error || ''}`)
      }
      await sleep(DELAY_MS)
    }
  } else if (MODE === 'multi') {
    const endAt = Date.now() + DURATION_SECONDS * 1000
    console.log(`\n🚀 Running multi-user paced test for ${DURATION_SECONDS}s...`)
    const perUserResults = await Promise.all(
      auths.map(async (auth, userIndex) => {
        const r: TestResult[] = []
        let i = userIndex * 1_000_000
        while (Date.now() < endAt) {
          const result = await runSingleRequest(i, auth.token, null)
          r.push(result)
          i++
          await sleep(DELAY_MS)
        }
        return r
      })
    )
    results.push(...perUserResults.flat())
  } else {
    const auth = auths[0]
    console.log(`\n🚀 Running ${TOTAL_REQUESTS} requests...`)
    for (let i = 0; i < TOTAL_REQUESTS; i++) {
      const result = await runSingleRequest(i, auth.token, null)
      results.push(result)
      const status = result.status === 200 ? '✅' : '❌'
      console.log(`  ${status} Request ${i + 1}/${TOTAL_REQUESTS}: ${result.status} | TTFB: ${result.ttfb || 'N/A'}ms | Total: ${result.totalTime}ms`)
      if (result.error) {
        console.log(`     Error: ${result.error}`)
      }
      if (i < TOTAL_REQUESTS - 1) {
        await sleep(DELAY_MS)
      }
    }
  }

  // Print summary
  printSummary(results, MODE === 'multi' ? USER_COUNT : 1)

  // Recommendations
  const errorRate = results.filter(r => r.status !== 200).length / results.length
  const avgTtfb = results
    .filter(r => r.ttfb !== null)
    .reduce((sum, r) => sum + (r.ttfb || 0), 0) / (results.filter(r => r.ttfb !== null).length || 1)

  console.log('\n💡 Recommendations:')
  if (errorRate > 0.05) {
    console.log('   ⚠️  Error rate > 5% — investigate failures')
  }
  if (avgTtfb > 3000) {
    console.log('   ⚠️  TTFB > 3s — optimize cold start / DB queries')
  }
  if (results.some(r => r.stalls > 0)) {
    console.log('   ⚠️  Stream stalls detected — check streaming implementation')
  }
  if (errorRate <= 0.01 && avgTtfb < 2000) {
    console.log('   ✅ All tests passed! Chat API is healthy.')
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
