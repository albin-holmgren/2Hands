/**
 * Agent Completion Events
 * 
 * Connects agent completions to:
 * - Push notifications
 * - Proactive outreach
 * - Observability metrics
 * - Adaptive learning
 */

import { createAdminClient } from '@/lib/supabase/admin'

let notifyAgentComplete: ((userId: string, agentName: string, summary: string) => Promise<void>) | null = null
let notifyError: ((userId: string, agentName: string, summary: string) => Promise<void>) | null = null
let hasPushEnabled: ((userId: string) => Promise<boolean>) | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let scheduleOutreach: ((...args: any[]) => Promise<unknown>) | null = null

async function loadOptionalDeps() {
  try {
    const push = await import('@/lib/notifications/push-notifications')
    notifyAgentComplete = push.notifyAgentComplete
    notifyError = push.notifyError
    hasPushEnabled = push.hasPushEnabled
  } catch { /* push notifications not available */ }
  try {
    const outreach = await import('@/lib/personalization/proactive-outreach')
    scheduleOutreach = outreach.scheduleOutreach
  } catch { /* outreach not available */ }
}

import { completeRunMetrics } from './observability'

export interface AgentCompletionEvent {
  agentId: string
  agentName: string
  userId: string
  runId: string
  status: 'completed' | 'failed' | 'timeout'
  summary: string
  /** Whether the run had verified external side effects (or was a read-only/research task). False only when a write was attempted but not confirmed. */
  verified?: boolean
  insights?: string[]
  errorsEncountered?: number
  iterationsUsed?: number
  tokensUsed?: number
  costUsd?: number
}

/**
 * Handle agent completion - trigger all downstream events
 */
export async function onAgentComplete(event: AgentCompletionEvent): Promise<void> {
  await loadOptionalDeps()
  const supabase = createAdminClient()
  
  console.log(`[AgentCompletion] ${event.agentName} finished with status: ${event.status}`)

  // Resolve workspace for this agent (needed for workspace-scoped operations)
  const { data: agentRow } = await supabase
    .from('agents')
    .select('workspace_id')
    .eq('id', event.agentId)
    .single()
  const agentWorkspaceId = (agentRow as { workspace_id?: string } | null)?.workspace_id || ''
  
  // 1. Update observability metrics
  try {
    await completeRunMetrics(
      event.runId,
      event.status,
      event.status === 'completed' ? 0.8 : 0.2,
      event.status !== 'completed' ? event.summary : undefined
    )
  } catch (e) { console.error('[AgentCompletion] metrics error:', e) }
  
  // 2. Send push notification (if enabled)
  try {
    if (hasPushEnabled) {
      const pushEnabled = await hasPushEnabled(event.userId)
      if (pushEnabled) {
        if (event.status === 'completed' && notifyAgentComplete) {
          await notifyAgentComplete(event.userId, event.agentName, event.summary)
        } else if (event.status === 'failed' && notifyError) {
          await notifyError(event.userId, event.agentName, event.summary)
        }
      }
    }
  } catch (e) { console.error('[AgentCompletion] push error:', e) }
  
  // 3. Schedule proactive outreach message
  try {
    if (agentWorkspaceId && scheduleOutreach) {
      await scheduleOutreach({
        userId: event.userId,
        workspaceId: agentWorkspaceId,
        type: 'agent_completion',
        agentId: event.agentId,
        agentName: event.agentName,
        summary: event.summary,
        insights: event.insights,
      })
    }
  } catch (e) { console.error('[AgentCompletion] outreach error:', e) }
  
  // 4. Insert completion message into AI Manager conversation (CRITICAL)
  try {
    await insertCompletionMessage(event)
  } catch (e) { console.error('[AgentCompletion] insert message error:', e) }
  
  // 5. Check for milestones
  try {
    await checkCompletionMilestones(event.userId, agentWorkspaceId)
  } catch (e) { console.error('[AgentCompletion] milestone error:', e) }
  
  // 6. Update agent statistics
  try {
    await updateAgentStats(event)
  } catch (e) { console.error('[AgentCompletion] stats error:', e) }
}

