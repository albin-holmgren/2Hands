/**
 * Proactive Suggestion Engine
 * 
 * Analyzes user patterns and agent history to proactively suggest:
 * - New agents based on recurring tasks
 * - Schedule optimizations
 * - Automation opportunities
 * - Task improvements
 * 
 * Best UX: Suggestions appear naturally in AI Manager conversation,
 * not as intrusive popups. User can dismiss or accept with one click.
 */

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { createNonStreamingMessageWithFallback, DEFAULT_MODEL } from '@/lib/ai/ai-client'
import { extractResponseText } from '@/lib/ai/response-text'

export interface ProactiveSuggestion {
  id: string
  type: 'new_agent' | 'schedule_optimization' | 'automation' | 'improvement'
  title: string
  description: string
  confidence: number // 0-1
  actionPayload: Record<string, unknown>
  createdAt: string
  expiresAt: string
  dismissed: boolean
}

export interface UserPattern {
  pattern: string
  frequency: number
  lastOccurrence: string
  confidence: number
}

/**
 * Analyze user's agent history to detect patterns
 */
export async function analyzeUserPatterns(userId: string): Promise<UserPattern[]> {
  const supabase = await createClient()
  
  // Get agent run history
  const { data: agents } = await supabase
    .from('agents')
    .select('id, name, config, schedule_type, schedule_cron, last_run_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  
  // Get recent agent tasks from daily logs
  const { data: logs } = await supabase
    .from('agent_daily_logs')
    .select('content, log_date, agent_id')
    .in('agent_id', (agents || []).map(a => (a as { id: string }).id))
    .order('log_date', { ascending: false })
    .limit(100)
  
  // Get user's conversation messages to understand their requests
  const { data: conversations } = await supabase
    .from('conversations')
    .select('id')
    .eq('user_id', userId)
    .eq('title', 'AI Manager')
    .single()
  
  let recentRequests: string[] = []
  if (conversations) {
    const { data: messages } = await supabase
      .from('messages')
      .select('content, created_at')
      .eq('conversation_id', (conversations as { id: string }).id)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(50)
    
    recentRequests = ((messages || []) as { content: string }[]).map(m => m.content)
  }
  
  // Use AI to detect patterns
  const patternPrompt = `Analyze this user's AI agent usage patterns:

AGENTS CREATED:
${(agents || []).map(a => {
  const agent = a as { name: string; schedule_type: string | null; schedule_cron: string | null; last_run_at: string | null }
  return `- ${agent.name} (${agent.schedule_type || 'one-time'}, last run: ${agent.last_run_at || 'never'})`
}).join('\n')}

RECENT ACTIVITY LOGS:
${((logs || []) as { content: string }[]).slice(0, 20).map(l => l.content.slice(0, 100)).join('\n')}

RECENT USER REQUESTS:
${recentRequests.slice(0, 10).map(r => `- ${r.slice(0, 100)}`).join('\n')}

Identify recurring patterns that could be automated. Look for:
1. Tasks done at similar times (daily, weekly, monthly)
2. Similar types of requests repeated
3. Tasks that could be combined or optimized
4. Missing automations that would help

Respond with JSON array:
[
  {"pattern": "description", "frequency": "daily|weekly|monthly|occasional", "confidence": 0.0-1.0}
]`

  try {
    const { response } = await createNonStreamingMessageWithFallback({
      model: DEFAULT_MODEL,
      max_tokens: 512,
      messages: [{ role: 'user', content: patternPrompt }],
    })
    
    const responseText = extractResponseText(response)
    
    const jsonMatch = responseText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    
    const patterns = JSON.parse(jsonMatch[0]) as Array<{
      pattern: string
      frequency: string
      confidence: number
    }>
    
    return patterns.map(p => ({
      pattern: p.pattern,
      frequency: p.frequency === 'daily' ? 365 : p.frequency === 'weekly' ? 52 : p.frequency === 'monthly' ? 12 : 4,
      lastOccurrence: new Date().toISOString(),
      confidence: p.confidence,
    }))
    
  } catch (error) {
    console.error('[SuggestionEngine] Error analyzing patterns:', error)
    return []
  }
}

/**
 * Generate proactive suggestions based on patterns
 */
export async function generateSuggestions(userId: string): Promise<ProactiveSuggestion[]> {
  const patterns = await analyzeUserPatterns(userId)
  const suggestions: ProactiveSuggestion[] = []
  
  for (const pattern of patterns) {
    if (pattern.confidence < 0.6) continue // Only suggest high-confidence patterns
    
    const suggestion: ProactiveSuggestion = {
      id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: pattern.frequency >= 52 ? 'automation' : 'new_agent',
      title: generateSuggestionTitle(pattern),
      description: pattern.pattern,
      confidence: pattern.confidence,
      actionPayload: {
        suggestedSchedule: pattern.frequency >= 365 ? '0 9 * * *' : pattern.frequency >= 52 ? '0 9 * * 1' : '0 9 1 * *',
        patternDescription: pattern.pattern,
      },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      dismissed: false,
    }
    
    suggestions.push(suggestion)
  }
  
  return suggestions
}

function generateSuggestionTitle(pattern: UserPattern): string {
  if (pattern.frequency >= 365) {
    return 'Daily automation opportunity'
  } else if (pattern.frequency >= 52) {
    return 'Weekly task to automate'
  } else if (pattern.frequency >= 12) {
    return 'Monthly recurring task'
  }
  return 'Automation suggestion'
}

/**
 * Store suggestions for a user
 */
export async function storeSuggestions(
  userId: string, 
  suggestions: ProactiveSuggestion[]
): Promise<void> {
  const supabase = await createClient()
  
  for (const suggestion of suggestions) {
    await supabase
      .from('proactive_suggestions')
      .upsert({
        id: suggestion.id,
        user_id: userId,
        type: suggestion.type,
        title: suggestion.title,
        description: suggestion.description,
        confidence: suggestion.confidence,
        action_payload: suggestion.actionPayload,
        expires_at: suggestion.expiresAt,
        dismissed: false,
        created_at: suggestion.createdAt,
      } as never)
  }
}

/**
 * Get pending suggestions for a user
 */
export async function getPendingSuggestions(userId: string): Promise<ProactiveSuggestion[]> {
  const supabase = await createClient()
  
  interface SuggestionRow {
    id: string
    type: string
    title: string
    description: string
    confidence: number
    action_payload: Record<string, unknown>
    created_at: string
    expires_at: string
    dismissed: boolean
  }
  
  const { data, error } = await supabase
    .from('proactive_suggestions')
    .select('*')
    .eq('user_id', userId)
    .eq('dismissed', false)
    .gt('expires_at', new Date().toISOString())
    .order('confidence', { ascending: false })
    .limit(5)
  
  if (error) return []
  
  return ((data || []) as SuggestionRow[]).map(s => ({
    id: s.id,
    type: s.type as ProactiveSuggestion['type'],
    title: s.title,
    description: s.description,
    confidence: s.confidence,
    actionPayload: s.action_payload,
    createdAt: s.created_at,
    expiresAt: s.expires_at,
    dismissed: s.dismissed,
  }))
}

/**
 * Dismiss a suggestion
 */
export async function dismissSuggestion(suggestionId: string): Promise<void> {
  const supabase = await createClient()
  
  await supabase
    .from('proactive_suggestions')
    .update({ dismissed: true } as never)
    .eq('id', suggestionId)
}

/**
 * Format suggestions for AI Manager - ONLY if user asks about automation
 * 
 * Suggestions should NOT be pushed proactively. They should only appear:
 * 1. When user asks "what can you automate?" or similar
 * 2. When user is clearly in a planning/automation mindset
 * 
 * The AI should NEVER inject suggestions into casual conversation.
 */
export function formatSuggestionsForAIManager(suggestions: ProactiveSuggestion[]): string {
  // Return empty - suggestions are now opt-in only
  // User must ask for automation suggestions explicitly
  return ''
}

/**
 * Format suggestions when user explicitly asks for automation ideas
 */
export function formatSuggestionsOnRequest(suggestions: ProactiveSuggestion[]): string {
  if (suggestions.length === 0) return 'No automation suggestions at the moment.'
  
  const topSuggestion = suggestions[0]
  const schedule = topSuggestion.actionPayload.suggestedSchedule === '0 9 * * *' ? 'daily' :
    topSuggestion.actionPayload.suggestedSchedule === '0 9 * * 1' ? 'weekly' : 'monthly'
  
  return `Based on your usage, one idea: ${topSuggestion.description}. Could run ${schedule}. Want me to set it up?`
}

/**
 * Check if user should receive suggestions (rate limiting)
 * Suggestions are now opt-in only - this is used for generating, not showing
 * Max 1 generation per 3 days to save API calls
 */
export async function shouldGenerateSuggestion(userId: string): Promise<boolean> {
  const supabase = await createClient()
  
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  
  const { data } = await supabase
    .from('proactive_suggestions')
    .select('id')
    .eq('user_id', userId)
    .gt('created_at', threeDaysAgo)
    .limit(1)
  
  // Don't generate if we already have recent suggestions
  return !data || data.length === 0
}

/**
 * Main function: Generate suggestions (called in background, not shown proactively)
 * Suggestions are stored but only shown when user asks for automation ideas
 */
export async function runProactiveSuggestionEngine(userId: string): Promise<ProactiveSuggestion | null> {
  // Rate limit - only generate every 3 days
  const shouldGenerate = await shouldGenerateSuggestion(userId)
  if (!shouldGenerate) {
    return null
  }
  
  // Check for existing pending suggestions first
  const pending = await getPendingSuggestions(userId)
  if (pending.length > 0) {
    // Don't return - suggestions are opt-in only now
    return null
  }
  
  // Generate new suggestions (stored for when user asks)
  const suggestions = await generateSuggestions(userId)
  if (suggestions.length === 0) {
    return null
  }
  
  // Store suggestions but don't return them (opt-in only)
  await storeSuggestions(userId, suggestions)
  return null // Never push suggestions proactively
}
