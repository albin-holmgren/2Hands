import { config } from 'dotenv'
config({ path: '.env.local' })

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET
const API_BASE = process.env.STRESS_API_URL || 'http://localhost:3000'

function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>
    if (typeof obj.message === 'string') return obj.message
  }
  return String(err)
}

function getIdFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const obj = body as Record<string, unknown>
  return typeof obj.id === 'string' ? obj.id : null
}

function readInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function createSignedHeaders(payload: string): Record<string, string> {
  if (!INTERNAL_API_SECRET) {
    throw new Error('INTERNAL_API_SECRET is not configured')
  }
  const timestamp = Math.floor(Date.now() / 1000)
  const message = `${timestamp}.${payload}`
  const signature = crypto.createHmac('sha256', INTERNAL_API_SECRET).update(message).digest('hex')
  return {
    'X-Internal-Signature': signature,
    'X-Internal-Timestamp': String(timestamp),
  }
}

const USER_COUNT = Math.max(1, readInt('AGENT_STRESS_USER_COUNT', 2))
const ITERATIONS_PER_USER = Math.max(1, readInt('AGENT_STRESS_ITERATIONS', 10))
const DELAY_MS = Math.max(0, readInt('AGENT_STRESS_DELAY_MS', 3500))
const CLEANUP = (process.env.AGENT_STRESS_CLEANUP ?? '1') === '1'
const INCLUDE_PROVISION = (process.env.AGENT_STRESS_INCLUDE_PROVISION ?? '0') === '1'
const RUN_ID = process.env.AGENT_STRESS_RUN_ID || ''

type Endpoint = 'create' | 'get' | 'progress_started' | 'progress_update' | 'progress_completed' | 'delete' | 'provision'

type OpResult = {
  endpoint: Endpoint
  ok: boolean
  status: number | 'error'
  ms: number
  error?: string
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function getTestUserToken(index: number): Promise<{ token: string; userId: string } | null> {
  const base = USER_COUNT <= 1 ? 'agent-stress-test' : `agent-stress-test-${index + 1}`
  const testEmail = RUN_ID ? `${base}-${RUN_ID}@2hands.local` : `${base}@2hands.local`
  const testPassword = 'AgentStressTest123!'

  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  })

  if (!signInError && signInData.session) {
    return { token: signInData.session.access_token, userId: signInData.user.id }
  }

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
        await supabaseAdmin.auth.admin.updateUserById(existing.id, {
          password: testPassword,
          email_confirm: true,
        })
      }
    } else {
      console.error('Failed to create test user:', createError)
      return null
    }
  }

  const { data: retrySignIn, error: retryError } = await supabaseClient.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  })

  if (retryError || !retrySignIn.session) {
    console.error('Failed to sign in test user:', retryError)
    return null
  }

  return { token: retrySignIn.session.access_token, userId: retrySignIn.user.id }
}

async function timedFetch(endpoint: Endpoint, url: string, init: RequestInit): Promise<OpResult & { body?: unknown }> {
  const start = Date.now()
  try {
    const res = await fetch(url, init)
    const ms = Date.now() - start
    const text = await res.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text
    }

    if (!res.ok) {
      const err = typeof body === 'string' ? body : JSON.stringify(body)
      return { endpoint, ok: false, status: res.status, ms, error: err.slice(0, 200), body }
    }

    return { endpoint, ok: true, status: res.status, ms, body }
  } catch (e) {
    return { endpoint, ok: false, status: 'error', ms: Date.now() - start, error: getErrorMessage(e) }
  }
}

async function postProgress(agentId: string, type: 'started' | 'progress' | 'completed', payload: Record<string, unknown>): Promise<OpResult> {
  const bodyStr = JSON.stringify({ agentId, type, ...payload })
  const headers = createSignedHeaders(bodyStr)
  const endpoint: Endpoint =
    type === 'started'
      ? 'progress_started'
      : type === 'completed'
        ? 'progress_completed'
        : 'progress_update'

  const result = await timedFetch(endpoint, `${API_BASE}/api/agents/progress`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: bodyStr,
  })

  return { endpoint: result.endpoint, ok: result.ok, status: result.status, ms: result.ms, error: result.error }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.floor(sorted.length * p)
  return sorted[Math.min(sorted.length - 1, Math.max(0, idx))]
}

