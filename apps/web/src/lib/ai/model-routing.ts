/**
 * Model Routing System
 *
 * Routes requests to the best model based on task type, complexity,
 * capability needs, and profitability. Uses the central model registry
 * as the single source of truth for available models.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'
import { createNonStreamingMessageWithFallback, DEFAULT_MODEL, DEFAULT_FALLBACK_MODELS } from '@/lib/ai/ai-client'
import {
  getModel,
  getDefaultModel,
  getFallbackChain,
  listModelsForSurface,
  supportsNativeReasoning,
  getModelForPhase,
  isShortBurstOnly,
  type ModelEntry,
  type ModelPhase,
  type RoutingSurface,
} from './model-registry'
import { getProviderCostCents } from './pricing-engine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskType =
  | 'chat'             // General conversation
  | 'coding'           // Code generation / debugging
  | 'research'         // Web search, citations, broad research
  | 'planning'         // Strategic / multi-step planning
  | 'summarization'    // Condensing content
  | 'classification'   // Simple categorization / routing
  | 'evaluation'       // Judging quality
  | 'internal'         // Background helpers

export interface RoutingDecision {
  model: string
  fallbackChain: string[]
  taskType: TaskType
  complexity_score: number
  complexity_level: 'simple' | 'moderate' | 'complex'
  complexity_factors: Record<string, number>
  routing_reason: string
  supportsNativeReasoning: boolean
  estimatedCredits: number
  /** Execution phase used for selection (if phase-aware routing was used) */
  phase?: ModelPhase
  /** Whether the selected model is restricted to short-burst use */
  shortBurstOnly?: boolean
}

export type { ModelPhase }

interface RoutingLog {
  user_id?: string
  agent_id?: string
  task_summary: string
  task_type?: string
  complexity_score: number
  complexity_factors: Record<string, number>
  selected_model: string
  routing_reason: string
  actual_tokens?: number
  actual_cost_cents?: number
  task_success?: boolean
}

// ---------------------------------------------------------------------------
// Task type detection
// ---------------------------------------------------------------------------

const TASK_TYPE_PATTERNS: Array<{ type: TaskType; patterns: RegExp[]; keywords: string[] }> = [
  {
    type: 'research',
    patterns: [/search.*for/i, /find.*information/i, /look.*up/i, /research/i, /what.*latest/i, /current.*state/i],
    keywords: ['search', 'research', 'find', 'look up', 'investigate', 'google', 'latest', 'news', 'trends'],
  },
  {
    type: 'coding',
    patterns: [/write.*code/i, /fix.*bug/i, /implement/i, /refactor/i, /debug/i, /function.*that/i, /class.*for/i],
    keywords: ['code', 'coding', 'programming', 'debug', 'refactor', 'implement', 'function', 'API', 'endpoint', 'typescript', 'python', 'javascript'],
  },
  {
    type: 'planning',
    patterns: [/create.*plan/i, /strategy.*for/i, /how.*should.*approach/i, /design.*system/i, /architect/i],
    keywords: ['plan', 'strategy', 'roadmap', 'architecture', 'design', 'framework', 'approach', 'pros and cons', 'trade-off'],
  },
  {
    type: 'summarization',
    patterns: [/summarize/i, /tldr/i, /brief.*overview/i, /condense/i, /key.*points/i],
    keywords: ['summarize', 'summary', 'tldr', 'condense', 'overview', 'brief', 'key points'],
  },
  {
    type: 'classification',
    patterns: [/classify/i, /categorize/i, /which.*type/i, /yes.*or.*no/i],
    keywords: ['classify', 'categorize', 'sort', 'label', 'tag', 'type'],
  },
]

function detectTaskType(task: string): TaskType {
  const lower = task.toLowerCase()
  for (const { type, patterns, keywords } of TASK_TYPE_PATTERNS) {
    if (patterns.some(p => p.test(task))) return type
    if (keywords.some(kw => lower.includes(kw))) return type
  }
  return 'chat'
}

// ---------------------------------------------------------------------------
// Complexity heuristic (kept from original, simplified)
// ---------------------------------------------------------------------------

const COMPLEXITY_HIGH_KW = [
  'analyze', 'synthesize', 'compare', 'evaluate', 'design', 'architect',
  'strategize', 'optimize', 'debug', 'complex', 'multi-step', 'reasoning',
  'creative', 'novel', 'ambiguous', 'trade-off', 'nuanced',
]
const COMPLEXITY_LOW_KW = [
  'simple', 'quick', 'brief', 'summarize', 'extract', 'list', 'format',
  'convert', 'translate', 'classify', 'yes/no', 'true/false', 'basic',
]

