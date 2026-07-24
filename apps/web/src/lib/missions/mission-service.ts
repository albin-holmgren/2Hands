/**
 * Mission Service
 *
 * Handles CRUD + scheduling for long-running Missions.
 * A Mission is a workspace-scoped, persistent goal the AI Manager
 * pursues over time by delegating work to specialist agents/workflows.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { GoalTree } from '@/lib/computer-use/subgoal-planner'

/**
 * Lightweight cron-next-time: computes the next Date after now() for simple
 * 5-part cron expressions (minute hour dom month dow).
 * Handles: specific time (0 9 * * *), every-N-minutes (*\/N * * * *),
 * every-N-hours (* *\/N * * *). Falls back to minIntervalMs on parse failure.
 */
function cronNextTime(expr: string, minIntervalMs = 60 * 60 * 1000): Date {
  const now = new Date()
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return new Date(now.getTime() + minIntervalMs)
  const [min, hr] = parts
  try {
    if (min.startsWith('*/')) {
      const iv = parseInt(min.slice(2), 10)
      if (!iv || iv > 59) return new Date(now.getTime() + minIntervalMs)
      const cur = now.getMinutes()
      const next = new Date(now)
      next.setSeconds(0); next.setMilliseconds(0)
      next.setMinutes(Math.ceil((cur + 1) / iv) * iv)
      if (next <= now) next.setMinutes(next.getMinutes() + iv)
      return next
    }
    if (hr.startsWith('*/')) {
      const iv = parseInt(hr.slice(2), 10)
      if (!iv || iv > 23) return new Date(now.getTime() + minIntervalMs)
      const next = new Date(now)
      next.setMinutes(parseInt(min, 10) || 0); next.setSeconds(0); next.setMilliseconds(0)
      const cur = now.getHours()
      next.setHours(Math.ceil((cur + 1) / iv) * iv)
      if (next <= now) next.setHours(next.getHours() + iv)
      return next
    }
    if (hr !== '*' && min !== '*') {
      const targetH = parseInt(hr, 10), targetM = parseInt(min, 10)
      const next = new Date(now)
      next.setHours(targetH); next.setMinutes(targetM); next.setSeconds(0); next.setMilliseconds(0)
      if (next <= now) next.setDate(next.getDate() + 1)
      return next
    }
  } catch { /* fall through */ }
  return new Date(now.getTime() + minIntervalMs)
}

// ============================================================
// Types
// ============================================================

export type MissionStatus = 'active' | 'paused' | 'completed' | 'failed'
export type MissionAutonomyLevel = 'draft_only' | 'execute_with_approval' | 'full_auto'
export type MissionCadenceMode = 'fixed' | 'adaptive'

export interface RepoConfig {
  owner: string
  repo: string
  base_branch: string
  vercel_project_id?: string
}

export interface MissionConstraints {
  kill_switch_enabled?: boolean
  max_actions_per_tick?: number
  max_agents_per_tick?: number
  max_active_agents?: number
  max_agents_per_day?: number
  queue_backpressure_threshold?: number
  spawn_freeze?: boolean
  max_cost_usd_per_day?: number
  allowed_integrations?: string[]
  outbound_messaging?: 'draft_only' | 'enabled'
  company_context?: string
  repo_config?: RepoConfig
  self_improvement?: boolean
}

export interface Mission {
  id: string
  workspace_id: string
  user_id: string
  goal: string
  status: MissionStatus
  autonomy_level: MissionAutonomyLevel
  constraints: MissionConstraints
  cadence_mode: MissionCadenceMode
  cadence_cron: string | null
  tick_timebox_minutes: number
  min_tick_interval_minutes: number
  max_ticks_per_day: number
  next_tick_at: string | null
  last_tick_at: string | null
  goal_tree: GoalTree | null
  handoff_note: string | null
  conversation_id: string | null
  created_at: string
  updated_at: string
}

export interface MissionEvent {
  id: number
  mission_id: string
  workspace_id: string
  user_id: string
  kind: string
  summary: string | null
  payload: Record<string, unknown>
  created_at: string
}

