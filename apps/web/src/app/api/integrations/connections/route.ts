export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listAvailableProviders } from '@/lib/integrations'
import { getProviderPack } from '@/lib/integrations/provider-packs'
import { resolveCustomManifest } from '@/lib/integrations/credential-helpers'
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import {
  applyDefaultChannelTrustConfig,
  approveExternalUser,
  revokeExternalUser,
  supportsChannelTrustProvider,
} from '@/lib/security/channel-trust'
import { applyDefaultCapabilityConfig } from '@/lib/security/capability-profile'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'
import crypto from 'crypto'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateKey = createRateLimitKey(user.id, 'integrations-connections:get')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.general)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: Math.ceil((rateCheck.resetAt - Date.now()) / 1000) },
        { status: 429 }
      )
    }

    const requestedWorkspaceId = request.nextUrl.searchParams.get('workspaceId')
      || request.cookies.get('2hands_active_workspace_id')?.value
      || null

    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })

    if (!scope.workspaceId || !scope.role) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 403 })
    }

    const { data: connections, error: connError } = await supabase
      .from('integration_connections')
      .select('id, provider, status, config, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('workspace_id', scope.workspaceId)
      .order('created_at', { ascending: false })

    if (connError) {
      return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 })
    }

    return NextResponse.json({ connections: connections || [] })
  } catch (error) {
    console.error('[IntegrationConnections] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateKey = createRateLimitKey(user.id, 'integrations-connections:post')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.general)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: Math.ceil((rateCheck.resetAt - Date.now()) / 1000) },
        { status: 429 }
      )
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const provider = typeof body.provider === 'string' ? body.provider.trim() : ''
    const config = body.config && typeof body.config === 'object' ? (body.config as Record<string, unknown>) : {}

    if (!provider) {
      return NextResponse.json({ error: 'Missing required field: provider' }, { status: 400 })
    }

    // Validate provider: accept provider-pack providers, connector-fields providers, and custom providers
    await listAvailableProviders() // warm up the list (side-effect: validates env)
    const fullProviderPack = getProviderPack(provider)

    let isApiKeyOnlyProvider = false
    if (fullProviderPack) {
      // Provider pack found — API-key provider if it has apiKeyAuth and no OAuth
      isApiKeyOnlyProvider = !!(fullProviderPack.apiKeyAuth && !fullProviderPack.oauth)
    } else {
      const { getConnectorConfig } = await import('@/lib/integrations/connector-fields')
      const connectorConfig = getConnectorConfig(provider)
      if (connectorConfig) {
        isApiKeyOnlyProvider = connectorConfig.fields.length > 0
      } else {
        // Check if this is a registered custom provider (manifest stored in integration_connections)
        const adminForCheck = createAdminClient()
        const { data: existingConn } = await adminForCheck
          .from('integration_connections')
          .select('config')
          .eq('user_id', user.id)
          .eq('provider', provider)
          .limit(1)
          .maybeSingle()
        const customManifest = existingConn
          ? resolveCustomManifest((existingConn as { config: Record<string, unknown> }).config || {})
          : null
        if (!customManifest) {
          return NextResponse.json(
            { error: `Unknown provider: ${provider}. Register it first with the AI using register_custom_provider.` },
            { status: 400 }
          )
        }
        isApiKeyOnlyProvider = true
      }
    }

    const requestedWorkspaceId = (typeof body.workspaceId === 'string' && body.workspaceId.trim())
      || request.cookies.get('2hands_active_workspace_id')?.value
      || null

    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })

    if (!scope.workspaceId || !scope.role) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 403 })
    }

    const nowIso = new Date().toISOString()

    let nextConfig: Record<string, unknown> = applyDefaultCapabilityConfig({ ...config })
    nextConfig = applyDefaultChannelTrustConfig(nextConfig, provider)
    let connectionStatus: 'pending' | 'active' = 'pending'

    // Handle API-key-only providers (openai, perplexity, firecrawl, elevenlabs, etc.)
    if (isApiKeyOnlyProvider) {
      // Extract and encrypt all secret fields from config
      const secretFields = Object.entries(config).filter(
        ([k]) => k.includes('key') || k.includes('secret') || k.includes('token') || k.includes('password')
      )

      if (secretFields.length === 0) {
        return NextResponse.json(
          { error: `Provider ${provider} requires at least one secret field (key/secret/token/password)` },
          { status: 400 }
        )
      }

      const keyHex = (process.env.CREDENTIAL_ENCRYPTION_KEY || '').trim()
      console.log('[IntegrationConnections] keyHex present:', !!keyHex, 'length:', keyHex.length)
      if (!keyHex) {
        console.error('[IntegrationConnections] CREDENTIAL_ENCRYPTION_KEY not configured for API-key provider')
        return NextResponse.json({ error: 'Server misconfigured: key missing' }, { status: 500 })
      }

      const key = Buffer.from(keyHex, 'hex')
      console.log('[IntegrationConnections] key buffer length:', key.length)
      if (key.length !== 32) {
        console.error('[IntegrationConnections] Invalid CREDENTIAL_ENCRYPTION_KEY length:', key.length, '(need 32)')
        return NextResponse.json({ error: 'Server misconfigured: key length ' + key.length }, { status: 500 })
      }

      const iv = crypto.randomBytes(12)
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
      const plaintext = JSON.stringify(Object.fromEntries(secretFields))
      let encrypted = cipher.update(plaintext, 'utf8', 'hex')
      encrypted += cipher.final('hex')
      const authTag = cipher.getAuthTag()
      const encryptedData = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`

      const { data: cred, error: credError } = await supabase
        .from('credentials')
        .upsert({
          user_id: user.id,
          workspace_id: scope.workspaceId,
          service_name: `${provider}_api`,
          credential_type: 'api_key',
          encrypted_data: encryptedData,
          iv: iv.toString('hex'),
          created_at: nowIso,
          expires_at: null,
        } as never, { onConflict: 'user_id,service_name' })
        .select('id')
        .single()

      if (credError || !cred) {
        console.error('[IntegrationConnections] Failed to store API-key credential:', JSON.stringify(credError))
        return NextResponse.json({ error: 'Failed to store credential: ' + credError?.message }, { status: 500 })
      }

      const credId = (cred as { id: string }).id
      // Remove raw secrets from config, store credential reference
      for (const [k] of secretFields) {
        delete nextConfig[k]
      }
      nextConfig.credential_id = credId

      // Generic live verification: if this provider declares a verifyEndpoint, use it
      const pack = getProviderPack(provider)
      if (pack?.verifyEndpoint && pack.apiKeyAuth) {
        const credFieldName = pack.credentialKeyField || 'api_key'
        const credEntry = secretFields.find(([k]) => k === credFieldName) || secretFields[0]
        const rawKey = credEntry ? String(credEntry[1]).trim() : ''
        if (rawKey) {
          try {
            const verifyUrl = `${pack.baseUrl}${pack.verifyEndpoint.path}`
            const authValue = pack.apiKeyAuth.headerPrefix
              ? `${pack.apiKeyAuth.headerPrefix}${rawKey}`
              : rawKey
            const checkResp = await fetch(verifyUrl, {
              method: pack.verifyEndpoint.method || 'GET',
              headers: { [pack.apiKeyAuth.headerName]: authValue, 'Content-Type': 'application/json' },
            })
            if (!checkResp.ok) {
              const errBody = await checkResp.json().catch(() => null) as Record<string, unknown> | null
              await supabase.from('credentials').delete().eq('id', credId).eq('user_id', user.id)
              return NextResponse.json(
                { error: `${pack.name} API key is invalid (${checkResp.status}): ${errBody?.message || errBody?.error || 'check that the key has the right scopes'}` },
                { status: 400 }
              )
            }
          } catch {
            // Network error — still mark active (don't block on transient failures)
          }
        }
      }

      // API-key providers are active immediately (no OAuth needed)
      connectionStatus = 'active'
    }

    if (provider === 'slack') {
      const existingSlackAppCredentialId = typeof config.slack_app_credential_id === 'string'
        ? config.slack_app_credential_id.trim()
        : ''

      const slackClientId = typeof config.slack_client_id === 'string' ? config.slack_client_id.trim() : ''
      const slackClientSecret = typeof config.slack_client_secret === 'string' ? config.slack_client_secret.trim() : ''
      const slackSigningSecret = typeof config.slack_signing_secret === 'string' ? config.slack_signing_secret.trim() : ''

      if (!existingSlackAppCredentialId && (!slackClientId || !slackClientSecret || !slackSigningSecret)) {
        return NextResponse.json(
          { error: 'Slack requires slack_client_id, slack_client_secret, and slack_signing_secret' },
          { status: 400 }
        )
      }

      if (!existingSlackAppCredentialId && slackClientId && slackClientSecret && slackSigningSecret) {
        const keyHex = (process.env.CREDENTIAL_ENCRYPTION_KEY || '').trim()
        if (!keyHex) {
          return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
        }

        const key = Buffer.from(keyHex, 'hex')
        if (key.length !== 32) {
          return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
        }

        const iv = crypto.randomBytes(12)
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })

        const plaintext = JSON.stringify({
          client_id: slackClientId,
          client_secret: slackClientSecret,
          signing_secret: slackSigningSecret,
        })

        let encrypted = cipher.update(plaintext, 'utf8', 'hex')
        encrypted += cipher.final('hex')
        const authTag = cipher.getAuthTag()
        const encryptedData = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`

        const { data: cred, error: credError } = await supabase
          .from('credentials')
          .insert({
            user_id: user.id,
            workspace_id: scope.workspaceId,
            service_name: 'slack_app',
            credential_type: 'api_key',
            encrypted_data: encryptedData,
            iv: iv.toString('hex'),
            created_at: nowIso,
            expires_at: null,
          } as never)
          .select('id')
          .single()

        if (credError || !cred) {
          console.error('[IntegrationConnections] Failed to store Slack app credential:', credError)
          return NextResponse.json({ error: 'Failed to store Slack app credentials' }, { status: 500 })
        }

        const credId = (cred as { id: string }).id

        delete nextConfig.slack_client_id
        delete nextConfig.slack_client_secret
        delete nextConfig.slack_signing_secret
        nextConfig.slack_app_credential_id = credId
      }
    }

    const { data: connection, error: insertError } = await supabase
      .from('integration_connections')
      .upsert({
        user_id: user.id,
        workspace_id: scope.workspaceId,
        provider,
        status: connectionStatus,
        config: nextConfig,
        created_at: nowIso,
        updated_at: nowIso,
      } as never, { onConflict: 'user_id,workspace_id,provider' })
      .select('id, provider, status, config, created_at')
      .single()

    if (insertError || !connection) {
      // Fall back to update if upsert fails (e.g. missing unique constraint)
      console.error('[IntegrationConnections] Failed to upsert connection:', JSON.stringify(insertError))
      const { data: updatedConn, error: updateError } = await supabase
        .from('integration_connections')
        .update({ status: connectionStatus, config: nextConfig, updated_at: nowIso } as never)
        .eq('user_id', user.id)
        .eq('workspace_id', scope.workspaceId)
        .eq('provider', provider)
        .select('id, provider, status, config, created_at')
        .maybeSingle()
      if (updateError) {
        console.error('[IntegrationConnections] Fallback update also failed:', JSON.stringify(updateError))
        return NextResponse.json({ error: 'Failed to save connection: ' + (updateError?.message || insertError?.message) }, { status: 500 })
      }
      if (updatedConn) {
        return NextResponse.json({ connection: updatedConn })
      }
      // No existing row — insert directly
      const adminDb = createAdminClient()
      const { data: insertedConn, error: insertErr2 } = await adminDb
        .from('integration_connections')
        .insert({
          user_id: user.id,
          workspace_id: scope.workspaceId,
          provider,
          status: connectionStatus,
          config: nextConfig,
          created_at: nowIso,
          updated_at: nowIso,
        } as never)
        .select('id, provider, status, config, created_at')
        .single()
      if (insertErr2 || !insertedConn) {
        console.error('[IntegrationConnections] Fallback insert also failed:', JSON.stringify(insertErr2))
        return NextResponse.json({ error: 'Failed to save connection: ' + (insertErr2?.message || insertError?.message) }, { status: 500 })
      }
      return NextResponse.json({ connection: insertedConn })
    }

    return NextResponse.json({ connection })
  } catch (error) {
    console.error('[IntegrationConnections] POST error:', String(error))
    return NextResponse.json({ error: 'Internal server error: ' + String(error) }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateKey = createRateLimitKey(user.id, 'integrations-connections:delete')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.general)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: Math.ceil((rateCheck.resetAt - Date.now()) / 1000) },
        { status: 429 }
      )
    }

    const connectionId = request.nextUrl.searchParams.get('id')
    if (!connectionId) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 })
    }

    const requestedWorkspaceId = request.nextUrl.searchParams.get('workspaceId')
      || request.cookies.get('2hands_active_workspace_id')?.value
      || null

    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })

    if (!scope.workspaceId || !scope.role) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 403 })
    }

    const { data: connection, error: connError } = await supabase
      .from('integration_connections')
      .select('id, user_id, provider, config')
      .eq('id', connectionId)
      .eq('workspace_id', scope.workspaceId)
      .single()

    if (connError || !connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const connRow = connection as { id: string; user_id: string; provider: string; config: Record<string, unknown> | null }
    if (connRow.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Clean up associated credentials before deleting the connection
    if (connRow.provider === 'slack' && connRow.config) {
      const slackAppCredentialId = typeof connRow.config.slack_app_credential_id === 'string'
        ? connRow.config.slack_app_credential_id
        : ''
      if (slackAppCredentialId) {
        await supabase
          .from('credentials')
          .delete()
          .eq('id', slackAppCredentialId)
          .eq('user_id', user.id)
      }
    }

    // Also clean up OAuth credential if present
    const { data: connFull } = await supabase
      .from('integration_connections')
      .select('credential_id')
      .eq('id', connectionId)
      .single()

    const credentialId = (connFull as { credential_id: string | null } | null)?.credential_id
    if (credentialId) {
      await supabase
        .from('credentials')
        .delete()
        .eq('id', credentialId)
        .eq('user_id', user.id)
    }

    const { error: deleteError } = await supabase
      .from('integration_connections')
      .delete()
      .eq('id', connectionId)

    if (deleteError) {
      return NextResponse.json({ error: 'Failed to delete connection' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[IntegrationConnections] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateKey = createRateLimitKey(user.id, 'integrations-connections:patch')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.general)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: Math.ceil((rateCheck.resetAt - Date.now()) / 1000) },
        { status: 429 }
      )
    }

    const body = (await request.json().catch(() => null)) as {
      id?: string
      workspaceId?: string
      system_prompt?: string
      auto_respond?: boolean
      channel_access_policy?: string
      allowed_external_user_ids?: string[]
      approve_external_user_id?: string
      revoke_external_user_id?: string
      capability_profile?: string
      allowed_tools?: string[]
    } | null

    if (!body?.id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const requestedWorkspaceId = (typeof body.workspaceId === 'string' && body.workspaceId.trim())
      || request.cookies.get('2hands_active_workspace_id')?.value
      || null

    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })

    if (!scope.workspaceId || !scope.role) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 403 })
    }

    const { data: connection, error: connError } = await supabase
      .from('integration_connections')
      .select('id, user_id, provider, config')
      .eq('id', body.id)
      .eq('workspace_id', scope.workspaceId)
      .single()

    if (connError || !connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const connRow = connection as { id: string; user_id: string; provider: string; config: Record<string, unknown> | null }
    if (connRow.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const existingConfig = connRow.config || {}
    const nextConfig: Record<string, unknown> = applyDefaultChannelTrustConfig(
      applyDefaultCapabilityConfig({ ...existingConfig }),
      connRow.provider
    )
    const supportsChannelTrust = supportsChannelTrustProvider(connRow.provider)

    if (typeof body.system_prompt === 'string') {
      nextConfig.system_prompt = body.system_prompt.trim().slice(0, 4000)
    }
    if (typeof body.auto_respond === 'boolean') {
      nextConfig.auto_respond = body.auto_respond
    }
    if (supportsChannelTrust && typeof body.channel_access_policy === 'string') {
      nextConfig.channel_access_policy = body.channel_access_policy.trim().toLowerCase()
    }
    if (supportsChannelTrust && Array.isArray(body.allowed_external_user_ids)) {
      nextConfig.allowed_external_user_ids = body.allowed_external_user_ids
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim())
        .filter(Boolean)
    }
    if (supportsChannelTrust && typeof body.approve_external_user_id === 'string') {
      const approvedUserId = body.approve_external_user_id.trim()
      if (approvedUserId) {
        Object.assign(nextConfig, approveExternalUser(nextConfig, approvedUserId))
      }
    }
    if (supportsChannelTrust && typeof body.revoke_external_user_id === 'string') {
      const revokedUserId = body.revoke_external_user_id.trim()
      if (revokedUserId) {
        Object.assign(nextConfig, revokeExternalUser(nextConfig, revokedUserId))
      }
    }
    if (typeof body.capability_profile === 'string') {
      nextConfig.capability_profile = body.capability_profile.trim().toLowerCase()
    }
    if (Array.isArray(body.allowed_tools)) {
      nextConfig.allowed_tools = body.allowed_tools
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim())
        .filter(Boolean)
    }

    const { error: updateError } = await supabase
      .from('integration_connections')
      .update({ config: nextConfig, updated_at: new Date().toISOString() } as never)
      .eq('id', body.id)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update connection' }, { status: 500 })
    }

    return NextResponse.json({ success: true, config: nextConfig })
  } catch (error) {
    console.error('[IntegrationConnections] PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
