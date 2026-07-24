/**
 * AI Manager Orchestration System
 *
 * Strategic task prioritization, workload balancing, and intelligent
 * task assignment across all agents.
 *
 * ⚠️  ARCHITECTURE NOTE (Phase 1 cleanup — see openclaw-architecture-analysis plan):
 *
 *  The `orchestration_queue` / `agent_workload` table functions below are
 *  CURRENTLY DORMANT. They have no callers in the live runtime.
 *
 *  The authoritative execution queue for mission + agent work is `agent_runs`
 *  (see `src/lib/agents/run-queue.ts`). Mission progress and events are
 *  tracked in `mission_events` (see `src/lib/missions/mission-service.ts`).
 *
 *  These functions are kept for reference but should NOT be wired up until
 *  the single-queue architecture decision has been finalised. Do NOT call
 *  queueTask() or autoAssignQueuedTasks() from new code.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createNonStreamingMessageWithFallback, DEFAULT_MODEL, extractTextFromResponse } from '@/lib/ai/ai-client'

export interface QueuedTask {
  id: string
  user_id: string
  task_description: string
  task_type?: string
  assigned_agent_id?: string
  assignment_reason?: string
  priority_score: number
  priority_factors: {
    urgency?: number
    importance?: number
    deadline?: string
    dependencies?: string[]
  }
  deadline?: string
  optimal_start_time?: string
  depends_on?: string[]
  blocks?: string[]
  status: 'queued' | 'assigned' | 'running' | 'completed' | 'failed' | 'cancelled'
  started_at?: string
  completed_at?: string
  result_summary?: string
  success?: boolean
}

export interface AgentWorkload {
  agent_id: string
  current_task_id?: string
  status: 'idle' | 'busy' | 'overloaded' | 'maintenance'
  tasks_in_queue: number
  estimated_completion_time?: string
  tasks_completed_today: number
  avg_task_duration_seconds?: number
  success_rate_24h?: number
  consecutive_failures: number
  last_error?: string
  needs_attention: boolean
}

/**
 * Add a task to the orchestration queue
 */
export async function queueTask(
  userId: string,
  taskDescription: string,
  options: {
    urgency?: number // 0-1
    importance?: number // 0-1
    deadline?: Date
    dependsOn?: string[]
  } = {}
): Promise<string | null> {
  const supabase = createAdminClient()

  // Detect task type
  const taskType = await detectTaskType(taskDescription)

  // Calculate priority score
  const hasDeadline = !!options.deadline
  const minutesToDeadline = options.deadline
    ? Math.floor((options.deadline.getTime() - Date.now()) / 60000)
    : null

  const priorityScore = calculatePriorityScore(
    options.urgency || 0.5,
    options.importance || 0.5,
    hasDeadline,
    minutesToDeadline,
    (options.dependsOn?.length || 0) > 0
  )

  const { data, error } = await supabase
    .from('orchestration_queue')
    .insert({
      user_id: userId,
      task_description: taskDescription,
      task_type: taskType,
      priority_score: priorityScore,
      priority_factors: {
        urgency: options.urgency,
        importance: options.importance,
        deadline: options.deadline?.toISOString(),
        dependencies: options.dependsOn,
      },
      deadline: options.deadline?.toISOString(),
      depends_on: options.dependsOn || [],
    } as never)
    .select('id')
    .single()

  if (error) {
    console.error('[Orchestration] Queue error:', error)
    return null
  }

  console.log('[Orchestration] Task queued with priority:', priorityScore)
  return (data as { id: string })?.id || null
}

/**
 * Calculate priority score
 */
function calculatePriorityScore(
  urgency: number,
  importance: number,
  hasDeadline: boolean,
  minutesToDeadline: number | null,
  hasDependencies: boolean
): number {
  let deadlineFactor = 0
  let dependencyFactor = 0

  if (hasDeadline && minutesToDeadline !== null) {
    if (minutesToDeadline < 60) deadlineFactor = 0.3
    else if (minutesToDeadline < 240) deadlineFactor = 0.2
    else if (minutesToDeadline < 1440) deadlineFactor = 0.1
  }

  if (hasDependencies) {
    dependencyFactor = 0.1
  }

  return Math.min(1.0, urgency * 0.3 + importance * 0.3 + deadlineFactor + dependencyFactor)
}

/**
 * Detect task type from description
 */
