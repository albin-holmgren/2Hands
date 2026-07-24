import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'
import {
  createMission,
  getUserMissions,
  getMission,
  updateMissionStatus,
  updateMission,
  getMissionEvents,
  claimMissionTick,
  releaseMissionTick,
  formatMissionsForPrompt,
  type MissionStatus,
  type MissionAutonomyLevel,
  type MissionConstraints,
} from '@/lib/missions/mission-service'
import { runMissionTick } from '@/lib/missions/mission-tick'

export const maxDuration = 300

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const rounded = Math.round(value)
  return Math.max(min, Math.min(max, rounded))
}

function sanitizeMissionConstraints(input: unknown, base: MissionConstraints = {}): MissionConstraints {
  const baseRaw = (base && typeof base === 'object')
    ? base as Record<string, unknown>
    : {}
  const raw = (input && typeof input === 'object')
    ? input as Record<string, unknown>
    : {}
  const merged = {
    ...baseRaw,
    ...raw,
  }

  return {
    ...merged,
    max_agents_per_tick: clampInt(merged.max_agents_per_tick, 2, 1, 5),
    max_active_agents: clampInt(merged.max_active_agents, 5, 1, 20),
    max_agents_per_day: clampInt(merged.max_agents_per_day, 20, 1, 200),
    queue_backpressure_threshold: clampInt(merged.queue_backpressure_threshold, 25, 1, 200),
    spawn_freeze: merged.spawn_freeze === true,
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId')
    const missionId = searchParams.get('id')
    const eventsFor = searchParams.get('events')
    const statusFilter = searchParams.get('status') as MissionStatus | null
    const fmt = searchParams.get('format')

    const scope = await resolveWorkspaceScope(user.id, workspaceId, { strictPreferred: !!workspaceId })
    if (!scope.workspaceId) return NextResponse.json({ error: 'Workspace not found' }, { status: 403 })

    if (eventsFor) {
      const mission = await getMission(eventsFor)
      if (!mission || mission.user_id !== user.id) {
        return NextResponse.json({ error: 'Mission not found' }, { status: 404 })
      }
      const events = await getMissionEvents(eventsFor)
      return NextResponse.json({ events })
    }

    if (missionId) {
      const mission = await getMission(missionId)
      if (!mission || mission.user_id !== user.id) {
        return NextResponse.json({ error: 'Mission not found' }, { status: 404 })
      }
      return NextResponse.json({ mission })
    }

    const missions = await getUserMissions(user.id, scope.workspaceId, statusFilter ?? undefined)

    if (fmt === 'prompt') {
      return NextResponse.json({ prompt: formatMissionsForPrompt(missions) })
    }

    // Optionally include per-mission stats when ?stats=true
    if (searchParams.get('stats') === 'true' && missions.length > 0) {
      const admin = (await import('@/lib/supabase/admin')).createAdminClient()
      const { data: eventsRaw } = await admin
        .from('mission_events')
        .select('mission_id, kind')
        .in('mission_id', missions.map(m => m.id))
      const evts = (eventsRaw ?? []) as Array<{ mission_id: string; kind: string }>
      const tickCounts: Record<string, number> = {}
      const agentCounts: Record<string, number> = {}
      for (const ev of evts) {
        if (ev.kind === 'tick_completed') tickCounts[ev.mission_id] = (tickCounts[ev.mission_id] ?? 0) + 1
        if (ev.kind === 'agent_delegated') agentCounts[ev.mission_id] = (agentCounts[ev.mission_id] ?? 0) + 1
      }
      const missionsWithStats = missions.map(m => ({
        ...m,
        tick_count: tickCounts[m.id] ?? 0,
        agent_count: agentCounts[m.id] ?? 0,
      }))
      return NextResponse.json({ missions: missionsWithStats })
    }

    return NextResponse.json({ missions })
  } catch (error) {
    console.error('[Missions API] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { action } = body

    const workspaceId = body.workspaceId || request.cookies.get('2hands_active_workspace_id')?.value
    const scope = await resolveWorkspaceScope(user.id, workspaceId, { strictPreferred: !!workspaceId })
    if (!scope.workspaceId) return NextResponse.json({ error: 'Workspace not found' }, { status: 403 })

    if (action === 'create') {
      const { goal, autonomy_level, constraints, cadence_mode, cadence_cron, tick_timebox_minutes, min_tick_interval_minutes, max_ticks_per_day, conversation_id } = body

      if (!goal?.trim()) return NextResponse.json({ error: 'Goal is required' }, { status: 400 })

      const normalizedConstraints = sanitizeMissionConstraints(constraints)

      const mission = await createMission({
        workspace_id: scope.workspaceId,
        user_id: user.id,
        goal: goal.trim(),
        autonomy_level: autonomy_level as MissionAutonomyLevel,
        constraints: normalizedConstraints,
        cadence_mode: cadence_mode ?? 'adaptive',
        cadence_cron: cadence_cron ?? undefined,
        tick_timebox_minutes: tick_timebox_minutes ?? 30,
        min_tick_interval_minutes: min_tick_interval_minutes ?? 60,
        max_ticks_per_day: max_ticks_per_day ?? 6,
        conversation_id: conversation_id ?? undefined,
      })

      if (!mission) return NextResponse.json({ error: 'Failed to create mission' }, { status: 500 })

      // Fire first tick immediately in the background — don't block the response
      const firstTickWorkerId = `create-${user.id.slice(0, 8)}-${Date.now()}`
      claimMissionTick(mission.id, firstTickWorkerId, (mission.tick_timebox_minutes ?? 20) + 5).then(claimed => {
        if (claimed) {
          runMissionTick(mission).catch(err => {
            console.error('[Missions API] First tick failed for mission', mission.id, err)
          })
        }
      }).catch(() => {})

      return NextResponse.json({ success: true, mission })
    }

    if (action === 'pause' || action === 'resume') {
      const { mission_id } = body
      if (!mission_id) return NextResponse.json({ error: 'mission_id required' }, { status: 400 })

      const mission = await getMission(mission_id)
      if (!mission || mission.user_id !== user.id) {
        return NextResponse.json({ error: 'Mission not found' }, { status: 404 })
      }

      const newStatus: MissionStatus = action === 'pause' ? 'paused' : 'active'
      const ok = await updateMissionStatus(mission_id, newStatus)
      return NextResponse.json({ success: ok })
    }

    if (action === 'set_spawn_freeze') {
      const freezeEnabled = body.enabled !== false
      const missionId = typeof body.mission_id === 'string' ? body.mission_id : null

      if (missionId) {
        const mission = await getMission(missionId)
        if (!mission || mission.user_id !== user.id || mission.workspace_id !== scope.workspaceId) {
          return NextResponse.json({ error: 'Mission not found' }, { status: 404 })
        }

        const constraints = sanitizeMissionConstraints({ spawn_freeze: freezeEnabled }, mission.constraints)
        const ok = await updateMission(mission.id, { constraints })
        return NextResponse.json({ success: ok, enabled: freezeEnabled, affected: ok ? 1 : 0 })
      }

      const missions = await getUserMissions(user.id, scope.workspaceId)
      const eligibleMissions = missions.filter(m => m.workspace_id === scope.workspaceId && m.status !== 'completed')

      const updateResults = await Promise.allSettled(
        eligibleMissions.map(async mission => {
          const constraints = sanitizeMissionConstraints({ spawn_freeze: freezeEnabled }, mission.constraints)
          return updateMission(mission.id, { constraints })
        })
      )

      const affected = updateResults.filter(r => r.status === 'fulfilled' && r.value).length
      const failed = updateResults.length - affected

      return NextResponse.json({
        success: failed === 0,
        enabled: freezeEnabled,
        affected,
        failed,
      })
    }

    if (action === 'update') {
      const { mission_id, updates } = body
      if (!mission_id) return NextResponse.json({ error: 'mission_id required' }, { status: 400 })

      const mission = await getMission(mission_id)
      if (!mission || mission.user_id !== user.id) {
        return NextResponse.json({ error: 'Mission not found' }, { status: 404 })
      }

      const normalizedUpdates = {
        ...(typeof updates === 'object' && updates ? updates as Record<string, unknown> : {}),
      }
      if ('constraints' in normalizedUpdates) {
        normalizedUpdates.constraints = sanitizeMissionConstraints(normalizedUpdates.constraints, mission.constraints)
      }

      const ok = await updateMission(mission_id, normalizedUpdates as Parameters<typeof updateMission>[1])
      return NextResponse.json({ success: ok })
    }

    if (action === 'delete') {
      const { mission_id } = body
      if (!mission_id) return NextResponse.json({ error: 'mission_id required' }, { status: 400 })

      const mission = await getMission(mission_id)
      if (!mission || mission.user_id !== user.id) {
        return NextResponse.json({ error: 'Mission not found' }, { status: 404 })
      }

      const supabase = await createClient()
      await supabase.from('mission_events').delete().eq('mission_id', mission_id)
      await supabase.from('missions').delete().eq('id', mission_id)
      return NextResponse.json({ success: true })
    }

    if (action === 'update') {
      const { mission_id, goal, autonomy_level, tick_timebox_minutes, max_ticks_per_day } = body
      if (!mission_id) return NextResponse.json({ error: 'mission_id required' }, { status: 400 })

      const mission = await getMission(mission_id)
      if (!mission || mission.user_id !== user.id) {
        return NextResponse.json({ error: 'Mission not found' }, { status: 404 })
      }

      const updates: Parameters<typeof updateMission>[1] = {}
      if (typeof goal === 'string' && goal.trim()) updates.goal = goal.trim()
      if (typeof autonomy_level === 'string') updates.autonomy_level = autonomy_level as MissionAutonomyLevel
      if (typeof tick_timebox_minutes === 'number') updates.tick_timebox_minutes = tick_timebox_minutes
      if (typeof max_ticks_per_day === 'number') updates.max_ticks_per_day = max_ticks_per_day

      const ok = await updateMission(mission_id, updates)
      return NextResponse.json({ success: ok })
    }

    if (action === 'duplicate') {
      const { mission_id } = body
      if (!mission_id) return NextResponse.json({ error: 'mission_id required' }, { status: 400 })

      const source = await getMission(mission_id)
      if (!source || source.user_id !== user.id) {
        return NextResponse.json({ error: 'Mission not found' }, { status: 404 })
      }

      const duplicated = await createMission({
        workspace_id: source.workspace_id,
        user_id: user.id,
        goal: source.goal,
        autonomy_level: source.autonomy_level,
        constraints: sanitizeMissionConstraints(source.constraints),
        tick_timebox_minutes: source.tick_timebox_minutes,
        min_tick_interval_minutes: source.min_tick_interval_minutes,
        max_ticks_per_day: source.max_ticks_per_day,
      })

      return NextResponse.json({ success: !!duplicated, mission: duplicated })
    }

    if (action === 'complete') {
      const { mission_id } = body
      if (!mission_id) return NextResponse.json({ error: 'mission_id required' }, { status: 400 })

      const mission = await getMission(mission_id)
      if (!mission || mission.user_id !== user.id) {
        return NextResponse.json({ error: 'Mission not found' }, { status: 404 })
      }

      const ok = await updateMissionStatus(mission_id, 'completed')
      return NextResponse.json({ success: ok })
    }

    if (action === 'run_now') {
      const { mission_id } = body
      if (!mission_id) return NextResponse.json({ error: 'mission_id required' }, { status: 400 })

      const mission = await getMission(mission_id)
      if (!mission || mission.user_id !== user.id) {
        return NextResponse.json({ error: 'Mission not found' }, { status: 404 })
      }
      if (mission.status !== 'active') {
        return NextResponse.json({ error: 'Mission is not active' }, { status: 400 })
      }

      const workerId = `manual-${user.id.slice(0, 8)}-${Date.now()}`
      // Force-release any stale lock so Run Now always works even after a cron timeout
      await releaseMissionTick(mission_id)
      const claimed = await claimMissionTick(mission_id, workerId, 20)
      if (!claimed) {
        return NextResponse.json({ error: 'Could not acquire tick lock' }, { status: 409 })
      }

      const tickResult = await runMissionTick(mission)
      return NextResponse.json({ success: tickResult.success, summary: tickResult.summary, error: tickResult.error })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('[Missions API] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json() as { mission_id: string; task_id: string; status: string }
    const { mission_id, task_id, status } = body

    if (!mission_id || !task_id || !status) {
      return NextResponse.json({ error: 'mission_id, task_id, and status are required' }, { status: 400 })
    }

    const mission = await getMission(mission_id)
    if (!mission || mission.user_id !== user.id) {
      return NextResponse.json({ error: 'Mission not found' }, { status: 404 })
    }

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data: missionRow } = await admin
      .from('missions')
      .select('goal_tree')
      .eq('id', mission_id)
      .single() as { data: { goal_tree?: unknown } | null; error: unknown }

    if (!missionRow?.goal_tree) {
      return NextResponse.json({ error: 'No goal tree' }, { status: 404 })
    }

    const gt = missionRow.goal_tree as {
      projects?: Array<{ id?: string; tasks?: Array<{ id?: string; status?: string }> }>
      updated_at?: string
    }
    let found = false
    for (const proj of gt.projects ?? []) {
      for (const task of proj.tasks ?? []) {
        if (task.id === task_id) {
          task.status = status
          found = true
          break
        }
      }
      if (found) break
    }

    if (!found) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    gt.updated_at = new Date().toISOString()
    await admin.from('missions').update({ goal_tree: gt } as never).eq('id', mission_id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Missions API] PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
