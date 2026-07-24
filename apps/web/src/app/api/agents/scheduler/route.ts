// Force Node.js runtime for agent execution
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { provisionAgentVM } from '@/lib/paperspace/agent-vm'
import { claimScheduledAgents } from '@/lib/scheduler/agent-scheduler'
import { enqueueAgentRun } from '@/lib/agents/run-queue'

interface ClaimedAgentRecord {
  agent_id: string
  user_id: string
  name: string
  config?: { description?: string; [key: string]: unknown }
}

type SchedulerResult = {
  agentId: string
  name: string
  status: 'started' | 'skipped' | 'failed'
  reason?: string
  vmId?: string | null
  error?: string
}

interface SchedulerProcessingDeps {
  checkCreditsAdminFn: typeof checkCreditsAdmin
  provisionAgentVMFn: typeof provisionAgentVM
  enqueueAgentRunFn: typeof enqueueAgentRun
  createAdminClientFn: typeof createAdminClient
}

const schedulerDeps: SchedulerProcessingDeps = {
  checkCreditsAdminFn: checkCreditsAdmin,
  provisionAgentVMFn: provisionAgentVM,
  enqueueAgentRunFn: enqueueAgentRun,
  createAdminClientFn: createAdminClient,
}

export async function processClaimedAgent(
  agent: ClaimedAgentRecord,
  deps: SchedulerProcessingDeps = schedulerDeps
): Promise<SchedulerResult> {
  try {
    const { canRun, credits } = await deps.checkCreditsAdminFn(agent.user_id)

    if (!canRun) {
      console.log(`[Scheduler] User ${agent.user_id} has insufficient credits (${credits}) for agent ${agent.agent_id}`)

      const supabase = deps.createAdminClientFn()
      await supabase
        .from('agents')
        .update({ status: 'idle' } as never)
        .eq('id', agent.agent_id)

      return {
        agentId: agent.agent_id,
        name: agent.name,
        status: 'skipped',
        reason: 'insufficient_credits',
      }
    }

    const { vmId, vmIp } = await deps.provisionAgentVMFn({
      agentId: agent.agent_id,
      agentName: agent.name,
      userId: agent.user_id,
      taskDescription: agent.config?.description || '',
    })

    if (!vmIp) {
      return {
        agentId: agent.agent_id,
        name: agent.name,
        status: 'failed',
        error: 'VM not available',
      }
    }

    const runId = randomUUID()
    const nowIso = new Date().toISOString()
    const supabase = deps.createAdminClientFn()

    await supabase
      .from('agents')
      .update({
        status: 'initializing',
        vm_ip: vmIp,
        config: {
          ...(agent.config || {}),
          execution_started: true,
          active_run_id: runId,
          active_run_started_at: nowIso,
          active_run_task: agent.config?.description || '',
          active_run_mode: 'queued',
          last_retry_at: nowIso,
        },
      } as never)
      .eq('id', agent.agent_id)

    const enqueueResult = await deps.enqueueAgentRunFn({
      runId,
      agentId: agent.agent_id,
      userId: agent.user_id,
      triggerType: 'scheduled',
      taskDescription: agent.config?.description || '',
      metadata: {
        queue_mode: 'collect',
        requested_vm_ip: vmIp,
      },
    })

    if (!enqueueResult.success) {
      await supabase
        .from('agents')
        .update({
          status: 'failed',
          config: {
            ...(agent.config || {}),
            execution_started: false,
            active_run_id: null,
            active_run_ended_at: nowIso,
            last_error: enqueueResult.error || 'Failed to queue scheduled run',
            last_error_at: nowIso,
          },
        } as never)
        .eq('id', agent.agent_id)

      return {
        agentId: agent.agent_id,
        name: agent.name,
        status: 'failed',
        error: enqueueResult.error || 'Failed to queue scheduled run',
      }
    }

    return {
      agentId: agent.agent_id,
      name: agent.name,
      status: 'started',
      vmId,
    }
  } catch (error) {
    console.error(`[Scheduler] Failed to execute agent ${agent.agent_id}:`, error)

    try {
      const supabase = deps.createAdminClientFn()
      await supabase
        .from('agents')
        .update({
          status: 'failed',
          config: {
            ...agent.config,
            last_error: error instanceof Error ? error.message : 'Unknown error',
            last_error_at: new Date().toISOString(),
          }
        } as never)
        .eq('id', agent.agent_id)
    } catch (updateError) {
      console.error(`[Scheduler] Failed to update agent status:`, updateError)
    }

    return {
      agentId: agent.agent_id,
      name: agent.name,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function checkCreditsAdmin(userId: string, estimatedCredits: number = 10): Promise<{ canRun: boolean; credits: number }> {
  const supabase = createAdminClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', userId)
    .single()

  const credits = (profile as { credits?: number } | null)?.credits ?? 0
  return { canRun: credits >= estimatedCredits, credits }
}

/**
 * Verify CRON_SECRET - required for all scheduler endpoints
 * Returns error response if unauthorized, null if authorized
 */
function verifySchedulerAuth(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get('authorization')
  const cronSecret = (process.env.CRON_SECRET || '').trim()
  
  // CRON_SECRET must be configured in production
  if (!cronSecret) {
    console.error('SECURITY: CRON_SECRET not configured - rejecting scheduler request')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }
  
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  return null // Authorized
}

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret for security (should be called by cron job)
    const authError = verifySchedulerAuth(request)
    if (authError) return authError

    // Use atomic claim to prevent race conditions with concurrent schedulers
    const claimedAgents = await claimScheduledAgents(10)
    
    if (claimedAgents.length === 0) {
      return NextResponse.json({ message: 'No agents due for execution', count: 0 })
    }

    console.log(`[Scheduler] Processing ${claimedAgents.length} claimed agents`)
    const results: SchedulerResult[] = []

    for (const agent of claimedAgents) {
      const result = await processClaimedAgent(agent as ClaimedAgentRecord)
      results.push(result)
    }

    return NextResponse.json({
      message: `Processed ${results.length} agents`,
      count: results.length,
      results,
    })
  } catch (error) {
    console.error('[Scheduler] Scheduler error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Scheduler failed' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  // Vercel cron jobs send GET requests with the x-vercel-cron: 1 header.
  // When invoked by the cron, run the full scheduling logic (same as POST).
  const isCron = request.headers.get('x-vercel-cron') === '1'

  if (isCron) {
    try {
      const authError = verifySchedulerAuth(request)
      if (authError) return authError

      const claimedAgents = await claimScheduledAgents(10)

      if (claimedAgents.length === 0) {
        return NextResponse.json({ message: 'No agents due for execution', count: 0 })
      }

      console.log(`[Scheduler] Cron processing ${claimedAgents.length} claimed agents`)
      const results: SchedulerResult[] = []

      for (const agent of claimedAgents) {
        const result = await processClaimedAgent(agent as ClaimedAgentRecord)
        results.push(result)
      }

      return NextResponse.json({
        message: `Processed ${results.length} agents`,
        count: results.length,
        results,
      })
    } catch (error) {
      console.error('[Scheduler] Cron error:', error)
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Scheduler failed' },
        { status: 500 }
      )
    }
  }

  // Non-cron GET: return status info only
  try {
    const authError = verifySchedulerAuth(request)
    if (authError) return authError
    
    const supabase = createAdminClient()
    const now = new Date().toISOString()
    const { data: agentsDue, error } = await supabase
      .from('agents')
      .select('id, name, schedule_cron, next_run_at')
      .eq('schedule_type', 'scheduled')
      .lte('next_run_at', now)
      .in('status', ['idle', 'initializing'])
      .order('next_run_at', { ascending: true })
      .limit(10)

    if (error) {
      console.error('Scheduler check error:', error)
      return NextResponse.json(
        { error: 'Failed to check scheduled agents' },
        { status: 500 }
      )
    }
    
    const due = (agentsDue || []) as Array<{
      id: string
      name: string
      schedule_cron: string | null
      next_run_at: string | null
    }>

    return NextResponse.json({
      count: due.length,
      agents: due.map(a => ({
        id: a.id,
        name: a.name,
        schedule_cron: a.schedule_cron,
        next_run_at: a.next_run_at,
      })),
    })
  } catch (error) {
    console.error('Scheduler check error:', error)
    return NextResponse.json(
      { error: 'Failed to check scheduled agents' },
      { status: 500 }
    )
  }
}
