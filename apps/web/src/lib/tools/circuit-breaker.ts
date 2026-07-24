/**
 * Tool Circuit Breaker System
 * 
 * Prevents runaway tool loops, validates tool calls, and provides
 * graceful degradation when tools fail repeatedly.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import crypto from 'crypto'

// Types
interface ToolCallRecord {
  id: string
  agent_id: string | null
  user_id: string
  conversation_id: string | null
  tool_name: string
  tool_args: Record<string, unknown>
  tool_args_hash: string
  result_status: 'success' | 'error' | 'timeout' | 'blocked'
  result_summary: string | null
  is_duplicate: boolean
  loop_detected: boolean
  blocked_reason: string | null
  execution_ms: number
  created_at: string
}

interface CircuitBreakerState {
  id: string
  agent_id: string | null
  user_id: string
  tool_name: string
  state: 'closed' | 'open' | 'half_open'
  failure_count: number
  success_count: number
  last_failure_at: string | null
  last_success_at: string | null
  opened_at: string | null
  opens_at_failures: number
  reset_after_seconds: number
}

interface ToolValidationResult {
  valid: boolean
  blocked: boolean
  reason?: string
  circuit_state?: 'closed' | 'open' | 'half_open'
  is_duplicate?: boolean
  loop_detected?: boolean
}

// High-risk tools that need extra scrutiny
const HIGH_RISK_TOOLS = [
  'delete_agent',
  'send_email',
  'post_social',
  'make_payment',
  'delete_file',
  'execute_code',
]

// Tool call patterns that indicate loops
const LOOP_PATTERNS = {
  max_identical_calls: 3, // same tool+args in window
  max_tool_calls_per_minute: 20,
  window_seconds: 60,
}

/**
 * Validate a tool call before execution
 */
export async function validateToolCall(
  userId: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
  options?: {
    agentId?: string
    conversationId?: string
  }
): Promise<ToolValidationResult> {
  const supabase = createAdminClient()
  
  // Check circuit breaker state
  const circuitState = await getCircuitState(userId, toolName, options?.agentId)
  
  if (circuitState.state === 'open') {
    // Check if we should try half-open
    const openedAt = circuitState.opened_at ? new Date(circuitState.opened_at) : new Date()
    const resetTime = new Date(openedAt.getTime() + circuitState.reset_after_seconds * 1000)
    
    if (new Date() < resetTime) {
      return {
        valid: false,
        blocked: true,
        reason: `Circuit breaker open for ${toolName}. Too many failures. Will retry after ${resetTime.toISOString()}`,
        circuit_state: 'open',
      }
    }
    
    // Transition to half-open
    await updateCircuitState(circuitState.id, { state: 'half_open' })
    circuitState.state = 'half_open'
  }
  
  // Generate hash for duplicate detection
  const argsHash = hashToolArgs(toolName, toolArgs)
  
  // Check for duplicate/loop patterns
  const recentCalls = await getRecentToolCalls(userId, toolName, options?.agentId)
  
  // Check for identical calls (loop detection)
  const identicalCalls = recentCalls.filter(c => c.tool_args_hash === argsHash)
  const isDuplicate = identicalCalls.length > 0
  const loopDetected = identicalCalls.length >= LOOP_PATTERNS.max_identical_calls
  
  if (loopDetected) {
    return {
      valid: false,
      blocked: true,
      reason: `Loop detected: ${toolName} called ${identicalCalls.length + 1} times with identical arguments`,
      circuit_state: circuitState.state,
      is_duplicate: true,
      loop_detected: true,
    }
  }
  
  // Check for rate limiting
  if (recentCalls.length >= LOOP_PATTERNS.max_tool_calls_per_minute) {
    return {
      valid: false,
      blocked: true,
      reason: `Rate limit exceeded: ${toolName} called ${recentCalls.length} times in last minute`,
      circuit_state: circuitState.state,
    }
  }
  
  // Extra validation for high-risk tools
  if (HIGH_RISK_TOOLS.includes(toolName)) {
    const validation = validateHighRiskTool(toolName, toolArgs)
    if (!validation.valid) {
      return validation
    }
  }
  
  return {
    valid: true,
    blocked: false,
    circuit_state: circuitState.state,
    is_duplicate: isDuplicate,
    loop_detected: false,
  }
}

/**
 * Record a tool call result and update circuit breaker
 */
