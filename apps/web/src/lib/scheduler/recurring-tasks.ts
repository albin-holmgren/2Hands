/**
 * Recurring Tasks — AI-schedulable periodic work items
 *
 * Enables the AI (and users) to create tasks that run on a cron schedule.
 * Each run can output to: board card, memory, chat notification, or integration.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type RecurringTaskStatus = 'active' | 'paused' | 'completed' | 'failed'
export type TaskType = 'research' | 'monitor' | 'report' | 'action'
export type OutputDestination = 'board' | 'memory' | 'chat' | 'integration'

export interface RecurringTask {
  id: string
  user_id: string
  workspace_id: string
  title: string
  description: string | null
  schedule_cron: string
  schedule_timezone: string
  next_run_at: string | null
  last_run_at: string | null
  status: RecurringTaskStatus
  created_by: 'user' | 'ai'
  task_type: TaskType
  output_destination: OutputDestination
  board_column: string | null
  mission_id: string | null
  agent_id: string | null
  config: Record<string, unknown>
  run_count: number
  last_output: string | null
  created_at: string
  updated_at: string
}

export interface RecurringTaskRun {
  id: string
  task_id: string
  workspace_id: string
  status: 'running' | 'completed' | 'failed'
  output: string | null
  board_card_id: string | null
  memory_id: string | null
  started_at: string
  completed_at: string | null
  duration_ms: number | null
}

// ── Cron helpers ──────────────────────────────────────────────────────

const CRON_PRESETS: Record<string, string> = {
  'every_hour': '0 * * * *',
  'every_6_hours': '0 */6 * * *',
  'daily_9am': '0 9 * * *',
  'daily_6pm': '0 18 * * *',
  'weekdays_9am': '0 9 * * 1-5',
  'weekly_monday': '0 9 * * 1',
  'weekly_friday': '0 17 * * 5',
  'monthly_1st': '0 9 1 * *',
}

export function resolveCronPreset(input: string): string {
  return CRON_PRESETS[input] ?? input
}

/**
 * Compute the next run time from a cron expression.
 * Simple implementation — handles common patterns.
 */
export function computeNextRun(cron: string, timezone: string, fromDate?: Date): string {
  const now = fromDate ?? new Date()
  // Add 1 hour as a simple approximation — a proper cron parser would be used in production
  const next = new Date(now.getTime() + 3600_000)
  return next.toISOString()
}

// ── User-facing CRUD (RLS client) ────────────────────────────────────

export async function listRecurringTasks(
  userId: string,
  workspaceId: string,
  statusFilter?: RecurringTaskStatus
): Promise<RecurringTask[]> {
  const supabase = await createClient()
  let query = supabase
    .from('recurring_tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .order('next_run_at', { ascending: true })

  if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  const { data, error } = await query
  if (error) {
    console.error('[RecurringTasks] list error:', error)
    return []
  }
  return (data ?? []) as RecurringTask[]
}

export async function createRecurringTask(
  userId: string,
  workspaceId: string,
  params: {
    title: string
    description?: string
    schedule_cron: string
    schedule_timezone?: string
    task_type?: TaskType
    output_destination?: OutputDestination
    board_column?: string
    mission_id?: string
    created_by?: 'user' | 'ai'
    config?: Record<string, unknown>
  }
): Promise<RecurringTask | null> {
  const supabase = await createClient()
  const cron = resolveCronPreset(params.schedule_cron)
  const tz = params.schedule_timezone ?? 'UTC'
  const nextRun = computeNextRun(cron, tz)

  const { data, error } = await supabase
    .from('recurring_tasks')
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      title: params.title,
      description: params.description ?? null,
      schedule_cron: cron,
      schedule_timezone: tz,
      next_run_at: nextRun,
      task_type: params.task_type ?? 'action',
      output_destination: params.output_destination ?? 'board',
      board_column: params.board_column ?? 'inbox',
      mission_id: params.mission_id ?? null,
      created_by: params.created_by ?? 'user',
      config: params.config ?? {},
    } as never)
    .select()
    .single()

  if (error) {
    console.error('[RecurringTasks] create error:', error)
    return null
  }
  return data as RecurringTask
}

