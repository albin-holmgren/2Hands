/**
 * Hardcoded Gmail MCP Tools
 *
 * These tools are registered for the Gmail provider and allow agents
 * to interact with Gmail via the OAuth access token.
 */

import type { McpTool, McpExecutionContext, McpToolResult } from '../types'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

async function gmailApiGet(
  path: string,
  accessToken: string,
  params?: Record<string, string>
): Promise<McpToolResult> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const res = await fetch(`${GMAIL_API}${path}${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !data) {
    return {
      success: false,
      error: typeof data?.error === 'object'
        ? JSON.stringify((data.error as Record<string, unknown>).message || data.error)
        : `HTTP ${res.status}`,
      statusCode: res.status,
      data,
    }
  }

  return { success: true, data, statusCode: res.status }
}

async function gmailApiPost(
  path: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<McpToolResult> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !data) {
    return {
      success: false,
      error: typeof data?.error === 'object'
        ? JSON.stringify((data.error as Record<string, unknown>).message || data.error)
        : `HTTP ${res.status}`,
      statusCode: res.status,
      data,
    }
  }

  return { success: true, data, statusCode: res.status }
}

function buildRawEmail(to: string, subject: string, body: string, cc?: string, bcc?: string, replyTo?: string, inReplyTo?: string, references?: string): string {
  const lines: string[] = []
  lines.push(`To: ${to}`)
  if (cc) lines.push(`Cc: ${cc}`)
  if (bcc) lines.push(`Bcc: ${bcc}`)
  lines.push(`Subject: ${subject}`)
  lines.push('Content-Type: text/plain; charset=utf-8')
  if (replyTo) lines.push(`In-Reply-To: ${replyTo}`)
  if (references) lines.push(`References: ${references}`)
  lines.push('')
  lines.push(body)

  const raw = lines.join('\r\n')
  // URL-safe base64 encoding
  return Buffer.from(raw).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export const gmailSendEmail: McpTool = {
  name: 'gmail_send_email',
  description: 'Send an email via Gmail. Supports To, CC, BCC, and reply threading.',
  inputSchema: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient email address(es), comma-separated' },
      subject: { type: 'string', description: 'Email subject line' },
      body: { type: 'string', description: 'Plain text email body' },
      cc: { type: 'string', description: 'CC recipients (optional, comma-separated)' },
      bcc: { type: 'string', description: 'BCC recipients (optional, comma-separated)' },
      thread_id: { type: 'string', description: 'Gmail thread ID to reply in (optional)' },
    },
    required: ['to', 'subject', 'body'],
  },
  execute: async (
    input: Record<string, unknown>,
    context: McpExecutionContext
  ): Promise<McpToolResult> => {
    const accessToken = context.credentials.accessToken
    if (!accessToken) return { success: false, error: 'Missing access token' }

    const to = typeof input.to === 'string' ? input.to.trim() : ''
    const subject = typeof input.subject === 'string' ? input.subject : ''
    const body = typeof input.body === 'string' ? input.body : ''
    if (!to || !subject) return { success: false, error: 'to and subject are required' }

    const cc = typeof input.cc === 'string' ? input.cc.trim() : undefined
    const bcc = typeof input.bcc === 'string' ? input.bcc.trim() : undefined
    const raw = buildRawEmail(to, subject, body, cc, bcc)

    const payload: Record<string, unknown> = { raw }
    if (typeof input.thread_id === 'string' && input.thread_id.trim()) {
      payload.threadId = input.thread_id.trim()
    }

    return gmailApiPost('/messages/send', accessToken, payload)
  },
}

export const gmailSearchEmails: McpTool = {
  name: 'gmail_search_emails',
  description: 'Search Gmail emails using Gmail search syntax (e.g. "from:john subject:meeting is:unread").',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Gmail search query (same syntax as Gmail search bar)' },
      max_results: { type: 'number', description: 'Maximum emails to return (default 10, max 50)' },
    },
    required: ['query'],
  },
  execute: async (
    input: Record<string, unknown>,
    context: McpExecutionContext
  ): Promise<McpToolResult> => {
    const accessToken = context.credentials.accessToken
    if (!accessToken) return { success: false, error: 'Missing access token' }

    const query = typeof input.query === 'string' ? input.query.trim() : ''
    if (!query) return { success: false, error: 'query is required' }

    const maxResults = typeof input.max_results === 'number'
      ? Math.min(50, Math.max(1, input.max_results))
      : 10

    // List message IDs matching the query
    const listResult = await gmailApiGet('/messages', accessToken, {
      q: query,
      maxResults: String(maxResults),
    })
    if (!listResult.success) return listResult

    const messages = (listResult.data as { messages?: Array<{ id: string; threadId: string }> }).messages
    if (!messages || messages.length === 0) {
      return { success: true, data: { messages: [], resultSizeEstimate: 0 } }
    }

    // Fetch metadata for each message (parallel, limited to first 10)
    const details = await Promise.all(
      messages.slice(0, 10).map(async (msg) => {
        const detail = await gmailApiGet(`/messages/${msg.id}`, accessToken, {
          format: 'metadata',
          metadataHeaders: 'From,To,Subject,Date',
        })
        if (!detail.success) return { id: msg.id, error: detail.error }
        const d = detail.data as {
          id: string
          threadId: string
          snippet: string
          labelIds?: string[]
          payload?: { headers?: Array<{ name: string; value: string }> }
        }
        const headers: Record<string, string> = {}
        for (const h of d.payload?.headers || []) {
          headers[h.name.toLowerCase()] = h.value
        }
        return {
          id: d.id,
          threadId: d.threadId,
          from: headers.from || '',
          to: headers.to || '',
          subject: headers.subject || '',
          date: headers.date || '',
          snippet: d.snippet || '',
          labels: d.labelIds || [],
        }
      })
    )

    return { success: true, data: { messages: details, total: messages.length } }
  },
}

export const gmailReadEmail: McpTool = {
  name: 'gmail_read_email',
  description: 'Read the full content of a specific Gmail email by its ID.',
  inputSchema: {
    type: 'object',
    properties: {
      message_id: { type: 'string', description: 'Gmail message ID' },
    },
    required: ['message_id'],
  },
  execute: async (
    input: Record<string, unknown>,
    context: McpExecutionContext
  ): Promise<McpToolResult> => {
    const accessToken = context.credentials.accessToken
    if (!accessToken) return { success: false, error: 'Missing access token' }

    const messageId = typeof input.message_id === 'string' ? input.message_id.trim() : ''
    if (!messageId) return { success: false, error: 'message_id is required' }

    const result = await gmailApiGet(`/messages/${messageId}`, accessToken, {
      format: 'full',
    })
    if (!result.success) return result

    const data = result.data as {
      id: string
      threadId: string
      snippet: string
      labelIds?: string[]
      payload?: {
        headers?: Array<{ name: string; value: string }>
        body?: { data?: string }
        parts?: Array<{ mimeType: string; body?: { data?: string } }>
      }
    }

    // Extract headers
    const headers: Record<string, string> = {}
    for (const h of data.payload?.headers || []) {
      headers[h.name.toLowerCase()] = h.value
    }

    // Extract body text
    let bodyText = ''
    if (data.payload?.body?.data) {
      bodyText = Buffer.from(data.payload.body.data, 'base64').toString('utf8')
    } else if (data.payload?.parts) {
      const textPart = data.payload.parts.find(p => p.mimeType === 'text/plain')
      if (textPart?.body?.data) {
        bodyText = Buffer.from(textPart.body.data, 'base64').toString('utf8')
      }
    }

    return {
      success: true,
      data: {
        id: data.id,
        threadId: data.threadId,
        from: headers.from || '',
        to: headers.to || '',
        cc: headers.cc || '',
        subject: headers.subject || '',
        date: headers.date || '',
        body: bodyText.slice(0, 8000), // Limit body size
        labels: data.labelIds || [],
      },
    }
  },
}

export const gmailGetInbox: McpTool = {
  name: 'gmail_get_inbox',
  description: 'Get recent emails from the inbox. Optionally filter to unread only.',
  inputSchema: {
    type: 'object',
    properties: {
      unread_only: { type: 'boolean', description: 'Only return unread emails (default false)' },
      max_results: { type: 'number', description: 'Maximum emails to return (default 10, max 20)' },
    },
  },
  execute: async (
    input: Record<string, unknown>,
    context: McpExecutionContext
  ): Promise<McpToolResult> => {
    const accessToken = context.credentials.accessToken
    if (!accessToken) return { success: false, error: 'Missing access token' }

    const unreadOnly = input.unread_only === true
    const maxResults = typeof input.max_results === 'number'
      ? Math.min(20, Math.max(1, input.max_results))
      : 10

    const query = unreadOnly ? 'in:inbox is:unread' : 'in:inbox'

    const listResult = await gmailApiGet('/messages', accessToken, {
      q: query,
      maxResults: String(maxResults),
    })
    if (!listResult.success) return listResult

    const messages = (listResult.data as { messages?: Array<{ id: string }> }).messages
    if (!messages || messages.length === 0) {
      return { success: true, data: { messages: [], count: 0 } }
    }

    const details = await Promise.all(
      messages.map(async (msg) => {
        const detail = await gmailApiGet(`/messages/${msg.id}`, accessToken, {
          format: 'metadata',
          metadataHeaders: 'From,To,Subject,Date',
        })
        if (!detail.success) return { id: msg.id, error: detail.error }
        const d = detail.data as {
          id: string
          threadId: string
          snippet: string
          labelIds?: string[]
          payload?: { headers?: Array<{ name: string; value: string }> }
        }
        const headers: Record<string, string> = {}
        for (const h of d.payload?.headers || []) {
          headers[h.name.toLowerCase()] = h.value
        }
        return {
          id: d.id,
          threadId: d.threadId,
          from: headers.from || '',
          subject: headers.subject || '',
          date: headers.date || '',
          snippet: d.snippet || '',
          unread: (d.labelIds || []).includes('UNREAD'),
        }
      })
    )

    return { success: true, data: { messages: details, count: details.length } }
  },
}

export const gmailModifyLabels: McpTool = {
  name: 'gmail_modify_labels',
  description: 'Add or remove labels from an email (e.g. mark as read, archive, star).',
  inputSchema: {
    type: 'object',
    properties: {
      message_id: { type: 'string', description: 'Gmail message ID' },
      add_labels: {
        type: 'array',
        items: { type: 'string' },
        description: 'Label IDs to add (e.g. STARRED, IMPORTANT, UNREAD)',
      },
      remove_labels: {
        type: 'array',
        items: { type: 'string' },
        description: 'Label IDs to remove (e.g. UNREAD to mark as read, INBOX to archive)',
      },
    },
    required: ['message_id'],
  },
  execute: async (
    input: Record<string, unknown>,
    context: McpExecutionContext
  ): Promise<McpToolResult> => {
    const accessToken = context.credentials.accessToken
    if (!accessToken) return { success: false, error: 'Missing access token' }

    const messageId = typeof input.message_id === 'string' ? input.message_id.trim() : ''
    if (!messageId) return { success: false, error: 'message_id is required' }

    const addLabels = Array.isArray(input.add_labels)
      ? input.add_labels.filter((l): l is string => typeof l === 'string')
      : []
    const removeLabels = Array.isArray(input.remove_labels)
      ? input.remove_labels.filter((l): l is string => typeof l === 'string')
      : []

    if (addLabels.length === 0 && removeLabels.length === 0) {
      return { success: false, error: 'At least one of add_labels or remove_labels is required' }
    }

    return gmailApiPost(`/messages/${messageId}/modify`, accessToken, {
      addLabelIds: addLabels,
      removeLabelIds: removeLabels,
    })
  },
}

export const gmailTools: McpTool[] = [
  gmailSendEmail,
  gmailSearchEmails,
  gmailReadEmail,
  gmailGetInbox,
  gmailModifyLabels,
]
