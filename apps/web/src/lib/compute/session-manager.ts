/**
 * Session Manager - Per-Agent VM/Compute Session Management
 * 
 * Each agent gets its own isolated compute session (no shared VM).
 * Sessions can come from:
 * - Direct provisioning (Paperspace, AWS, etc.)
 * - Pre-warmed session pool (for fast startup)
 * 
 * Key principle: Sessions are isolated, but KNOWLEDGE is shared.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import {
  createPaperspaceClient,
  DEFAULT_MACHINE_TYPE,
  DEFAULT_REGION,
  DEFAULT_DISK_SIZE,
  UBUNTU_DESKTOP_TEMPLATE,
} from '@/lib/paperspace/client'

export type SessionState = 'provisioning' | 'ready' | 'busy' | 'idle' | 'terminated' | 'error'
export type SessionProvider = 'paperspace' | 'aws' | 'gcp' | 'pool' | 'local'

export interface AgentSession {
  id: string
  agentId: string
  userId: string
  provider: SessionProvider
  computeId: string | null
  baseUrl: string | null
  ipAddress: string | null
  port: number
  state: SessionState
  createdAt: Date
  readyAt: Date | null
  lastActivityAt: Date
  idleExpiresAt: Date | null
  region: string
  errorMessage: string | null
}

export interface SessionConfig {
  provider?: SessionProvider
  region?: string
  instanceType?: string
  idleTimeoutMinutes?: number
}

interface SessionPoolSlotRow {
  id: string
  state: 'warming' | 'available' | 'leased' | 'draining'
  leased_to_session_id: string | null
  lease_expires_at: string | null
  base_url: string | null
  ip_address: string | null
  port: number | null
  health_status: 'healthy' | 'unhealthy' | 'unknown' | null
  consecutive_failures: number | null
  last_health_check_at: string | null
}

type RpcFn = <T = unknown>(
  fn: string,
  params?: Record<string, unknown>
) => Promise<{ data: T | null; error: { message?: string } | null }>

interface PoolSlotLeaseResult {
  id: string
  compute_id: string
  base_url: string | null
  ip_address: string | null
  port: number | null
  region: string
  instance_type: string
}

type SessionPoolClaimRpcAvailability = 'unknown' | 'available' | 'unavailable'

const SESSION_POOL_HEALTH_TIMEOUT_MS = 4000
const SESSION_POOL_LEASE_EXTENSION_MINUTES = 30
const SESSION_POOL_UNHEALTHY_THRESHOLD = 3
let loggedSessionPoolClaimFallback = false
let sessionPoolClaimRpcAvailability: SessionPoolClaimRpcAvailability = 'unknown'

function sanitizeIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  const trimmed = ip.trim()
  return trimmed ? trimmed : null
}

function getLocalDevVmIp(): string | null {
  return sanitizeIp(process.env.SHARED_VM_IP || process.env.VM_IP)
}

function getPoolSlotHealthUrl(slot: SessionPoolSlotRow): string | null {
  const baseUrl = typeof slot.base_url === 'string' ? slot.base_url.trim() : ''
  if (baseUrl) {
    return `${baseUrl.replace(/\/$/, '')}/health`
  }

  const ipAddress = sanitizeIp(slot.ip_address)
  if (!ipAddress) return null
  const port = slot.port || 8080
  return `http://${ipAddress}:${port}/health`
}

function isActiveSessionState(state: unknown): boolean {
  return state === 'provisioning' || state === 'ready' || state === 'busy' || state === 'idle'
}

function mapRegionToPaperspace(region: string): string {
  const normalized = region.trim().toLowerCase()
  if (normalized === 'us-east' || normalized === 'east' || normalized === 'ny' || normalized === 'ny2') {
    return 'NY2'
  }
  if (normalized === 'us-west' || normalized === 'west' || normalized === 'ca1') {
    return 'CA1'
  }
  if (normalized === 'eu-west' || normalized === 'eu' || normalized === 'am6') {
    return 'AM6'
  }
  return DEFAULT_REGION
}

function mapInstanceTypeToPaperspace(instanceType: string): string {
  const normalized = instanceType.trim().toLowerCase()
  if (!normalized || normalized === 'standard') {
    return DEFAULT_MACHINE_TYPE
  }
  return instanceType
}

const DEFAULT_CONFIG: Required<SessionConfig> = {
  provider: 'paperspace',
  region: 'us-east',
  instanceType: 'standard',
  idleTimeoutMinutes: 10,
}

/**
 * Get or create an isolated session for an agent
 * This is the main entry point - replaces provisionAgentVM
 */
