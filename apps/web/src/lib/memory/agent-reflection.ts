/**
 * Agent Self-Reflection System
 * 
 * After each run, agents analyze what went well, what failed,
 * and how to improve. This enables continuous learning.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createNonStreamingMessageWithFallback, DEFAULT_MODEL } from '@/lib/ai/ai-client'

export interface AgentReflection {
  whatWorked: string[]
  whatFailed: string[]
  improvements: string[]
  taskComplexity: 'simple' | 'moderate' | 'complex'
  successRating: number // 1-5
}

export interface ReflectionContext {
  taskDescription: string
  completed: boolean
  insightsReported: number
  iterationsUsed: number
  errorsEncountered: string[]
  toolsUsed: string[]
}

let _rlsWarningShown = false

/**
 * Generate a self-reflection after an agent run
 */
export async function generateSelfReflection(
  agentId: string,
  context: ReflectionContext
): Promise<AgentReflection | null> {
  const reflectionPrompt = `You are an AI agent reflecting on your recent task execution.

TASK: ${context.taskDescription}

EXECUTION SUMMARY:
- Completed: ${context.completed ? 'Yes' : 'No'}
- Insights reported: ${context.insightsReported}
- Iterations used: ${context.iterationsUsed}
- Errors encountered: ${context.errorsEncountered.length > 0 ? context.errorsEncountered.join(', ') : 'None'}
- Tools used: ${context.toolsUsed.join(', ')}

Reflect on this execution and provide honest feedback. Be specific about what worked and what could be improved.

Respond in this exact JSON format:
{
  "whatWorked": ["specific thing 1", "specific thing 2"],
  "whatFailed": ["specific issue 1"],
  "improvements": ["actionable improvement 1"],
  "taskComplexity": "simple|moderate|complex",
  "successRating": 1-5
}`

  try {
    const { response } = await createNonStreamingMessageWithFallback({
      model: DEFAULT_MODEL,
      max_tokens: 512,
      messages: [{ role: 'user', content: reflectionPrompt }],
    })
    
    const responseText = response.content[0].type === 'text' 
      ? response.content[0].text 
      : ''
    
    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[AgentReflection] Failed to parse AI response')
      return null
    }
    
    const reflection = JSON.parse(jsonMatch[0]) as AgentReflection
    
    // Store the reflection
    await storeReflection(agentId, reflection)
    
    return reflection
    
  } catch (error) {
    console.error('[AgentReflection] Error generating reflection:', error)
    return null
  }
}

/**
 * Store a reflection in the database
 */
export async function storeReflection(
  agentId: string,
  reflection: AgentReflection
): Promise<boolean> {
  const supabase = createAdminClient()
  
  const { error } = await supabase
    .from('agent_reflections')
    .insert({
      agent_id: agentId,
      run_date: new Date().toISOString().split('T')[0],
      what_worked: reflection.whatWorked,
      what_failed: reflection.whatFailed,
      improvements: reflection.improvements,
      task_complexity: reflection.taskComplexity,
      success_rating: reflection.successRating,
      created_at: new Date().toISOString(),
    } as never)
  
  if (error) {
    if ((error as { code?: string }).code === '42501') {
      if (!_rlsWarningShown) {
        _rlsWarningShown = true
        console.warn('[AgentReflection] Failed to store reflection (RLS):', error)
      }
      return false
    }

    console.error('[AgentReflection] Failed to store reflection:', error)
    return false
  }
  
  return true
}

/**
 * Get recent reflections for an agent
 */
export async function getAgentReflections(
  agentId: string,
  limit: number = 5
): Promise<AgentReflection[]> {
  const supabase = createAdminClient()
  
  interface ReflectionRow {
    what_worked: string[]
    what_failed: string[]
    improvements: string[]
    task_complexity: string
    success_rating: number
  }
  
  const { data, error } = await supabase
    .from('agent_reflections')
    .select('what_worked, what_failed, improvements, task_complexity, success_rating')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(limit)
  
  if (error) {
    console.error('[AgentReflection] Failed to get reflections:', error)
    return []
  }
  
  return ((data || []) as ReflectionRow[]).map(r => ({
    whatWorked: r.what_worked || [],
    whatFailed: r.what_failed || [],
    improvements: r.improvements || [],
    taskComplexity: r.task_complexity as AgentReflection['taskComplexity'],
    successRating: r.success_rating,
  }))
}

/**
 * Format past reflections for injection into agent prompt
 * Helps the agent learn from past mistakes
 */
export function formatReflectionsForPrompt(reflections: AgentReflection[]): string {
  if (reflections.length === 0) return ''
  
  // Aggregate learnings from past reflections
  const allImprovements = reflections.flatMap(r => r.improvements)
  const allFailures = reflections.flatMap(r => r.whatFailed)
  const avgRating = reflections.reduce((sum, r) => sum + r.successRating, 0) / reflections.length
  
  // Deduplicate
  const uniqueImprovements = [...new Set(allImprovements)].slice(0, 5)
  const uniqueFailures = [...new Set(allFailures)].slice(0, 3)
  
  let prompt = '\n=== LESSONS FROM PAST RUNS ===\n'
  
  if (uniqueImprovements.length > 0) {
    prompt += '\n### Improvements to Apply\n'
    prompt += uniqueImprovements.map(i => `- ${i}`).join('\n')
  }
  
  if (uniqueFailures.length > 0) {
    prompt += '\n\n### Common Issues to Avoid\n'
    prompt += uniqueFailures.map(f => `- ${f}`).join('\n')
  }
  
  prompt += `\n\nHistorical success rate: ${(avgRating / 5 * 100).toFixed(0)}%\n`
  prompt += 'Apply these lessons to perform better on this task.\n'
  
  return prompt
}

/**
 * Analyze patterns across all agent reflections for a user
 * Returns insights about common issues and successes
 */
export async function analyzeUserAgentPatterns(userId: string): Promise<{
  commonIssues: string[]
  topStrengths: string[]
  averageSuccessRate: number
}> {
  const supabase = createAdminClient()
  
  // Get all reflections for user's agents
  const { data: reflections, error } = await supabase
    .from('agent_reflections')
    .select(`
      what_worked,
      what_failed,
      success_rating,
      agents!inner(user_id)
    `)
    .eq('agents.user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  
  if (error || !reflections) {
    return { commonIssues: [], topStrengths: [], averageSuccessRate: 0 }
  }
  
  type ReflectionWithAgent = {
    what_worked: string[]
    what_failed: string[]
    success_rating: number
  }
  
  const typedReflections = reflections as ReflectionWithAgent[]
  
  // Aggregate
  const allWorked = typedReflections.flatMap(r => r.what_worked || [])
  const allFailed = typedReflections.flatMap(r => r.what_failed || [])
  const ratings = typedReflections.map(r => r.success_rating)
  
  // Count frequencies
  const workedCounts = countFrequencies(allWorked)
  const failedCounts = countFrequencies(allFailed)
  
  // Get top items
  const topStrengths = getTopItems(workedCounts, 5)
  const commonIssues = getTopItems(failedCounts, 5)
  
  const avgRating = ratings.length > 0 
    ? ratings.reduce((a, b) => a + b, 0) / ratings.length 
    : 0
  
  return {
    commonIssues,
    topStrengths,
    averageSuccessRate: avgRating,
  }
}

function countFrequencies(items: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const normalized = item.toLowerCase().trim()
    counts.set(normalized, (counts.get(normalized) || 0) + 1)
  }
  return counts
}

function getTopItems(counts: Map<string, number>, n: number): string[] {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([item]) => item)
}
