import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createWebhook,
  listWebhooks,
  deleteWebhook,
  type WebhookEvent,
} from '@/lib/api-platform/webhooks'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const webhookId = searchParams.get('webhookId')
  const action = searchParams.get('action')

  const requestedWorkspaceId = searchParams.get('workspaceId')
    || req.cookies.get('2hands_active_workspace_id')?.value
    || null

  const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
    strictPreferred: Boolean(requestedWorkspaceId),
  })

  if (!scope.workspaceId || !scope.role) {
    return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 403 })
  }

  // Get deliveries for a specific webhook
  if (webhookId && action === 'deliveries') {
    const { data, error } = await supabase
      .from('webhook_deliveries')
      .select('*')
      .eq('webhook_id', webhookId)
      .order('delivered_at', { ascending: false })
      .limit(20)

    if (error) return NextResponse.json({ error: 'Failed to fetch deliveries' }, { status: 500 })

    const deliveries = ((data || []) as Array<Record<string, unknown>>).map(d => ({
      id: d.id,
      webhookId: d.webhook_id,
      event: d.event,
      statusCode: d.response_status ?? null,
      success: d.success,
      deliveredAt: d.delivered_at,
      error: (!d.success && typeof d.response_body === 'string') ? (d.response_body as string).slice(0, 200) : null,
    }))

    return NextResponse.json({ deliveries })
  }

  // List all webhooks
  const webhooks = await listWebhooks(user.id, scope.workspaceId)
  return NextResponse.json({
    webhooks: webhooks.map(w => ({
      id: w.id,
      url: w.url,
      events: w.events,
      isActive: w.isActive,
      failureCount: w.failureCount,
      createdAt: w.createdAt,
    })),
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { url?: string; events?: string[]; workspaceId?: string }

  const requestedWorkspaceId = (typeof body.workspaceId === 'string' && body.workspaceId.trim())
    || req.cookies.get('2hands_active_workspace_id')?.value
    || null

  const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
    strictPreferred: Boolean(requestedWorkspaceId),
  })

  if (!scope.workspaceId || !scope.role) {
    return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 403 })
  }

  if (!body.url || !body.events?.length) {
    return NextResponse.json({ error: 'url and events are required' }, { status: 400 })
  }

  // Validate URL
  try {
    new URL(body.url)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  const result = await createWebhook(user.id, scope.workspaceId, body.url, body.events as WebhookEvent[])
  if (!result) {
    return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 })
  }

  return NextResponse.json({
    webhook: {
      id: result.webhook.id,
      url: result.webhook.url,
      events: result.webhook.events,
      isActive: result.webhook.isActive,
      createdAt: result.webhook.createdAt,
    },
    secret: result.secret,
    warning: 'Save this signing secret now. It will not be shown again.',
  }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const webhookId = searchParams.get('webhookId')

  if (!webhookId) {
    return NextResponse.json({ error: 'webhookId required' }, { status: 400 })
  }

  const requestedWorkspaceId = searchParams.get('workspaceId')
    || req.cookies.get('2hands_active_workspace_id')?.value
    || null

  const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
    strictPreferred: Boolean(requestedWorkspaceId),
  })

  if (!scope.workspaceId || !scope.role) {
    return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 403 })
  }

  const deleted = await deleteWebhook(user.id, scope.workspaceId, webhookId)
  if (!deleted) {
    return NextResponse.json({ error: 'Failed to delete webhook' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
