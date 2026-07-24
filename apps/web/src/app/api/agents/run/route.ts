import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureAgentSession, getAgentSession } from '@/lib/compute/session-manager'
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { enqueueAgentRun } from '@/lib/agents/run-queue'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'

const ALLOWED_QUEUE_MODES = new Set(['collect', 'followup', 'steer', 'steer-backlog'])

export function normalizeQueueMode(queueModeRaw: unknown): 'collect' | 'followup' | 'steer' | 'steer-backlog' {
  const queueMode = typeof queueModeRaw === 'string' ? queueModeRaw.trim() : 'collect'
  return ALLOWED_QUEUE_MODES.has(queueMode)
    ? (queueMode as 'collect' | 'followup' | 'steer' | 'steer-backlog')
    : 'collect'
}

export function normalizeOverrideTaskDescription(rawTaskDescription: unknown): string {
  const candidate = typeof rawTaskDescription === 'string' ? rawTaskDescription.trim() : ''
  if (!candidate) return ''
  const lowered = candidate.toLowerCase()
  const isRunCommand = /^(run|start|go|execute|resume)(\s+(it|the\s+agent|this|task))?(\s+(now|again|please))*[.!?]*$/.test(lowered)
  return isRunCommand ? '' : candidate
}

export function getQueuedEventName(mode: 'collect' | 'followup' | 'steer' | 'steer-backlog'): 'assistant_collect' | 'assistant_followup' | 'assistant_steer' {
  if (mode === 'steer' || mode === 'steer-backlog') return 'assistant_steer'
  if (mode === 'followup') return 'assistant_followup'
  return 'assistant_collect'
}

