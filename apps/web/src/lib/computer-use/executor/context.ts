/**
 * Context Management
 * Handles message pruning and context compaction for the agent executor
 */

import { createHash } from 'crypto'
import type Anthropic from '@anthropic-ai/sdk'
import {
  MAX_RECENT_MESSAGES,
  MAX_MESSAGES_BEFORE_TRIM,
  MAX_SCREENSHOTS_TO_KEEP,
  MAX_TOOL_TEXT_CHARS,
  MAX_TOOL_JSON_CHARS,
  COMPACTION_CHAR_THRESHOLD,
  COMPACTION_MIN_ITERATION_GAP,
  SCREENSHOT_HASH_SAMPLE_SIZE,
} from './constants'
import { isToolResultMessage, hasImageContent } from './types'
import type { PruneResult, CompactionResult } from './types'
import { createNonStreamingMessageWithFallback, extractTextFromResponse } from '@/lib/ai/ai-client'

// Track last screenshot hash for deduplication
let lastScreenshotHash: string | null = null

/**
 * Generate hash for screenshot deduplication
 */
export function hashScreenshot(base64Data: string): string {
  const sample = base64Data.slice(0, SCREENSHOT_HASH_SAMPLE_SIZE)
  return createHash('md5').update(sample).digest('hex')
}

/**
 * Check if screenshot is a duplicate of the previous one
 */
export function isScreenshotDuplicate(base64Data: string): boolean {
  const currentHash = hashScreenshot(base64Data)
  if (lastScreenshotHash === currentHash) {
    return true
  }
  lastScreenshotHash = currentHash
  return false
}

/**
 * Reset screenshot hash tracking (e.g., for new agent runs)
 */
export function resetScreenshotHash(): void {
  lastScreenshotHash = null
}

/**
 * Prune tool results in messages to manage context window size
 * - Keeps only the most recent screenshot
 * - Truncates long text outputs
 * - Truncates large JSON outputs
 */
export function pruneToolResultsInMessages(
  messages: Anthropic.MessageParam[]
): PruneResult {
  let prunedBlocks = 0
  let prunedScreenshots = 0
  let screenshotsKept = 0

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!isToolResultMessage(msg)) continue

    const blocks = msg.content
    for (let b = 0; b < blocks.length; b++) {
      const block = blocks[b]

      const isScreenshot = hasImageContent(block.content)
      if (isScreenshot) {
        if (screenshotsKept < MAX_SCREENSHOTS_TO_KEEP) {
          screenshotsKept++
        } else {
          // Replace with truncated version
          blocks.splice(b, 1, {
            type: 'tool_result',
            tool_use_id: block.tool_use_id,
            content: 'Screenshot omitted to keep context healthy.',
            is_error: block.is_error,
          })
          prunedBlocks++
          prunedScreenshots++
        }
        continue
      }

      if (typeof block.content === 'string') {
        const trimmed = block.content.trim()
        if (trimmed.length > MAX_TOOL_TEXT_CHARS) {
          blocks.splice(b, 1, {
            type: 'tool_result',
            tool_use_id: block.tool_use_id,
            content: `${trimmed.slice(0, MAX_TOOL_TEXT_CHARS)}\n\n[...truncated...]`,
            is_error: block.is_error,
          })
          prunedBlocks++
        }
        continue
      }

      const asJson = JSON.stringify(block.content)
      if (asJson.length > MAX_TOOL_JSON_CHARS) {
        blocks.splice(b, 1, {
          type: 'tool_result',
          tool_use_id: block.tool_use_id,
          content: `${asJson.slice(0, MAX_TOOL_JSON_CHARS)}\n\n[...truncated...]`,
          is_error: block.is_error,
        })
        prunedBlocks++
      }
    }
  }

  return { prunedBlocks, prunedScreenshots }
}

/**
 * Estimate character size of messages for compaction decision
 */
export function estimateMessagesCharSize(messages: Anthropic.MessageParam[]): number {
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
        total +=
          typeof (part as { text?: unknown }).text === 'string'
            ? (part as { text: string }).text.length
            : 0
        continue
      }

      if (t === 'tool_use') {
        const name =
          typeof (part as { name?: unknown }).name === 'string'
            ? String((part as { name: string }).name)
            : ''
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
          total += 2000 // Approximate image size
        } else {
          total += JSON.stringify(trContent).length
        }
      }
    }
  }

  return total
}

/**
 * Find safe index to start keeping messages from tail
 * Ensures we don't break tool_use/tool_result pairs
 */
export function findSafeTailStartIndex(
  messages: Anthropic.MessageParam[],
  keepLast: number
): number {
  let start = Math.max(1, messages.length - keepLast)

  while (start > 1) {
    const msg = messages[start]
    if ((msg as { role?: unknown }).role === 'assistant') return start
    if (!isToolResultMessage(msg)) return start
    start--
  }

  return 1
}

/**
 * Render messages for compaction summary
 */
export function renderMessagesForCompaction(
  messages: Anthropic.MessageParam[]
): string {
  const lines: string[] = []

  for (const msg of messages) {
    const role =
      (msg as { role?: unknown }).role === 'assistant' ? 'assistant' : 'user'
    const content = (msg as { content?: unknown }).content

    if (typeof content === 'string') {
      const c = content.trim()
      if (c) lines.push(`${role.toUpperCase()}: ${c}`)
      continue
    }

    if (Array.isArray(content)) {
      const parts: string[] = []

      // Check if all content items are tool result blocks
      const allToolResults = content.every(
        (item): item is { type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean } => {
          if (!item || typeof item !== 'object') return false
          return (item as { type?: unknown }).type === 'tool_result' && 
                 typeof (item as { tool_use_id?: unknown }).tool_use_id === 'string'
        }
      )

      if (allToolResults) {
        for (const block of content) {
          const isScreenshot = hasImageContent(block.content)
          if (isScreenshot) {
            parts.push(`TOOL_RESULT(${block.tool_use_id}): [image]`)
          } else if (typeof block.content === 'string') {
            const txt = block.content.trim()
            parts.push(`TOOL_RESULT(${block.tool_use_id}): ${txt.slice(0, 600)}`)
          } else {
            parts.push(
              `TOOL_RESULT(${block.tool_use_id}): ${JSON.stringify(
                block.content
              ).slice(0, 600)}`
            )
          }
        }
      } else {
        for (const part of content) {
          if (!part || typeof part !== 'object') continue
          const t = (part as { type?: unknown }).type
          if (t === 'text') {
            const txt =
              typeof (part as { text?: unknown }).text === 'string'
                ? (part as { text: string }).text.trim()
                : ''
            if (txt) parts.push(txt.slice(0, 1200))
          } else if (t === 'tool_use') {
            const name =
              typeof (part as { name?: unknown }).name === 'string'
                ? String((part as { name: string }).name)
                : 'tool'
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

/**
 * Compact messages when context window gets too large
 * Uses LLM to summarize older messages
 */
export async function maybeCompactMessages(args: {
  messages: Anthropic.MessageParam[]
  iterationCount: number
  lastCompactionIteration: number
  model: string
  fallbacks: string[]
}): Promise<CompactionResult> {
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
  const { response } = await createNonStreamingMessageWithFallback(
    {
      model,
      max_tokens: 900,
      messages: [
        {
          role: 'user',
          content: `Summarize the following agent run context for continued execution. Preserve concrete facts, decisions made, current state, what has been tried, what worked/failed, and what to do next. Be concise but actionable.\n\n${compactSource}`,
        },
      ],
    },
    { fallbacks }
  )

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
