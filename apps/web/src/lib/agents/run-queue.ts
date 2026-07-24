import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export type AgentRunStatus = 'queued' | 'claimed' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout'
export type AgentRunTriggerType = 'manual' | 'scheduled' | 'heartbeat' | 'system'

export interface EnqueueAgentRunInput {
  runId?: string
  agentId: string
  userId: string
  triggerType: AgentRunTriggerType
  taskDescription: string
  availableAt?: string
  metadata?: Record<string, unknown>
}

export interface QueuedAgentRun {
  run_id: string
  agent_id: string
  user_id: string
  trigger_type: string
  task_description: string
  attempt: number
  metadata: Record<string, unknown> | null
}

type RpcFn = <T = unknown>(
  fn: string,
  params?: Record<string, unknown>
) => Promise<{ data: T | null; error: { message?: string } | null }>

export function createRunId(): string {
  return randomUUID()
}

export function resolveAvailableAtIso(availableAt?: string): { iso: string; error?: string } {
  if (!availableAt || !availableAt.trim()) {
    return { iso: new Date().toISOString() }
  }

  const parsed = new Date(availableAt)
  if (Number.isNaN(parsed.getTime())) {
    return { iso: '', error: 'availableAt must be a valid ISO datetime' }
  }

  return { iso: parsed.toISOString() }
}

export async function enqueueAgentRun(input: EnqueueAgentRunInput): Promise<{ success: boolean; runId: string; error?: string }> {
  const supabase = createAdminClient() as unknown as {
    from: (table: string) => {
      insert: (value: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then?: any
      }
    }
  }
  const runId = (input.runId || createRunId()).trim()

  if (!runId) {
    return { success: false, runId: '', error: 'runId is required' }
  }

  const taskDescription = input.taskDescription.trim()
  if (!taskDescription) {
    return { success: false, runId, error: 'taskDescription is required' }
  }

  const availableAt = resolveAvailableAtIso(input.availableAt)
  if (availableAt.error) {
    return { success: false, runId, error: availableAt.error }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('agent_runs')
    .insert({
      run_id: runId,
      agent_id: input.agentId,
      user_id: input.userId,
      trigger_type: input.triggerType,
      task_description: taskDescription,
      status: 'queued',
      available_at: availableAt.iso,
      metadata: input.metadata || {},
      queued_at: new Date().toISOString(),
    })

  if (error) {
    const code = (error as { code?: string }).code
    if (code === '23505') {
      return { success: true, runId }
    }
    return { success: false, runId, error: error.message }
  }

  await appendAgentRunEvent({
    runId,
    agentId: input.agentId,
    userId: input.userId,
    kind: 'lifecycle',
    name: 'run_queued',
    event: 'run_queued',
    message: 'Run queued for execution',
    payload: {
      trigger_type: input.triggerType,
      task_description: taskDescription,
      available_at: availableAt.iso,
    },
  })

  return { success: true, runId }
}

export async function claimQueuedAgentRuns(workerId: string, limit: number = 5): Promise<QueuedAgentRun[]> {
  const supabase = createAdminClient()
  const rpc = supabase.rpc.bind(supabase) as unknown as RpcFn

  const { data, error } = await rpc<QueuedAgentRun[]>('claim_queued_agent_runs', {
    p_worker_id: workerId,
    p_limit: Math.max(1, Math.min(50, limit)),
  })

  if (error) {
    console.error('[RunQueue] claim_queued_agent_runs error:', error)
    return []
  }

  return (data || []) as QueuedAgentRun[]
}

export async function updateAgentRunStatus(
  runId: string,
  status: AgentRunStatus,
  details?: {
    errorMessage?: string | null
    workerId?: string | null
    startedAt?: string | null
    completedAt?: string | null
  }
): Promise<void> {
  const supabase = createAdminClient()

  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  }

  if (details?.workerId !== undefined) updates.worker_id = details.workerId
  if (details?.errorMessage !== undefined) updates.error_message = details.errorMessage
  if (details?.startedAt !== undefined) updates.started_at = details.startedAt
  if (details?.completedAt !== undefined) updates.completed_at = details.completedAt

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('agent_runs')
    .update(updates)
    .eq('run_id', runId)
}

export async function appendAgentRunEvent(input: {
  runId: string
  agentId: string
  userId: string
  kind: string
  name: string
  event?: string
  message?: string
  payload?: Record<string, unknown>
}): Promise<void> {
  const supabase = createAdminClient()
  const rpc = supabase.rpc.bind(supabase) as unknown as RpcFn

  const { error } = await rpc<number>('append_agent_run_event', {
    p_run_id: input.runId,
    p_agent_id: input.agentId,
    p_user_id: input.userId,
    p_kind: input.kind,
    p_name: input.name,
    p_event: input.event || null,
    p_message: input.message || null,
    p_payload: input.payload || {},
  })

  if (error) {
    console.error('[RunQueue] append_agent_run_event error:', error)
  }
}