export async function ensureAgentSession(
  agentId: string,
  userId: string,
  config: SessionConfig = {}
): Promise<AgentSession | null> {
  // Fast path: if SHARED_VM_IP / VM_IP is configured, use it directly.
  // This avoids pool lookups, Paperspace provisioning, and DB writes entirely.
  const sharedIpFast = getLocalDevVmIp()
  if (sharedIpFast) {
    console.log('[SessionManager] SHARED_VM_IP fast path for agent:', agentId, '→', sharedIpFast)
    return {
      id: `shared-${agentId.slice(0, 8)}`,
      agentId,
      userId,
      provider: 'local',
      computeId: `shared-${agentId.slice(0, 8)}`,
      ipAddress: sharedIpFast,
      baseUrl: `http://${sharedIpFast}:8000`,
      port: 8000,
      state: 'ready',
      region: 'us-east',
      instanceType: 'standard',
    } as unknown as AgentSession
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }
  
  console.log('[SessionManager] Ensuring session for agent:', agentId)
  
  // Check for existing active session
  const { data: existingSession } = await supabase
    .from('agent_sessions')
    .select('*')
    .eq('agent_id', agentId)
    .in('state', ['provisioning', 'ready', 'busy', 'idle'])
    .single()
  
  if (existingSession) {
    console.log('[SessionManager] Found existing session:', existingSession.id, 'state:', existingSession.state)

    // If a session has been stuck in 'provisioning' for more than 5 minutes, the Vercel
    // function that started it timed out. Mark it as error and provision a fresh one.
    if (existingSession.state === 'provisioning') {
      const createdAt = new Date(existingSession.created_at as string).getTime()
      const staleAfterMs = 5 * 60 * 1000 // 5 minutes
      if (Date.now() - createdAt > staleAfterMs) {
        console.warn('[SessionManager] Session stuck in provisioning >5 min, marking as error:', existingSession.id)
        await supabase
          .from('agent_sessions')
          .update({ state: 'error', error_message: 'Provisioning timed out (stale)' })
          .eq('id', existingSession.id)
        // Fall through to provision a new session
      } else {
        // Recently started — wait for it
        await supabase
          .from('agent_sessions')
          .update({ last_activity_at: new Date().toISOString() })
          .eq('id', existingSession.id)
        return await waitForSessionReady(existingSession.id)
      }
    } else {
      // Update last activity
      await supabase
        .from('agent_sessions')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('id', existingSession.id)
      return mapSessionRow(existingSession)
    }
  }
  
  // Try to get a slot from the warm pool first
  const poolSlot = await tryLeasePoolSlot(mergedConfig.region)
  
  if (poolSlot) {
    console.log('[SessionManager] Got pool slot:', poolSlot.id)

    const poolIp = sanitizeIp(poolSlot.ip_address)
    const poolBaseUrl = poolIp ? `http://${poolIp}:${poolSlot.port}` : poolSlot.base_url
    
    // Create session from pool slot
    const { data: newSession, error } = await supabase
      .from('agent_sessions')
      .insert({
        agent_id: agentId,
        user_id: userId,
        provider: 'pool',
        compute_id: poolSlot.compute_id,
        base_url: poolBaseUrl,
        ip_address: poolIp,
        port: poolSlot.port,
        state: 'ready',
        ready_at: new Date().toISOString(),
        region: poolSlot.region,
        instance_type: poolSlot.instance_type,
        idle_expires_at: new Date(Date.now() + mergedConfig.idleTimeoutMinutes * 60 * 1000).toISOString(),
      })
      .select()
      .single()
    
    if (error || !newSession) {
      console.error('[SessionManager] Failed to create session from pool:', error)
      // Release the pool slot
      await releasePoolSlot(poolSlot.id)
      return null
    }
    
    // Mark pool slot as leased
    await supabase
      .from('session_pool')
      .update({
        state: 'leased',
        leased_to_session_id: newSession.id,
        leased_at: new Date().toISOString(),
        lease_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      .eq('id', poolSlot.id)
    
    // Update agent's current session
    await supabase
      .from('agents')
      .update({ current_session_id: newSession.id, vm_ip: poolIp } as never)
      .eq('id', agentId)
    
    return mapSessionRow(newSession)
  }
  
  // No pool slot available - provision directly
  console.log('[SessionManager] No pool slot, provisioning new session')
  return await provisionNewSession(agentId, userId, mergedConfig)
}

/**
 * Provision a new compute session directly (not from pool)
 */
async function provisionNewSession(
  agentId: string,
  userId: string,
  config: Required<SessionConfig>
): Promise<AgentSession | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  
  // Create session record first (in provisioning state)
  const { data: session, error } = await supabase
    .from('agent_sessions')
    .insert({
      agent_id: agentId,
      user_id: userId,
      provider: config.provider,
      state: 'provisioning',
      region: config.region,
      instance_type: config.instanceType,
    })
    .select()
    .single()
  
  if (error || !session) {
    console.error('[SessionManager] Failed to create session record:', error)
    return null
  }
  
  // Update agent's current session
  await supabase
    .from('agents')
    .update({ current_session_id: session.id } as never)
    .eq('id', agentId)
  
  // Provision based on provider
  try {
    let computeResult: { computeId: string; ipAddress: string; port: number } | null = null
    
    switch (config.provider) {
      case 'paperspace':
        computeResult = await provisionPaperspace(session.id, config)
        break
      case 'local': {
        const localIp = getLocalDevVmIp()
        if (localIp) {
          computeResult = { computeId: `local-${agentId.slice(0, 8)}`, ipAddress: localIp, port: 8000 }
        }
        break
      }
      default:
        console.error('[SessionManager] Unsupported provider for isolated provisioning:', config.provider)
    }

    // Last resort: use SHARED_VM_IP if no VM was provisioned via the normal path
    if (!computeResult) {
      const sharedIp = getLocalDevVmIp()
      if (sharedIp) {
        console.log('[SessionManager] Falling back to SHARED_VM_IP:', sharedIp)
        computeResult = { computeId: `shared-${agentId.slice(0, 8)}`, ipAddress: sharedIp, port: 8000 }
      }
    }

    if (!computeResult) {
      throw new Error('Failed to provision compute resource')
    }
    
    // Update session with compute details
    const sanitizedIp = sanitizeIp(computeResult.ipAddress)

    const { data: updatedSession } = await supabase
      .from('agent_sessions')
      .update({
        compute_id: computeResult.computeId,
        ip_address: sanitizedIp,
        port: computeResult.port,
        base_url: sanitizedIp ? `http://${sanitizedIp}:${computeResult.port}` : null,
        state: 'ready',
        ready_at: new Date().toISOString(),
        idle_expires_at: new Date(Date.now() + config.idleTimeoutMinutes * 60 * 1000).toISOString(),
      })
      .eq('id', session.id)
      .select()
      .single()
    
    // Also update agent's vm_ip for backward compatibility
    await supabase
      .from('agents')
      .update({ vm_ip: sanitizedIp } as never)
      .eq('id', agentId)
    
    return updatedSession ? mapSessionRow(updatedSession) : null
    
  } catch (err) {
    console.error('[SessionManager] Provisioning failed:', err)
    
    // Mark session as error
    await supabase
      .from('agent_sessions')
      .update({
        state: 'error',
        error_message: err instanceof Error ? err.message : 'Unknown error',
      })
      .eq('id', session.id)
    
    return null
  }
}

/**
 * Provision via Paperspace API
 */
async function provisionPaperspace(
  _sessionId: string,
  _config: Required<SessionConfig>
): Promise<{ computeId: string; ipAddress: string; port: number } | null> {
  const apiKey = (process.env.PAPERSPACE_API_KEY || '').trim()
  if (!apiKey) {
    console.error('[SessionManager] No Paperspace API key configured; cannot provision isolated Paperspace session')
    return null
  }

  const client = createPaperspaceClient()
  let machineId: string | null = null

  try {
    const region = mapRegionToPaperspace(_config.region)
    const machineType = mapInstanceTypeToPaperspace(_config.instanceType)
    const machineName = `2hands-agent-${_sessionId.slice(0, 8)}`

    // Note: We'd typically create a startup script in Paperspace first and pass its ID
    // or use a custom template that has NemoClaw pre-installed.
    // For this migration, we ensure the NVIDIA API key is available and the port is 8000 (OpenShell default)
    const nemoClawPort = 8000

    const machine = await client.createMachine({
      region,
      machineType,
      size: DEFAULT_DISK_SIZE,
      billingType: 'hourly',
      machineName,
      templateId: UBUNTU_DESKTOP_TEMPLATE,
      assignPublicIp: true,
      startOnCreate: true,
      // scriptId: process.env.PAPERSPACE_NEMOCLAW_SCRIPT_ID
    })

    machineId = machine.id
    const readyMachine = await client.waitForMachineReady(machine.id, 10 * 60 * 1000)
    const ipAddress = sanitizeIp(readyMachine.publicIpAddress || readyMachine.privateIpAddress)

    if (!ipAddress) {
      throw new Error('Paperspace machine has no reachable IP address')
    }

    return {
      computeId: readyMachine.id,
      ipAddress,
      port: nemoClawPort,
    }
  } catch (error) {
    console.error('[SessionManager] Paperspace provisioning failed:', error)

    if (machineId) {
      try {
        await client.destroyMachine(machineId)
      } catch (cleanupError) {
        console.error('[SessionManager] Failed to cleanup Paperspace machine after provisioning error:', cleanupError)
      }
    }

    return null
  }
}

/**
 * Try to lease a slot from the warm session pool
 */
async function tryLeasePoolSlot(region: string): Promise<{
  id: string
  compute_id: string
  base_url: string
  ip_address: string
  port: number
  region: string
  instance_type: string
} | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const rpc = supabase.rpc.bind(supabase) as unknown as RpcFn

  const claimViaRpc = async (requestedRegion: string | null): Promise<PoolSlotLeaseResult | null> => {
    const { data, error } = await rpc<PoolSlotLeaseResult[]>('claim_session_pool_slot', {
      p_region: requestedRegion,
      p_lease_minutes: SESSION_POOL_LEASE_EXTENSION_MINUTES,
    })

    if (error) {
      sessionPoolClaimRpcAvailability = 'unavailable'
      if (!loggedSessionPoolClaimFallback) {
        loggedSessionPoolClaimFallback = true
        console.warn('[SessionManager] claim_session_pool_slot RPC unavailable, using fallback leasing path:', error)
      }
      return null
    }

    sessionPoolClaimRpcAvailability = 'available'

    const rows = Array.isArray(data) ? data : []
    return rows[0] || null
  }

  const rpcClaimedInRegion = await claimViaRpc(region)
  if (rpcClaimedInRegion) {
    return {
      id: rpcClaimedInRegion.id,
      compute_id: rpcClaimedInRegion.compute_id,
      base_url: rpcClaimedInRegion.base_url || '',
      ip_address: rpcClaimedInRegion.ip_address || '',
      port: rpcClaimedInRegion.port || 8080,
      region: rpcClaimedInRegion.region,
      instance_type: rpcClaimedInRegion.instance_type,
    }
  }

  const rpcClaimedAny = await claimViaRpc(null)
  if (rpcClaimedAny) {
    return {
      id: rpcClaimedAny.id,
      compute_id: rpcClaimedAny.compute_id,
      base_url: rpcClaimedAny.base_url || '',
      ip_address: rpcClaimedAny.ip_address || '',
      port: rpcClaimedAny.port || 8080,
      region: rpcClaimedAny.region,
      instance_type: rpcClaimedAny.instance_type,
    }
  }

  const claimSlotWithConditionalUpdate = async (
    slot: Record<string, unknown> | null
  ): Promise<PoolSlotLeaseResult | null> => {
    if (!slot || typeof slot.id !== 'string') return null

    const nowIso = new Date().toISOString()
    const leaseExpiresAtIso = new Date(Date.now() + SESSION_POOL_LEASE_EXTENSION_MINUTES * 60 * 1000).toISOString()

    const { data: leasedSlot } = await supabase
      .from('session_pool')
      .update({
        state: 'leased',
        leased_at: nowIso,
        lease_expires_at: leaseExpiresAtIso,
      })
      .eq('id', slot.id)
      .eq('state', 'available')
      .select('id, compute_id, base_url, ip_address, port, region, instance_type')
      .single()

    if (!leasedSlot) return null
    return leasedSlot as PoolSlotLeaseResult
  }
  
  // Get an available slot (with row-level locking)
  const { data: slot } = await supabase
    .from('session_pool')
    .select('*')
    .eq('state', 'available')
    .eq('health_status', 'healthy')
    .eq('region', region)
    .limit(1)
    .single()

  const claimedInRegion = await claimSlotWithConditionalUpdate(slot as Record<string, unknown> | null)
  if (claimedInRegion) {
    return {
      id: claimedInRegion.id,
      compute_id: claimedInRegion.compute_id,
      base_url: claimedInRegion.base_url || '',
      ip_address: claimedInRegion.ip_address || '',
      port: claimedInRegion.port || 8080,
      region: claimedInRegion.region,
      instance_type: claimedInRegion.instance_type,
    }
  }
  
  if (!slot) {
    // Try any region
    const { data: anySlot } = await supabase
      .from('session_pool')
      .select('*')
      .eq('state', 'available')
      .eq('health_status', 'healthy')
      .limit(1)
      .single()

    const claimedAnyRegion = await claimSlotWithConditionalUpdate(anySlot as Record<string, unknown> | null)
    if (!claimedAnyRegion) {
      return null
    }
    
    return {
      id: claimedAnyRegion.id,
      compute_id: claimedAnyRegion.compute_id,
      base_url: claimedAnyRegion.base_url || '',
      ip_address: claimedAnyRegion.ip_address || '',
      port: claimedAnyRegion.port || 8080,
      region: claimedAnyRegion.region,
      instance_type: claimedAnyRegion.instance_type,
    }
  }

  return null
}