function estimateComplexity(task: string): { score: number; level: 'simple' | 'moderate' | 'complex'; factors: Record<string, number> } {
  const lower = task.toLowerCase()
  const words = lower.split(/\s+/)
  const factors: Record<string, number> = { length: 0, high_kw: 0, low_kw: 0, questions: 0 }

  factors.length = Math.min(1, words.length / 100)
  factors.high_kw = Math.min(1, COMPLEXITY_HIGH_KW.filter(kw => lower.includes(kw)).length / 5)
  factors.low_kw = Math.min(1, COMPLEXITY_LOW_KW.filter(kw => lower.includes(kw)).length / 5)
  factors.questions = Math.min(1, ((task.match(/\?/g) || []).length + (lower.match(/\band\b/g) || []).length) / 5)

  const score = Math.max(0, Math.min(1,
    0.3 + factors.length * 0.1 + factors.high_kw * 0.25 + factors.questions * 0.15 - factors.low_kw * 0.2
  ))

  const level = score < 0.3 ? 'simple' : score < 0.7 ? 'moderate' : 'complex'
  return { score, level, factors }
}

// ---------------------------------------------------------------------------
// Model selection logic
// ---------------------------------------------------------------------------

function selectModel(
  taskType: TaskType,
  complexityLevel: 'simple' | 'moderate' | 'complex',
  surface: RoutingSurface,
  needsTools: boolean,
): ModelEntry {
  const candidates = listModelsForSurface(surface).filter(m => !needsTools || m.supportsTools)
  if (candidates.length === 0) return getDefaultModel()

  // ── CREDIT-CONSERVATIVE ROUTING ──────────────────────────────────────
  // Gemini Flash is the workhorse for the vast majority of tasks.
  // Premium models are used ONLY when the quality difference truly justifies
  // the higher credit burn. Users should get far with their credits.

  // Research: use cheap search model ONLY for explicit search queries
  // (Perplexity Sonar is cheap so this is fine)
  if (taskType === 'research') {
    const searchModel = candidates.find(m => m.purposes.includes('search'))
    if (searchModel) return searchModel
  }

  // Coding: upgrade to premium ONLY for truly complex code tasks
  // Moderate coding stays on the default workhorse — it's strong enough
  if (taskType === 'coding' && complexityLevel === 'complex') {
    const coder = candidates.find(m => m.purposes.includes('coding') && m.purposes.includes('deep_reasoning'))
    if (coder) return coder
  }

  // Planning: upgrade ONLY for complex strategic planning, not moderate
  if (taskType === 'planning' && complexityLevel === 'complex') {
    const planner = candidates.find(m => m.purposes.includes('deep_reasoning'))
    if (planner) return planner
  }

  // General complex: default workhorse handles most complex tasks fine.
  // Only escalate if it's ALSO a task type that specifically benefits from premium.
  // (This block intentionally does NOT auto-upgrade generic complex chat.)

  // Default: Gemini Flash for everything else — cheap and capable
  const defaultModel = candidates.find(m => m.purposes.includes('default') && m.purposes.includes('reasoning'))
  return defaultModel || candidates.find(m => m.purposes.includes('default')) || getDefaultModel()
}

/**
 * Route a task to the appropriate model.
 *
 * This is the main entry point. It detects task type and complexity,
 * selects the best model from the registry, and logs the decision.
 */
