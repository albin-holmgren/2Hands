import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { claimDueHeartbeats, buildHeartbeatPrompt } from '@/lib/agents/heartbeat-manager'
import { enqueueAgentRun } from '@/lib/agents/run-queue'

/**
 * Heartbeat Scheduler API
 * 
 * Called periodically (via cron) to process due heartbeats.
 * This enables proactive agent behavior - agents check things
 * without being explicitly asked.
 * 
 * Protected by CRON_SECRET to prevent unauthorized access.
 */

export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = (process.env.CRON_SECRET || '').trim()
  
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  console.log('[HeartbeatScheduler] Starting heartbeat processing...')
  
  try {
    // Claim due heartbeats atomically
    const dueHeartbeats = await claimDueHeartbeats(5) // Process up to 5 at a time
    
    if (dueHeartbeats.length === 0) {
      console.log('[HeartbeatScheduler] No heartbeats due')
      return NextResponse.json({ 
        success: true, 
        message: 'No heartbeats due',
        processed: 0 
      })
    }
    
    console.log('[HeartbeatScheduler] Processing', dueHeartbeats.length, 'heartbeats')
    
    const supabase = createAdminClient()
    const results: { heartbeatId: string; agentName: string; status: string }[] = []
    
    for (const heartbeat of dueHeartbeats) {
      try {
        console.log('[HeartbeatScheduler] Processing heartbeat for agent:', heartbeat.agentName)
        
        // Get the agent details
        const { data: agent, error: agentError } = await supabase
          .from('agents')
          .select('*')
          .eq('id', heartbeat.agentId)
          .single()
        
        if (agentError || !agent) {
          console.error('[HeartbeatScheduler] Agent not found:', heartbeat.agentId)
          results.push({ 
            heartbeatId: heartbeat.heartbeatId, 
            agentName: heartbeat.agentName, 
            status: 'agent_not_found' 
          })
          continue
        }
        
        const agentData = agent as { 
          id: string
          user_id: string
          name: string
          status: string
          vm_ip: string | null
          config: Record<string, unknown> | null
        }
        
        // Skip if agent is already running
        if (agentData.status === 'working' || agentData.status === 'initializing') {
          console.log('[HeartbeatScheduler] Agent already running, skipping:', agentData.name)
          results.push({ 
            heartbeatId: heartbeat.heartbeatId, 
            agentName: heartbeat.agentName, 
            status: 'already_running' 
          })
          continue
        }
        
        // Build the heartbeat prompt
        const heartbeatTask = buildHeartbeatPrompt(heartbeat.checklist)
        
        const runId = randomUUID()
        const nowIso = new Date().toISOString()

        const currentConfig = (agentData.config || {}) as Record<string, unknown>

        await supabase
          .from('agents')
          .update({
            status: 'initializing',
            config: {
              ...currentConfig,
              execution_started: true,
              active_run_id: runId,
              active_run_started_at: nowIso,
              active_run_task: heartbeatTask,
              active_run_mode: 'queued',
              last_retry_at: nowIso,
            },
          } as never)
          .eq('id', agentData.id)

        const enqueueResult = await enqueueAgentRun({
          runId,
          agentId: agentData.id,
          userId: heartbeat.userId,
          triggerType: 'heartbeat',
          taskDescription: heartbeatTask,
          metadata: {
            queue_mode: 'collect',
            heartbeat_id: heartbeat.heartbeatId,
          },
        })

        if (!enqueueResult.success) {
          await supabase
            .from('agents')
            .update({
              status: 'failed',
              config: {
                ...currentConfig,
                execution_started: false,
                active_run_id: null,
                active_run_ended_at: nowIso,
                last_error: enqueueResult.error || 'Failed to queue heartbeat run',
                last_error_at: nowIso,
              },
            } as never)
            .eq('id', agentData.id)

          results.push({
            heartbeatId: heartbeat.heartbeatId,
            agentName: heartbeat.agentName,
            status: 'queue_error',
          })
          continue
        }
        
        results.push({ 
          heartbeatId: heartbeat.heartbeatId, 
          agentName: heartbeat.agentName, 
          status: 'started' 
        })
        
      } catch (error) {
        console.error('[HeartbeatScheduler] Error processing heartbeat:', error)
        results.push({ 
          heartbeatId: heartbeat.heartbeatId, 
          agentName: heartbeat.agentName, 
          status: 'error' 
        })
      }
    }
    
    console.log('[HeartbeatScheduler] Completed processing. Results:', results)
    
    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    })
    
  } catch (error) {
    console.error('[HeartbeatScheduler] Fatal error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET endpoint - processes heartbeats when called by Vercel cron, returns stats otherwise
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = (process.env.CRON_SECRET || '').trim()

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Vercel cron jobs send GET with x-vercel-cron: 1 — delegate to full processing logic
  const isCron = request.headers.get('x-vercel-cron') === '1'

  if (isCron) {
    console.log('[HeartbeatScheduler] Starting heartbeat processing (cron GET)...')

    try {
      const dueHeartbeats = await claimDueHeartbeats(5)

      if (dueHeartbeats.length === 0) {
        return NextResponse.json({ success: true, message: 'No heartbeats due', processed: 0 })
      }

      console.log('[HeartbeatScheduler] Processing', dueHeartbeats.length, 'heartbeats')

      const supabase = createAdminClient()
      const results: { heartbeatId: string; agentName: string; status: string }[] = []

      for (const heartbeat of dueHeartbeats) {
        try {
          const { data: agent, error: agentError } = await supabase
            .from('agents')
            .select('*')
            .eq('id', heartbeat.agentId)
            .single()

          if (agentError || !agent) {
            results.push({ heartbeatId: heartbeat.heartbeatId, agentName: heartbeat.agentName, status: 'agent_not_found' })
            continue
          }

          const agentData = agent as {
            id: string; user_id: string; name: string; status: string
            vm_ip: string | null; config: Record<string, unknown> | null
          }

          if (agentData.status === 'working' || agentData.status === 'initializing') {
            results.push({ heartbeatId: heartbeat.heartbeatId, agentName: heartbeat.agentName, status: 'already_running' })
            continue
          }

          const heartbeatTask = buildHeartbeatPrompt(heartbeat.checklist)
          const runId = randomUUID()
          const nowIso = new Date().toISOString()
          const currentConfig = (agentData.config || {}) as Record<string, unknown>

          await supabase
            .from('agents')
            .update({
              status: 'initializing',
              config: {
                ...currentConfig,
                execution_started: true,
                active_run_id: runId,
                active_run_started_at: nowIso,
                active_run_task: heartbeatTask,
                active_run_mode: 'queued',
                last_retry_at: nowIso,
              },
            } as never)
            .eq('id', agentData.id)

          const enqueueResult = await enqueueAgentRun({
            runId,
            agentId: agentData.id,
            userId: heartbeat.userId,
            triggerType: 'heartbeat',
            taskDescription: heartbeatTask,
            metadata: { queue_mode: 'collect', heartbeat_id: heartbeat.heartbeatId },
          })

          if (!enqueueResult.success) {
            await supabase
              .from('agents')
              .update({
                status: 'failed',
                config: {
                  ...currentConfig,
                  execution_started: false,
                  active_run_id: null,
                  active_run_ended_at: nowIso,
                  last_error: enqueueResult.error || 'Failed to queue heartbeat run',
                  last_error_at: nowIso,
                },
              } as never)
              .eq('id', agentData.id)
            results.push({ heartbeatId: heartbeat.heartbeatId, agentName: heartbeat.agentName, status: 'queue_error' })
            continue
          }

          results.push({ heartbeatId: heartbeat.heartbeatId, agentName: heartbeat.agentName, status: 'started' })
        } catch (error) {
          console.error('[HeartbeatScheduler] Error processing heartbeat:', error)
          results.push({ heartbeatId: heartbeat.heartbeatId, agentName: heartbeat.agentName, status: 'error' })
        }
      }

      return NextResponse.json({ success: true, processed: results.length, results })
    } catch (error) {
      console.error('[HeartbeatScheduler] Fatal cron error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }

  // Non-cron GET: return stats only
  const supabase = createAdminClient()

  const { count: dueCount } = await supabase
    .from('agent_heartbeats')
    .select('*', { count: 'exact', head: true })
    .eq('is_enabled', true)
    .lte('next_run_at', new Date().toISOString())

  const { count: totalCount } = await supabase
    .from('agent_heartbeats')
    .select('*', { count: 'exact', head: true })
    .eq('is_enabled', true)

  return NextResponse.json({
    dueHeartbeats: dueCount || 0,
    totalEnabledHeartbeats: totalCount || 0,
    currentTime: new Date().toISOString(),
  })
}
