export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { respondToSlackMessage } from '@/lib/integrations/slack-responder'
import { enforceInboundChannelTrust } from '@/lib/security/inbound-channel-trust'

type SlackUrlVerificationPayload = {
  type: 'url_verification'
  challenge: string
  team_id?: string
}

type SlackEventCallbackPayload = {
  type: 'event_callback'
  team_id?: string
  event_id?: string
  event_time?: number
  event?: Record<string, unknown>
}

type SlackPayload = SlackUrlVerificationPayload | SlackEventCallbackPayload | Record<string, unknown>

function decryptEncryptedPayload(encryptedData: string, ivHexFallback: string): string {
  const keyHex = (process.env.CREDENTIAL_ENCRYPTION_KEY || '').trim()
  if (!keyHex) {
    throw new Error('Server misconfigured')
  }

  const key = Buffer.from(keyHex, 'hex')

  if (encryptedData.includes(':')) {
    const parts = encryptedData.split(':')
    if (parts.length === 3) {
      const [storedIv, authTagHex, ciphertext] = parts
      const ivBuf = Buffer.from(storedIv || ivHexFallback, 'hex')
      const authTag = Buffer.from(authTagHex, 'hex')

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuf, { authTagLength: 16 })
      decipher.setAuthTag(authTag)

      let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      return decrypted
    }
  }

  const ivBuf = Buffer.from(ivHexFallback, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuf, { authTagLength: 16 })

  const cipherBuffer = Buffer.from(encryptedData, 'hex')
  const authTag = cipherBuffer.slice(-16)
  const ciphertext = cipherBuffer.slice(0, -16)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(ciphertext)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString('utf8')
}

async function getSlackSigningSecretForConnection(connectionId: string): Promise<{
  signingSecret: string
  connection: { id: string; user_id: string; provider: string; status: string; config: Record<string, unknown> }
} | null> {
  const supabase = createAdminClient()

  const { data: connection, error: connError } = await supabase
    .from('integration_connections')
    .select('id, user_id, provider, status, config')
    .eq('id', connectionId)
    .single()

  if (connError || !connection) {
    return null
  }

  const connRow = connection as {
    id: string
    user_id: string
    provider: string
    status: string
    config: Record<string, unknown>
  }

  if (connRow.provider !== 'slack') {
    return null
  }

  const config = connRow.config || {}
  const slackAppCredentialId = typeof config.slack_app_credential_id === 'string' ? config.slack_app_credential_id : ''
  if (!slackAppCredentialId) {
    return null
  }

  const { data: credential, error: credError } = await supabase
    .from('credentials')
    .select('encrypted_data, iv')
    .eq('id', slackAppCredentialId)
    .eq('user_id', connRow.user_id)
    .single()

  if (credError || !credential) {
    return null
  }

  const credRow = credential as { encrypted_data: string; iv: string }
  const decrypted = decryptEncryptedPayload(credRow.encrypted_data, credRow.iv)
  const parsed = JSON.parse(decrypted) as Record<string, unknown>
  const signingSecret = typeof parsed.signing_secret === 'string' ? parsed.signing_secret.trim() : ''
  if (!signingSecret) {
    return null
  }

  return { signingSecret, connection: connRow }
}

function verifySlackSignature(params: {
  signingSecret: string
  timestamp: string
  signature: string
  rawBody: string
}): { valid: boolean; error?: string } {
  const timestamp = Number(params.timestamp)
  if (!Number.isFinite(timestamp)) {
    return { valid: false, error: 'Missing or invalid request timestamp' }
  }

  const now = Math.floor(Date.now() / 1000)
  const toleranceSeconds = 60 * 5
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return { valid: false, error: 'Request timestamp expired' }
  }

  const baseString = `v0:${params.timestamp}:${params.rawBody}`
  const digest = crypto
    .createHmac('sha256', params.signingSecret)
    .update(baseString, 'utf8')
    .digest('hex')

  const expected = `v0=${digest}`

  const expectedBuf = Buffer.from(expected, 'utf8')
  const providedBuf = Buffer.from(params.signature, 'utf8')

  if (expectedBuf.length !== providedBuf.length) {
    return { valid: false, error: 'Invalid signature' }
  }

  const ok = crypto.timingSafeEqual(expectedBuf, providedBuf)
  return ok ? { valid: true } : { valid: false, error: 'Invalid signature' }
}

