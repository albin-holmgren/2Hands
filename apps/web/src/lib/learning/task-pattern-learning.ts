/**
 * Task Pattern Learning System
 * 
 * Learns from repetitive tasks to improve over time:
 * - Tracks what works and what fails for each task type
 * - Builds optimal execution patterns from successful runs
 * - Provides learned wisdom to future executions
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createHash } from 'crypto'
import { createNonStreamingMessageWithFallback, DEFAULT_MODEL, extractTextFromResponse } from '@/lib/ai/ai-client'

export interface TaskPattern {
  id: string
  task_type: string
  task_keywords: string[]
  optimal_approach: OptimalApproach
  common_pitfalls: string[]
  success_tips: string[]
  required_preconditions: string[]
  confidence_score: number
  total_executions: number
  successful_executions: number
  avg_steps_to_complete: number | null
  avg_duration_seconds: number | null
}

export interface OptimalApproach {
  recommended_tools: string[]
  step_sequence: string[]
  verification_points: string[]
  time_estimates: Record<string, number>
}

export interface ExecutionStep {
  tool: string
  input: Record<string, unknown>
  result: string
  success: boolean
  duration_ms: number
}

export interface RunLearnings {
  what_worked: string[]
  what_failed: string[]
  improvements_identified: string[]
  new_knowledge: string[]
}

/**
 * Generate a fingerprint for a task description
 * Used to match similar tasks
 */
export function generateTaskFingerprint(taskDescription: string): string {
  // Normalize: lowercase, remove extra spaces, remove specific names/dates
  const normalized = taskDescription
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\d{4}-\d{2}-\d{2}/g, 'DATE')
    .replace(/\d{1,2}:\d{2}/g, 'TIME')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, 'EMAIL')
    .replace(/https?:\/\/[^\s]+/g, 'URL')
    .trim()
  
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16)
}

/**
 * Extract keywords from a task description
 */
export function extractTaskKeywords(taskDescription: string): string[] {
  const keywords: string[] = []
  const lower = taskDescription.toLowerCase()
  
  // Action keywords
  const actions = ['send', 'create', 'update', 'delete', 'search', 'find', 'check', 
    'monitor', 'report', 'analyze', 'schedule', 'remind', 'notify', 'export', 'import']
  for (const action of actions) {
    if (lower.includes(action)) keywords.push(action)
  }
  
  // Service keywords
  const services = ['email', 'gmail', 'outlook', 'linkedin', 'twitter', 'instagram',
    'notion', 'slack', 'discord', 'github', 'shopify', 'stripe', 'google', 'calendar',
    'spreadsheet', 'document', 'drive', 'trello', 'asana', 'jira']
  for (const service of services) {
    if (lower.includes(service)) keywords.push(service)
  }
  
  // Object keywords
  const objects = ['message', 'post', 'report', 'data', 'file', 'document', 'image',
    'video', 'meeting', 'event', 'task', 'project', 'invoice', 'order', 'customer']
  for (const obj of objects) {
    if (lower.includes(obj)) keywords.push(obj)
  }
  
  return [...new Set(keywords)]
}

/**
 * Detect task type from description
 */
export function detectTaskType(taskDescription: string): string {
  const lower = taskDescription.toLowerCase()
  
  if (lower.includes('email') && (lower.includes('send') || lower.includes('compose'))) {
    return 'email_send'
  }
  if (lower.includes('email') && (lower.includes('check') || lower.includes('read'))) {
    return 'email_read'
  }
  if (lower.includes('linkedin') && lower.includes('post')) {
    return 'social_post'
  }
  if (lower.includes('research') || lower.includes('find information')) {
    return 'web_research'
  }
  if (lower.includes('scrape') || lower.includes('extract data')) {
    return 'data_extraction'
  }
  if (lower.includes('fill') && lower.includes('form')) {
    return 'form_fill'
  }
  if (lower.includes('schedule') || lower.includes('calendar')) {
    return 'scheduling'
  }
  if (lower.includes('report') || lower.includes('summary')) {
    return 'report_generation'
  }
  if (lower.includes('monitor') || lower.includes('check status')) {
    return 'monitoring'
  }
  if (lower.includes('shopify') || lower.includes('order')) {
    return 'ecommerce'
  }
  
  return 'general_task'
}

/**
 * Find matching patterns for a task
 */
export async function findMatchingPatterns(
  userId: string,
  taskDescription: string
): Promise<TaskPattern[]> {
  const supabase = createAdminClient()
  const fingerprint = generateTaskFingerprint(taskDescription)
  const keywords = extractTaskKeywords(taskDescription)
  
  const { data, error } = await supabase.rpc('find_matching_pattern', {
    p_user_id: userId,
    p_task_fingerprint: fingerprint,
    p_task_keywords: keywords,
  } as never)
  
  if (error) {
    console.error('[TaskPatternLearning] Error finding patterns:', error)
    return []
  }
  
  return (data as unknown as TaskPattern[]) || []
}

/**
 * Create or update a task pattern
 */
