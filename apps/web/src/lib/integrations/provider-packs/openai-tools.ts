import type { McpTool, McpExecutionContext, McpToolResult } from '../types'

async function openaiApiCall(
  path: string,
  apiKey: string,
  body: Record<string, unknown>
): Promise<McpToolResult> {
  const res = await fetch(`https://api.openai.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!data) {
    return { success: false, error: 'Invalid response from OpenAI', statusCode: res.status }
  }

  if (!res.ok) {
    const errMsg = (data.error as Record<string, unknown>)?.message || JSON.stringify(data)
    return { success: false, error: String(errMsg), statusCode: res.status, data }
  }

  return { success: true, data, statusCode: res.status }
}

export const openaiChatCompletion: McpTool = {
  name: 'openai_chat_completion',
  description: 'Generate a chat completion using OpenAI GPT models. Useful for text generation, summarization, analysis, and more.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'The user prompt/message to send to GPT',
      },
      system_prompt: {
        type: 'string',
        description: 'Optional system prompt to set context',
      },
      model: {
        type: 'string',
        description: 'Model to use (default: gpt-4o-mini). Options: gpt-4o, gpt-4o-mini, gpt-4-turbo',
      },
      max_tokens: {
        type: 'number',
        description: 'Maximum tokens in response (default: 1024)',
      },
    },
    required: ['prompt'],
  },
  execute: async (input, ctx) => {
    const apiKey = ctx.credentials.apiKey
    if (!apiKey) return { success: false, error: 'OpenAI API key not configured' }

    const messages: Array<{ role: string; content: string }> = []
    if (input.system_prompt) messages.push({ role: 'system', content: String(input.system_prompt) })
    messages.push({ role: 'user', content: String(input.prompt) })

    return openaiApiCall('/chat/completions', apiKey, {
      model: String(input.model || 'gpt-4o-mini'),
      messages,
      max_tokens: Number(input.max_tokens) || 1024,
    })
  },
}

export const openaiEmbedding: McpTool = {
  name: 'openai_embedding',
  description: 'Generate text embeddings using OpenAI. Useful for semantic search, similarity comparison, and classification.',
  inputSchema: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'The text to embed',
      },
      model: {
        type: 'string',
        description: 'Embedding model (default: text-embedding-3-small)',
      },
    },
    required: ['input'],
  },
  execute: async (input, ctx) => {
    const apiKey = ctx.credentials.apiKey
    if (!apiKey) return { success: false, error: 'OpenAI API key not configured' }

    return openaiApiCall('/embeddings', apiKey, {
      model: String(input.model || 'text-embedding-3-small'),
      input: String(input.input),
    })
  },
}

export const openaiTools: McpTool[] = [openaiChatCompletion, openaiEmbedding]
