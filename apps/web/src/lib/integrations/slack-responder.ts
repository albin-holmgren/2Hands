/**
 * Slack Integration Responder
 *
 * Lightweight LLM responder for inbound Slack messages.
 * Loads conversation history, generates a response via the AI client,
 * stores it as an assistant message, and sends it back to Slack.
 *
 * Features:
 * - Per-connection configurable system prompt
 * - Rate limiting to prevent LLM cost runaway
 * - Typing indicator while generating
 * - Message chunking for long responses (>3900 chars)
 * - Error reply to Slack on failure
 * - Context window limiting (last 30 messages, trimmed to ~6000 chars)
 */

import { createAdminClient } from '@/lib/supabase/admin'
import crypto from 'crypto'

export interface SlackResponderParams {
  conversationId: string
  connectionId: string
  userId: string
  channelId: string
  threadTs: string | null
  messageTs: string | null
  isDm: boolean
}

// --- Rate limiter (in-memory, per-connection, resets every 60s) ---
const rateBuckets = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_PER_MINUTE = 10
const RATE_LIMIT_WINDOW_MS = 60_000

function checkResponderRateLimit(connectionId: string): boolean {
  const now = Date.now()
  const bucket = rateBuckets.get(connectionId)
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(connectionId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (bucket.count >= RATE_LIMIT_PER_MINUTE) {
    return false
  }
  bucket.count++
  return true
}

// --- Slack API helpers ---
const SLACK_MAX_MSG_LENGTH = 3900

async function slackPost(
  method: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; error?: string; data?: Record<string, unknown> }> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!data) return { ok: false, error: `HTTP ${res.status}` }
  return {
    ok: Boolean(data.ok),
    error: typeof data.error === 'string' ? data.error : undefined,
    data: data,
  }
}

function splitMessage(text: string): string[] {
  if (text.length <= SLACK_MAX_MSG_LENGTH) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= SLACK_MAX_MSG_LENGTH) {
      chunks.push(remaining)
      break
    }

    // Try to split at a paragraph break, then newline, then space
    let splitIdx = remaining.lastIndexOf('\n\n', SLACK_MAX_MSG_LENGTH)
    if (splitIdx < SLACK_MAX_MSG_LENGTH * 0.3) {
      splitIdx = remaining.lastIndexOf('\n', SLACK_MAX_MSG_LENGTH)
    }
    if (splitIdx < SLACK_MAX_MSG_LENGTH * 0.3) {
      splitIdx = remaining.lastIndexOf(' ', SLACK_MAX_MSG_LENGTH)
    }
    if (splitIdx < SLACK_MAX_MSG_LENGTH * 0.3) {
      splitIdx = SLACK_MAX_MSG_LENGTH
    }

    chunks.push(remaining.slice(0, splitIdx))
    remaining = remaining.slice(splitIdx).trimStart()
  }

  return chunks
}

// --- Credential decryption ---
function decryptCredential(encryptedData: string, iv: string): string {
  const keyHex = (process.env.CREDENTIAL_ENCRYPTION_KEY || '').trim()
  if (!keyHex) throw new Error('CREDENTIAL_ENCRYPTION_KEY not configured')

  const key = Buffer.from(keyHex, 'hex')

  if (encryptedData.includes(':')) {
    const parts = encryptedData.split(':')
    if (parts.length === 3) {
      const [storedIv, authTagHex, ciphertext] = parts
      const ivBuf = Buffer.from(storedIv || iv, 'hex')
      const authTag = Buffer.from(authTagHex, 'hex')
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuf, { authTagLength: 16 })
      decipher.setAuthTag(authTag)
      let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      return decrypted
    }
  }

  const ivBuf = Buffer.from(iv, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuf, { authTagLength: 16 })
  const cipherBuffer = Buffer.from(encryptedData, 'hex')
  const authTag = cipherBuffer.slice(-16)
  const ciphertext = cipherBuffer.slice(0, -16)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(ciphertext)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString('utf8')
}

