/**
 * Webhook System
 *
 * Notifies external systems when events happen in 2Hands:
 *   - agent.completed — agent run finished successfully
 *   - agent.failed — agent run failed
 *   - agent.insight — agent reported a finding
 *   - workflow.completed — workflow finished
 *   - workflow.failed — workflow step failed
 *
 * Security:
 *   - Each webhook has a signing secret
 *   - Payloads are signed with HMAC-SHA256
 *   - Deliveries retry up to 3 times with exponential backoff
 */

import { createClient } from '@/lib/supabase/server'
import { createHmac, randomBytes } from 'crypto'

export type WebhookEvent =
  | 'agent.started'
  | 'agent.completed'
  | 'agent.failed'
  | 'agent.insight'
  | 'workflow.completed'
  | 'workflow.failed'
  | 'mission.tick_completed'
  | 'mission.blocked'
  | 'mission.completed'
  | 'mission.project_started'
  | 'mission.task_completed'

export interface WebhookEndpoint {
  id: string
  userId: string
  url: string
  events: WebhookEvent[]
  secret: string
  isActive: boolean
  description: string
  failureCount: number
  lastDeliveredAt: string | null
  lastFailedAt: string | null
  createdAt: string
}

export interface WebhookDelivery {
  id: string
  webhookId: string
  event: WebhookEvent
  payload: Record<string, unknown>
  responseStatus: number | null
  responseBody: string | null
  success: boolean
  attempts: number
  deliveredAt: string
}

// ============================================================
// Webhook Management
// ============================================================

export async function createWebhook(
  userId: string,
  workspaceId: string,
  url: string,
  events: WebhookEvent[],
  description?: string
): Promise<{ webhook: WebhookEndpoint; secret: string }> {
  const supabase = await createClient()

  const id = crypto.randomUUID()
  const secret = `whsec_${randomBytes(24).toString('base64url')}`
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('webhooks')
    .insert({
      id,
      user_id: userId,
      workspace_id: workspaceId,
      url,
      events,
      secret,
      is_active: true,
      description: description || '',
      failure_count: 0,
      created_at: now,
    } as never)

  if (error) {
    console.error('[Webhooks] Failed to create:', error)
    throw new Error('Failed to create webhook')
  }

  const webhook: WebhookEndpoint = {
    id,
    userId,
    url,
    events,
    secret,
    isActive: true,
    description: description || '',
    failureCount: 0,
    lastDeliveredAt: null,
    lastFailedAt: null,
    createdAt: now,
  }

  return { webhook, secret }
}

export async function listWebhooks(userId: string, workspaceId: string): Promise<Omit<WebhookEndpoint, 'secret'>[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('webhooks')
    .select('id, user_id, url, events, is_active, description, failure_count, last_delivered_at, last_failed_at, created_at')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return (data as Array<Record<string, unknown>>).map(d => ({
    id: d.id as string,
    userId: d.user_id as string,
    url: d.url as string,
    events: d.events as WebhookEvent[],
    isActive: d.is_active as boolean,
    description: (d.description as string) || '',
    failureCount: (d.failure_count as number) || 0,
    lastDeliveredAt: d.last_delivered_at as string | null,
    lastFailedAt: d.last_failed_at as string | null,
    createdAt: d.created_at as string,
  }))
}

export async function deleteWebhook(userId: string, workspaceId: string, webhookId: string): Promise<boolean> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('webhooks')
    .delete()
    .eq('id', webhookId)
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)

  return !error
}

// ============================================================
// Webhook Delivery
// ============================================================

/**
 * Dispatch an event to all matching webhooks for a user.
 * Runs async — doesn't block the caller.
 */