function summarize(results: OpResult[]) {
  const byEndpoint = new Map<Endpoint, OpResult[]>()
  for (const r of results) {
    const arr = byEndpoint.get(r.endpoint) || []
    arr.push(r)
    byEndpoint.set(r.endpoint, arr)
  }

  const total = results.length
  const ok = results.filter(r => r.ok).length
  const fail = total - ok

  console.log('\n📊 Agent Stress Summary')
  console.log('=======================')
  console.log(`Target: ${API_BASE}`)
  console.log(`Users: ${USER_COUNT}`)
  console.log(`Iterations/user: ${ITERATIONS_PER_USER}`)
  console.log(`Delay: ${DELAY_MS}ms`)
  console.log(`Include provision: ${INCLUDE_PROVISION ? 'yes' : 'no'}`)
  console.log(`Cleanup: ${CLEANUP ? 'yes' : 'no'}`)
  console.log('')
  console.log(`Total ops: ${total}`)
  console.log(`✅ OK:     ${ok} (${((ok / total) * 100).toFixed(1)}%)`)
  console.log(`❌ Fail:   ${fail}`)

  for (const [endpoint, ops] of [...byEndpoint.entries()]) {
    const okCount = ops.filter(o => o.ok).length
    const failCount = ops.length - okCount
    const ms = ops.map(o => o.ms)
    console.log(`\n${endpoint}`)
    console.log(`  ops=${ops.length} ok=${okCount} fail=${failCount}`)
    console.log(
      `  ms: p50=${percentile(ms, 0.5).toFixed(0)} p95=${percentile(ms, 0.95).toFixed(0)} p99=${percentile(ms, 0.99).toFixed(0)}`
    )

    const sampleFail = ops.find(o => !o.ok)
    if (sampleFail) {
      console.log(`  sampleFail: [${sampleFail.status}] ${sampleFail.error || ''}`)
    }
  }
}

async function runUser(userIndex: number, token: string): Promise<OpResult[]> {
  const ops: OpResult[] = []

  for (let i = 0; i < ITERATIONS_PER_USER; i++) {
    const name = `Agent Stress ${userIndex + 1}-${i + 1} ${new Date().toISOString().slice(11, 19)}`

    const create = await timedFetch('create', `${API_BASE}/api/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name,
        type: 'stress',
        config: { description: 'Stress test agent. Simulate progress updates and complete.' },
      }),
    })

    ops.push({ endpoint: create.endpoint, ok: create.ok, status: create.status, ms: create.ms, error: create.error })

    const agentId = create.ok ? getIdFromBody(create.body) : null

    if (!agentId) {
      if (DELAY_MS > 0) await sleep(DELAY_MS)
      continue
    }

    const getRes = await timedFetch('get', `${API_BASE}/api/agents/${agentId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    ops.push({ endpoint: getRes.endpoint, ok: getRes.ok, status: getRes.status, ms: getRes.ms, error: getRes.error })

    const started = await postProgress(agentId, 'started', { message: 'Starting stress run' })
    ops.push(started)

    const progress = await postProgress(agentId, 'progress', {
      message: 'Working',
      done: ['Created agent record'],
      found: ['Progress API reachable'],
      next: ['Complete'],
      eta_seconds: 10,
    })
    ops.push(progress)

    const completed = await postProgress(agentId, 'completed', { message: 'Completed stress run' })
    ops.push(completed)

    if (INCLUDE_PROVISION) {
      const provision = await timedFetch('provision', `${API_BASE}/api/agents/provision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ agentId }),
      })
      ops.push({ endpoint: provision.endpoint, ok: provision.ok, status: provision.status, ms: provision.ms, error: provision.error })
    }

    if (CLEANUP) {
      const del = await timedFetch('delete', `${API_BASE}/api/agents/${agentId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      ops.push({ endpoint: del.endpoint, ok: del.ok, status: del.status, ms: del.ms, error: del.error })
    }

    if (DELAY_MS > 0) {
      await sleep(DELAY_MS)
    }
  }

  return ops
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
    console.error('Missing required Supabase env vars')
    process.exit(1)
  }

  if (!INTERNAL_API_SECRET) {
    console.error('Missing INTERNAL_API_SECRET (required to stress /api/agents/progress)')
    process.exit(1)
  }

  console.log('🧪 Agent API Stress Test')
  console.log('========================')
  console.log(`Target: ${API_BASE}`)

  const auths = (await Promise.all(Array.from({ length: USER_COUNT }, (_, i) => getTestUserToken(i)))).filter(Boolean) as Array<{
    token: string
    userId: string
  }>

  if (auths.length !== USER_COUNT) {
    console.error(`Could not get enough test user tokens (${auths.length}/${USER_COUNT})`)
    process.exit(1)
  }

  const startedAt = Date.now()
  const perUserOps = await Promise.all(auths.map((a, idx) => runUser(idx, a.token)))
  const ops = perUserOps.flat()
  const elapsed = Date.now() - startedAt

  summarize(ops)

  const failRate = ops.filter(o => !o.ok).length / (ops.length || 1)
  console.log(`\nElapsed: ${(elapsed / 1000).toFixed(1)}s`) 
  console.log(`Fail rate: ${(failRate * 100).toFixed(2)}%`)

  if (failRate > 0.02) {
    process.exitCode = 1
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
