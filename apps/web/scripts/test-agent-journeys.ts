import { config } from 'dotenv'
config({ path: '.env.local' })

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET
const API_BASE = process.env.STRESS_API_URL || 'http://localhost:3000'

const CLEANUP = (process.env.AGENT_JOURNEY_CLEANUP ?? '1') === '1'
const RUN_REAL_PROVISION = (process.env.AGENT_JOURNEY_REAL_PROVISION ?? '0') === '1'
const RUN_ID = process.env.AGENT_JOURNEY_RUN_ID || ''

type MessageRow = {
  id: string
  role: string
  content: string
  metadata: Record<string, unknown> | null
  created_at: string
}

function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>
    if (typeof obj.message === 'string') return obj.message
  }
  return String(err)
}

function getStringField(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== 'object') return null
  const rec = obj as Record<string, unknown>
  return typeof rec[key] === 'string' ? rec[key] : null
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

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function getOrCreateTestUserToken(): Promise<{ token: string; userId: string } | null> {
  const testEmail = RUN_ID ? `agent-journey-${RUN_ID}@2hands.local` : 'agent-journey@2hands.local'
  const testPassword = 'AgentJourneyTest123!'

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

async function ensureAiManagerConversation(userId: string): Promise<string> {
  const { data: convs } = await supabaseAdmin
    .from('conversations')
    .select('id, created_at')
    .eq('user_id', userId)
    .eq('title', 'AI Manager')
    .order('created_at', { ascending: true })

  const all = (convs || []) as Array<{ id: string; created_at: string }>

  if (all.length > 1) {
    const keep = all[0]
    const dupes = all.slice(1).map(c => c.id)
    await supabaseAdmin.from('conversations').delete().in('id', dupes)
    return keep.id
  }

  if (all.length === 1) {
    return all[0].id
  }

  const { data: created, error } = await supabaseAdmin
    .from('conversations')
    .insert({ user_id: userId, title: 'AI Manager', status: 'active' } as never)
    .select('id')
    .single()

  if (error || !created) {
    throw new Error(`Failed to create AI Manager conversation: ${error?.message || 'unknown error'}`)
  }

  return (created as { id: string }).id
}

async function createAgent(token: string, name: string, description: string): Promise<{ id: string; conversation_id: string | null }> {
  const res = await fetch(`${API_BASE}/api/agents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name,
      type: 'journey',
      config: { description },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Create agent failed: HTTP ${res.status} ${body.slice(0, 200)}`)
  }

  return (await res.json()) as { id: string; conversation_id: string | null }
}

async function patchAgent(token: string, agentId: string, updates: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${API_BASE}/api/agents/${agentId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(updates),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Patch agent failed: HTTP ${res.status} ${body.slice(0, 200)}`)
  }
}

async function postProgress(agentId: string, type: 'started' | 'progress' | 'completed' | 'insight', payload: Record<string, unknown>): Promise<void> {
  const bodyStr = JSON.stringify({ agentId, type, ...payload })
  const headers = createSignedHeaders(bodyStr)

  const res = await fetch(`${API_BASE}/api/agents/progress`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: bodyStr,
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Progress ${type} failed: HTTP ${res.status} ${txt.slice(0, 200)}`)
  }
}