export async function routeToModel(
  task: string,
  options?: {
    userId?: string
    agentId?: string
    surface?: RoutingSurface
    needsTools?: boolean
    forceModel?: string
    /** @deprecated — LLM estimate removed for cost; kept for API compat */
    useLLMEstimate?: boolean
  }
): Promise<RoutingDecision> {
  const surface = options?.surface || 'chat'
  const needsTools = options?.needsTools ?? true

  // Allow forcing a specific model
  if (options?.forceModel) {
    const entry = getModel(options.forceModel)
    return {
      model: options.forceModel,
      fallbackChain: entry ? getFallbackChain(options.forceModel) : [],
      taskType: 'chat',
      complexity_score: 0.5,
      complexity_level: 'moderate',
      complexity_factors: { forced: 1 },
      routing_reason: `Model forced to ${options.forceModel}`,
      supportsNativeReasoning: entry ? entry.reasoning === 'native' : false,
      estimatedCredits: 5,
    }
  }

  const taskType = detectTaskType(task)
  const { score, level, factors } = estimateComplexity(task)
  const selected = selectModel(taskType, level, surface, needsTools)
  const fallbackChain = getFallbackChain(selected.id)

  const reason = `[${taskType}/${level}] → ${selected.label} (${selected.id})`

  // Non-blocking log
  logRoutingDecision({
    user_id: options?.userId,
    agent_id: options?.agentId,
    task_summary: task.substring(0, 200),
    task_type: taskType,
    complexity_score: score,
    complexity_factors: factors,
    selected_model: selected.id,
    routing_reason: reason,
  }).catch(() => {})

  return {
    model: selected.id,
    fallbackChain,
    taskType,
    complexity_score: score,
    complexity_level: level,
    complexity_factors: factors,
    routing_reason: reason,
    supportsNativeReasoning: selected.reasoning === 'native',
    estimatedCredits: selected.margin.floor,
  }
}

/**
 * Log routing decision for analytics
 */
async function logRoutingDecision(log: RoutingLog): Promise<void> {
  const supabase = createAdminClient()
  
  await supabase
    .from('model_routing_log')
    .insert({
      user_id: log.user_id || null,
      agent_id: log.agent_id || null,
      task_summary: log.task_summary,
      complexity_score: log.complexity_score,
      complexity_factors: log.complexity_factors,
      selected_model: log.selected_model,
      routing_reason: log.routing_reason,
    } as never)
}

/**
 * Update routing log with actual results
 */
export async function updateRoutingResult(
  taskSummary: string,
  results: {
    actual_tokens: number
    actual_cost_cents: number
    task_success: boolean
  }
): Promise<void> {
  const supabase = createAdminClient()
  
  // Find the most recent log entry for this task
  const { data } = await supabase
    .from('model_routing_log')
    .select('id')
    .eq('task_summary', taskSummary)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  
  if (data) {
    await supabase
      .from('model_routing_log')
      .update({
        actual_tokens: results.actual_tokens,
        actual_cost_cents: results.actual_cost_cents,
        task_success: results.task_success,
      } as never)
      .eq('id', (data as { id: string }).id)
  }
}

/**
 * Get routing statistics for optimization
 */
export async function getRoutingStats(
  options?: {
    userId?: string
    days?: number
  }
): Promise<{
  total_requests: number
  by_model: Record<string, { count: number; avg_tokens: number; total_cost: number; success_rate: number }>
  by_complexity: Record<string, { count: number; avg_score: number }>
  potential_savings: number
}> {
  const supabase = createAdminClient()
  const days = options?.days || 30
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  
  let query = supabase
    .from('model_routing_log')
    .select('*')
    .gte('created_at', since.toISOString())
  
  if (options?.userId) {
    query = query.eq('user_id', options.userId)
  }
  
  const { data } = await query
  const logs = (data || []) as unknown as Array<{
    selected_model: string
    complexity_score: number
    actual_tokens: number | null
    actual_cost_cents: number | null
    task_success: boolean | null
  }>
  
  // Aggregate by model
  const byModel: Record<string, { count: number; tokens: number[]; costs: number[]; successes: number }> = {}
  
  // Aggregate by complexity level
  const byComplexity: Record<string, { count: number; scores: number[] }> = {
    simple: { count: 0, scores: [] },
    moderate: { count: 0, scores: [] },
    complex: { count: 0, scores: [] },
  }
  
  for (const log of logs) {
    // By model
    if (!byModel[log.selected_model]) {
      byModel[log.selected_model] = { count: 0, tokens: [], costs: [], successes: 0 }
    }
    byModel[log.selected_model].count++
    if (log.actual_tokens) byModel[log.selected_model].tokens.push(log.actual_tokens)
    if (log.actual_cost_cents) byModel[log.selected_model].costs.push(log.actual_cost_cents)
    if (log.task_success) byModel[log.selected_model].successes++
    
    // By complexity
    const level = log.complexity_score < 0.3 ? 'simple' 
      : log.complexity_score < 0.7 ? 'moderate' 
      : 'complex'
    byComplexity[level].count++
    byComplexity[level].scores.push(log.complexity_score)
  }
  
  // Calculate stats
  const modelStats: Record<string, { count: number; avg_tokens: number; total_cost: number; success_rate: number }> = {}
  let totalActualCost = 0
  let totalHaikuCost = 0
  
  for (const [model, stats] of Object.entries(byModel)) {
    const avgTokens = stats.tokens.length > 0 
      ? stats.tokens.reduce((a, b) => a + b, 0) / stats.tokens.length 
      : 0
    const totalCost = stats.costs.reduce((a, b) => a + b, 0)
    
    modelStats[model] = {
      count: stats.count,
      avg_tokens: avgTokens,
      total_cost: totalCost,
      success_rate: stats.count > 0 ? stats.successes / stats.count : 0,
    }
    
    totalActualCost += totalCost
    
    // Calculate what it would cost if all used the default model
    const defaultEntry = getDefaultModel()
    const estimatedDefaultCost = stats.tokens.reduce((sum, tokens) => {
      return sum + (tokens * 0.6 * defaultEntry.pricing.inputPer1M + tokens * 0.4 * defaultEntry.pricing.outputPer1M) / 1000000 * 100
    }, 0)
    totalHaikuCost += estimatedDefaultCost
  }
  
  const complexityStats: Record<string, { count: number; avg_score: number }> = {}
  for (const [level, stats] of Object.entries(byComplexity)) {
    complexityStats[level] = {
      count: stats.count,
      avg_score: stats.scores.length > 0 
        ? stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length 
        : 0,
    }
  }
  
  return {
    total_requests: logs.length,
    by_model: modelStats,
    by_complexity: complexityStats,
    potential_savings: totalActualCost - totalHaikuCost, // Negative means routing saved money
  }
}

