'use server'

import { createStreamableValue } from '@ai-sdk/rsc'
import { headers, cookies } from 'next/headers'

export async function streamChat(
  messages: Array<{ role: string; content: string | object[] }>,
  conversationId: string,
  model?: string,
  assistantMsgId?: string
) {
  const stream = createStreamableValue<string>('')

  const headersList = await headers()
  const cookieStore = await cookies()

  // Build the base URL from the request headers
  const host = headersList.get('host') || 'localhost:3000'
  const proto = headersList.get('x-forwarded-proto') || 'http'
  const baseUrl = `${proto}://${host}`

  // Forward only the cookies required for authentication and workspace context.
  // Forwarding all cookies can cause a 431 (Request Header Fields Too Large) on
  // localhost where unrelated cookies from other projects accumulate.
  const REQUIRED_COOKIE_PREFIXES = ['sb-']
  const REQUIRED_COOKIE_NAMES = ['2hands_active_workspace_id']
  const cookieString = cookieStore
    .getAll()
    .filter(
      (c) =>
        REQUIRED_COOKIE_NAMES.includes(c.name) ||
        REQUIRED_COOKIE_PREFIXES.some((prefix) => c.name.startsWith(prefix))
    )
    .map((c) => `${c.name}=${c.value}`)
    .join('; ')

  ;(async () => {
    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieString,
        },
        body: JSON.stringify({ messages, conversationId, ...(model ? { model } : {}), ...(assistantMsgId ? { assistantMsgId } : {}) }),
      })

      if (!response.ok) {
        let details = ''
        try {
          const contentType = response.headers.get('content-type') || ''
          if (contentType.includes('application/json')) {
            const payload = await response.json() as { error?: string; details?: string }
            details = payload.details || payload.error || ''
          } else {
            details = (await response.text()).slice(0, 300)
          }
        } catch {
          // Ignore parsing failures and fall back to status-only message
        }
        const isTimeout = response.status === 504 || response.status === 408 ||
          details.includes('FUNCTION_INVOCATION_TIMEOUT') || details.includes('TIMEOUT')
        stream.update(
          JSON.stringify({
            type: 'error',
            isTimeout,
            message: isTimeout
              ? 'The request took too long to complete. Complex tasks sometimes need more time — please try again.'
              : (details ? `API error: ${response.status} - ${details}` : `API error: ${response.status}`),
          })
        )
        stream.done()
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        stream.done()
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            // Stream each SSE event as a string through the streamable value
            stream.update(data)
          }
        }
      }
    } catch (error) {
      console.error('[streamChat] Error:', error)
      stream.update(
        JSON.stringify({ type: 'error', message: 'Stream error occurred' })
      )
    } finally {
      stream.done()
    }
  })()

  return { output: stream.value }
}
