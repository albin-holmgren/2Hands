/**
 * v3 task service — durable tasks, server-validated transitions, append-only
 * safe events with cursor replay. All writes go through the privileged RPCs
 * (`v3_*`); ordinary clients can only read via RLS.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import {
  assertSafeEventPayload,
  envelopeFromRow,
  type TaskEventRow,
} from '@2hands/core'
import type { EventEnvelope, TaskStatus } from '@2hands/types/v3'

// New v3 tables are not yet in the generated database types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (sb: ReturnType<typeof createAdminClient>, name: string) => (sb as any).from(name)
const rpc = (sb: ReturnType<typeof createAdminClient>, name: string, args: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb as any).rpc(name, args)

export interface V3TaskRow {
  id: string
  workspace_id: string
  user_id: string
  conversation_id: string | null
  parent_task_id: string | null
  goal: string
  status: TaskStatus
  plan: Record<string, unknown> | null
  waiting_reason: string | null
  waiting_resource_id: string | null
  receipt_id: string | null
  safe_error: { code: string; message: string; retryable: boolean } | null
  origin: string
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface CreateTaskInput {
  workspaceId: string
  userId: string
  goal: string
  conversationId?: string
  parentTaskId?: string
  origin?: string
}

export async function createTask(input: CreateTaskInput): Promise<V3TaskRow> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'tasks')
    .insert({
      workspace_id: input.workspaceId,
      user_id: input.userId,
      agent_id: null,
      type: 'v3',
      description: input.goal,
      goal: input.goal,
      conversation_id: input.conversationId ?? null,
      parent_task_id: input.parentTaskId ?? null,
      status: 'draft',
      origin: input.origin ?? 'conversation',
    })
    .select('*')
    .single()
  if (error) throw new Error(`createTask failed: ${error.message}`)

  await appendTaskEvent({
    taskId: data.id,
    type: 'task.created',
    actorKind: 'user',
    actorId: input.userId,
    payload: { goal: input.goal },
    conversationId: input.conversationId,
  })

  return data as V3TaskRow
}

export async function getTask(taskId: string, workspaceId: string): Promise<V3TaskRow | null> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'tasks')
    .select('*')
    .eq('id', taskId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (error) throw new Error(`getTask failed: ${error.message}`)
  return (data as V3TaskRow) ?? null
}

export async function listTasks(workspaceId: string, limit = 50): Promise<V3TaskRow[]> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .not('goal', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listTasks failed: ${error.message}`)
  return (data ?? []) as V3TaskRow[]
}

export interface TransitionInput {
  taskId: string
  expectedStatus: TaskStatus
  newStatus: TaskStatus
  actorKind?: 'user' | '2hands' | 'agent' | 'connector' | 'system'
  actorId?: string
  eventType?: string
  payload?: Record<string, unknown>
}

export interface TransitionResult {
  taskId: string
  oldStatus: TaskStatus
  newStatus: TaskStatus
  eventSequence: number
}

/** Server-validated transition; throws on illegal or stale moves. */
export async function transitionTask(input: TransitionInput): Promise<TransitionResult> {
  if (input.payload) assertSafeEventPayload(input.payload)
  const admin = createAdminClient()
  const { data, error } = await rpc(admin, 'v3_transition_task', {
    p_task_id: input.taskId,
    p_expected_status: input.expectedStatus,
    p_new_status: input.newStatus,
    p_actor_kind: input.actorKind ?? 'system',
    p_actor_id: input.actorId ?? null,
    p_event_type: input.eventType ?? null,
    p_payload: input.payload ?? {},
  })
  if (error) throw new Error(`transitionTask failed: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  return {
    taskId: row.task_id,
    oldStatus: row.old_status,
    newStatus: row.new_status,
    eventSequence: Number(row.event_sequence),
  }
}

export interface AppendEventInput {
  taskId: string
  type: string
  actorKind?: 'user' | '2hands' | 'agent' | 'connector' | 'system'
  actorId?: string
  payload?: Record<string, unknown>
  conversationId?: string
  runId?: string
}

export async function appendTaskEvent(input: AppendEventInput): Promise<number> {
  assertSafeEventPayload(input.payload ?? {})
  const admin = createAdminClient()
  const { data, error } = await rpc(admin, 'v3_append_task_event', {
    p_task_id: input.taskId,
    p_type: input.type,
    p_actor_kind: input.actorKind ?? 'system',
    p_actor_id: input.actorId ?? null,
    p_payload: input.payload ?? {},
    p_conversation_id: input.conversationId ?? null,
    p_run_id: input.runId ?? null,
  })
  if (error) throw new Error(`appendTaskEvent failed: ${error.message}`)
  return Number(data)
}

/**
 * Cursor replay: return events with sequence > cursor, oldest first.
 * The cursor is the envelope `sequence`; clients resume after reconnect or
 * app restart by passing the last sequence they rendered.
 */
export async function listTaskEvents(input: {
  taskId: string
  workspaceId: string
  cursor?: number
  limit?: number
}): Promise<{ events: EventEnvelope[]; nextCursor: number | null }> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'task_events')
    .select('*')
    .eq('task_id', input.taskId)
    .eq('workspace_id', input.workspaceId)
    .gt('sequence', input.cursor ?? 0)
    .order('sequence', { ascending: true })
    .limit(input.limit ?? 200)
  if (error) throw new Error(`listTaskEvents failed: ${error.message}`)
  const rows = (data ?? []) as TaskEventRow[]
  const events = rows.map(envelopeFromRow)
  const nextCursor = events.length > 0 ? events[events.length - 1].sequence : null
  return { events, nextCursor }
}

/** Cancel from any non-terminal state. */
export async function cancelTask(input: {
  taskId: string
  workspaceId: string
  userId: string
}): Promise<TransitionResult> {
  const task = await getTask(input.taskId, input.workspaceId)
  if (!task) throw new Error('Task not found')
  if (['completed', 'failed', 'cancelled'].includes(task.status)) {
    throw new Error(`Task is already ${task.status}`)
  }
  return transitionTask({
    taskId: input.taskId,
    expectedStatus: task.status,
    newStatus: 'cancelled',
    actorKind: 'user',
    actorId: input.userId,
    eventType: 'task.cancelled',
    payload: { reason: 'user_cancelled' },
  })
}