export interface CreateMissionInput {
  workspace_id: string
  user_id: string
  goal: string
  autonomy_level?: MissionAutonomyLevel
  constraints?: MissionConstraints
  cadence_mode?: MissionCadenceMode
  cadence_cron?: string
  tick_timebox_minutes?: number
  min_tick_interval_minutes?: number
  max_ticks_per_day?: number
  conversation_id?: string
}

// ============================================================
// Create
// ============================================================

export async function createMission(input: CreateMissionInput): Promise<Mission | null> {
  const supabase = createAdminClient()

  const now = new Date()
  const nextTickAt = new Date(now.getTime() + 30 * 1000) // first tick in 30 seconds

  const { data, error } = await supabase
    .from('missions')
    .insert({
      workspace_id: input.workspace_id,
      user_id: input.user_id,
      goal: input.goal,
      status: 'active',
      autonomy_level: input.autonomy_level ?? 'execute_with_approval',
      constraints: input.constraints ?? {},
      cadence_mode: input.cadence_mode ?? 'adaptive',
      cadence_cron: input.cadence_cron ?? null,
      tick_timebox_minutes: input.tick_timebox_minutes ?? 30,
      min_tick_interval_minutes: input.min_tick_interval_minutes ?? 15,
      max_ticks_per_day: input.max_ticks_per_day ?? 24,
      next_tick_at: nextTickAt.toISOString(),
      conversation_id: input.conversation_id ?? null,
    } as never)
    .select()
    .single()

  if (error) {
    console.error('[MissionService] createMission error:', error)
    return null
  }

  return data as Mission
}

// ============================================================
// Read
// ============================================================

export async function getMission(missionId: string): Promise<Mission | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('missions')
    .select('*')
    .eq('id', missionId)
    .single()

  if (error) return null
  return data as Mission
}

export async function getUserMissions(
  userId: string,
  workspaceId: string,
  status?: MissionStatus
): Promise<Mission[]> {
  const supabase = createAdminClient()
  let query = supabase
    .from('missions')
    .select('*')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) {
    console.error('[MissionService] getUserMissions error:', error)
    return []
  }

  return (data ?? []) as Mission[]
}

export async function getActiveMissions(workspaceId: string): Promise<Mission[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('missions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[MissionService] getActiveMissions error:', error)
    return []
  }

  return (data ?? []) as Mission[]
}

export async function getDueMissions(maxMissions = 10): Promise<Mission[]> {
  const supabase = createAdminClient()
  const now = new Date().toISOString()
  // Fetch missions that are due (next_tick_at <= now) OR have never been ticked (null)
  const [dueRes, newRes] = await Promise.all([
    supabase.from('missions').select('*').eq('status', 'active').lte('next_tick_at', now).order('next_tick_at', { ascending: true }).limit(maxMissions * 2),
    supabase.from('missions').select('*').eq('status', 'active').is('next_tick_at', null).limit(maxMissions),
  ])
  const error = dueRes.error || newRes.error
  const data = [...(dueRes.data ?? []), ...(newRes.data ?? [])]

  if (error) {
    console.error('[MissionService] getDueMissions error:', error)
    return []
  }

  const missions = (data ?? []) as Mission[]

  // Filter out missions that have hit their max_ticks_per_day limit
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  const filtered: Mission[] = []
  for (const mission of missions) {
    const maxPerDay = mission.max_ticks_per_day ?? 6
    if (maxPerDay <= 0) {
      filtered.push(mission)
      continue
    }
    const { count } = await supabase
      .from('mission_events')
      .select('*', { count: 'exact', head: true })
      .eq('mission_id', mission.id)
      .eq('kind', 'tick_completed')
      .gte('created_at', startOfDay.toISOString())
    const ticksToday = count ?? 0
    if (ticksToday < maxPerDay) {
      filtered.push(mission)
    } else {
      console.log(`[MissionService] Mission ${mission.id} hit max_ticks_per_day (${ticksToday}/${maxPerDay}) — skipping`)
      // Fire blocked webhook async — non-critical
      import('@/lib/api-platform/webhooks').then(({ dispatchWebhookEvent }) => {
        dispatchWebhookEvent(mission.user_id, 'mission.blocked', {
          mission_id: mission.id,
          goal: mission.goal,
          ticks_today: ticksToday,
          max_ticks_per_day: maxPerDay,
          reason: 'max_ticks_per_day_reached',
        }).catch(() => {})
      }).catch(() => {})
    }
    if (filtered.length >= maxMissions) break
  }

  return filtered
}