async function getConnectionDetails(connectionId: string): Promise<{
  accessToken: string
  config: Record<string, unknown>
} | null> {
  const supabase = createAdminClient()

  const { data: conn } = await supabase
    .from('integration_connections')
    .select('credential_id, config')
    .eq('id', connectionId)
    .single()

  if (!conn) return null
  const connRow = conn as { credential_id: string | null; config: Record<string, unknown> }

  if (!connRow.credential_id) return null

  const { data: cred } = await supabase
    .from('credentials')
    .select('encrypted_data, iv')
    .eq('id', connRow.credential_id)
    .single()

  if (!cred) return null
  const credRow = cred as { encrypted_data: string; iv: string }
  const decrypted = decryptCredential(credRow.encrypted_data, credRow.iv)
  const parsed = JSON.parse(decrypted) as Record<string, unknown>
  const accessToken = typeof parsed.access_token === 'string' ? parsed.access_token : ''
  if (!accessToken) return null

  return { accessToken, config: connRow.config || {} }
}

// --- Context window: trim history to fit token budget ---
const MAX_CONTEXT_CHARS = 6000
const MAX_CONTEXT_MESSAGES = 30

function trimHistory(
  messages: Array<{ role: string; content: string }>
): Array<{ role: 'user' | 'assistant'; content: string }> {
  // Take latest messages first, then trim by character budget
  const recent = messages.slice(-MAX_CONTEXT_MESSAGES)
  const result: Array<{ role: 'user' | 'assistant'; content: string }> = []
  let totalChars = 0

  // Work backwards from most recent
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i]
    const content = typeof m.content === 'string' ? m.content : ''
    if (!content.trim()) continue

    if (totalChars + content.length > MAX_CONTEXT_CHARS && result.length > 0) {
      break
    }

    result.unshift({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content,
    })
    totalChars += content.length
  }

  return result
}

// --- Default system prompt ---
const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant responding to messages in Slack.

GUIDELINES:
- Keep responses concise and conversational
- Use Slack mrkdwn formatting: *bold*, _italic_, \`code\`, \`\`\`code blocks\`\`\`, <url|link text>
- Do not use markdown headers (#) — they don't render in Slack
- Use bullet points sparingly; prefer short paragraphs
- If asked to do something beyond your capabilities, say so honestly
- Be warm but professional`

