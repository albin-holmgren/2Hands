/**
 * Hardcoded Slack MCP Tools
 *
 * These tools are registered for the Slack provider and allow agents
 * to interact with Slack channels via the Bot OAuth token.
 */

import type { McpTool, McpExecutionContext, McpToolResult } from '../types'

async function slackApiCall(
  method: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<McpToolResult> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  })

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!data) {
    return { success: false, error: 'Invalid response from Slack', statusCode: res.status }
  }

  const ok = Boolean(data.ok)
  if (!ok) {
    return {
      success: false,
      error: typeof data.error === 'string' ? data.error : JSON.stringify(data),
      statusCode: res.status,
      data,
    }
  }

  return { success: true, data, statusCode: res.status }
}

export const slackSendMessage: McpTool = {
  name: 'slack_send_message',
  description: 'Send a message to a Slack channel or DM. Optionally reply in a thread.',
  inputSchema: {
    type: 'object',
    properties: {
      channel: {
        type: 'string',
        description: 'Slack channel ID (e.g. C01234ABC) or user ID for DM',
      },
      text: {
        type: 'string',
        description: 'Message text (supports Slack mrkdwn)',
      },
      thread_ts: {
        type: 'string',
        description: 'Optional thread timestamp to reply in a thread',
      },
    },
    required: ['channel', 'text'],
  },
  execute: async (
    input: Record<string, unknown>,
    context: McpExecutionContext
  ): Promise<McpToolResult> => {
    const accessToken = context.credentials.accessToken
    if (!accessToken) {
      return { success: false, error: 'Missing access token' }
    }

    const channel = typeof input.channel === 'string' ? input.channel.trim() : ''
    const text = typeof input.text === 'string' ? input.text : ''
    if (!channel || !text) {
      return { success: false, error: 'channel and text are required' }
    }

    const body: Record<string, unknown> = { channel, text }
    const threadTs = typeof input.thread_ts === 'string' ? input.thread_ts.trim() : ''
    if (threadTs) {
      body.thread_ts = threadTs
    }

    return slackApiCall('chat.postMessage', accessToken, body)
  },
}

export const slackAddReaction: McpTool = {
  name: 'slack_add_reaction',
  description: 'Add an emoji reaction to a Slack message.',
  inputSchema: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'Channel ID' },
      timestamp: { type: 'string', description: 'Message timestamp (ts)' },
      name: { type: 'string', description: 'Emoji name without colons (e.g. thumbsup)' },
    },
    required: ['channel', 'timestamp', 'name'],
  },
  execute: async (
    input: Record<string, unknown>,
    context: McpExecutionContext
  ): Promise<McpToolResult> => {
    const accessToken = context.credentials.accessToken
    if (!accessToken) {
      return { success: false, error: 'Missing access token' }
    }

    const channel = typeof input.channel === 'string' ? input.channel.trim() : ''
    const timestamp = typeof input.timestamp === 'string' ? input.timestamp.trim() : ''
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (!channel || !timestamp || !name) {
      return { success: false, error: 'channel, timestamp, and name are required' }
    }

    return slackApiCall('reactions.add', accessToken, { channel, timestamp, name })
  },
}

export const slackListChannels: McpTool = {
  name: 'slack_list_channels',
  description: 'List public Slack channels the bot has access to.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max channels to return (default 100, max 1000)' },
      cursor: { type: 'string', description: 'Pagination cursor' },
    },
  },
  execute: async (
    input: Record<string, unknown>,
    context: McpExecutionContext
  ): Promise<McpToolResult> => {
    const accessToken = context.credentials.accessToken
    if (!accessToken) {
      return { success: false, error: 'Missing access token' }
    }

    const limit = typeof input.limit === 'number' ? Math.min(1000, Math.max(1, input.limit)) : 100
    const params: Record<string, string> = {
      types: 'public_channel,private_channel',
      exclude_archived: 'true',
      limit: String(limit),
    }
    if (typeof input.cursor === 'string' && input.cursor.trim()) {
      params.cursor = input.cursor.trim()
    }

    const qs = new URLSearchParams(params).toString()
    const res = await fetch(`https://slack.com/api/conversations.list?${qs}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!data || !data.ok) {
      return {
        success: false,
        error: typeof data?.error === 'string' ? data.error : 'Failed to list channels',
        statusCode: res.status,
      }
    }

    return { success: true, data, statusCode: res.status }
  },
}

export const slackGetChannelHistory: McpTool = {
  name: 'slack_get_channel_history',
  description: 'Retrieve recent messages from a Slack channel.',
  inputSchema: {
    type: 'object',
    properties: {
      channel: { type: 'string', description: 'Channel ID' },
      limit: { type: 'number', description: 'Number of messages (default 20, max 100)' },
    },
    required: ['channel'],
  },
  execute: async (
    input: Record<string, unknown>,
    context: McpExecutionContext
  ): Promise<McpToolResult> => {
    const accessToken = context.credentials.accessToken
    if (!accessToken) {
      return { success: false, error: 'Missing access token' }
    }

    const channel = typeof input.channel === 'string' ? input.channel.trim() : ''
    if (!channel) {
      return { success: false, error: 'channel is required' }
    }

    const limit = typeof input.limit === 'number' ? Math.min(100, Math.max(1, input.limit)) : 20
    const qs = new URLSearchParams({ channel, limit: String(limit) }).toString()

    const res = await fetch(`https://slack.com/api/conversations.history?${qs}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!data || !data.ok) {
      return {
        success: false,
        error: typeof data?.error === 'string' ? data.error : 'Failed to get history',
        statusCode: res.status,
      }
    }

    return { success: true, data, statusCode: res.status }
  },
}

export const slackCreateChannel: McpTool = {
  name: 'slack_create_channel',
  description: 'Create a new Slack channel.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Channel name without the # prefix' },
      is_private: { type: 'boolean', description: 'Whether to create a private channel' },
    },
    required: ['name'],
  },
  execute: async (
    input: Record<string, unknown>,
    context: McpExecutionContext
  ): Promise<McpToolResult> => {
    const accessToken = context.credentials.accessToken
    if (!accessToken) {
      return { success: false, error: 'Missing access token' }
    }

    const rawName = typeof input.name === 'string' ? input.name.trim() : ''
    const name = rawName.replace(/^#/, '')
    if (!name) {
      return { success: false, error: 'name is required' }
    }

    return slackApiCall('conversations.create', accessToken, {
      name,
      is_private: input.is_private === true,
    })
  },
}

export const slackTools: McpTool[] = [
  slackSendMessage,
  slackAddReaction,
  slackListChannels,
  slackGetChannelHistory,
  slackCreateChannel,
]
