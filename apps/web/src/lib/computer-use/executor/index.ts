/**
 * Agent Executor Module
 * 
 * This module provides the agent execution engine for 2Hands.
 * It has been refactored from a single 3000-line file into modular components:
 * 
 * - types.ts: Type definitions and interfaces
 * - constants.ts: Configuration values and limits
 * - context.ts: Message pruning and context compaction
 * - utils.ts: Helper functions (progress updates, action info, etc.)
 * 
 * The main executeAgentTask function is still in agent-executor.ts for now
 * but uses these modular components.
 */

// Re-export types
export type {
  AgentExecutorConfig,
  ComputerUseResult,
  ActionInfo,
  ReflectionContext,
  ExecutionState,
  PruneResult,
  CompactionResult,
  ToolCallResult,
  ProgressType,
  CancellationCheckResult,
  GoalCheckResult,
} from './types'

// Re-export type guards
export {
  isToolResultBlock,
  isToolResultMessage,
  hasImageContent,
} from './types'

// Re-export constants
export {
  MAX_ITERATIONS,
  DEFAULT_PRIMARY_MODEL,
  DEFAULT_FALLBACK_MODELS,
  MAX_RECENT_MESSAGES,
  MAX_MESSAGES_BEFORE_TRIM,
  MAX_SCREENSHOTS_TO_KEEP,
  MAX_TOOL_TEXT_CHARS,
  MAX_TOOL_JSON_CHARS,
  COMPACTION_CHAR_THRESHOLD,
  COMPACTION_MIN_ITERATION_GAP,
  GOAL_CHECK_INTERVAL,
  RUN_QUEUE_POLL_INTERVAL_MS,
  CANCELLATION_CHECK_INTERVAL,
  PROGRESS_LOG_INTERVAL,
} from './constants'

// Re-export context management
export {
  hashScreenshot,
  isScreenshotDuplicate,
  resetScreenshotHash,
  pruneToolResultsInMessages,
  estimateMessagesCharSize,
  findSafeTailStartIndex,
  renderMessagesForCompaction,
  maybeCompactMessages,
} from './context'

// Re-export utilities
export {
  getActionInfo,
  sendProgressUpdate,
  sanitizeVmIp,
  formatDuration,
  isSameUrl,
} from './utils'

// The main executeAgentTask function is still exported from agent-executor.ts
// This maintains backward compatibility while allowing gradual refactoring
export { executeAgentTask } from '../agent-executor'
