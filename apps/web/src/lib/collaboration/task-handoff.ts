/**
 * Task Handoff Protocol
 * 
 * Enables agents to hand off tasks to other specialized agents when they
 * detect a need for expertise outside their scope.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createNonStreamingMessageWithFallback, DEFAULT_MODEL, extractTextFromResponse } from '@/lib/ai/ai-client'

export interface TaskHandoff {
  id: string
  source_agent_id: string
  source_agent_name: string
  target_agent_id?: string
  target_agent_name?: string
  user_id: string
  reason: string
  handoff_type: 'skill_gap' | 'workload' | 'specialization' | 'escalation'
  original_task: string
  subtask_description: string
  context_data: Record<string, unknown>
  status: 'pending' | 'accepted' | 'rejected' | 'completed' | 'failed'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  result_summary?: string
  success?: boolean
}

export interface AgentCapability {
  agent_id: string
  skill_name: string
  proficiency_score: number
  tasks_completed: number
  tasks_failed: number
  avg_duration_seconds?: number
}

export function getHandoffRunId(handoff: Pick<TaskHandoff, 'context_data'>): string {
  const rawRunId = handoff.context_data?.run_id
  return typeof rawRunId === 'string' ? rawRunId.trim() : ''
}

export function findExistingRunHandoff(
  handoffs: TaskHandoff[],
  sourceAgentId: string,
  runId: string
): TaskHandoff | null {
  const normalizedRunId = runId.trim()
  if (!normalizedRunId) return null

  for (const handoff of handoffs) {
    if (handoff.source_agent_id !== sourceAgentId) continue
    if (handoff.status !== 'pending' && handoff.status !== 'accepted') continue
    if (getHandoffRunId(handoff) === normalizedRunId) {
      return handoff
    }
  }

  return null
}

/**
 * Detect if a handoff is needed based on task requirements
 */
export async function detectHandoffNeed(
  agentId: string,
  taskDescription: string,
  currentSkills: string[],
  errorContext?: string
): Promise<{
  needsHandoff: boolean
  reason?: string
  handoffType?: TaskHandoff['handoff_type']
  requiredSkill?: string
  subtask?: string
}> {
  const prompt = `Analyze if this task requires skills beyond the current agent's capabilities.

CURRENT AGENT SKILLS: ${currentSkills.join(', ') || 'general'}

TASK: ${taskDescription}

${errorContext ? `RECENT ERROR: ${errorContext}` : ''}

Determine if a handoff to another agent is needed. Reasons for handoff:
1. skill_gap: Task requires a skill the agent doesn't have (e.g., agent knows Gmail but task needs LinkedIn)
2. workload: Task is too large and should be split
3. specialization: A more specialized agent would do better
4. escalation: Task is failing repeatedly and needs expert intervention

Respond in JSON:
{
  "needs_handoff": true/false,
  "reason": "explanation",
  "handoff_type": "skill_gap|workload|specialization|escalation",
  "required_skill": "skill name if applicable",
  "subtask": "specific subtask to hand off"
}`

  try {
    const { response } = await createNonStreamingMessageWithFallback({
      model: DEFAULT_MODEL,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = extractTextFromResponse(response)

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        needsHandoff: parsed.needs_handoff ?? false,
        reason: parsed.reason,
        handoffType: parsed.handoff_type,
        requiredSkill: parsed.required_skill,
        subtask: parsed.subtask,
      }
    }
  } catch (error) {
    console.error('[TaskHandoff] Detection error:', error)
  }

  return { needsHandoff: false }
}

/**
 * Find the best agent to handle a task
 */
export async function findBestAgentForTask(
  userId: string,
  skillName: string,
  excludeAgentId?: string
): Promise<{
  agentId: string
  agentName: string
  proficiencyScore: number
  currentWorkload: string
}[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase.rpc('find_best_agent_for_task' as never, {
    p_user_id: userId,
    p_skill_name: skillName,
    p_exclude_agent_id: excludeAgentId || null,
  } as never)

  if (error) {
    console.error('[TaskHandoff] Find agent error:', error)
    return []
  }

  const results = (data || []) as Array<{
    agent_id: string
    agent_name: string
    proficiency_score: number
    current_workload: string
  }>

  return results.map(row => ({
    agentId: row.agent_id,
    agentName: row.agent_name,
    proficiencyScore: row.proficiency_score,
    currentWorkload: row.current_workload,
  }))
}

/**
 * Create a task handoff request
 */
