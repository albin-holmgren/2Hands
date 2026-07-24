/**
 * Observability System
 * 
 * Tracks metrics for:
 * - Token/cost usage per operation
 * - Agent run success rates
 * - Outreach engagement
 * - System health
 */

import { createAdminClient } from '@/lib/supabase/server'
import { classifyBlockedReason } from '@/lib/confidence/failure-taxonomy'

export interface AgentRunMetrics {
  agentId: string
  userId: string
  runId: string
  status: 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled'
  iterationsUsed: number
  screenshotsTaken: number
  actionsPerformed: number
  errorsEncountered: number
  tokensUsed: number
  estimatedCostUsd: number
  successRating?: number
  failureReason?: string
  startedAt: Date
  completedAt?: Date
}

/**
 * Thin wrapper kept for backward compatibility.
 * New code should import classifyBlockedReason from @/lib/confidence/failure-taxonomy directly.
 */
export type RunFailureCategory =
  | 'auth'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'permission'
  | 'validation'
  | 'resource'
  | 'unknown'

/** @deprecated Use classifyBlockedReason from @/lib/confidence/failure-taxonomy */
export function classifyRunFailureReason(reason: string): RunFailureCategory {
  const canonical = classifyBlockedReason(reason)
  switch (canonical) {
    case 'auth_error':         return 'auth'
    case 'rate_limited':       return 'rate_limit'
    case 'timeout':            return 'timeout'
    case 'provider_error':     return 'network'
    case 'policy_blocked':     return 'permission'
    case 'validation_error':   return 'validation'
    case 'vm_unavailable':
    case 'credits_exhausted':  return 'resource'
    default:                   return 'unknown'
  }
}

export function formatFailureReasonForMetrics(reason?: string): string | undefined {
  if (!reason || !reason.trim()) return undefined
  const normalized = reason.trim().replace(/\s+/g, ' ').slice(0, 300)
  const category = classifyRunFailureReason(normalized)
  return `[${category}] ${normalized}`
}

export interface DailyMetrics {
  date: string
  totalAgentRuns: number
  successfulRuns: number
  failedRuns: number
  totalTokens: number
  totalCostUsd: number
  avgRunDurationMs: number
  outreachSent: number
  outreachEngaged: number
}

/**
 * Start tracking an agent run
 */
export async function startRunMetrics(
  agentId: string,
  userId: string,
  runId: string
): Promise<void> {
  const supabase = createAdminClient()
  
  await supabase
    .from('agent_run_metrics')
    .insert({
      agent_id: agentId,
      user_id: userId,
      run_id: runId,
      started_at: new Date().toISOString(),
      status: 'running',
      iterations_used: 0,
      screenshots_taken: 0,
      actions_performed: 0,
      errors_encountered: 0,
      tokens_used: 0,
      estimated_cost_usd: 0,
    } as never)
}

/**
 * Update run metrics during execution
 */
export async function updateRunMetrics(
  runId: string,
  updates: Partial<{
    iterationsUsed: number
    screenshotsTaken: number
    actionsPerformed: number
    errorsEncountered: number
    tokensUsed: number
    estimatedCostUsd: number
  }>
): Promise<void> {
  const supabase = createAdminClient()
  
  const dbUpdates: Record<string, number> = {}
  if (updates.iterationsUsed !== undefined) dbUpdates.iterations_used = updates.iterationsUsed
  if (updates.screenshotsTaken !== undefined) dbUpdates.screenshots_taken = updates.screenshotsTaken
  if (updates.actionsPerformed !== undefined) dbUpdates.actions_performed = updates.actionsPerformed
  if (updates.errorsEncountered !== undefined) dbUpdates.errors_encountered = updates.errorsEncountered
  if (updates.tokensUsed !== undefined) dbUpdates.tokens_used = updates.tokensUsed
  if (updates.estimatedCostUsd !== undefined) dbUpdates.estimated_cost_usd = updates.estimatedCostUsd
  
  await supabase
    .from('agent_run_metrics')
    .update(dbUpdates as never)
    .eq('run_id', runId)
}

/**
 * Complete run metrics
 */
export async function completeRunMetrics(
  runId: string,
  status: 'completed' | 'failed' | 'timeout' | 'cancelled',
  successRating?: number,
  failureReason?: string
): Promise<void> {
  const supabase = createAdminClient()
  const normalizedFailureReason = formatFailureReasonForMetrics(failureReason)
  
  await supabase
    .from('agent_run_metrics')
    .update({
      status,
      completed_at: new Date().toISOString(),
      success_rating: successRating,
      failure_reason: normalizedFailureReason,
    } as never)
    .eq('run_id', runId)
}