/**
 * Wrapper for making routed API calls
 */
export async function callWithRouting(
  task: string,
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  options?: {
    userId?: string
    agentId?: string
    maxTokens?: number
    tools?: Anthropic.Tool[]
  }
): Promise<{
  response: Anthropic.Message
  routing: RoutingDecision
}> {
  const routing = await routeToModel(task, {
    userId: options?.userId,
    agentId: options?.agentId,
  })

  const { response } = await createNonStreamingMessageWithFallback({
    model: routing.model,
    max_tokens: options?.maxTokens || 4096,
    system: systemPrompt,
    messages,
    tools: options?.tools,
  })
  
  // Update routing log with actual usage
  const actualTokens = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
  const actualCostCents = getProviderCostCents(
    routing.model,
    response.usage?.input_tokens || 0,
    response.usage?.output_tokens || 0,
  )
  
  await updateRoutingResult(task.substring(0, 200), {
    actual_tokens: actualTokens,
    actual_cost_cents: actualCostCents,
    task_success: response.stop_reason === 'end_turn',
  })
  
  return { response, routing }
}

// ---------------------------------------------------------------------------
// Phase-aware routing (planner / executor / verifier architecture)
// ---------------------------------------------------------------------------

/**
 * Route by execution phase instead of task type.
 *
 * This is the scalable planner/executor/verifier entry point.
 * - Planning/judging phases get premium models (short-burst only for GPT-5.4)
 * - Execution phases get the default workhorse (Gemini Flash)
 * - Verification phases get cheap models by default, premium on escalation
 * - Research phases get Perplexity
 */
export function routeByPhase(
  phase: ModelPhase,
  surface: RoutingSurface,
  options?: {
    needsTools?: boolean
    /** Force cheap model even for planning phases (e.g. mature playbook) */
    preferCheap?: boolean
  }
): RoutingDecision {
  const selected = getModelForPhase(phase, surface, {
    needsTools: options?.needsTools,
    preferCheap: options?.preferCheap,
  })

  const fallbackChain = getFallbackChain(selected.id)
  const reason = `[phase:${phase}] → ${selected.label} (${selected.id})${selected.shortBurstOnly ? ' [short-burst]' : ''}`

  return {
    model: selected.id,
    fallbackChain,
    taskType: phase === 'research' ? 'research' : phase === 'plan' || phase === 'replan' ? 'planning' : 'chat',
    complexity_score: 0.5,
    complexity_level: 'moderate',
    complexity_factors: { phase_routed: 1 },
    routing_reason: reason,
    supportsNativeReasoning: selected.reasoning === 'native',
    estimatedCredits: selected.margin.floor,
    phase,
    shortBurstOnly: selected.shortBurstOnly,
  }
}
