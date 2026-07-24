import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function main() {
  const { data: users } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
  const testUser = users?.users?.find(u => u.email === 'agent-vm-test@2hands.local')
  if (!testUser) { console.log('No test user found'); return }
  
  console.log('Test user:', testUser.id)
  
  // Check profile
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', testUser.id)
    .single()
  
  console.log('Profile:', profile)
  console.log('Profile error:', profileErr)
  
  // Check agents
  const { data: agents } = await supabaseAdmin
    .from('agents')
    .select('id, name, status')
    .eq('user_id', testUser.id)
  
  console.log('All agents:', agents)
  
  // Count running agents
  const runningAgents = agents?.filter(a => ['working', 'initializing'].includes(a.status)) || []
  console.log('Running agents:', runningAgents.length)
}

main()
