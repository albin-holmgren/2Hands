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
  
  const { data: agents } = await supabaseAdmin
    .from('agents')
    .select('id, name, status')
    .eq('user_id', testUser.id)
    .in('status', ['working', 'initializing', 'idle'])
  
  console.log('Found running/idle agents:', agents?.length || 0)
  
  for (const agent of agents || []) {
    console.log(`Resetting agent ${agent.id} (${agent.name}) from ${agent.status} to completed`)
    await supabaseAdmin.from('agents').update({ status: 'completed' } as never).eq('id', agent.id)
  }
  
  console.log('Done')
}

main()
