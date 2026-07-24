import Anthropic from '@anthropic-ai/sdk'

// AI Gateway is the ONLY supported transport.
// All models are accessed via Vercel AI Gateway using provider/model format.

// Default model — Gemini 2.5 Flash via AI Gateway (fast, strong tools)
export const DEFAULT_MODEL = 'google/gemini-2.5-flash'
export const DEFAULT_FALLBACK_MODELS = ['google/gemini-2.5-pro', 'anthropic/claude-3.5-haiku']

type CreateMessageParams = Parameters<Anthropic['messages']['create']>[0]

type CreateMessageResult = Awaited<ReturnType<Anthropic['messages']['create']>>

export type NonStreamingMessageCreateParams = Omit<CreateMessageParams, 'stream'> & {
  stream?: false
}

let _gatewayClient: Anthropic | null = null

type GatewayAuth = {
  token: string
  source: 'api_key' | 'oidc'
}

function normalizeGatewayToken(raw: string | undefined): string {
  if (!raw) return ''

  return raw
    .trim()
    .replace(/\\r\\n/g, '')
    .replace(/\\n/g, '')
    .replace(/\r\n/g, '')
    .replace(/\n/g, '')
    .trim()
}

function getGatewayAuth(): GatewayAuth {
  const apiKey = normalizeGatewayToken(process.env.AI_GATEWAY_API_KEY)
  if (apiKey) {
    return { token: apiKey, source: 'api_key' }
  }

  const oidc = normalizeGatewayToken(process.env.VERCEL_OIDC_TOKEN)
  if (oidc) {
    return { token: oidc, source: 'oidc' }
  }

  throw new Error(
    'Missing AI_GATEWAY_API_KEY and VERCEL_OIDC_TOKEN. ' +
    'AI Gateway is required - direct Anthropic access is not supported. ' +
    'Please set AI_GATEWAY_API_KEY in your environment variables.'
  )
}

export function getAiTransport(): 'gateway' {
  // Always return gateway - direct transport is not supported
  return 'gateway'
}

export function getAnthropicSdkClient(): Anthropic {
  if (_gatewayClient) return _gatewayClient

  const auth = getGatewayAuth()

  const clientOptions: ConstructorParameters<typeof Anthropic>[0] = {
    apiKey: auth.token,
    baseURL: 'https://ai-gateway.vercel.sh',
  }

  if (auth.source === 'api_key') {
    clientOptions.defaultHeaders = {
      Authorization: `Bearer ${auth.token}`,
    }
  }

  _gatewayClient = new Anthropic(clientOptions)

  return _gatewayClient
}

const GATEWAY_MODEL_MAP: Record<string, string> = {
  // Anthropic models
  'claude-3-5-haiku-20241022': 'anthropic/claude-3.5-haiku',
  'claude-3-5-haiku-latest': 'anthropic/claude-3.5-haiku',
  'claude-sonnet-4-20250514': 'anthropic/claude-sonnet-4',
  'claude-sonnet-4.6': 'anthropic/claude-sonnet-4.6',
  'claude-opus-4-20250514': 'anthropic/claude-opus-4',
  // Google Gemini (gateway format)
  'google/gemini-2.5-flash': 'google/gemini-2.5-flash',
  'google/gemini-2.5-pro': 'google/gemini-2.5-pro',
  // Kimi models (already in gateway format)
  'moonshotai/kimi-k2': 'moonshotai/kimi-k2',
  'moonshotai/kimi-k2.5': 'moonshotai/kimi-k2.5',
  // OpenAI models
  'openai/gpt-4.1': 'openai/gpt-4.1',
  'openai/gpt-5.4': 'openai/gpt-5.4',
  // Perplexity models
  'perplexity/sonar': 'perplexity/sonar',
}

export function normalizeModelForTransport(model: string): string {
  const trimmed = model.trim()
  if (!trimmed) return trimmed

  // Always use gateway format
  if (trimmed.includes('/')) return trimmed

  return GATEWAY_MODEL_MAP[trimmed] || `anthropic/${trimmed}`
}

export async function createMessageWithFallback(
  params: CreateMessageParams,
  options?: {
    fallbacks?: string[]
  }
): Promise<{ response: CreateMessageResult; modelUsed: string; attempts: Array<{ model: string; error?: string }> }> {
  const client = getAnthropicSdkClient()

  const primaryModel = normalizeModelForTransport(String((params as { model?: unknown }).model || ''))
  const fallbackModels = (options?.fallbacks || []).map(m => normalizeModelForTransport(m))

  const modelsToTry = [primaryModel, ...fallbackModels].filter(Boolean)

  const attempts: Array<{ model: string; error?: string }> = []
  let lastError: unknown

  for (const model of modelsToTry) {
    try {
      const response = await client.messages.create({ ...((params as unknown) as Record<string, unknown>), model } as never)
      attempts.push({ model })
      return { response, modelUsed: model, attempts }
    } catch (error) {
      lastError = error
      attempts.push({ model, error: error instanceof Error ? error.message : String(error) })
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'Unknown AI error'))
}

export async function createNonStreamingMessageWithFallback(
  params: NonStreamingMessageCreateParams,
  options?: {
    fallbacks?: string[]
  }
): Promise<{ response: Anthropic.Message; modelUsed: string; attempts: Array<{ model: string; error?: string }> }> {
  const { response, modelUsed, attempts } = await createMessageWithFallback(
    { ...(params as unknown as CreateMessageParams), stream: false },
    options
  )

  return { response: response as unknown as Anthropic.Message, modelUsed, attempts }
}

export async function createMessage(
  params: CreateMessageParams
): Promise<CreateMessageResult> {
  const { response } = await createMessageWithFallback(params)
  return response
}

export function extractTextFromResponse(response: Anthropic.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('')
}