export async function recordToolCall(
  userId: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
  result: {
    status: 'success' | 'error' | 'timeout' | 'blocked'
    summary?: string
    executionMs: number
  },
  options?: {
    agentId?: string
    conversationId?: string
    isDuplicate?: boolean
    loopDetected?: boolean
    blockedReason?: string
  }
): Promise<void> {
  const supabase = createAdminClient()
  
  const argsHash = hashToolArgs(toolName, toolArgs)
  
  // Log the tool call
  await supabase
    .from('tool_call_log')
    .insert({
      user_id: userId,
      agent_id: options?.agentId || null,
      conversation_id: options?.conversationId || null,
      tool_name: toolName,
      tool_args: toolArgs,
      tool_args_hash: argsHash,
      result_status: result.status,
      result_summary: result.summary || null,
      is_duplicate: options?.isDuplicate || false,
      loop_detected: options?.loopDetected || false,
      blocked_reason: options?.blockedReason || null,
      execution_ms: result.executionMs,
    } as never)
  
  // Update circuit breaker state
  const circuitState = await getCircuitState(userId, toolName, options?.agentId)
  
  if (result.status === 'success') {
    // Success - reset or close circuit
    if (circuitState.state === 'half_open') {
      await updateCircuitState(circuitState.id, {
        state: 'closed',
        failure_count: 0,
        success_count: circuitState.success_count + 1,
        last_success_at: new Date().toISOString(),
      })
    } else {
      await updateCircuitState(circuitState.id, {
        success_count: circuitState.success_count + 1,
        last_success_at: new Date().toISOString(),
        // Decay failure count on success
        failure_count: Math.max(0, circuitState.failure_count - 1),
      })
    }
  } else if (result.status === 'error' || result.status === 'timeout') {
    // Failure - increment count, possibly open circuit
    const newFailureCount = circuitState.failure_count + 1
    
    if (newFailureCount >= circuitState.opens_at_failures) {
      await updateCircuitState(circuitState.id, {
        state: 'open',
        failure_count: newFailureCount,
        last_failure_at: new Date().toISOString(),
        opened_at: new Date().toISOString(),
      })
    } else {
      await updateCircuitState(circuitState.id, {
        failure_count: newFailureCount,
        last_failure_at: new Date().toISOString(),
      })
    }
  }
}

/**
 * Get circuit breaker state for a tool
 */
async function getCircuitState(
  userId: string,
  toolName: string,
  agentId?: string
): Promise<CircuitBreakerState> {
  const supabase = createAdminClient()
  
  const { data } = await supabase
    .from('tool_circuit_breaker')
    .select('*')
    .eq('user_id', userId)
    .eq('tool_name', toolName)
    .eq('agent_id', (agentId || '') as string)
    .maybeSingle()
  
  if (data) {
    return data as unknown as CircuitBreakerState
  }
  
  // Create default state
  const { data: newState } = await supabase
    .from('tool_circuit_breaker')
    .insert({
      user_id: userId,
      agent_id: agentId || null,
      tool_name: toolName,
      state: 'closed',
      failure_count: 0,
      success_count: 0,
      opens_at_failures: HIGH_RISK_TOOLS.includes(toolName) ? 3 : 5,
      reset_after_seconds: HIGH_RISK_TOOLS.includes(toolName) ? 120 : 60,
    } as never)
    .select('*')
    .single()
  
  return (newState as unknown as CircuitBreakerState) || {
    id: '',
    user_id: userId,
    agent_id: agentId || null,
    tool_name: toolName,
    state: 'closed',
    failure_count: 0,
    success_count: 0,
    last_failure_at: null,
    last_success_at: null,
    opened_at: null,
    opens_at_failures: 5,
    reset_after_seconds: 60,
  }
}

/**
 * Update circuit breaker state
 */
async function updateCircuitState(
  stateId: string,
  updates: Partial<CircuitBreakerState>
): Promise<void> {
  if (!stateId) return
  
  const supabase = createAdminClient()
  
  await supabase
    .from('tool_circuit_breaker')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', stateId)
}

/**
 * Get recent tool calls for pattern analysis
 */