export async function dispatchWebhookEvent(
  userId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  const supabase = await createClient()

  // Find all active webhooks for this user that subscribe to this event
  const { data: webhooks } = await supabase
    .from('webhooks')
    .select('id, url, secret, events')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (!webhooks || webhooks.length === 0) return

  const matchingWebhooks = (webhooks as Array<{
    id: string; url: string; secret: string; events: string[]
  }>).filter(w => w.events.includes(event))

  // Deliver to each webhook (fire-and-forget, with retries)
  for (const webhook of matchingWebhooks) {
    deliverWebhook(webhook.id, webhook.url, webhook.secret, event, payload).catch(err => {
      console.error(`[Webhooks] Delivery failed for ${webhook.id}:`, err)
    })
  }
}

async function deliverWebhook(
  webhookId: string,
  url: string,
  secret: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
  attempt: number = 1
): Promise<void> {
  const supabase = await createClient()
  const maxAttempts = 3
  const deliveryId = crypto.randomUUID()
  const timestamp = Math.floor(Date.now() / 1000).toString()

  const body = JSON.stringify({
    event,
    timestamp,
    data: payload,
  })

  // Sign the payload
  const signature = signPayload(body, secret, timestamp)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-2Hands-Event': event,
        'X-2Hands-Timestamp': timestamp,
        'X-2Hands-Signature': signature,
        'X-2Hands-Delivery': deliveryId,
      },
      body,
      signal: AbortSignal.timeout(10000), // 10s timeout
    })

    const responseBody = await response.text().catch(() => '')

    // Log the delivery
    try {
      await supabase.from('webhook_deliveries').insert({
        id: deliveryId,
        webhook_id: webhookId,
        event,
        payload,
        response_status: response.status,
        response_body: responseBody.slice(0, 1000),
        success: response.ok,
        attempts: attempt,
        delivered_at: new Date().toISOString(),
      } as never)
    } catch { /* log failure is non-critical */ }

    if (response.ok) {
      // Reset failure count on success
      await supabase
        .from('webhooks')
        .update({ last_delivered_at: new Date().toISOString(), failure_count: 0 } as never)
        .eq('id', webhookId)
    } else {
      throw new Error(`HTTP ${response.status}: ${responseBody.slice(0, 200)}`)
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`[Webhooks] Delivery attempt ${attempt} failed for ${webhookId}:`, errorMsg)

    // Increment failure count and update last_failed_at
    try {
      const { data: currentWh } = await supabase
        .from('webhooks')
        .select('failure_count')
        .eq('id', webhookId)
        .single()
      const currentCount = (currentWh as { failure_count: number } | null)?.failure_count ?? 0
      await supabase
        .from('webhooks')
        .update({ failure_count: currentCount + 1, last_failed_at: new Date().toISOString() } as never)
        .eq('id', webhookId)
    } catch { /* non-critical */ }

    // Retry with exponential backoff
    if (attempt < maxAttempts) {
      const delayMs = Math.pow(2, attempt) * 1000 // 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delayMs))
      return deliverWebhook(webhookId, url, secret, event, payload, attempt + 1)
    }

    // Auto-disable webhook after 10 consecutive failures
    const { data: webhook } = await supabase
      .from('webhooks')
      .select('failure_count')
      .eq('id', webhookId)
      .single()

    if (webhook && (webhook as { failure_count: number }).failure_count >= 10) {
      await supabase
        .from('webhooks')
        .update({ is_active: false } as never)
        .eq('id', webhookId)
      console.warn(`[Webhooks] Auto-disabled webhook ${webhookId} after 10 consecutive failures`)
    }
  }
}

/**
 * Generate HMAC-SHA256 signature for webhook verification.
 */
function signPayload(body: string, secret: string, timestamp: string): string {
  const message = `${timestamp}.${body}`
  return createHmac('sha256', secret).update(message).digest('hex')
}

/**
 * Verify a webhook signature (for documentation/consumer use).
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string,
  timestamp: string,
  toleranceSeconds: number = 300
): boolean {
  // Check timestamp freshness
  const now = Math.floor(Date.now() / 1000)
  const ts = parseInt(timestamp, 10)
  if (Math.abs(now - ts) > toleranceSeconds) return false

  const expected = signPayload(body, secret, timestamp)
  return expected === signature
}