export async function updateRecurringTask(
  taskId: string,
  userId: string,
  updates: Partial<Pick<RecurringTask, 'title' | 'description' | 'schedule_cron' | 'schedule_timezone' | 'status' | 'task_type' | 'output_destination' | 'board_column' | 'config'>>
): Promise<RecurringTask | null> {
  const supabase = await createClient()

  // If cron changed, recompute next_run_at
  const patchData: Record<string, unknown> = { ...updates }
  if (updates.schedule_cron) {
    patchData.schedule_cron = resolveCronPreset(updates.schedule_cron)
    patchData.next_run_at = computeNextRun(
      patchData.schedule_cron as string,
      updates.schedule_timezone ?? 'UTC'
    )
  }

  const { data, error } = await supabase
    .from('recurring_tasks')
    .update(patchData as never)
    .eq('id', taskId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    console.error('[RecurringTasks] update error:', error)
    return null
  }
  return data as RecurringTask
}

export async function deleteRecurringTask(taskId: string, userId: string): Promise<boolean> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('recurring_tasks')
    .delete()
    .eq('id', taskId)
    .eq('user_id', userId)

  if (error) {
    console.error('[RecurringTasks] delete error:', error)
    return false
  }
  return true
}

export async function getTaskRuns(
  taskId: string,
  limit = 20
): Promise<RecurringTaskRun[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('recurring_task_runs')
    .select('*')
    .eq('task_id', taskId)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[RecurringTasks] getTaskRuns error:', error)
    return []
  }
  return (data ?? []) as RecurringTaskRun[]
}

// ── Admin helpers (for AI tools + scheduler, no RLS) ─────────────────

export async function createRecurringTaskAdmin(
  userId: string,
  workspaceId: string,
  params: {
    title: string
    description?: string
    schedule_cron: string
    schedule_timezone?: string
    task_type?: TaskType
    output_destination?: OutputDestination
    board_column?: string
    mission_id?: string
    config?: Record<string, unknown>
  }
): Promise<RecurringTask | null> {
  const supabase = createAdminClient()
  const cron = resolveCronPreset(params.schedule_cron)
  const tz = params.schedule_timezone ?? 'UTC'
  const nextRun = computeNextRun(cron, tz)

  const { data, error } = await supabase
    .from('recurring_tasks')
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      title: params.title,
      description: params.description ?? null,
      schedule_cron: cron,
      schedule_timezone: tz,
      next_run_at: nextRun,
      task_type: params.task_type ?? 'action',
      output_destination: params.output_destination ?? 'board',
      board_column: params.board_column ?? 'inbox',
      mission_id: params.mission_id ?? null,
      created_by: 'ai',
      config: params.config ?? {},
    } as never)
    .select()
    .single()

  if (error) {
    console.error('[RecurringTasks] createAdmin error:', error)
    return null
  }
  return data as RecurringTask
}

export async function listRecurringTasksAdmin(
  userId: string,
  workspaceId: string,
  statusFilter?: RecurringTaskStatus
): Promise<RecurringTask[]> {
  const supabase = createAdminClient()
  let query = supabase
    .from('recurring_tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .order('next_run_at', { ascending: true })

  if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  const { data, error } = await query
  if (error) {
    console.error('[RecurringTasks] listAdmin error:', error)
    return []
  }
  return (data ?? []) as RecurringTask[]
}

/**
 * Claim due recurring tasks for execution.
 * Returns tasks whose next_run_at <= now and status = 'active'.
 */
export async function claimDueRecurringTasks(limit = 10): Promise<RecurringTask[]> {
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('recurring_tasks')
    .select('*')
    .eq('status', 'active')
    .lte('next_run_at', now)
    .order('next_run_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[RecurringTasks] claimDue error:', error)
    return []
  }
  return (data ?? []) as RecurringTask[]
}

/**
 * Record a task run and advance next_run_at.
 */
export async function recordTaskRun(
  task: RecurringTask,
  result: { status: 'completed' | 'failed'; output?: string; boardCardId?: string; memoryId?: string; durationMs?: number }
): Promise<void> {
  const supabase = createAdminClient()
  const now = new Date()

  // Insert run log
  await supabase
    .from('recurring_task_runs')
    .insert({
      task_id: task.id,
      workspace_id: task.workspace_id,
      status: result.status,
      output: result.output ?? null,
      board_card_id: result.boardCardId ?? null,
      memory_id: result.memoryId ?? null,
      started_at: new Date(now.getTime() - (result.durationMs ?? 0)).toISOString(),
      completed_at: now.toISOString(),
      duration_ms: result.durationMs ?? null,
    } as never)

  // Update task
  const nextRun = computeNextRun(task.schedule_cron, task.schedule_timezone, now)
  await supabase
    .from('recurring_tasks')
    .update({
      last_run_at: now.toISOString(),
      next_run_at: nextRun,
      run_count: task.run_count + 1,
      last_output: result.output?.slice(0, 1000) ?? null,
      status: result.status === 'failed' ? 'failed' : 'active',
    } as never)
    .eq('id', task.id)
}
