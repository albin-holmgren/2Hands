import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: mission, error } = await admin
    .from('missions')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !mission) {
    return NextResponse.json({ error: 'Mission not found' }, { status: 404 })
  }

  const { data: events } = await admin
    .from('mission_events')
    .select('*')
    .eq('mission_id', id)
    .order('created_at', { ascending: false })
    .limit(100)

  // Fetch agent_runs aggregates for the assembly-line workflow view.
  // We join via agents.config.mission_id since agent_runs doesn't have a direct mission FK.
  const { data: missionAgents } = await admin
    .from('agents')
    .select('id, name, status, config, vm_ip, last_active')
    .contains('config', { mission_id: id, mission_spawned: true })
    .order('created_at', { ascending: false })
    .limit(50)

  const agentIds = (missionAgents ?? []).map((a: { id: string }) => a.id)

  let runAggregates: {
    queued: number; claimed: number; running: number; completed: number; failed: number; timeout: number;
    active_tasks: Array<{ agent_id: string; agent_name: string; task: string; status: string; retry_run_id?: string | null; retry_available_at?: string | null }>
    recent_failures: Array<{ agent_id: string; agent_name: string; error: string; retry_scheduled: boolean; retry_available_at: string | null; created_at: string }>
    needs_approval_count: number
  } = { queued: 0, claimed: 0, running: 0, completed: 0, failed: 0, timeout: 0, active_tasks: [], recent_failures: [], needs_approval_count: 0 }

  if (agentIds.length > 0) {
    const { data: runs } = await admin
      .from('agent_runs')
      .select('run_id, agent_id, status, task_description, error_message, metadata, queued_at, started_at, completed_at, updated_at')
      .in('agent_id', agentIds)
      .order('queued_at', { ascending: false })
      .limit(200)

    const agentNameMap = Object.fromEntries(
      (missionAgents ?? []).map((a: { id: string; name: string }) => [a.id, a.name])
    )
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

    for (const run of (runs ?? []) as Array<{
      run_id: string; agent_id: string; status: string; task_description: string;
      error_message?: string | null; metadata?: Record<string, unknown> | null;
      queued_at?: string; started_at?: string | null; completed_at?: string | null; updated_at?: string
    }>) {
      if (run.queued_at && run.queued_at < twoDaysAgo && !['queued','running','claimed'].includes(run.status)) continue

      switch (run.status) {
        case 'queued':    runAggregates.queued++;    break
        case 'claimed':   runAggregates.claimed++;   break
        case 'running':   runAggregates.running++;   break
        case 'completed': runAggregates.completed++; break
        case 'failed':    runAggregates.failed++;    break
        case 'timeout':   runAggregates.timeout++;   break
      }

      if (['queued', 'claimed', 'running'].includes(run.status)) {
        const meta = run.metadata ?? {}
        runAggregates.active_tasks.push({
          agent_id: run.agent_id,
          agent_name: agentNameMap[run.agent_id] ?? run.agent_id.slice(0, 8),
          task: run.task_description.slice(0, 120),
          status: run.status,
          retry_run_id: meta.retry_of_run_id as string | null ?? null,
          retry_available_at: meta.retry_available_at as string | null ?? null,
        })
      }

      if (run.status === 'failed' && run.error_message) {
        const meta = run.metadata ?? {}
        runAggregates.recent_failures.push({
          agent_id: run.agent_id,
          agent_name: agentNameMap[run.agent_id] ?? run.agent_id.slice(0, 8),
          error: run.error_message.slice(0, 200),
          retry_scheduled: Boolean(meta.retry_scheduled),
          retry_available_at: meta.retry_available_at as string | null ?? null,
          created_at: run.completed_at ?? run.updated_at ?? '',
        })
      }
    }

    // Trim to most recent 5 failures
    runAggregates.recent_failures = runAggregates.recent_failures.slice(0, 5)
  }

  // Count pending approval delegations from events
  const approvalEvents = (events ?? []).filter((e: { kind: string; payload?: Record<string, unknown> | null }) =>
    e.kind === 'agent_delegated' && (e.payload as Record<string, unknown> | null)?.needs_approval === true
  )
  runAggregates.needs_approval_count = approvalEvents.length

  return NextResponse.json({ mission, events: events ?? [], run_aggregates: runAggregates })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const admin = createAdminClient()

  // Verify ownership
  const { data: existing } = await admin
    .from('missions')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Mission not found' }, { status: 404 })

  // Whitelist updatable fields
  const allowed = ['goal', 'autonomy_level', 'constraints', 'tick_timebox_minutes', 'max_ticks_per_day', 'status']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  updates.updated_at = new Date().toISOString()

  const { data: updated, error } = await admin
    .from('missions')
    .update(updates as never)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[Mission PATCH] Update error:', error)
    return NextResponse.json({ error: 'Failed to update mission' }, { status: 500 })
  }
  return NextResponse.json({ mission: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Verify ownership before deletion
  const { data: existing } = await admin
    .from('missions')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Mission not found' }, { status: 404 })

  // Delete events first, then mission
  await admin.from('mission_events').delete().eq('mission_id', id)
  const { error } = await admin.from('missions').delete().eq('id', id)

  if (error) {
    console.error('[Mission DELETE] Delete error:', error)
    return NextResponse.json({ error: 'Failed to delete mission' }, { status: 500 })
  }
  return NextResponse.json({ deleted: true })
}
