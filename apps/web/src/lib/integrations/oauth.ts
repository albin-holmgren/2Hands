/**
 * OAuth Flow Helpers
 * 
 * Handles OAuth authorization URL generation, token exchange, and credential storage.
 */

import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ProviderPack, OAuthConfig } from './types'
import { getProviderPack } from './provider-packs'

export interface OAuthState {
  provider: string
  userId: string
  connectionId: string
  codeVerifier?: string
  returnUrl?: string
}

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

function encryptState(state: OAuthState): string {
  const keyHex = (process.env.CREDENTIAL_ENCRYPTION_KEY || '').trim()
  if (!keyHex) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY not configured')
  }

  const key = Buffer.from(keyHex, 'hex')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })

  const plaintext = JSON.stringify(state)
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
}

export function decryptState(encryptedState: string): OAuthState {
  const keyHex = (process.env.CREDENTIAL_ENCRYPTION_KEY || '').trim()
  if (!keyHex) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY not configured')
  }

  const key = Buffer.from(keyHex, 'hex')
  const parts = encryptedState.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid state format')
  }

  const [ivHex, authTagHex, ciphertext] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return JSON.parse(decrypted) as OAuthState
}

function getEnvVar(name: string): string {
  const value = (process.env[name] || '').trim()
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`)
  }
  return value
}

async function getSlackAppOAuthCredentials(params: {
  connectionId: string
  userId: string
}): Promise<{ clientId: string; clientSecret: string; signingSecret: string }> {
  const supabase = createAdminClient()

  const { data: connection, error: connectionError } = await supabase
    .from('integration_connections')
    .select('user_id, provider, config')
    .eq('id', params.connectionId)
    .single()

  if (connectionError || !connection) {
    throw new Error('Connection not found')
  }

  const connRow = connection as { user_id: string; provider: string; config: Record<string, unknown> }
  if (connRow.user_id !== params.userId) {
    throw new Error('Connection does not belong to user')
  }

  if (connRow.provider !== 'slack') {
    throw new Error('Connection provider mismatch')
  }

  const config = connRow.config || {}
  const slackAppCredentialId = typeof config.slack_app_credential_id === 'string' ? config.slack_app_credential_id : ''
  if (!slackAppCredentialId) {
    throw new Error('Slack app credentials not configured for this connection')
  }

  const { data: credential, error: credentialError } = await supabase
    .from('credentials')
    .select('encrypted_data, iv')
    .eq('id', slackAppCredentialId)
    .eq('user_id', params.userId)
    .single()

  if (credentialError || !credential) {
    throw new Error('Slack app credential not found')
  }

  const credRow = credential as { encrypted_data: string; iv: string }
  const decrypted = decryptStoredOAuthPayload(credRow.encrypted_data, credRow.iv)
  const parsed = JSON.parse(decrypted) as Record<string, unknown>

  const clientId = typeof parsed.client_id === 'string' ? parsed.client_id.trim() : ''
  const clientSecret = typeof parsed.client_secret === 'string' ? parsed.client_secret.trim() : ''
  const signingSecret = typeof parsed.signing_secret === 'string' ? parsed.signing_secret.trim() : ''

  if (!clientId || !clientSecret || !signingSecret) {
    throw new Error('Invalid Slack app credential payload')
  }

  return { clientId, clientSecret, signingSecret }
}

function decryptStoredOAuthPayload(encryptedData: string, iv: string): string {
  const keyHex = (process.env.CREDENTIAL_ENCRYPTION_KEY || '').trim()
  if (!keyHex) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY not configured')
  }

  const key = Buffer.from(keyHex, 'hex')

  if (encryptedData.includes(':')) {
    const parts = encryptedData.split(':')
    if (parts.length === 3) {
      const [storedIv, authTagHex, ciphertext] = parts
      const storedIvBuffer = Buffer.from(storedIv || iv, 'hex')
      const authTag = Buffer.from(authTagHex, 'hex')

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, storedIvBuffer, { authTagLength: 16 })
      decipher.setAuthTag(authTag)

      let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      return decrypted
    }
  }

  const ivBuffer = Buffer.from(iv, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer, { authTagLength: 16 })

  const cipherBuffer = Buffer.from(encryptedData, 'hex')
  const authTag = cipherBuffer.slice(-16)
  const ciphertext = cipherBuffer.slice(0, -16)

  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(ciphertext)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString('utf8')
}

export interface AuthorizationUrlResult {
  url: string
  state: string
  connectionId: string
}

export async function generateAuthorizationUrl(
  provider: string,
  userId: string,
  returnUrl?: string,
  connectionId?: string
): Promise<AuthorizationUrlResult> {
  const pack = getProviderPack(provider)
  if (!pack || !pack.oauth) {
    throw new Error(`Provider ${provider} does not support OAuth`)
  }

  const oauth = pack.oauth

  let effectiveConnectionId = connectionId
  const supabase = createAdminClient()
  const nowIso = new Date().toISOString()

  if (provider === 'slack' && !effectiveConnectionId) {
    throw new Error('Slack requires an existing connection_id')
  }

  if (effectiveConnectionId) {
    const { data: existing, error: existingError } = await supabase
      .from('integration_connections')
      .select('id, user_id, provider, config')
      .eq('id', effectiveConnectionId)
      .single()

    if (existingError || !existing) {
      throw new Error('Connection not found')
    }

    const existingRow = existing as { id: string; user_id: string; provider: string; config: Record<string, unknown> }
    if (existingRow.user_id !== userId) {
      throw new Error('Connection does not belong to user')
    }

    if (existingRow.provider !== provider) {
      throw new Error('Connection provider mismatch')
    }

    const nextConfig = {
      ...(existingRow.config || {}),
      oauth_initiated_at: nowIso,
    }

    await supabase
      .from('integration_connections')
      .update({ status: 'pending', config: nextConfig, updated_at: nowIso } as never)
      .eq('id', effectiveConnectionId)
  } else {
    const { data: connection, error: insertError } = await supabase
      .from('integration_connections')
      .insert({
        user_id: userId,
        provider,
        status: 'pending',
        config: { oauth_initiated_at: nowIso },
        created_at: nowIso,
        updated_at: nowIso,
      } as never)
      .select('id')
      .single()

    if (insertError || !connection) {
      throw new Error('Failed to create pending connection')
    }

    effectiveConnectionId = (connection as { id: string }).id
  }

  let clientId: string
  if (provider === 'slack') {
    const slackCreds = await getSlackAppOAuthCredentials({ connectionId: effectiveConnectionId, userId })
    clientId = slackCreds.clientId
  } else {
    clientId = getEnvVar(oauth.clientIdEnvVar)
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim() || 'http://localhost:3000'
  const redirectUri = `${appUrl}/api/integrations/oauth/callback`

  const statePayload: OAuthState = {
    provider,
    userId,
    connectionId: effectiveConnectionId,
    returnUrl,
  }

  let codeVerifier: string | undefined
  let codeChallenge: string | undefined

  if (oauth.pkce) {
    codeVerifier = generateCodeVerifier()
    codeChallenge = generateCodeChallenge(codeVerifier)
    statePayload.codeVerifier = codeVerifier
  }

  const encryptedState = encryptState(statePayload)

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: oauth.scopes.join(' '),
    state: encryptedState,
  })

  if (oauth.pkce && codeChallenge) {
    params.set('code_challenge', codeChallenge)
    params.set('code_challenge_method', 'S256')
  }

  if (oauth.extraAuthParams) {
    for (const [key, value] of Object.entries(oauth.extraAuthParams)) {
      params.set(key, value)
    }
  }

  const url = `${oauth.authorizationUrl}?${params.toString()}`

  return { url, state: encryptedState, connectionId: effectiveConnectionId }
}

export interface TokenExchangeResult {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  tokenType?: string
  scope?: string
}

export async function exchangeCodeForTokens(
  provider: string,
  code: string,
  codeVerifier?: string,
  connectionId?: string,
  userId?: string
): Promise<TokenExchangeResult> {
  const pack = getProviderPack(provider)
  if (!pack || !pack.oauth) {
    throw new Error(`Provider ${provider} does not support OAuth`)
  }

  const oauth = pack.oauth

  let clientId: string
  let clientSecret: string

  if (provider === 'slack') {
    if (!connectionId || !userId) {
      throw new Error('Slack token exchange requires connection_id and user_id')
    }
    const slackCreds = await getSlackAppOAuthCredentials({ connectionId, userId })
    clientId = slackCreds.clientId
    clientSecret = slackCreds.clientSecret
  } else {
    clientId = getEnvVar(oauth.clientIdEnvVar)
    clientSecret = getEnvVar(oauth.clientSecretEnvVar)
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim() || 'http://localhost:3000'
  const redirectUri = `${appUrl}/api/integrations/oauth/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })

  if (oauth.pkce && codeVerifier) {
    params.set('code_verifier', codeVerifier)
  }

  const response = await fetch(oauth.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: params.toString(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[OAuth] Token exchange failed:', response.status, errorText)
    throw new Error(`Token exchange failed: ${response.status}`)
  }

  const data = await response.json()

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
    scope: data.scope,
  }
}

