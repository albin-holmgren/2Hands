/**
 * v3 computer control-plane service — persists provider state to the v3
 * tables (computers, computer_sessions, computer_runs, computer_events,
 * computer_checkpoints, workspace_write_leases) while delegating the actual
 * compute to a ComputerProvider from @2hands/computer.
 *
 * Provider selection: COMPUTER_PROVIDER=fixture (default; demo-grade,
 * filesystem-backed, rows created with is_demo=true) or local-docker.
 * Providers are cached per process; docker workspaces are rehydrated from DB
 * rows via registerWorkspace, fixture workspaces are reconstructed from rows
 * (its methods derive all paths from baseDir + id).
 */
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  FixtureComputerProvider,
  FlyComputerProvider,
  LocalDockerComputerProvider,
} from '@2hands/computer'
import type { ComputerProvider, ComputerSession, ComputerWorkspace } from '@2hands/types/v3'
import { createAdminClient } from '@/lib/supabase/admin'

// New v3 tables are not yet in the generated database types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (sb: ReturnType<typeof createAdminClient>, name: string) => (sb as any).from(name)
const rpc = (sb: ReturnType<typeof createAdminClient>, name: string, args: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb as any).rpc(name, args)

// ---------------------------------------------------------------------------
// Rows

export interface ComputerRow {
  id: string
  workspace_id: string
  owner_user_id: string
  provider: string
  provider_workspace_ref: string | null
  name: string
  state: string
  image_ref: string
  blueprint_version: number
  repository_ref: string | null
  storage_bytes: number | null
  last_checkpoint_id: string | null
  is_demo: boolean
  created_at: string
  updated_at: string
}

export interface ComputerSessionRow {
  id: string
  computer_id: string
  workspace_id: string
  task_id: string | null
  provider_session_ref: string | null
  state: string
  network_policy_id: string
  started_at: string | null
  stopped_at: string | null
  expires_at: string
  created_at: string
  updated_at: string
}

export interface ComputerCheckpointRow {
  id: string
  computer_id: string
  workspace_id: string
  session_id: string | null
  label: string
  provider_checkpoint_ref: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Configuration + provider cache

export function selectedProviderId(): 'fixture' | 'local-docker' | 'fly' {
  const raw = (process.env.COMPUTER_PROVIDER ?? 'fixture').trim()
  if (raw === 'local-docker') return 'local-docker'
  if (raw === 'fly') return 'fly'
  return 'fixture'
}

/**
 * Fly settings. The token is read per call rather than captured at module load
 * so a rotated secret takes effect on the next request instead of the next
 * deploy.
 */
export function flyOptions() {
  const apiToken = process.env.FLY_API_TOKEN?.trim()
  if (!apiToken) {
    throw new Error('COMPUTER_PROVIDER=fly requires FLY_API_TOKEN')
  }
  return {
    apiToken,
    appName: process.env.FLY_COMPUTERS_APP?.trim() || '2hands-computers',
    region: process.env.FLY_REGION?.trim() || 'arn',
    monthlyBudgetUsd: Number(process.env.FLY_MONTHLY_BUDGET_USD ?? 50),
  }
}

export function fixtureBaseDir(): string {
  return process.env.COMPUTER_FIXTURE_BASE_DIR?.trim() || join(tmpdir(), '2hands-fixture-computers')
}

/** Locate the repo `fixtures/` directory (demo repo + demo patch). */
export function fixturesPath(...segments: string[]): string {
  const explicit = process.env.V3_FIXTURES_DIR?.trim()
  const candidates = explicit
    ? [explicit]
    : [
        join(process.cwd(), 'fixtures'),
        join(process.cwd(), '..', 'fixtures'),
        join(process.cwd(), '..', '..', 'fixtures'),
      ]
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'demo-repo'))) return join(candidate, ...segments)
  }
  throw new Error('fixtures directory not found (set V3_FIXTURES_DIR)')
}

/** Runner lease signing key: required in production, deterministic in dev. */
export function runnerSigningKey(): string {
  const key = process.env.RUNNER_LEASE_SIGNING_KEY?.trim()
  if (key) return key
  if (process.env.NODE_ENV === 'production') {
    throw new Error('RUNNER_LEASE_SIGNING_KEY is required in production')
  }
  // Dev/demo-only fallback; never used in production (throw above).
  return 'a'.repeat(64)
}

const providerCache = new Map<string, ComputerProvider>()

function getProviderInstance(providerId: string): ComputerProvider {
  const key = providerId === 'fixture' ? `fixture:${fixtureBaseDir()}` : providerId
  const cached = providerCache.get(key)
  if (cached) return cached
  let provider: ComputerProvider
  if (providerId === 'fixture') {
    provider = new FixtureComputerProvider({ baseDir: fixtureBaseDir() })
  } else if (providerId === 'local-docker') {
    provider = new LocalDockerComputerProvider()
  } else if (providerId === 'fly') {
    provider = new FlyComputerProvider(flyOptions())
  } else {
    throw new Error(`Unsupported computer provider: ${providerId}`)
  }
  providerCache.set(key, provider)
  return provider
}

