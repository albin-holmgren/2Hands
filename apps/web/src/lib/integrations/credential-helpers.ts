/**
 * Credential Helpers
 *
 * Generic credential decryption, lookup, and provider verification.
 * All provider-specific connection logic should route through here instead of
 * scattering per-connector code across chat/route.ts and connections/route.ts.
 */

import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getProviderPack } from './provider-packs'
import type { CustomProviderManifest } from './types'

type AdminClient = SupabaseClient

export function decryptJsonPayload(encryptedData: string): Record<string, unknown> | null {
  const keyHex = (process.env.CREDENTIAL_ENCRYPTION_KEY || '').trim()
  if (!keyHex) return null
  const key = Buffer.from(keyHex, 'hex')
  const parts = encryptedData.split(':')
  if (parts.length !== 3) return null
  try {
    const [ivHex, authTagHex, ciphertext] = parts
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'), { authTagLength: 16 })
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
    const json = decipher.update(ciphertext, 'hex', 'utf8') + decipher.final('utf8')
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

export function encryptJsonPayload(data: Record<string, unknown>): string {
  const keyHex = (process.env.CREDENTIAL_ENCRYPTION_KEY || '').trim()
  if (!keyHex) throw new Error('CREDENTIAL_ENCRYPTION_KEY not configured')
  const key = Buffer.from(keyHex, 'hex')
  if (key.length !== 32) throw new Error('CREDENTIAL_ENCRYPTION_KEY must be 32 bytes (64 hex chars)')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

export async function getStoredApiKey(
  adminClient: AdminClient,
  userId: string,
  providerId: string,
  workspaceId?: string | null
): Promise<string | null> {
  const pack = getProviderPack(providerId)
  const fieldName = pack?.credentialKeyField || 'api_key'

  let connQuery = adminClient
    .from('integration_connections')
    .select('config')
    .eq('user_id', userId)
    .eq('provider', providerId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)

  if (workspaceId) {
    connQuery = connQuery.eq('workspace_id', workspaceId)
  }

  const { data: conn } = await connQuery.maybeSingle()

  const credentialId = conn
    ? (typeof (conn as { config: Record<string, unknown> }).config?.credential_id === 'string'
      ? (conn as { config: Record<string, unknown> }).config.credential_id as string
      : null)
    : null

  let credRow: { encrypted_data: string } | null = null

  if (credentialId) {
    const { data } = await adminClient
      .from('credentials')
      .select('encrypted_data')
      .eq('id', credentialId)
      .maybeSingle()
    credRow = data as { encrypted_data: string } | null
  }

  if (!credRow) {
    const { data } = await adminClient
      .from('credentials')
      .select('encrypted_data')
      .eq('user_id', userId)
      .eq('service_name', `${providerId}_api`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    credRow = data as { encrypted_data: string } | null
  }

  if (!credRow) return null

  const parsed = decryptJsonPayload(credRow.encrypted_data)
  if (!parsed) return null

  if (typeof parsed[fieldName] === 'string') return parsed[fieldName] as string

  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === 'string' && (k.includes('key') || k.includes('token') || k.includes('secret'))) {
      return v
    }
  }

  return null
}

export interface VerifyResult {
  success: boolean
  message?: string
  error?: string
}

export async function verifyProviderConnection(
  adminClient: AdminClient,
  userId: string,
  providerId: string,
  customManifest?: CustomProviderManifest,
  workspaceId?: string | null
): Promise<VerifyResult> {
  let resolvedManifest = customManifest

  const pack = resolvedManifest
    ? {
        id: resolvedManifest.id,
        name: resolvedManifest.name,
        baseUrl: resolvedManifest.baseUrl,
        apiKeyAuth: resolvedManifest.apiKeyAuth,
        credentialKeyField: resolvedManifest.credentialKeyField,
        verifyEndpoint: resolvedManifest.verifyEndpoint,
        oauth: resolvedManifest.oauth,
      }
    : getProviderPack(providerId)

  let effectivePack = pack

  if (!effectivePack) {
    // Try to load a custom manifest from integration_connections
    let customConnQuery = adminClient
      .from('integration_connections')
      .select('config')
      .eq('user_id', userId)
      .eq('provider', providerId)
      .limit(1)
    if (workspaceId) customConnQuery = customConnQuery.eq('workspace_id', workspaceId)
    const { data: conn } = await customConnQuery.maybeSingle()
    const loaded = conn
      ? resolveCustomManifest((conn as { config: Record<string, unknown> }).config || {})
      : null
    if (loaded) {
      resolvedManifest = loaded
    }
    if (resolvedManifest) {
      effectivePack = {
        id: resolvedManifest.id,
        name: resolvedManifest.name,
        baseUrl: resolvedManifest.baseUrl,
        apiKeyAuth: resolvedManifest.apiKeyAuth,
        credentialKeyField: resolvedManifest.credentialKeyField,
        verifyEndpoint: resolvedManifest.verifyEndpoint,
        oauth: resolvedManifest.oauth,
      }
    }
  }

  if (!effectivePack) {
    return { success: false, error: `Unknown provider: ${providerId}. Register it first with register_custom_provider.` }
  }

  if (!effectivePack.oauth && !effectivePack.apiKeyAuth) {
    let q = adminClient.from('integration_connections').select('status').eq('user_id', userId).eq('provider', providerId).eq('status', 'active').limit(1)
    if (workspaceId) q = q.eq('workspace_id', workspaceId)
    const { data: conn } = await q.maybeSingle()
    return conn
      ? { success: true, message: `${effectivePack.name} connection is active.` }
      : { success: false, error: `No active ${effectivePack.name} connection found.` }
  }

  if (effectivePack.oauth && !effectivePack.apiKeyAuth) {
    let q = adminClient.from('integration_connections').select('status').eq('user_id', userId).eq('provider', providerId).eq('status', 'active').limit(1)
    if (workspaceId) q = q.eq('workspace_id', workspaceId)
    const { data: conn } = await q.maybeSingle()
    return conn
      ? { success: true, message: `${effectivePack.name} (OAuth) connection is active.` }
      : { success: false, error: `No active ${effectivePack.name} OAuth connection found. Connect it from Settings → Connectors.` }
  }

  if (!effectivePack.verifyEndpoint) {
    const apiKey = await getStoredApiKey(adminClient, userId, providerId, workspaceId)
    return apiKey
      ? { success: true, message: `${effectivePack.name} API key is stored and ready.` }
      : { success: false, error: `No ${effectivePack.name} API key found. Please connect ${effectivePack.name} first.` }
  }

  const apiKey = resolvedManifest
    ? await getCustomProviderApiKey(adminClient, userId, providerId, resolvedManifest, workspaceId)
    : await getStoredApiKey(adminClient, userId, providerId, workspaceId)

  if (!apiKey) {
    return { success: false, error: `No ${effectivePack.name} API key found. Please connect ${effectivePack.name} first.` }
  }

  const url = `${effectivePack.baseUrl}${effectivePack.verifyEndpoint.path}`
  const method = effectivePack.verifyEndpoint.method || 'GET'
  const authValue = effectivePack.apiKeyAuth!.headerPrefix
    ? `${effectivePack.apiKeyAuth!.headerPrefix}${apiKey}`
    : apiKey

  try {
    const resp = await fetch(url, {
      method,
      headers: {
        [effectivePack.apiKeyAuth!.headerName]: authValue,
        'Content-Type': 'application/json',
      },
    })

    if (resp.ok) {
      let detail = ''
      if (effectivePack.verifyEndpoint.workspacePath) {
        try {
          const data = await resp.json() as Record<string, unknown>
          const parts = effectivePack.verifyEndpoint.workspacePath.split('.')
          let val: unknown = data
          for (const p of parts) {
            if (val && typeof val === 'object') val = (val as Record<string, unknown>)[p]
          }
          if (typeof val === 'string' && val) detail = ` (${val})`
        } catch { /* ignore */ }
      }
      return { success: true, message: `${effectivePack.name} connected${detail}. API key is valid — use integration_call to make API requests.` }
    }

    const err = await resp.json().catch(() => ({})) as Record<string, unknown>
    const errMsg = (err.message || err.error || JSON.stringify(err)) as string
    return { success: false, error: `${effectivePack.name} API returned ${resp.status}: ${errMsg}. Key may be invalid or lack required scopes.` }
  } catch (e) {
    return { success: false, error: `${effectivePack.name} verification failed: ${String(e)}` }
  }
}

async function getCustomProviderApiKey(
  adminClient: AdminClient,
  userId: string,
  providerId: string,
  manifest: CustomProviderManifest,
  workspaceId?: string | null
): Promise<string | null> {
  const fieldName = manifest.credentialKeyField || manifest.fields[0]?.key || 'api_key'

  let connQuery = adminClient
    .from('integration_connections')
    .select('config')
    .eq('user_id', userId)
    .eq('provider', providerId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)

  if (workspaceId) {
    connQuery = connQuery.eq('workspace_id', workspaceId)
  }

  const { data: conn } = await connQuery.maybeSingle()

  const credentialId = conn
    ? (typeof (conn as { config: Record<string, unknown> }).config?.credential_id === 'string'
      ? (conn as { config: Record<string, unknown> }).config.credential_id as string
      : null)
    : null

  if (!credentialId) return null

  const { data } = await adminClient
    .from('credentials')
    .select('encrypted_data')
    .eq('id', credentialId)
    .maybeSingle()

  if (!data) return null

  const parsed = decryptJsonPayload((data as { encrypted_data: string }).encrypted_data)
  if (!parsed) return null

  return typeof parsed[fieldName] === 'string' ? parsed[fieldName] as string : null
}

export function resolveCustomManifest(config: Record<string, unknown>): CustomProviderManifest | null {
  if (!config._custom_manifest) return null
  try {
    const raw = typeof config._custom_manifest === 'string'
      ? JSON.parse(config._custom_manifest)
      : config._custom_manifest
    return raw as CustomProviderManifest
  } catch {
    return null
  }
}