// --- Main responder ---
export async function respondToSlackMessage(params: SlackResponderParams): Promise<void> {
  const { conversationId, connectionId, userId, channelId, threadTs, messageTs, isDm } = params

  try {
    // Rate limit check
    if (!checkResponderRateLimit(connectionId)) {
      console.warn(`[SlackResponder] Rate limited for connection ${connectionId}`)
      return
    }

    const connDetails = await getConnectionDetails(connectionId)
    if (!connDetails) {
      console.error('[SlackResponder] No access token for connection:', connectionId)
      return
    }

    const { accessToken, config } = connDetails
    const replyTs = threadTs || messageTs

    // Show typing indicator
    let typingIndicatorTs: string | null = null
    try {
      const typingRes = await slackPost('chat.postMessage', accessToken, {
        channel: channelId,
        text: '_Thinking..._',
        ...(replyTs ? { thread_ts: replyTs } : {}),
      })
      if (typingRes.ok && typeof typingRes.data?.ts === 'string') {
        typingIndicatorTs = typingRes.data.ts as string
      }
    } catch { /* best effort */ }

    const supabase = createAdminClient()

    // Load conversation history
    const { data: messages } = await supabase
      .from('messages')
      .select('role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(MAX_CONTEXT_MESSAGES)

    const history = (messages || []) as Array<{ role: string; content: string; created_at: string }>

    if (history.length === 0) {
      console.error('[SlackResponder] No messages found for conversation:', conversationId)
      return
    }

    const llmMessages = trimHistory(history)
    if (llmMessages.length === 0) return

    // Build system prompt from connection config or default
    const customPrompt = typeof config.system_prompt === 'string' && config.system_prompt.trim()
      ? config.system_prompt.trim()
      : ''
    const systemPrompt = customPrompt || DEFAULT_SYSTEM_PROMPT
    const contextNote = isDm
      ? '\n\nThis is a direct message conversation.'
      : '\n\nThis is a channel conversation. You were @mentioned.'

    // Import AI client dynamically to avoid circular deps
    const { getAnthropicSdkClient, normalizeModelForTransport } = await import('@/lib/ai/ai-client')
    const anthropic = getAnthropicSdkClient()

    const models = ['google/gemini-2.5-flash', 'google/gemini-2.5-pro', 'anthropic/claude-3.5-haiku']
    let responseText = ''

    for (const model of models) {
      try {
        const normalizedModel = normalizeModelForTransport(model)
        const result = await anthropic.messages.create({
          model: normalizedModel,
          max_tokens: 2048,
          system: systemPrompt + contextNote,
          messages: llmMessages,
        })

        for (const block of result.content) {
          if (block.type === 'text') {
            responseText += block.text
          }
        }
        break
      } catch (err) {
        console.error(`[SlackResponder] Model ${model} failed:`, err)
      }
    }

    // Delete typing indicator
    if (typingIndicatorTs) {
      slackPost('chat.delete', accessToken, { channel: channelId, ts: typingIndicatorTs }).catch(() => {})
    }

    if (!responseText.trim()) {
      console.error('[SlackResponder] No response generated')
      // Send error reply to Slack
      await slackPost('chat.postMessage', accessToken, {
        channel: channelId,
        text: '_I encountered an issue generating a response. Please try again._',
        ...(replyTs ? { thread_ts: replyTs } : {}),
      })
      return
    }

    // Store assistant message
    const nowIso = new Date().toISOString()
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: responseText,
      metadata: {
        source: 'integration_responder',
        provider: 'slack',
        connection_id: connectionId,
      },
      created_at: nowIso,
    } as never)

    await supabase
      .from('conversations')
      .update({ updated_at: nowIso } as never)
      .eq('id', conversationId)

    // Send reply to Slack — chunk if needed
    const chunks = splitMessage(responseText)
    let lastSendResult: { ok: boolean; error?: string; data?: Record<string, unknown> } | null = null

    for (let i = 0; i < chunks.length; i++) {
      const slackBody: Record<string, unknown> = {
        channel: channelId,
        text: chunks[i],
      }
      if (replyTs) {
        slackBody.thread_ts = replyTs
      }

      lastSendResult = await slackPost('chat.postMessage', accessToken, slackBody)
      if (!lastSendResult.ok) {
        console.error(`[SlackResponder] Slack send failed (chunk ${i + 1}/${chunks.length}):`, lastSendResult.error)
        break
      }
    }

    // Log delivery
    await supabase.from('integration_delivery_log').insert({
      connection_id: connectionId,
      provider: 'slack',
      external_thread_id: channelId,
      conversation_id: conversationId,
      status: lastSendResult?.ok ? 'delivered' : 'failed',
      attempt_count: 1,
      last_attempt_at: nowIso,
      payload: {
        type: 'send_message',
        channel: channelId,
        text: responseText.slice(0, 500),
        text_length: responseText.length,
        chunks: chunks.length,
        thread_ts: replyTs || null,
      },
      response: lastSendResult || {},
      created_at: nowIso,
      updated_at: nowIso,
    } as never)
  } catch (err) {
    console.error('[SlackResponder] Error:', err)

    // Best-effort error reply to Slack
    try {
      const connDetails = await getConnectionDetails(connectionId)
      if (connDetails) {
        const replyTs = threadTs || messageTs
        await slackPost('chat.postMessage', connDetails.accessToken, {
          channel: channelId,
          text: '_Sorry, I encountered an error processing your message. Please try again._',
          ...(replyTs ? { thread_ts: replyTs } : {}),
        })
      }
    } catch {
      // Swallow — we already logged the primary error
    }
  }
}
