/**
 * MCP Tool Executor
 * 
 * Executes MCP tools on behalf of agents using stored credentials.
 * Handles credential retrieval, token refresh, rate limiting, and audit logging.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import crypto from 'crypto'
import type { McpTool, McpExecutionContext, McpToolResult, ProviderPack, CustomProviderManifest } from './types'
import { getProviderPack } from './provider-packs'
import { fetchAndGenerateTools } from './openapi-to-mcp'
import { resolveCustomManifest } from './credential-helpers'
import { refreshAccessToken } from './oauth'
import { slackTools } from './provider-packs/slack-tools'
import { gmailTools } from './provider-packs/gmail-tools'
import { googleSheetsTools } from './provider-packs/google-sheets-tools'
import { googleCalendarTools } from './provider-packs/google-calendar-tools'
import { attioTools } from './provider-packs/attio-tools'
import { evaluateCapability } from '@/lib/security/capability-profile'

function decryptOAuthCredential(encryptedData: string, iv: string): string {
  const keyHex = (process.env.CREDENTIAL_ENCRYPTION_KEY || '').trim()
  if (!keyHex) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY not configured')
  }

  const key = Buffer.from(keyHex, 'hex')
  const ivBuffer = Buffer.from(iv, 'hex')

  if (encryptedData.includes(':')) {
    const parts = encryptedData.split(':')
    if (parts.length === 3) {
      const [storedIv, authTagHex, ciphertext] = parts
      const storedIvBuffer = Buffer.from(storedIv, 'hex')
      const authTag = Buffer.from(authTagHex, 'hex')

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, storedIvBuffer, {
        authTagLength: 16,
      })
      decipher.setAuthTag(authTag)

      let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      return decrypted
    }
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer, {
    authTagLength: 16,
  })

  const cipherBuffer = Buffer.from(encryptedData, 'hex')
  const authTag = cipherBuffer.slice(-16)
  const ciphertext = cipherBuffer.slice(0, -16)

  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(ciphertext)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString('utf8')
}

const toolCache = new Map<string, { tools: McpTool[]; fetchedAt: number }>()
const TOOL_CACHE_TTL_MS = 5 * 60 * 1000

function getHardcodedToolsForProvider(providerId: string): McpTool[] {
  if (providerId === 'slack') return slackTools
  if (providerId === 'gmail') return gmailTools
  if (providerId === 'google_sheets') return googleSheetsTools
  if (providerId === 'google_calendar') return googleCalendarTools
  if (providerId === 'attio') return attioTools
  return []
}

async function getToolsForProvider(providerId: string, dynamicPack?: ProviderPack): Promise<McpTool[]> {
  const cached = toolCache.get(providerId)
  if (cached && Date.now() - cached.fetchedAt < TOOL_CACHE_TTL_MS) {
    return cached.tools
  }

  const pack = getProviderPack(providerId) || dynamicPack
  if (!pack) {
    return getHardcodedToolsForProvider(providerId)
  }

  const openApiTools = await fetchAndGenerateTools(pack)
  const hardcoded = getHardcodedToolsForProvider(providerId)
  const hardcodedNames = new Set(hardcoded.map((t) => t.name))
  const merged = [...hardcoded, ...openApiTools.filter((t) => !hardcodedNames.has(t.name))]

  if (merged.length > 0) {
    toolCache.set(providerId, { tools: merged, fetchedAt: Date.now() })
  }
  return merged
}

async function getCredentialsForConnection(
  connectionId: string
): Promise<{
  accessToken?: string
  refreshToken?: string
  apiKey?: string
  expiresAt?: string
} | null> {
  const supabase = createAdminClient()

  const { data: connection, error: connectionError } = await supabase
    .from('integration_connections')
    .select('credential_id, config')
    .eq('id', connectionId)
    .single()

  if (connectionError || !connection) {
    return null
  }

  const connRow = connection as { credential_id: string | null; config: Record<string, unknown> }

  // Resolve credential ID: check connection column first, then config.credential_id (API-key providers)
  const credentialId = connRow.credential_id
    || (typeof connRow.config?.credential_id === 'string' ? connRow.config.credential_id : null)

  if (!credentialId) {
    return null
  }

  const { data: credential, error: credentialError } = await supabase
    .from('credentials')
    .select('encrypted_data, iv, expires_at')
    .eq('id', credentialId)
    .single()

  if (credentialError || !credential) {
    return null
  }

  const credRow = credential as {
    encrypted_data: string
    iv: string
    expires_at: string | null
  }

  try {
    const decrypted = decryptOAuthCredential(credRow.encrypted_data, credRow.iv)
    const parsed = JSON.parse(decrypted) as Record<string, unknown>

    return {
      accessToken: typeof parsed.access_token === 'string' ? parsed.access_token : undefined,
      refreshToken: typeof parsed.refresh_token === 'string' ? parsed.refresh_token : undefined,
      apiKey: typeof parsed.api_key === 'string' ? parsed.api_key : undefined,
      expiresAt: credRow.expires_at || undefined,
    }
  } catch (error) {
    console.error('[McpExecutor] Failed to decrypt credentials:', error)
    return null
  }
}

function shouldRefreshAccessToken(expiresAt: string | undefined): boolean {
  if (!expiresAt) return false
  const expMs = Date.parse(expiresAt)
  if (!Number.isFinite(expMs)) return false
  const refreshSkewMs = 2 * 60 * 1000
  return expMs - Date.now() <= refreshSkewMs
}

export interface ExecuteToolOptions {
  connectionId: string
  toolName: string
  input: Record<string, unknown>
  userId: string
}

export async function executeTool(options: ExecuteToolOptions): Promise<McpToolResult> {
  const { connectionId, toolName, input, userId } = options

  const supabase = createAdminClient()

  const { data: connection, error: connectionError } = await supabase
    .from('integration_connections')
    .select('id, user_id, provider, status, config')
    .eq('id', connectionId)
    .single()

  if (connectionError || !connection) {
    return { success: false, error: 'Connection not found' }
  }

  const connRow = connection as {
    id: string
    user_id: string
    provider: string
    status: string
    config: Record<string, unknown> | null
  }

  if (connRow.user_id !== userId) {
    return { success: false, error: 'Connection does not belong to user' }
  }

  if (connRow.status !== 'active') {
    return { success: false, error: 'Connection is not active' }
  }

  let pack = getProviderPack(connRow.provider)
  let customManifest: CustomProviderManifest | null = null

  if (!pack) {
    customManifest = resolveCustomManifest(connRow.config || {})
    if (customManifest) {
      pack = {
        id: customManifest.id,
        name: customManifest.name,
        description: '',
        baseUrl: customManifest.baseUrl,
        apiKeyAuth: customManifest.apiKeyAuth,
        credentialKeyField: customManifest.credentialKeyField,
        openApiSpecUrl: customManifest.openApiSpecUrl,
      }
    } else {
      return { success: false, error: `Unknown provider: ${connRow.provider}. Register it first with register_custom_provider.` }
    }
  }

  const tools = await getToolsForProvider(connRow.provider, pack)
  const tool = tools.find((t) => t.name === toolName)

  if (!tool) {
    return { success: false, error: `Tool not found: ${toolName}` }
  }

  const capabilityDecision = evaluateCapability({
    config: connRow.config,
    toolName,
  })

  if (!capabilityDecision.allowed) {
    return {
      success: false,
      error: `Blocked by capability profile (${capabilityDecision.profile}): ${capabilityDecision.reason}`,
      statusCode: 403,
    }
  }

  const credentials = await getCredentialsForConnection(connectionId)
  if (!credentials) {
    return { success: false, error: 'Failed to retrieve credentials' }
  }

  let refreshedBeforeExecute = false
  if (!credentials.apiKey && credentials.refreshToken) {
    const needsRefresh = !credentials.accessToken || shouldRefreshAccessToken(credentials.expiresAt)

    if (needsRefresh) {
      const refreshed = await refreshAccessToken(connectionId)
      if (refreshed?.accessToken) {
        credentials.accessToken = refreshed.accessToken
        if (refreshed.expiresAt) {
          credentials.expiresAt = refreshed.expiresAt
        }
        refreshedBeforeExecute = true
      }
    }
  }

  const context: McpExecutionContext = {
    connectionId,
    userId,
    provider: connRow.provider,
    credentials,
    baseUrl: pack.baseUrl,
    apiKeyAuth: pack.apiKeyAuth,
  }

  const startTime = Date.now()
  let result = await tool.execute(input, context)
  let refreshedAfter401 = false

  if (
    !result.success &&
    result.statusCode === 401 &&
    !credentials.apiKey &&
    credentials.refreshToken
  ) {
    const refreshed = await refreshAccessToken(connectionId)
    if (refreshed?.accessToken) {
      credentials.accessToken = refreshed.accessToken
      if (refreshed.expiresAt) {
        credentials.expiresAt = refreshed.expiresAt
      }
      refreshedAfter401 = true
      result = await tool.execute(input, context)
    }
  }
  const durationMs = Date.now() - startTime

  // Log write failures to server logs so they surface in Vercel function output
  if (!result.success) {
    console.warn(
      `[McpExecutor] Tool failed: provider=${connRow.provider} tool=${toolName} status=${result.statusCode ?? 'n/a'} error="${result.error ?? 'unknown'}" duration=${durationMs}ms`
    )
  } else if (['create_', 'update_', 'add_', 'delete_'].some(p => toolName.startsWith(p))) {
    console.log(
      `[McpExecutor] Write ok: provider=${connRow.provider} tool=${toolName} status=${result.statusCode ?? 'ok'} duration=${durationMs}ms`
    )
  }

  await supabase
    .from('integration_delivery_log')
    .insert({
      connection_id: connectionId,
      provider: connRow.provider,
      status: result.success ? 'delivered' : 'failed',
      attempt_count: 1,
      last_attempt_at: new Date().toISOString(),
      payload: {
        tool_name: toolName,
        input,
        duration_ms: durationMs,
        token_refreshed_before_execute: refreshedBeforeExecute,
        token_refreshed_after_401: refreshedAfter401,
      },
      response: {
        success: result.success,
        status_code: result.statusCode,
        error: result.error,
        data_preview: result.data
          ? JSON.stringify(result.data).slice(0, 500)
          : null,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)

  return result
}

export async function listToolsForConnection(connectionId: string): Promise<{
  tools: Array<{ name: string; description: string }>
  error?: string
}> {
  const supabase = createAdminClient()

  const { data: connection, error: connectionError } = await supabase
    .from('integration_connections')
    .select('provider')
    .eq('id', connectionId)
    .single()

  if (connectionError || !connection) {
    return { tools: [], error: 'Connection not found' }
  }

  const connRow = connection as { provider: string }
  const tools = await getToolsForProvider(connRow.provider)

  return {
    tools: tools.map((t) => ({ name: t.name, description: t.description })),
  }
}

export async function listAvailableProviders(): Promise<
  Array<{ id: string; name: string; description: string; hasOAuth: boolean }>
> {
  const { listProviderPacks } = await import('./provider-packs')
  const packs = listProviderPacks()

  return packs.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    hasOAuth: !!p.oauth,
  }))
}
