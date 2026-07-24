/**
 * Agent Executor Types
 * Centralized type definitions for the agent execution system
 */

import type Anthropic from '@anthropic-ai/sdk'

// Execution configuration
export interface AgentExecutorConfig {
  agentId: string
  runId: string
  vmIp: string
  taskDescription: string
  userId: string
}

// Computer/VM action results
export interface ComputerUseResult {
  type: 'screenshot' | 'action_result'
  data: string
  success: boolean
}

// Action information for progress tracking
export interface ActionInfo {
  type: string
  target: string
  message: string
}

// Reflection context for self-improvement
export interface ReflectionContext {
  taskDescription: string
  completed: boolean
  insightsReported: number
  iterationsUsed: number
  errorsEncountered: Error[]
  toolsUsed: string[]
}

// Execution state tracking
export interface ExecutionState {
  hasPerformedComputerAction: boolean
  hasPerformedApiAction: boolean
  successfulClickCount: number
  lastMeaningfulActionIteration: number | null
  hasVerificationScreenshotAfterAction: boolean
  completedByTaskComplete: boolean
  consecutiveNoToolUse: number
  consecutiveDuplicateScreenshots: number
  lastPageUrl: string | null
  consecutiveSameUrl: number
}

// Pruning results
export interface PruneResult {
  prunedBlocks: number
  prunedScreenshots: number
}

// Compaction result
export interface CompactionResult {
  didCompact: boolean
  newLastCompactionIteration: number
}

// Tool call result
export interface ToolCallResult {
  toolName: string
  input: Record<string, unknown>
  output: unknown
  success: boolean
  durationMs: number
}

// Progress update types
export type ProgressType = 
  | 'started' 
  | 'progress' 
  | 'completed' 
  | 'failed' 
  | 'insight' 
  | 'action' 
  | 'blocker' 
  | 'acknowledgement'

// Cancellation result
export interface CancellationCheckResult {
  shouldCancel: boolean
  reason?: string
}

// Goal check result
export interface GoalCheckResult {
  goalReached: boolean
  nextSubgoalDescription?: string
  reason?: string
}

// Message type guards
export function isToolResultBlock(
  value: unknown
): value is { 
  type: 'tool_result'
  tool_use_id: string
  content: unknown
  is_error?: boolean 
} {
  if (!value || typeof value !== 'object') return false
  const v = value as { type?: unknown; tool_use_id?: unknown }
  return v.type === 'tool_result' && typeof v.tool_use_id === 'string'
}

export function isToolResultMessage(
  msg: Anthropic.MessageParam
): msg is Anthropic.MessageParam & { 
  role: 'user'
  content: Array<{
    type: 'tool_result'
    tool_use_id: string
    content: unknown
    is_error?: boolean
  }> 
} {
  const content = (msg as { content?: unknown }).content
  return (
    (msg as { role?: unknown }).role === 'user' &&
    Array.isArray(content) &&
    content.length > 0 &&
    content.every(isToolResultBlock)
  )
}

export function hasImageContent(value: unknown): boolean {
  if (!Array.isArray(value)) return false
  for (const part of value as Array<unknown>) {
    if (
      part &&
      typeof part === 'object' &&
      (part as { type?: unknown }).type === 'image'
    )
      return true
  }
  return false
}
