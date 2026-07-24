import type { McpTool, McpToolResult } from '../types'

async function perplexityApiCall(
  apiKey: string,
  body: Record<string, unknown>
): Promise<McpToolResult> {
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!data) {
    return { success: false, error: 'Invalid response from Perplexity', statusCode: res.status }
  }

  if (!res.ok) {
    const errMsg = (data.error as Record<string, unknown>)?.message || JSON.stringify(data)
    return { success: false, error: String(errMsg), statusCode: res.status, data }
  }

  return { success: true, data, statusCode: res.status }
}

export const perplexitySearch: McpTool = {
  name: 'perplexity_search',
  description: 'Search the web using Perplexity AI for up-to-date information with citations. Returns an AI-generated answer grounded in web sources.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query or question to research',
      },
      model: {
        type: 'string',
        description: 'Model to use (default: sonar). Options: sonar, sonar-pro',
      },
    },
    required: ['query'],
  },
  execute: async (input, ctx) => {
    const apiKey = ctx.credentials.apiKey
    if (!apiKey) return { success: false, error: 'Perplexity API key not configured' }

    return perplexityApiCall(apiKey, {
      model: String(input.model || 'sonar'),
      messages: [{ role: 'user', content: String(input.query) }],
    })
  },
}

export const perplexityTools: McpTool[] = [perplexitySearch]