/**
 * Log AI usage with cost tracking
 */
export async function logAIUsage(
  userId: string,
  agentId: string | null,
  model: string,
  inputTokens: number,
  outputTokens: number,
  operationType: 'chat' | 'agent_run' | 'memory_curation' | 'reflection' | 'fact_extraction' | 'outreach_generation',
  metadata?: Record<string, unknown>
): Promise<void> {
  const supabase = createAdminClient()
  
  // Calculate cost based on model
  let costUsd: number
  switch (model) {
    case 'claude-3-5-haiku-20241022':
      costUsd = (inputTokens * 0.001 + outputTokens * 0.005) / 1000
      break
    case 'claude-3-5-sonnet-20241022':
    case 'claude-sonnet-4-20250514':
      costUsd = (inputTokens * 0.003 + outputTokens * 0.015) / 1000
      break
    case 'claude-opus-4-5':
      costUsd = (inputTokens * 0.015 + outputTokens * 0.075) / 1000
      break
    default:
      costUsd = (inputTokens * 0.003 + outputTokens * 0.015) / 1000
  }
  
  await supabase
    .from('ai_usage_logs')
    .insert({
      user_id: userId,
      agent_id: agentId,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: costUsd,
      operation_type: operationType,
      metadata: metadata || {},
      created_at: new Date().toISOString(),
    } as never)
}

/**
 * Get usage summary for a user
 */
export async function getUserUsageSummary(
  userId: string,
  days: number = 30
): Promise<{
  totalTokens: number
  totalCostUsd: number
  byOperation: Record<string, { tokens: number; cost: number }>
  byModel: Record<string, { tokens: number; cost: number }>
}> {
  const supabase = createAdminClient()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  
  const { data } = await supabase
    .from('ai_usage_logs')
    .select('model, operation_type, input_tokens, output_tokens, estimated_cost_usd')
    .eq('user_id', userId)
    .gt('created_at', since)
  
  if (!data) {
    return {
      totalTokens: 0,
      totalCostUsd: 0,
      byOperation: {},
      byModel: {},
    }
  }
  
  let totalTokens = 0
  let totalCostUsd = 0
  const byOperation: Record<string, { tokens: number; cost: number }> = {}
  const byModel: Record<string, { tokens: number; cost: number }> = {}
  
  for (const row of data as Array<{
    model: string
    operation_type: string
    input_tokens: number
    output_tokens: number
    estimated_cost_usd: number
  }>) {
    const tokens = row.input_tokens + row.output_tokens
    const cost = row.estimated_cost_usd
    
    totalTokens += tokens
    totalCostUsd += cost
    
    if (!byOperation[row.operation_type]) {
      byOperation[row.operation_type] = { tokens: 0, cost: 0 }
    }
    byOperation[row.operation_type].tokens += tokens
    byOperation[row.operation_type].cost += cost
    
    if (!byModel[row.model]) {
      byModel[row.model] = { tokens: 0, cost: 0 }
    }
    byModel[row.model].tokens += tokens
    byModel[row.model].cost += cost
  }
  
  return { totalTokens, totalCostUsd, byOperation, byModel }
}

/**
 * Get agent success metrics
 */
export async function getAgentSuccessMetrics(
  agentId: string,
  days: number = 30
): Promise<{
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  successRate: number
  avgDurationMs: number
  avgTokensPerRun: number
  avgCostPerRun: number
  commonFailures: string[]
}> {
  const supabase = createAdminClient()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  
  const { data } = await supabase
    .from('agent_run_metrics')
    .select('status, started_at, completed_at, tokens_used, estimated_cost_usd, failure_reason')
    .eq('agent_id', agentId)
    .gt('started_at', since)
  
  if (!data || data.length === 0) {
    return {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      successRate: 0,
      avgDurationMs: 0,
      avgTokensPerRun: 0,
      avgCostPerRun: 0,
      commonFailures: [],
    }
  }
  
  const runs = data as Array<{
    status: string
    started_at: string
    completed_at: string | null
    tokens_used: number
    estimated_cost_usd: number
    failure_reason: string | null
  }>
  
  const totalRuns = runs.length
  const successfulRuns = runs.filter(r => r.status === 'completed').length
  const failedRuns = runs.filter(r => r.status === 'failed').length
  
  let totalDuration = 0
  let durationCount = 0
  let totalTokens = 0
  let totalCost = 0
  const failureReasons: Record<string, number> = {}
  
  for (const run of runs) {
    if (run.completed_at && run.started_at) {
      totalDuration += new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
      durationCount++
    }
    totalTokens += run.tokens_used
    totalCost += run.estimated_cost_usd
    
    if (run.failure_reason) {
      failureReasons[run.failure_reason] = (failureReasons[run.failure_reason] || 0) + 1
    }
  }
  
  const commonFailures = Object.entries(failureReasons)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([reason]) => reason)
  
  return {
    totalRuns,
    successfulRuns,
    failedRuns,
    successRate: totalRuns > 0 ? successfulRuns / totalRuns : 0,
    avgDurationMs: durationCount > 0 ? totalDuration / durationCount : 0,
    avgTokensPerRun: totalRuns > 0 ? totalTokens / totalRuns : 0,
    avgCostPerRun: totalRuns > 0 ? totalCost / totalRuns : 0,
    commonFailures,
  }
}

