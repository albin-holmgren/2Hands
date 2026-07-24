export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listToolsForConnection, executeTool, listAvailableProviders } from '@/lib/integrations'
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateKey = createRateLimitKey(user.id, 'integrations-tools:get')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.general)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: Math.ceil((rateCheck.resetAt - Date.now()) / 1000) },
        { status: 429 }
      )
    }

    const connectionId = request.nextUrl.searchParams.get('connection_id')

    if (connectionId) {
      const { data: connection, error: connError } = await supabase
        .from('integration_connections')
        .select('id, user_id')
        .eq('id', connectionId)
        .single()

      if (connError || !connection) {
        return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
      }

      const connRow = connection as { id: string; user_id: string }
      if (connRow.user_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const result = await listToolsForConnection(connectionId)
      return NextResponse.json(result)
    }

    const providers = await listAvailableProviders()
    return NextResponse.json({ providers })
  } catch (error) {
    console.error('[IntegrationTools] GET error:', error)
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

    const rateKey = createRateLimitKey(user.id, 'integrations-tools:post')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.integrationsToolExecute)
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

    const connectionId = typeof body.connection_id === 'string' ? body.connection_id.trim() : ''
    const toolName = typeof body.tool_name === 'string' ? body.tool_name.trim() : ''
    const input = body.input && typeof body.input === 'object' ? body.input : {}

    if (!connectionId || !toolName) {
      return NextResponse.json(
        { error: 'Missing required fields', required: ['connection_id', 'tool_name'] },
        { status: 400 }
      )
    }

    const { data: connection, error: connError } = await supabase
      .from('integration_connections')
      .select('id, user_id')
      .eq('id', connectionId)
      .single()

    if (connError || !connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const connRow = connection as { id: string; user_id: string }
    if (connRow.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await executeTool({
      connectionId,
      toolName,
      input: input as Record<string, unknown>,
      userId: user.id,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[IntegrationTools] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