export function appendQueuedInstruction(config: Record<string, unknown>, params: {
  activeRunId: string
  nowIso: string
  queuedItemId: string
  mode: 'collect' | 'followup' | 'steer' | 'steer-backlog'
  content: string
}): { nextConfig: Record<string, unknown> } {
  const existingQueue = Array.isArray((config as { run_queue?: unknown }).run_queue)
    ? ((config as { run_queue: Array<Record<string, unknown>> }).run_queue)
    : []

  const nextQueue = [...existingQueue, {
    id: params.queuedItemId,
    created_at: params.nowIso,
    mode: params.mode,
    content: params.content,
  }]
  if (nextQueue.length > 50) {
    nextQueue.splice(0, nextQueue.length - 50)
  }

  const existingRunEvents = Array.isArray((config as Record<string, unknown>).run_events)
    ? ((config as Record<string, unknown>).run_events as Array<Record<string, unknown>>)
    : []
  const runEvents = [...existingRunEvents]

  runEvents.push({
    timestamp: params.nowIso,
    run_id: params.activeRunId || null,
    kind: 'assistant',
    name: getQueuedEventName(params.mode),
    event: 'queued_instruction',
    message: params.content,
    data: {
      mode: params.mode,
      queued_id: params.queuedItemId,
    },
  })

  if (runEvents.length > 200) {
    runEvents.splice(0, runEvents.length - 200)
  }

  return {
    nextConfig: {
      ...config,
      run_queue: nextQueue,
      run_events: runEvents,
    },
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    let supabase = await createClient()
    let user = null

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const { createClient: createBrowserClient } = await import('@supabase/supabase-js')
      const supabaseWithToken = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: { Authorization: `Bearer ${token}` },
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

    const rateKey = createRateLimitKey(user.id, 'run-agent')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.runAgent)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: 'Too many agent run requests. Please wait before triggering again.',
          retryAfter: Math.ceil((rateCheck.resetAt - Date.now()) / 1000),
        },
        { status: 429 }
      )
    }

    const body = await request.json().catch(() => null)
    const agentId = body?.agentId as string | undefined
    const reset = Boolean(body?.reset)
    const overrideTaskDescription = normalizeOverrideTaskDescription(body?.taskDescription)

    if (!agentId) {
      return NextResponse.json({ error: 'Agent ID required' }, { status: 400 })
    }

    const requestedWorkspaceId = (typeof body?.workspaceId === 'string' && body.workspaceId.trim())
      || request.cookies.get('2hands_active_workspace_id')?.value
      || null

    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })

    if (!scope.workspaceId || !scope.role) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 403 })
    }

    // First fetch the agent to check ownership and current status
    // Use admin client to bypass RLS SELECT policy drift (security via explicit user_id+workspace_id filters)
    const adminDb = createAdminClient()
    const { data: agent, error: agentError } = await adminDb
      .from('agents')
      .select('id, vm_ip, status, config, name')
      .eq('id', agentId)
      .eq('user_id', user.id)
      .eq('workspace_id', scope.workspaceId)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const agentData = agent as {
      id: string
      vm_ip: string | null
      status: string
      name: string
      config: Record<string, unknown> | null
    }

    const normalizedQueueMode = normalizeQueueMode(body?.queue_mode)
    const isRunning = agentData.status === 'working' || agentData.status === 'initializing'

    if (isRunning) {
      if (overrideTaskDescription) {
        const nowIso = new Date().toISOString()
        const currentConfig = (agentData.config || {}) as Record<string, unknown>

        const activeRunId = typeof (currentConfig as { active_run_id?: unknown }).active_run_id === 'string'
          ? String((currentConfig as { active_run_id?: string | null }).active_run_id || '').trim()
          : ''

        const queuedItemId = randomUUID()
        const { nextConfig } = appendQueuedInstruction(currentConfig, {
          activeRunId,
          nowIso,
          queuedItemId,
          mode: normalizedQueueMode,
          content: overrideTaskDescription,
        })

        await adminDb
          .from('agents')
          .update({ last_active: nowIso, config: nextConfig } as never)
          .eq('id', agentId)

        return NextResponse.json({
          success: true,
          queued: true,
          agentId,
          runId: activeRunId || null,
          queuedId: queuedItemId,
          mode: normalizedQueueMode,
        })
      }

      return NextResponse.json({ success: true, alreadyRunning: true, agentId })
    }

    if (reset) {
      try {
        const supabaseAdmin = createAdminClient()
        await supabaseAdmin
          .from('agent_execution_locks')
          .delete()
          .eq('agent_id', agentId)
      } catch (error) {
        console.error('[AgentRun] Failed to clear execution lock (reset=true):', error)
      }
    }

    // If this agent is stuck in working/initializing, reset it first when reset=true
    if (reset && (agentData.status === 'working' || agentData.status === 'initializing')) {
      console.log(`[AgentRun] Force resetting stuck agent ${agentId} from ${agentData.status}`)
      await adminDb
        .from('agents')
        .update({
          status: 'idle',
          config: {
            ...(agentData.config || {}),
            execution_started: false,
            lock_conflict: null,
            last_error: 'Force reset by user',
            last_error_at: new Date().toISOString(),
          },
        } as never)
        .eq('id', agentId)
      // Update local reference
      agentData.status = 'idle'
    }

    if (agentData.status === 'working' || agentData.status === 'initializing') {
      return NextResponse.json({ error: 'Agent is already running' }, { status: 409 })
    }

    // Check concurrent limits - only count OTHER agents, not this one
    // Also reset any OTHER stuck agents when reset=true
    const { data: otherRunningAgents } = await adminDb
      .from('agents')
      .select('id, name, status')
      .eq('user_id', user.id)
      .eq('workspace_id', scope.workspaceId)
      .neq('id', agentId)
      .in('status', ['working', 'initializing'])
    
    const otherRunning = otherRunningAgents?.length || 0
    console.log(`[AgentRun] Other running agents for user: ${otherRunning}`, otherRunningAgents)
    
    // If reset=true, also reset OTHER stuck agents
    if (reset && otherRunning > 0) {
      console.log(`[AgentRun] Force resetting ${otherRunning} other stuck agents`)
      for (const stuckAgent of otherRunningAgents || []) {
        await adminDb
          .from('agents')
          .update({
            status: 'idle',
            config: { execution_started: false, last_error: 'Force reset - concurrent cleanup', last_error_at: new Date().toISOString() },
          } as never)
          .eq('id', (stuckAgent as { id: string }).id)
      }
    } else if (otherRunning >= 1) {
      return NextResponse.json(
        {
          error: `You have another agent running. Wait for it to complete or stop it first.`,
          code: 'CONCURRENT_LIMIT_REACHED',
        },
        { status: 403 }
      )
    }
    
    // Check credits (simplified check)
    const { data: profile } = await adminDb
      .from('profiles')
      .select('credits')
      .eq('id', user.id)
      .single()
    
    if (!profile || (profile as { credits: number }).credits < 10) {
      return NextResponse.json(
        {
          error: 'Insufficient credits',
          code: 'INSUFFICIENT_CREDITS',
        },
        { status: 403 }
      )
    }

    const config = (agentData.config || {}) as Record<string, unknown>
    const configDescription = typeof config.description === 'string' ? config.description.trim() : ''
    const configMission = typeof config.mission === 'string' ? config.mission.trim() : ''
    const configGoal = typeof config.goal === 'string' ? config.goal.trim() : ''
    const taskDescription = overrideTaskDescription || configDescription || configMission || configGoal || ''
    if (!taskDescription) {
      return NextResponse.json({ error: 'Agent mission/description is empty' }, { status: 400 })
    }

    const runId = randomUUID()

    let vmIp = agentData.vm_ip
    if (!vmIp) {
      const session = await getAgentSession(agentId)
      vmIp = session?.ipAddress || null
    }

    if (!vmIp) {
      const session = await ensureAgentSession(agentId, user.id)
      vmIp = session?.ipAddress || null
    }

    if (!vmIp) {
      const sharedVmIp = (process.env.SHARED_VM_IP || process.env.VM_IP)?.trim()
      if (sharedVmIp) {
        console.log('[AgentRun] No session found, falling back to VM_IP:', sharedVmIp)
        vmIp = sharedVmIp
      }
    }

    if (!vmIp) {
      // Check if user has active integration connections — allow API-only execution
      const supabaseAdmin = createAdminClient()
      const { data: activeConns } = await supabaseAdmin
        .from('integration_connections')
        .select('id')
        .eq('user_id', user.id)
        .eq('workspace_id', scope.workspaceId)
        .eq('status', 'active')
        .limit(1)

      if (activeConns && activeConns.length > 0) {
        console.log('[AgentRun] No VM available but user has active integrations — running in API-only mode')
        vmIp = 'api-only'
      } else {
        return NextResponse.json({ error: 'VM not available' }, { status: 503 })
      }
    }

    vmIp = typeof vmIp === 'string' ? vmIp.trim() : vmIp

    const existingRunEvents = Array.isArray((config as Record<string, unknown>).run_events)
      ? ((config as Record<string, unknown>).run_events as Array<Record<string, unknown>>)
      : []
    const runEvents = [...existingRunEvents]
    runEvents.push({
      timestamp: new Date().toISOString(),
      run_id: runId,
      kind: 'lifecycle',
      name: 'run_started',
      event: 'run_started',
      task: taskDescription,
    })

    if (runEvents.length > 200) {
      runEvents.splice(0, runEvents.length - 200)
    }

    const nextConfig: Record<string, unknown> = {
      ...(agentData.config || {}),
      execution_started: true,
      active_run_id: runId,
      active_run_started_at: new Date().toISOString(),
      active_run_task: taskDescription,
      active_run_mode: 'queued',
      run_events: runEvents,
      last_retry_at: new Date().toISOString(),
      ...(reset ? { last_error: null, last_error_at: null, lock_conflict: null } : {}),
    }

    await adminDb
      .from('agents')
      .update({
        status: 'initializing',
        vm_ip: vmIp,
        config: nextConfig,
      } as never)
      .eq('id', agentId)

    const enqueueResult = await enqueueAgentRun({
      runId,
      agentId,
      userId: user.id,
      triggerType: 'manual',
      taskDescription,
      metadata: {
        queue_mode: normalizedQueueMode,
        requested_vm_ip: vmIp,
      },
    })

    if (!enqueueResult.success) {
      const nowIso = new Date().toISOString()
      await adminDb
        .from('agents')
        .update({
          status: 'failed',
          config: {
            ...(agentData.config || {}),
            execution_started: false,
            active_run_id: null,
            active_run_ended_at: nowIso,
            last_error: enqueueResult.error || 'Failed to queue agent run',
            last_error_at: nowIso,
          },
        } as never)
        .eq('id', agentId)

      return NextResponse.json({ error: enqueueResult.error || 'Failed to queue agent run' }, { status: 500 })
    }

    // Fire-and-forget: kick off the worker so runs are picked up immediately
    // (covers local dev where the Vercel cron does not run)
    const cronSecret = (process.env.CRON_SECRET || '').trim()
    if (cronSecret) {
      const requestOrigin = request.nextUrl.origin?.trim()
      const baseUrl = requestOrigin || process.env.NEXTAUTH_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000'
      fetch(`${baseUrl}/api/agents/worker`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cronSecret}`,
        },
        body: JSON.stringify({ limit: 2, concurrency: 1 }),
      }).catch(() => { /* ignore — worker will also run via cron on Vercel */ })
    }

    return NextResponse.json({ success: true, queued: true, agentId, vmIp, runId })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start agent' },
      { status: 500 }
    )
  }
}
