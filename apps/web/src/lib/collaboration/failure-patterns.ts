/**
 * Failure Pattern Recognition
 * 
 * Analyzes failures across all agents to identify recurring issues,
 * auto-generate solutions, and prevent future failures.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createNonStreamingMessageWithFallback, DEFAULT_MODEL, extractTextFromResponse } from '@/lib/ai/ai-client'

export interface FailurePattern {
  id: string
  user_id: string
  pattern_signature: string
  error_type: string
  skill_category?: string
  description: string
  common_causes: string[]
  occurrence_count: number
  first_seen_at: string
  last_seen_at: string
  affected_agent_ids: string[]
  resolution_strategy?: string
  resolution_success_rate?: number
  auto_recoverable: boolean
}

export interface FailureAnalysis {
  errorType: string
  patternSignature: string
  description: string
  commonCauses: string[]
  suggestedResolution: string
  isAutoRecoverable: boolean
}

/**
 * Generate a unique signature for an error pattern
 */
function generatePatternSignature(
  errorType: string,
  errorMessage: string,
  skillCategory?: string
): string {
  // Normalize error message (remove specific values)
  const normalized = errorMessage
    .toLowerCase()
    .replace(/\d+/g, 'N') // Replace numbers
    .replace(/["'][^"']+["']/g, 'S') // Replace strings
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)

  return `${errorType}:${skillCategory || 'general'}:${Buffer.from(normalized).toString('base64').slice(0, 20)}`
}

/**
 * Analyze an error and detect/update patterns
 */
