/**
 * Integration Runtime Types
 * 
 * Provider Packs are data-driven manifests that define:
 * - OAuth configuration
 * - OpenAPI spec for tool generation
 * - Event sources (webhooks/polling)
 * - Tool naming/grouping rules
 */

export interface OAuthConfig {
  authorizationUrl: string
  tokenUrl: string
  scopes: string[]
  clientIdEnvVar: string
  clientSecretEnvVar: string
  pkce?: boolean
  extraAuthParams?: Record<string, string>
}

export interface WebhookEventSource {
  type: 'webhook'
  path: string
  secret?: {
    header: string
    envVar: string
  }
  eventTypeField: string
  threadIdField: string
  messageTextField?: string
  timestampField?: string
}

export interface PollingEventSource {
  type: 'polling'
  intervalMs: number
  endpoint: string
  paginationStrategy?: 'cursor' | 'offset' | 'page'
  eventTypeField: string
  threadIdField: string
  messageTextField?: string
  timestampField?: string
}

export type EventSource = WebhookEventSource | PollingEventSource

export interface ToolNamingRules {
  prefix?: string
  operationIdTransform?: 'snake_case' | 'camelCase' | 'kebab-case'
  includeOperationIds?: string[]
  excludeOperationIds?: string[]
  tagFilter?: string[]
}

export interface VerifyEndpointConfig {
  path: string
  method?: 'GET' | 'POST'
  successStatusCodes?: number[]
  workspacePath?: string
}

export interface ProviderPack {
  id: string
  name: string
  description: string
  icon?: string
  oauth?: OAuthConfig
  apiKeyAuth?: {
    headerName: string
    headerPrefix?: string
  }
  credentialKeyField?: string
  verifyEndpoint?: VerifyEndpointConfig
  openApiSpecUrl?: string
  openApiSpec?: Record<string, unknown>
  baseUrl: string
  eventSources?: EventSource[]
  toolNaming?: ToolNamingRules
  rateLimits?: {
    requestsPerMinute?: number
    requestsPerDay?: number
  }
}

export interface CustomProviderManifest {
  id: string
  name: string
  baseUrl: string
  authMode: 'api_key' | 'bearer_token' | 'custom_headers' | 'oauth'
  apiKeyAuth?: {
    headerName: string
    headerPrefix?: string
  }
  credentialKeyField?: string
  customHeaders?: Record<string, string>
  verifyEndpoint?: VerifyEndpointConfig
  openApiSpecUrl?: string
  fields: Array<{ key: string; label: string; type: 'text' | 'password'; placeholder?: string }>
  oauth?: OAuthConfig
}

export interface McpTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  execute: (
    input: Record<string, unknown>,
    context: McpExecutionContext
  ) => Promise<McpToolResult>
}

export interface McpExecutionContext {
  connectionId: string
  userId: string
  provider: string
  credentials: {
    accessToken?: string
    refreshToken?: string
    apiKey?: string
    expiresAt?: string
  }
  baseUrl: string
  /** Provider-specific API key auth header — honored by generic/OpenAPI-generated tool executors */
  apiKeyAuth?: {
    headerName: string
    headerPrefix?: string
  }
}

export interface McpToolResult {
  success: boolean
  data?: unknown
  error?: string
  statusCode?: number
}

export interface InboundEvent {
  provider: string
  connectionId: string
  externalEventId: string
  eventType: string
  externalThreadId: string
  externalUserId?: string | null
  text?: string | null
  attachments?: unknown
  timestamp?: string | null
  rawPayload?: unknown
}

export interface OutboundDelivery {
  id: string
  connectionId: string
  provider: string
  externalThreadId?: string | null
  conversationId?: string | null
  status: 'pending' | 'processing' | 'delivered' | 'failed' | 'dead_letter'
  attemptCount: number
  lastAttemptAt?: string | null
  nextAttemptAt?: string | null
  payload: Record<string, unknown>
  response?: Record<string, unknown>
}
