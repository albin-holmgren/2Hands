import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Agent execution lock utilities
 * Prevents concurrent execution of the same agent using atomic database locks
 */

// Lazy initialization to avoid build-time errors
function getSupabase() {
  return createAdminClient()
}

/**
 * Attempt to acquire an exclusive lock on an agent for execution
 * Returns true only if this instance successfully acquired the lock
 */
export async function acquireAgentLock(
  agentId: string,
  executorId: string,
  ttlMinutes: number = 10
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (getSupabase().rpc as any)('acquire_agent_lock', {
    p_agent_id: agentId,
    p_executor_id: executorId,
    p_ttl_minutes: ttlMinutes,
  })

  if (error) {
    console.error('acquireAgentLock RPC error:', error)
    return false
  }

  return data === true
}

/**
 * Extend the lock TTL (heartbeat)
 * Call periodically during long-running operations
 */
export async function extendAgentLock(
  agentId: string,
  executorId: string,
  ttlMinutes: number = 10
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (getSupabase().rpc as any)('extend_agent_lock', {
    p_agent_id: agentId,
    p_executor_id: executorId,
    p_ttl_minutes: ttlMinutes,
  })

  if (error) {
    console.error('extendAgentLock RPC error:', error)
    return false
  }

  return data === true
}

/**
 * Release the lock when execution completes
 */
export async function releaseAgentLock(
  agentId: string,
  executorId: string
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (getSupabase().rpc as any)('release_agent_lock', {
    p_agent_id: agentId,
    p_executor_id: executorId,
  })

  if (error) {
    console.error('releaseAgentLock RPC error:', error)
    return false
  }

  return data === true
}

/**
 * Generate a unique executor ID for this execution instance
 */
export function generateExecutorId(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Wrapper class for managing agent execution with proper locking and cleanup
 */
export class AgentExecutionContext {
  private agentId: string
  private executorId: string
  private lockAcquired: boolean = false
  private heartbeatInterval: NodeJS.Timeout | null = null

  constructor(agentId: string) {
    this.agentId = agentId
    this.executorId = generateExecutorId()
  }

  /**
   * Acquire lock and start heartbeat
   */
  async acquire(): Promise<boolean> {
    this.lockAcquired = await acquireAgentLock(this.agentId, this.executorId)
    
    if (this.lockAcquired) {
      // Start heartbeat to extend lock every 5 minutes
      this.heartbeatInterval = setInterval(async () => {
        const extended = await extendAgentLock(this.agentId, this.executorId)
        if (!extended) {
          console.error(`Failed to extend lock for agent ${this.agentId}`)
        }
      }, 5 * 60 * 1000)
    }

    return this.lockAcquired
  }

  /**
   * Release lock and stop heartbeat
   */
  async release(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }

    if (this.lockAcquired) {
      await releaseAgentLock(this.agentId, this.executorId)
      this.lockAcquired = false
    }
  }

  get isLocked(): boolean {
    return this.lockAcquired
  }

  get id(): string {
    return this.executorId
  }
}
