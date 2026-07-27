/**
 * Real assistant replies for the v3 shell.
 *
 * The shell used to answer with a hardcoded string on a timer, which read as
 * the product being broken rather than unfinished. This calls the same
 * /api/chat endpoint the rest of the app uses, so v3 gets whatever model the
 * server is configured with.
 *
 * The endpoint streams Server-Sent Events. We read the whole response and
 * parse it in one go rather than incrementally: React Native's streaming
 * support varies by runtime, and a reply that arrives complete is far better
 * than one that silently truncates on a platform where the reader misbehaves.
 */
import { supabase } from './supabase'

const API_URL = process.env.EXPO_PUBLIC_API_URL || ''

export class ChatUnavailableError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'ChatUnavailableError'
  }
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Send the conversation so far and return the assistant's reply.
 *
 * Throws rather than returning a placeholder: if the server is unreachable the
 * user needs to know that, not read an invented answer.
 */
export async function requestAssistantReply(input: {
  messages: ChatTurn[]
  conversationId?: string | null
  signal?: AbortSignal
}): Promise<string> {
  if (!API_URL) {
    throw new ChatUnavailableError('EXPO_PUBLIC_API_URL is not configured for this build.')
  }

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new ChatUnavailableError('You need to be signed in to send a message.')
  }

  const response = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      messages: input.messages,
      conversationId: input.conversationId ?? undefined,
    }),
    signal: input.signal,
  })

  if (!response.ok) {
    // A cross-origin redirect silently drops the Authorization header — the
    // Fetch spec strips it rather than forwarding credentials to another
    // origin. www.2hands.ai 307s to the apex domain, so pointing
    // EXPO_PUBLIC_API_URL at www produced a request that arrived with no
    // credentials at all and a bare "Unauthorized" that said nothing about
    // why. Name the actual cause instead of the symptom.
    if (response.status === 401 && response.redirected) {
      throw new ChatUnavailableError(
        `Signed in, but the request was redirected from ${API_URL} to ${response.url}, ` +
          'which strips the Authorization header. Point EXPO_PUBLIC_API_URL at the ' +
          'domain that answers directly, with no redirect.',
        401,
      )
    }

    const body = await response.text().catch(() => '')
    throw new ChatUnavailableError(
      body.slice(0, 200) || `The assistant is unavailable (HTTP ${response.status}).`,
      response.status,
    )
  }

  return parseSseText(await response.text())
}

/**
 * Pull the assistant's words out of an SSE body.
 *
 * Frames look like `data: {"text":"..."}` and the stream ends with
 * `data: [DONE]`. Frames carrying anything else — activity steps, tool calls,
 * thinking — are not the reply and are skipped; a frame that will not parse is
 * skipped too, since one malformed chunk should not discard a whole answer.
 */
export function parseSseText(body: string): string {
  let reply = ''

  for (const line of body.split('\n')) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') continue

    try {
      const frame = JSON.parse(payload) as { text?: unknown; type?: unknown }
      // `text` on its own is the assistant speaking. Frames that carry a
      // `type` are activity/tooling and describe what it is doing instead.
      if (typeof frame.text === 'string' && frame.type === undefined) {
        reply += frame.text
      }
    } catch {
      continue
    }
  }

  return reply.trim()
}