/**
 * Get outreach engagement metrics
 */
export async function getOutreachMetrics(
  userId: string,
  days: number = 30
): Promise<{
  totalSent: number
  totalOpened: number
  totalResponded: number
  openRate: number
  responseRate: number
  byType: Record<string, { sent: number; opened: number; responded: number }>
}> {
  const supabase = createAdminClient()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  
  const { data } = await supabase
    .from('proactive_outreach')
    .select('type, sent_at, read_at')
    .eq('user_id', userId)
    .not('sent_at', 'is', null)
    .gt('sent_at', since)
  
  if (!data || data.length === 0) {
    return {
      totalSent: 0,
      totalOpened: 0,
      totalResponded: 0,
      openRate: 0,
      responseRate: 0,
      byType: {},
    }
  }
  
  const outreach = data as Array<{
    type: string
    sent_at: string
    read_at: string | null
  }>
  
  const totalSent = outreach.length
  const totalOpened = outreach.filter(o => o.read_at).length
  const byType: Record<string, { sent: number; opened: number; responded: number }> = {}
  
  for (const o of outreach) {
    if (!byType[o.type]) {
      byType[o.type] = { sent: 0, opened: 0, responded: 0 }
    }
    byType[o.type].sent++
    if (o.read_at) byType[o.type].opened++
  }
  
  return {
    totalSent,
    totalOpened,
    totalResponded: 0, // Would need to track responses separately
    openRate: totalSent > 0 ? totalOpened / totalSent : 0,
    responseRate: 0,
    byType,
  }
}

/**
 * Generate daily metrics summary
 */
export async function generateDailyMetrics(date: Date = new Date()): Promise<DailyMetrics> {
  const supabase = createAdminClient()
  
  const startOfDay = new Date(date)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(date)
  endOfDay.setHours(23, 59, 59, 999)
  
  // Agent runs
  const { data: runs } = await supabase
    .from('agent_run_metrics')
    .select('status, tokens_used, estimated_cost_usd, started_at, completed_at')
    .gte('started_at', startOfDay.toISOString())
    .lte('started_at', endOfDay.toISOString())
  
  const runData = (runs || []) as Array<{
    status: string
    tokens_used: number
    estimated_cost_usd: number
    started_at: string
    completed_at: string | null
  }>
  
  let totalDuration = 0
  let durationCount = 0
  
  for (const run of runData) {
    if (run.completed_at) {
      totalDuration += new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
      durationCount++
    }
  }
  
  // Outreach
  const { data: outreach } = await supabase
    .from('proactive_outreach')
    .select('id, read_at')
    .not('sent_at', 'is', null)
    .gte('sent_at', startOfDay.toISOString())
    .lte('sent_at', endOfDay.toISOString())
  
  const outreachData = (outreach || []) as Array<{ id: string; read_at: string | null }>
  
  return {
    date: startOfDay.toISOString().split('T')[0],
    totalAgentRuns: runData.length,
    successfulRuns: runData.filter(r => r.status === 'completed').length,
    failedRuns: runData.filter(r => r.status === 'failed').length,
    totalTokens: runData.reduce((sum, r) => sum + r.tokens_used, 0),
    totalCostUsd: runData.reduce((sum, r) => sum + r.estimated_cost_usd, 0),
    avgRunDurationMs: durationCount > 0 ? totalDuration / durationCount : 0,
    outreachSent: outreachData.length,
    outreachEngaged: outreachData.filter(o => o.read_at).length,
  }
}