async function detectTaskType(taskDescription: string): Promise<string> {
  const lower = taskDescription.toLowerCase()

  if (lower.includes('email') || lower.includes('gmail') || lower.includes('outlook')) {
    return 'email'
  }
  if (lower.includes('linkedin') || lower.includes('twitter') || lower.includes('social')) {
    return 'social_media'
  }
  if (lower.includes('spreadsheet') || lower.includes('sheets') || lower.includes('excel')) {
    return 'data_entry'
  }
  if (lower.includes('research') || lower.includes('find') || lower.includes('look up')) {
    return 'research'
  }
  if (lower.includes('schedule') || lower.includes('calendar') || lower.includes('meeting')) {
    return 'scheduling'
  }

  return 'general'
}

/**
 * Get the next task to assign
 */
export async function getNextTaskToAssign(userId: string): Promise<QueuedTask | null> {
  const supabase = createAdminClient()

  // Get highest priority unassigned task
  const { data } = await supabase
    .from('orchestration_queue')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'queued')
    .order('priority_score', { ascending: false })
    .limit(1)
    .single()

  return data as QueuedTask | null
}

/**
 * Assign a task to an agent
 */
export async function assignTaskToAgent(
  taskId: string,
  agentId: string,
  reason: string
): Promise<boolean> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('orchestration_queue')
    .update({
      assigned_agent_id: agentId,
      assignment_reason: reason,
      status: 'assigned',
    } as never)
    .eq('id', taskId)

  if (!error) {
    // Update agent workload
    await updateAgentWorkload(agentId, taskId)
  }

  return !error
}

/**
 * Update agent workload tracking
 */
export async function updateAgentWorkload(
  agentId: string,
  currentTaskId?: string
): Promise<void> {
  const supabase = createAdminClient()

  // Get current workload
  const { data: existing } = await supabase
    .from('agent_workload')
    .select('*')
    .eq('agent_id', agentId)
    .single()

  if (existing) {
    await supabase
      .from('agent_workload')
      .update({
        current_task_id: currentTaskId,
        status: currentTaskId ? 'busy' : 'idle',
        updated_at: new Date().toISOString(),
      } as never)
      .eq('agent_id', agentId)
  } else {
    await supabase
      .from('agent_workload')
      .insert({
        agent_id: agentId,
        current_task_id: currentTaskId,
        status: currentTaskId ? 'busy' : 'idle',
      } as never)
  }
}

/**
 * Get all agent workloads for a user
 */
export async function getAgentWorkloads(userId: string): Promise<AgentWorkload[]> {
  const supabase = createAdminClient()

  const { data: agents } = await supabase
    .from('agents')
    .select('id')
    .eq('user_id', userId)
    .neq('status', 'deleted')

  if (!agents || agents.length === 0) return []

  const agentIds = agents.map((a: { id: string }) => a.id)

  const { data: workloads } = await supabase
    .from('agent_workload')
    .select('*')
    .in('agent_id', agentIds)

  return (workloads || []) as AgentWorkload[]
}

/**
 * Find the best agent for a task
 */
export async function findBestAgentForQueuedTask(
  userId: string,
  task: QueuedTask
): Promise<{
  agentId: string
  agentName: string
  reason: string
} | null> {
  const supabase = createAdminClient()

  // Get all agents with their capabilities and workloads
  const { data: agents } = await supabase
    .from('agents')
    .select('id, name')
    .eq('user_id', userId)
    .neq('status', 'deleted')

  if (!agents || agents.length === 0) return null

  // Get workloads
  const workloads = await getAgentWorkloads(userId)
  const workloadMap = new Map(workloads.map(w => [w.agent_id, w]))

  // Get capabilities for task type
  const skillName = task.task_type || 'general'
  const { data: capabilities } = await supabase
    .from('agent_capabilities')
    .select('agent_id, proficiency_score')
    .eq('skill_name', skillName)
    .in('agent_id', agents.map((a: { id: string }) => a.id))

  const capMap = new Map(
    (capabilities || []).map((c: { agent_id: string; proficiency_score: number }) => [c.agent_id, c.proficiency_score])
  )

  // Score each agent
  let bestAgent: { id: string; name: string; score: number; reason: string } | null = null

  for (const agent of agents as Array<{ id: string; name: string }>) {
    const workload = workloadMap.get(agent.id)
    const proficiency = capMap.get(agent.id) || 0.5

    // Skip overloaded agents
    if (workload?.status === 'overloaded' || workload?.status === 'maintenance') {
      continue
    }

    // Calculate score
    let score = proficiency * 0.5

    // Bonus for idle agents
    if (!workload || workload.status === 'idle') {
      score += 0.3
    }

    // Bonus for high success rate
    if (workload?.success_rate_24h && workload.success_rate_24h > 0.8) {
      score += 0.2
    }

    // Penalty for recent failures
    if (workload?.consecutive_failures && workload.consecutive_failures > 2) {
      score -= 0.2
    }

    if (!bestAgent || score > bestAgent.score) {
      bestAgent = {
        id: agent.id,
        name: agent.name,
        score,
        reason: `Best match for ${skillName} (proficiency: ${Math.round(proficiency * 100)}%, status: ${workload?.status || 'idle'})`,
      }
    }
  }

  if (bestAgent) {
    return {
      agentId: bestAgent.id,
      agentName: bestAgent.name,
      reason: bestAgent.reason,
    }
  }

  return null
}

