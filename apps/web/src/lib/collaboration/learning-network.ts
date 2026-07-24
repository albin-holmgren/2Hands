/**
 * Shared Learning Network
 * 
 * Real-time knowledge sharing between agents. When one agent learns something,
 * it broadcasts to all other agents who might benefit.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createNonStreamingMessageWithFallback, DEFAULT_MODEL, extractTextFromResponse } from '@/lib/ai/ai-client'

export interface LearningBroadcast {
  id: string
  source_agent_id: string
  user_id: string
  learning_type: 'success_strategy' | 'error_solution' | 'ui_change' | 'workflow_optimization'
  skill_category: string
  title: string
  content: string
  task_context?: string
  evidence: Record<string, unknown>
  confidence: number
  verified: boolean
  times_applied: number
  times_helped: number
  broadcast_at: string
  expires_at: string
}

export interface LearningSubscription {
  id: string
  agent_id: string
  skill_category?: string
  learning_type?: string
  min_confidence: number
  is_active: boolean
}

/**
 * Broadcast a learning to the network
 */
export async function broadcastLearning(
  sourceAgentId: string,
  userId: string,
  learning: {
    type: LearningBroadcast['learning_type']
    skillCategory: string
    title: string
    content: string
    taskContext?: string
    evidence?: Record<string, unknown>
    confidence?: number
  }
): Promise<string | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('learning_broadcasts')
    .insert({
      source_agent_id: sourceAgentId,
      user_id: userId,
      learning_type: learning.type,
      skill_category: learning.skillCategory,
      title: learning.title,
      content: learning.content,
      task_context: learning.taskContext,
      evidence: learning.evidence || {},
      confidence: learning.confidence || 0.7,
    } as never)
    .select('id')
    .single()

  if (error) {
    console.error('[LearningNetwork] Broadcast error:', error)
    return null
  }

  console.log('[LearningNetwork] Learning broadcasted:', learning.title)
  return (data as { id: string })?.id || null
}

/**
 * Subscribe an agent to learning broadcasts
 */
export async function subscribeToLearnings(
  agentId: string,
  options: {
    skillCategory?: string
    learningType?: string
    minConfidence?: number
  } = {}
): Promise<boolean> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('learning_subscriptions')
    .upsert({
      agent_id: agentId,
      skill_category: options.skillCategory || null,
      learning_type: options.learningType || null,
      min_confidence: options.minConfidence || 0.6,
      is_active: true,
    } as never, {
      onConflict: 'agent_id,skill_category,learning_type',
    })

  return !error
}

/**
 * Get pending learnings for an agent
 */
export async function getPendingLearnings(
  agentId: string,
  limit: number = 10
): Promise<LearningBroadcast[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase.rpc('get_pending_learnings_for_agent' as never, {
    p_agent_id: agentId,
    p_limit: limit,
  } as never)

  if (error) {
    console.error('[LearningNetwork] Get learnings error:', error)
    return []
  }

  return (data || []) as LearningBroadcast[]
}

/**
 * Mark a learning as applied
 */
export async function markLearningApplied(
  learningId: string,
  helped: boolean
): Promise<void> {
  const supabase = createAdminClient()

  const { data: learning } = await supabase
    .from('learning_broadcasts')
    .select('times_applied, times_helped')
    .eq('id', learningId)
    .single()

  if (!learning) return

  const typed = learning as { times_applied: number; times_helped: number }

  await supabase
    .from('learning_broadcasts')
    .update({
      times_applied: typed.times_applied + 1,
      times_helped: helped ? typed.times_helped + 1 : typed.times_helped,
      verified: helped,
    } as never)
    .eq('id', learningId)
}

/**
 * Auto-detect learnable moments from task execution
 */