// ============================================================
// Update
// ============================================================

export async function updateMissionStatus(
  missionId: string,
  status: MissionStatus
): Promise<boolean> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('missions')
    .update({ status } as never)
    .eq('id', missionId)

  return !error
}

export async function updateMissionGoalTree(
  missionId: string,
  goalTree: GoalTree,
  handoffNote?: string
): Promise<boolean> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('missions')
    .update({
      goal_tree: goalTree as unknown as never,
      handoff_note: handoffNote ?? null,
      last_tick_at: new Date().toISOString(),
    } as never)
    .eq('id', missionId)

  return !error
}

export async function scheduleMissionNextTick(
  missionId: string,
  nextTickAt: Date
): Promise<boolean> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('missions')
    .update({ next_tick_at: nextTickAt.toISOString() } as never)
    .eq('id', missionId)

  return !error
}

export async function updateMission(
  missionId: string,
  updates: Partial<Pick<Mission, 'goal' | 'autonomy_level' | 'constraints' | 'tick_timebox_minutes' | 'min_tick_interval_minutes' | 'max_ticks_per_day'>>
): Promise<boolean> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('missions')
    .update(updates as never)
    .eq('id', missionId)

  return !error
}

// ============================================================
// Tick Lock (prevent double-running)
// ============================================================

export async function claimMissionTick(
  missionId: string,
  workerId: string,
  lockDurationMinutes = 45
): Promise<boolean> {
  const supabase = createAdminClient()
  const rpc = supabase.rpc.bind(supabase) as unknown as <T = unknown>(
    fn: string,
    params?: Record<string, unknown>
  ) => Promise<{ data: T | null; error: { message?: string } | null }>

  const { data, error } = await rpc<boolean>('claim_mission_tick', {
    p_mission_id: missionId,
    p_worker_id: workerId,
    p_lock_duration_minutes: lockDurationMinutes,
  })

  if (error) {
    console.error('[MissionService] claimMissionTick error:', error)
    return false
  }

  return Boolean(data)
}

export async function releaseMissionTick(missionId: string): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('mission_tick_locks').delete().eq('mission_id', missionId)
}

// ============================================================
// Events
// ============================================================

export async function appendMissionEvent(
  missionId: string,
  workspaceId: string,
  userId: string,
  kind: string,
  summary: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('mission_events').insert({
    mission_id: missionId,
    workspace_id: workspaceId,
    user_id: userId,
    kind,
    summary,
    payload,
  } as never)
}

