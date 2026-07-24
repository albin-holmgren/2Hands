/**
 * Public REST API v1 — Agents
 *
 * Authenticated via API keys (Bearer token).
 * Endpoints:
 *   GET  /api/v1/agents         — List agents
 *   GET  /api/v1/agents?id=X    — Get single agent
 *   POST /api/v1/agents         — Create agent
 *   POST /api/v1/agents/run     — Trigger agent run (handled by separate route)
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, hasPermission } from '@/lib/api-platform/api-keys'
import { createClient } from '@/lib/supabase/server'

function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

async function authenticateRequest(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }
  const rawKey = authHeader.slice(7)
  return validateApiKey(rawKey)
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if (!auth) return apiError('Invalid or missing API key', 401)
  if (!hasPermission(auth.permissions, 'agents:read')) {
    return apiError('Insufficient permissions: agents:read required', 403)
  }

  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (id) {
    const { data, error } = await supabase
      .from('agents')
      .select('id, name, type, status, schedule_type, schedule_cron, last_run_at, next_run_at, total_credits_used, config, created_at')
      .eq('id', id)
      .eq('user_id', auth.userId)
      .single()

    if (error || !data) return apiError('Agent not found', 404)
    return NextResponse.json({ agent: formatAgent(data as Record<string, unknown>) })
  }

  const { data, error } = await supabase
    .from('agents')
    .select('id, name, type, status, schedule_type, schedule_cron, last_run_at, next_run_at, total_credits_used, config, created_at')
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return apiError('Failed to fetch agents', 500)

  return NextResponse.json({
    agents: ((data || []) as Array<Record<string, unknown>>).map(formatAgent),
    count: data?.length || 0,
  })
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if (!auth) return apiError('Invalid or missing API key', 401)
  if (!hasPermission(auth.permissions, 'agents:write')) {
    return apiError('Insufficient permissions: agents:write required', 403)
  }

  const body = await request.json().catch(() => null)
  if (!body) return apiError('Invalid JSON body', 400)

  const { name, type, description, schedule_type, schedule_cron } = body as {
    name?: string
    type?: string
    description?: string
    schedule_type?: string
    schedule_cron?: string
  }

  if (!name || !description) {
    return apiError('name and description are required', 400)
  }

  const supabase = await createClient()

  // Create conversation for agent
  const { data: conversation } = await supabase
    .from('conversations')
    .insert({
      user_id: auth.userId,
      title: `Agent: ${name}`,
      status: 'active',
    } as never)
    .select('id')
    .single()

  const conversationId = (conversation as { id: string } | null)?.id

  // Calculate next run time if scheduled
  let nextRunAt: string | null = null
  if (schedule_type === 'scheduled' && schedule_cron) {
    try {
      const { calculateNextRunTime } = await import('@/lib/scheduler/agent-scheduler')
      const nextDate = calculateNextRunTime(schedule_cron, 'UTC')
      nextRunAt = nextDate instanceof Date ? nextDate.toISOString() : String(nextDate)
    } catch {
      // Invalid cron — ignore
    }
  } else if (schedule_type === 'once') {
    nextRunAt = new Date(Date.now() + 10000).toISOString()
  }

  const { data: agent, error } = await supabase
    .from('agents')
    .insert({
      user_id: auth.userId,
      name,
      type: type || 'custom',
      status: 'idle',
      schedule_type: schedule_type || 'once',
      schedule_cron: schedule_cron || null,
      schedule_timezone: 'UTC',
      next_run_at: nextRunAt,
      conversation_id: conversationId,
      config: {
        description,
        created_via: 'api',
      },
    } as never)
    .select('id, name, type, status, schedule_type, schedule_cron, created_at')
    .single()

  if (error) {
    console.error('[API v1] Failed to create agent:', error)
    return apiError('Failed to create agent', 500)
  }

  return NextResponse.json({
    agent: formatAgent(agent as Record<string, unknown>),
  }, { status: 201 })
}

function formatAgent(data: Record<string, unknown>) {
  const config = data.config as Record<string, unknown> | null
  return {
    id: data.id,
    name: data.name,
    type: data.type,
    status: data.status,
    description: config?.description || null,
    schedule: {
      type: data.schedule_type,
      cron: data.schedule_cron || null,
    },
    lastRunAt: data.last_run_at || null,
    nextRunAt: data.next_run_at || null,
    creditsUsed: data.total_credits_used || 0,
    createdAt: data.created_at,
  }
}