async function readRecentMessages(conversationId: string, limit: number = 20): Promise<MessageRow[]> {
  const { data } = await supabaseAdmin
    .from('messages')
    .select('id, role, content, metadata, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data || []) as MessageRow[]
}

async function assertAgentConversationHas(conversationId: string, predicate: (m: MessageRow) => boolean, label: string) {
  const msgs = await readRecentMessages(conversationId, 50)
  const found = msgs.some(predicate)
  if (!found) {
    const preview = msgs.slice(0, 5).map(m => ({ role: m.role, type: m.metadata?.type, content: String(m.content).slice(0, 80) }))
    throw new Error(`Assertion failed (${label}). Recent messages preview: ${JSON.stringify(preview)}`)
  }
}

async function assertAiManagerReport(managerConversationId: string, agentId: string, reportType: 'completed' | 'insight') {
  const msgs = await readRecentMessages(managerConversationId, 50)
  const found = msgs.some(m => m.metadata?.type === 'agent_report' && m.metadata?.agent_id === agentId && m.metadata?.report_type === reportType)
  if (!found) {
    const preview = msgs.slice(0, 5).map(m => ({ type: m.metadata?.type, report_type: m.metadata?.report_type, content: String(m.content).slice(0, 80) }))
    throw new Error(`Assertion failed (AI Manager agent_report ${reportType}). Preview: ${JSON.stringify(preview)}`)
  }
}

async function assertAgentStatus(agentId: string, expected: string) {
  const { data: agent, error } = await supabaseAdmin
    .from('agents')
    .select('id, status, schedule_type, next_run_at')
    .eq('id', agentId)
    .single()

  if (error || !agent) {
    throw new Error(`Failed to load agent row: ${error?.message || 'unknown error'}`)
  }

  const status = getStringField(agent, 'status')
  if (status !== expected) {
    const scheduleType = getStringField(agent, 'schedule_type')
    const nextRunAt = getStringField(agent, 'next_run_at')
    throw new Error(`Expected agent status '${expected}', got '${status}' (schedule_type=${scheduleType}, next_run_at=${nextRunAt})`)
  }
}

async function deleteAgent(token: string, agentId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/agents/${agentId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Delete agent failed: HTTP ${res.status} ${body.slice(0, 200)}`)
  }
}

async function runJourney(
  managerConversationId: string,
  token: string,
  journeyName: string,
  agentName: string,
  description: string,
  mode: 'once' | 'scheduled',
  runReal: boolean
) {
  console.log(`\n🧩 Journey: ${journeyName}`)

  const agent = await createAgent(token, agentName, description)
  const agentId = agent.id as string
  const agentConversationId = agent.conversation_id as string | null

  if (!agentConversationId) {
    throw new Error('Agent has no conversation_id')
  }

  if (mode === 'scheduled') {
    await patchAgent(token, agentId, {
      schedule_type: 'scheduled',
      schedule_cron: '*/15 * * * *',
      schedule_timezone: 'UTC',
    })
  } else {
    await patchAgent(token, agentId, {
      schedule_type: 'once',
    })
  }

  await postProgress(agentId, 'started', {
    message: 'Acknowledged. Starting work.',
    plan: ['Clarify requirements', 'Do the work', 'Report back with deliverables'],
    eta_seconds: 120,
  })

  await postProgress(agentId, 'progress', {
    message: 'Making progress',
    done: ['Collected initial context'],
    found: ['No blockers so far'],
    next: ['Draft output', 'Summarize'],
    eta_seconds: 60,
  })

  await postProgress(agentId, 'insight', {
    message: 'Key insight from the work-in-progress.',
  })

  await postProgress(agentId, 'completed', {
    message: 'Final deliverable prepared.',
    summary: ['Delivered the requested output', 'Included next steps'],
    deliverables: [{ name: 'Draft output', type: 'text' }],
    next_steps: ['Review and approve', 'Decide whether to schedule recurring runs'],
  })

  await sleep(400)

  await assertAgentConversationHas(
    agentConversationId,
    m => m.metadata?.type === 'acknowledgement' && m.metadata?.agent_id === agentId,
    'agent acknowledgement message'
  )

  await assertAgentConversationHas(
    agentConversationId,
    m => m.metadata?.type === 'progress' && m.metadata?.agent_id === agentId,
    'agent progress message'
  )

  await assertAgentConversationHas(
    agentConversationId,
    m => m.metadata?.type === 'completion' && m.metadata?.agent_id === agentId,
    'agent completion message'
  )

  await assertAiManagerReport(managerConversationId, agentId, 'insight')
  await assertAiManagerReport(managerConversationId, agentId, 'completed')

  if (mode === 'scheduled') {
    await assertAgentStatus(agentId, 'idle')
  } else {
    await assertAgentStatus(agentId, 'completed')
  }

  if (runReal) {
    console.log('  ▶️  Running real provision (costly)...')
    const provisionRes = await fetch(`${API_BASE}/api/agents/provision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ agentId }),
    })

    if (!provisionRes.ok) {
      const body = await provisionRes.text()
      throw new Error(`Provision failed: HTTP ${provisionRes.status} ${body.slice(0, 200)}`)
    }

    console.log('  ⏳ Waiting up to 90s for completion...')
    const endAt = Date.now() + 90_000
    while (Date.now() < endAt) {
      const { data } = await supabaseAdmin.from('agents').select('status').eq('id', agentId).single()
      const status = getStringField(data, 'status')
      if (status === 'completed' || status === 'failed' || status === 'idle') {
        break
      }
      await sleep(5000)
    }

    console.log('  ✅ Real provision run finished (check server logs for detailed executor output)')
  }

  if (CLEANUP) {
    await deleteAgent(token, agentId)
  }

  console.log('  ✅ Passed')
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
    console.error('Missing required Supabase env vars')
    process.exit(1)
  }

  if (!INTERNAL_API_SECRET) {
    console.error('Missing INTERNAL_API_SECRET')
    process.exit(1)
  }

  console.log('🧪 Agent Journeys Test')
  console.log('======================')
  console.log(`Target: ${API_BASE}`)

  const auth = await getOrCreateTestUserToken()
  if (!auth) {
    console.error('Could not get test user token')
    process.exit(1)
  }

  const managerConversationId = await ensureAiManagerConversation(auth.userId)

  await runJourney(
    managerConversationId,
    auth.token,
    'Research & summary (one-time)',
    'Research Agent',
    'Research a topic and summarize key points.',
    'once',
    RUN_REAL_PROVISION
  )

  await runJourney(
    managerConversationId,
    auth.token,
    'Email draft (one-time)',
    'Email Draft Agent',
    'Draft a professional email response to a customer.',
    'once',
    false
  )

  await runJourney(
    managerConversationId,
    auth.token,
    'Weekly report (scheduled)',
    'Weekly Report Agent',
    'Prepare a weekly metrics report and post a summary.',
    'scheduled',
    false
  )

  console.log('\n✅ All journeys passed')
}

main().catch(err => {
  console.error('❌ Journeys test failed:', err)
  process.exit(1)
})
