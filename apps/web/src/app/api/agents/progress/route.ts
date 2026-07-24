import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { markAgentRunCompleteAdmin } from '@/lib/scheduler/agent-scheduler'
import { appendMissionEvent } from '@/lib/missions/mission-service'
import { dispatchWebhookEvent } from '@/lib/api-platform/webhooks'
import { appendAgentRunEvent, updateAgentRunStatus } from '@/lib/agents/run-queue'
import { verifySignature } from '@/lib/security/hmac'
import { secureLog, safeErrorResponse } from '@/lib/security/error-handler'

interface ProgressUpdate {
  agentId: string
  runId?: string
  type: 'started' | 'progress' | 'completed' | 'failed' | 'insight' | 'blocker' | 'acknowledgement' | 'action'
  message: string
  action_type?: 'browse' | 'search' | 'read' | 'click' | 'type' | 'scroll'
  action_target?: string // URL, search term, element, etc.
  data?: Record<string, unknown>
  // Structured data for employee-like messaging
  done?: string[]
  found?: string[]
  next?: string[]
  eta_seconds?: number
  plan?: string[]
  blocker_question?: string
  options?: { label: string; value: string; impact: string }[]
  summary?: string[]
  deliverables?: { name: string; url?: string; type: string }[]
  next_steps?: string[]
}