export async function getMissionEvents(
  missionId: string,
  limit = 50
): Promise<MissionEvent[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('mission_events')
    .select('*')
    .eq('mission_id', missionId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return []
  return (data ?? []) as MissionEvent[]
}

// ============================================================
// Adaptive scheduling helper
// ============================================================

export function computeNextTickAt(mission: Mission, ticksRunToday: number): Date {
  const now = new Date()

  // Daily cap: if we've hit max_ticks_per_day, schedule for tomorrow at 8 AM UTC
  if (ticksRunToday >= mission.max_ticks_per_day) {
    const tomorrow = new Date(now)
    tomorrow.setUTCHours(8, 0, 0, 0)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow
  }

  // Fixed cadence: use cron expression
  if (mission.cadence_mode === 'fixed' && mission.cadence_cron) {
    const minIntervalMs = mission.min_tick_interval_minutes * 60 * 1000
    const nextCron = cronNextTime(mission.cadence_cron, minIntervalMs)
    // Never schedule sooner than min_tick_interval even for fixed cadence
    if (nextCron.getTime() - now.getTime() < minIntervalMs) {
      return new Date(now.getTime() + minIntervalMs)
    }
    return nextCron
  }

  // Adaptive cadence: use min_tick_interval
  return new Date(now.getTime() + mission.min_tick_interval_minutes * 60 * 1000)
}

// ============================================================
// Count today's ticks
// ============================================================

export async function countMissionTicksToday(missionId: string): Promise<number> {
  const supabase = createAdminClient()
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  const { count, error } = await supabase
    .from('mission_events')
    .select('*', { count: 'exact', head: true })
    .eq('mission_id', missionId)
    .eq('kind', 'tick_completed')
    .gte('created_at', startOfDay.toISOString())

  if (error) return 0
  return count ?? 0
}

// ============================================================
// Mission stats
// ============================================================

export async function getMissionStats(missionId: string): Promise<{
  tick_count: number
  agent_count: number
  findings_count: number
  total_tasks: number
  done_tasks: number
  progress_pct: number
}> {
  const supabase = createAdminClient()
  const [eventsRes, missionRes] = await Promise.all([
    supabase.from('mission_events').select('kind').eq('mission_id', missionId),
    supabase.from('missions').select('goal_tree').eq('id', missionId).single(),
  ])
  const evts = (eventsRes.data ?? []) as Array<{ kind: string }>
  const tick_count = evts.filter(e => e.kind === 'tick_completed').length
  const agent_count = evts.filter(e => e.kind === 'agent_delegated').length
  const findings_count = evts.filter(e => e.kind === 'agent_completed').length

  const tree = (missionRes.data as { goal_tree?: unknown } | null)?.goal_tree as {
    projects?: Array<{ tasks?: Array<{ status?: string }> }>
  } | null
  const total_tasks = tree?.projects?.reduce((s, p) => s + (p.tasks?.length ?? 0), 0) ?? 0
  const done_tasks = tree?.projects?.reduce((s, p) => s + (p.tasks?.filter(t => t.status === 'completed').length ?? 0), 0) ?? 0
  const progress_pct = total_tasks > 0 ? Math.round((done_tasks / total_tasks) * 100) : 0

  return { tick_count, agent_count, findings_count, total_tasks, done_tasks, progress_pct }
}

// ============================================================
// Format for AI Manager context
// ============================================================

export function formatMissionsForPrompt(missions: Mission[]): string {
  if (missions.length === 0) return ''

  const lines = ['ACTIVE MISSIONS (do NOT re-propose a mission that already exists here):']
  for (const m of missions) {
    const status = m.status === 'active' ? '🟢 active' : m.status === 'paused' ? '⏸ paused' : m.status === 'completed' ? '✅ completed' : '⚫ failed'
    const nextTick = m.next_tick_at
      ? `next tick in ${Math.max(0, Math.round((new Date(m.next_tick_at).getTime() - Date.now()) / 60000))} min`
      : 'no tick scheduled'

    // Compute progress
    const tree = m.goal_tree as { projects?: Array<{ name?: string; status?: string; tasks?: Array<{ status?: string }> }> } | null
    const totalTasks = tree?.projects?.reduce((s, p) => s + (p.tasks?.length ?? 0), 0) ?? 0
    const doneTasks = tree?.projects?.reduce((s, p) => s + (p.tasks?.filter(t => t.status === 'completed').length ?? 0), 0) ?? 0
    const progressStr = totalTasks > 0 ? ` — ${Math.round((doneTasks / totalTasks) * 100)}% complete (${doneTasks}/${totalTasks} tasks)` : ''
    const currentProject = tree?.projects?.find(p => p.status === 'in_progress')?.name
    const projectStr = currentProject ? ` — currently working on: "${currentProject}"` : ''

    const autonomyNote = m.autonomy_level === 'execute_with_approval' ? ' ⚠️ WAITING FOR YOUR APPROVAL to run next tick' : m.autonomy_level === 'draft_only' ? ' (draft only — not auto-running)' : ''
    lines.push(`• [${m.id.slice(0, 8)}] "${m.goal}" — ${status}${autonomyNote}${progressStr}${projectStr} — ${nextTick}`)
    if (m.handoff_note) {
      const summary = m.handoff_note.replace(/^##.*?\n/m, '').trim().slice(0, 200)
      if (summary) lines.push(`  Last tick: ${summary}`)
    }
  }

  return lines.join('\n')
}
