/**
 * Heartbeat Manager
 * 
 * Enables proactive agent behavior - agents can monitor conditions
 * and notify users without being explicitly asked.
 * 
 * Inspired by Moltbot's heartbeat system:
 * - Periodic checks based on a checklist
 * - Only notifies when something needs attention
 * - Respects active hours
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type RpcFn = <T = unknown>(
  fn: string,
  params?: Record<string, unknown>
) => Promise<{ data: T | null; error: { message?: string; code?: string } | null }>

export interface HeartbeatConfig {
  name: string
  checklist: string // Markdown checklist of things to monitor
  intervalMinutes: number
  activeHoursStart: string // "HH:MM" format
  activeHoursEnd: string
  timezone: string
  isEnabled: boolean
}

export interface Heartbeat extends HeartbeatConfig {
  id: string
  agentId: string
  lastRunAt: string | null
  nextRunAt: string | null
  createdAt: string
  updatedAt: string
}

export interface DueHeartbeat {
  heartbeatId: string
  agentId: string
  checklist: string
  agentName: string
  userId: string
}

export interface MonitorConfig {
  checkIntervalMinutes: number
  activeHours: {
    start: string
    end: string
  }
  conditions: MonitorCondition[]
  notifyOnlyOnChange: boolean
  quietIfNothing: boolean
}

export interface MonitorCondition {
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  lastStatus?: 'ok' | 'alert' | 'unknown'
  lastCheckedAt?: string
}

/**
 * Create a heartbeat for an agent
 */
export async function createHeartbeat(
  agentId: string,
  config: HeartbeatConfig
): Promise<{ success: boolean; heartbeatId?: string }> {
  const supabase = await createClient()
  
  // Calculate first run time
  const nextRunAt = new Date()
  nextRunAt.setMinutes(nextRunAt.getMinutes() + config.intervalMinutes)
  
  const { data, error } = await supabase
    .from('agent_heartbeats')
    .insert({
      agent_id: agentId,
      name: config.name,
      checklist: config.checklist,
      interval_minutes: config.intervalMinutes,
      active_hours_start: config.activeHoursStart,
      active_hours_end: config.activeHoursEnd,
      timezone: config.timezone,
      is_enabled: config.isEnabled,
      next_run_at: nextRunAt.toISOString(),
    } as never)
    .select()
    .single()
  
  if (error) {
    console.error('[HeartbeatManager] Failed to create heartbeat:', error)
    return { success: false }
  }
  
  return { success: true, heartbeatId: (data as { id: string }).id }
}

/**
 * Update a heartbeat configuration
 */
export async function updateHeartbeat(
  heartbeatId: string,
  updates: Partial<HeartbeatConfig>
): Promise<boolean> {
  const supabase = await createClient()
  
  const updateData: Record<string, unknown> = {}
  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.checklist !== undefined) updateData.checklist = updates.checklist
  if (updates.intervalMinutes !== undefined) updateData.interval_minutes = updates.intervalMinutes
  if (updates.activeHoursStart !== undefined) updateData.active_hours_start = updates.activeHoursStart
  if (updates.activeHoursEnd !== undefined) updateData.active_hours_end = updates.activeHoursEnd
  if (updates.timezone !== undefined) updateData.timezone = updates.timezone
  if (updates.isEnabled !== undefined) updateData.is_enabled = updates.isEnabled
  
  const { error } = await supabase
    .from('agent_heartbeats')
    .update(updateData as never)
    .eq('id', heartbeatId)
  
  return !error
}

/**
 * Delete a heartbeat
 */
export async function deleteHeartbeat(heartbeatId: string): Promise<boolean> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('agent_heartbeats')
    .delete()
    .eq('id', heartbeatId)
  
  return !error
}

/**
 * Get all heartbeats for an agent
 */
interface HeartbeatRow {
  id: string
  agent_id: string
  name: string
  checklist: string
  interval_minutes: number
  active_hours_start: string
  active_hours_end: string
  timezone: string
  is_enabled: boolean
  last_run_at: string | null
  next_run_at: string | null
  created_at: string
  updated_at: string
}

export async function getAgentHeartbeats(agentId: string): Promise<Heartbeat[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('agent_heartbeats')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: true })
  
  if (error) {
    console.error('[HeartbeatManager] Failed to get heartbeats:', error)
    return []
  }
  
  return ((data || []) as HeartbeatRow[]).map(h => ({
    id: h.id,
    agentId: h.agent_id,
    name: h.name,
    checklist: h.checklist,
    intervalMinutes: h.interval_minutes,
    activeHoursStart: h.active_hours_start,
    activeHoursEnd: h.active_hours_end,
    timezone: h.timezone,
    isEnabled: h.is_enabled,
    lastRunAt: h.last_run_at,
    nextRunAt: h.next_run_at,
    createdAt: h.created_at,
    updatedAt: h.updated_at,
  })) as Heartbeat[]
}

/**
 * Claim due heartbeats atomically for processing
 */
