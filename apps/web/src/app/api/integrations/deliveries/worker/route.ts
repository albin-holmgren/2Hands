export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

type ClaimedDelivery = {
  delivery_id: string
  connection_id: string
  provider: string
  external_thread_id: string | null
  conversation_id: string | null
  payload: Record<string, unknown>
  attempt_count: number
}

function verifyWorkerAuth(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get('authorization')
  const cronSecret = (process.env.CRON_SECRET || '').trim()

  if (!cronSecret) {
    console.error('SECURITY: CRON_SECRET not configured - rejecting integration worker request')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}

function decryptOAuthCredential(encryptedData: string, iv: string): string {
  const keyHex = (process.env.CREDENTIAL_ENCRYPTION_KEY || '').trim()
  if (!keyHex) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY not configured')
  }

  const key = Buffer.from(keyHex, 'hex')
  const parts = encryptedData.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted credential format')
  }

  const [ivHex, authTagHex, ciphertext] = parts
  const ivBuffer = Buffer.from(ivHex || iv, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer, { authTagLength: 16 })
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

async function getAccessTokenForConnection(connectionId: string): Promise<string | null> {
  const supabase = createAdminClient()

  const { data: connection, error: connError } = await supabase
    .from('integration_connections')
    .select('credential_id, config')
    .eq('id', connectionId)
    .single()

  if (connError || !connection) return null

  const connRow = connection as { credential_id: string | null; config: Record<string, unknown> }

  if (!connRow.credential_id) {
    return null
  }

  const { data: credential, error: credError } = await supabase
    .from('credentials')
    .select('encrypted_data, iv')
    .eq('id', connRow.credential_id)
    .single()

  if (credError || !credential) return null

  const credRow = credential as { encrypted_data: string; iv: string }
  const decrypted = decryptOAuthCredential(credRow.encrypted_data, credRow.iv)
  const parsed = JSON.parse(decrypted) as Record<string, unknown>

  return typeof parsed.access_token === 'string' ? parsed.access_token : null
}

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

async function sendGmail(accessToken: string, payload: Record<string, unknown>): Promise<{ ok: boolean; status: number; body: unknown }> {
  const to = typeof payload.to === 'string' ? payload.to : ''
  const subject = typeof payload.subject === 'string' ? payload.subject : ''
  const text = typeof payload.text === 'string' ? payload.text : ''

  if (!to || !subject) {
    return { ok: false, status: 400, body: { error: 'Missing to/subject' } }
  }

  const mime = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    text,
  ].join('\r\n')

  const raw = toBase64Url(mime)

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  })

  const body = await res.json().catch(async () => await res.text())
  return { ok: res.ok, status: res.status, body }
}

async function sendSlack(accessToken: string, payload: Record<string, unknown>): Promise<{ ok: boolean; status: number; body: unknown }> {
  const channel = typeof payload.channel === 'string' ? payload.channel : ''
  const text = typeof payload.text === 'string' ? payload.text : ''
  const threadTs = typeof payload.thread_ts === 'string' ? payload.thread_ts.trim() : ''

  if (!channel || !text) {
    return { ok: false, status: 400, body: { error: 'Missing channel/text' } }
  }

  const slackBody: Record<string, unknown> = { channel, text }
  if (threadTs) {
    slackBody.thread_ts = threadTs
  }

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(slackBody),
  })

  const body = await res.json().catch(async () => await res.text())

  const ok = typeof body === 'object' && body !== null && 'ok' in body ? Boolean((body as { ok?: boolean }).ok) : res.ok
  return { ok, status: res.status, body }
}

function computeBackoffSeconds(attemptCount: number): number {
  const base = 30
  const exp = Math.min(6, Math.max(0, attemptCount - 1))
  const seconds = base * Math.pow(2, exp)
  const jitter = Math.floor(Math.random() * 10)
  return Math.min(3600, seconds + jitter)
}