export async function analyzeFailure(
  userId: string,
  agentId: string,
  failure: {
    errorType: string
    errorMessage: string
    skillCategory?: string
    taskContext?: string
    stepsTaken?: string[]
  }
): Promise<FailurePattern | null> {
  const supabase = createAdminClient()

  const signature = generatePatternSignature(
    failure.errorType,
    failure.errorMessage,
    failure.skillCategory
  )

  // Check if pattern exists
  const { data: existing } = await supabase
    .from('failure_patterns')
    .select('*')
    .eq('user_id', userId)
    .eq('pattern_signature', signature)
    .single()

  if (existing) {
    // Update existing pattern
    const typed = existing as FailurePattern
    const affectedAgents = typed.affected_agent_ids.includes(agentId)
      ? typed.affected_agent_ids
      : [...typed.affected_agent_ids, agentId]

    await supabase
      .from('failure_patterns')
      .update({
        occurrence_count: typed.occurrence_count + 1,
        last_seen_at: new Date().toISOString(),
        affected_agent_ids: affectedAgents,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', typed.id)

    return { ...typed, occurrence_count: typed.occurrence_count + 1 }
  }

  // Analyze new failure pattern
  const analysis = await analyzeNewFailure(failure)

  // Create new pattern
  const { data: created, error } = await supabase
    .from('failure_patterns')
    .insert({
      user_id: userId,
      pattern_signature: signature,
      error_type: failure.errorType,
      skill_category: failure.skillCategory,
      description: analysis.description,
      common_causes: analysis.commonCauses,
      affected_agent_ids: [agentId],
      resolution_strategy: analysis.suggestedResolution,
      auto_recoverable: analysis.isAutoRecoverable,
    } as never)
    .select('*')
    .single()

  if (error) {
    console.error('[FailurePatterns] Create error:', error)
    return null
  }

  console.log('[FailurePatterns] New pattern detected:', analysis.description)
  return created as FailurePattern
}

/**
 * Analyze a new failure using LLM
 */
async function analyzeNewFailure(failure: {
  errorType: string
  errorMessage: string
  skillCategory?: string
  taskContext?: string
  stepsTaken?: string[]
}): Promise<FailureAnalysis> {
  const prompt = `Analyze this agent failure and identify the pattern.

ERROR TYPE: ${failure.errorType}
ERROR MESSAGE: ${failure.errorMessage}
SKILL: ${failure.skillCategory || 'general'}
${failure.taskContext ? `TASK CONTEXT: ${failure.taskContext}` : ''}
${failure.stepsTaken ? `STEPS TAKEN: ${failure.stepsTaken.join(' → ')}` : ''}

Analyze and provide:
1. A clear description of what went wrong
2. Common causes for this type of failure
3. A suggested resolution strategy
4. Whether this can be auto-recovered

Respond in JSON:
{
  "description": "Clear description of the failure pattern",
  "common_causes": ["cause 1", "cause 2"],
  "suggested_resolution": "Step-by-step resolution strategy",
  "is_auto_recoverable": true/false
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
        errorType: failure.errorType,
        patternSignature: '',
        description: parsed.description || 'Unknown failure',
        commonCauses: parsed.common_causes || [],
        suggestedResolution: parsed.suggested_resolution || 'Retry the operation',
        isAutoRecoverable: parsed.is_auto_recoverable ?? false,
      }
    }
  } catch (error) {
    console.error('[FailurePatterns] Analysis error:', error)
  }

  return {
    errorType: failure.errorType,
    patternSignature: '',
    description: `${failure.errorType}: ${failure.errorMessage.slice(0, 100)}`,
    commonCauses: ['Unknown'],
    suggestedResolution: 'Retry the operation or try a different approach',
    isAutoRecoverable: false,
  }
}

/**
 * Get known resolution for a failure
 */
export async function getKnownResolution(
  userId: string,
  errorType: string,
  errorMessage: string,
  skillCategory?: string
): Promise<{
  hasResolution: boolean
  resolution?: string
  successRate?: number
  isAutoRecoverable: boolean
}> {
  const supabase = createAdminClient()

  const signature = generatePatternSignature(errorType, errorMessage, skillCategory)

  const { data: pattern } = await supabase
    .from('failure_patterns')
    .select('resolution_strategy, resolution_success_rate, auto_recoverable')
    .eq('user_id', userId)
    .eq('pattern_signature', signature)
    .single()

  if (pattern) {
    const typed = pattern as {
      resolution_strategy: string | null
      resolution_success_rate: number | null
      auto_recoverable: boolean
    }
    return {
      hasResolution: !!typed.resolution_strategy,
      resolution: typed.resolution_strategy || undefined,
      successRate: typed.resolution_success_rate || undefined,
      isAutoRecoverable: typed.auto_recoverable,
    }
  }

  return {
    hasResolution: false,
    isAutoRecoverable: false,
  }
}

/**
 * Record resolution attempt result
 */
export async function recordResolutionResult(
  userId: string,
  patternSignature: string,
  success: boolean
): Promise<void> {
  const supabase = createAdminClient()

  const { data: pattern } = await supabase
    .from('failure_patterns')
    .select('occurrence_count, resolution_success_rate')
    .eq('user_id', userId)
    .eq('pattern_signature', patternSignature)
    .single()

  if (pattern) {
    const typed = pattern as { occurrence_count: number; resolution_success_rate: number | null }
    const currentRate = typed.resolution_success_rate || 0
    const attempts = typed.occurrence_count
    const newRate = (currentRate * (attempts - 1) + (success ? 1 : 0)) / attempts

    await supabase
      .from('failure_patterns')
      .update({
        resolution_success_rate: newRate,
        auto_recoverable: newRate > 0.7, // If >70% success rate, mark as auto-recoverable
        updated_at: new Date().toISOString(),
      } as never)
      .eq('user_id', userId)
      .eq('pattern_signature', patternSignature)
  }
}

/**
 * Get most common failures for a user
 */
export async function getMostCommonFailures(
  userId: string,
  limit: number = 10
): Promise<FailurePattern[]> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('failure_patterns')
    .select('*')
    .eq('user_id', userId)
    .order('occurrence_count', { ascending: false })
    .limit(limit)

  return (data || []) as FailurePattern[]
}

/**
 * Get agents needing attention due to repeated failures
 */
export async function getAgentsNeedingAttention(userId: string): Promise<{
  agentId: string
  failureCount: number
  mostCommonError: string
}[]> {
  const supabase = createAdminClient()

  const { data: patterns } = await supabase
    .from('failure_patterns')
    .select('affected_agent_ids, error_type, occurrence_count')
    .eq('user_id', userId)
    .gt('occurrence_count', 3)
    .order('last_seen_at', { ascending: false })
    .limit(20)

  if (!patterns) return []

  // Count failures per agent
  const agentFailures: Record<string, { count: number; errors: Record<string, number> }> = {}

  for (const pattern of patterns as Array<{
    affected_agent_ids: string[]
    error_type: string
    occurrence_count: number
  }>) {
    for (const agentId of pattern.affected_agent_ids) {
      if (!agentFailures[agentId]) {
        agentFailures[agentId] = { count: 0, errors: {} }
      }
      agentFailures[agentId].count += pattern.occurrence_count
      agentFailures[agentId].errors[pattern.error_type] = 
        (agentFailures[agentId].errors[pattern.error_type] || 0) + pattern.occurrence_count
    }
  }

  // Get agents with >5 failures
  return Object.entries(agentFailures)
    .filter(([, data]) => data.count > 5)
    .map(([agentId, data]) => {
      const mostCommonError = Object.entries(data.errors)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown'
      return {
        agentId,
        failureCount: data.count,
        mostCommonError,
      }
    })
    .sort((a, b) => b.failureCount - a.failureCount)
}

/**
 * Format failure patterns for agent prompt
 */
export function formatFailurePatternsForPrompt(patterns: FailurePattern[]): string {
  if (patterns.length === 0) return ''

  let output = '\n## Known Failure Patterns\n\n'
  output += '_These are common issues - use the resolutions if you encounter them._\n\n'

  for (const pattern of patterns.slice(0, 5)) {
    output += `**${pattern.error_type}**: ${pattern.description}\n`
    if (pattern.resolution_strategy) {
      const successRate = pattern.resolution_success_rate 
        ? ` (${Math.round(pattern.resolution_success_rate * 100)}% success rate)`
        : ''
      output += `→ Resolution${successRate}: ${pattern.resolution_strategy}\n`
    }
    output += '\n'
  }

  return output
}

/**
 * Generate failure report for AI Manager
 */
export async function generateFailureReport(userId: string): Promise<string> {
  const patterns = await getMostCommonFailures(userId, 5)
  const agentsNeedingAttention = await getAgentsNeedingAttention(userId)

  if (patterns.length === 0) {
    return 'No significant failure patterns detected. All agents are performing well.'
  }

  let report = '## Failure Analysis Report\n\n'

  report += '### Top Failure Patterns\n'
  for (const pattern of patterns) {
    report += `- **${pattern.error_type}** (${pattern.occurrence_count}x): ${pattern.description}\n`
  }

  if (agentsNeedingAttention.length > 0) {
    report += '\n### Agents Needing Attention\n'
    for (const agent of agentsNeedingAttention) {
      report += `- Agent ${agent.agentId.slice(0, 8)}: ${agent.failureCount} failures (mostly: ${agent.mostCommonError})\n`
    }
  }

  return report
}
