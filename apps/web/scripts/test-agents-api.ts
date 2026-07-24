import { config } from 'dotenv'
config({ path: '.env.local' })

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET
const API_BASE = process.env.STRESS_API_URL || 'http://localhost:3000'

const CLEANUP = (process.env.AGENT_TEST_CLEANUP ?? '1') === '1'

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>
    if (typeof obj.message === 'string') return obj.message
  }
  return String(err)
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

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function getTestUserToken(): Promise<{ token: string; userId: string } | null> {
  const runId = process.env.AGENT_TEST_RUN_ID || ''
  const testEmail = runId ? `agent-vm-test-${runId}@2hands.local` : 'agent-test@2hands.local'
  const testPassword = 'AgentTest123!'

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

async function main() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
    console.error('Missing required Supabase env vars')
    process.exit(1)
  }

  console.log('🧪 Agent API Smoke Test')
  console.log('=======================')
  console.log('Target:', API_BASE)

  const auth = await getTestUserToken()
  if (!auth) {
    console.error('❌ Could not get test user token')
    process.exit(1)
  }

  console.log('✅ Signed in as user:', auth.userId)

  // 1) Create agent
  const agentName = `Smoke Agent ${new Date().toISOString().slice(11, 19)}`
  const createRes = await fetch(`${API_BASE}/api/agents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.token}`,
    },
    body: JSON.stringify({
      name: agentName,
      type: 'smoke',
      config: { description: 'Smoke test task: report one short status update and complete.' },
    }),
  })

  if (!createRes.ok) {
    const body = await createRes.text()
    throw new Error(`Create agent failed: HTTP ${createRes.status} ${body.slice(0, 200)}`)
  }

  const agent = (await createRes.json()) as { id: string }
  console.log('✅ Created agent:', agent.id)

  // 2) Fetch agent
  const getRes = await fetch(`${API_BASE}/api/agents/${agent.id}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
  })

  if (!getRes.ok) {
    const body = await getRes.text()
    throw new Error(`Get agent failed: HTTP ${getRes.status} ${body.slice(0, 200)}`)
  }

  console.log('✅ GET /api/agents/[id] works')

  // 3) Simulate execution via internal progress endpoint
  if (!INTERNAL_API_SECRET) {
    console.log('⚠️ INTERNAL_API_SECRET not set; skipping /api/agents/progress test')
  } else {
    console.log('🚀 Sending internal progress updates...')

    const startedPayload = JSON.stringify({ agentId: agent.id, type: 'started', message: 'Starting smoke task' })
    const startedHeaders = createSignedHeaders(startedPayload)
    const startedRes = await fetch(`${API_BASE}/api/agents/progress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...startedHeaders,
      },
      body: startedPayload,
    })
    if (!startedRes.ok) {
      const body = await startedRes.text()
      throw new Error(`Progress started failed: HTTP ${startedRes.status} ${body.slice(0, 200)}`)
    }

    await sleep(250)

    const progressPayload = JSON.stringify({
      agentId: agent.id,
      type: 'progress',
      message: 'Working',
      done: ['Created agent record'],
      found: ['Progress endpoint reachable'],
      next: ['Mark completed'],
      eta_seconds: 60,
    })
    const progressHeaders = createSignedHeaders(progressPayload)
    const progressRes = await fetch(`${API_BASE}/api/agents/progress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...progressHeaders,
      },
      body: progressPayload,
    })
    if (!progressRes.ok) {
      const body = await progressRes.text()
      throw new Error(`Progress update failed: HTTP ${progressRes.status} ${body.slice(0, 200)}`)
    }

    await sleep(250)

    const completedPayload = JSON.stringify({ agentId: agent.id, type: 'completed', message: 'Smoke task completed successfully' })
    const completedHeaders = createSignedHeaders(completedPayload)
    const completedRes = await fetch(`${API_BASE}/api/agents/progress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...completedHeaders,
      },
      body: completedPayload,
    })
    if (!completedRes.ok) {
      const body = await completedRes.text()
      throw new Error(`Progress completed failed: HTTP ${completedRes.status} ${body.slice(0, 200)}`)
    }

    console.log('✅ Progress pipeline (started/progress/completed) accepted')

    // 4) Verify DB state (admin)
    const { data: agentRow, error: agentErr } = await supabaseAdmin
      .from('agents')
      .select('id, status, conversation_id, last_run_at')
      .eq('id', agent.id)
      .single()

    if (agentErr || !agentRow) {
      throw new Error(`Failed to read agent row: ${agentErr?.message || 'unknown error'}`)
    }

    console.log('ℹ️ Agent status:', agentRow.status)

    if (!agentRow.conversation_id) {
      console.log('⚠️ Agent has no conversation_id; skipping message verification')
    } else {
      const { data: msgs } = await supabaseAdmin
        .from('messages')
        .select('role, content, created_at')
        .eq('conversation_id', agentRow.conversation_id)
        .order('created_at', { ascending: false })
        .limit(5)

      console.log('ℹ️ Recent agent conversation messages:', (msgs || []).length)
    }

    if (agentRow.status !== 'completed') {
      throw new Error(`Expected agent status 'completed' after completion, got '${agentRow.status}'`)
    }

    console.log('✅ Agent completed state verified')
  }

  if (CLEANUP) {
    const delRes = await fetch(`${API_BASE}/api/agents/${agent.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${auth.token}`,
      },
    })

    if (delRes.ok) {
      console.log('🧹 Cleanup: deleted test agent')
    } else {
      const body = await delRes.text()
      console.log(`⚠️ Cleanup failed: HTTP ${delRes.status} ${body.slice(0, 200)}`)
    }
  }

  console.log('✅ Agent smoke test finished')
}

main().catch(err => {
  console.error('❌ Agent smoke test failed:', err)
  process.exit(1)
})