/**
 * Insert completion message into AI Manager conversation
 */
async function insertCompletionMessage(event: AgentCompletionEvent): Promise<void> {
  const supabase = createAdminClient()
  
  // Get AI Manager conversation — try common titles, then fall back to most recent
  let conversation: { id: string } | null = null
  for (const title of ['AI Manager', 'Chat with AI Manager']) {
    const { data } = await supabase
      .from('conversations')
      .select('id')
      .eq('user_id', event.userId)
      .eq('title', title)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) { conversation = data as { id: string }; break }
  }
  // Fallback: most recent non-agent conversation
  if (!conversation) {
    const { data } = await supabase
      .from('conversations')
      .select('id')
      .eq('user_id', event.userId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) conversation = data as { id: string }
  }
  
  if (!conversation) {
    console.log('[AgentCompletion] No conversation found for user:', event.userId)
    return
  }
  
  let message: string
  
  // Detect if a "completed" run actually failed silently (agent didn't get reclassified)
  const summaryLower = (event.summary || '').toLowerCase()
  const completedWithIssues = event.status === 'completed' &&
    /\b(could not access|unable to access|connection (refused|failed|error)|econnrefused|network error|no internet|blocked|captcha|paywall|login required|failed to (load|fetch|retrieve|access|connect)|access (denied|restricted)|no results found|not available|service unavailable|api (error|call failed|returned an error)|http \d{3}|could not confirm|could not verify|not confirmed|not created|not added|wasn't (created|added|saved|updated)|unable to (create|add|write|update|confirm)|appears empty|workspace (is empty|was empty|appears to be empty)|no (records|entries|deals|companies|people) (found|exist|visible)|record (not found|was not created)|nothing (was added|was created|visible|appeared)|unverified|(could not|unable to|failed to) (create|add|confirm|verify)|api key (not|invalid|missing|incorrect))\b/.test(summaryLower)

  // verified === false means a write was attempted but not confirmed by the API
  const isUnverifiedWrite = event.verified === false

  if (event.status === 'completed' && !completedWithIssues && !isUnverifiedWrite) {
    message = `**${event.agentName}** just finished!

${event.summary}${event.insights && event.insights.length > 0 ? `

**Key insights:**
${event.insights.map(i => `• ${i}`).join('\n')}` : ''}`
  } else if (event.status === 'completed' && !completedWithIssues && isUnverifiedWrite) {
    message = `**${event.agentName}** reported finishing, but the external action could not be fully verified.

${event.summary}

I wasn't able to confirm the change was saved on the other end. This could mean the API call silently failed, a stage name didn't match, or the record wasn't created. I'll check and let you know if something needs to be retried.`
  } else if (completedWithIssues || event.status === 'failed') {
    message = `**${event.agentName}** ran into an issue.

${event.summary}

I'll look into what happened and try to fix it.`
  } else {
    message = `**${event.agentName}** timed out.

${event.summary}

This task took longer than expected. Want me to try again or adjust the approach?`
  }
  
  const convId = (conversation as { id: string }).id

  await supabase
    .from('messages')
    .insert({
      conversation_id: convId,
      role: 'assistant',
      content: message,
      metadata: {
        type: 'agent_completion',
        agent_id: event.agentId,
        agent_name: event.agentName,
        status: event.status,
      },
    } as never)

  // Update the agent_handoff status card so its live state reflects the final outcome
  // (realtime UPDATE subscription in page.tsx will re-render the card immediately)
  const { data: recentMsgsRaw } = await supabase
    .from('messages')
    .select('id, metadata')
    .eq('conversation_id', convId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(50)

  const recentMsgs = (recentMsgsRaw as Array<{ id: string; metadata: unknown }> | null) || []

  const handoffMsg = recentMsgs.find((m) => {
    const meta = m.metadata as Record<string, unknown> | null
    return meta?.type === 'agent_handoff' && meta?.agentId === event.agentId
  }) as { id: string; metadata: Record<string, unknown> } | undefined

  if (handoffMsg) {
    const newStatus = (event.status === 'completed' && !completedWithIssues) ? 'completed' : 'failed'
    await supabase
      .from('messages')
      .update({
        metadata: {
          ...handoffMsg.metadata,
          status: newStatus,
          _selfInserted: undefined,
        },
      } as never)
      .eq('id', handoffMsg.id)
  }

}

/**
 * Check and trigger completion milestones
 */
async function checkCompletionMilestones(userId: string, workspaceId: string): Promise<void> {
  const supabase = createAdminClient()
  
  // Count completed runs
  const { count } = await supabase
    .from('agent_run_metrics')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'completed')
  
  const completedRuns = count || 0
  
  // Check milestones
  const milestones = [
    { count: 1, type: 'first_completion', desc: 'Your first agent task completed!' },
    { count: 10, type: 'ten_completions', desc: 'Your agents have completed 10 tasks!' },
    { count: 50, type: 'fifty_completions', desc: 'Your agents have completed 50 tasks!' },
    { count: 100, type: 'hundred_completions', desc: 'Incredible! 100 tasks completed!' },
  ]
  
  for (const milestone of milestones) {
    if (completedRuns >= milestone.count) {
      // Check if already achieved
      const { data: existing } = await supabase
        .from('user_milestones')
        .select('id')
        .eq('user_id', userId)
        .eq('milestone_type', milestone.type)
        .single()
      
      if (!existing) {
        // Award milestone
        await supabase
          .from('user_milestones')
          .insert({
            user_id: userId,
            milestone_type: milestone.type,
            milestone_value: milestone.count,
            description: milestone.desc,
            achieved_at: new Date().toISOString(),
          } as never)
        
        // Schedule celebration outreach (workspace scoped)
        if (workspaceId && scheduleOutreach) {
          await scheduleOutreach({
            userId,
            workspaceId,
            type: 'celebration',
            milestone: milestone.desc,
          })
        }
      }
    }
  }
}

