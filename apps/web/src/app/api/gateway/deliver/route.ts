export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

type GatewayDeliverRequest = {
  provider: string
  connection_id: string
  external_thread_id?: string | null
  conversation_id?: string | null
  payload: Record<string, unknown>
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const idempotencyKeyHeader = request.headers.get('idempotency-key')
  const gatewaySecret = (process.env.GATEWAY_SECRET || '').trim()

  if (!gatewaySecret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${gatewaySecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as GatewayDeliverRequest | null
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const provider = typeof body.provider === 'string' ? body.provider.trim() : ''
  const connectionId = typeof body.connection_id === 'string' ? body.connection_id.trim() : ''
  const externalThreadId = typeof body.external_thread_id === 'string' ? body.external_thread_id.trim() : null
  const conversationId = typeof body.conversation_id === 'string' ? body.conversation_id.trim() : null
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : null
  const idempotencyKey = typeof idempotencyKeyHeader === 'string' ? idempotencyKeyHeader.trim() : null

  if (!provider || !connectionId || !payload) {
    return NextResponse.json(
      {
        error: 'Missing required fields',
        required: ['provider', 'connection_id', 'payload'],
      },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  const { data: connection, error: connectionError } = await supabase
    .from('integration_connections')
    .select('id, user_id, provider, status')
    .eq('id', connectionId)
    .single()

  if (connectionError || !connection) {
    return NextResponse.json({ error: 'Unknown connection_id' }, { status: 404 })
  }

  const connectionRow = connection as {
    id: string
    user_id: string
    provider: string
    status: string
  }

  if (connectionRow.provider !== provider) {
    return NextResponse.json({ error: 'Provider mismatch for connection_id' }, { status: 400 })
  }

  if (connectionRow.status !== 'active') {
    return NextResponse.json({ error: 'Connection is not active' }, { status: 409 })
  }

  if (conversationId) {
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, user_id')
      .eq('id', conversationId)
      .single()

    if (conversationError || !conversation) {
      return NextResponse.json({ error: 'Unknown conversation_id' }, { status: 404 })
    }

    const conversationRow = conversation as { id: string; user_id: string }
    if (conversationRow.user_id !== connectionRow.user_id) {
      return NextResponse.json({ error: 'conversation_id does not belong to connection user' }, { status: 403 })
    }
  }

  const nowIso = new Date().toISOString()

  const insertRowBase = {
    connection_id: connectionId,
    provider,
    external_thread_id: externalThreadId,
    conversation_id: conversationId,
    status: 'pending',
    attempt_count: 0,
    last_attempt_at: null,
    next_attempt_at: nowIso,
    payload,
    response: {},
    created_at: nowIso,
    updated_at: nowIso,
  }

  const insertRow = {
    ...insertRowBase,
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
  }

  let { data: logRow, error: logError } = await supabase
    .from('integration_delivery_log')
    .insert(insertRow as never)
    .select('id')
    .single()

  const insertCode = (logError as { code?: string } | null)?.code
  if (logError && insertCode === '42703' && idempotencyKey) {
    ;({ data: logRow, error: logError } = await supabase
      .from('integration_delivery_log')
      .insert(insertRowBase as never)
      .select('id')
      .single())
  }

  if (logError || !logRow) {
    const code = (logError as { code?: string } | null)?.code
    if (code === '23505' && idempotencyKey) {
      const { data: existingRow, error: existingError } = await supabase
        .from('integration_delivery_log')
        .select('id')
        .eq('connection_id', connectionId)
        .eq('idempotency_key', idempotencyKey)
        .single()

      if (!existingError && existingRow) {
        return NextResponse.json({
          success: true,
          duplicate: true,
          delivery_id: (existingRow as { id: string }).id,
        })
      }
    }

    return NextResponse.json({ error: 'Failed to enqueue delivery' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    delivery_id: (logRow as { id: string }).id,
  })
}
