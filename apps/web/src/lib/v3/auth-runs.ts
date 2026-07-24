/**
 * v3 auth-run service — durable Account Broker authentication workflows with
 * a server-validated 14-state machine and append-only safe auth events.
 * All writes go through the service role; ordinary clients can only read via
 * RLS. Event payloads carry field IDs and state only — never secret values.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { assertSafeEventPayload } from '@2hands/core'
import type { AuthRunStatus, ProviderAuthMode } from '@2hands/types/v3'

// New v3 tables are not yet in the generated database types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (sb: ReturnType<typeof createAdminClient>, name: string) => (sb as any).from(name)
const rpc = (sb: ReturnType<typeof createAdminClient>, name: string, args: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb as any).rpc(name, args)

const DEFAULT_AUTH_RUN_TTL_MS = 30 * 60 * 1000

export interface V3AuthRunRow {
  id: string
  workspace_id: string
  user_id: string
  task_id: string | null
  provider_id: string
  capability: string
  selected_mode: ProviderAuthMode | null
  status: AuthRunStatus
  browser_session_id: string | null
  verification_expectation_id: string | null
  provider_account_id: string | null
  safe_error: { code: string; message: string; retryable: boolean } | null
  expires_at: string
  created_at: string
  updated_at: string
}

export interface ProviderManifestRow {
  id: string
  provider_id: string
  version: number
  display_name: string
  status: 'enabled' | 'beta' | 'allowlisted' | 'disabled' | 'coming_soon'
  manifest: Record<string, unknown>
  is_demo: boolean
  created_at: string
  updated_at: string
}

export interface CreateAuthRunInput {
  workspaceId: string
  userId: string
  taskId?: string
  providerId: string
  capability: string
  expiresInMs?: number
}

export async function createAuthRun(input: CreateAuthRunInput): Promise<V3AuthRunRow> {
  const admin = createAdminClient()
  const expiresAt = new Date(Date.now() + (input.expiresInMs ?? DEFAULT_AUTH_RUN_TTL_MS)).toISOString()
  const { data, error } = await table(admin, 'auth_runs')
    .insert({
      workspace_id: input.workspaceId,
      user_id: input.userId,
      task_id: input.taskId ?? null,
      provider_id: input.providerId,
      capability: input.capability,
      status: 'created',
      expires_at: expiresAt,
    })
    .select('*')
    .single()
  if (error) throw new Error(`createAuthRun failed: ${error.message}`)
  const row = data as V3AuthRunRow

  await appendAuthEvent({
    authRunId: row.id,
    workspaceId: row.workspace_id,
    type: 'auth.run.created',
    actorKind: 'user',
    payload: {
      providerId: input.providerId,
      capability: input.capability,
      ...(input.taskId ? { taskId: input.taskId } : {}),
    },
  })

  return row
}

export async function getAuthRun(authRunId: string, workspaceId: string): Promise<V3AuthRunRow | null> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'auth_runs')
    .select('*')
    .eq('id', authRunId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (error) throw new Error(`getAuthRun failed: ${error.message}`)
  return (data as V3AuthRunRow) ?? null
}

export async function listAuthRuns(workspaceId: string, limit = 50): Promise<V3AuthRunRow[]> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'auth_runs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listAuthRuns failed: ${error.message}`)
  return (data ?? []) as V3AuthRunRow[]
}

export interface AuthTransitionInput {
  authRunId: string
  expectedStatus: AuthRunStatus
  newStatus: AuthRunStatus
  actorKind?: 'user' | '2hands' | 'agent' | 'connector' | 'system'
  eventType?: string
  payload?: Record<string, unknown>
}

export interface AuthTransitionResult {
  authRunId: string
  oldStatus: AuthRunStatus
  newStatus: AuthRunStatus
  eventSequence: number
}

/** Server-validated transition via v3_transition_auth_run; throws on illegal or stale moves. */
export async function transitionAuthRun(input: AuthTransitionInput): Promise<AuthTransitionResult> {
  if (input.payload) assertSafeEventPayload(input.payload)
  const admin = createAdminClient()
  const { data, error } = await rpc(admin, 'v3_transition_auth_run', {
    p_auth_run_id: input.authRunId,
    p_expected_status: input.expectedStatus,
    p_new_status: input.newStatus,
    p_event_type: input.eventType ?? null,
    p_actor_kind: input.actorKind ?? 'system',
    p_payload: input.payload ?? {},
  })
  if (error) throw new Error(`transitionAuthRun failed: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  return {
    authRunId: row.auth_run_id,
    oldStatus: row.old_status,
    newStatus: row.new_status,
    eventSequence: Number(row.event_sequence),
  }
}

/** Cancel from any non-terminal state. */
export async function cancelAuthRun(input: {
  authRunId: string
  workspaceId: string
  userId: string
}): Promise<AuthTransitionResult> {
  const run = await getAuthRun(input.authRunId, input.workspaceId)
  if (!run) throw new Error('Auth run not found')
  if (['completed', 'failed', 'cancelled', 'expired'].includes(run.status)) {
    throw new Error(`Auth run is already ${run.status}`)
  }
  return transitionAuthRun({
    authRunId: input.authRunId,
    expectedStatus: run.status,
    newStatus: 'cancelled',
    actorKind: 'user',
    eventType: 'auth.cancelled',
    payload: { reason: 'user_cancelled' },
  })
}

export interface AppendAuthEventInput {
  authRunId: string
  workspaceId: string
  type: string
  actorKind?: 'user' | '2hands' | 'agent' | 'connector' | 'system'
  /** Safe metadata only: field IDs and state — never values/lengths/hashes. */
  payload?: Record<string, unknown>
}

/**
 * Append an auth event outside a state transition (same next-sequence pattern
 * as the v3_transition_auth_run RPC). Retries once on a sequence race.
 */
export async function appendAuthEvent(input: AppendAuthEventInput): Promise<number> {
  assertSafeEventPayload(input.payload ?? {})
  const admin = createAdminClient()
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: last, error: seqError } = await table(admin, 'auth_events')
      .select('sequence')
      .eq('auth_run_id', input.authRunId)
      .order('sequence', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (seqError) throw new Error(`appendAuthEvent failed: ${seqError.message}`)
    const nextSequence = (last ? Number(last.sequence) : 0) + 1

    const { error } = await table(admin, 'auth_events').insert({
      auth_run_id: input.authRunId,
      workspace_id: input.workspaceId,
      type: input.type,
      sequence: nextSequence,
      actor_kind: input.actorKind ?? 'system',
      payload: input.payload ?? {},
    })
    if (!error) return nextSequence
    // Unique (auth_run_id, sequence) race — re-read and retry.
    if (!/duplicate key/i.test(error.message)) {
      throw new Error(`appendAuthEvent failed: ${error.message}`)
    }
  }
  throw new Error('appendAuthEvent failed: sequence contention')
}

export async function setAuthRunSelectedMode(input: {
  authRunId: string
  workspaceId: string
  mode: ProviderAuthMode
}): Promise<void> {
  const admin = createAdminClient()
  const { error } = await table(admin, 'auth_runs')
    .update({ selected_mode: input.mode })
    .eq('id', input.authRunId)
    .eq('workspace_id', input.workspaceId)
  if (error) throw new Error(`setAuthRunSelectedMode failed: ${error.message}`)
}

// ============================================================================
// Provider manifests (versioned, reviewed; models never mint these)
// ============================================================================

export async function getLatestProviderManifest(providerId: string): Promise<ProviderManifestRow | null> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'provider_manifests')
    .select('*')
    .eq('provider_id', providerId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`getLatestProviderManifest failed: ${error.message}`)
  return (data as ProviderManifestRow) ?? null
}

/** Latest version per provider_id, with status. */
export async function listLatestProviderManifests(): Promise<ProviderManifestRow[]> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'provider_manifests')
    .select('*')
    .order('provider_id', { ascending: true })
    .order('version', { ascending: false })
  if (error) throw new Error(`listLatestProviderManifests failed: ${error.message}`)
  const rows = (data ?? []) as ProviderManifestRow[]
  const latest = new Map<string, ProviderManifestRow>()
  for (const row of rows) {
    if (!latest.has(row.provider_id)) latest.set(row.provider_id, row)
  }
  return Array.from(latest.values())
}

/**
 * Pick the demo secure-input mode from a manifest: the highest-priority
 * enabled auth mode that flows through the protected input path.
 */
export function pickSecureInputMode(manifest: Record<string, unknown>): ProviderAuthMode | null {
  const modes = Array.isArray(manifest.authModes) ? manifest.authModes : []
  const candidates = modes
    .filter(
      (m): m is { mode: ProviderAuthMode; priority: number; enabled: boolean } =>
        typeof m === 'object' &&
        m !== null &&
        typeof (m as { mode?: unknown }).mode === 'string' &&
        (m as { enabled?: unknown }).enabled === true,
    )
    .filter((m) => m.mode === 'user_browser_session' || m.mode === 'assisted_signup')
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
  return candidates[0]?.mode ?? null
}
