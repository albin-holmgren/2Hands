/**
 * Remote executor: expects an OpenShell / NemoClaw HTTP API on the agent VM (port 8000).
 * Off by default — the agent worker uses the in-process computer-use executor unless
 * `NEMOCLAW_EXECUTOR=true` is set and the run has a real VM IP (not `api-only`).
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { NemoClawClient } from './client'
import { generateBlueprintForTask } from './blueprints'
import { loadAgentIntegrationTools } from '@/lib/integrations/agent-tools-bridge'
import { AgentExecutionContext } from '@/lib/agents/execution-lock'
import { completeRunMetrics } from '@/lib/proactive/observability'
import { terminateAgentVM } from '@/lib/paperspace/agent-vm'
import { createSignedHeaders } from '@/lib/security/hmac'

export interface AgentExecutorConfig {
  agentId: string
  runId: string
  vmIp: string
  taskDescription: string
  userId: string
}

async function sendProgressUpdate(
  agentId: string,
  runId: string,
  type: string,
  message: string,
  data?: any
): Promise<void> {
  const configuredBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim()
  const baseUrl = process.env.NODE_ENV === 'production'
    ? (configuredBaseUrl || 'http://localhost:3000')
    : 'http://localhost:3000'

  const url = `${baseUrl}/api/agents/progress`
  
  try {
    const payload = JSON.stringify({ agentId, runId, type, message, data })
    const signedHeaders = createSignedHeaders(payload)
    
    await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...signedHeaders,
      },
      body: payload,
    })
  } catch (error) {
    console.error('[NemoClaw Executor] Failed to send progress update:', error)
  }
}

export async function executeAgentTask(config: AgentExecutorConfig): Promise<void> {
  console.log('\n========================================')
  console.log('[NemoClaw Executor] STARTING AGENT EXECUTION')
  console.log('========================================')
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  
  if (!config.vmIp || config.vmIp === 'api-only') {
    console.warn('[NemoClaw Executor] API-only mode not fully supported in NemoClaw yet or missing VM IP')
    // We can still try to connect if a default local is available, but returning for safety
    if (!config.vmIp) return
  }

  const executionContext = new AgentExecutionContext(config.agentId)
  const lockAcquired = await executionContext.acquire()
  
  if (!lockAcquired) {
    console.log('[NemoClaw Executor] Could not acquire execution lock')
    await supabase.from('agents').update({ status: 'idle' } as any).eq('id', config.agentId)
    return
  }

  try {
    await sendProgressUpdate(config.agentId, config.runId, 'started', `Started NemoClaw execution for task: ${config.taskDescription.slice(0, 100)}...`)
    
    const { data: agentConfigRow } = await supabase.from('agents').select('workspace_id').eq('id', config.agentId).single()
    const workspaceId = agentConfigRow?.workspace_id || undefined
    
    // 1. Load available integrations
    const integrationToolset = await loadAgentIntegrationTools(config.userId, workspaceId)
    
    // 2. Generate OpenClaw Blueprint
    const blueprint = generateBlueprintForTask(config.runId, config.taskDescription, integrationToolset)
    
    // 3. Connect to VM via NemoClaw Client
    const client = new NemoClawClient(config.vmIp)
    
    // 4. Start Run
    const run = await client.startRun({
      task: config.taskDescription,
      tools: blueprint.tools,
      env: {
        NVIDIA_API_KEY: process.env.NVIDIA_API_KEY || ''
      }
    })

    await sendProgressUpdate(config.agentId, config.runId, 'progress', `Blueprint deployed to OpenShell. Run ID: ${run.runId}`)

    // 5. Poll for completion
    let isDone = false
    let finalStatus = 'failed'
    let errorMessage = ''

    while (!isDone) {
      await new Promise(resolve => setTimeout(resolve, 5000))
      try {
        const statusRes = await client.getRunStatus(run.runId)
        
        if (statusRes.status === 'completed') {
          isDone = true
          finalStatus = 'completed'
          await sendProgressUpdate(config.agentId, config.runId, 'completed', 'NemoClaw execution completed successfully!')
        } else if (statusRes.status === 'failed') {
          isDone = true
          errorMessage = statusRes.error || 'Unknown NemoClaw error'
          await sendProgressUpdate(config.agentId, config.runId, 'failed', `Execution failed: ${errorMessage}`)
        } else {
          await sendProgressUpdate(config.agentId, config.runId, 'progress', `Agent is working... (Step: ${statusRes.current_step || 'thinking'})`)
        }
      } catch (pollErr) {
        console.warn('[NemoClaw Executor] Polling warning:', pollErr)
      }
    }

    // Record metrics
    await completeRunMetrics(config.runId, finalStatus as 'completed' | 'failed', finalStatus === 'completed' ? 5 : undefined, errorMessage)

    // Mark agent status based on run
    await supabase.from('agents').update({ 
      status: finalStatus === 'completed' ? 'idle' : 'failed',
      config: { active_run_id: null, last_error: errorMessage }
    } as never).eq('id', config.agentId)

  } catch (err) {
    console.error('[NemoClaw Executor] Fatal error:', err)
    await completeRunMetrics(config.runId, 'failed', undefined, err instanceof Error ? err.message : String(err))
    await supabase.from('agents').update({ status: 'failed', config: { active_run_id: null, last_error: err instanceof Error ? err.message : String(err) } } as never).eq('id', config.agentId)
  } finally {
    await executionContext.release()
    await terminateAgentVM(config.agentId).catch(() => {})
  }
}