export async function storeOAuthCredentials(
  connectionId: string,
  userId: string,
  provider: string,
  tokens: TokenExchangeResult
): Promise<void> {
  const supabase = createAdminClient()

  const keyHex = (process.env.CREDENTIAL_ENCRYPTION_KEY || '').trim()
  if (!keyHex) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY not configured')
  }

  const key = Buffer.from(keyHex, 'hex')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })

  const tokenData = JSON.stringify({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    token_type: tokens.tokenType,
    scope: tokens.scope,
  })

  let encrypted = cipher.update(tokenData, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()

  const encryptedData = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`

  const expiresAt = tokens.expiresIn
    ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
    : null

  const nowIso = new Date().toISOString()

  const { data: credential, error: credError } = await supabase
    .from('credentials')
    .insert({
      user_id: userId,
      service_name: provider,
      credential_type: 'oauth',
      encrypted_data: encryptedData,
      iv: iv.toString('hex'),
      created_at: nowIso,
      expires_at: expiresAt,
    } as never)
    .select('id')
    .single()

  if (credError || !credential) {
    throw new Error('Failed to store credentials')
  }

  const credentialId = (credential as { id: string }).id

  const { error: updateError } = await supabase
    .from('integration_connections')
    .update({
      status: 'active',
      credential_id: credentialId,
      updated_at: nowIso,
    } as never)
    .eq('id', connectionId)

  if (updateError) {
    throw new Error('Failed to update connection')
  }
}

export async function refreshAccessToken(
  connectionId: string
): Promise<{ accessToken: string; expiresAt?: string } | null> {
  const supabase = createAdminClient()

  const { data: connection, error: connError } = await supabase
    .from('integration_connections')
    .select('provider, credential_id, user_id, config')
    .eq('id', connectionId)
    .single()

  if (connError || !connection) {
    return null
  }

  const connRow = connection as {
    provider: string
    credential_id: string | null
    user_id: string
    config?: Record<string, unknown>
  }
  if (!connRow.credential_id) {
    return null
  }

  const pack = getProviderPack(connRow.provider)
  if (!pack || !pack.oauth) {
    return null
  }

  const { data: credential, error: credError } = await supabase
    .from('credentials')
    .select('encrypted_data, iv')
    .eq('id', connRow.credential_id)
    .single()

  if (credError || !credential) {
    return null
  }

  const credRow = credential as { encrypted_data: string; iv: string }

  let tokens: { access_token: string; refresh_token?: string }
  try {
    const decrypted = decryptStoredOAuthPayload(credRow.encrypted_data, credRow.iv)
    tokens = JSON.parse(decrypted) as { access_token: string; refresh_token?: string }
  } catch (error) {
    console.error('[OAuth] Failed to decrypt stored tokens for refresh:', error)
    return null
  }

  if (!tokens.refresh_token) {
    return null
  }

  const oauth = pack.oauth
  let clientId: string
  let clientSecret: string

  if (connRow.provider === 'slack') {
    try {
      const slackCreds = await getSlackAppOAuthCredentials({ connectionId, userId: connRow.user_id })
      clientId = slackCreds.clientId
      clientSecret = slackCreds.clientSecret
    } catch (error) {
      console.error('[OAuth] Missing Slack app credentials for refresh:', error)
      return null
    }
  } else {
    try {
      clientId = getEnvVar(oauth.clientIdEnvVar)
      clientSecret = getEnvVar(oauth.clientSecretEnvVar)
    } catch (error) {
      console.error('[OAuth] Missing OAuth env vars for refresh:', error)
      return null
    }
  }

  const keyHex = (process.env.CREDENTIAL_ENCRYPTION_KEY || '').trim()
  if (!keyHex) {
    return null
  }

  const key = Buffer.from(keyHex, 'hex')

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: tokens.refresh_token,
    grant_type: 'refresh_token',
  })

  const response = await fetch(oauth.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: params.toString(),
  })

  if (!response.ok) {
    console.error('[OAuth] Token refresh failed:', response.status)
    return null
  }

  const data = await response.json()

  const newTokenData = JSON.stringify({
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    token_type: data.token_type,
    scope: data.scope,
  })

  const newIv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, newIv, { authTagLength: 16 })
  let newEncrypted = cipher.update(newTokenData, 'utf8', 'hex')
  newEncrypted += cipher.final('hex')
  const newAuthTag = cipher.getAuthTag()
  const newEncryptedData = `${newIv.toString('hex')}:${newAuthTag.toString('hex')}:${newEncrypted}`

  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : null

  await supabase
    .from('credentials')
    .update({
      encrypted_data: newEncryptedData,
      iv: newIv.toString('hex'),
      expires_at: expiresAt,
    } as never)
    .eq('id', connRow.credential_id)

  return { accessToken: data.access_token, expiresAt: expiresAt || undefined }
}