async function getRecentToolCalls(
  userId: string,
  toolName: string,
  agentId?: string
): Promise<ToolCallRecord[]> {
  const supabase = createAdminClient()
  
  const windowStart = new Date(Date.now() - LOOP_PATTERNS.window_seconds * 1000)
  
  let query = supabase
    .from('tool_call_log')
    .select('*')
    .eq('user_id', userId)
    .eq('tool_name', toolName)
    .gte('created_at', windowStart.toISOString())
    .order('created_at', { ascending: false })
  
  if (agentId) {
    query = query.eq('agent_id', agentId)
  }
  
  const { data } = await query
  return (data || []) as unknown as ToolCallRecord[]
}

/**
 * Hash tool arguments for duplicate detection
 */
function hashToolArgs(toolName: string, args: Record<string, unknown>): string {
  const normalized = JSON.stringify({ tool: toolName, args }, Object.keys(args).sort())
  return crypto.createHash('md5').update(normalized).digest('hex')
}

/**
 * Extra validation for high-risk tools
 */
function validateHighRiskTool(
  toolName: string,
  args: Record<string, unknown>
): ToolValidationResult {
  switch (toolName) {
    case 'delete_agent':
      if (!args.agent_id) {
        return { valid: false, blocked: true, reason: 'delete_agent requires agent_id' }
      }
      break
      
    case 'send_email':
      if (!args.to || !args.subject) {
        return { valid: false, blocked: true, reason: 'send_email requires to and subject' }
      }
      // Check for mass email
      const recipients = Array.isArray(args.to) ? args.to : [args.to]
      if (recipients.length > 10) {
        return { valid: false, blocked: true, reason: 'send_email limited to 10 recipients per call' }
      }
      break
      
    case 'make_payment':
      if (!args.amount || typeof args.amount !== 'number') {
        return { valid: false, blocked: true, reason: 'make_payment requires numeric amount' }
      }
      if (args.amount > 1000) {
        return { valid: false, blocked: true, reason: 'make_payment requires approval for amounts > $1000' }
      }
      break
      
    case 'execute_code':
      // Always require explicit approval for code execution
      return { valid: false, blocked: true, reason: 'execute_code requires explicit approval' }
  }
  
  return { valid: true, blocked: false }
}

/**
 * Reset circuit breaker for a tool (manual intervention)
 */
export async function resetCircuitBreaker(
  userId: string,
  toolName: string,
  agentId?: string
): Promise<void> {
  const supabase = createAdminClient()
  
  await supabase
    .from('tool_circuit_breaker')
    .update({
      state: 'closed',
      failure_count: 0,
      opened_at: null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('user_id', userId)
    .eq('tool_name', toolName)
    .eq('agent_id', (agentId || '') as string)
}

/**
 * Get circuit breaker status for monitoring
 */
export async function getCircuitBreakerStatus(
  userId: string,
  agentId?: string
): Promise<CircuitBreakerState[]> {
  const supabase = createAdminClient()
  
  let query = supabase
    .from('tool_circuit_breaker')
    .select('*')
    .eq('user_id', userId)
  
  if (agentId) {
    query = query.eq('agent_id', agentId)
  }
  
  const { data } = await query
  return (data || []) as unknown as CircuitBreakerState[]
}

/**
 * Wrapper to execute tool with circuit breaker protection
 */
export async function executeWithCircuitBreaker<T>(
  userId: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
  executor: () => Promise<T>,
  options?: {
    agentId?: string
    conversationId?: string
  }
): Promise<{ result?: T; blocked: boolean; reason?: string }> {
  const startTime = Date.now()
  
  // Validate before execution
  const validation = await validateToolCall(userId, toolName, toolArgs, options)
  
  if (!validation.valid || validation.blocked) {
    await recordToolCall(
      userId,
      toolName,
      toolArgs,
      { status: 'blocked', executionMs: Date.now() - startTime },
      { ...options, blockedReason: validation.reason }
    )
    return { blocked: true, reason: validation.reason }
  }
  
  try {
    const result = await executor()
    
    await recordToolCall(
      userId,
      toolName,
      toolArgs,
      { status: 'success', executionMs: Date.now() - startTime },
      { ...options, isDuplicate: validation.is_duplicate }
    )
    
    return { result, blocked: false }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    await recordToolCall(
      userId,
      toolName,
      toolArgs,
      { 
        status: 'error', 
        summary: errorMessage,
        executionMs: Date.now() - startTime 
      },
      options
    )
    
    throw error
  }
}