export async function claimDueHeartbeats(limit: number = 10): Promise<DueHeartbeat[]> {
  const supabase = createAdminClient()
  const rpc = supabase.rpc as unknown as RpcFn
  
  try {
    const { data, error } = await rpc<Array<Record<string, string>>>('claim_due_heartbeats', {
      p_limit: limit
    })
    
    if (error) {
      console.error('[HeartbeatManager] Failed to claim heartbeats:', error)
      return []
    }
    
    return (data || []).map((h: Record<string, string>) => ({
      heartbeatId: h.heartbeat_id,
      agentId: h.agent_id,
      checklist: h.checklist,
      agentName: h.agent_name,
      userId: h.user_id,
    }))
  } catch (error) {
    console.error('[HeartbeatManager] Error claiming heartbeats:', error)
    return []
  }
}

/**
 * Build a heartbeat prompt for the agent
 * The agent will check each item and only report if something needs attention
 */
export function buildHeartbeatPrompt(checklist: string): string {
  return `You are running a periodic monitoring check. Review each item in the checklist and take action ONLY if something needs attention.

MONITORING CHECKLIST:
${checklist}

INSTRUCTIONS:
1. For each item, perform the necessary check (take screenshots, navigate, etc.)
2. If everything is normal for an item, move to the next silently
3. ONLY report via report_insight if you find something that needs the user's attention
4. Be efficient - don't take unnecessary screenshots
5. After checking all items, call task_complete with a brief status

IMPORTANT:
- If nothing needs attention, just complete with "All monitored items OK"
- Only notify the user about genuine issues or important updates
- Prioritize urgent/high priority items first

Begin by taking a screenshot to assess the current state.`
}

/**
 * Create a default monitor configuration
 */
export function createDefaultMonitorConfig(): MonitorConfig {
  return {
    checkIntervalMinutes: 30,
    activeHours: {
      start: '08:00',
      end: '22:00',
    },
    conditions: [],
    notifyOnlyOnChange: true,
    quietIfNothing: true,
  }
}

/**
 * Parse a checklist into conditions
 */
export function parseChecklistToConditions(checklist: string): MonitorCondition[] {
  const lines = checklist.split('\n')
  const conditions: MonitorCondition[] = []
  
  for (const line of lines) {
    const trimmed = line.trim()
    // Match lines like "- Check email for urgent messages" or "- [ ] Review calendar"
    const match = trimmed.match(/^[-*]\s*(?:\[.\])?\s*(.+)$/)
    if (match) {
      const description = match[1].trim()
      
      // Detect priority from keywords
      let priority: MonitorCondition['priority'] = 'medium'
      if (description.toLowerCase().includes('urgent')) {
        priority = 'urgent'
      } else if (description.toLowerCase().includes('important') || description.toLowerCase().includes('critical')) {
        priority = 'high'
      } else if (description.toLowerCase().includes('optional') || description.toLowerCase().includes('if time')) {
        priority = 'low'
      }
      
      conditions.push({
        description,
        priority,
        lastStatus: 'unknown',
      })
    }
  }
  
  return conditions
}

/**
 * Format monitor results for the AI Manager
 */
export function formatMonitorResults(
  agentName: string,
  results: { condition: string; status: 'ok' | 'alert'; message?: string }[]
): string {
  const alerts = results.filter(r => r.status === 'alert')
  
  if (alerts.length === 0) {
    return `${agentName} completed monitoring check - all items OK.`
  }
  
  const alertMessages = alerts.map(a => `- ${a.condition}: ${a.message || 'Needs attention'}`).join('\n')
  
  return `${agentName} monitoring check found ${alerts.length} item(s) needing attention:\n${alertMessages}`
}

/**
 * Create a quick heartbeat from natural language
 * e.g., "check my email every 30 minutes during work hours"
 */
export function parseHeartbeatFromNaturalLanguage(input: string): Partial<HeartbeatConfig> {
  const config: Partial<HeartbeatConfig> = {
    isEnabled: true,
    timezone: 'UTC',
  }
  
  // Extract interval
  const intervalMatch = input.match(/every\s+(\d+)\s*(minute|hour|min|hr)/i)
  if (intervalMatch) {
    const value = parseInt(intervalMatch[1])
    const unit = intervalMatch[2].toLowerCase()
    config.intervalMinutes = unit.startsWith('hour') || unit.startsWith('hr') 
      ? value * 60 
      : value
  } else {
    config.intervalMinutes = 30 // Default
  }
  
  // Extract active hours
  if (input.toLowerCase().includes('work hours') || input.toLowerCase().includes('business hours')) {
    config.activeHoursStart = '09:00'
    config.activeHoursEnd = '17:00'
  } else if (input.toLowerCase().includes('daytime')) {
    config.activeHoursStart = '08:00'
    config.activeHoursEnd = '20:00'
  } else if (input.toLowerCase().includes('24/7') || input.toLowerCase().includes('always')) {
    config.activeHoursStart = '00:00'
    config.activeHoursEnd = '23:59'
  } else {
    config.activeHoursStart = '08:00'
    config.activeHoursEnd = '22:00'
  }
  
  // The main task becomes the checklist
  // Remove timing words to get the core task
  const checklist = input
    .replace(/every\s+\d+\s*(minute|hour|min|hr)s?/gi, '')
    .replace(/during\s+(work|business|day)?\s*hours?/gi, '')
    .replace(/24\/7|always/gi, '')
    .replace(/^\s*[-*]\s*/, '')
    .trim()
  
  config.checklist = `- ${checklist}`
  config.name = checklist.slice(0, 50)
  
  return config
}