export async function createHandoff(
  sourceAgentId: string,
  sourceAgentName: string,
  userId: string,
  handoff: {
    reason: string
    handoffType: TaskHandoff['handoff_type']
    originalTask: string
    subtaskDescription: string
    contextData?: Record<string, unknown>
    targetAgentId?: string
    targetAgentName?: string
    priority?: TaskHandoff['priority']
  }
): Promise<string | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('agent_handoffs')
    .insert({
      source_agent_id: sourceAgentId,
      source_agent_name: sourceAgentName,
      target_agent_id: handoff.targetAgentId,
      target_agent_name: handoff.targetAgentName,
      user_id: userId,
      reason: handoff.reason,
      handoff_type: handoff.handoffType,
      original_task: handoff.originalTask,
      subtask_description: handoff.subtaskDescription,
      context_data: handoff.contextData || {},
      priority: handoff.priority || 'medium',
    } as never)
    .select('id')
    .single()

  if (error) {
    console.error('[TaskHandoff] Create error:', error)
    return null
  }

  return (data as { id: string })?.id || null
}

/**
 * Accept a handoff and start working on it
 */
export async function acceptHandoff(
  handoffId: string,
  targetAgentId: string,
  targetAgentName: string
): Promise<boolean> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('agent_handoffs')
    .update({
      target_agent_id: targetAgentId,
      target_agent_name: targetAgentName,
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    } as never)
    .eq('id', handoffId)

  return !error
}

/**
 * Complete a handoff with results
 */
export async function completeHandoff(
  handoffId: string,
  success: boolean,
  resultSummary: string
): Promise<boolean> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('agent_handoffs')
    .update({
      status: success ? 'completed' : 'failed',
      completed_at: new Date().toISOString(),
      success,
      result_summary: resultSummary,
    } as never)
    .eq('id', handoffId)

  return !error
}

/**
 * Get pending handoffs for a user
 */
export async function getPendingHandoffs(userId: string): Promise<TaskHandoff[]> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('agent_handoffs')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  return (data as TaskHandoff[]) || []
}

export async function getOpenHandoffs(userId: string): Promise<TaskHandoff[]> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('agent_handoffs')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: false })

  return (data as TaskHandoff[]) || []
}

/**
 * Update agent capability after task completion
 */
export async function updateAgentCapability(
  agentId: string,
  skillName: string,
  success: boolean,
  durationSeconds?: number
): Promise<void> {
  const supabase = createAdminClient()

  // Get current capability
  const { data: existing } = await supabase
    .from('agent_capabilities')
    .select('*')
    .eq('agent_id', agentId)
    .eq('skill_name', skillName)
    .single()

  if (existing) {
    const typed = existing as AgentCapability
    const newCompleted = typed.tasks_completed + (success ? 1 : 0)
    const newFailed = typed.tasks_failed + (success ? 0 : 1)
    const total = newCompleted + newFailed
    const newScore = total > 0 ? newCompleted / total : 0.5

    // Update average duration
    let newAvgDuration = typed.avg_duration_seconds
    if (durationSeconds && success) {
      if (typed.avg_duration_seconds) {
        newAvgDuration = (typed.avg_duration_seconds * typed.tasks_completed + durationSeconds) / newCompleted
      } else {
        newAvgDuration = durationSeconds
      }
    }

    await supabase
      .from('agent_capabilities')
      .update({
        tasks_completed: newCompleted,
        tasks_failed: newFailed,
        proficiency_score: newScore,
        avg_duration_seconds: newAvgDuration,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('agent_id', agentId)
      .eq('skill_name', skillName)
  } else {
    // Create new capability
    await supabase
      .from('agent_capabilities')
      .insert({
        agent_id: agentId,
        skill_name: skillName,
        tasks_completed: success ? 1 : 0,
        tasks_failed: success ? 0 : 1,
        proficiency_score: success ? 1 : 0,
        avg_duration_seconds: durationSeconds,
      } as never)
  }
}

/**
 * Format handoff for agent prompt
 */
export function formatHandoffForPrompt(handoff: TaskHandoff): string {
  return `
## Handoff Request from ${handoff.source_agent_name}

**Reason:** ${handoff.reason}
**Type:** ${handoff.handoff_type}
**Priority:** ${handoff.priority}

**Original Task:**
${handoff.original_task}

**Your Subtask:**
${handoff.subtask_description}

**Context:**
${JSON.stringify(handoff.context_data, null, 2)}

Please complete this subtask and report your results.
`
}

/**
 * Auto-route a handoff to the best available agent
 */
export async function autoRouteHandoff(
  handoffId: string,
  userId: string,
  requiredSkill: string,
  sourceAgentId: string
): Promise<{
  routed: boolean
  targetAgentId?: string
  targetAgentName?: string
}> {
  // Find best agent
  const candidates = await findBestAgentForTask(userId, requiredSkill, sourceAgentId)

  if (candidates.length === 0) {
    return { routed: false }
  }

  // Select best available (not overloaded)
  const best = candidates.find(c => c.currentWorkload !== 'overloaded') || candidates[0]

  // Accept on behalf of the agent
  const accepted = await acceptHandoff(handoffId, best.agentId, best.agentName)

  if (accepted) {
    return {
      routed: true,
      targetAgentId: best.agentId,
      targetAgentName: best.agentName,
    }
  }

  return { routed: false }
}
