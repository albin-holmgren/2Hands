/**
 * API Key Management
 *
 * Enables external developers and enterprise users to programmatically
 * create agents, trigger runs, and get results via REST API.
 *
 * Security:
 *   - Keys are hashed (SHA-256) before storage — we never store raw keys
 *   - Keys have scoped permissions (read, write, admin)
 *   - Rate limits per key
 *   - Keys can be revoked instantly
 */

import { createClient } from '@/lib/supabase/server'
import { createHash, randomBytes } from 'crypto'

export interface ApiKey {
  id: string
  userId: string
  name: string
  keyPrefix: string        // First 8 chars for identification (e.g., "avt_ab12...")
  keyHash: string          // SHA-256 hash of the full key
  permissions: ApiPermission[]
  rateLimit: number        // requests per minute
  lastUsedAt: string | null
  expiresAt: string | null
  isActive: boolean
  createdAt: string
}

export type ApiPermission =
  | 'agents:read'
  | 'agents:write'
  | 'agents:run'
  | 'agents:delete'
  | 'workflows:read'
  | 'workflows:write'
  | 'workflows:run'
  | 'analytics:read'
  | 'webhooks:manage'

export const PERMISSION_PRESETS = {
  readonly: ['agents:read', 'analytics:read', 'workflows:read'] as ApiPermission[],
  standard: ['agents:read', 'agents:write', 'agents:run', 'workflows:read', 'workflows:run', 'analytics:read'] as ApiPermission[],
  admin: ['agents:read', 'agents:write', 'agents:run', 'agents:delete', 'workflows:read', 'workflows:write', 'workflows:run', 'analytics:read', 'webhooks:manage'] as ApiPermission[],
}

/**
 * Generate a new API key. Returns the raw key — this is the ONLY time it's visible.
 */
export async function createApiKey(
  userId: string,
  workspaceId: string,
  name: string,
  permissions: ApiPermission[] = PERMISSION_PRESETS.standard,
  options?: { rateLimit?: number; expiresInDays?: number }
): Promise<{ key: ApiKey; rawKey: string }> {
  const supabase = await createClient()

  // Generate a cryptographically secure key
  const rawKey = `avt_${randomBytes(32).toString('base64url')}`
  const keyPrefix = rawKey.slice(0, 12)
  const keyHash = hashKey(rawKey)

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const expiresAt = options?.expiresInDays
    ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null

  const { error } = await supabase
    .from('api_keys')
    .insert({
      id,
      user_id: userId,
      workspace_id: workspaceId,
      name,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      permissions,
      rate_limit: options?.rateLimit || 60,
      expires_at: expiresAt,
      is_active: true,
      created_at: now,
    } as never)

  if (error) {
    console.error('[ApiKeys] Failed to create:', error)
    throw new Error('Failed to create API key')
  }

  const key: ApiKey = {
    id,
    userId,
    name,
    keyPrefix,
    keyHash,
    permissions,
    rateLimit: options?.rateLimit || 60,
    lastUsedAt: null,
    expiresAt,
    isActive: true,
    createdAt: now,
  }

  return { key, rawKey }
}

/**
 * Validate an API key and return the associated user + permissions.
 * Returns null if invalid.
 */
export async function validateApiKey(rawKey: string): Promise<{
  userId: string
  keyId: string
  permissions: ApiPermission[]
  rateLimit: number
} | null> {
  if (!rawKey.startsWith('avt_')) return null

  const supabase = await createClient()
  const keyHash = hashKey(rawKey)

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, user_id, permissions, rate_limit, is_active, expires_at')
    .eq('key_hash', keyHash)
    .single()

  if (error || !data) return null

  const key = data as {
    id: string
    user_id: string
    permissions: ApiPermission[]
    rate_limit: number
    is_active: boolean
    expires_at: string | null
  }

  // Check if key is active
  if (!key.is_active) return null

  // Check expiration
  if (key.expires_at && new Date(key.expires_at) < new Date()) return null

  // Update last_used_at (fire-and-forget)
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() } as never)
    .eq('id', key.id)
    .then(() => {})

  return {
    userId: key.user_id,
    keyId: key.id,
    permissions: key.permissions,
    rateLimit: key.rate_limit,
  }
}

/**
 * List all API keys for a user (without hashes).
 */
export async function listApiKeys(userId: string, workspaceId: string): Promise<Omit<ApiKey, 'keyHash'>[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, user_id, name, key_prefix, permissions, rate_limit, last_used_at, expires_at, is_active, created_at')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return (data as Array<Record<string, unknown>>).map(d => ({
    id: d.id as string,
    userId: d.user_id as string,
    name: d.name as string,
    keyPrefix: d.key_prefix as string,
    permissions: d.permissions as ApiPermission[],
    rateLimit: d.rate_limit as number,
    lastUsedAt: d.last_used_at as string | null,
    expiresAt: d.expires_at as string | null,
    isActive: d.is_active as boolean,
    createdAt: d.created_at as string,
  }))
}

/**
 * Revoke an API key.
 */
export async function revokeApiKey(userId: string, workspaceId: string, keyId: string): Promise<boolean> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('api_keys')
    .update({ is_active: false } as never)
    .eq('id', keyId)
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)

  return !error
}

/**
 * Check if a key has a specific permission.
 */
export function hasPermission(permissions: ApiPermission[], required: ApiPermission): boolean {
  return permissions.includes(required)
}

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex')
}
