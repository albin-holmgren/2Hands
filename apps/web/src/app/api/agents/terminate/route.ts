import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { terminateAgentVM } from '@/lib/paperspace/agent-vm'
import { parseAndValidate, terminateAgentRequestSchema, validationErrorResponse } from '@/lib/validation/schemas'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    let supabase: SupabaseClient<Database> = await createClient()
    let user: User | null = null

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const { createClient: createBrowserClient } = await import('@supabase/supabase-js')
      const supabaseWithToken = createBrowserClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        }
      )
      const { data: { user: tokenUser }, error } = await supabaseWithToken.auth.getUser(token)
      if (!error && tokenUser) {
        user = tokenUser
        supabase = supabaseWithToken
      }
    } else {
      const { data: { user: cookieUser }, error } = await supabase.auth.getUser()
      if (!error) user = cookieUser
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = await parseAndValidate(request, terminateAgentRequestSchema)
    if (!parsed.success) {
      return NextResponse.json(validationErrorResponse(parsed.error), { status: parsed.status })
    }
    
    const { agentId } = parsed.data

    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('*')
      .eq('id', agentId)
      .eq('user_id', user.id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const agentData = agent as { id: string; vm_id: string | null }

    if (!agentData.vm_id) {
      return NextResponse.json({ error: 'No VM associated with this agent' }, { status: 400 })
    }

    await terminateAgentVM(agentData.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Agent terminate error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to terminate agent' },
      { status: 500 }
    )
  }
}
