export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { decryptState, exchangeCodeForTokens, storeOAuthCredentials } from '@/lib/integrations/oauth'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit'

async function storeSlackConnectionMetadata(connectionId: string, accessToken: string): Promise<void> {
  const res = await fetch('https://slack.com/api/auth.test', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })

  const data = (await res.json().catch(() => null)) as {
    ok?: boolean
    team_id?: string
    user_id?: string
    bot_id?: string
    error?: string
  } | null

  if (!data?.ok) {
    console.error('[OAuth Callback] Slack auth.test failed:', data?.error || res.status)
    return
  }

  const teamId = typeof data.team_id === 'string' ? data.team_id.trim() : ''
  const userId = typeof data.user_id === 'string' ? data.user_id.trim() : ''
  const botId = typeof data.bot_id === 'string' ? data.bot_id.trim() : ''

  if (!teamId) {
    return
  }

  const supabase = createAdminClient()
  const { data: connection } = await supabase
    .from('integration_connections')
    .select('config')
    .eq('id', connectionId)
    .maybeSingle()

  const existingConfig = (connection as { config?: Record<string, unknown> } | null)?.config || {}
  const nextConfig: Record<string, unknown> = {
    ...existingConfig,
    team_id: teamId,
    ...(userId ? { slack_user_id: userId, slack_bot_user_id: userId } : {}),
    ...(botId ? { slack_bot_id: botId } : {}),
  }

  const nowIso = new Date().toISOString()
  await supabase
    .from('integration_connections')
    .update({ config: nextConfig, updated_at: nowIso } as never)
    .eq('id', connectionId)
}

export async function GET(request: NextRequest) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim() || 'http://localhost:3000'

  const rateLimitResponse = await checkRateLimit(request, 'integrations-oauth-callback', RATE_LIMITS.api)
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  try {
    const code = request.nextUrl.searchParams.get('code')
    const stateParam = request.nextUrl.searchParams.get('state')
    const error = request.nextUrl.searchParams.get('error')
    const errorDescription = request.nextUrl.searchParams.get('error_description')

    if (error) {
      console.error('[OAuth Callback] OAuth error:', error, errorDescription)
      const errorUrl = new URL('/app', appUrl)
      errorUrl.searchParams.set('error', error)
      if (errorDescription) {
        errorUrl.searchParams.set('error_description', errorDescription)
      }
      return NextResponse.redirect(errorUrl.toString())
    }

    if (!code || !stateParam) {
      const errorUrl = new URL('/app', appUrl)
      errorUrl.searchParams.set('error', 'missing_params')
      return NextResponse.redirect(errorUrl.toString())
    }

    let state
    try {
      state = decryptState(stateParam)
    } catch (e) {
      console.error('[OAuth Callback] Failed to decrypt state:', e)
      const errorUrl = new URL('/app', appUrl)
      errorUrl.searchParams.set('error', 'invalid_state')
      return NextResponse.redirect(errorUrl.toString())
    }

    const tokens = await exchangeCodeForTokens(
      state.provider,
      code,
      state.codeVerifier,
      state.connectionId,
      state.userId
    )

    if (state.provider === 'slack') {
      await storeSlackConnectionMetadata(state.connectionId, tokens.accessToken)
    }

    await storeOAuthCredentials(
      state.connectionId,
      state.userId,
      state.provider,
      tokens
    )

    const successUrl = state.returnUrl || `${appUrl}/settings/integrations`
    const redirectUrl = new URL(successUrl)
    redirectUrl.searchParams.set('connected', state.provider)
    redirectUrl.searchParams.set('connection_id', state.connectionId)

    return NextResponse.redirect(redirectUrl.toString())
  } catch (error) {
    console.error('[OAuth Callback] Error:', error)

    let stateData
    const stateParam = request.nextUrl.searchParams.get('state')
    if (stateParam) {
      try {
        stateData = decryptState(stateParam)

        const supabase = createAdminClient()
        await supabase
          .from('integration_connections')
          .update({
            status: 'failed',
            config: { error: error instanceof Error ? error.message : 'Unknown error' },
            updated_at: new Date().toISOString(),
          } as never)
          .eq('id', stateData.connectionId)
      } catch (e) {
        // Ignore decryption errors during cleanup
      }
    }

    const errorUrl = new URL('/app', appUrl)
    errorUrl.searchParams.set('error', 'token_exchange_failed')
    return NextResponse.redirect(errorUrl.toString())
  }
}