/**
 * Update agent statistics after completion
 */
async function updateAgentStats(event: AgentCompletionEvent): Promise<void> {
  const supabase = createAdminClient()
  
  // Get current stats
  const { data: agent } = await supabase
    .from('agents')
    .select('config')
    .eq('id', event.agentId)
    .single()
  
  if (!agent) return
  
  const config = (agent as { config: Record<string, unknown> }).config || {}
  const stats = (config.stats as Record<string, number>) || {}
  
  // Update stats
  const newStats = {
    total_runs: (stats.total_runs || 0) + 1,
    successful_runs: (stats.successful_runs || 0) + (event.status === 'completed' ? 1 : 0),
    failed_runs: (stats.failed_runs || 0) + (event.status === 'failed' ? 1 : 0),
    total_tokens: (stats.total_tokens || 0) + (event.tokensUsed || 0),
    total_cost_usd: (stats.total_cost_usd || 0) + (event.costUsd || 0),
    last_run_at: new Date().toISOString(),
  }
  
  await supabase
    .from('agents')
    .update({
      config: { ...config, stats: newStats },
      last_run_at: new Date().toISOString(),
    } as never)
    .eq('id', event.agentId)
}

/**
 * Handle agent error for tracking and potential recovery
 */
export async function onAgentError(
  agentId: string,
  userId: string,
  runId: string,
  errorType: string,
  errorMessage: string,
  context: Record<string, unknown>
): Promise<void> {
  const supabase = createAdminClient()
  
  // Log error for pattern analysis
  await supabase
    .from('agent_error_logs')
    .insert({
      agent_id: agentId,
      user_id: userId,
      run_id: runId,
      error_type: errorType,
      error_message: errorMessage,
      context,
      created_at: new Date().toISOString(),
    } as never)
  
  // Check if this is a recurring error
  const { count } = await supabase
    .from('agent_error_logs')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agentId)
    .eq('error_type', errorType)
    .gt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
  
  // If error is recurring, notify user
  if ((count || 0) >= 3 && notifyError) {
    await notifyError(
      userId,
      'Agent',
      `Your agent has encountered "${errorType}" multiple times. You may need to update its configuration.`
    )
  }
}