export async function detectLearnableMoment(
  agentId: string,
  userId: string,
  context: {
    taskDescription: string
    skillCategory: string
    action: string
    result: string
    success: boolean
    errorMessage?: string
    recoveryAttempted?: string
  }
): Promise<{
  shouldBroadcast: boolean
  learning?: {
    type: LearningBroadcast['learning_type']
    title: string
    content: string
  }
}> {
  // Only broadcast significant learnings
  if (!context.success && !context.recoveryAttempted) {
    return { shouldBroadcast: false }
  }

  const prompt = `Analyze this task execution and determine if there's a valuable learning to share with other agents.

SKILL: ${context.skillCategory}
TASK: ${context.taskDescription}
ACTION: ${context.action}
RESULT: ${context.result}
SUCCESS: ${context.success}
${context.errorMessage ? `ERROR: ${context.errorMessage}` : ''}
${context.recoveryAttempted ? `RECOVERY: ${context.recoveryAttempted}` : ''}

Determine if this contains a learning worth sharing:
- success_strategy: A particularly effective approach
- error_solution: How to recover from a specific error
- ui_change: A UI element changed location or name
- workflow_optimization: A faster/better way to do something

Only identify learnings that would help other agents. Skip routine operations.

Respond in JSON:
{
  "should_broadcast": true/false,
  "learning": {
    "type": "success_strategy|error_solution|ui_change|workflow_optimization",
    "title": "Short descriptive title",
    "content": "Detailed learning content"
  }
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
      if (parsed.should_broadcast && parsed.learning) {
        return {
          shouldBroadcast: true,
          learning: {
            type: parsed.learning.type,
            title: parsed.learning.title,
            content: parsed.learning.content,
          },
        }
      }
    }
  } catch (error) {
    console.error('[LearningNetwork] Detection error:', error)
  }

  return { shouldBroadcast: false }
}

/**
 * Format learnings for agent prompt injection
 */
export function formatLearningsForPrompt(learnings: LearningBroadcast[]): string {
  if (learnings.length === 0) return ''

  let output = '\n## Recent Learnings from Other Agents\n\n'
  output += '_These are recent discoveries from your colleague agents. Use them wisely._\n\n'

  const byType: Record<string, LearningBroadcast[]> = {}
  for (const l of learnings) {
    if (!byType[l.learning_type]) byType[l.learning_type] = []
    byType[l.learning_type].push(l)
  }

  const typeLabels: Record<string, string> = {
    success_strategy: '✓ Success Strategies',
    error_solution: '⚠ Error Solutions',
    ui_change: '🔄 UI Changes',
    workflow_optimization: '⚡ Workflow Tips',
  }

  for (const [type, items] of Object.entries(byType)) {
    output += `### ${typeLabels[type] || type}\n`
    for (const item of items.slice(0, 3)) {
      const verified = item.verified ? '✓' : ''
      output += `${verified} **${item.title}**\n`
      output += `${item.content}\n`
      if (item.times_helped > 0) {
        output += `_Helped ${item.times_helped} times_\n`
      }
      output += '\n'
    }
  }

  return output
}

/**
 * Get learning statistics for a user
 */
export async function getLearningStats(userId: string): Promise<{
  totalBroadcasts: number
  totalApplied: number
  helpfulRate: number
  topCategories: { category: string; count: number }[]
}> {
  const supabase = createAdminClient()

  const { data: broadcasts } = await supabase
    .from('learning_broadcasts')
    .select('skill_category, times_applied, times_helped')
    .eq('user_id', userId)

  if (!broadcasts) {
    return {
      totalBroadcasts: 0,
      totalApplied: 0,
      helpfulRate: 0,
      topCategories: [],
    }
  }

  const typed = broadcasts as Array<{
    skill_category: string
    times_applied: number
    times_helped: number
  }>

  const totalBroadcasts = typed.length
  const totalApplied = typed.reduce((sum, b) => sum + b.times_applied, 0)
  const totalHelped = typed.reduce((sum, b) => sum + b.times_helped, 0)
  const helpfulRate = totalApplied > 0 ? totalHelped / totalApplied : 0

  // Count by category
  const categoryCounts: Record<string, number> = {}
  for (const b of typed) {
    categoryCounts[b.skill_category] = (categoryCounts[b.skill_category] || 0) + 1
  }

  const topCategories = Object.entries(categoryCounts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return {
    totalBroadcasts,
    totalApplied,
    helpfulRate,
    topCategories,
  }
}

/**
 * Prune expired or unhelpful learnings
 */
export async function pruneLearnings(userId: string): Promise<number> {
  const supabase = createAdminClient()

  // Delete expired learnings
  const { data: deleted } = await supabase
    .from('learning_broadcasts')
    .delete()
    .eq('user_id', userId)
    .lt('expires_at', new Date().toISOString())
    .select('id')

  // Delete learnings with low help rate (applied many times but rarely helped)
  const { data: unhelpful } = await supabase
    .from('learning_broadcasts')
    .delete()
    .eq('user_id', userId)
    .gt('times_applied', 5)
    .lt('times_helped', 1) // Applied 5+ times but never helped
    .select('id')

  const deletedCount = (deleted?.length || 0) + (unhelpful?.length || 0)
  if (deletedCount > 0) {
    console.log('[LearningNetwork] Pruned', deletedCount, 'learnings')
  }

  return deletedCount
}
