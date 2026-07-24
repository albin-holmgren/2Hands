/**
 * Agent Executor Constants
 * Configuration values and limits for agent execution
 */

// Model configuration
export const MAX_ITERATIONS = 200
export const DEFAULT_PRIMARY_MODEL = 'google/gemini-2.5-flash'
export const DEFAULT_FALLBACK_MODELS = [
  'google/gemini-2.5-pro',
  'anthropic/claude-3.5-haiku'
]

// Message context management
export const MAX_RECENT_MESSAGES = 24
export const MAX_MESSAGES_BEFORE_TRIM = 40
export const MAX_SCREENSHOTS_TO_KEEP = 1
export const MAX_TOOL_TEXT_CHARS = 2000
export const MAX_TOOL_JSON_CHARS = 4000

// Context compaction thresholds
export const COMPACTION_CHAR_THRESHOLD = 90000
export const COMPACTION_MIN_ITERATION_GAP = 4

// Screenshot deduplication
export const SCREENSHOT_HASH_SAMPLE_SIZE = 10000 // bytes to sample for hash

// Goal checking
export const GOAL_CHECK_INTERVAL = 5

// Run queue polling
export const RUN_QUEUE_POLL_INTERVAL_MS = 2500

// Cancellation check
export const CANCELLATION_CHECK_INTERVAL = 3 // every N iterations

// Progress reporting
export const PROGRESS_LOG_INTERVAL = 20 // iterations
export const ELAPSED_TIME_LOG_INTERVAL_MS = 20000 // 20 seconds

// Recovery thresholds
export const STUCK_RECOVERY_THRESHOLD_ITERATIONS = 10
export const DUPLICATE_SCREENSHOT_THRESHOLD = 3
export const NO_TOOL_USE_THRESHOLD = 5
export const SAME_URL_THRESHOLD = 5
