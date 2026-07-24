import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Agent Health Monitoring and Reconciliation
 * Handles stuck agents, expired locks, and status inconsistencies
 */

// Lazy initialization to avoid build-time errors
function getSupabase() {
  return createAdminClient()
}

interface StuckAgent {
  agent_id: string
  old_status: string
  new_status: string
  stuck_duration: string
}

/**
 * Find and fix agents that are marked as "working" but have no heartbeat
 * This handles cases where the executor crashed without proper cleanup
 */
export async function reconcileStuckAgents(timeoutMinutes: number = 15): Promise<StuckAgent[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (getSupabase().rpc as any)('reconcile_stuck_agents', {
    p_timeout_minutes: timeoutMinutes,
  })

  if (error) {
    console.error('reconcileStuckAgents RPC error:', error)
    return []
  }

  const results = (data || []) as StuckAgent[]
  
  if (results.length > 0) {
    console.log(`[AgentHealth] Reconciled ${results.length} stuck agents:`, 
      results.map(a => `${a.agent_id} (stuck for ${a.stuck_duration})`)
    )
  }

  return results
}

/**
 * Clean up expired execution locks
 * Should be called periodically to prevent lock table bloat
 */
export async function cleanupExpiredLocks(): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (getSupabase().rpc as any)('cleanup_expired_locks')

  if (error) {
    console.error('cleanupExpiredLocks RPC error:', error)
    return 0
  }

  const count = data as number
  if (count > 0) {
    console.log(`[AgentHealth] Cleaned up ${count} expired locks`)
  }

  return count
}

/**
 * Clean up expired credit reservations
 */
export async function cleanupExpiredReservations(): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (getSupabase().rpc as any)('cleanup_expired_reservations')

  if (error) {
    console.error('cleanupExpiredReservations RPC error:', error)
    return 0
  }

  const count = data as number
  if (count > 0) {
    console.log(`[AgentHealth] Released ${count} expired credit reservations`)
  }

  return count
}

/**
 * Transition agent status atomically with validation
 */
export async function transitionAgentStatus(
  agentId: string,
  fromStatus: string,
  toStatus: string,
  errorMessage?: string
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (getSupabase().rpc as any)('transition_agent_status', {
    p_agent_id: agentId,
    p_from_status: fromStatus,
    p_to_status: toStatus,
    p_error_message: errorMessage || null,
  })

  if (error) {
    console.error('transitionAgentStatus RPC error:', error)
    return false
  }

  return data === true
}

/**
 * Run all health checks and cleanup tasks
 * Call this from a cron job or scheduled task
 */
export async function runHealthChecks(): Promise<{
  stuckAgentsFixed: number
  locksCleanedUp: number
  reservationsCleanedUp: number
}> {
  const [stuckAgents, locksCleanedUp, reservationsCleanedUp] = await Promise.all([
    reconcileStuckAgents(),
    cleanupExpiredLocks(),
    cleanupExpiredReservations(),
  ])

  return {
    stuckAgentsFixed: stuckAgents.length,
    locksCleanedUp,
    reservationsCleanedUp,
  }
}