/**
 * Release a pool slot back to available state
 */
async function releasePoolSlot(slotId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  
  await supabase
    .from('session_pool')
    .update({
      state: 'available',
      leased_to_session_id: null,
      leased_at: null,
      lease_expires_at: null,
    })
    .eq('id', slotId)
}

/**
 * Wait for a provisioning session to become ready
 */
async function waitForSessionReady(sessionId: string, timeoutMs: number = 60000): Promise<AgentSession | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const startTime = Date.now()
  
  while (Date.now() - startTime < timeoutMs) {
    const { data: session } = await supabase
      .from('agent_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()
    
    if (!session) return null
    
    if (session.state === 'ready' || session.state === 'busy' || session.state === 'idle') {
      return mapSessionRow(session)
    }
    
    if (session.state === 'error' || session.state === 'terminated') {
      return null
    }
    
    // Wait before checking again
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  console.error('[SessionManager] Timeout waiting for session:', sessionId)
  return null
}

/**
 * Mark a session as busy (executing a task)
 */
export async function markSessionBusy(sessionId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  
  await supabase
    .from('agent_sessions')
    .update({
      state: 'busy',
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
}

/**
 * Mark a session as idle (task complete, waiting)
 */
export async function markSessionIdle(sessionId: string, idleTimeoutMinutes: number = 10): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  
  await supabase
    .from('agent_sessions')
    .update({
      state: 'idle',
      last_activity_at: new Date().toISOString(),
      idle_expires_at: new Date(Date.now() + idleTimeoutMinutes * 60 * 1000).toISOString(),
    })
    .eq('id', sessionId)
}

/**
 * Terminate a session and release resources
 */
export async function terminateSession(sessionId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  
  const { data: session } = await supabase
    .from('agent_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()
  
  if (!session) return
  
  console.log('[SessionManager] Terminating session:', sessionId)
  
  // Clear agent's current session
  await supabase
    .from('agents')
    .update({ current_session_id: null } as never)
    .eq('current_session_id', sessionId)
  
  // If from pool, return the slot
  if (session.provider === 'pool') {
    await supabase
      .from('session_pool')
      .update({
        state: 'available',
        leased_to_session_id: null,
        leased_at: null,
        lease_expires_at: null,
      })
      .eq('leased_to_session_id', sessionId)
  } else if (session.provider === 'paperspace' && typeof session.compute_id === 'string' && session.compute_id.trim()) {
    try {
      const client = createPaperspaceClient()
      await client.destroyMachine(session.compute_id)
    } catch (error) {
      console.error('[SessionManager] Failed to destroy Paperspace machine during terminate:', error)
    }
  }
  
  // Mark session as terminated
  await supabase
    .from('agent_sessions')
    .update({
      state: 'terminated',
      terminated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
}

/**
 * Get the current active session for an agent
 */
export async function getAgentSession(agentId: string): Promise<AgentSession | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  
  const { data: session } = await supabase
    .from('agent_sessions')
    .select('*')
    .eq('agent_id', agentId)
    .in('state', ['provisioning', 'ready', 'busy', 'idle'])
    .single()
  
  return session ? mapSessionRow(session) : null
}

/**
 * Get session by ID
 */
export async function getSessionById(sessionId: string): Promise<AgentSession | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  
  const { data: session } = await supabase
    .from('agent_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()
  
  return session ? mapSessionRow(session) : null
}

/**
 * Get the base URL for a session's compute service
 */
export async function getSessionBaseUrl(agentId: string): Promise<string | null> {
  const session = await getAgentSession(agentId)
  return session?.baseUrl || null
}

/**
 * Map database row to AgentSession type
 */
function mapSessionRow(row: Record<string, unknown>): AgentSession {
  return {
    id: row.id as string,
    agentId: row.agent_id as string,
    userId: row.user_id as string,
    provider: row.provider as SessionProvider,
    computeId: row.compute_id as string | null,
    baseUrl: row.base_url as string | null,
    ipAddress: row.ip_address as string | null,
    port: (row.port as number) || 8080,
    state: row.state as SessionState,
    createdAt: new Date(row.created_at as string),
    readyAt: row.ready_at ? new Date(row.ready_at as string) : null,
    lastActivityAt: new Date(row.last_activity_at as string),
    idleExpiresAt: row.idle_expires_at ? new Date(row.idle_expires_at as string) : null,
    region: row.region as string,
    errorMessage: row.error_message as string | null,
  }
}

/**
 * Cleanup expired idle sessions (run periodically)
 */
export async function cleanupExpiredSessions(): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  
  // Find expired idle sessions
  const { data: expiredSessions } = await supabase
    .from('agent_sessions')
    .select('id')
    .eq('state', 'idle')
    .lt('idle_expires_at', new Date().toISOString())
  
  if (!expiredSessions || expiredSessions.length === 0) {
    return 0
  }
  
  // Terminate each expired session
  for (const session of expiredSessions) {
    await terminateSession(session.id)
  }
  
  console.log('[SessionManager] Cleaned up', expiredSessions.length, 'expired sessions')
  return expiredSessions.length
}

/**
 * Reclaim stale pool leases when lease_expiration has passed.
 * - Extends the lease if the linked session is still active.
 * - Releases the slot when the linked session is missing/inactive.
 */
export async function reclaimExpiredPoolLeases(): Promise<{
  scanned: number
  released: number
  extended: number
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const nowIso = new Date().toISOString()

  const { data: expiredLeases } = await supabase
    .from('session_pool')
    .select('id, state, leased_to_session_id, lease_expires_at')
    .eq('state', 'leased')
    .not('lease_expires_at', 'is', null)
    .lt('lease_expires_at', nowIso)

  const slots = (expiredLeases || []) as Array<{
    id: string
    leased_to_session_id: string | null
  }>

  if (slots.length === 0) {
    return { scanned: 0, released: 0, extended: 0 }
  }

  let released = 0
  let extended = 0

  for (const slot of slots) {
    if (!slot.leased_to_session_id) {
      await supabase
        .from('session_pool')
        .update({
          state: 'available',
          leased_to_session_id: null,
          leased_at: null,
          lease_expires_at: null,
        })
        .eq('id', slot.id)
      released++
      continue
    }

    const { data: session } = await supabase
      .from('agent_sessions')
      .select('id, state')
      .eq('id', slot.leased_to_session_id)
      .single()

    const sessionState = (session as { state?: unknown } | null)?.state
    if (isActiveSessionState(sessionState)) {
      await supabase
        .from('session_pool')
        .update({
          leased_at: nowIso,
          lease_expires_at: new Date(Date.now() + SESSION_POOL_LEASE_EXTENSION_MINUTES * 60 * 1000).toISOString(),
        })
        .eq('id', slot.id)
      extended++
      continue
    }

    await supabase
      .from('session_pool')
      .update({
        state: 'available',
        leased_to_session_id: null,
        leased_at: null,
        lease_expires_at: null,
      })
      .eq('id', slot.id)
    released++
  }

  return { scanned: slots.length, released, extended }
}

/**
 * Run health checks for pool slots and update health/availability state.
 */
export async function runSessionPoolHealthChecks(limit: number = 25): Promise<{
  checked: number
  healthy: number
  unhealthy: number
  failedChecks: number
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const boundedLimit = Math.max(1, Math.min(200, limit))

  const { data: slots } = await supabase
    .from('session_pool')
    .select('id, state, base_url, ip_address, port, health_status, consecutive_failures, last_health_check_at')
    .in('state', ['warming', 'available', 'leased'])
    .order('last_health_check_at', { ascending: true })
    .limit(boundedLimit)

  const poolSlots = (slots || []) as SessionPoolSlotRow[]
  if (poolSlots.length === 0) {
    return { checked: 0, healthy: 0, unhealthy: 0, failedChecks: 0 }
  }

  let healthy = 0
  let unhealthy = 0
  let failedChecks = 0
  const nowIso = new Date().toISOString()

  for (const slot of poolSlots) {
    const healthUrl = getPoolSlotHealthUrl(slot)
    let isHealthy = false

    if (healthUrl) {
      try {
        const response = await fetch(healthUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(SESSION_POOL_HEALTH_TIMEOUT_MS),
        })
        isHealthy = response.ok
      } catch {
        isHealthy = false
      }
    }

    const currentFailures = slot.consecutive_failures || 0
    const nextFailures = isHealthy ? 0 : currentFailures + 1
    const nextHealthStatus: 'healthy' | 'unhealthy' = isHealthy ? 'healthy' : 'unhealthy'

    await supabase
      .from('session_pool')
      .update({
        health_status: nextHealthStatus,
        consecutive_failures: nextFailures,
        last_health_check_at: nowIso,
        ...(slot.state === 'available' && !isHealthy && nextFailures >= SESSION_POOL_UNHEALTHY_THRESHOLD
          ? { state: 'draining' }
          : {}),
      })
      .eq('id', slot.id)

    if (isHealthy) {
      healthy++
    } else {
      unhealthy++
      failedChecks++
    }
  }

  return {
    checked: poolSlots.length,
    healthy,
    unhealthy,
    failedChecks,
  }
}

/**
 * Promote warmed healthy slots to available state.
 */
export async function promoteHealthyWarmingSlots(): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: warmingSlots } = await supabase
    .from('session_pool')
    .select('id')
    .eq('state', 'warming')
    .eq('health_status', 'healthy')
    .limit(100)

  const slots = (warmingSlots || []) as Array<{ id: string }>
  if (slots.length === 0) return 0

  const nowIso = new Date().toISOString()
  for (const slot of slots) {
    await supabase
      .from('session_pool')
      .update({
        state: 'available',
        warmed_at: nowIso,
      })
      .eq('id', slot.id)
  }

  return slots.length
}

