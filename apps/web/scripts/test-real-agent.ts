import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const API_BASE = 'http://localhost:3000'

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function getTestUserToken() {
  const testEmail = 'agent-vm-test@2hands.local'
  const testPassword = 'AgentVMTest123!'
  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: signIn } = await supabaseClient.auth.signInWithPassword({ email: testEmail, password: testPassword })
  if (signIn.session) return { token: signIn.session.access_token, userId: signIn.user.id }
  
  await supabaseAdmin.auth.admin.createUser({ email: testEmail, email_confirm: true, password: testPassword })
  const { data: retry } = await supabaseClient.auth.signInWithPassword({ email: testEmail, password: testPassword })
  if (retry.session) return { token: retry.session.access_token, userId: retry.user.id }
  return null
}

async function main() {
  console.log('🖥️  Real Agent VM Execution Test')
  console.log('=================================')
  
  const auth = await getTestUserToken()
  if (!auth) { console.error('❌ Could not get test user token'); process.exit(1) }
  console.log('✅ Signed in as user:', auth.userId)

  // Create agent with a simple task
  const createRes = await fetch(`${API_BASE}/api/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
    body: JSON.stringify({
      name: `VM Test Agent ${Date.now()}`,
      type: 'one_time',
      config: { description: 'Take a screenshot and report what you see. Then mark the task complete.' },
    }),
  })
  if (!createRes.ok) throw new Error(`Create agent failed: ${await createRes.text()}`)
  const agent = await createRes.json()
  console.log('✅ Created agent:', agent.id)

  // Trigger real VM execution via provision endpoint
  console.log('🚀 Triggering VM provision + execution...')
  const provisionRes = await fetch(`${API_BASE}/api/agents/provision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
    body: JSON.stringify({ agentId: agent.id }),
  })
  
  if (!provisionRes.ok) {
    const body = await provisionRes.text()
    console.error('❌ Provision failed:', provisionRes.status, body)
    await fetch(`${API_BASE}/api/agents/${agent.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${auth.token}` } })
    process.exit(1)
  }
  
  const provisionData = await provisionRes.json()
  console.log('✅ VM provisioned:', provisionData)

  // Wait for execution to complete (check status periodically)
  console.log('⏳ Waiting for agent execution (max 60s)...')
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const { data: agentRow } = await supabaseAdmin.from('agents').select('status').eq('id', agent.id).single()
    console.log(`   Status after ${(i+1)*5}s: ${agentRow?.status}`)
    if (agentRow?.status === 'completed' || agentRow?.status === 'failed') break
  }

  // Final status check
  const { data: finalAgent } = await supabaseAdmin.from('agents').select('*').eq('id', agent.id).single()
  console.log('\n📊 Final agent state:')
  console.log('   Status:', finalAgent?.status)
  console.log('   VM IP:', finalAgent?.vm_ip)
  
  // Check messages in agent conversation
  if (finalAgent?.conversation_id) {
    const { data: msgs } = await supabaseAdmin
      .from('messages')
      .select('role, content')
      .eq('conversation_id', finalAgent.conversation_id)
      .order('created_at', { ascending: false })
      .limit(3)
    console.log('   Recent messages:', msgs?.length || 0)
  }

  // Cleanup
  await fetch(`${API_BASE}/api/agents/${agent.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${auth.token}` } })
  console.log('🧹 Cleaned up test agent')
  
  if (finalAgent?.status === 'completed') {
    console.log('\n✅ Real VM execution test PASSED!')
  } else {
    console.log('\n⚠️  Agent did not complete - check server logs for details')
  }
}

main().catch(err => { console.error('❌ Test failed:', err); process.exit(1) })
