import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatProgressStep, formatRunSummary } from '@/lib/execution/execute-first-policy'
import { createHash } from 'crypto'
import { createNonStreamingMessageWithFallback, DEFAULT_MODEL, DEFAULT_FALLBACK_MODELS as GLOBAL_FALLBACK_MODELS, extractTextFromResponse } from '@/lib/ai/ai-client'
import { getAgentCredentials, buildTaskWithCredentials } from './credential-manager'
import { getAgentMemories, formatMemoriesForPrompt } from './agent-memory'
import { buildAgentConfig } from './dynamic-agent-builder'
import { executeWithCircuitBreaker, validateToolCall } from '@/lib/tools/circuit-breaker'
import { retrieveMemories, createMemoryNote } from '@/lib/memory/memory-linking'
import {
  getPageState,
  clickText,
  typeInto,
  waitForText,
  runActionBatch,
  formatPageStateForPrompt,
  detectBlockingCondition,
  checkSemanticSupport,
  type PageState,
  type BatchedAction,
} from './semantic-browser-tools'
import {
  verifyAction,
  needsVerification,
  getActionRiskLevel,
  buildVerificationInstructions,
  type VerificationPolicy,
} from './action-verifier'
import {
  checkPreconditions,
  checkPostconditions,
  checkInvariants,
  getRecoveryHint,
  buildChecklistInstructions,
  formatChecklistResultForPrompt,
} from './skill-checklists'
import {
  generateTaskPlan,
  checkGoalProgress,
  advanceToNextSubgoal,
  markSubgoalFailed,
  formatPlanForPrompt,
  formatGoalCheckForPrompt,
  shouldTerminatePlan,
  buildPlanningInstructions,
  needsGoalTree,
  generateGoalTree,
  getCurrentProject,
  startProject,
  advanceToNextProject,
  projectToTaskPlan,
  formatGoalTreeForPrompt,
  buildGoalTreeInstructions,
  generateSessionHandoff,
  serializeGoalTree,
  deserializeGoalTree,
  discoverToolsForProject,
  type TaskPlan,
  type GoalTree,
} from './subgoal-planner'
import { 
  buildMemoryContext, 
  formatMemoryContextForPrompt, 
  initializeAgentMemory,
  appendToDailyLog,
  learnFromInteraction,
  storeRunSummary,
  getMemoryDocument,
  updateMemoryDocument,
} from './structured-memory'
import { markAgentRunComplete } from '@/lib/scheduler/agent-scheduler'
import { performWebSearch } from '@/lib/excellence/real-web-research'
import { 
  getUserSharedKnowledge, 
  formatSharedKnowledgeForPrompt,
  curateAgentLearnings
} from '@/lib/memory/memory-curator'
import {
  findMatchingPatterns,
  createOrUpdatePattern,
  recordExecutionRun,
  getLearnedWisdom,
  formatLearnedWisdomForPrompt,
  generateImprovementSuggestions,
  type ExecutionStep,
} from '@/lib/learning/task-pattern-learning'
import {
  performPreExecutionResearch,
  formatResearchForPrompt,
  detectToolsInTask,
  shouldPerformResearch,
} from '@/lib/learning/pre-execution-research'
import {
  recordLearningApplication,
  recordLearningOutcome,
  formatLearningApplicationInstructions,
  pruneHarmfulLearnings,
  promoteEffectiveLearnings,
} from '@/lib/learning/knowledge-application'
import {
  createEvidenceBundle,
  recordStepReceipt,
  recordConfirmation,
  recordArtifact,
  recordLinkVisited,
  finalizeEvidenceBundle,
  formatEvidenceBundleForDisplay,
} from '@/lib/excellence/evidence-bundle'
import {
  researchTool as performRealWebResearch,
  getCachedResearch,
  formatResearchCitationsForPrompt,
  verifyCitationByUsage,
} from '@/lib/excellence/real-web-research'
import {
  findMatchingMacros,
  formatMacroForPrompt,
  compilePatternToMacro,
} from '@/lib/excellence/skill-macros'
import {
  runQualityGateChecks,
  runLLMQAPass,
  formatQualityGateResultForDisplay,
  shouldBlockCompletion,
} from '@/lib/excellence/quality-gates'
import {
  detectHandoffNeed,
  createHandoff,
  autoRouteHandoff,
  getOpenHandoffs,
  findExistingRunHandoff,
  updateAgentCapability,
} from '@/lib/collaboration/task-handoff'
import {
  broadcastLearning,
  getPendingLearnings,
  markLearningApplied,
  detectLearnableMoment,
  formatLearningsForPrompt,
} from '@/lib/collaboration/learning-network'
import {
  analyzeFailure,
  getKnownResolution,
  formatFailurePatternsForPrompt,
  getMostCommonFailures,
} from '@/lib/collaboration/failure-patterns'
import { 
  generateSelfReflection, 
  getAgentReflections,
  formatReflectionsForPrompt,
  type ReflectionContext
} from '@/lib/memory/agent-reflection'
import {
  detectErrorType,
  planRecovery,
  buildRecoveryInstructions,
  type ErrorContext
} from '@/lib/proactive/error-recovery'
import { createSignedHeaders } from '@/lib/security/hmac'
import {
  loadAgentIntegrationTools,
  executeAgentIntegrationTool,
  buildIntegrationToolsPrompt,
  type AgentIntegrationToolset,
  type IntegrationToolResult,
} from '@/lib/integrations/agent-tools-bridge'
import { AgentExecutionContext } from '@/lib/agents/execution-lock'
import { terminateAgentVM } from '@/lib/paperspace/agent-vm'
import {
  classifyTask,
  buildOperationalInstructions,
  deserializeCheckpoint,
  type TaskClassification,
  type RunCheckpoint,
} from './operational-playbooks'
import { completeRunMetrics } from '@/lib/proactive/observability'

// Circuit breaker configuration
// No hard time-based timeout — the agent runs until task_complete is called.
// Only MAX_ITERATIONS acts as a safety cap to prevent infinite loops.
const MAX_ITERATIONS = 200

const DEFAULT_PRIMARY_MODEL = DEFAULT_MODEL
const DEFAULT_FALLBACK_MODELS = GLOBAL_FALLBACK_MODELS

const MAX_RECENT_MESSAGES = 24
const MAX_MESSAGES_BEFORE_TRIM = 40
const MAX_SCREENSHOTS_TO_KEEP = 1
const MAX_TOOL_TEXT_CHARS = 2000
const MAX_TOOL_JSON_CHARS = 4000
const COMPACTION_CHAR_THRESHOLD = 90000
const COMPACTION_MIN_ITERATION_GAP = 4

// Track last screenshot hash to detect duplicates
let lastScreenshotHash: string | null = null

// Simple hash function to detect duplicate screenshots
function hashScreenshot(base64Data: string): string {
  // Use first 10KB of image data for fast comparison
  const sample = base64Data.slice(0, 10000)
  return createHash('md5').update(sample).digest('hex')
}

function isToolResultBlock(value: unknown): value is { type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean } {
  if (!value || typeof value !== 'object') return false
  const v = value as { type?: unknown; tool_use_id?: unknown }
  return v.type === 'tool_result' && typeof v.tool_use_id === 'string'
}

function isToolResultMessage(msg: Anthropic.MessageParam): msg is Anthropic.MessageParam & { role: 'user'; content: Array<{ type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean }> } {
  const content = (msg as { content?: unknown }).content
  return (msg as { role?: unknown }).role === 'user' && Array.isArray(content) && content.length > 0 && content.every(isToolResultBlock)
}

function hasImageContent(value: unknown): boolean {
  if (!Array.isArray(value)) return false
  for (const part of value as Array<unknown>) {
    if (part && typeof part === 'object' && (part as { type?: unknown }).type === 'image') return true
  }
  return false
}

function pruneToolResultsInMessages(messages: Anthropic.MessageParam[]): { prunedBlocks: number; prunedScreenshots: number } {
  let prunedBlocks = 0
  let prunedScreenshots = 0
  let screenshotsKept = 0

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!isToolResultMessage(msg)) continue

    const blocks = (msg as { content: Array<{ type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean }> }).content
    for (let b = 0; b < blocks.length; b++) {
      const block = blocks[b]

      const isScreenshot = hasImageContent(block.content)
      if (isScreenshot) {
        if (screenshotsKept < MAX_SCREENSHOTS_TO_KEEP) {
          screenshotsKept++
        } else {
          blocks[b] = {
            ...block,
            content: 'Screenshot omitted to keep context healthy.',
          }
          prunedBlocks++
          prunedScreenshots++
        }
        continue
      }

      if (typeof block.content === 'string') {
        const trimmed = block.content.trim()
        if (trimmed.length > MAX_TOOL_TEXT_CHARS) {
          blocks[b] = {
            ...block,
            content: `${trimmed.slice(0, MAX_TOOL_TEXT_CHARS)}\n\n[...truncated...]`,
          }
          prunedBlocks++
        }
        continue
      }

      const asJson = JSON.stringify(block.content)
      if (asJson.length > MAX_TOOL_JSON_CHARS) {
        blocks[b] = {
          ...block,
          content: `${asJson.slice(0, MAX_TOOL_JSON_CHARS)}\n\n[...truncated...]`,
        }
        prunedBlocks++
      }
    }
  }

  return { prunedBlocks, prunedScreenshots }
}

function estimateMessagesCharSize(messages: Anthropic.MessageParam[]): number {
  let total = 0

  for (const msg of messages) {
    const content = (msg as { content?: unknown }).content
    if (typeof content === 'string') {
      total += content.length
      continue
    }

    if (!Array.isArray(content)) continue

    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const t = (part as { type?: unknown }).type

      if (t === 'text') {
        total += typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text.length : 0
        continue
      }

      if (t === 'tool_use') {
        const name = typeof (part as { name?: unknown }).name === 'string' ? String((part as { name: string }).name) : ''
        const input = (part as { input?: unknown }).input
        total += name.length
        if (input) total += JSON.stringify(input).length
        continue
      }

      if (t === 'tool_result') {
        const trContent = (part as { content?: unknown }).content
        if (typeof trContent === 'string') {
          total += trContent.length
        } else if (hasImageContent(trContent)) {
          total += 2000
        } else {
          total += JSON.stringify(trContent).length
        }
      }
    }
  }

  return total
}

function findSafeTailStartIndex(messages: Anthropic.MessageParam[], keepLast: number): number {
  let start = Math.max(1, messages.length - keepLast)

  while (start > 1) {
    const msg = messages[start]
    if ((msg as { role?: unknown }).role === 'assistant') return start
    if (!isToolResultMessage(msg)) return start
    start--
  }

  return 1
}

function renderMessagesForCompaction(messages: Anthropic.MessageParam[]): string {
  const lines: string[] = []

  for (const msg of messages) {
    const role = (msg as { role?: unknown }).role === 'assistant' ? 'assistant' : 'user'
    const content = (msg as { content?: unknown }).content

    if (typeof content === 'string') {
      const c = content.trim()
      if (c) lines.push(`${role.toUpperCase()}: ${c}`)
      continue
    }

    if (Array.isArray(content)) {
      const parts: string[] = []

      if (content.length > 0 && content.every(isToolResultBlock)) {
        for (const block of content as Array<{ type: 'tool_result'; tool_use_id: string; content: unknown }>) {
          const isScreenshot = hasImageContent(block.content)
          if (isScreenshot) {
            parts.push(`TOOL_RESULT(${block.tool_use_id}): [image]`)
          } else if (typeof block.content === 'string') {
            const txt = block.content.trim()
            parts.push(`TOOL_RESULT(${block.tool_use_id}): ${txt.slice(0, 600)}`)
          } else {
            parts.push(`TOOL_RESULT(${block.tool_use_id}): ${JSON.stringify(block.content).slice(0, 600)}`)
          }
        }
      } else {
        for (const part of content) {
          if (!part || typeof part !== 'object') continue
          const t = (part as { type?: unknown }).type
          if (t === 'text') {
            const txt = typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text.trim() : ''
            if (txt) parts.push(txt.slice(0, 1200))
          } else if (t === 'tool_use') {
            const name = typeof (part as { name?: unknown }).name === 'string' ? String((part as { name: string }).name) : 'tool'
            const input = (part as { input?: unknown }).input
            parts.push(`TOOL_USE(${name}): ${JSON.stringify(input).slice(0, 800)}`)
          }
        }
      }

      if (parts.length > 0) lines.push(`${role.toUpperCase()}: ${parts.join('\n')}`)
    }
  }

  const joined = lines.join('\n\n')
  return joined.length > 60000 ? joined.slice(0, 60000) : joined
}

async function maybeCompactMessages(args: {
  messages: Anthropic.MessageParam[]
  iterationCount: number
  lastCompactionIteration: number
  model: string
  fallbacks: string[]
}): Promise<{ didCompact: boolean; newLastCompactionIteration: number }> {
  const { messages, iterationCount, lastCompactionIteration, model, fallbacks } = args

  if (iterationCount - lastCompactionIteration < COMPACTION_MIN_ITERATION_GAP) {
    return { didCompact: false, newLastCompactionIteration: lastCompactionIteration }
  }

  const size = estimateMessagesCharSize(messages)
  if (size < COMPACTION_CHAR_THRESHOLD && messages.length < MAX_MESSAGES_BEFORE_TRIM) {
    return { didCompact: false, newLastCompactionIteration: lastCompactionIteration }
  }

  if (messages.length < 6) {
    return { didCompact: false, newLastCompactionIteration: lastCompactionIteration }
  }

  const firstMessage = messages[0]
  const tailStart = findSafeTailStartIndex(messages, MAX_RECENT_MESSAGES)
  const summarizeSlice = messages.slice(1, tailStart)
  if (summarizeSlice.length === 0) {
    return { didCompact: false, newLastCompactionIteration: lastCompactionIteration }
  }

  const compactSource = renderMessagesForCompaction(summarizeSlice)
  const { response } = await createNonStreamingMessageWithFallback({
    model,
    max_tokens: 900,
    messages: [{
      role: 'user',
      content: `Summarize the following agent run context for continued execution. Preserve concrete facts, decisions made, current state, what has been tried, what worked/failed, and what to do next. Be concise but actionable.\n\n${compactSource}`,
    }],
  }, { fallbacks })

  const summaryText = extractTextFromResponse(response).trim()
  if (!summaryText) {
    return { didCompact: false, newLastCompactionIteration: lastCompactionIteration }
  }

  const summaryMessage: Anthropic.MessageParam = {
    role: 'user',
    content: `[System] Context summary:\n${summaryText}`,
  }

  const tail = messages.slice(tailStart)
  messages.length = 0
  messages.push(firstMessage, summaryMessage, ...tail)

  return { didCompact: true, newLastCompactionIteration: iterationCount }
}

// Check if screenshot is similar to previous (skip if duplicate)
function isScreenshotDuplicate(base64Data: string): boolean {
  const currentHash = hashScreenshot(base64Data)
  if (lastScreenshotHash === currentHash) {
    return true
  }
  lastScreenshotHash = currentHash
  return false
}