export async function POST(request: NextRequest) {
  const connectionId = request.nextUrl.searchParams.get('connection_id')
  if (!connectionId) {
    return NextResponse.json({ error: 'Missing connection_id' }, { status: 400 })
  }

  const signingSecretData = await getSlackSigningSecretForConnection(connectionId)
  if (!signingSecretData) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { signingSecret, connection } = signingSecretData

  if (connection.status !== 'active') {
    return NextResponse.json({ error: 'Connection is not active' }, { status: 409 })
  }

  const signature = (request.headers.get('x-slack-signature') || '').trim()
  const timestamp = (request.headers.get('x-slack-request-timestamp') || '').trim()
  const rawBody = await request.text()

  const verified = verifySlackSignature({ signingSecret, timestamp, signature, rawBody })
  if (!verified.valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = ((): SlackPayload | null => {
    try {
      return JSON.parse(rawBody) as SlackPayload
    } catch {
      return null
    }
  })()

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if ((body as { type?: string }).type === 'url_verification') {
    const challenge = (body as SlackUrlVerificationPayload).challenge
    if (typeof challenge !== 'string' || !challenge) {
      return NextResponse.json({ error: 'Missing challenge' }, { status: 400 })
    }

    return new NextResponse(challenge, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
    })
  }

  if ((body as { type?: string }).type !== 'event_callback') {
    return NextResponse.json({ success: true, ignored: true })
  }

  const eventBody = body as SlackEventCallbackPayload
  const externalEventId = typeof eventBody.event_id === 'string' ? eventBody.event_id.trim() : ''

  if (!externalEventId) {
    return NextResponse.json({ success: true, ignored: true })
  }

  const teamId = typeof eventBody.team_id === 'string' ? eventBody.team_id.trim() : ''
  const storedTeamId = typeof connection.config?.team_id === 'string' ? (connection.config.team_id as string).trim() : ''
  if (teamId && storedTeamId && teamId !== storedTeamId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const slackEvent = (eventBody.event && typeof eventBody.event === 'object' ? eventBody.event : null) as
    | Record<string, unknown>
    | null

  if (!slackEvent) {
    return NextResponse.json({ success: true, ignored: true })
  }

  const eventTypeBase = typeof slackEvent.type === 'string' ? slackEvent.type : ''
  const eventSubtype = typeof slackEvent.subtype === 'string' ? slackEvent.subtype : ''
  const eventType = eventSubtype ? `${eventTypeBase}:${eventSubtype}` : eventTypeBase

  // --- Bot self-message guard ---
  const messageBotId = typeof slackEvent.bot_id === 'string' ? slackEvent.bot_id.trim() : ''
  const isBotMessage = eventSubtype === 'bot_message'
  const storedBotId = typeof connection.config?.slack_bot_id === 'string'
    ? (connection.config.slack_bot_id as string).trim()
    : ''

  // Always skip bot_message subtype; skip any message with a bot_id (covers our own bot + other bots)
  if (isBotMessage || messageBotId) {
    return NextResponse.json({ success: true, ignored: true })
  }

  // Also skip message_changed / message_deleted subtypes
  if (eventSubtype === 'message_changed' || eventSubtype === 'message_deleted' || eventSubtype === 'message_replied') {
    return NextResponse.json({ success: true, ignored: true })
  }

  if (eventTypeBase !== 'message') {
    return NextResponse.json({ success: true, ignored: true })
  }

  const channelId = typeof slackEvent.channel === 'string' ? slackEvent.channel.trim() : ''
  if (!channelId) {
    return NextResponse.json({ success: true, ignored: true })
  }

  const text = typeof slackEvent.text === 'string' ? slackEvent.text : ''
  const externalUserId = typeof slackEvent.user === 'string' ? slackEvent.user.trim() : null
  const ts = typeof slackEvent.ts === 'string' ? slackEvent.ts : null
  const threadTs = typeof slackEvent.thread_ts === 'string' ? slackEvent.thread_ts : null

  const trustEvaluation = await enforceInboundChannelTrust({
    connection,
    externalUserId,
  })
  const trustDecision = trustEvaluation.decision

  if (!trustEvaluation.allowed) {
    return NextResponse.json({
      success: true,
      ignored: true,
      reason: trustDecision.reason,
      policy: trustDecision.policy,
      requires_pairing: trustDecision.requiresPairing,
    })
  }

  // --- Channel type + mention gating ---
  // channel_type: 'im' = DM, 'mpim' = group DM, 'channel'/'group' = public/private channel
  const channelType = typeof slackEvent.channel_type === 'string' ? slackEvent.channel_type : ''
  const isDm = channelType === 'im' || channelType === 'mpim'

  // Check if our bot was @mentioned in the message text
  const storedBotUserId = typeof connection.config?.slack_bot_user_id === 'string'
    ? (connection.config.slack_bot_user_id as string).trim()
    : ''
  const isMentioned = storedBotUserId
    ? text.includes(`<@${storedBotUserId}>`)
    : false

  // Determine if we should auto-respond:
  // - DMs: always respond
  // - Channels: only respond when @mentioned (unless config overrides)
  const alwaysRespond = connection.config?.auto_respond === true
  const shouldRespond = isDm || isMentioned || alwaysRespond

  // Use thread_ts when present (threaded reply), otherwise channel (top-level message)
  const externalThreadId = threadTs ? `${channelId}:${threadTs}` : channelId

  const supabase = createAdminClient()
  const nowIso = new Date().toISOString()

  const rollbackDedupe = async () => {
    await supabase
      .from('inbound_event_dedupe')
      .delete()
      .eq('provider', 'slack')
      .eq('connection_id', connection.id)
      .eq('external_event_id', externalEventId)
  }

  const { error: dedupeError } = await supabase
    .from('inbound_event_dedupe')
    .insert({
      provider: 'slack',
      connection_id: connection.id,
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
    .eq('connection_id', connection.id)
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
        user_id: connection.user_id,
        title: `slack:${externalThreadId}`,
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
        user_id: connection.user_id,
        connection_id: connection.id,
        provider: 'slack',
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
          .eq('connection_id', connection.id)
          .eq('external_thread_id', externalThreadId)
          .single()

        if (existingAfterConflictError || !existingAfterConflict) {
          await rollbackDedupe()
          return NextResponse.json({ error: 'Failed to resolve thread after conflict' }, { status: 500 })
        }

        conversationId = (existingAfterConflict as { conversation_id: string }).conversation_id

        if (createdConversationId) {
          await supabase.from('conversations').delete().eq('id', createdConversationId)
        }
      } else {
        await rollbackDedupe()
        return NextResponse.json({ error: 'Failed to create thread mapping' }, { status: 500 })
      }
    }
  }

  const { error: messageError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      role: 'user',
      content: text,
      metadata: {
        source: 'integration',
        provider: 'slack',
        connection_id: connection.id,
        external_event_id: externalEventId,
        external_thread_id: externalThreadId,
        external_user_id: externalUserId,
        event_type: eventType,
        event_timestamp: ts,
        trust_policy: trustDecision.policy,
        slack: {
          team_id: teamId || storedTeamId || null,
          channel: channelId,
          ts,
          thread_ts: threadTs,
          event_time: eventBody.event_time ?? null,
          event: slackEvent,
        },
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

  // Fire-and-forget: trigger AI responder only when gating allows it
  if (shouldRespond) {
    respondToSlackMessage({
      conversationId,
      connectionId: connection.id,
      userId: connection.user_id,
      channelId,
      threadTs,
      messageTs: ts,
      isDm,
    }).catch((err) => {
      console.error('[SlackEvents] Responder error:', err)
    })
  }

  return NextResponse.json({
    success: true,
    provider: 'slack',
    connection_id: connection.id,
    conversation_id: conversationId,
    external_thread_id: externalThreadId,
  })
}
