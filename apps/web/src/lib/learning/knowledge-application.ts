/**
 * Knowledge Application System
 * 
 * Tracks when agents apply learned knowledge and whether it helped.
 * Creates a feedback loop that strengthens good learnings and weakens bad ones.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface LearningApplication {
  id: string
  agent_id: string
  user_id: string
  pattern_id: string | null
  
  // What learning was applied
  learning_type: 'tip' | 'pitfall_avoided' | 'research_applied' | 'workflow_followed'
  learning_content: string
  source: 'pattern' | 'research' | 'reflection' | 'shared_knowledge'
  
  // Outcome tracking
  applied_at: string
  outcome: 'helped' | 'neutral' | 'hurt' | 'pending'
  outcome_notes: string | null
  
  // Context
  task_description: string
  step_number: number
}

export interface LearningFeedback {
  learning_content: string
  helped: boolean
  context: string
}

/**
 * Record that a learning was applied
 */
export async function recordLearningApplication(
  agentId: string,
  userId: string,
  patternId: string | null,
  learningType: LearningApplication['learning_type'],
  learningContent: string,
  source: LearningApplication['source'],
  taskDescription: string,
  stepNumber: number
): Promise<string> {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase
    .from('learning_applications')
    .insert({
      agent_id: agentId,
      user_id: userId,
      pattern_id: patternId,
      learning_type: learningType,
      learning_content: learningContent,
      source,
      task_description: taskDescription,
      step_number: stepNumber,
      outcome: 'pending',
    } as never)
    .select('id')
    .single()
  
  if (error) {
    console.error('[KnowledgeApplication] Error recording application:', error)
    return ''
  }
  
  return (data as { id: string })?.id || ''
}

/**
 * Record the outcome of an applied learning
 */
export async function recordLearningOutcome(
  applicationId: string,
  outcome: 'helped' | 'neutral' | 'hurt',
  notes?: string
): Promise<void> {
  const supabase = createAdminClient()
  
  await supabase
    .from('learning_applications')
    .update({
      outcome,
      outcome_notes: notes,
    } as never)
    .eq('id', applicationId)
  
  // If the learning helped or hurt, update the pattern confidence
  const { data: application } = await supabase
    .from('learning_applications')
    .select('pattern_id, learning_content, source')
    .eq('id', applicationId)
    .single()
  
  if (application && (application as { pattern_id: string }).pattern_id) {
    const typedApp = application as { pattern_id: string; learning_content: string }
    await adjustLearningWeight(
      typedApp.pattern_id,
      typedApp.learning_content,
      outcome
    )
  }
}

/**
 * Adjust the weight/confidence of a learning based on outcome
 */