function rowToWorkspace(row: ComputerRow): ComputerWorkspace {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ownerUserId: row.owner_user_id,
    provider: row.provider,
    providerWorkspaceRef: row.provider_workspace_ref ?? undefined,
    name: row.name,
    state: row.state as ComputerWorkspace['state'],
    imageRef: row.image_ref,
    blueprintVersion: row.blueprint_version,
    lastCheckpointId: row.last_checkpoint_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Provider instance for a computer row, rehydrated where the provider needs it. */
export function providerFor(row: ComputerRow): ComputerProvider {
  const provider = getProviderInstance(row.provider)
  if (provider instanceof LocalDockerComputerProvider) {
    provider.registerWorkspace(rowToWorkspace(row))
  }
  return provider
}

/** Host filesystem path of a fixture computer's workspace (demo pipeline). */
export function workspacePathFor(row: ComputerRow): string {
  const provider = providerFor(row)
  if (provider instanceof FixtureComputerProvider) {
    return provider.workspacePath(row.id)
  }
  throw new Error(`workspacePathFor: provider ${row.provider} has no host workspace path`)
}

function sessionFromRow(row: ComputerSessionRow): ComputerSession {
  return {
    id: row.id,
    computerId: row.computer_id,
    taskId: row.task_id ?? 'no-task',
    providerSessionRef: row.provider_session_ref ?? undefined,
    state: row.state as ComputerSession['state'],
    startedAt: row.started_at ?? undefined,
    stoppedAt: row.stopped_at ?? undefined,
    expiresAt: row.expires_at,
  }
}

// ---------------------------------------------------------------------------
// Events

export async function appendComputerEvent(input: {
  computerId: string
  type: string
  sessionId?: string | null
  runId?: string | null
  payload?: Record<string, unknown>
}): Promise<number> {
  const admin = createAdminClient()
  const { data, error } = await rpc(admin, 'v3_append_computer_event', {
    p_computer_id: input.computerId,
    p_type: input.type,
    p_session_id: input.sessionId ?? null,
    p_run_id: input.runId ?? null,
    p_payload: input.payload ?? {},
  })
  if (error) throw new Error(`appendComputerEvent failed: ${error.message}`)
  return Number(data)
}

export interface ComputerEventRow {
  id: string
  computer_id: string
  session_id: string | null
  run_id: string | null
  workspace_id: string
  type: string
  sequence: number
  occurred_at: string
  payload: Record<string, unknown>
}

export async function listComputerEvents(input: {
  computerId: string
  workspaceId: string
  cursor?: number
  limit?: number
}): Promise<{ events: ComputerEventRow[]; nextCursor: number | null }> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'computer_events')
    .select('*')
    .eq('computer_id', input.computerId)
    .eq('workspace_id', input.workspaceId)
    .gt('sequence', input.cursor ?? 0)
    .order('sequence', { ascending: true })
    .limit(input.limit ?? 200)
  if (error) throw new Error(`listComputerEvents failed: ${error.message}`)
  const events = (data ?? []).map((row: ComputerEventRow) => ({ ...row, sequence: Number(row.sequence) }))
  const nextCursor = events.length > 0 ? events[events.length - 1].sequence : null
  return { events, nextCursor }
}

// ---------------------------------------------------------------------------
// Computers

export async function createComputer(input: {
  workspaceId: string
  userId: string
  name: string
  imageRef?: string
}): Promise<ComputerRow> {
  const providerId = selectedProviderId()
  const provider = getProviderInstance(providerId)
  const isDemo = providerId === 'fixture'

  const workspace = await provider.createWorkspace({
    workspaceId: input.workspaceId,
    userId: input.userId,
    name: input.name,
    imageRef: input.imageRef ?? (isDemo ? 'fixture' : 'node:20-bookworm-slim'),
  })

  // Demo computers come pre-seeded with the fixture repository so the demo
  // pipeline has something real to fix. Clearly labeled Demo via is_demo.
  if (provider instanceof FixtureComputerProvider) {
    await provider.seedWorkspace(workspace.id, fixturesPath('demo-repo'))
  }

  const admin = createAdminClient()
  const { data, error } = await table(admin, 'computers')
    .insert({
      id: workspace.id,
      workspace_id: input.workspaceId,
      owner_user_id: input.userId,
      provider: providerId,
      provider_workspace_ref: workspace.providerWorkspaceRef ?? null,
      name: input.name,
      state: 'stopped',
      image_ref: workspace.imageRef,
      blueprint_version: workspace.blueprintVersion,
      is_demo: isDemo,
    })
    .select('*')
    .single()
  if (error) {
    // Roll the provider workspace back so we do not leak orphan dirs/volumes.
    await provider.deleteWorkspace(workspace).catch(() => undefined)
    throw new Error(`createComputer failed: ${error.message}`)
  }

  await appendComputerEvent({
    computerId: workspace.id,
    type: 'computer.created',
    payload: { provider: providerId, name: input.name, isDemo },
  })

  return data as ComputerRow
}

