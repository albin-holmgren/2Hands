import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateNextRunTime } from '@/lib/scheduler/agent-scheduler'
import { parseAndValidate, updateAgentRequestSchema, uuidSchema, validationErrorResponse } from '@/lib/validation/schemas'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

async function getSupabaseAndUser(request: NextRequest) {
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
    } else {
      // Fallback to cookie auth when bearer token is stale/invalid.
      // This avoids intermittent 401s when the client token and cookie session are temporarily out of sync.
      const { data: { user: cookieUser }, error: cookieError } = await supabase.auth.getUser()
      if (!cookieError) user = cookieUser
    }
  } else {
    const { data: { user: cookieUser }, error } = await supabase.auth.getUser()
    if (!error) user = cookieUser
  }

  return { supabase, user }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Validate UUID format
    const idValidation = uuidSchema.safeParse(id)
    if (!idValidation.success) {
      return NextResponse.json(validationErrorResponse('Invalid agent ID format'), { status: 400 })
    }
    
    const { supabase, user } = await getSupabaseAndUser(request)

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const requestedWorkspaceId = request.nextUrl.searchParams.get('workspaceId')
      || request.cookies.get('2hands_active_workspace_id')?.value
      || null

    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })

    if (!scope.workspaceId || !scope.role) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 403 })
    }

    const { data: agent, error } = await supabase
      .from('agents')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('workspace_id', scope.workspaceId)
      .single()

    if (error || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    return NextResponse.json(agent)
  } catch (error) {
    console.error('Get agent error:', error)
    return NextResponse.json({ error: 'Failed to get agent' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Validate UUID format
    const idValidation = uuidSchema.safeParse(id)
    if (!idValidation.success) {
      return NextResponse.json(validationErrorResponse('Invalid agent ID format'), { status: 400 })
    }
    
    const { supabase, user } = await getSupabaseAndUser(request)

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const requestedWorkspaceId = request.nextUrl.searchParams.get('workspaceId')
      || request.cookies.get('2hands_active_workspace_id')?.value
      || null

    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })

    if (!scope.workspaceId || !scope.role) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 403 })
    }

    const parsed = await parseAndValidate(request, updateAgentRequestSchema)
    if (!parsed.success) {
      return NextResponse.json(validationErrorResponse(parsed.error), { status: parsed.status })
    }
    
    const body = parsed.data
    const updates: Record<string, unknown> = {}

    // Allow updating these fields
    if (body.name !== undefined) updates.name = body.name
    if (body.config !== undefined) updates.config = body.config
    if (body.schedule_type !== undefined) updates.schedule_type = body.schedule_type
    if (body.schedule_cron !== undefined) updates.schedule_cron = body.schedule_cron
    if (body.schedule_timezone !== undefined) updates.schedule_timezone = body.schedule_timezone
    if (body.status !== undefined) updates.status = body.status

    if (body.mission !== undefined) {
      const nextConfigBase = (() => {
        if (body.config !== undefined) return body.config as Record<string, unknown>
        return null
      })()

      if (nextConfigBase) {
        updates.config = {
          ...nextConfigBase,
          description: body.mission,
        }
      } else {
        const { data: currentAgent } = await supabase
          .from('agents')
          .select('config')
          .eq('id', id)
          .eq('user_id', user.id)
          .eq('workspace_id', scope.workspaceId)
          .single()

        const currentConfig = (currentAgent as { config?: Record<string, unknown> } | null)?.config || {}
        updates.config = {
          ...currentConfig,
          description: body.mission,
        }
      }
    }

    // Recalculate next_run_at when schedule changes
    const scheduleType = body.schedule_type
    const scheduleCron = body.schedule_cron
    const scheduleTimezone = body.schedule_timezone || 'UTC'

    if (scheduleType !== undefined || scheduleCron !== undefined) {
      // Fetch current agent to get existing values if not provided
      const { data: currentAgent } = await supabase
        .from('agents')
        .select('schedule_type, schedule_cron, schedule_timezone')
        .eq('id', id)
        .eq('user_id', user.id)
        .eq('workspace_id', scope.workspaceId)
        .single()

      const current = currentAgent as { schedule_type: string; schedule_cron: string | null; schedule_timezone: string } | null
      const finalScheduleType = scheduleType ?? current?.schedule_type ?? 'once'
      const finalScheduleCron = scheduleCron ?? current?.schedule_cron
      const finalTimezone = scheduleTimezone ?? current?.schedule_timezone ?? 'UTC'

      if (finalScheduleType === 'scheduled' && finalScheduleCron) {
        // Calculate next run time based on cron expression
        const nextRun = calculateNextRunTime(finalScheduleCron, finalTimezone)
        updates.next_run_at = nextRun.toISOString()
      } else if (finalScheduleType === 'once' || finalScheduleType === 'realtime') {
        // For one-time and realtime, run immediately if not already running
        updates.next_run_at = new Date().toISOString()
      }
    }

    const { data: agent, error } = await supabase
      .from('agents')
      .update(updates as never)
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('workspace_id', scope.workspaceId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 })
    }

    return NextResponse.json(agent)
  } catch (error) {
    console.error('Update agent error:', error)
    return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Validate UUID format
    const idValidation = uuidSchema.safeParse(id)
    if (!idValidation.success) {
      return NextResponse.json(validationErrorResponse('Invalid agent ID format'), { status: 400 })
    }
    
    const { supabase, user } = await getSupabaseAndUser(request)

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const requestedWorkspaceId = request.nextUrl.searchParams.get('workspaceId')
      || request.cookies.get('2hands_active_workspace_id')?.value
      || null

    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })

    if (!scope.workspaceId || !scope.role) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 403 })
    }

    // Get agent to check for VM
    const { data: agent } = await supabase
      .from('agents')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('workspace_id', scope.workspaceId)
      .single()

    const agentData = agent as { id: string; vm_id: string | null } | null

    if (!agentData) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Terminate VM if exists
    if (agentData.vm_id) {
      try {
        await fetch(`${request.nextUrl.origin}/api/agents/terminate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(3000),
          body: JSON.stringify({ agentId: agentData.id }),
        })
      } catch (terminateError) {
        console.error('Failed to terminate VM during agent deletion:', terminateError)
      }
    }

    // Delete associated conversation
    const { data: agentWithConv } = await supabase
      .from('agents')
      .select('conversation_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('workspace_id', scope.workspaceId)
      .single()

    if (agentWithConv) {
      const convData = agentWithConv as { conversation_id: string | null }
      if (convData.conversation_id) {
        await supabase
          .from('conversations')
          .delete()
          .eq('id', convData.conversation_id)
          .eq('user_id', user.id)
          .eq('workspace_id', scope.workspaceId)
      }
    }

    // Delete agent
    const { error } = await supabase
      .from('agents')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('workspace_id', scope.workspaceId)

    if (error) {
      return NextResponse.json({ error: 'Failed to delete agent' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete agent error:', error)
    return NextResponse.json({ error: 'Failed to delete agent' }, { status: 500 })
  }
}
