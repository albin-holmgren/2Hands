export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

type InboundIntegrationEvent = {
  provider: string
  connection_id: string
  external_event_id: string
  event_type: string
  external_thread_id: string
  external_user_id?: string | null
  text?: string | null
  attachments?: unknown
  timestamp?: string | null
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const gatewaySecret = (process.env.GATEWAY_SECRET || '').trim()

  if (!gatewaySecret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${gatewaySecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as InboundIntegrationEvent | null

  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const provider = typeof body.provider === 'string' ? body.provider.trim() : ''
  const connectionId = typeof body.connection_id === 'string' ? body.connection_id.trim() : ''
  const externalEventId = typeof body.external_event_id === 'string' ? body.external_event_id.trim() : ''
  const eventType = typeof body.event_type === 'string' ? body.event_type.trim() : ''
  const externalThreadId = typeof body.external_thread_id === 'string' ? body.external_thread_id.trim() : ''

  if (!provider || !connectionId || !externalEventId || !eventType || !externalThreadId) {
    return NextResponse.json(
      {
        error: 'Missing required fields',
        required: ['provider', 'connection_id', 'external_event_id', 'event_type', 'external_thread_id'],
      },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()

  const rollbackDedupe = async () => {
    await supabase
      .from('inbound_event_dedupe')
      .delete()
      .eq('provider', provider)
      .eq('connection_id', connectionId)
      .eq('external_event_id', externalEventId)
  }

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

  const nowIso = new Date().toISOString()

  const { error: dedupeError } = await supabase
    .from('inbound_event_dedupe')
    .insert({
      provider,
      connection_id: connectionId,
      external_event_id: externalEventId,
      created_at: nowIso,
    } as never)

  if (dedupeError) {
    const code = (dedupeError as { code?: string } | null)?.code
    if (code === '23505') {
      return NextResponse.json({ success: true, duplicate: true })
    }

    return NextResponse.json({ error: 'Failed to dedupe event' }, { status: 500 })
  }

  const { data: existingThread, error: threadLookupError } = await supabase
    .from('integration_threads')
    .select('id, conversation_id')
    .eq('connection_id', connectionId)
    .eq('external_thread_id', externalThreadId)
    .single()

  if (threadLookupError && threadLookupError.code !== 'PGRST116') {
    await rollbackDedupe()
    return NextResponse.json({ error: 'Failed to resolve thread' }, { status: 500 })
  }

  let conversationId = (existingThread as { conversation_id: string } | null)?.conversation_id || null

  if (!conversationId) {
    let createdConversationId: string | null = null

    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .insert({
        user_id: connectionRow.user_id,
        title: `${provider}:${externalThreadId}`,
        status: 'active',
        created_at: nowIso,
        updated_at: nowIso,
      } as never)
      .select('id')
      .single()

    if (conversationError || !conversation) {
      await rollbackDedupe()
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
    }

    conversationId = (conversation as { id: string }).id
    createdConversationId = conversationId

    const { error: threadCreateError } = await supabase
      .from('integration_threads')
      .insert({
        user_id: connectionRow.user_id,
        connection_id: connectionId,
        provider,
        external_thread_id: externalThreadId,
        conversation_id: conversationId,
        created_at: nowIso,
        updated_at: nowIso,
      } as never)

    if (threadCreateError) {
      const threadCreateCode = (threadCreateError as { code?: string } | null)?.code
      if (threadCreateCode === '23505') {
        const { data: existingAfterConflict, error: existingAfterConflictError } = await supabase
          .from('integration_threads')
          .select('conversation_id')
          .eq('connection_id', connectionId)
          .eq('external_thread_id', externalThreadId)
          .single()

        if (existingAfterConflictError || !existingAfterConflict) {
          await rollbackDedupe()
          return NextResponse.json({ error: 'Failed to resolve thread after conflict' }, { status: 500 })
        }

        conversationId = (existingAfterConflict as { conversation_id: string }).conversation_id

        if (createdConversationId) {
          await supabase
            .from('conversations')
            .delete()
            .eq('id', createdConversationId)
        }
      } else {
        await rollbackDedupe()
        return NextResponse.json({ error: 'Failed to create thread mapping' }, { status: 500 })
      }
    }
  }

  const content = typeof body.text === 'string' ? body.text : ''
  const externalUserId = typeof body.external_user_id === 'string' ? body.external_user_id.trim() : null

  const { error: messageError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      role: 'user',
      content,
      metadata: {
        source: 'integration',
        provider,
        connection_id: connectionId,
        external_event_id: externalEventId,
        external_thread_id: externalThreadId,
        external_user_id: externalUserId,
        event_type: eventType,
        attachments: body.attachments ?? null,
        event_timestamp: body.timestamp ?? null,
      },
      created_at: nowIso,
    } as never)

  if (messageError) {
    await rollbackDedupe()
    return NextResponse.json({ error: 'Failed to store inbound message' }, { status: 500 })
  }

  await supabase
    .from('conversations')
    .update({ updated_at: nowIso } as never)
    .eq('id', conversationId)

  return NextResponse.json({
    success: true,
    provider,
    connection_id: connectionId,
    conversation_id: conversationId,
    external_thread_id: externalThreadId,
  })
}