/**
 * Mark a task as completed
 */
export async function completeQueuedTask(
  taskId: string,
  success: boolean,
  resultSummary: string
): Promise<void> {
  const supabase = createAdminClient()

  const { data: task } = await supabase
    .from('orchestration_queue')
    .select('assigned_agent_id')
    .eq('id', taskId)
    .single()

  await supabase
    .from('orchestration_queue')
    .update({
      status: success ? 'completed' : 'failed',
      completed_at: new Date().toISOString(),
      success,
      result_summary: resultSummary,
    } as never)
    .eq('id', taskId)

  // Update agent workload
  if (task) {
    const typedTask = task as { assigned_agent_id: string | null }
    if (typedTask.assigned_agent_id) {
      await updateAgentWorkload(typedTask.assigned_agent_id, undefined)

      // Update daily stats
      const { data: workload } = await supabase
        .from('agent_workload')
        .select('tasks_completed_today, consecutive_failures')
        .eq('agent_id', typedTask.assigned_agent_id)
        .single()

      if (workload) {
        const typed = workload as { tasks_completed_today: number; consecutive_failures: number }
        await supabase
          .from('agent_workload')
          .update({
            tasks_completed_today: typed.tasks_completed_today + 1,
            consecutive_failures: success ? 0 : typed.consecutive_failures + 1,
            needs_attention: !success && typed.consecutive_failures >= 2,
          } as never)
          .eq('agent_id', typedTask.assigned_agent_id)
      }
    }
  }
}

/**
 * Get queue summary for AI Manager
 */
export async function getQueueSummary(userId: string): Promise<{
  totalQueued: number
  totalRunning: number
  totalCompleted: number
  highPriorityCount: number
  failedCount: number
  agentStatuses: { agentId: string; status: string; currentTask?: string }[]
}> {
  const supabase = createAdminClient()

  const { data: queue } = await supabase
    .from('orchestration_queue')
    .select('status, priority_score')
    .eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  const workloads = await getAgentWorkloads(userId)

  const typed = (queue || []) as Array<{ status: string; priority_score: number }>

  return {
    totalQueued: typed.filter(t => t.status === 'queued').length,
    totalRunning: typed.filter(t => t.status === 'running' || t.status === 'assigned').length,
    totalCompleted: typed.filter(t => t.status === 'completed').length,
    highPriorityCount: typed.filter(t => t.priority_score > 0.7).length,
    failedCount: typed.filter(t => t.status === 'failed').length,
    agentStatuses: workloads.map(w => ({
      agentId: w.agent_id,
      status: w.status,
      currentTask: w.current_task_id || undefined,
    })),
  }
}

/**
 * Auto-assign all queued tasks
 */
export async function autoAssignQueuedTasks(userId: string): Promise<number> {
  const supabase = createAdminClient()

  // Get all queued tasks ordered by priority
  const { data: tasks } = await supabase
    .from('orchestration_queue')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'queued')
    .order('priority_score', { ascending: false })

  if (!tasks || tasks.length === 0) return 0

  let assigned = 0

  for (const task of tasks as QueuedTask[]) {
    const bestAgent = await findBestAgentForQueuedTask(userId, task)
    if (bestAgent) {
      const success = await assignTaskToAgent(task.id, bestAgent.agentId, bestAgent.reason)
      if (success) assigned++
    }
  }

  console.log('[Orchestration] Auto-assigned', assigned, 'tasks')
  return assigned
}

/**
 * Format queue status for AI Manager prompt
 */
export function formatQueueStatusForPrompt(summary: Awaited<ReturnType<typeof getQueueSummary>>): string {
  let output = '\n## Current Task Queue Status\n\n'

  output += `- **Queued:** ${summary.totalQueued}\n`
  output += `- **Running:** ${summary.totalRunning}\n`
  output += `- **Completed (24h):** ${summary.totalCompleted}\n`

  if (summary.highPriorityCount > 0) {
    output += `- **High Priority:** ${summary.highPriorityCount}\n`
  }

  if (summary.failedCount > 0) {
    output += `- **Failed:** ${summary.failedCount}\n`
  }

  if (summary.agentStatuses.length > 0) {
    output += '\n**Agent Status:**\n'
    for (const agent of summary.agentStatuses) {
      output += `- ${agent.agentId.slice(0, 8)}: ${agent.status}\n`
    }
  }

  return output
}