export async function getComputer(computerId: string, workspaceId: string): Promise<ComputerRow | null> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'computers')
    .select('*')
    .eq('id', computerId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (error) throw new Error(`getComputer failed: ${error.message}`)
  return (data as ComputerRow) ?? null
}

export async function listComputers(workspaceId: string, limit = 50): Promise<ComputerRow[]> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'computers')
    .select('*')
    .eq('workspace_id', workspaceId)
    .neq('state', 'deleted')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listComputers failed: ${error.message}`)
  return (data ?? []) as ComputerRow[]
}

export async function getComputerDetail(computerId: string, workspaceId: string): Promise<{
  computer: ComputerRow
  latestSession: ComputerSessionRow | null
  checkpoints: ComputerCheckpointRow[]
} | null> {
  const computer = await getComputer(computerId, workspaceId)
  if (!computer) return null
  const admin = createAdminClient()
  const [{ data: sessions }, { data: checkpoints }] = await Promise.all([
    table(admin, 'computer_sessions')
      .select('*')
      .eq('computer_id', computerId)
      .order('created_at', { ascending: false })
      .limit(1),
    table(admin, 'computer_checkpoints')
      .select('*')
      .eq('computer_id', computerId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])
  return {
    computer,
    latestSession: ((sessions ?? [])[0] as ComputerSessionRow) ?? null,
    checkpoints: (checkpoints ?? []) as ComputerCheckpointRow[],
  }
}

async function setComputerState(computerId: string, state: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await table(admin, 'computers').update({ state }).eq('id', computerId)
  if (error) throw new Error(`setComputerState failed: ${error.message}`)
}

// ---------------------------------------------------------------------------
// Sessions

export async function getActiveSession(
  computerId: string,
  workspaceId: string,
): Promise<ComputerSessionRow | null> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'computer_sessions')
    .select('*')
    .eq('computer_id', computerId)
    .eq('workspace_id', workspaceId)
    .in('state', ['starting', 'ready'])
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(`getActiveSession failed: ${error.message}`)
  return ((data ?? [])[0] as ComputerSessionRow) ?? null
}

export async function startComputerSession(input: {
  computerId: string
  workspaceId: string
  taskId?: string
  timeoutMs?: number
  networkPolicyId?: string
}): Promise<ComputerSessionRow> {
  const row = await getComputer(input.computerId, input.workspaceId)
  if (!row) throw new Error('Computer not found')
  if (!['stopped', 'ready', 'starting'].includes(row.state)) {
    throw new Error(`Computer is ${row.state}; cannot start a session`)
  }

  const provider = providerFor(row)
  const networkPolicyId = input.networkPolicyId ?? 'deny_default'

  await appendComputerEvent({
    computerId: row.id,
    type: 'computer.session.starting',
    payload: { networkPolicyId },
  })

  const session = await provider.startSession({
    computer: rowToWorkspace(row),
    taskId: input.taskId ?? 'no-task',
    timeoutMs: input.timeoutMs ?? 30 * 60_000,
    networkPolicyId,
  })

  const admin = createAdminClient()
  const { data, error } = await table(admin, 'computer_sessions')
    .insert({
      id: session.id,
      computer_id: row.id,
      workspace_id: input.workspaceId,
      task_id: input.taskId ?? null,
      provider_session_ref: session.providerSessionRef ?? null,
      state: session.state,
      network_policy_id: networkPolicyId,
      started_at: session.startedAt ?? new Date().toISOString(),
      expires_at: session.expiresAt,
    })
    .select('*')
    .single()
  if (error) {
    await provider.stopSession(session).catch(() => undefined)
    throw new Error(`startComputerSession failed: ${error.message}`)
  }

  await setComputerState(row.id, 'ready')
  await appendComputerEvent({
    computerId: row.id,
    type: 'computer.session.ready',
    sessionId: session.id,
    payload: {},
  })

  return data as ComputerSessionRow
}

export async function stopComputerSession(input: {
  computerId: string
  workspaceId: string
  sessionId?: string
}): Promise<ComputerSessionRow> {
  const row = await getComputer(input.computerId, input.workspaceId)
  if (!row) throw new Error('Computer not found')

  const admin = createAdminClient()
  let sessionRow: ComputerSessionRow | null = null
  if (input.sessionId) {
    const { data, error } = await table(admin, 'computer_sessions')
      .select('*')
      .eq('id', input.sessionId)
      .eq('computer_id', input.computerId)
      .maybeSingle()
    if (error) throw new Error(`stopComputerSession failed: ${error.message}`)
    sessionRow = (data as ComputerSessionRow) ?? null
  } else {
    sessionRow = await getActiveSession(input.computerId, input.workspaceId)
  }
  if (!sessionRow) throw new Error('Session not found')
  if (['stopped', 'expired', 'failed'].includes(sessionRow.state)) return sessionRow

  await appendComputerEvent({
    computerId: row.id,
    type: 'computer.session.stopping',
    sessionId: sessionRow.id,
    payload: {},
  })

  const provider = providerFor(row)
  const stopped = await provider.stopSession(sessionFromRow(sessionRow))

  const { data, error } = await table(admin, 'computer_sessions')
    .update({ state: 'stopped', stopped_at: stopped.stoppedAt ?? new Date().toISOString() })
    .eq('id', sessionRow.id)
    .select('*')
    .single()
  if (error) throw new Error(`stopComputerSession failed: ${error.message}`)

  await setComputerState(row.id, 'stopped')
  await appendComputerEvent({
    computerId: row.id,
    type: 'computer.session.stopped',
    sessionId: sessionRow.id,
    payload: {},
  })

  return data as ComputerSessionRow
}

// ---------------------------------------------------------------------------
// Checkpoints

export async function createComputerCheckpoint(input: {
  computerId: string
  workspaceId: string
  label: string
  sessionId?: string
}): Promise<ComputerCheckpointRow> {
  const row = await getComputer(input.computerId, input.workspaceId)
  if (!row) throw new Error('Computer not found')

  const provider = providerFor(row)
  const checkpoint = await provider.createCheckpoint({
    computer: rowToWorkspace(row),
    label: input.label,
  })

  const admin = createAdminClient()
  const { data, error } = await table(admin, 'computer_checkpoints')
    .insert({
      id: checkpoint.id,
      computer_id: row.id,
      workspace_id: input.workspaceId,
      session_id: input.sessionId ?? null,
      label: input.label,
      provider_checkpoint_ref: checkpoint.id,
    })
    .select('*')
    .single()
  if (error) throw new Error(`createComputerCheckpoint failed: ${error.message}`)

  await table(admin, 'computers').update({ last_checkpoint_id: checkpoint.id }).eq('id', row.id)
  await appendComputerEvent({
    computerId: row.id,
    type: 'computer.checkpoint.created',
    sessionId: input.sessionId ?? null,
    payload: { checkpointId: checkpoint.id, label: input.label },
  })

  return data as ComputerCheckpointRow
}

// ---------------------------------------------------------------------------
// Delete

export async function deleteComputer(input: {
  computerId: string
  workspaceId: string
}): Promise<ComputerRow> {
  const row = await getComputer(input.computerId, input.workspaceId)
  if (!row) throw new Error('Computer not found')
  if (['deleting', 'deleted'].includes(row.state)) return row

  const active = await getActiveSession(input.computerId, input.workspaceId)
  if (active) {
    throw new Error('Computer has an active session; stop it before deleting')
  }

  await setComputerState(row.id, 'deleting')
  await appendComputerEvent({ computerId: row.id, type: 'computer.deleting', payload: {} })

  const provider = providerFor(row)
  await provider.deleteWorkspace(rowToWorkspace(row))

  const admin = createAdminClient()
  const { data, error } = await table(admin, 'computers')
    .update({ state: 'deleted' })
    .eq('id', row.id)
    .select('*')
    .single()
  if (error) throw new Error(`deleteComputer failed: ${error.message}`)
  await appendComputerEvent({ computerId: row.id, type: 'computer.deleted', payload: {} })
  return data as ComputerRow
}

// ---------------------------------------------------------------------------
// Write leases (one writer per worktree)

export async function acquireWriteLease(input: {
  computerId: string
  worktreePath: string
  holder: string
  sessionId?: string
  runId?: string
  ttlSeconds?: number
}): Promise<string> {
  const admin = createAdminClient()
  const { data, error } = await rpc(admin, 'v3_acquire_write_lease', {
    p_computer_id: input.computerId,
    p_worktree_path: input.worktreePath,
    p_holder: input.holder,
    p_session_id: input.sessionId ?? null,
    p_run_id: input.runId ?? null,
    p_ttl_seconds: input.ttlSeconds ?? 3600,
  })
  if (error) throw new Error(`acquireWriteLease failed: ${error.message}`)
  return data as string
}

export async function releaseWriteLease(leaseId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data, error } = await rpc(admin, 'v3_release_write_lease', { p_lease_id: leaseId })
  if (error) throw new Error(`releaseWriteLease failed: ${error.message}`)
  return data === true
}
