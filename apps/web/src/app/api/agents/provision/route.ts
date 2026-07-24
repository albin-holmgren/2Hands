import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { provisionAgentVM } from '@/lib/paperspace/agent-vm'
import { enqueueAgentRun } from '@/lib/agents/run-queue'
import { canRunAgent } from '@/lib/limits'
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { parseAndValidate, provisionAgentRequestSchema, validationErrorResponse } from '@/lib/validation/schemas'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export async function POST(request: NextRequest) {
  try {
    console.log('[Provision] Starting agent provision...')
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
      console.log('[Provision] Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limiting
    const rateKey = createRateLimitKey(user.id, 'provision')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.provisionAgent)
    if (!rateCheck.allowed) {
      return NextResponse.json({ 
        error: 'Too many requests. Please wait before provisioning another agent.',
        code: 'RATE_LIMITED',
        retryAfter: Math.ceil((rateCheck.resetAt - Date.now()) / 1000),
      }, { status: 429 })
    }

    const parsed = await parseAndValidate(request, provisionAgentRequestSchema)
    if (!parsed.success) {
      return NextResponse.json(validationErrorResponse(parsed.error), { status: parsed.status })
    }
    
    const { agentId } = parsed.data
    console.log('[Provision] Agent ID:', agentId)

    // Check if user has enough credits and concurrent run capacity
    const runCheck = await canRunAgent(user.id, 10, supabase) // Estimate 10 credits per run
    if (!runCheck.allowed) {
      console.log('[Provision] Run check failed:', runCheck.reason)
      return NextResponse.json({ 
        error: runCheck.reason,
        code: runCheck.reason?.includes('credits') ? 'INSUFFICIENT_CREDITS' : 'CONCURRENT_LIMIT_REACHED',
      }, { status: 403 })
    }

    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('*')
      .eq('id', agentId)
      .eq('user_id', user.id)
      .single()

    if (agentError || !agent) {
      console.log('[Provision] Agent not found:', agentError)
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const agentData = agent as { id: string; name: string; conversation_id: string | null; config: { description?: string } }
    console.log('[Provision] Provisioning VM for:', agentData.name)

    // Send initial greeting to agent's conversation
    if (agentData.conversation_id) {
      await supabase.from('messages').insert({
        conversation_id: agentData.conversation_id,
        role: 'assistant',
        content: `**Hello, I'm ${agentData.name}.**\n\nI'm getting ready to work on your task:\n\n> ${agentData.config?.description || 'No description provided'}\n\nI'll update you as I make progress. You can also message me here if you have questions or want to adjust what I'm working on.`,
        metadata: { type: 'agent_greeting' },
      } as never)
    }

    const { vmId, vmIp: rawVmIp } = await provisionAgentVM({
      agentId: agentData.id,
      agentName: agentData.name,
      userId: user.id,
      taskDescription: agentData.config?.description || '',
    })

    const vmIp = typeof rawVmIp === 'string' ? rawVmIp.trim() : rawVmIp
    
    console.log('[Provision] VM provisioned:', { vmId, vmIp })

    if (vmIp) {
      const runId = randomUUID()
      const nowIso = new Date().toISOString()

      await supabase
        .from('agents')
        .update({
          status: 'initializing',
          vm_ip: vmIp,
          config: {
            ...(agentData.config || {}),
            execution_started: true,
            active_run_id: runId,
            active_run_started_at: nowIso,
            active_run_task: agentData.config?.description || '',
            active_run_mode: 'queued',
            last_retry_at: nowIso,
          },
        } as never)
        .eq('id', agentData.id)

      const enqueueResult = await enqueueAgentRun({
        runId,
        agentId: agentData.id,
        userId: user.id,
        triggerType: 'manual',
        taskDescription: agentData.config?.description || '',
        metadata: {
          queue_mode: 'collect',
          requested_vm_ip: vmIp,
          source: 'provision_route',
        },
      })

      if (!enqueueResult.success) {
        await supabase
          .from('agents')
          .update({
            status: 'failed',
            config: {
              ...(agentData.config || {}),
              execution_started: false,
              active_run_id: null,
              active_run_ended_at: nowIso,
              last_error: enqueueResult.error || 'Failed to queue provisioned run',
              last_error_at: nowIso,
            },
          } as never)
          .eq('id', agentData.id)

        return NextResponse.json(
          { error: enqueueResult.error || 'Failed to queue agent run' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      vmId,
      vmIp,
    })
  } catch (error) {
    console.error('[Provision] Agent provision error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to provision agent' },
      { status: 500 }
    )
  }
}