/**
 * Snapshot pool state for operational dashboards/debug endpoints.
 */
export async function getSessionPoolStats(): Promise<{
  total: number
  availableHealthy: number
  warming: number
  leased: number
  draining: number
  unhealthy: number
  expiredLeases: number
  claimRpcAvailability: SessionPoolClaimRpcAvailability
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const nowIso = new Date().toISOString()

  const [
    total,
    availableHealthy,
    warming,
    leased,
    draining,
    unhealthy,
    expiredLeases,
  ] = await Promise.all([
    supabase.from('session_pool').select('id', { count: 'exact', head: true }),
    supabase
      .from('session_pool')
      .select('id', { count: 'exact', head: true })
      .eq('state', 'available')
      .eq('health_status', 'healthy'),
    supabase.from('session_pool').select('id', { count: 'exact', head: true }).eq('state', 'warming'),
    supabase.from('session_pool').select('id', { count: 'exact', head: true }).eq('state', 'leased'),
    supabase.from('session_pool').select('id', { count: 'exact', head: true }).eq('state', 'draining'),
    supabase
      .from('session_pool')
      .select('id', { count: 'exact', head: true })
      .eq('health_status', 'unhealthy'),
    supabase
      .from('session_pool')
      .select('id', { count: 'exact', head: true })
      .eq('state', 'leased')
      .not('lease_expires_at', 'is', null)
      .lt('lease_expires_at', nowIso),
  ])

  return {
    total: total.count || 0,
    availableHealthy: availableHealthy.count || 0,
    warming: warming.count || 0,
    leased: leased.count || 0,
    draining: draining.count || 0,
    unhealthy: unhealthy.count || 0,
    expiredLeases: expiredLeases.count || 0,
    claimRpcAvailability: sessionPoolClaimRpcAvailability,
  }
}
