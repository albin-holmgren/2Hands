import { createAdminClient } from '@/lib/supabase/admin'
import { 
  ensureAgentSession, 
  terminateSession, 
  getAgentSession,
  type AgentSession 
} from '@/lib/compute/session-manager'

/**
 * Agent VM Provisioning - Now uses Session Manager for per-agent isolation
 * 
 * Legacy functions maintained for backward compatibility.
 * New code should use session-manager.ts directly.
 */

interface AgentVMConfig {
  agentId: string
  agentName: string
  userId: string
  taskDescription: string
}

/**
 * Provision a VM/session for an agent
 * Now uses the session manager for per-agent isolation
 */
export async function provisionAgentVM(config: AgentVMConfig): Promise<{
  vmId: string
  vmIp: string | null
  session?: AgentSession
}> {
  console.log('[AgentVM] Provisioning session for agent:', config.agentId)
  
  // Use the new session manager for per-agent isolation
  const session = await ensureAgentSession(config.agentId, config.userId)
  
  if (!session) {
    const supabase = createAdminClient()
    
    // Get current config to preserve it
    const { data: agent } = await supabase
      .from('agents')
      .select('config')
      .eq('id', config.agentId)
      .single()
    
    const agentData = agent as { config: Record<string, unknown> } | null
    const currentConfig = agentData?.config || {}
    
    await supabase
      .from('agents')
      .update({
        status: 'failed',
        config: { ...currentConfig, error: 'Failed to provision session' },
      } as never)
      .eq('id', config.agentId)
    
    throw new Error('Failed to provision agent session')
  }
  
  console.log('[AgentVM] Session ready:', session.id, 'IP:', session.ipAddress)
  
  // Verify the session is accessible
  if (session.baseUrl) {
    try {
      const healthCheck = await fetch(`${session.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })
      
      if (!healthCheck.ok) {
        console.warn('[AgentVM] Session health check returned non-OK, but continuing:', healthCheck.status)
      } else {
        console.log('[AgentVM] Session health check passed')
      }
    } catch (err) {
      // Connection refused / network unreachable = VM is definitively dead.
      // Terminate the stale session and rethrow so the caller can fall back to
      // API-only / queue-without-VM mode rather than sending an agent to a dead IP.
      const msg = err instanceof Error ? err.message : String(err)
      const isConnectionError = msg.includes('ECONNREFUSED') || msg.includes('fetch failed') ||
        msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT')
      if (isConnectionError) {
        console.warn('[AgentVM] Session VM unreachable (ECONNREFUSED), terminating stale session:', session.id)
        try { await terminateSession(session.id) } catch { /* best-effort */ }
        throw new Error(`Agent VM unreachable: ${msg}`)
      }
      console.warn('[AgentVM] Session health check error (non-fatal):', err)
    }
  }
  
  // Update agent status
  const supabase = createAdminClient()
  await supabase
    .from('agents')
    .update({
      vm_id: session.computeId || session.id,
      vm_ip: session.ipAddress,
      status: 'working',
    } as never)
    .eq('id', config.agentId)

  return {
    vmId: session.computeId || session.id,
    vmIp: session.ipAddress,
    session,
  }
}

export async function terminateAgentVM(agentId: string): Promise<void> {
  // Get the agent's current session
  const session = await getAgentSession(agentId)
  
  if (session) {
    // Terminate the session (releases back to pool or destroys)
    await terminateSession(session.id)
  }
  
  // Update agent status
  const adminDb = createAdminClient()
  await adminDb
    .from('agents')
    .update({
      status: 'terminated',
      vm_id: null,
      vm_ip: null,
      current_session_id: null,
    } as never)
    .eq('id', agentId)
    
  console.log('[AgentVM] Agent terminated:', agentId)
}

export async function getAgentVMStatus(agentId?: string): Promise<{
  state: string
  publicIp: string | null
}> {
  // If agentId provided, check that agent's session
  if (agentId) {
    const session = await getAgentSession(agentId)
    if (session?.baseUrl) {
      try {
        const healthCheck = await fetch(`${session.baseUrl}/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        })
        return {
          state: healthCheck.ok ? 'ready' : 'unavailable',
          publicIp: session.ipAddress,
        }
      } catch {
        return { state: 'offline', publicIp: null }
      }
    }
    return { state: 'no_session', publicIp: null }
  }
  
  // Fallback: check if SHARED_VM_IP is configured (for backward compat)
  const sharedIp = process.env.SHARED_VM_IP || process.env.VM_IP
  if (sharedIp) {
    try {
      const healthCheck = await fetch(`http://${sharedIp}:8080/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })
      return {
        state: healthCheck.ok ? 'ready' : 'unavailable',
        publicIp: sharedIp,
      }
    } catch {
      return { state: 'offline', publicIp: null }
    }
  }
  
  return { state: 'not_configured', publicIp: null }
}