export async function POST(request: NextRequest) {
  try {
    // Verify HMAC signature for internal API authentication
    const signature = request.headers.get('X-Internal-Signature')
    const timestampStr = request.headers.get('X-Internal-Timestamp')
    
    if (!signature || !timestampStr) {
      return NextResponse.json({ error: 'Missing authentication headers' }, { status: 401 })
    }
    
    const timestamp = parseInt(timestampStr, 10)
    if (isNaN(timestamp)) {
      return NextResponse.json({ error: 'Invalid timestamp' }, { status: 401 })
    }
    
    // Clone request to read body for verification (body can only be read once)
    const payload = await request.text()
    
    const verification = verifySignature(payload, signature, timestamp)
    if (!verification.valid) {
      return NextResponse.json({ error: verification.error || 'Authentication failed' }, { status: 401 })
    }
    
    // Parse the verified payload
    const update: ProgressUpdate = JSON.parse(payload)
    
    // Use admin client for server-to-server calls (agent executor -> progress API)
    // This bypasses RLS since there's no user auth context in these calls
    const supabase = createAdminClient()
    const nowIso = new Date().toISOString()
    const updateRunId = typeof update.runId === 'string' && update.runId.trim() ? update.runId.trim() : null
    secureLog('info', `Progress update: ${update.type}`, { agentId: update.agentId, runId: updateRunId })

    if (!update.agentId) {
      return NextResponse.json({ error: 'Agent ID required' }, { status: 400 })
    }

    // Get agent to verify it exists
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('*')
      .eq('id', update.agentId)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const agentData = agent as { 
      id: string
      user_id: string
      conversation_id: string | null
      config: Record<string, unknown>
    }

    // Update agent status based on progress type
    const statusUpdates: Record<string, unknown> = {
      last_active: nowIso,
    }

    if (update.type === 'started') {
      statusUpdates.status = 'working'
    } else if (update.type === 'completed') {
      // Use markAgentRunComplete to properly calculate next_run_at for scheduled agents
      await markAgentRunCompleteAdmin(update.agentId)
      // Don't set status here - markAgentRunComplete handles it based on schedule_type

      // If this is a mission-spawned agent, post agent_completed event back to mission
      const cfg = agentData.config as Record<string, unknown>
      const missionId = typeof cfg?.mission_id === 'string' ? cfg.mission_id : null
      if (missionId) {
        const summary = update.message || (update.data as { summary?: string } | undefined)?.summary || ''
        appendMissionEvent(
          missionId,
          (agentData as { workspace_id?: string }).workspace_id ?? '',
          agentData.user_id,
          'agent_completed',
          `Agent completed: ${summary.slice(0, 120)}`,
          { agent_id: update.agentId, agent_name: String(cfg?.agent_name || 'Agent'), agent_summary: summary, task: String(cfg?.description || '').slice(0, 200) }
        ).catch(() => {})

        // Advance the first in_progress task to completed in the goal tree
        const adminDb = createAdminClient()
        const { data: missionRow } = await adminDb
          .from('missions')
          .select('goal_tree')
          .eq('id', missionId)
          .single() as { data: { goal_tree?: unknown } | null; error: unknown }
        if (missionRow) {
          const gt = missionRow.goal_tree as {
            projects?: Array<{
              id?: string; status?: string; current_project_id?: string
              tasks?: Array<{ id?: string; status?: string }>
            }>
            current_project_id?: string
            overall_status?: string
            updated_at?: string
          } | null
          if (gt?.projects) {
            const currentProj = gt.projects.find(p => p.id === gt.current_project_id)
            if (currentProj?.tasks) {
              const agentTaskDesc = String(cfg?.description || '').toLowerCase().slice(0, 200)
              // Try to find a task matching the agent's task description
              let targetTask = agentTaskDesc.length > 20
                ? currentProj.tasks.find(t =>
                    t.status === 'in_progress' &&
                    (t as { description?: string }).description &&
                    agentTaskDesc.includes(((t as { description?: string }).description ?? '').toLowerCase().slice(0, 40))
                  )
                : undefined
              // Fallback: first in_progress task
              if (!targetTask) targetTask = currentProj.tasks.find(t => t.status === 'in_progress')
              if (targetTask) {
                targetTask.status = 'completed'
                gt.updated_at = new Date().toISOString()
                await adminDb.from('missions').update({ goal_tree: gt } as never).eq('id', missionId)
                dispatchWebhookEvent(agentData.user_id, 'mission.task_completed', {
                  mission_id: missionId,
                  task_id: (targetTask as { id?: string }).id ?? null,
                  task_description: (targetTask as { description?: string }).description ?? '',
                  agent_id: update.agentId,
                  agent_name: String(cfg?.agent_name || 'Agent'),
                  completed_at: new Date().toISOString(),
                }).catch(() => {})
              }
            }
          }
        }
      }
    } else if (update.type === 'failed') {
      statusUpdates.status = 'failed'

      // If mission-spawned agent fails, log event and reset the in_progress task back to pending
      const failedCfg = agentData.config as Record<string, unknown>
      const failedMissionId = typeof failedCfg?.mission_id === 'string' ? failedCfg.mission_id : null
      if (failedMissionId) {
        const failSummary = update.message || 'Agent run failed'
        appendMissionEvent(
          failedMissionId,
          (agentData as { workspace_id?: string }).workspace_id ?? '',
          agentData.user_id,
          'agent_failed',
          `Agent failed: ${failSummary.slice(0, 120)}`,
          { agent_id: update.agentId, agent_name: String(failedCfg?.agent_name || 'Agent'), task: String(failedCfg?.description || '').slice(0, 200) }
        ).catch(() => {})

        // Reset in_progress task back to pending so next tick can retry
        const adminDbFail = createAdminClient()
        const { data: failMissionRow } = await adminDbFail
          .from('missions')
          .select('goal_tree')
          .eq('id', failedMissionId)
          .single() as { data: { goal_tree?: unknown } | null; error: unknown }
        if (failMissionRow) {
          const fgt = failMissionRow.goal_tree as {
            projects?: Array<{ id?: string; tasks?: Array<{ id?: string; status?: string }> }>
            current_project_id?: string
            updated_at?: string
          } | null
          if (fgt?.projects) {
            const failProj = fgt.projects.find(p => p.id === fgt.current_project_id)
            if (failProj?.tasks) {
              const inProgressTask = failProj.tasks.find(t => t.status === 'in_progress')
              if (inProgressTask) {
                inProgressTask.status = 'pending'
                fgt.updated_at = new Date().toISOString()
                await adminDbFail.from('missions').update({ goal_tree: fgt } as never).eq('id', failedMissionId)
              }
            }
          }
        }
      }
    }

    const baseConfig = agentData.config || {}

    // Store progress in agent config
    const progressLog = (baseConfig as { progress_log?: Array<{ timestamp: string; type: string; message: string }> })?.progress_log || []
    progressLog.push({
      timestamp: nowIso,
      type: update.type,
      message: update.message,
    })

    // Keep only last 50 progress entries
    if (progressLog.length > 50) {
      progressLog.splice(0, progressLog.length - 50)
    }

    const baseActiveRunId = typeof (baseConfig as { active_run_id?: unknown }).active_run_id === 'string'
      ? ((baseConfig as { active_run_id?: string }).active_run_id || '').trim()
      : ''
    const resolvedRunId = updateRunId || (baseActiveRunId ? baseActiveRunId : null)

    const runEvents = (baseConfig as { run_events?: Array<Record<string, unknown>> })?.run_events || []

    const actionType = typeof update.action_type === 'string'
      ? update.action_type
      : (typeof (update.data as { action_type?: unknown } | undefined)?.action_type === 'string'
        ? String((update.data as { action_type?: unknown } | undefined)?.action_type)
        : undefined)
    const actionTarget = typeof update.action_target === 'string'
      ? update.action_target
      : (typeof (update.data as { action_target?: unknown } | undefined)?.action_target === 'string'
        ? String((update.data as { action_target?: unknown } | undefined)?.action_target)
        : undefined)

    const { kind, name } = (() => {
      switch (update.type) {
        case 'started':
          return { kind: 'lifecycle', name: 'executor_started' } as const
        case 'completed':
          return { kind: 'lifecycle', name: 'run_completed' } as const
        case 'failed':
          return { kind: 'lifecycle', name: 'run_failed' } as const
        case 'action':
          return { kind: 'tool', name: 'tool_action' } as const
        case 'insight':
          return { kind: 'assistant', name: 'assistant_insight' } as const
        case 'blocker':
          return { kind: 'assistant', name: 'assistant_blocker' } as const
        case 'acknowledgement':
          return { kind: 'assistant', name: 'assistant_ack' } as const
        case 'progress':
        default:
          return { kind: 'assistant', name: 'assistant_delta' } as const
      }
    })()

    runEvents.push({
      timestamp: nowIso,
      run_id: resolvedRunId,
      kind,
      name,
      event: 'progress_update',
      progress_type: update.type,
      message: update.message,
      data: update.data,
      ...(kind === 'tool' ? { action_type: actionType, action_target: actionTarget } : {}),
    })

    // Keep only last 200 run events for now
    if (runEvents.length > 200) {
      runEvents.splice(0, runEvents.length - 200)
    }

    if (resolvedRunId) {
      try {
        await appendAgentRunEvent({
          runId: resolvedRunId,
          agentId: update.agentId,
          userId: agentData.user_id,
          kind,
          name,
          event: 'progress_update',
          message: update.message,
          payload: {
            progress_type: update.type,
            data: update.data || null,
            action_type: actionType || null,
            action_target: actionTarget || null,
          },
        })

        if (update.type === 'started') {
          await updateAgentRunStatus(resolvedRunId, 'running', {
            startedAt: nowIso,
          })
        } else if (update.type === 'completed') {
          await updateAgentRunStatus(resolvedRunId, 'completed', {
            completedAt: nowIso,
          })
        } else if (update.type === 'failed') {
          await updateAgentRunStatus(resolvedRunId, 'failed', {
            errorMessage: update.message,
            completedAt: nowIso,
          })
        }
      } catch (runEventError) {
        secureLog('warn', 'Failed to persist canonical run event/status', { error: runEventError, runId: resolvedRunId })
      }
    }

    const nextConfig: Record<string, unknown> = {
      ...baseConfig,
      progress_log: progressLog,
      run_events: runEvents,
      last_progress: {
        type: update.type,
        message: update.message,
        data: update.data,
        timestamp: nowIso,
        ...(updateRunId ? { run_id: updateRunId } : {}),
      },
      ...(update.type === 'started' && updateRunId ? { active_run_id: updateRunId } : {}),
    }

    if (update.type === 'completed') {
      nextConfig.execution_started = false
      nextConfig.active_run_id = null
      nextConfig.active_run_ended_at = nowIso
    }

    if (update.type === 'failed') {
      nextConfig.execution_started = false
      nextConfig.active_run_id = null
      nextConfig.last_error = update.message
      nextConfig.last_error_at = nowIso
    }

    statusUpdates.config = nextConfig

    await supabase
      .from('agents')
      .update(statusUpdates as never)
      .eq('id', update.agentId)

    // Save to agent's own conversation - communicate like an employee
    if (agentData.conversation_id) {
      const agentInfo = agent as { 
        name: string
        schedule_type: string
        schedule_cron: string | null
        next_run_at: string | null
      }
      
      let agentMessage = ''
      let messageType = 'chat'
      let requiresAction = false
      
      switch (update.type) {
        case 'started':
        case 'acknowledgement':
          messageType = 'thinking'
          agentMessage = ''
          break
          
        case 'progress':
          messageType = 'thinking'
          agentMessage = ''
          break
          
        case 'blocker':
          // Decision needed - clear options
          if (update.options?.length) {
            const optionsList = update.options.map(o => `**${o.label}:** ${o.impact}`).join('\n')
            agentMessage = `I need a decision to continue:\n\n${update.blocker_question || update.message}\n\n${optionsList}\n\nReply with your choice.`
          } else {
            agentMessage = `I'm blocked and need your input:\n\n${update.message}\n\nLet me know how you'd like me to proceed.`
          }
          messageType = 'blocker'
          requiresAction = true
          break
          
        case 'insight':
          agentMessage = `**Found something:**\n\n${update.message}`
          messageType = 'insight' // Show insights as normal messages, not collapsed thinking
          break
          
        case 'action':
          // Action indicator (Browsed, Searched, Read, etc.) - don't store as message, just update config
          // These are shown inline in the UI, not as chat messages
          messageType = 'action'
          agentMessage = '' // Don't create a message for actions
          break
          
        case 'completed':
          // Structured completion with deliverables
          const summaryParts = []
          if (update.summary?.length) {
            summaryParts.push(`**Summary:**\n${update.summary.map(s => `• ${s}`).join('\n')}`)
          } else {
            summaryParts.push(update.message)
          }
          if (update.deliverables?.length) {
            const deliverablesList = update.deliverables.map(d => `• ${d.name}${d.url ? ` - ${d.url}` : ''}`).join('\n')
            summaryParts.push(`**Deliverables:**\n${deliverablesList}`)
          }
          if (update.next_steps?.length) {
            summaryParts.push(`**Recommended next:**\n${update.next_steps.map(n => `• ${n}`).join('\n')}`)
          }
          agentMessage = summaryParts.join('\n\n')
          messageType = 'chat'
          break
          
        case 'failed':
          agentMessage = `**Issue encountered**\n\n${update.message}\n\nI couldn't complete this task. Let me know if you'd like me to try a different approach.`
          messageType = 'progress'
          break
      }
      
      if (agentMessage) {
        await supabase.from('messages').insert({
          conversation_id: agentData.conversation_id,
          role: 'assistant',
          content: agentMessage,
          metadata: {
            type: messageType,
            sender: 'agent',
            agent_id: agentData.id,
            agent_name: agentInfo.name,
            ...(updateRunId ? { run_id: updateRunId } : {}),
            requires_user_action: requiresAction,
            done: update.done,
            found: update.found,
            next: update.next,
            eta_seconds: update.eta_seconds,
            summary: update.summary,
            deliverables: update.deliverables,
            next_steps: update.next_steps,
            blocker_question: update.blocker_question,
            options: update.options,
          },
        } as never)
        
        // Create notification for important events
        if (['blocker', 'completed', 'failed'].includes(update.type)) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.rpc as any)('create_notification', {
              p_user_id: agentData.user_id,
              p_type: update.type === 'blocker' ? 'blocker' : 'completion',
              p_title: update.type === 'blocker' 
                ? `${agentInfo.name} needs your input`
                : update.type === 'completed'
                ? `${agentInfo.name} completed task`
                : `${agentInfo.name} encountered an issue`,
              p_body: update.type === 'blocker' 
                ? update.blocker_question || update.message
                : update.summary?.[0] || update.message,
              p_agent_id: agentData.id,
              p_conversation_id: agentData.conversation_id,
              p_requires_action: requiresAction,
            })
          } catch (notifError) {
            secureLog('warn', 'Failed to create notification', { error: notifError })
          }
        }
      }
    }

    // Also report to the AI Manager conversation (the main conversation for this user)
    if (update.type === 'completed' || update.type === 'insight' || update.type === 'failed' || update.type === 'blocker') {
      const agentName = (agent as { name: string }).name
      
      // Find the user's AI Manager conversation by title
      const { data: managerConversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('user_id', agentData.user_id)
        .eq('title', 'AI Manager')
        .single()

      if (managerConversation) {
        let reportMessage = ''
        let reportType = update.type

        if (update.type === 'completed') {
          const summaryParts: string[] = []
          if (update.summary?.length) {
            summaryParts.push(`**Summary:**\n${update.summary.map(s => `• ${s}`).join('\n')}`)
          } else {
            summaryParts.push(update.message)
          }
          if (update.deliverables?.length) {
            const deliverablesList = update.deliverables
              .map(d => `• ${d.name}${d.url ? ` - ${d.url}` : ''}`)
              .join('\n')
            summaryParts.push(`**Deliverables:**\n${deliverablesList}`)
          }
          if (update.next_steps?.length) {
            summaryParts.push(`**Recommended next:**\n${update.next_steps.map(n => `• ${n}`).join('\n')}`)
          }
          reportMessage = `**${agentName}** finished:\n\n${summaryParts.join('\n\n')}`
        } else if (update.type === 'insight') {
          reportMessage = `**${agentName}** found:\n\n${update.message}`
        } else if (update.type === 'failed') {
          reportMessage = `**${agentName}** encountered an issue and could not complete the task:\n\n${update.message}\n\nLet me know if you'd like to retry with a different approach.`
        } else if (update.type === 'blocker') {
          const optionsList = update.options?.length
            ? '\n\n' + update.options.map(o => `• **${o.label}:** ${o.impact}`).join('\n')
            : ''
          reportMessage = `**${agentName}** is blocked and needs your input:\n\n${update.blocker_question || update.message}${optionsList}`
        }
        
        if (reportMessage) {
          await supabase.from('messages').insert({
            conversation_id: (managerConversation as { id: string }).id,
            role: 'assistant',
            content: reportMessage,
            metadata: {
              type: 'agent_report',
              agent_id: agentData.id,
              agent_name: agentName,
              report_type: reportType,
            },
          } as never)
        }
      }
    }

    return NextResponse.json({ 
      success: true,
      message: 'Progress recorded',
    })
  } catch (error) {
    return safeErrorResponse('INTERNAL_ERROR', { status: 500 }, error)
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return safeErrorResponse('UNAUTHORIZED', { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agentId')

    if (agentId) {
      // Get progress for specific agent
      const { data: agent } = await supabase
        .from('agents')
        .select('config')
        .eq('id', agentId)
        .eq('user_id', user.id)
        .single()

      const agentConfig = agent as { config: { progress_log?: Array<unknown>; last_progress?: unknown; run_events?: Array<unknown>; active_run_id?: unknown } } | null

      return NextResponse.json({
        progress_log: agentConfig?.config?.progress_log || [],
        last_progress: agentConfig?.config?.last_progress || null,
        run_events: agentConfig?.config?.run_events || [],
        active_run_id: agentConfig?.config?.active_run_id || null,
      })
    }

    // Get recent progress across all agents
    const { data: agents } = await supabase
      .from('agents')
      .select('id, name, status, config, last_active')
      .eq('user_id', user.id)
      .order('last_active', { ascending: false })
      .limit(10)

    const updates = (agents || []).map((a: { 
      id: string
      name: string
      status: string
      config: { last_progress?: { type: string; message: string; timestamp: string } }
      last_active: string
    }) => ({
      agent_id: a.id,
      agent_name: a.name,
      status: a.status,
      last_progress: a.config?.last_progress || null,
      last_active: a.last_active,
    })).filter((u: { last_progress: unknown }) => u.last_progress)

    return NextResponse.json({ updates })
  } catch (error) {
    return safeErrorResponse('INTERNAL_ERROR', { status: 500 }, error)
  }
}