export async function createOrUpdatePattern(
  userId: string,
  agentId: string,
  taskDescription: string,
  initialApproach?: Partial<OptimalApproach>
): Promise<string> {
  const supabase = createAdminClient()
  const fingerprint = generateTaskFingerprint(taskDescription)
  const keywords = extractTaskKeywords(taskDescription)
  const taskType = detectTaskType(taskDescription)
  
  // Check if pattern exists
  const { data: existing } = await supabase
    .from('task_execution_patterns')
    .select('id')
    .eq('user_id', userId)
    .eq('task_fingerprint', fingerprint)
    .single()
  
  if (existing) {
    return (existing as { id: string }).id
  }
  
  // Create new pattern
  const { data: newPattern, error } = await supabase
    .from('task_execution_patterns')
    .insert({
      user_id: userId,
      agent_id: agentId,
      task_fingerprint: fingerprint,
      task_type: taskType,
      task_keywords: keywords,
      optimal_approach: initialApproach || {},
    } as never)
    .select('id')
    .single()
  
  if (error) {
    console.error('[TaskPatternLearning] Error creating pattern:', error)
    return ''
  }
  
  return (newPattern as { id: string })?.id || ''
}

/**
 * Record an execution run for learning
 */
export async function recordExecutionRun(
  patternId: string,
  agentId: string,
  userId: string,
  taskDescription: string,
  steps: ExecutionStep[],
  status: 'completed' | 'failed',
  durationSeconds: number,
  tokensUsed: number
): Promise<void> {
  const supabase = createAdminClient()
  
  const successfulSteps = steps.filter(s => s.success).length
  const failedSteps = steps.filter(s => !s.success).length
  
  // Extract learnings from the run
  const learnings = await extractRunLearnings(steps, status)
  
  // Record the run
  await supabase.from('execution_run_history').insert({
    pattern_id: patternId,
    agent_id: agentId,
    user_id: userId,
    task_description: taskDescription,
    completed_at: new Date().toISOString(),
    status,
    steps_taken: steps,
    total_steps: steps.length,
    successful_steps: successfulSteps,
    failed_steps: failedSteps,
    what_worked: learnings.what_worked,
    what_failed: learnings.what_failed,
    improvements_identified: learnings.improvements_identified,
    new_knowledge: learnings.new_knowledge,
    duration_seconds: durationSeconds,
    tokens_used: tokensUsed,
  } as never)
  
  // Update the pattern with learnings
  if (patternId) {
    await supabase.rpc('update_pattern_after_execution', {
      p_pattern_id: patternId,
      p_success: status === 'completed',
      p_steps_taken: steps.length,
      p_duration_seconds: durationSeconds,
      p_what_worked: learnings.what_worked,
      p_what_failed: learnings.what_failed,
    } as never)
  }
}

/**
 * Extract learnings from execution steps using LLM
 */
