export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateAuthorizationUrl } from '@/lib/integrations/oauth'
import { getProviderPack } from '@/lib/integrations/provider-packs'
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateKey = createRateLimitKey(user.id, 'oauth-connect')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.oauthConnect)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: Math.ceil((rateCheck.resetAt - Date.now()) / 1000) },
        { status: 429 }
      )
    }

    const provider = request.nextUrl.searchParams.get('provider')
    const returnUrl = request.nextUrl.searchParams.get('return_url') || undefined
    const connectionId = request.nextUrl.searchParams.get('connection_id') || undefined

    if (!provider) {
      return NextResponse.json({ error: 'Missing provider parameter' }, { status: 400 })
    }

    const pack = getProviderPack(provider)
    if (!pack) {
      return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 })
    }

    if (!pack.oauth) {
      return NextResponse.json(
        { error: `Provider ${provider} does not support OAuth` },
        { status: 400 }
      )
    }

    const result = await generateAuthorizationUrl(provider, user.id, returnUrl, connectionId)

    return NextResponse.redirect(result.url)
  } catch (error) {
    console.error('[OAuth Connect] Error:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
