export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateKey = createRateLimitKey(user.id, 'integrations-deliveries:get')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.general)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: Math.ceil((rateCheck.resetAt - Date.now()) / 1000) },
        { status: 429 }
      )
    }

    const connectionId = request.nextUrl.searchParams.get('connection_id')
    const limitParam = request.nextUrl.searchParams.get('limit')
    const limit = Math.max(1, Math.min(100, Number(limitParam || '50') || 50))

    const admin = createAdminClient()

    if (connectionId) {
      const { data: conn, error: connError } = await admin
        .from('integration_connections')
        .select('id, user_id')
        .eq('id', connectionId)
        .single()

      if (connError || !conn) {
        return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
      }

      const connRow = conn as { id: string; user_id: string }
      if (connRow.user_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const { data: deliveries, error } = await admin
        .from('integration_delivery_log')
        .select('id, provider, external_thread_id, status, attempt_count, last_attempt_at, next_attempt_at, payload, response, created_at, updated_at, idempotency_key')
        .eq('connection_id', connectionId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        return NextResponse.json({ error: 'Failed to fetch deliveries' }, { status: 500 })
      }

      return NextResponse.json({ deliveries: deliveries || [] })
    }

    const { data: connections, error: connectionsError } = await admin
      .from('integration_connections')
      .select('id')
      .eq('user_id', user.id)

    if (connectionsError) {
      return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 })
    }

    const ids = (connections || []).map((c) => (c as { id: string }).id)
    if (ids.length === 0) {
      return NextResponse.json({ deliveries: [] })
    }

    const { data: deliveries, error } = await admin
      .from('integration_delivery_log')
      .select('id, connection_id, provider, external_thread_id, status, attempt_count, last_attempt_at, next_attempt_at, payload, response, created_at, updated_at, idempotency_key')
      .in('connection_id', ids)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch deliveries' }, { status: 500 })
    }

    return NextResponse.json({ deliveries: deliveries || [] })
  } catch (error) {
    console.error('[IntegrationDeliveries] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