// Compress screenshot by requesting lower quality from VM
async function getCompressedScreenshot(vmIp: string): Promise<ComputerUseResult> {
  try {
    const ip = vmIp.trim()
    // Request screenshot with compression hint
    const response = await fetch(`http://${ip}:8080/computer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'screenshot', quality: 50, max_width: 1280 }),
    })

    if (!response.ok) {
      throw new Error(`VM action failed: ${response.status}`)
    }

    const result = await response.json()
    return {
      type: 'screenshot',
      data: result.screenshot,
      success: true,
    }
  } catch (error) {
    console.error('Screenshot error:', error)
    return {
      type: 'action_result',
      data: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      success: false,
    }
  }
}

interface ComputerUseResult {
  type: 'screenshot' | 'action_result'
  data: string
  success: boolean
}

interface AgentExecutorConfig {
  agentId: string
  runId: string
  vmIp: string
  taskDescription: string
  userId: string
}

// Helper to generate action info for user-visible action indicators
function getActionInfo(toolName: string, input: Record<string, unknown>): { type: string; target: string; message: string } | null {
  switch (toolName) {
    case 'type_text': {
      const text = String(input.text || '')
      // Check if typing a URL (browsing)
      if (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('www.')) {
        const url = text.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
        return { type: 'browse', target: text, message: `Browsed ${url}` }
      }
      // Check if typing in a search box (searching)
      if (text.length > 3 && text.length < 100 && !text.includes('\n')) {
        return { type: 'search', target: text, message: `Searched "${text.slice(0, 40)}${text.length > 40 ? '...' : ''}"` }
      }
      return null
    }
    case 'screenshot':
      return { type: 'read', target: 'screen', message: 'Reading page content' }
    case 'get_page_state':
      return { type: 'read', target: 'page', message: 'Reading page content' }
    case 'scroll':
      return { type: 'scroll', target: String(input.direction || 'down'), message: `Scrolled ${input.direction || 'down'}` }
    case 'click':
      return { type: 'click', target: `${input.x},${input.y}`, message: 'Clicked on screen' }
    default:
      return null
  }
}

async function sendProgressUpdate(
  agentId: string,
  runId: string,
  type: 'started' | 'progress' | 'completed' | 'failed' | 'insight' | 'action' | 'blocker' | 'acknowledgement',
  message: string,
  data?: Record<string, unknown>
): Promise<void> {
  const configuredBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim()
  const baseUrl = process.env.NODE_ENV === 'production'
    ? (configuredBaseUrl || 'http://localhost:3000')
    : 'http://localhost:3000'

  const url = `${baseUrl}/api/agents/progress`
  
  try {
    const payload = JSON.stringify({ agentId, runId, type, message, data })
    const signedHeaders = createSignedHeaders(payload)
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...signedHeaders,
      },
      body: payload,
    })
    
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      console.error('[AgentExecutor] Progress update failed:', { status: response.status, result })
    }
  } catch (error) {
    console.error('[AgentExecutor] Failed to send progress update:', error)
  }
}

// Note: System prompt is now built dynamically via buildAgentConfig()

export async function executeAgentTask(config: AgentExecutorConfig): Promise<void> {
  console.log('\n========================================')
  console.log('[AgentExecutor] STARTING AGENT EXECUTION')
  console.log('========================================')
  console.log('[AgentExecutor] Config:', { 
    agentId: config.agentId, 
    runId: config.runId,
    vmIp: config.vmIp, 
    task: config.taskDescription.slice(0, 100) 
  })
  
  const supabase = createAdminClient()
  const executionStartTime = Date.now()

  const { data: agentConfigRow } = await supabase
    .from('agents')
    .select('config, workspace_id')
    .eq('id', config.agentId)
    .single()

  const agentWorkspaceId = (agentConfigRow as { workspace_id?: string } | null)?.workspace_id || ''
  const agentConfig = (agentConfigRow as { config: Record<string, unknown> } | null)?.config || {}
  const configuredPrimaryModelRaw = (agentConfig as { primaryModel?: unknown; primary_model?: unknown }).primaryModel ?? (agentConfig as { primary_model?: unknown }).primary_model
  const configuredFallbacksRaw = (agentConfig as { fallbacks?: unknown; fallbackModels?: unknown; fallback_models?: unknown }).fallbacks ?? (agentConfig as { fallbackModels?: unknown }).fallbackModels ?? (agentConfig as { fallback_models?: unknown }).fallback_models

  const primaryModel = (typeof configuredPrimaryModelRaw === 'string' && configuredPrimaryModelRaw.trim())
    ? configuredPrimaryModelRaw.trim()
    : DEFAULT_PRIMARY_MODEL

  const fallbackModels = Array.isArray(configuredFallbacksRaw)
    ? (configuredFallbacksRaw.filter((m): m is string => typeof m === 'string' && Boolean(m.trim())).map(m => m.trim()))
    : DEFAULT_FALLBACK_MODELS
  
  const isApiOnlyMode = config.vmIp === 'api-only'
  if (!config.vmIp) {
    console.error('[AgentExecutor] ERROR: No VM IP provided!')
    throw new Error('VM IP is required for agent execution')
  }
  if (isApiOnlyMode) {
    console.log('[AgentExecutor] Running in API-ONLY mode — no VM, using integration tools only')
  }
  
  // Acquire atomic execution lock to prevent concurrent runs
  const executionContext = new AgentExecutionContext(config.agentId)
  const lockAcquired = await executionContext.acquire()
  
  if (!lockAcquired) {
    console.log('[AgentExecutor] Could not acquire execution lock - another instance is running')
    // Reset agent status so user can retry
    const { data: agentRow } = await supabase
      .from('agents')
      .select('config')
      .eq('id', config.agentId)
      .single()

    const existingConfig = (agentRow as { config: Record<string, unknown> } | null)?.config || {}
    await supabase
      .from('agents')
      .update({ 
        status: 'idle',
        config: { ...existingConfig, execution_started: false, lock_conflict: true, active_run_id: null }
      } as never)
      .eq('id', config.agentId)
    return
  }
  
  console.log('[AgentExecutor] Acquired execution lock:', executionContext.id)
  console.log('[AgentExecutor] Connecting to VM at', config.vmIp)
  
  // Cleanup function to release resources on any exit
  async function cleanup(status: 'completed' | 'failed' | 'timeout', errorMessage?: string) {
    console.log('[AgentExecutor] Cleanup triggered:', status)

    try {
      await completeRunMetrics(
        config.runId,
        status,
        status === 'completed' ? 5 : undefined,
        status === 'completed' ? undefined : (errorMessage || 'Execution failed')
      )
    } catch (metricsError) {
      console.error('[AgentExecutor] Failed to complete run metrics:', metricsError)
    }
    
    // Release execution lock
    await executionContext.release()

    const { data: agentRow } = await supabase
      .from('agents')
      .select('config')
      .eq('id', config.agentId)
      .single()

    const existingConfig = (agentRow as { config: Record<string, unknown> } | null)?.config || {}
    const nextConfig: Record<string, unknown> = {
      ...existingConfig,
      execution_started: false,
      active_run_id: null,
      active_run_ended_at: new Date().toISOString(),
    }

    // If failed or timeout, mark agent appropriately and clean up VM
    if (status === 'failed' || status === 'timeout') {
      nextConfig.last_error = errorMessage || 'Execution failed'
      nextConfig.last_error_at = new Date().toISOString()
      await supabase
        .from('agents')
        .update({
          status: 'failed',
          config: nextConfig,
        } as never)
        .eq('id', config.agentId)
      
      // Webhook dispatch — notify external systems of agent failure
      try {
        const { dispatchWebhookEvent } = await import('@/lib/api-platform/webhooks')
        dispatchWebhookEvent(config.userId, 'agent.failed', {
          agentId: config.agentId,
          runId: config.runId,
          error: (errorMessage || 'Execution failed').slice(0, 500),
          failedAt: new Date().toISOString(),
        }).catch(() => {})
      } catch { /* webhook dispatch is non-critical */ }
      
      // Clean up VM resources to prevent leaks
      try {
        await terminateAgentVM(config.agentId)
        console.log('[AgentExecutor] VM resources cleaned up')

        const { data: agentRowAfter } = await supabase
          .from('agents')
          .select('config')
          .eq('id', config.agentId)
          .single()

        const existingConfigAfter = (agentRowAfter as { config: Record<string, unknown> } | null)?.config || {}

        await supabase
          .from('agents')
          .update({
            status: 'failed',
            config: { ...existingConfigAfter, execution_started: false },
          } as never)
          .eq('id', config.agentId)
      } catch (vmError) {
        console.error('[AgentExecutor] Failed to clean up VM:', vmError)
      }
    } else {
      await supabase
        .from('agents')
        .update({
          config: nextConfig,
        } as never)
        .eq('id', config.agentId)
    }
  }
  
  // Send started progress update
  await sendProgressUpdate(config.agentId, config.runId, 'started', `Started working on: ${config.taskDescription.slice(0, 100)}...`)
  
  // Webhook dispatch — notify external systems of agent start
  try {
    const { dispatchWebhookEvent } = await import('@/lib/api-platform/webhooks')
    dispatchWebhookEvent(config.userId, 'agent.started', {
      agentId: config.agentId,
      runId: config.runId,
      task: config.taskDescription.slice(0, 500),
      startedAt: new Date().toISOString(),
    }).catch(() => {})
  } catch { /* webhook dispatch is non-critical */ }
  
  // Skip browser reset - let the agent navigate where needed based on the task
  // The VM browser should already be in a usable state
  
  // Get credentials for this agent
  const credentials = await getAgentCredentials(config.userId, config.agentId)
  
  // === INTEGRATION TOOLS: Load MCP/API tools from user's active connections ===
  let integrationToolset: AgentIntegrationToolset = { tools: [], toolMap: new Map(), connectionCount: 0, providers: [] }
  try {
    integrationToolset = await loadAgentIntegrationTools(config.userId, agentWorkspaceId || undefined)
    if (integrationToolset.tools.length > 0) {
      console.log('[AgentExecutor] Loaded', integrationToolset.tools.length, 'integration tools from', integrationToolset.providers.join(', '))
    }
  } catch (e) {
    console.error('[AgentExecutor] Failed to load integration tools:', e)
  }
  
  // Initialize structured memory if this is the first run
  await initializeAgentMemory(config.agentId)
  
  // === LEARNING SYSTEM: Get learned wisdom from previous runs ===
  const learnedWisdom = await getLearnedWisdom(config.userId, config.taskDescription)
  if (learnedWisdom.hasLearnings) {
    console.log('[AgentExecutor] Found learned wisdom - confidence:', Math.round(learnedWisdom.confidence * 100) + '%')
  }
  
  // Create or get task pattern for learning
  const patternId = await createOrUpdatePattern(
    config.userId,
    config.agentId,
    config.taskDescription
  )
  console.log('[AgentExecutor] Task pattern ID:', patternId)
  
  // === PRE-EXECUTION RESEARCH: Research tools before starting ===
  const detectedTools = detectToolsInTask(config.taskDescription)
  let researchResult = null
  if (detectedTools.length > 0 && shouldPerformResearch(config.taskDescription, 0)) {
    console.log('[AgentExecutor] Performing pre-execution research for:', detectedTools)
    try {
      researchResult = await performPreExecutionResearch(
        config.userId,
        config.agentId,
        config.taskDescription,
        { depth: 'moderate' }
      )
      console.log('[AgentExecutor] Research completed -', Object.keys(researchResult.tool_knowledge).length, 'tools researched')
    } catch (error) {
      console.error('[AgentExecutor] Research failed:', error)
    }
  }
  
  // Track execution steps for learning
  const executionSteps: ExecutionStep[] = []

  let hasPerformedComputerAction = false
  let hasPerformedApiAction = false
  /** True when the agent has called at least one integration write tool (create/update/add/delete) */
  let hasAttemptedExternalWrite = false
  /** True when at least one integration write returned verified confirmation from the API */
  let hasVerifiedExternalWrite = false
  let successfulClickCount = 0
  let lastMeaningfulActionIteration: number | null = null
  let hasVerificationScreenshotAfterAction = false
  let completedByTaskComplete = false

  let consecutiveNoToolUse = 0
  let consecutiveDuplicateScreenshots = 0
  let lastPageUrl: string | null = null
  let consecutiveSameUrl = 0
  
  // === EVIDENCE BUNDLE: Create bundle to track proof of work ===
  const evidenceBundleId = await createEvidenceBundle(
    config.agentId,
    config.userId,
    config.taskDescription
  )
  console.log('[AgentExecutor] Evidence bundle created:', evidenceBundleId)
  
  // === REAL WEB RESEARCH: Get verified knowledge with citations ===
  const realResearchCitations: string[] = []
  for (const tool of detectedTools.slice(0, 3)) { // Limit to 3 tools
    try {
      // Check cache first
      const cached = await getCachedResearch(config.userId, tool)
      if (cached.length > 0) {
        console.log(`[AgentExecutor] Using cached research for ${tool}:`, cached.length, 'citations')
        realResearchCitations.push(formatResearchCitationsForPrompt(cached))
      } else {
        // Perform real web research
        const research = await performRealWebResearch(config.userId, tool, { maxSources: 3 })
        if (research.citationsExtracted > 0) {
          console.log(`[AgentExecutor] New research for ${tool}:`, research.citationsExtracted, 'citations')
          realResearchCitations.push(formatResearchCitationsForPrompt(research.topCitations))
        }
      }
    } catch (err) {
      console.error(`[AgentExecutor] Research error for ${tool}:`, err)
    }
  }
  
  // === SKILL MACROS: Find matching pre-compiled playbooks ===
  const matchingMacros = await findMatchingMacros(config.userId, config.taskDescription)
  console.log('[AgentExecutor] Matching macros found:', matchingMacros.length)
  
  // Get structured memory context (Moltbot-style)
  const structuredMemory = await buildMemoryContext(config.agentId)
  const structuredMemoryPrompt = formatMemoryContextForPrompt(structuredMemory)
  
  // Get A-Mem style linked memories
  const linkedMemories = await retrieveMemories(config.userId, config.taskDescription, {
    agentId: config.agentId,
    taskComplexity: 'medium',
  })
  
  // Also get legacy memories for backwards compatibility
  const legacyMemories = await getAgentMemories(config.agentId, { limit: 10 })
  const legacyMemoryContext = formatMemoriesForPrompt(legacyMemories)
  
  // Build enhanced task description with credentials and memory
  let enhancedTask = config.taskDescription
  if (credentials.length > 0) {
    enhancedTask = buildTaskWithCredentials(enhancedTask, credentials)
    console.log('[AgentExecutor] Injected credentials for services:', credentials.map(c => c.service))
  }
  
  // Add structured memory context (new system)
  if (structuredMemoryPrompt) {
    enhancedTask += structuredMemoryPrompt
    console.log('[AgentExecutor] Added structured memory context')
  }
  
  // Add A-Mem linked memories
  if (linkedMemories.length > 0) {
    enhancedTask += '\n\n## Relevant Memories (A-Mem)\n'
    for (const mem of linkedMemories) {
      enhancedTask += `- ${mem.content}\n`
      if (mem.contextual_description) {
        enhancedTask += `  Context: ${mem.contextual_description}\n`
      }
    }
    console.log('[AgentExecutor] Added', linkedMemories.length, 'A-Mem linked memories')
  }
  
  // Add legacy memory context if available
  if (legacyMemoryContext) {
    enhancedTask += legacyMemoryContext
    console.log('[AgentExecutor] Added legacy memory context:', legacyMemories.length, 'memories')
  }
  
  // Get cross-agent shared knowledge (learnings from other agents in same workspace)
  const sharedKnowledge = agentWorkspaceId
    ? await getUserSharedKnowledge(config.userId, agentWorkspaceId)
    : []
  const sharedKnowledgePrompt = formatSharedKnowledgeForPrompt(sharedKnowledge)
  if (sharedKnowledgePrompt) {
    enhancedTask += sharedKnowledgePrompt
    console.log('[AgentExecutor] Added shared knowledge from other agents:', sharedKnowledge.length, 'items')
  }
  
  // === LEARNING NETWORK: Get learnings from other agents ===
  const networkLearnings = await getPendingLearnings(config.agentId, 5)
  if (networkLearnings.length > 0) {
    const learningsPrompt = formatLearningsForPrompt(networkLearnings)
    enhancedTask += learningsPrompt
    console.log('[AgentExecutor] Added', networkLearnings.length, 'learnings from network')
  }
  
  // === FAILURE PATTERNS: Get known failure resolutions ===
  const failurePatterns = await getMostCommonFailures(config.userId, 5)
  if (failurePatterns.length > 0) {
    const failurePatternsPrompt = formatFailurePatternsForPrompt(failurePatterns)
    enhancedTask += failurePatternsPrompt
    console.log('[AgentExecutor] Added', failurePatterns.length, 'known failure patterns')
  }
  
  // Get past reflections to learn from previous runs
  const pastReflections = await getAgentReflections(config.agentId, 5)
  const reflectionsPrompt = formatReflectionsForPrompt(pastReflections)
  if (reflectionsPrompt) {
    enhancedTask += reflectionsPrompt
    console.log('[AgentExecutor] Added lessons from', pastReflections.length, 'past reflections')
  }
  
  // === ADD LEARNED WISDOM FROM TASK PATTERN LEARNING ===
  if (learnedWisdom.hasLearnings) {
    const wisdomPrompt = formatLearnedWisdomForPrompt(learnedWisdom)
    enhancedTask += wisdomPrompt
    console.log('[AgentExecutor] Added learned wisdom - tips:', learnedWisdom.tips.length, 'pitfalls:', learnedWisdom.pitfalls.length)
  }
  
  // === ADD PRE-EXECUTION RESEARCH ===
  if (researchResult) {
    const researchPrompt = formatResearchForPrompt(researchResult)
    enhancedTask += researchPrompt
    console.log('[AgentExecutor] Added research for', researchResult.detected_tools.length, 'tools')
  }
  
  // === ADD LEARNING APPLICATION INSTRUCTIONS ===
  const learningInstructions = formatLearningApplicationInstructions(
    learnedWisdom.hasLearnings,
    researchResult !== null
  )
  if (learningInstructions) {
    enhancedTask += learningInstructions
    console.log('[AgentExecutor] Added learning application instructions')
  }
  
  // === ADD REAL WEB RESEARCH WITH CITATIONS ===
  if (realResearchCitations.length > 0) {
    enhancedTask += '\n' + realResearchCitations.join('\n')
    console.log('[AgentExecutor] Added real web research citations')
  }
  
  // === ADD MATCHING SKILL MACROS ===
  if (matchingMacros.length > 0) {
    enhancedTask += '\n## Pre-compiled Playbooks Available\n'
    enhancedTask += '_These are proven step sequences for similar tasks. Follow them for best results._\n'
    for (const macro of matchingMacros.slice(0, 2)) { // Limit to top 2
      enhancedTask += formatMacroForPrompt(macro)
    }
    console.log('[AgentExecutor] Added', matchingMacros.length, 'skill macros')
  }
  
  // === ADD WORKSPACE SKILLS CONTEXT ===
  try {
    if (agentWorkspaceId) {
      const { getEnabledSkillsAdmin } = await import('@/lib/skills/skill-registry')
      const enabledSkills = await getEnabledSkillsAdmin(agentWorkspaceId)
      if (enabledSkills.length > 0) {
        // Inject skill metadata so agents know what workflows are available
        const skillLines = enabledSkills
          .slice(0, 10) // Limit to top 10 to control context size
          .map(s => `- **${s.name}** (${s.category}): ${s.description}`)
          .join('\n')
        enhancedTask += `\n\n## Available Workspace Skills\nThe following specialized workflows are available in this workspace. When your task aligns with a skill's purpose, follow its structured approach for better results:\n${skillLines}\n\nTo use a skill's workflow, load its full instructions by matching your task to the most relevant skill above.\n`
        console.log('[AgentExecutor] Added', enabledSkills.length, 'workspace skills to context')
      }
    }
  } catch (e) {
    console.warn('[AgentExecutor] Failed to load workspace skills:', e)
  }

  // === ADD INTEGRATION API TOOLS PROMPT ===
  if (integrationToolset.tools.length > 0) {
    const integrationPrompt = buildIntegrationToolsPrompt(integrationToolset)
    enhancedTask += integrationPrompt
    console.log('[AgentExecutor] Added integration tools prompt for', integrationToolset.providers.join(', '))
  }

  // === OPERATIONAL PLAYBOOK: Continuous task classification & run instructions ===
  const taskClassification: TaskClassification = classifyTask(config.taskDescription)
  let operationalCheckpoint: RunCheckpoint | null = null

  if (taskClassification.isRecurring && taskClassification.playbook) {
    console.log('[AgentExecutor] Operational task detected:', taskClassification.category,
      '(confidence:', taskClassification.confidence.toFixed(2) + ')',
      '— suggested schedule:', taskClassification.suggestedScheduleLabel)

    // Load checkpoint from workspace memory
    try {
      const workspaceContent = await getMemoryDocument(config.agentId, 'workspace')
      const cpMarker = '<!--RUN_CHECKPOINT:'
      const cpEnd = ':RUN_CHECKPOINT-->'
      const cpStart = workspaceContent.indexOf(cpMarker)
      const cpEndIdx = workspaceContent.indexOf(cpEnd)
      if (cpStart !== -1 && cpEndIdx !== -1) {
        const cpJson = workspaceContent.slice(cpStart + cpMarker.length, cpEndIdx)
        operationalCheckpoint = deserializeCheckpoint(cpJson)
        if (operationalCheckpoint) {
          console.log('[AgentExecutor] Loaded run checkpoint from previous run:', operationalCheckpoint.last_run_at)
        }
      }
    } catch (e) {
      console.warn('[AgentExecutor] Failed to load run checkpoint:', e)
    }

    // Inject operational instructions into enhanced task
    const operationalInstructions = buildOperationalInstructions(taskClassification, operationalCheckpoint)
    if (operationalInstructions) {
      enhancedTask += operationalInstructions
      console.log('[AgentExecutor] Added operational playbook:', taskClassification.playbook.name)
    }

    await sendProgressUpdate(config.agentId, config.runId, 'progress',
      `Operational mode: ${taskClassification.playbook.name} (${taskClassification.suggestedScheduleLabel})`)
  }
  
  // Track execution context for self-reflection
  const reflectionContext: ReflectionContext = {
    taskDescription: config.taskDescription,
    completed: false,
    insightsReported: 0,
    iterationsUsed: 0,
    errorsEncountered: [],
    toolsUsed: [],
  }

  let runHandoffCreated = false

  const maybeCreateFailureHandoff = async (failureContext: string): Promise<void> => {
    if (runHandoffCreated) return

    try {
      const openHandoffs = await getOpenHandoffs(config.userId)
      const existingRunHandoff = findExistingRunHandoff(openHandoffs, config.agentId, config.runId)
      if (existingRunHandoff) {
        runHandoffCreated = true
        return
      }

      const handoffNeed = await detectHandoffNeed(
        config.agentId,
        config.taskDescription,
        detectedTools.length > 0 ? detectedTools : ['general'],
        failureContext
      )

      if (!handoffNeed.needsHandoff || !handoffNeed.reason || !handoffNeed.handoffType) {
        return
      }

      const { data: agentMeta } = await supabase
        .from('agents')
        .select('name')
        .eq('id', config.agentId)
        .single()

      const sourceAgentName = (agentMeta as { name?: string } | null)?.name || 'Agent'
      const handoffId = await createHandoff(config.agentId, sourceAgentName, config.userId, {
        reason: handoffNeed.reason,
        handoffType: handoffNeed.handoffType,
        originalTask: config.taskDescription,
        subtaskDescription: handoffNeed.subtask || config.taskDescription,
        contextData: {
          run_id: config.runId,
          failure_context: failureContext,
        },
        priority: handoffNeed.handoffType === 'escalation' ? 'high' : 'medium',
      })

      if (!handoffId) {
        return
      }

      runHandoffCreated = true

      if (handoffNeed.requiredSkill && handoffNeed.requiredSkill.trim()) {
        await autoRouteHandoff(handoffId, config.userId, handoffNeed.requiredSkill.trim(), config.agentId)
      }
    } catch (handoffError) {
      console.error('[AgentExecutor] Failure handoff error:', handoffError)
    }
  }
  
  // Log run start to daily log
  await appendToDailyLog(config.agentId, `Started task: ${config.taskDescription.slice(0, 100)}...`)
  
  // Build dynamic system prompt based on task analysis (AI-driven, no templates)
  const dynamicConfig = buildAgentConfig(config.taskDescription)
  
  // Add error recovery instructions to system prompt
  const errorRecoveryInstructions = buildRecoveryInstructions()

  // Add honesty guardrails — prevent agents from claiming false completions
  const honestyGuardrails = `

=== HONESTY RULES (CRITICAL — NEVER VIOLATE) ===
1. NEVER claim you completed a task unless you can point to concrete evidence (a screenshot, a tool result, a URL you visited, data you retrieved).
2. If a step fails, report the failure honestly — do NOT skip it and pretend the task is done.
3. If you cannot access a website, get blocked, or encounter an error, say exactly what happened.
4. NEVER fabricate data, URLs, statistics, or results. If you didn't find information, say "I could not find this" rather than making something up.
5. When using task_complete, your summary MUST accurately reflect what you actually accomplished. If you only completed 2 of 5 steps, say so.
6. If you're uncertain whether an action succeeded, verify it (take a screenshot, re-check the page) before claiming success.
7. Distinguish between "I attempted X" and "I confirmed X was successful". Only use the latter when you have proof.

=== HOW TO WORK LIKE A PRO ===
1. Track your progress: Use update_task to check off subtasks as you complete them. This prevents you from losing track across long runs.
2. Report milestones: Use report_to_board when you finish meaningful deliverables — the user and AI Manager see these.
3. Read other agents' work: If your task depends on another agent's output, use read_agent_data to get their findings before starting.
4. Before calling task_complete: Review your task checklist. If items are still pending, either complete them or explain why they were skipped.
5. Save important findings: Use remember to store key data for future runs.
`

  const systemPrompt = dynamicConfig.systemPrompt + errorRecoveryInstructions + honestyGuardrails
  
  console.log('[AgentExecutor] Built dynamic config - credentials needed:', dynamicConfig.requiredCredentials, 'risk:', dynamicConfig.riskLevel)
  
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: isApiOnlyMode
        ? `Please complete the following task using the available API tools:\n\n${enhancedTask}\n\nYou are running in API-only mode (no browser/VM). Use the integration_* tools to accomplish the task. Call task_complete when done.`
        : `Please complete the following task on this computer:\n\n${enhancedTask}\n\nStart by calling get_page_state to understand the current page/desktop state. If get_page_state is not available, take a screenshot instead.`,
    },
  ]

  let tools: Anthropic.Messages.Tool[] = [
    {
      name: 'screenshot',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      description: 'Take a screenshot of the current screen to see what is displayed.',
    } as Anthropic.Messages.Tool,
    {
      name: 'click',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X coordinate to click' },
          y: { type: 'number', description: 'Y coordinate to click' },
          button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button to click' },
        },
        required: ['x', 'y'],
      },
      description: 'Click at the specified coordinates on the screen.',
    } as Anthropic.Messages.Tool,
    {
      name: 'type_text',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to type' },
        },
        required: ['text'],
      },
      description: 'Type the specified text using the keyboard.',
    } as Anthropic.Messages.Tool,
    {
      name: 'key_press',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Key or key combination to press (e.g., "Return", "ctrl+c", "alt+Tab")' },
        },
        required: ['key'],
      },
      description: 'Press a key or key combination.',
    } as Anthropic.Messages.Tool,
    {
      name: 'scroll',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X coordinate to scroll at' },
          y: { type: 'number', description: 'Y coordinate to scroll at' },
          direction: { type: 'string', enum: ['up', 'down'], description: 'Direction to scroll' },
        },
        required: ['x', 'y', 'direction'],
      },
      description: 'Scroll at the specified coordinates.',
    } as Anthropic.Messages.Tool,
    {
      name: 'web_search',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query to find information online' },
          max_results: { type: 'number', description: 'Maximum number of results to return (default 5)' },
        },
        required: ['query'],
      },
      description: 'Search the web for information. Use this when you cannot access a website directly or need to find current data. Great fallback when browsing fails.',
    } as Anthropic.Messages.Tool,
    {
      name: 'report_insight',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {
          insight: { type: 'string', description: 'The insight or finding to report to the user' },
          source: { type: 'string', description: 'Where this insight came from (e.g., website URL, article title)' },
        },
        required: ['insight'],
      },
      description: 'Report an insight or finding to the AI Manager who will relay it to the user. Use this frequently as you discover useful information.',
    } as Anthropic.Messages.Tool,
    {
      name: 'task_complete',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Brief summary of what was accomplished' },
          findings_count: { type: 'number', description: 'Number of insights/findings reported' },
          learnings: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Key things learned during this task that should be remembered for future runs'
          },
        },
        required: ['summary'],
      },
      description: 'Call this when you have completed the task. This saves costs by stopping execution early. Always call this when done!',
    } as Anthropic.Messages.Tool,
    {
      name: 'remember',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The information to remember' },
          category: { 
            type: 'string', 
            enum: ['user_fact', 'preference', 'important', 'pattern'],
            description: 'Category: user_fact (about the user), preference (user preference), important (critical info), pattern (recurring pattern)'
          },
        },
        required: ['content', 'category'],
      },
      description: 'Store important information for future runs. Use this when you learn something valuable about the user, their preferences, or patterns you notice.',
    } as Anthropic.Messages.Tool,
    // === AGENT WORKSPACE TOOLS (task tracking, board reporting, cross-agent data) ===
    {
      name: 'update_task',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'ID of the task to update' },
          status: { type: 'string', enum: ['in_progress', 'done', 'failed', 'skipped'], description: 'New status' },
          result: { type: 'string', description: 'Brief result or output of this task' },
        },
        required: ['task_id', 'status'],
      },
      description: 'Update a task in your checklist. Use this to track your progress through subtasks. Mark tasks done as you complete them, or failed if they cannot be completed.',
    } as Anthropic.Messages.Tool,
    {
      name: 'report_to_board',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Title of the milestone/deliverable (e.g., "Found 15 qualified leads")' },
          description: { type: 'string', description: 'Details of what was accomplished' },
          column: { type: 'string', enum: ['inbox', 'up_next', 'in_progress', 'in_review', 'done'], description: 'Which column to put this in. Default: done' },
        },
        required: ['title', 'description'],
      },
      description: 'Report a completed milestone or deliverable to the main workspace board. The user and AI Manager will see this. Use this when you have finished a meaningful piece of work.',
    } as Anthropic.Messages.Tool,
    {
      name: 'read_agent_data',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {
          agent_name: { type: 'string', description: 'Name of the agent whose data you want to read (or "all" for a summary of all agents)' },
        },
        required: ['agent_name'],
      },
      description: 'Read findings and data from another agent in this workspace. Use this when your task depends on another agent\'s output (e.g., you need the lead list from the research agent).',
    } as Anthropic.Messages.Tool,
    // === NEW SEMANTIC BROWSER TOOLS (faster + more reliable) ===
    {
      name: 'click_text',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The visible text of the element to click' },
          nth: { type: 'number', description: 'If multiple matches, which one (0-indexed). Default 0.' },
          fuzzy: { type: 'boolean', description: 'Allow partial text match. Default true.' },
        },
        required: ['text'],
      },
      description: 'Click an element by its visible text. Much more reliable than coordinate clicks. Use this instead of click when possible.',
    } as Anthropic.Messages.Tool,
    {
      name: 'type_into',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {
          field: { type: 'string', description: 'Label, placeholder, or name of the input field' },
          text: { type: 'string', description: 'Text to type into the field' },
          clear_first: { type: 'boolean', description: 'Clear existing content first. Default true.' },
          submit: { type: 'boolean', description: 'Press Enter after typing. Default false.' },
        },
        required: ['field', 'text'],
      },
      description: 'Type into a form field identified by its label or placeholder. More reliable than click + type_text.',
    } as Anthropic.Messages.Tool,
    {
      name: 'wait_for_text',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to wait for on the page' },
          timeout_ms: { type: 'number', description: 'Max time to wait in ms. Default 10000.' },
        },
        required: ['text'],
      },
      description: 'Wait for specific text to appear on the page before continuing.',
    } as Anthropic.Messages.Tool,
    {
      name: 'get_page_state',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
      description: 'Get current page state (URL, title, forms, buttons, errors) without a screenshot. Faster and uses fewer tokens.',
    } as Anthropic.Messages.Tool,
    {
      name: 'run_actions',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {
          actions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['click_text', 'type_into', 'key_press', 'scroll', 'wait_for_text', 'navigate'] },
                args: { type: 'object', description: 'Arguments for the action' },
              },
              required: ['type', 'args'],
            },
            description: 'List of actions to execute in sequence',
          },
        },
        required: ['actions'],
      },
      description: 'Execute multiple actions in a batch. Reduces round-trips and speeds up task completion. Actions stop on error or blocking condition.',
    } as Anthropic.Messages.Tool,
    {
      name: 'request_verification',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'What action you want to take' },
          reason: { type: 'string', description: 'Why you need human verification' },
          risk_level: { type: 'string', enum: ['medium', 'high', 'critical'], description: 'How risky is this action' },
        },
        required: ['action', 'reason'],
      },
      description: 'Request human verification before a risky action (payments, deletions, bulk emails, etc.).',
    } as Anthropic.Messages.Tool,
    {
      name: 'learning_feedback',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {
          learning: { type: 'string', description: 'The specific learning/tip that was applied' },
          outcome: { type: 'string', enum: ['helped', 'neutral', 'hurt'], description: 'Did applying this learning help, hurt, or have no effect?' },
          notes: { type: 'string', description: 'Brief explanation of why it helped or hurt' },
        },
        required: ['learning', 'outcome'],
      },
      description: 'Record whether a learned tip/pitfall from previous runs helped or hurt. This improves future learning accuracy. Call this whenever you apply knowledge from the "Learned from Previous Runs" section.',
    } as Anthropic.Messages.Tool,
    {
      name: 'apply_research',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {
          tool_name: { type: 'string', description: 'The tool/service the research is about (e.g., gmail, linkedin)' },
          knowledge_applied: { type: 'string', description: 'What specific knowledge from research you are applying' },
          action_taken: { type: 'string', description: 'What action you took based on this knowledge' },
        },
        required: ['tool_name', 'knowledge_applied', 'action_taken'],
      },
      description: 'Record when you apply knowledge from the "Pre-Execution Research" section. This tracks which research is useful.',
    } as Anthropic.Messages.Tool,
    {
      name: 'save_credentials',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {
          service: { type: 'string', description: 'Service name or URL (e.g., "lovable.dev", "stripe.com", "namecheap.com")' },
          username: { type: 'string', description: 'Username or email used to sign up' },
          password: { type: 'string', description: 'Password used for the account' },
        },
        required: ['service', 'username', 'password'],
      },
      description: 'Save login credentials for a web service you signed up for or logged into. These will be available in future sessions so you can log back in. ALWAYS save credentials when you create a new account.',
    } as Anthropic.Messages.Tool,
    {
      name: 'memory_search',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to search for in your memories (semantic search)' },
          limit: { type: 'number', description: 'Max results to return. Default 5.' },
        },
        required: ['query'],
      },
      description: 'Search your long-term memory for relevant information from past sessions. Use this to recall facts, preferences, past decisions, or context about the user/task.',
    } as Anthropic.Messages.Tool,
    {
      name: 'memory_get',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {
          document: { 
            type: 'string', 
            enum: ['soul', 'user_context', 'long_term_memory', 'workspace'],
            description: 'Which memory document to read' 
          },
        },
        required: ['document'],
      },
      description: 'Read a specific memory document. soul = your personality, user_context = facts about the user, long_term_memory = important memories, workspace = current working notes and goal tree.',
    } as Anthropic.Messages.Tool,
    {
      name: 'update_checkpoint',
      type: 'custom',
      input_schema: {
        type: 'object',
        properties: {
          processed_id: { type: 'string', description: 'ID of an item you just processed (email ID, ticket ID, lead name, etc.). Will be added to the "already processed" list so you skip it next run.' },
          counter_name: { type: 'string', description: 'Name of a counter to increment (e.g. "emails_handled", "leads_contacted")' },
          counter_increment: { type: 'number', description: 'Amount to add to the counter. Default 1.' },
          state_key: { type: 'string', description: 'Key for arbitrary state to save (e.g. "last_page_checked")' },
          state_value: { type: 'string', description: 'Value for the state key' },
        },
        required: [],
      },
      description: 'Save progress during a recurring task run. Use this to track processed items, increment counters, or save state so your next run can pick up where you left off. Call this after processing each item.',
    } as Anthropic.Messages.Tool,
  ]

  let hasSemanticSupport = false

  if (isApiOnlyMode) {
    // In API-only mode, strip ALL VM/browser tools — keep only meta tools
    const metaTools = new Set(['web_search', 'report_insight', 'task_complete', 'remember', 'request_verification', 'learning_feedback', 'apply_research', 'save_credentials', 'memory_search', 'memory_get', 'update_checkpoint', 'update_task', 'report_to_board', 'read_agent_data'])
    tools = tools.filter(t => metaTools.has(t.name))
    console.log('[AgentExecutor] API-only mode: stripped VM tools, keeping', tools.length, 'meta tools')
  } else {
    // Check if VM supports semantic browser tools
    hasSemanticSupport = await checkSemanticSupport(config.vmIp)
    console.log('[AgentExecutor] VM semantic browser support:', hasSemanticSupport)

    if (!hasSemanticSupport) {
      const disabledTools = new Set(['click_text', 'type_into', 'wait_for_text', 'get_page_state', 'run_actions'])
      tools = tools.filter(t => !disabledTools.has(t.name))
    } else {
      messages.push({
        role: 'user',
        content:
          '[System] Browser-first reliability policy: Prefer get_page_state for perception and verification. Prefer click_text/type_into/run_actions for interactions. Use screenshots only when necessary (visual-only info, CAPTCHAs, or semantic tools missing). After meaningful actions, verify with get_page_state (preferred) or a screenshot before calling task_complete.',
      })
    }
  }

  // === INJECT INTEGRATION API TOOLS ===
  if (integrationToolset.tools.length > 0) {
    tools = [...tools, ...integrationToolset.tools]
    console.log('[AgentExecutor] Injected', integrationToolset.tools.length, 'integration tools into agent toolset')
    
    const providerList = integrationToolset.providers.map(p => p.toUpperCase()).join(', ')
    const hasAttio = integrationToolset.providers.includes('attio')
    const attioCrmRule = hasAttio ? `
CRM (ATTIO) RULES — follow in order:
STEP 0 (mandatory before first write): Call integration_attio_inspect_workspace. Read available_deal_stages — these are the ONLY valid stage values. Never guess stage names.
  Fallback if inspect fails: call integration_attio_get_deal_stages.
CREATE deal: integration_attio_create_deal with name + stage (exact title from Step 0). Check _verification.confirmed_stage in response — if it differs, report mismatch, do NOT claim success.
MOVE deal: integration_attio_search_deals → record_id, then integration_attio_update_deal with record_id + stage. Verify _verification.confirmed_stage.
NEVER use integration_attio_add_to_pipeline for deals — only for people/companies in list views.
NEVER claim pipeline success without confirmed_stage in tool response.` : ''
    const policyMsg = isApiOnlyMode
      ? `[System] TOOL USAGE RULES:
1. For research, tracking, or information tasks: Use web_search to find real-time data, then report_insight to deliver findings, then task_complete when done.
2. Integration tools (${providerList}) are ONLY for tasks that explicitly require sending emails, posting messages, reading inboxes, managing calendars, or writing to a CRM. Do NOT use them for research or information gathering.
3. If a tool returns an error, do NOT retry it more than once with the same input. Adjust the approach using the error message.
4. Start working immediately with web_search. Do not waste iterations testing APIs that aren't relevant to the task.${attioCrmRule}`
      : `[System] You have integration API tools available for: ${providerList}. Use them ONLY when the task explicitly involves those services (e.g., "send an email", "post to Slack", "add to CRM"). For research, browsing, or information tasks, use web_search or the browser. Never use Gmail/Slack tools to "find information" — use web_search instead.${attioCrmRule}`
    messages.push({ role: 'user', content: policyMsg })
  }

  // === HIERARCHICAL GOAL TREE: Multi-session planning for big tasks ===
  let goalTree: GoalTree | null = null
  let taskPlan: TaskPlan | null = null

  try {
    // Check workspace memory for an existing goal tree from a previous session
    const workspaceContent = await getMemoryDocument(config.agentId, 'workspace')
    const goalTreeMarker = '<!--GOAL_TREE_JSON:'
    const goalTreeEnd = ':GOAL_TREE_JSON-->'
    const markerStart = workspaceContent.indexOf(goalTreeMarker)
    const markerEnd = workspaceContent.indexOf(goalTreeEnd)

    if (markerStart !== -1 && markerEnd !== -1) {
      const treeJson = workspaceContent.slice(markerStart + goalTreeMarker.length, markerEnd)
      goalTree = deserializeGoalTree(treeJson)
      if (goalTree) {
        console.log('[AgentExecutor] Loaded existing goal tree:', goalTree.projects.length, 'projects,',
          'status:', goalTree.overall_status)
      }
    }

    // Generate a new goal tree if this is a big task and we don't have one
    if (!goalTree && needsGoalTree(config.taskDescription)) {
      console.log('[AgentExecutor] Big task detected — generating hierarchical goal tree...')
      await sendProgressUpdate(config.agentId, config.runId, 'progress',
        formatProgressStep({ index: 0, total: 0, label: 'Planning: breaking goal into projects', status: 'running' }))
      goalTree = await generateGoalTree(config.taskDescription)
      console.log('[AgentExecutor] Goal tree generated:', goalTree.projects.length, 'projects')
    }

    if (goalTree) {
      // Get or start the current project
      let currentProject = getCurrentProject(goalTree)
      if (currentProject) {
        if (currentProject.status === 'pending') {
          goalTree = startProject(goalTree, currentProject.id)
          currentProject = getCurrentProject(goalTree)
        }

        if (currentProject) {
          // Run tool discovery for this project
          console.log('[AgentExecutor] Running tool discovery for project:', currentProject.name)
          const discoveredTools = await discoverToolsForProject(currentProject)
          if (discoveredTools.length > 0) {
            currentProject.tools_discovered = discoveredTools
            for (const tool of discoveredTools) {
              goalTree.tool_discoveries[currentProject.name] = tool
            }
            console.log('[AgentExecutor] Discovered tools:', discoveredTools)
          }

          // Convert current project to a TaskPlan (bridges with existing system)
          taskPlan = projectToTaskPlan(currentProject, MAX_ITERATIONS)
          console.log('[AgentExecutor] Current project:', currentProject.name,
            '— tasks:', currentProject.tasks.length)

          // Inject goal tree context into messages
          messages.push({
            role: 'user',
            content: `[System]\n${formatGoalTreeForPrompt(goalTree)}\n\n${buildGoalTreeInstructions()}`,
          })

          const _doneProjects = goalTree.projects.filter(p => p.status === 'completed').length
          await sendProgressUpdate(config.agentId, config.runId, 'progress',
            formatProgressStep({
              index: _doneProjects + 1,
              total: goalTree.projects.length,
              label: currentProject.name,
              status: 'running',
            }))
        }
      } else {
        // All projects done or stuck
        console.log('[AgentExecutor] Goal tree has no executable project — all done or blocked')
        goalTree = null // Fall back to simple planning
      }
    }

    // Fall back to simple single-session planning if no goal tree
    if (!taskPlan) {
      taskPlan = await generateTaskPlan(config.taskDescription, {
        skills: dynamicConfig.requiredCredentials,
        max_steps: MAX_ITERATIONS,
      })
      console.log('[AgentExecutor] Generated simple task plan with', taskPlan.subgoals.length, 'subgoals')
    }
  } catch (error) {
    console.error('[AgentExecutor] Failed to generate task plan:', error)
  }

  // Track recent actions for goal checking
  const recentActions: string[] = []
  let stepsSinceGoalCheck = 0
  const GOAL_CHECK_INTERVAL = 5

  let terminationCompletionPrompted = false

  let lastCompactionIteration = 0

  let lastQueuePollAt = 0

  let continueLoop = true
  let iterationCount = 0

  const maybeDrainRunQueue = async () => {
    const now = Date.now()
    if (now - lastQueuePollAt < 2500) return
    lastQueuePollAt = now

    try {
      const { data: agentRow } = await supabase
        .from('agents')
        .select('config')
        .eq('id', config.agentId)
        .single()

      const currentConfig = (agentRow as { config: Record<string, unknown> } | null)?.config || {}
      const queue = Array.isArray((currentConfig as { run_queue?: unknown }).run_queue)
        ? ((currentConfig as { run_queue: Array<Record<string, unknown>> }).run_queue)
        : []

      if (queue.length === 0) return

      const toConsume = queue.slice(0, 5)
      const remaining = queue.slice(toConsume.length)

      for (const item of toConsume) {
        const mode = typeof (item as { mode?: unknown }).mode === 'string' ? String((item as { mode: string }).mode) : 'collect'
        const content = typeof (item as { content?: unknown }).content === 'string' ? String((item as { content: string }).content).trim() : ''
        if (!content) continue

        const instructionHeader = mode === 'steer'
          ? '[System] New instruction (steer):'
          : mode === 'steer-backlog'
            ? '[System] New instruction (steer-backlog):'
            : mode === 'followup'
              ? '[System] New follow-up instruction:'
              : '[System] New instruction:'

        messages.push({
          role: 'user',
          content: `${instructionHeader}\n${content}\n\nAcknowledge this instruction and adjust your plan accordingly.`,
        })

        await sendProgressUpdate(
          config.agentId,
          config.runId,
          'acknowledgement',
          `Queued instruction applied (${mode}): ${content.slice(0, 160)}${content.length > 160 ? '...' : ''}`
        )
      }

      const existingRunEvents = Array.isArray((currentConfig as Record<string, unknown>).run_events)
        ? ((currentConfig as Record<string, unknown>).run_events as Array<Record<string, unknown>>)
        : []
      const runEvents = [...existingRunEvents]

      const nowIso = new Date().toISOString()
      runEvents.push({
        timestamp: nowIso,
        run_id: config.runId,
        kind: 'lifecycle',
        name: 'run_queue_drained',
        event: 'run_queue_drained',
        data: { consumed: toConsume.length, remaining: remaining.length },
      })

      if (runEvents.length > 200) {
        runEvents.splice(0, runEvents.length - 200)
      }

      const nextConfig: Record<string, unknown> = {
        ...currentConfig,
        run_queue: remaining,
        run_events: runEvents,
      }

      await supabase
        .from('agents')
        .update({ config: nextConfig, last_active: nowIso } as never)
        .eq('id', config.agentId)
    } catch (err) {
      console.error('[AgentExecutor] Failed to drain run queue:', err)
    }
  }

  const attemptStuckRecovery = async (reason: string) => {
    const iterationsSinceAction = lastMeaningfulActionIteration === null ? iterationCount : iterationCount - lastMeaningfulActionIteration

    await sendProgressUpdate(
      config.agentId,
      config.runId,
      'progress',
      `Recovery attempt: ${reason}. Iterations since last meaningful action: ${iterationsSinceAction}.`
    )

    if (!hasSemanticSupport) {
      try {
        const results = await performWebSearch(config.taskDescription, { maxResults: 3 })
        const best = results?.[0]
        if (best?.url) {
          await sendProgressUpdate(config.agentId, config.runId, 'action', `Opening: ${best.url}`, { action_type: 'browse', action_target: best.url })
          await executeComputerAction(config.vmIp, { action: 'hotkey', keys: ['ctrl', 'l'] })
          await new Promise(resolve => setTimeout(resolve, 150))
          await executeComputerAction(config.vmIp, { action: 'hotkey', keys: ['ctrl', 'a'] })
          await new Promise(resolve => setTimeout(resolve, 150))
          await executeComputerAction(config.vmIp, { action: 'type', text: best.url })
          await new Promise(resolve => setTimeout(resolve, 150))
          await executeComputerAction(config.vmIp, { action: 'key', key: 'Return' })
          await new Promise(resolve => setTimeout(resolve, 2500))
          hasPerformedComputerAction = true
          lastMeaningfulActionIteration = iterationCount
          hasVerificationScreenshotAfterAction = false
          return
        }
      } catch {
      }
    }

    await executeComputerAction(config.vmIp, { action: 'hotkey', keys: ['ctrl', 'l'] })
    await new Promise(resolve => setTimeout(resolve, 150))
    await executeComputerAction(config.vmIp, { action: 'hotkey', keys: ['ctrl', 'a'] })
    await new Promise(resolve => setTimeout(resolve, 150))
    await executeComputerAction(config.vmIp, { action: 'type', text: config.taskDescription.slice(0, 200) })
    await new Promise(resolve => setTimeout(resolve, 150))
    await executeComputerAction(config.vmIp, { action: 'key', key: 'Return' })
    await new Promise(resolve => setTimeout(resolve, 2500))
    hasPerformedComputerAction = true
    lastMeaningfulActionIteration = iterationCount
    hasVerificationScreenshotAfterAction = false

    messages.push({
      role: 'user',
      content: `[System] Recovery actions were executed automatically (${reason}). You MUST take a fresh screenshot (or call get_page_state if available) to reassess and continue from the new state.`
    })
  }

  try {
  while (continueLoop && iterationCount < MAX_ITERATIONS) {
    iterationCount++

    // Log elapsed time for observability (no hard timeout — agent runs until task_complete)
    const elapsedTime = Date.now() - executionStartTime
    if (iterationCount % 20 === 0) {
      console.log('[AgentExecutor] Elapsed:', Math.round(elapsedTime / 1000), 'seconds, iteration', iterationCount, '/', MAX_ITERATIONS)
    }

    // Cancellation check: poll agent status from DB every 3 iterations
    if (iterationCount % 3 === 0) {
      try {
        const { data: statusRow } = await supabase
          .from('agents')
          .select('status')
          .eq('id', config.agentId)
          .single()
        const currentStatus = (statusRow as { status: string } | null)?.status
        if (currentStatus && currentStatus !== 'working' && currentStatus !== 'initializing') {
          console.log('[AgentExecutor] CANCELLED: Agent status changed to', currentStatus, '— stopping execution')
          // Save goal tree progress before exiting
          if (goalTree) {
            try {
              const handoff = await generateSessionHandoff(goalTree, [], ['Agent stopped by user'])
              goalTree.handoff_note = handoff
              const ws = await getMemoryDocument(config.agentId, 'workspace')
              const gs = '<!--GOAL_TREE_JSON:', ge = ':GOAL_TREE_JSON-->'
              let cw = ws
              const si = cw.indexOf(gs), ei = cw.indexOf(ge)
              if (si !== -1 && ei !== -1) cw = cw.slice(0, si) + cw.slice(ei + ge.length)
              await updateMemoryDocument(config.agentId, 'workspace', cw.trim() + '\n\n' + handoff + '\n\n' + gs + serializeGoalTree(goalTree) + ge)
              console.log('[AgentExecutor] Goal tree saved on cancellation')
            } catch (err) {
              console.error('[AgentExecutor] Failed to save goal tree on cancel:', err)
            }
          }
          await sendProgressUpdate(config.agentId, config.runId, 'failed', 'Agent stopped by user.')
          await executionContext.release()
          return
        }
      } catch (e) {
        // Non-fatal — continue execution if status check fails
        console.warn('[AgentExecutor] Status check failed:', e)
      }
    }

    await maybeDrainRunQueue()

    pruneToolResultsInMessages(messages)

    // Context window management: Keep only last N message pairs to limit token usage
    // IMPORTANT: Must not break tool_use/tool_result pairs - each tool_result needs
    // its corresponding tool_use in the immediately preceding assistant message
    if (messages.length > MAX_MESSAGES_BEFORE_TRIM) {
      const firstMessage = messages[0] // Keep original task

      const safeCutIndex = findSafeTailStartIndex(messages, MAX_RECENT_MESSAGES)
      const recentMessages = messages.slice(safeCutIndex)
      messages.length = 0
      messages.push(firstMessage, ...recentMessages)
      console.log('[AgentExecutor] Trimmed context to save tokens, kept', recentMessages.length, 'recent messages')
    }

    // Periodic goal check (every GOAL_CHECK_INTERVAL steps)
    stepsSinceGoalCheck++
    if (taskPlan && stepsSinceGoalCheck >= GOAL_CHECK_INTERVAL) {
      stepsSinceGoalCheck = 0
      taskPlan.total_steps_taken = iterationCount
      
      // Get current page state for goal checking
      const currentPageState = hasSemanticSupport ? await getPageState(config.vmIp) : null

      if (currentPageState?.url) {
        if (lastPageUrl === currentPageState.url) {
          consecutiveSameUrl++
        } else {
          consecutiveSameUrl = 0
        }
        lastPageUrl = currentPageState.url

        const blocking = detectBlockingCondition(currentPageState)
        if (blocking.blocked && blocking.reason === 'captcha') {
          // === CAPTCHA PAUSE/RESUME: Wait for user to solve it ===
          console.log('[AgentExecutor] CAPTCHA detected — pausing for user intervention')
          await sendProgressUpdate(
            config.agentId,
            config.runId,
            'blocker',
            '🚫 CAPTCHA detected! Please open the VM view and solve the CAPTCHA manually. Type "continue" when done.'
          )
          
          // Poll for user signal (status change or queue message) for up to 5 minutes
          const captchaTimeout = Date.now() + 5 * 60 * 1000
          let captchaResolved = false
          while (Date.now() < captchaTimeout) {
            await new Promise(resolve => setTimeout(resolve, 5000)) // Poll every 5s
            
            // Check if user sent a continue signal via run queue
            const { data: agentRow } = await supabase
              .from('agents')
              .select('status, config')
              .eq('id', config.agentId)
              .single()
            
            const agentStatus = (agentRow as { status: string } | null)?.status
            if (agentStatus && agentStatus !== 'working' && agentStatus !== 'initializing') {
              // User stopped the agent
              console.log('[AgentExecutor] Agent stopped during CAPTCHA wait')
              if (goalTree) {
                const handoff = await generateSessionHandoff(goalTree, [], ['Stopped during CAPTCHA wait'])
                goalTree.handoff_note = handoff
                const ws = await getMemoryDocument(config.agentId, 'workspace')
                const gs = '<!--GOAL_TREE_JSON:', ge = ':GOAL_TREE_JSON-->'
                let cw = ws
                const si = cw.indexOf(gs), ei = cw.indexOf(ge)
                if (si !== -1 && ei !== -1) cw = cw.slice(0, si) + cw.slice(ei + ge.length)
                await updateMemoryDocument(config.agentId, 'workspace', cw.trim() + '\n\n' + handoff + '\n\n' + gs + serializeGoalTree(goalTree) + ge)
              }
              await sendProgressUpdate(config.agentId, config.runId, 'failed', 'Agent stopped during CAPTCHA wait.')
              await executionContext.release()
              return
            }
            
            // Check run queue for 'continue' signal
            const queueConfig = (agentRow as { config: Record<string, unknown> } | null)?.config || {}
            const queue = Array.isArray((queueConfig as { run_queue?: unknown }).run_queue)
              ? ((queueConfig as { run_queue: Array<Record<string, unknown>> }).run_queue) : []
            const continueSignal = queue.find(item => {
              const msg = String((item as { message?: string }).message || '').toLowerCase()
              return msg.includes('continue') || msg.includes('done') || msg.includes('solved')
            })
            if (continueSignal) {
              // Remove the continue signal from the queue
              const remaining = queue.filter(item => item !== continueSignal)
              await supabase.from('agents').update({
                config: { ...queueConfig, run_queue: remaining },
              } as never).eq('id', config.agentId)
              captchaResolved = true
              break
            }
            
            // Also re-check the page — maybe user already solved it
            const recheckState = await getPageState(config.vmIp)
            if (recheckState && !recheckState.captcha_detected) {
              captchaResolved = true
              break
            }
          }
          
          if (!captchaResolved) {
            await sendProgressUpdate(config.agentId, config.runId, 'failed',
              'CAPTCHA was not solved within 5 minutes. Please solve it in the VM view and re-run the agent.')
            await cleanup('failed', 'CAPTCHA timeout')
            return
          }
          
          console.log('[AgentExecutor] CAPTCHA resolved — resuming execution')
          await sendProgressUpdate(config.agentId, config.runId, 'progress', '✓ CAPTCHA resolved, resuming work...')
        }

        if (blocking.blocked && blocking.reason === 'login_required') {
          await sendProgressUpdate(
            config.agentId,
            config.runId,
            'blocker',
            'Login required to continue. Please ensure credentials are saved for this agent or complete login in the VM, then re-run.'
          )
        }

        const lowerText = (currentPageState.visible_text || '').toLowerCase()
        if (lowerText.includes('before you continue') && (lowerText.includes('google') || lowerText.includes('privacy'))) {
          await clickText(config.vmIp, 'Accept all', { fuzzy: true })
          await clickText(config.vmIp, 'I agree', { fuzzy: true })
          await clickText(config.vmIp, 'Agree', { fuzzy: true })
        }
      }

      const goalCheck = await checkGoalProgress(
        taskPlan,
        currentPageState,
        recentActions,
        GOAL_CHECK_INTERVAL
      )
      
      console.log('[AgentExecutor] Goal check:', goalCheck.current_subgoal_status, '- progress:', goalCheck.progress_percentage + '%')
      
      // Check if we should terminate
      const termination = shouldTerminatePlan(taskPlan)
      if (termination.should_terminate) {
        if (!hasPerformedComputerAction || !hasVerificationScreenshotAfterAction) {
          console.log('[AgentExecutor] Plan termination ignored (needs VM interaction + verification):', termination.reason)
        } else {
          if (!terminationCompletionPrompted) {
            terminationCompletionPrompted = true
            console.log('[AgentExecutor] Plan termination reached; requesting task_complete:', termination.reason)
            await sendProgressUpdate(config.agentId, config.runId, 'progress', 'If you believe the task is complete, call task_complete with a concise summary. Otherwise continue using VM tools and verify with a screenshot.')
            messages.push({
              role: 'user',
              content: 'If you believe the task is complete, call task_complete now with a short summary + what you verified on-screen. Do not stop without calling task_complete.'
            })
          }
        }
      }
      
      // If completed current subgoal, advance
      if (goalCheck.current_subgoal_status === 'completed') {
        taskPlan = advanceToNextSubgoal(taskPlan)
        console.log('[AgentExecutor] Advanced to next subgoal:', taskPlan.current_subgoal_id)
      }
      
      // If stuck, inject guidance
      if (goalCheck.should_replan && goalCheck.suggested_action) {
        const guidanceMessage = formatGoalCheckForPrompt(goalCheck)
        messages.push({
          role: 'user',
          content: `[System] ${guidanceMessage}\n\nPlease adjust your approach.`,
        })
      }
    }

    try {
      console.log('\n[AgentExecutor] ===== Iteration', iterationCount, '/', MAX_ITERATIONS, '=====')
      console.log('[AgentExecutor] Calling Claude API... (messages:', messages.length, ')')

      try {
        // === PRE-COMPACTION MEMORY FLUSH (OpenClaw parity) ===
        // Before compacting, check if we're near the threshold and inject a reminder
        // to save important information to memory before context is summarized
        const currentSize = estimateMessagesCharSize(messages)
        const nearCompaction = currentSize > COMPACTION_CHAR_THRESHOLD * 0.8
        if (nearCompaction && iterationCount - lastCompactionIteration >= COMPACTION_MIN_ITERATION_GAP) {
          messages.push({
            role: 'user',
            content: '[System] Context window nearing compaction. If you have important findings, decisions, credentials, or progress notes that should persist, use the remember or save_credentials tools NOW before context is summarized.',
          })
        }

        const compacted = await maybeCompactMessages({
          messages,
          iterationCount,
          lastCompactionIteration,
          model: primaryModel,
          fallbacks: fallbackModels,
        })
        lastCompactionIteration = compacted.newLastCompactionIteration
        if (compacted.didCompact) {
          await sendProgressUpdate(config.agentId, config.runId, 'progress', 'Context compacted to keep the run stable.')
        }
      } catch (compactionError) {
        console.error('[AgentExecutor] Compaction failed:', compactionError)
      }
      
      // Use Haiku for cost efficiency (~12x cheaper than Sonnet)
      // Switch to 'claude-sonnet-4-20250514' for more complex tasks if needed
      // Add timeout to prevent silent hangs
      const apiCallPromise = createNonStreamingMessageWithFallback({
        model: primaryModel,
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        tools,
      }, {
        fallbacks: fallbackModels,
      })
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Claude API timeout after 120s')), 120000)
      })
      
      const { response } = await Promise.race([apiCallPromise, timeoutPromise])

      console.log('[AgentExecutor] Claude response - stop_reason:', response.stop_reason, 'blocks:', response.content.length)
      
      const assistantContent = response.content
      messages.push({ role: 'assistant', content: assistantContent })

      // Extract any text reasoning and send as progress update so user can see thinking
      const textBlocks = assistantContent.filter(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      )
      
      if (textBlocks.length > 0) {
        const reasoning = textBlocks.map(b => b.text).join('\n')
        if (reasoning.trim()) {
          await sendProgressUpdate(config.agentId, config.runId, 'progress', reasoning)
        }
      }

      const toolUseBlocks = assistantContent.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      )

      if (toolUseBlocks.length === 0) {
        consecutiveNoToolUse++
      } else {
        consecutiveNoToolUse = 0
      }

      console.log('[AgentExecutor] Tool calls:', toolUseBlocks.length > 0 ? toolUseBlocks.map(t => `${t.name}(${JSON.stringify(t.input).slice(0, 50)})`).join(', ') : 'NONE - will complete')

      if (toolUseBlocks.length === 0) {
        if (!hasPerformedApiAction && (!hasPerformedComputerAction || !hasVerificationScreenshotAfterAction)) {
          await sendProgressUpdate(
            config.agentId,
            config.runId,
            'progress',
            'I still need to do meaningful work (use API tools or VM interaction) before I can mark this task complete. Continuing...'
          )

          messages.push({
            role: 'user',
            content: isApiOnlyMode
              ? 'You cannot finish yet. Use the integration_* API tools to accomplish the task, then call task_complete with a summary.'
              : 'You cannot finish yet. Either use integration API tools (integration_*) to accomplish the task, or use VM tools (click/type/scroll) and verify. Then call task_complete.'
          })

          if (!isApiOnlyMode && (consecutiveNoToolUse >= 2 || iterationCount >= 4)) {
            await attemptStuckRecovery(consecutiveNoToolUse >= 2 ? 'no tool calls' : 'no meaningful VM actions yet')
          }

          continueLoop = true
          continue
        }

        await sendProgressUpdate(
          config.agentId,
          config.runId,
          'progress',
          'Don\'t stop without calling task_complete. If you think you\'re done, call task_complete with a short verified summary. Otherwise continue using VM tools.'
        )

        messages.push({
          role: 'user',
          content: isApiOnlyMode
            ? 'Do not stop now. If the task is complete, call task_complete. Otherwise keep using integration_* API tools.'
            : 'Do not stop now. If you believe the task is complete, call task_complete. Otherwise keep working with VM tools and verify with get_page_state (preferred) or a screenshot.'
        })

        if (!isApiOnlyMode && consecutiveNoToolUse >= 2) {
          await attemptStuckRecovery('no tool calls')
        }

        continueLoop = true
        continue
      }
      
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const toolUse of toolUseBlocks) {
        const input = toolUse.input as Record<string, unknown>
        let result: ComputerUseResult
        
        console.log('[AgentExecutor] Executing tool:', toolUse.name, 'with input:', JSON.stringify(input).slice(0, 100))
        
        // Send action update for user-visible actions
        const actionInfo = getActionInfo(toolUse.name, input)
        if (actionInfo) {
          await sendProgressUpdate(config.agentId, config.runId, 'action', actionInfo.message, {
            action_type: actionInfo.type,
            action_target: actionInfo.target,
          })
        }
        
        try {
          // Guard: VM tools are not available in API-only mode
          const vmTools = new Set(['screenshot', 'click', 'type_text', 'key_press', 'scroll', 'click_text', 'type_into', 'wait_for_text', 'get_page_state', 'run_actions'])
          if (isApiOnlyMode && vmTools.has(toolUse.name)) {
            result = { type: 'action_result', data: `Tool "${toolUse.name}" is not available in API-only mode. No browser/VM is connected. Use integration_* API tools instead.`, success: false }
          } else
          switch (toolUse.name) {
            case 'screenshot':
              // Use compressed screenshot for cost savings
              result = await getCompressedScreenshot(config.vmIp)
              // Check for duplicate screenshot to avoid wasting tokens
              const isDuplicate = result.success && result.type === 'screenshot' && isScreenshotDuplicate(result.data)
              if (isDuplicate) {
                console.log('[AgentExecutor] Skipping duplicate screenshot to save tokens')
                result = { type: 'action_result', data: 'Screen unchanged from previous screenshot', success: true }
                consecutiveDuplicateScreenshots++
              } else {
                consecutiveDuplicateScreenshots = 0
              }
              if (result.success && lastMeaningfulActionIteration !== null) {
                hasVerificationScreenshotAfterAction = true
              }
              break
            case 'click':
              result = await executeComputerAction(config.vmIp, { 
                action: 'click', 
                x: input.x, 
                y: input.y, 
                button: input.button || 'left' 
              })
              if (result.success) {
                successfulClickCount++
                if (successfulClickCount >= 3) {
                  hasPerformedComputerAction = true
                  lastMeaningfulActionIteration = iterationCount
                  hasVerificationScreenshotAfterAction = false
                }
              }
              break
            case 'type_text':
              {
                const text = String(input.text ?? '')
                const isUrlLike =
                  /^https?:\/\//i.test(text) ||
                  (!text.includes(' ') && /^[a-z0-9.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(text))

                if (isUrlLike) {
                  await executeComputerAction(config.vmIp, { action: 'hotkey', keys: ['ctrl', 'l'] })
                  await new Promise(resolve => setTimeout(resolve, 100))
                  await executeComputerAction(config.vmIp, { action: 'hotkey', keys: ['ctrl', 'a'] })
                  await new Promise(resolve => setTimeout(resolve, 100))
                }

                result = await executeComputerAction(config.vmIp, { action: 'type', text })
              }
              if (result.success) {
                hasPerformedComputerAction = true
                lastMeaningfulActionIteration = iterationCount
                hasVerificationScreenshotAfterAction = false
              }
              break
            case 'key_press':
              // Handle key combinations (e.g., "ctrl+alt+t") vs single keys (e.g., "Return")
              const keyStr = String(input.key)
              if (keyStr.includes('+')) {
                // Split into separate keys for hotkey action
                const keys = keyStr.split('+').map((k: string) => k.trim())
                console.log('[AgentExecutor] Using hotkey for combination:', keys)
                result = await executeComputerAction(config.vmIp, { action: 'hotkey', keys })
              } else {
                result = await executeComputerAction(config.vmIp, { action: 'key', key: keyStr })
              }
              break
            case 'scroll':
              // VM server expects clicks (positive=up, negative=down)
              const clicks = input.direction === 'up' ? 3 : -3
              result = await executeComputerAction(config.vmIp, { 
                action: 'scroll', 
                x: input.x, 
                y: input.y, 
                clicks 
              })
              if (result.success) {
                hasPerformedComputerAction = true
                lastMeaningfulActionIteration = iterationCount
                hasVerificationScreenshotAfterAction = false
              }
              break
            case 'web_search':
              // Fallback web search when browsing fails
              console.log('[AgentExecutor] Web search:', input.query)
              await sendProgressUpdate(config.agentId, config.runId, 'action', `Searching: ${String(input.query).slice(0, 50)}...`)
              try {
                const searchResults = await performWebSearch(String(input.query), { maxResults: (input.max_results as number) || 5 })
                const formattedResults = searchResults.map((r, i) => 
                  `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`
                ).join('\n\n')
                if (!formattedResults) {
                  result = { type: 'action_result', data: 'No results found. Try a different search query.', success: false }
                } else {
                  result = { type: 'action_result', data: formattedResults, success: true }
                  // Web search counts as meaningful work
                  hasPerformedApiAction = true
                  lastMeaningfulActionIteration = iterationCount
                }
              } catch (searchErr) {
                result = { type: 'action_result', data: `Search failed: ${searchErr}`, success: false }
              }
              break
            case 'report_insight':
              // Send insight to the AI Manager and log it
              const insightMessage = input.source 
                ? `${input.insight}\n\n*Source: ${input.source}*`
                : String(input.insight)
              await sendProgressUpdate(config.agentId, config.runId, 'insight', insightMessage)
              // Also log to daily log
              await appendToDailyLog(config.agentId, `**Insight:** ${String(input.insight).slice(0, 200)}`, true)
              // Smart push notification — behavior engine decides if/when to send
              try {
                const { notifyAgentInsight: pushInsight } = await import('@/lib/push-notifications')
                const insightText = String(input.insight).slice(0, 200)
                const agentName = 'Agent'
                pushInsight(config.userId, agentName, config.agentId, insightText, 'insight', 'normal').catch(() => {})
              } catch { /* push not available */ }
              // Webhook dispatch — notify external systems
              try {
                const { dispatchWebhookEvent } = await import('@/lib/api-platform/webhooks')
                dispatchWebhookEvent(config.userId, 'agent.insight', {
                  agentId: config.agentId,
                  runId: config.runId,
                  insight: String(input.insight).slice(0, 500),
                  source: input.source || null,
                  timestamp: new Date().toISOString(),
                }).catch(() => {})
              } catch { /* webhooks not available */ }
              result = { type: 'action_result', data: 'Insight reported successfully', success: true }
              // Reporting insights counts as meaningful work
              hasPerformedApiAction = true
              lastMeaningfulActionIteration = iterationCount
              break
            case 'remember':
              // Store memory using structured memory system
              const category = input.category as 'user_fact' | 'preference' | 'important' | 'pattern'
              const content = String(input.content)
              console.log('[AgentExecutor] Storing memory:', category, '-', content.slice(0, 50))
              await learnFromInteraction(config.agentId, content, category)
              result = { type: 'action_result', data: 'Memory stored successfully. This will be available in future runs.', success: true }
              break

            case 'save_credentials': {
              // Store web app credentials the agent creates or uses
              const service = String(input.service).toLowerCase().replace(/https?:\/\//, '').replace(/\/$/, '')
              const username = String(input.username)
              const password = String(input.password)
              console.log('[AgentExecutor] Saving credentials for:', service)
              try {
                const { storeCredential } = await import('./credential-manager')
                const credResult = await storeCredential(config.userId, config.agentId, {
                  service,
                  username,
                  password,
                })
                if (credResult.success) {
                  result = { type: 'action_result', data: `Credentials saved for ${service}. You can log in automatically in future sessions.`, success: true }
                  hasPerformedApiAction = true
                  lastMeaningfulActionIteration = iterationCount
                } else {
                  result = { type: 'action_result', data: `Failed to save credentials: ${credResult.error}`, success: false }
                }
              } catch (credErr) {
                console.error('[AgentExecutor] Credential save error:', credErr)
                result = { type: 'action_result', data: 'Failed to save credentials. Encryption key may not be configured.', success: false }
              }
              break
            }

            case 'memory_search': {
              // Search agent's memory (OpenClaw parity: memory_search tool)
              const query = String(input.query)
              const limit = (input.limit as number) || 5
              console.log('[AgentExecutor] Memory search:', query)
              try {
                const memories = await retrieveMemories(config.userId, query, {
                  agentId: config.agentId,
                  taskComplexity: 'medium',
                })
                if (memories.length === 0) {
                  result = { type: 'action_result', data: 'No matching memories found.', success: true }
                } else {
                  const formatted = memories.slice(0, limit).map((m, i) =>
                    `${i + 1}. ${m.content}${m.contextual_description ? `\n   Context: ${m.contextual_description}` : ''}`
                  ).join('\n\n')
                  result = { type: 'action_result', data: `Found ${memories.length} memories:\n\n${formatted}`, success: true }
                }
              } catch (memErr) {
                console.error('[AgentExecutor] Memory search error:', memErr)
                result = { type: 'action_result', data: 'Memory search failed.', success: false }
              }
              break
            }

            case 'memory_get': {
              // Read a specific memory document (OpenClaw parity: memory_get tool)
              const docType = String(input.document) as 'soul' | 'user_context' | 'long_term_memory' | 'workspace'
              console.log('[AgentExecutor] Memory get:', docType)
              try {
                const docContent = await getMemoryDocument(config.agentId, docType)
                if (!docContent || !docContent.trim()) {
                  result = { type: 'action_result', data: `Memory document "${docType}" is empty.`, success: true }
                } else {
                  result = { type: 'action_result', data: docContent.slice(0, 3000), success: true }
                }
              } catch (memErr) {
                console.error('[AgentExecutor] Memory get error:', memErr)
                result = { type: 'action_result', data: 'Failed to read memory document.', success: false }
              }
              break
            }

            case 'update_checkpoint': {
              // Update operational checkpoint mid-run (for recurring tasks)
              if (!operationalCheckpoint) {
                operationalCheckpoint = { last_run_at: new Date().toISOString(), last_run_summary: '', state: {}, processed_ids: [], counters: {} }
              }
              const updates: string[] = []
              if (input.processed_id) {
                operationalCheckpoint.processed_ids.push(String(input.processed_id))
                // Cap at 500 to prevent unbounded growth
                if (operationalCheckpoint.processed_ids.length > 500) {
                  operationalCheckpoint.processed_ids = operationalCheckpoint.processed_ids.slice(-500)
                }
                updates.push(`tracked: ${input.processed_id}`)
              }
              if (input.counter_name) {
                const inc = Number(input.counter_increment) || 1
                operationalCheckpoint.counters[String(input.counter_name)] = (operationalCheckpoint.counters[String(input.counter_name)] || 0) + inc
                updates.push(`${input.counter_name}: ${operationalCheckpoint.counters[String(input.counter_name)]}`)
              }
              if (input.state_key) {
                operationalCheckpoint.state[String(input.state_key)] = String(input.state_value || '')
                updates.push(`saved: ${input.state_key}`)
              }
              result = { type: 'action_result', data: `Checkpoint updated: ${updates.join(', ') || 'no changes'}`, success: true }
              break
            }

            case 'update_task': {
              // Update a task in the agent's checklist
              try {
                const { updateAgentTask } = await import('./agent-workspace')
                const ok = await updateAgentTask(
                  config.agentId,
                  String(input.task_id),
                  input.status as 'in_progress' | 'done' | 'failed' | 'skipped',
                  input.result ? String(input.result) : undefined
                )
                if (ok) {
                  result = { type: 'action_result', data: `Task ${input.task_id} marked as ${input.status}${input.result ? ': ' + input.result : ''}`, success: true }
                  await appendToDailyLog(config.agentId, `Task ${input.task_id}: ${input.status}${input.result ? ' — ' + String(input.result).slice(0, 100) : ''}`)
                } else {
                  result = { type: 'action_result', data: `Task ${input.task_id} not found in checklist. You can still track progress via report_insight.`, success: false }
                }
              } catch (err) {
                result = { type: 'action_result', data: `Failed to update task: ${err}`, success: false }
              }
              break
            }

            case 'report_to_board': {
              // Report a milestone to the main workspace board
              try {
                const { reportToMainBoard } = await import('./agent-workspace')
                const agentName = config.taskDescription.split(' ')[0] || 'Agent' // fallback name
                // Get actual agent name from DB
                const adminDb = createAdminClient()
                const { data: agentRow } = await adminDb.from('agents').select('name, workspace_id').eq('id', config.agentId).single()
                const name = (agentRow as { name: string } | null)?.name || agentName
                const wsId = (agentRow as { workspace_id: string } | null)?.workspace_id || ''

                if (!wsId) {
                  result = { type: 'action_result', data: 'Cannot report to board: workspace not found.', success: false }
                } else {
                  const cardId = await reportToMainBoard(wsId, config.agentId, name, {
                    title: String(input.title),
                    description: String(input.description).slice(0, 2000),
                    column: (input.column as string) || 'done',
                  })
                  if (cardId) {
                    result = { type: 'action_result', data: `Reported to main board: "${input.title}" in ${input.column || 'done'} column. The AI Manager and user can see this.`, success: true }
                    hasPerformedApiAction = true
                    lastMeaningfulActionIteration = iterationCount
                  } else {
                    result = { type: 'action_result', data: 'Failed to report to board.', success: false }
                  }
                }
              } catch (err) {
                result = { type: 'action_result', data: `Failed to report to board: ${err}`, success: false }
              }
              break
            }

            case 'read_agent_data': {
              // Read another agent's findings for cross-agent communication
              try {
                const { findRelatedAgents, readAgentFindings } = await import('./agent-workspace')
                const adminDb = createAdminClient()
                const { data: agentRow } = await adminDb.from('agents').select('workspace_id').eq('id', config.agentId).single()
                const wsId = (agentRow as { workspace_id: string } | null)?.workspace_id || ''

                if (!wsId) {
                  result = { type: 'action_result', data: 'Cannot read agent data: workspace not found.', success: false }
                } else if (input.agent_name === 'all') {
                  // List all related agents with summaries
                  const related = await findRelatedAgents(wsId, config.agentId, config.taskDescription)
                  if (related.length === 0) {
                    result = { type: 'action_result', data: 'No other agents have reported findings yet.', success: true }
                  } else {
                    const summaries = related.map(a => `**${a.name}** (${a.description.slice(0, 60)})\nLast findings: ${a.lastSummary?.slice(0, 300) || 'none'}`).join('\n\n')
                    result = { type: 'action_result', data: `Found ${related.length} agents with data:\n\n${summaries}`, success: true }
                  }
                } else {
                  // Find specific agent by name
                  const { data: targetAgent } = await adminDb.from('agents').select('id, name').eq('workspace_id', wsId).ilike('name', `%${input.agent_name}%`).limit(1).single()
                  if (!targetAgent) {
                    result = { type: 'action_result', data: `Agent "${input.agent_name}" not found. Use agent_name="all" to list available agents.`, success: false }
                  } else {
                    const findings = await readAgentFindings((targetAgent as { id: string }).id)
                    const output = [
                      findings.lastRunSummary ? `**Last run summary:** ${findings.lastRunSummary}` : null,
                      findings.dailyLog ? `**Recent activity:**\n${findings.dailyLog.slice(0, 1000)}` : null,
                      findings.workspace ? `**Workspace data:**\n${findings.workspace.slice(0, 2000)}` : null,
                    ].filter(Boolean).join('\n\n')
                    result = { type: 'action_result', data: output || 'No data available from this agent yet.', success: true }
                  }
                }
              } catch (err) {
                result = { type: 'action_result', data: `Failed to read agent data: ${err}`, success: false }
              }
              break
            }

            case 'task_complete':
              // Gate 1: no meaningful work at all
              if (!hasPerformedApiAction && (!hasPerformedComputerAction || !hasVerificationScreenshotAfterAction)) {
                console.log('[AgentExecutor] task_complete rejected (no meaningful work yet):', input.summary)
                await sendProgressUpdate(
                  config.agentId,
                  config.runId,
                  'progress',
                  hasPerformedComputerAction
                    ? 'I need to verify my work before completing. Taking a verification step...'
                    : 'I can\'t finish yet because I haven\'t done meaningful work. I\'ll continue working.'
                )
                result = {
                  type: 'action_result',
                  data: 'NOT COMPLETE: Before calling task_complete you must either (a) use integration API tools to accomplish the task, OR (b) do meaningful VM work (type/scroll or at least 3 successful clicks) AND verify with get_page_state or a screenshot.',
                  success: false,
                }
                break
              }

              // Gate 2: external write was attempted but not verified — block and require verification
              if (hasAttemptedExternalWrite && !hasVerifiedExternalWrite) {
                console.log('[AgentExecutor] task_complete rejected (unverified external write):', input.summary)
                await sendProgressUpdate(
                  config.agentId,
                  config.runId,
                  'progress',
                  'I attempted an external write but haven\'t confirmed it succeeded. Verifying the result...'
                )
                result = {
                  type: 'action_result',
                  data: 'NOT COMPLETE: You called a write tool (create/update/add) but the response did not contain confirmed verification (record_id or _verification block). You must verify the write succeeded before calling task_complete. Options: (1) check the tool response for _verification.confirmed_stage or record_id, (2) call a search/get tool to confirm the record exists, or (3) report a failure if the write definitively did not work.',
                  success: false,
                }
                break
              }

              // Detect implicit failures: agent calls task_complete but summary reveals it couldn't do the work
              const summaryText = String(input.summary).toLowerCase()
              const isImplicitFailure = /\b(could not access|unable to access|connection (refused|failed|error)|econnrefused|network error|no internet|blocked|captcha|paywall|login required|authentication required|could not (find|retrieve|fetch|load)|failed to (load|fetch|retrieve|access|connect)|access (denied|restricted)|403|404|timeout|timed out|no results found|not available|service unavailable|api (error|call failed|returned an error|did not respond)|http \d{3}|could not confirm|could not verify|not confirmed|not created|not added|wasn't (created|added|saved|updated)|wasn't able to|unable to (create|add|write|update|confirm)|appears empty|workspace (is empty|was empty|appears to be empty)|no (records|entries|deals|companies|people) (found|exist|visible|in)|record (not found|was not created)|nothing (was added|was created|visible|appeared)|unverified|(could not|unable to|failed to) (create|add|write|update|confirm|verify)|api key (not|invalid|missing|incorrect))\b/.test(summaryText)

              if (isImplicitFailure) {
                console.log('[AgentExecutor] task_complete reclassified as failed (implicit failure in summary):', input.summary)
                completedByTaskComplete = false
                await sendProgressUpdate(config.agentId, config.runId, 'failed',
                  formatProgressStep({ index: 0, total: 0, label: 'Task failed', status: 'failed', detail: String(input.summary).slice(0, 300) }))
                result = { type: 'action_result', data: 'Task reclassified as failed due to connectivity/access issues in summary.', success: false }
                break
              }

              console.log('[AgentExecutor] Task completed early by agent:', input.summary)
              completedByTaskComplete = true
              await sendProgressUpdate(config.agentId, config.runId, 'completed', String(input.summary))

              // Smart push notification — behavior engine decides if/when to send
              try {
                const { notifyAgentCompletion: pushComplete } = await import('@/lib/push-notifications')
                pushComplete(config.userId, 'Agent', config.agentId, 'completed', String(input.summary).slice(0, 150)).catch(() => {})
              } catch { /* push not available */ }

              // Webhook dispatch — notify external systems
              try {
                const { dispatchWebhookEvent } = await import('@/lib/api-platform/webhooks')
                dispatchWebhookEvent(config.userId, 'agent.completed', {
                  agentId: config.agentId,
                  runId: config.runId,
                  summary: String(input.summary).slice(0, 500),
                  completedAt: new Date().toISOString(),
                }).catch(() => {})
              } catch { /* webhooks not available */ }
              
              // Store run summary with learnings (Moltbot-style)
              const learnings = (input.learnings as string[]) || []
              const insightsReported = (input.findings_count as number) || 0
              await storeRunSummary(
                config.agentId,
                String(input.summary),
                learnings,
                Array(insightsReported).fill('insight') // Placeholder for insight tracking
              )

              // Persist last_run_summary + last_run_verified to agent config so worker can surface them
              try {
                const { createAdminClient } = await import('@/lib/supabase/admin')
                const adminSb = createAdminClient()
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data: agentCfgRow } = await (adminSb as any).from('agents').select('config').eq('id', config.agentId).single()
                // verified = true when: no external write was attempted (research task), OR write was confirmed
                const runVerified = !hasAttemptedExternalWrite || hasVerifiedExternalWrite
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (adminSb as any).from('agents').update({
                  config: {
                    ...(agentCfgRow?.config || {}),
                    last_run_summary: String(input.summary).slice(0, 500),
                    last_run_verified: runVerified,
                  },
                }).eq('id', config.agentId)
              } catch { /* non-critical */ }

              // === GOAL TREE PERSISTENCE: Save progress & handoff for next session ===
              if (goalTree) {
                try {
                  // Generate session handoff note
                  const accomplishments = [String(input.summary)]
                  const blockers: string[] = []
                  const handoffNote = await generateSessionHandoff(goalTree, accomplishments, blockers)
                  
                  // Advance the current project
                  goalTree = advanceToNextProject(goalTree, handoffNote)
                  goalTree.handoff_note = handoffNote
                  
                  // Save goal tree to workspace memory
                  const existingWorkspace = await getMemoryDocument(config.agentId, 'workspace')
                  const goalTreeMarkerStart = '<!--GOAL_TREE_JSON:'
                  const goalTreeMarkerEnd = ':GOAL_TREE_JSON-->'
                  const serialized = serializeGoalTree(goalTree)
                  
                  // Remove old goal tree from workspace if present
                  let cleanWorkspace = existingWorkspace
                  const oldStart = cleanWorkspace.indexOf(goalTreeMarkerStart)
                  const oldEnd = cleanWorkspace.indexOf(goalTreeMarkerEnd)
                  if (oldStart !== -1 && oldEnd !== -1) {
                    cleanWorkspace = cleanWorkspace.slice(0, oldStart) + cleanWorkspace.slice(oldEnd + goalTreeMarkerEnd.length)
                  }
                  
                  // Append updated goal tree + handoff
                  const updatedWorkspace = cleanWorkspace.trim() + 
                    '\n\n' + handoffNote + 
                    '\n\n' + goalTreeMarkerStart + serialized + goalTreeMarkerEnd
                  await updateMemoryDocument(config.agentId, 'workspace', updatedWorkspace)
                  
                  const nextProject = getCurrentProject(goalTree)
                  if (nextProject) {
                    console.log('[AgentExecutor] Goal tree saved. Next project:', nextProject.name)
                    await sendProgressUpdate(config.agentId, config.runId, 'progress',
                      `Session complete. Next project: ${nextProject.name} (${goalTree.projects.filter(p => p.status === 'completed').length}/${goalTree.projects.length} done)`)
                    
                    // === AUTO-SCHEDULE CONTINUATION: Queue next project run ===
                    try {
                      const nextRunAt = new Date(Date.now() + 30 * 1000).toISOString() // 30 seconds from now
                      const { data: currentAgentData } = await supabase
                        .from('agents')
                        .select('config')
                        .eq('id', config.agentId)
                        .single()
                      const currentConfig = (currentAgentData as { config: Record<string, unknown> } | null)?.config || {}
                      await supabase
                        .from('agents')
                        .update({
                          next_run_at: nextRunAt,
                          config: {
                            ...currentConfig,
                            goal_tree_active: true,
                            auto_continue: true,
                          },
                        } as never)
                        .eq('id', config.agentId)
                      console.log('[AgentExecutor] Auto-scheduled continuation run for:', nextProject.name)
                      await sendProgressUpdate(config.agentId, config.runId, 'progress',
                        `Auto-continuing to next project in 30 seconds: ${nextProject.name}`)
                    } catch (schedErr) {
                      console.error('[AgentExecutor] Failed to auto-schedule continuation:', schedErr)
                    }
                  } else if (goalTree.overall_status === 'completed') {
                    console.log('[AgentExecutor] Goal tree FULLY COMPLETED!')
                    await sendProgressUpdate(config.agentId, config.runId, 'insight',
                      `All ${goalTree.projects.length} projects completed for goal: ${goalTree.original_goal}`)
                  }
                } catch (e) {
                  console.error('[AgentExecutor] Failed to save goal tree:', e)
                }
              }

              // === OPERATIONAL CHECKPOINT: Save run state for recurring tasks ===
              if (taskClassification.isRecurring && taskClassification.playbook) {
                try {
                  const checkpoint: RunCheckpoint = {
                    last_run_at: new Date().toISOString(),
                    last_run_summary: String(input.summary || '').slice(0, 500),
                    state: operationalCheckpoint?.state || {},
                    processed_ids: operationalCheckpoint?.processed_ids || [],
                    counters: operationalCheckpoint?.counters || {},
                  }
                  // Merge any new counters/state the agent may have stored via remember
                  const cpJson = JSON.stringify(checkpoint)
                  const ws = await getMemoryDocument(config.agentId, 'workspace')
                  const cpMarkerS = '<!--RUN_CHECKPOINT:'
                  const cpMarkerE = ':RUN_CHECKPOINT-->'
                  let cleanWs = ws
                  const cpS = cleanWs.indexOf(cpMarkerS)
                  const cpE = cleanWs.indexOf(cpMarkerE)
                  if (cpS !== -1 && cpE !== -1) {
                    cleanWs = cleanWs.slice(0, cpS) + cleanWs.slice(cpE + cpMarkerE.length)
                  }
                  await updateMemoryDocument(config.agentId, 'workspace',
                    cleanWs.trim() + '\n\n' + cpMarkerS + cpJson + cpMarkerE)
                  console.log('[AgentExecutor] Saved operational checkpoint for', taskClassification.category)
                } catch (cpErr) {
                  console.error('[AgentExecutor] Failed to save operational checkpoint:', cpErr)
                }
              }

              await supabase
                .from('agents')
                .update({
                  last_active: new Date().toISOString(),
                } as never)
                .eq('id', config.agentId)
              continueLoop = false
              result = { type: 'action_result', data: 'Task marked complete', success: true }
              break
            
            // === NEW SEMANTIC BROWSER TOOLS ===
            case 'click_text': {
              const clickResult = await clickText(
                config.vmIp,
                String(input.text),
                { nth: input.nth as number, fuzzy: input.fuzzy as boolean }
              )
              if (clickResult.success) {
                hasPerformedComputerAction = true
                lastMeaningfulActionIteration = iterationCount
                hasVerificationScreenshotAfterAction = false
                result = { type: 'action_result', data: `Clicked "${input.text}"${clickResult.matched_element ? ` (matched: ${clickResult.matched_element})` : ''}`, success: true }
              } else {
                result = { type: 'action_result', data: `Failed to click "${input.text}": ${clickResult.error}`, success: false }
              }
              break
            }
            
            case 'type_into': {
              const typeResult = await typeInto(
                config.vmIp,
                String(input.field),
                String(input.text),
                { clear_first: input.clear_first as boolean, submit: input.submit as boolean }
              )
              if (typeResult.success) {
                hasPerformedComputerAction = true
                lastMeaningfulActionIteration = iterationCount
                hasVerificationScreenshotAfterAction = false
                result = { type: 'action_result', data: `Typed into "${input.field}"`, success: true }
              } else {
                result = { type: 'action_result', data: `Failed to type into "${input.field}": ${typeResult.error}`, success: false }
              }
              break
            }
            
            case 'wait_for_text': {
              const waitResult = await waitForText(
                config.vmIp,
                String(input.text),
                { timeout_ms: input.timeout_ms as number }
              )
              if (waitResult.success) {
                result = { type: 'action_result', data: `Text "${input.text}" appeared on page`, success: true }
              } else {
                result = { type: 'action_result', data: `Timeout waiting for "${input.text}": ${waitResult.error}`, success: false }
              }
              break
            }
            
            case 'get_page_state': {
              const pageState = await getPageState(config.vmIp)
              if (pageState) {
                const stateText = formatPageStateForPrompt(pageState)
                // Check for blocking conditions
                const blocking = detectBlockingCondition(pageState)
                if (blocking.blocked) {
                  result = { type: 'action_result', data: `⚠️ BLOCKED: ${blocking.reason}\n\n${stateText}`, success: true }
                } else {
                  result = { type: 'action_result', data: stateText, success: true }
                }

                if (lastMeaningfulActionIteration !== null) {
                  hasVerificationScreenshotAfterAction = true
                }
              } else {
                result = { type: 'action_result', data: 'Failed to get page state - try screenshot instead', success: false }
              }
              break
            }
            
            case 'run_actions': {
              const actions = input.actions as BatchedAction[]
              if (!actions || actions.length === 0) {
                result = { type: 'action_result', data: 'No actions provided', success: false }
                break
              }
              const batchResult = await runActionBatch(config.vmIp, actions)
              if (batchResult.success) {
                hasPerformedComputerAction = true
                lastMeaningfulActionIteration = iterationCount
                hasVerificationScreenshotAfterAction = false
                result = { 
                  type: 'action_result', 
                  data: `Completed ${batchResult.actions_completed}/${batchResult.actions_total} actions.\n\nFinal state:\n${JSON.stringify(batchResult.final_state, null, 2)}`, 
                  success: true 
                }
              } else {
                result = { 
                  type: 'action_result', 
                  data: `Batch stopped at action ${batchResult.actions_completed + 1}/${batchResult.actions_total}. ${batchResult.stopped_at ? `Reason: ${batchResult.stopped_at}` : ''}\nErrors: ${batchResult.errors.join(', ')}`, 
                  success: false 
                }
              }
              break
            }
            
            case 'request_verification': {
              // Pause for human verification
              const riskLevel = input.risk_level || 'high'
              console.log('[AgentExecutor] Verification requested:', input.action, '- risk:', riskLevel)
              await sendProgressUpdate(config.agentId, config.runId, 'progress', 
                `⚠️ **Verification Required** (${riskLevel} risk)\n\nAction: ${input.action}\nReason: ${input.reason}\n\n_Waiting for approval..._`
              )
              // For now, auto-decline critical actions, approve others
              if (riskLevel === 'critical') {
                result = { type: 'action_result', data: 'DENIED: Critical risk actions require manual approval in the app. Please notify the user.', success: false }
              } else {
                result = { type: 'action_result', data: 'APPROVED: Proceed with caution. Double-check recipients/targets before final execution.', success: true }
              }
              break
            }
            
            case 'learning_feedback': {
              // Record feedback about whether a learning helped
              const outcome = input.outcome as 'helped' | 'neutral' | 'hurt'
              const learning = String(input.learning)
              const notes = input.notes ? String(input.notes) : undefined
              
              console.log('[AgentExecutor] Learning feedback:', outcome, '-', learning.slice(0, 50))
              
              // Record the application and outcome
              const appId = await recordLearningApplication(
                config.agentId,
                config.userId,
                patternId || null,
                outcome === 'helped' ? 'tip' : 'pitfall_avoided',
                learning,
                'pattern',
                config.taskDescription,
                iterationCount
              )
              
              if (appId) {
                await recordLearningOutcome(appId, outcome, notes)
              }
              
              result = { 
                type: 'action_result', 
                data: `Feedback recorded: "${learning.slice(0, 50)}..." ${outcome === 'helped' ? 'helped ✓' : outcome === 'hurt' ? 'hurt ✗' : 'was neutral'}. This improves future runs.`, 
                success: true 
              }
              break
            }
            
            case 'apply_research': {
              // Record when research knowledge is applied
              const toolName = String(input.tool_name)
              const knowledge = String(input.knowledge_applied)
              const action = String(input.action_taken)
              
              console.log('[AgentExecutor] Research applied:', toolName, '-', knowledge.slice(0, 50))
              
              await recordLearningApplication(
                config.agentId,
                config.userId,
                patternId || null,
                'research_applied',
                `${toolName}: ${knowledge}`,
                'research',
                config.taskDescription,
                iterationCount
              )
              
              result = { 
                type: 'action_result', 
                data: `Research applied for ${toolName}: ${action.slice(0, 100)}. Continue with your task.`, 
                success: true 
              }
              break
            }
            
            default: {
              // Check if this is an integration API tool
              if (integrationToolset.toolMap.has(toolUse.name)) {
                console.log('[AgentExecutor] Executing integration tool:', toolUse.name)
                const apiResult: IntegrationToolResult = await executeAgentIntegrationTool(
                  toolUse.name,
                  input,
                  integrationToolset.toolMap,
                  config.userId
                )
                result = { type: 'action_result', data: apiResult.data, success: apiResult.success }
                // All integration calls count as meaningful API activity (reads + writes)
                if (apiResult.success) {
                  hasPerformedApiAction = true
                  lastMeaningfulActionIteration = iterationCount
                  hasVerificationScreenshotAfterAction = true
                }
                // Track external write attempts and verified writes separately
                if (apiResult.operation_kind === 'write') {
                  hasAttemptedExternalWrite = true
                  if (apiResult.verified_write) {
                    hasVerifiedExternalWrite = true
                    console.log('[AgentExecutor] Verified external write confirmed by tool:', toolUse.name)
                  } else if (apiResult.success) {
                    console.log('[AgentExecutor] Write tool succeeded but write not yet verified:', toolUse.name)
                  }
                }
              } else {
                result = { type: 'action_result', data: 'Unknown tool', success: false }
              }
              break
            }
          }
          
          // Track action for goal checking
          recentActions.push(`${toolUse.name}(${JSON.stringify(input).slice(0, 50)})`)
          
          // Track step for learning system
          executionSteps.push({
            tool: toolUse.name,
            input: input,
            result: result.data?.slice?.(0, 200) || String(result.data).slice(0, 200),
            success: result.success,
            duration_ms: 0, // TODO: track actual duration
          })
          
          // === EVIDENCE BUNDLE: Record step receipt ===
          if (evidenceBundleId) {
            recordStepReceipt(
              evidenceBundleId,
              iterationCount,
              `${toolUse.name}(${JSON.stringify(input).slice(0, 50)})`,
              toolUse.name,
              result.data?.slice?.(0, 200) || String(result.data).slice(0, 200),
              result.success
            ).catch(err => console.error('[AgentExecutor] Step receipt error:', err))
            
            // Record confirmations for success indicators
            const successIndicators = ['sent', 'saved', 'created', 'updated', 'success', 'completed', 'posted']
            const resultLower = (result.data || '').toLowerCase()
            for (const indicator of successIndicators) {
              if (resultLower.includes(indicator)) {
                recordConfirmation(evidenceBundleId, indicator, toolUse.name)
                  .catch(err => console.error('[AgentExecutor] Confirmation error:', err))
                break
              }
            }
          }
          
          if (result.type === 'screenshot') {
            // Fetch current config to merge (don't overwrite other fields!)
            const { data: currentAgent } = await supabase
              .from('agents')
              .select('config')
              .eq('id', config.agentId)
              .single()
            
            const currentConfig = (currentAgent as { config: Record<string, unknown> } | null)?.config || {}
            
            await supabase
              .from('agents')
              .update({
                last_active: new Date().toISOString(),
                config: { ...currentConfig, last_screenshot: result.data },
              } as never)
              .eq('id', config.agentId)
          }

          console.log('[AgentExecutor] Tool result:', toolUse.name, '- success:', result.success, result.type === 'screenshot' ? '(screenshot data)' : result.data?.slice?.(0, 50) || result.data)
          
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result.type === 'screenshot' 
              ? [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: result.data } }]
              : result.data,
            ...(result.success === false ? { is_error: true } : {}),
          })
        } catch (toolError) {
          console.error('Tool execution error:', toolError)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Error: ${toolError instanceof Error ? toolError.message : 'Unknown error'}`,
            is_error: true,
          })
        }
      }

      console.log('[AgentExecutor] All tools executed, adding', toolResults.length, 'results to messages')
      messages.push({ role: 'user', content: toolResults })

      const iterationsSinceAction = lastMeaningfulActionIteration === null ? iterationCount : iterationCount - lastMeaningfulActionIteration
      if (
        consecutiveNoToolUse >= 2 ||
        consecutiveDuplicateScreenshots >= 4 ||
        consecutiveSameUrl >= 3 ||
        (lastMeaningfulActionIteration === null ? iterationCount >= 4 : iterationsSinceAction >= 12)
      ) {
        await attemptStuckRecovery(
          consecutiveNoToolUse >= 2
            ? 'model produced no tool calls'
            : consecutiveDuplicateScreenshots >= 4
            ? 'repeated identical screenshots'
            : consecutiveSameUrl >= 3
            ? 'URL not changing'
            : 'no meaningful action for too long'
        )
      }

      if (response.stop_reason === 'end_turn' && toolUseBlocks.length === 0) {
        continueLoop = false
      }
      
      console.log('[AgentExecutor] Iteration', iterationCount, 'complete, continuing:', continueLoop)

    } catch (error) {
      console.error('\n[AgentExecutor] !!!!! EXECUTION ERROR !!!!!')
      console.error('[AgentExecutor] Error:', error)
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      // Send failed progress update
      await sendProgressUpdate(config.agentId, config.runId, 'failed', `Task failed: ${errorMessage}`)
      
      const { data: agentRow } = await supabase
        .from('agents')
        .select('config')
        .eq('id', config.agentId)
        .single()

      const existingConfig = (agentRow as { config: Record<string, unknown> } | null)?.config || {}

      await supabase
        .from('agents')
        .update({
          status: 'failed',
          config: { ...existingConfig, execution_started: false, active_run_id: null, last_error: errorMessage, last_error_at: new Date().toISOString() },
        } as never)
        .eq('id', config.agentId)
      
      console.log('[AgentExecutor] Agent marked as failed, re-throwing error')
      throw error
    }
  }

  console.log('\n[AgentExecutor] ===== LOOP ENDED =====')
  console.log('[AgentExecutor] Total iterations:', iterationCount)

  // === Save goal tree on ANY exit path (so multi-session progress is never lost) ===
  const saveGoalTreeOnExit = async (reason: string) => {
    if (!goalTree) return
    try {
      const handoff = await generateSessionHandoff(goalTree, [], [reason])
      goalTree.handoff_note = handoff
      const existingWs = await getMemoryDocument(config.agentId, 'workspace')
      const gtStart = '<!--GOAL_TREE_JSON:'
      const gtEnd = ':GOAL_TREE_JSON-->'
      let cleanWs = existingWs
      const s = cleanWs.indexOf(gtStart)
      const e = cleanWs.indexOf(gtEnd)
      if (s !== -1 && e !== -1) cleanWs = cleanWs.slice(0, s) + cleanWs.slice(e + gtEnd.length)
      const updated = cleanWs.trim() + '\n\n' + handoff + '\n\n' + gtStart + serializeGoalTree(goalTree) + gtEnd
      await updateMemoryDocument(config.agentId, 'workspace', updated)
      console.log('[AgentExecutor] Goal tree saved on exit:', reason)
    } catch (err) {
      console.error('[AgentExecutor] Failed to save goal tree on exit:', err)
    }
  }

  if (iterationCount >= MAX_ITERATIONS) {
    if (!completedByTaskComplete) {
      const message = 'Stopped: maximum steps reached before completing the task. The agent did not reach a verified completion state.'
      await maybeCreateFailureHandoff(message)
      await saveGoalTreeOnExit('Max iterations reached — session incomplete')
      await sendProgressUpdate(config.agentId, config.runId, 'failed', message)
      await cleanup('failed', message)
      return
    }
  }

  if (!completedByTaskComplete) {
    const message = 'Stopped: execution ended without a verified task_complete. The agent did not reach a completed state.'
    await maybeCreateFailureHandoff(message)
    await saveGoalTreeOnExit('Session ended without task_complete')
    await sendProgressUpdate(config.agentId, config.runId, 'failed', message)
    await cleanup('failed', message)
    return
  }
  
  // Update reflection context with final stats
  reflectionContext.completed = completedByTaskComplete
  reflectionContext.iterationsUsed = iterationCount
  
  // === QUALITY GATES: Run quality checks before marking complete ===
  console.log('[AgentExecutor] Running quality gate checks...')
  const finalPageState = await getPageState(config.vmIp)
  const qaResult = await runQualityGateChecks(
    config.agentId,
    config.taskDescription,
    finalPageState,
    {
      insightsReported: reflectionContext.insightsReported,
      errorsEncountered: reflectionContext.errorsEncountered,
    }
  )
  console.log('[AgentExecutor] Quality gate result:', qaResult.qa_status, '- score:', Math.round(qaResult.overall_score * 100) + '%')
  
  // Check if quality gates block completion
  const qaBlock = shouldBlockCompletion(qaResult)
  if (qaBlock.block) {
    console.log('[AgentExecutor] Quality gate blocked completion:', qaBlock.reason)
    await sendProgressUpdate(config.agentId, config.runId, 'progress', 
      `⚠️ Quality check: ${qaBlock.reason}\n\nThe task may need additional verification.`
    )
  }
  
  // === FINALIZE EVIDENCE BUNDLE ===
  if (evidenceBundleId && finalPageState) {
    console.log('[AgentExecutor] Finalizing evidence bundle...')
    const evidenceBundle = await finalizeEvidenceBundle(
      evidenceBundleId,
      {
        url: finalPageState.url,
        title: finalPageState.title,
        visible_text: finalPageState.visible_text,
        errors: finalPageState.errors,
      },
      config.taskDescription
    )
    
    if (evidenceBundle) {
      // Send evidence bundle summary to user
      const evidenceSummary = formatEvidenceBundleForDisplay(evidenceBundle)
      await sendProgressUpdate(config.agentId, config.runId, 'insight', evidenceSummary)
      console.log('[AgentExecutor] Evidence bundle finalized - quality:', Math.round((evidenceBundle.evidence_quality_score || 0) * 100) + '%')
    }
  }
  
  // === COMPILE SKILL MACRO: If pattern is high-confidence, compile to macro ===
  if (patternId && reflectionContext.completed && executionSteps.length >= 5) {
    // 20% chance to attempt macro compilation on successful runs
    if (Math.random() < 0.2) {
      compilePatternToMacro(config.userId, patternId)
        .then(macro => {
          if (macro) {
            console.log('[AgentExecutor] Compiled new skill macro:', macro.name)
          }
        })
        .catch(err => console.error('[AgentExecutor] Macro compilation error:', err))
    }
  }
  
  // Post-run processing: Self-reflection and memory curation
  console.log('[AgentExecutor] Running post-run processing...')
  
  // === RECORD EXECUTION FOR LEARNING SYSTEM ===
  const executionDuration = (Date.now() - executionStartTime) / 1000
  const executionStatus = reflectionContext.completed ? 'completed' : 'failed'
  
  if (patternId) {
    recordExecutionRun(
      patternId,
      config.agentId,
      config.userId,
      config.taskDescription,
      executionSteps,
      executionStatus,
      executionDuration,
      0 // tokens used - would need to track this
    ).then(() => {
      console.log('[AgentExecutor] Execution recorded for learning - steps:', executionSteps.length)
      
      // Generate improvement suggestions after a few runs
      if (executionSteps.length > 5) {
        generateImprovementSuggestions(config.userId, config.agentId, patternId)
          .catch(err => console.error('[AgentExecutor] Improvement suggestions error:', err))
      }
    }).catch(err => console.error('[AgentExecutor] Recording execution error:', err))
  }
  
  // === LEARNING FEEDBACK LOOP: Prune bad learnings, promote good ones ===
  // Run periodically (every 10th run or so) to optimize the knowledge base
  if (Math.random() < 0.1) { // 10% chance to run optimization
    console.log('[AgentExecutor] Running learning optimization...')
    
    // Remove learnings that consistently hurt performance
    pruneHarmfulLearnings(config.userId, 3)
      .then(pruned => {
        if (pruned > 0) {
          console.log('[AgentExecutor] Pruned', pruned, 'harmful learnings')
        }
      })
      .catch(err => console.error('[AgentExecutor] Prune error:', err))
    
    // Promote highly effective learnings to shared knowledge
    promoteEffectiveLearnings(config.userId, 5)
      .then(promoted => {
        if (promoted > 0) {
          console.log('[AgentExecutor] Promoted', promoted, 'effective learnings to shared knowledge')
        }
      })
      .catch(err => console.error('[AgentExecutor] Promote error:', err))
  }
  
  // Generate self-reflection (async, don't block completion)
  generateSelfReflection(config.agentId, reflectionContext)
    .then(reflection => {
      if (reflection) {
        console.log('[AgentExecutor] Self-reflection generated - rating:', reflection.successRating)
      }
    })
    .catch(err => console.error('[AgentExecutor] Self-reflection error:', err))
  
  // === COLLABORATION: Update agent capabilities ===
  for (const skill of detectedTools) {
    updateAgentCapability(
      config.agentId,
      skill,
      reflectionContext.completed,
      executionDuration
    ).catch(err => console.error('[AgentExecutor] Capability update error:', err))
  }
  
  // === LEARNING NETWORK: Broadcast significant learnings ===
  // Check if we learned something worth sharing
  if (reflectionContext.completed && executionSteps.length > 3) {
    const lastSuccessfulSteps = executionSteps.filter(s => s.success).slice(-3)
    for (const step of lastSuccessfulSteps) {
      detectLearnableMoment(config.agentId, config.userId, {
        taskDescription: config.taskDescription,
        skillCategory: detectedTools[0] || 'general',
        action: step.tool,
        result: step.result,
        success: step.success,
      }).then(async (detection) => {
        if (detection.shouldBroadcast && detection.learning) {
          await broadcastLearning(config.agentId, config.userId, {
            type: detection.learning.type,
            skillCategory: detectedTools[0] || 'general',
            title: detection.learning.title,
            content: detection.learning.content,
            taskContext: config.taskDescription,
          })
          console.log('[AgentExecutor] Broadcasted learning:', detection.learning.title)
        }
      }).catch(err => console.error('[AgentExecutor] Learning broadcast error:', err))
    }
  }
  
  // === FAILURE PATTERNS: Record failures for pattern analysis ===
  if (!reflectionContext.completed && reflectionContext.errorsEncountered.length > 0) {
    for (const error of reflectionContext.errorsEncountered.slice(0, 3)) {
      analyzeFailure(config.userId, config.agentId, {
        errorType: 'execution_error',
        errorMessage: error,
        skillCategory: detectedTools[0],
        taskContext: config.taskDescription,
      }).catch(err => console.error('[AgentExecutor] Failure analysis error:', err))
    }
  }
  
  // Get agent name for curation
  const { data: agentData } = await supabase
    .from('agents')
    .select('name')
    .eq('id', config.agentId)
    .single()
  
  const agentName = (agentData as { name: string } | null)?.name || 'Agent'
  
  // Curate learnings (async, don't block completion)
  curateAgentLearnings(config.agentId, agentName)
    .then(result => {
      if (result.updatedMemory) {
        console.log('[AgentExecutor] Memory curated - kept:', result.keptLearnings.length, 'shared:', result.sharedToUser.length)
      }
    })
    .catch(err => console.error('[AgentExecutor] Memory curation error:', err))
  
  // Successful completion - release lock
  await cleanup('completed')
  
  } catch (outerError) {
    // Catch any unhandled errors and ensure cleanup
    console.error('[AgentExecutor] Unhandled error:', outerError)
    await maybeCreateFailureHandoff(outerError instanceof Error ? outerError.message : 'Unknown error')
    await cleanup('failed', outerError instanceof Error ? outerError.message : 'Unknown error')
    throw outerError
  }
}

async function executeComputerAction(
  vmIp: string,
  action: Record<string, unknown>
): Promise<ComputerUseResult> {
  const actionType = action.action as string

  if (actionType === 'hotkey') {
    const keysRaw = action.keys
    if (Array.isArray(keysRaw)) {
      const keys = keysRaw.map(k => String(k).trim().toLowerCase())
      const hasModifier = keys.includes('ctrl') || keys.includes('cmd') || keys.includes('meta') || keys.includes('command')
      const isNewTab = hasModifier && keys.includes('t')
      if (isNewTab) {
        return {
          type: 'action_result',
          data: 'Blocked hotkey (new tab). Do not open new tabs. Use ctrl+l to focus the address bar and type the URL in the current tab.',
          success: false,
        }
      }
    }
  }
  
  try {
    const ip = vmIp.trim()
    const response = await fetch(`http://${ip}:8080/computer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      throw new Error(`VM action failed: ${response.status}`)
    }

    const result = await response.json()

    if (actionType === 'screenshot') {
      return {
        type: 'screenshot',
        data: result.screenshot,
        success: true,
      }
    }

    return {
      type: 'action_result',
      data: result.message || 'Action completed',
      success: true,
    }
  } catch (error) {
    console.error('Computer action error:', error)
    return {
      type: 'action_result',
      data: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      success: false,
    }
  }
}