export async function POST(request: NextRequest) {
  const authError = verifyWorkerAuth(request)
  if (authError) return authError

  const limitParam = request.nextUrl.searchParams.get('limit')
  const dryRunParam = request.nextUrl.searchParams.get('dry_run')
  const dryRun = dryRunParam === '1' || dryRunParam === 'true'
  const limit = Math.max(1, Math.min(50, Number(limitParam || '10') || 10))

  const supabase = createAdminClient()
  const workerId = `deliveries_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('claim_integration_deliveries', {
    p_worker_id: workerId,
    p_limit: limit,
  })

  if (error) {
    console.error('[IntegrationDeliveriesWorker] claim rpc error:', error)
    const e = error as { message?: string; details?: string; hint?: string; code?: string }
    return NextResponse.json(
      {
        error: 'Failed to claim deliveries',
        supabase: {
          message: e.message || null,
          details: e.details || null,
          hint: e.hint || null,
          code: e.code || null,
        },
      },
      { status: 500 }
    )
  }

  const claimed = (data || []) as ClaimedDelivery[]

  if (claimed.length === 0) {
    return NextResponse.json({ success: true, processed: 0, delivered: 0, failed: 0 })
  }

  let delivered = 0
  let failed = 0
  const results: Array<{ delivery_id: string; status: string; error?: string }> = []

  for (const delivery of claimed) {
    try {
      const payload = (delivery.payload || {}) as Record<string, unknown>
      const type = typeof payload.type === 'string' ? payload.type : ''

      if (dryRun) {
        delivered++
        const nowIso = new Date().toISOString()
        await supabase
          .from('integration_delivery_log')
          .update({
            status: 'delivered',
            response: { dry_run: true },
            next_attempt_at: null,
            updated_at: nowIso,
          } as never)
          .eq('id', delivery.delivery_id)

        results.push({ delivery_id: delivery.delivery_id, status: 'delivered' })
        continue
      }

      let exec:
        | { ok: boolean; status: number; body: unknown }
        | { ok: boolean; status: number; body: unknown }

      if (delivery.provider === 'gmail' && type === 'send_email') {
        const accessToken = await getAccessTokenForConnection(delivery.connection_id)
        if (!accessToken) {
          throw new Error('Missing access token for connection')
        }
        exec = await sendGmail(accessToken, payload)
      } else if (delivery.provider === 'slack' && type === 'send_message') {
        const accessToken = await getAccessTokenForConnection(delivery.connection_id)
        if (!accessToken) {
          throw new Error('Missing access token for connection')
        }
        exec = await sendSlack(accessToken, payload)
      } else {
        exec = { ok: false, status: 400, body: { error: 'Unsupported provider/payload type' } }
      }

      const nowIso = new Date().toISOString()

      if (exec.ok) {
        delivered++
        await supabase
          .from('integration_delivery_log')
          .update({
            status: 'delivered',
            response: { status: exec.status, body: exec.body },
            next_attempt_at: null,
            updated_at: nowIso,
          } as never)
          .eq('id', delivery.delivery_id)

        results.push({ delivery_id: delivery.delivery_id, status: 'delivered' })
        continue
      }

      const maxAttempts = 5
      const nextSeconds = computeBackoffSeconds(delivery.attempt_count)
      const nextAttemptAt = new Date(Date.now() + nextSeconds * 1000).toISOString()
      const isDead = delivery.attempt_count >= maxAttempts

      failed++
      await supabase
        .from('integration_delivery_log')
        .update({
          status: isDead ? 'dead_letter' : 'pending',
          response: { status: exec.status, body: exec.body },
          next_attempt_at: isDead ? null : nextAttemptAt,
          updated_at: nowIso,
        } as never)
        .eq('id', delivery.delivery_id)

      results.push({
        delivery_id: delivery.delivery_id,
        status: isDead ? 'dead_letter' : 'pending',
        error: typeof exec.body === 'string' ? exec.body : JSON.stringify(exec.body),
      })
    } catch (e) {
      const nowIso = new Date().toISOString()
      failed++

      const message = e instanceof Error ? e.message : String(e)
      const nextSeconds = computeBackoffSeconds(delivery.attempt_count)
      const nextAttemptAt = new Date(Date.now() + nextSeconds * 1000).toISOString()
      const maxAttempts = 5
      const isDead = delivery.attempt_count >= maxAttempts

      await supabase
        .from('integration_delivery_log')
        .update({
          status: isDead ? 'dead_letter' : 'pending',
          response: { error: message },
          next_attempt_at: isDead ? null : nextAttemptAt,
          updated_at: nowIso,
        } as never)
        .eq('id', delivery.delivery_id)

      results.push({ delivery_id: delivery.delivery_id, status: isDead ? 'dead_letter' : 'pending', error: message })
    }
  }

  return NextResponse.json({
    success: true,
    processed: claimed.length,
    delivered,
    failed,
    results,
  })
}

export async function GET(request: NextRequest) {
  // Vercel cron jobs use GET — check if this is a cron trigger or a status request
  const isCron = request.headers.get('x-vercel-cron') === '1'
    || request.nextUrl.searchParams.get('process') === '1'

  if (isCron) {
    // Process pending deliveries (same logic as POST, with defaults)
    const cronSecret = (process.env.CRON_SECRET || '').trim()
    if (!cronSecret) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()
    const workerId = `cron_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('claim_integration_deliveries', {
      p_worker_id: workerId,
      p_limit: 10,
    })

    if (error) {
      console.error('[IntegrationDeliveriesWorker] cron claim error:', error)
      return NextResponse.json({ error: 'Failed to claim deliveries' }, { status: 500 })
    }

    const claimed = (data || []) as ClaimedDelivery[]
    if (claimed.length === 0) {
      return NextResponse.json({ success: true, processed: 0 })
    }

    let delivered = 0
    let failed = 0

    for (const delivery of claimed) {
      try {
        const payload = (delivery.payload || {}) as Record<string, unknown>
        const type = typeof payload.type === 'string' ? payload.type : ''

        let exec: { ok: boolean; status: number; body: unknown }

        if (delivery.provider === 'gmail' && type === 'send_email') {
          const accessToken = await getAccessTokenForConnection(delivery.connection_id)
          if (!accessToken) throw new Error('Missing access token')
          exec = await sendGmail(accessToken, payload)
        } else if (delivery.provider === 'slack' && type === 'send_message') {
          const accessToken = await getAccessTokenForConnection(delivery.connection_id)
          if (!accessToken) throw new Error('Missing access token')
          exec = await sendSlack(accessToken, payload)
        } else {
          exec = { ok: false, status: 400, body: { error: 'Unsupported provider/type' } }
        }

        const nowIso = new Date().toISOString()

        if (exec.ok) {
          delivered++
          await supabase.from('integration_delivery_log').update({
            status: 'delivered',
            response: { status: exec.status, body: exec.body },
            next_attempt_at: null,
            updated_at: nowIso,
          } as never).eq('id', delivery.delivery_id)
        } else {
          failed++
          const maxAttempts = 5
          const isDead = delivery.attempt_count >= maxAttempts
          const nextSeconds = computeBackoffSeconds(delivery.attempt_count)
          const nextAttemptAt = new Date(Date.now() + nextSeconds * 1000).toISOString()
          await supabase.from('integration_delivery_log').update({
            status: isDead ? 'dead_letter' : 'pending',
            response: { status: exec.status, body: exec.body },
            next_attempt_at: isDead ? null : nextAttemptAt,
            updated_at: nowIso,
          } as never).eq('id', delivery.delivery_id)
        }
      } catch (e) {
        failed++
        const message = e instanceof Error ? e.message : String(e)
        const nowIso = new Date().toISOString()
        const maxAttempts = 5
        const isDead = delivery.attempt_count >= maxAttempts
        const nextSeconds = computeBackoffSeconds(delivery.attempt_count)
        const nextAttemptAt = new Date(Date.now() + nextSeconds * 1000).toISOString()
        await supabase.from('integration_delivery_log').update({
          status: isDead ? 'dead_letter' : 'pending',
          response: { error: message },
          next_attempt_at: isDead ? null : nextAttemptAt,
          updated_at: nowIso,
        } as never).eq('id', delivery.delivery_id)
      }
    }

    return NextResponse.json({ success: true, processed: claimed.length, delivered, failed })
  }

  // Status endpoint (non-cron GET)
  const authError = verifyWorkerAuth(request)
  if (authError) return authError

  try {
    const supabase = createAdminClient()

    const statuses = ['pending', 'processing', 'delivered', 'failed', 'dead_letter']
    const counts: Record<string, number> = {}

    for (const status of statuses) {
      const { count } = await supabase
        .from('integration_delivery_log')
        .select('id', { count: 'exact', head: true })
        .eq('status', status)
      counts[status] = count || 0
    }

    const { data: recent } = await supabase
      .from('integration_delivery_log')
      .select('id, connection_id, provider, status, attempt_count, last_attempt_at, next_attempt_at, payload, response, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(20)

    return NextResponse.json({
      success: true,
      counts,
      recent: recent || [],
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[IntegrationDeliveriesWorker] GET error:', error)
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 })
  }
}