async function adjustLearningWeight(
  patternId: string,
  learningContent: string,
  outcome: 'helped' | 'neutral' | 'hurt'
): Promise<void> {
  const supabase = createAdminClient()
  
  // Get current pattern
  const { data: pattern } = await supabase
    .from('task_execution_patterns')
    .select('success_tips, common_pitfalls, confidence_score')
    .eq('id', patternId)
    .single()
  
  if (!pattern) return
  
  const typedPattern = pattern as {
    success_tips: string[]
    common_pitfalls: string[]
    confidence_score: number
  }
  
  // Adjust confidence based on outcome
  let confidenceAdjust = 0
  if (outcome === 'helped') {
    confidenceAdjust = 0.02 // Small boost
  } else if (outcome === 'hurt') {
    confidenceAdjust = -0.05 // Larger penalty for bad advice
  }
  
  await supabase
    .from('task_execution_patterns')
    .update({
      confidence_score: Math.max(0, Math.min(1, typedPattern.confidence_score + confidenceAdjust)),
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', patternId)
}

/**
 * Get learning effectiveness stats
 */
export async function getLearningEffectiveness(
  userId: string,
  options: { patternId?: string; agentId?: string; days?: number } = {}
): Promise<{
  totalApplications: number
  helped: number
  neutral: number
  hurt: number
  helpRate: number
  topHelpfulLearnings: string[]
  topHarmfulLearnings: string[]
}> {
  const supabase = createAdminClient()
  
  let query = supabase
    .from('learning_applications')
    .select('*')
    .eq('user_id', userId)
    .neq('outcome', 'pending')
  
  if (options.patternId) {
    query = query.eq('pattern_id', options.patternId)
  }
  if (options.agentId) {
    query = query.eq('agent_id', options.agentId)
  }
  if (options.days) {
    const since = new Date()
    since.setDate(since.getDate() - options.days)
    query = query.gte('applied_at', since.toISOString())
  }
  
  const { data: applications } = await query
  
  if (!applications || applications.length === 0) {
    return {
      totalApplications: 0,
      helped: 0,
      neutral: 0,
      hurt: 0,
      helpRate: 0,
      topHelpfulLearnings: [],
      topHarmfulLearnings: [],
    }
  }
  
  const typedApps = applications as Array<{
    outcome: string
    learning_content: string
  }>
  
  const helped = typedApps.filter(a => a.outcome === 'helped').length
  const neutral = typedApps.filter(a => a.outcome === 'neutral').length
  const hurt = typedApps.filter(a => a.outcome === 'hurt').length
  
  // Find most helpful and harmful learnings
  const helpfulCounts: Record<string, number> = {}
  const harmfulCounts: Record<string, number> = {}
  
  for (const app of typedApps) {
    if (app.outcome === 'helped') {
      helpfulCounts[app.learning_content] = (helpfulCounts[app.learning_content] || 0) + 1
    } else if (app.outcome === 'hurt') {
      harmfulCounts[app.learning_content] = (harmfulCounts[app.learning_content] || 0) + 1
    }
  }
  
  const topHelpful = Object.entries(helpfulCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([content]) => content)
  
  const topHarmful = Object.entries(harmfulCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([content]) => content)
  
  return {
    totalApplications: typedApps.length,
    helped,
    neutral,
    hurt,
    helpRate: typedApps.length > 0 ? helped / typedApps.length : 0,
    topHelpfulLearnings: topHelpful,
    topHarmfulLearnings: topHarmful,
  }
}

/**
 * Prune learnings that consistently hurt performance
 */
export async function pruneHarmfulLearnings(
  userId: string,
  threshold: number = 3 // Remove after 3 "hurt" outcomes
): Promise<number> {
  const supabase = createAdminClient()
  
  // Find learnings that have hurt more than threshold times
  const { data: harmful } = await supabase
    .from('learning_applications')
    .select('learning_content, pattern_id')
    .eq('user_id', userId)
    .eq('outcome', 'hurt')
  
  if (!harmful) return 0
  
  const typedHarmful = harmful as Array<{
    learning_content: string
    pattern_id: string | null
  }>
  
  // Count occurrences
  const hurtCounts: Record<string, { count: number; patternIds: Set<string> }> = {}
  for (const h of typedHarmful) {
    if (!hurtCounts[h.learning_content]) {
      hurtCounts[h.learning_content] = { count: 0, patternIds: new Set() }
    }
    hurtCounts[h.learning_content].count++
    if (h.pattern_id) {
      hurtCounts[h.learning_content].patternIds.add(h.pattern_id)
    }
  }
  
  let prunedCount = 0
  
  // Remove from patterns
  for (const [content, data] of Object.entries(hurtCounts)) {
    if (data.count >= threshold) {
      for (const patternId of data.patternIds) {
        // Remove from success_tips if present
        const { data: pattern } = await supabase
          .from('task_execution_patterns')
          .select('success_tips')
          .eq('id', patternId)
          .single()
        
        if (pattern) {
          const tips = (pattern as { success_tips: string[] }).success_tips || []
          const filtered = tips.filter(t => t !== content)
          
          if (filtered.length !== tips.length) {
            await supabase
              .from('task_execution_patterns')
              .update({ success_tips: filtered } as never)
              .eq('id', patternId)
            prunedCount++
          }
        }
      }
    }
  }
  
  return prunedCount
}

/**
 * Promote highly effective learnings to shared knowledge
 */
export async function promoteEffectiveLearnings(
  userId: string,
  minHelpCount: number = 5
): Promise<number> {
  const supabase = createAdminClient()
  
  // Find learnings that have helped many times
  const { data: helpful } = await supabase
    .from('learning_applications')
    .select('learning_content, learning_type')
    .eq('user_id', userId)
    .eq('outcome', 'helped')
  
  if (!helpful) return 0
  
  const typedHelpful = helpful as Array<{
    learning_content: string
    learning_type: string
  }>
  
  // Count occurrences
  const helpCounts: Record<string, number> = {}
  for (const h of typedHelpful) {
    helpCounts[h.learning_content] = (helpCounts[h.learning_content] || 0) + 1
  }
  
  let promotedCount = 0
  
  // Promote high-value learnings to user_shared_knowledge
  for (const [content, count] of Object.entries(helpCounts)) {
    if (count >= minHelpCount) {
      // Check if already shared
      const { data: existing } = await supabase
        .from('user_shared_knowledge')
        .select('id')
        .eq('user_id', userId)
        .eq('content', content)
        .single()
      
      if (!existing) {
        await supabase
          .from('user_shared_knowledge')
          .insert({
            user_id: userId,
            category: 'workflow_pattern',
            content,
            source_agent_id: null,
            confidence: Math.min(1.0, 0.5 + (count * 0.05)), // Higher count = higher confidence
          } as never)
        promotedCount++
      }
    }
  }
  
  return promotedCount
}

/**
 * Generate learning application summary for prompt injection
 */
export function formatLearningApplicationInstructions(
  hasLearnings: boolean,
  hasResearch: boolean
): string {
  if (!hasLearnings && !hasResearch) {
    return ''
  }
  
  return `
## 🧠 ACTIVE LEARNING MODE

You have learned knowledge available. Here's how to use it:

${hasLearnings ? `### From Previous Runs
- Success tips are marked with ✓ - APPLY THESE FIRST
- Pitfalls are marked with ⚠ - ACTIVELY AVOID THESE
- If confidence >50%, trust and follow the recommended approach
- After each action, note if a learning helped or hurt
` : ''}

${hasResearch ? `### From Tool Research  
- Button labels and form fields are PRE-RESEARCHED - use exact names
- Common errors are documented with solutions - apply them preemptively
- UI patterns show what to look for - use wait_for_text with these
` : ''}

### Record New Learnings
When something works well: remember("click_text worked better than coordinates", "pattern")
When something fails: remember("Gmail required 2FA unexpectedly", "important")

YOUR LEARNING HELPS FUTURE RUNS - BE THOROUGH!
`
}