async function extractRunLearnings(
  steps: ExecutionStep[],
  status: 'completed' | 'failed'
): Promise<RunLearnings> {
  // Quick extraction for simple cases
  if (steps.length < 3) {
    return {
      what_worked: steps.filter(s => s.success).map(s => `${s.tool} worked`),
      what_failed: steps.filter(s => !s.success).map(s => `${s.tool} failed: ${s.result.slice(0, 100)}`),
      improvements_identified: [],
      new_knowledge: [],
    }
  }
  
  const stepsText = steps.map((s, i) => 
    `${i + 1}. ${s.tool}(${JSON.stringify(s.input).slice(0, 50)}) → ${s.success ? '✓' : '✗'} ${s.result.slice(0, 100)}`
  ).join('\n')
  
  try {
    const { response } = await createNonStreamingMessageWithFallback({
      model: DEFAULT_MODEL,
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Analyze this task execution and extract learnings:

Status: ${status}
Steps:
${stepsText}

Extract:
1. WHAT_WORKED: (list successful patterns/approaches)
2. WHAT_FAILED: (list failures and why)
3. IMPROVEMENTS: (suggestions for next time)
4. NEW_KNOWLEDGE: (facts/patterns discovered)

Format as JSON: {"what_worked": [], "what_failed": [], "improvements": [], "new_knowledge": []}`
      }],
    })
    
    const text = extractTextFromResponse(response)
    
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        what_worked: parsed.what_worked || [],
        what_failed: parsed.what_failed || [],
        improvements_identified: parsed.improvements || [],
        new_knowledge: parsed.new_knowledge || [],
      }
    }
  } catch (error) {
    console.error('[TaskPatternLearning] Error extracting learnings:', error)
  }
  
  // Fallback
  return {
    what_worked: steps.filter(s => s.success).map(s => `${s.tool} completed successfully`),
    what_failed: steps.filter(s => !s.success).map(s => `${s.tool}: ${s.result.slice(0, 50)}`),
    improvements_identified: [],
    new_knowledge: [],
  }
}

/**
 * Get learned wisdom for a task
 */
export async function getLearnedWisdom(
  userId: string,
  taskDescription: string
): Promise<{
  hasLearnings: boolean
  confidence: number
  tips: string[]
  pitfalls: string[]
  recommendedApproach: string | null
  avgSteps: number | null
  avgDuration: number | null
}> {
  const patterns = await findMatchingPatterns(userId, taskDescription)
  
  if (patterns.length === 0) {
    return {
      hasLearnings: false,
      confidence: 0,
      tips: [],
      pitfalls: [],
      recommendedApproach: null,
      avgSteps: null,
      avgDuration: null,
    }
  }
  
  const bestPattern = patterns[0]
  
  // Deduplicate and limit tips/pitfalls
  const allTips = patterns.flatMap(p => p.success_tips || [])
  const allPitfalls = patterns.flatMap(p => p.common_pitfalls || [])
  const uniqueTips = [...new Set(allTips)].slice(0, 5)
  const uniquePitfalls = [...new Set(allPitfalls)].slice(0, 5)
  
  return {
    hasLearnings: true,
    confidence: bestPattern.confidence_score,
    tips: uniqueTips,
    pitfalls: uniquePitfalls,
    recommendedApproach: bestPattern.optimal_approach?.step_sequence?.join(' → ') || null,
    avgSteps: bestPattern.avg_steps_to_complete,
    avgDuration: bestPattern.avg_duration_seconds,
  }
}

/**
 * Format learned wisdom for agent prompt
 */
export function formatLearnedWisdomForPrompt(wisdom: Awaited<ReturnType<typeof getLearnedWisdom>>): string {
  if (!wisdom.hasLearnings) {
    return ''
  }
  
  let output = '\n## Learned from Previous Runs\n\n'
  output += `*Confidence: ${Math.round(wisdom.confidence * 100)}%*\n\n`
  
  if (wisdom.tips.length > 0) {
    output += '**What works:**\n'
    for (const tip of wisdom.tips) {
      output += `✓ ${tip}\n`
    }
    output += '\n'
  }
  
  if (wisdom.pitfalls.length > 0) {
    output += '**Watch out for:**\n'
    for (const pitfall of wisdom.pitfalls) {
      output += `⚠ ${pitfall}\n`
    }
    output += '\n'
  }
  
  if (wisdom.recommendedApproach) {
    output += `**Recommended approach:** ${wisdom.recommendedApproach}\n\n`
  }
  
  if (wisdom.avgSteps) {
    output += `*Typically takes ~${Math.round(wisdom.avgSteps)} steps`
    if (wisdom.avgDuration) {
      output += ` (~${Math.round(wisdom.avgDuration / 60)} min)`
    }
    output += '*\n'
  }
  
  return output
}

/**
 * Generate improvement suggestions based on execution history
 */
export async function generateImprovementSuggestions(
  userId: string,
  agentId: string,
  patternId: string
): Promise<void> {
  const supabase = createAdminClient()
  
  // Get recent runs for this pattern
  const { data: runs } = await supabase
    .from('execution_run_history')
    .select('*')
    .eq('pattern_id', patternId)
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (!runs || runs.length < 3) return // Need enough data
  
  const typedRuns = runs as Array<{
    status: string
    total_steps: number
    duration_seconds: number
    what_failed: string[]
    improvements_identified: string[]
  }>
  
  // Analyze patterns
  const successRate = typedRuns.filter(r => r.status === 'completed').length / typedRuns.length
  const avgSteps = typedRuns.reduce((sum, r) => sum + r.total_steps, 0) / typedRuns.length
  const avgDuration = typedRuns.reduce((sum, r) => sum + (r.duration_seconds || 0), 0) / typedRuns.length
  
  // Collect common failures
  const failureFrequency: Record<string, number> = {}
  for (const run of typedRuns) {
    for (const failure of run.what_failed || []) {
      failureFrequency[failure] = (failureFrequency[failure] || 0) + 1
    }
  }
  
  // Generate suggestions
  const suggestions: Array<{
    type: string
    title: string
    description: string
    impact: string
    evidence: object
  }> = []
  
  if (successRate < 0.7) {
    suggestions.push({
      type: 'reliability',
      title: 'Improve task success rate',
      description: `Current success rate is ${Math.round(successRate * 100)}%. Review common failure points.`,
      impact: 'high',
      evidence: { successRate, commonFailures: Object.entries(failureFrequency).slice(0, 3) },
    })
  }
  
  if (avgSteps > 15) {
    suggestions.push({
      type: 'efficiency',
      title: 'Reduce steps needed',
      description: `Averaging ${Math.round(avgSteps)} steps. Consider using batch actions or more direct approaches.`,
      impact: 'medium',
      evidence: { avgSteps },
    })
  }
  
  // Save suggestions
  for (const suggestion of suggestions) {
    await supabase.from('improvement_suggestions').insert({
      user_id: userId,
      agent_id: agentId,
      pattern_id: patternId,
      suggestion_type: suggestion.type,
      title: suggestion.title,
      description: suggestion.description,
      expected_impact: suggestion.impact,
      based_on_runs: typedRuns.length,
      evidence: suggestion.evidence,
    } as never)
  }
}
