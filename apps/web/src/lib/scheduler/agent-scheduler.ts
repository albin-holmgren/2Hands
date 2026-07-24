import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deductWorkspaceCreditsAdmin, deductWorkspaceCredits, calculateCreditsForRun } from '@/lib/credits'
import { PRICING } from '@/lib/stripe/config'

interface ScheduledAgent {
  id: string
  name: string
  user_id: string
  schedule_type: 'realtime' | 'scheduled' | 'once'
  schedule_cron: string | null
  schedule_timezone: string
  next_run_at: string | null
  status: string
  config: { description?: string }
}

interface ClaimedAgent {
  agent_id: string
  user_id: string
  name: string
  schedule_cron: string | null
  schedule_timezone: string
  config: { description?: string }
}

/**
 * Generate unique scheduler instance ID
 */
function generateSchedulerId(): string {
  return `scheduler_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Atomically claim scheduled agents for execution
 * Uses SELECT...FOR UPDATE SKIP LOCKED to prevent concurrent schedulers
 * from picking up the same agents
 */
export async function claimScheduledAgents(limit: number = 10): Promise<ClaimedAgent[]> {
  const supabase = createAdminClient()
  const schedulerId = generateSchedulerId()
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('claim_scheduled_agents', {
    p_scheduler_id: schedulerId,
    p_limit: limit,
  })

  if (error) {
    console.error('claimScheduledAgents RPC error:', error)
    return []
  }

  const claimed = (data || []) as ClaimedAgent[]
  
  if (claimed.length > 0) {
    console.log(`[Scheduler ${schedulerId}] Claimed ${claimed.length} agents:`, 
      claimed.map(a => a.name)
    )
  }

  return claimed
}

/**
 * @deprecated Use claimScheduledAgents() instead for atomic operations
 * Legacy function kept for backwards compatibility
 */
export async function getAgentsDueForExecution(): Promise<ScheduledAgent[]> {
  const supabase = await createClient()
  
  const now = new Date().toISOString()
  
  const { data: agents, error } = await supabase
    .from('agents')
    .select('*')
    .eq('schedule_type', 'scheduled')
    .lte('next_run_at', now)
    .in('status', ['idle', 'initializing'])
    .order('next_run_at', { ascending: true })
    .limit(10)

  if (error) {
    console.error('Error fetching scheduled agents:', error)
    return []
  }

  return (agents || []) as ScheduledAgent[]
}

// Valid timezone list (subset of common timezones)
const VALID_TIMEZONES = new Set([
  'UTC', 'GMT',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'America/Mexico_City', 'America/Sao_Paulo',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome',
  'Europe/Amsterdam', 'Europe/Stockholm', 'Europe/Oslo', 'Europe/Copenhagen',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Singapore', 'Asia/Seoul',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok',
  'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland',
])

/**
 * Validate cron expression format
 */
export function isValidCronExpression(expression: string): boolean {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) return false
  
  // Basic validation for each part
  const patterns = [
    /^(\*|(\d{1,2})(-\d{1,2})?(\/\d{1,2})?|(\d{1,2}(,\d{1,2})*))$/, // minute (0-59)
    /^(\*|(\d{1,2})(-\d{1,2})?(\/\d{1,2})?|(\d{1,2}(,\d{1,2})*))$/, // hour (0-23)
    /^(\*|\?|(\d{1,2})(-\d{1,2})?(\/\d{1,2})?|(\d{1,2}(,\d{1,2})*))$/, // day of month (1-31)
    /^(\*|(\d{1,2})(-\d{1,2})?(\/\d{1,2})?|(\d{1,2}(,\d{1,2})*))$/, // month (1-12)
    /^(\*|\?|(\d)(-\d)?(\/\d)?|(\d(,\d)*))$/, // day of week (0-6)
  ]
  
  return parts.every((part, i) => patterns[i].test(part))
}

/**
 * Validate timezone string
 */
export function isValidTimezone(tz: string): boolean {
  if (VALID_TIMEZONES.has(tz)) return true
  
  // Try to create a date formatter with the timezone
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export async function markAgentRunCompleteAdmin(
  agentId: string,
  creditsUsed: number = PRICING.burnRates.typicalRun,
  isHeavyRun: boolean = false
): Promise<void> {
  const supabase = createAdminClient()

  const { data: agent } = await supabase
    .from('agents')
    .select('schedule_type, schedule_cron, schedule_timezone, total_credits_used, user_id, workspace_id')
    .eq('id', agentId)
    .single()

  const agentData = agent as (ScheduledAgent & { total_credits_used: number; workspace_id: string | null }) | null
  if (!agentData) return

  const actualCredits = creditsUsed || calculateCreditsForRun(isHeavyRun)
  if (agentData.workspace_id) {
    await deductWorkspaceCreditsAdmin(agentData.workspace_id, actualCredits, `Agent run: ${agentId}`)
  }

  if (agentData.schedule_type === 'scheduled' && agentData.schedule_cron) {
    const nextRun = calculateNextRunTime(agentData.schedule_cron, agentData.schedule_timezone)
    await supabase
      .from('agents')
      .update({
        next_run_at: nextRun.toISOString(),
        last_run_at: new Date().toISOString(),
        status: 'idle',
        total_credits_used: (agentData.total_credits_used || 0) + actualCredits,
      } as never)
      .eq('id', agentId)
  } else if (agentData.schedule_type === 'once') {
    await supabase
      .from('agents')
      .update({
        status: 'completed',
        last_run_at: new Date().toISOString(),
        total_credits_used: (agentData.total_credits_used || 0) + actualCredits,
      } as never)
      .eq('id', agentId)
  }
}

/**
 * Calculate next run time from cron expression
 * Handles common patterns with improved edge case handling
 */
export function calculateNextRunTime(cronExpression: string, timezone: string = 'UTC'): Date {
  // Validate inputs
  if (!isValidCronExpression(cronExpression)) {
    console.warn(`Invalid cron expression: ${cronExpression}, defaulting to 24 hours`)
    return new Date(Date.now() + 24 * 60 * 60 * 1000)
  }
  
  if (!isValidTimezone(timezone)) {
    console.warn(`Invalid timezone: ${timezone}, using UTC`)
    timezone = 'UTC'
  }

  const parts = cronExpression.split(/\s+/)
  const [minute, hour, dayOfMonth, _month, dayOfWeek] = parts
  
  // Get current time in the specified timezone
  const now = new Date()
  let next = new Date(now)

  // Handle common patterns
  if (minute.startsWith('*/')) {
    // Every X minutes
    const interval = parseInt(minute.substring(2)) || 1
    if (interval <= 0 || interval > 59) {
      return new Date(Date.now() + 60 * 60 * 1000) // Fallback to 1 hour
    }
    const currentMinute = now.getMinutes()
    const nextMinute = Math.ceil((currentMinute + 1) / interval) * interval
    next.setMinutes(nextMinute % 60)
    next.setSeconds(0)
    next.setMilliseconds(0)
    if (nextMinute >= 60) {
      next.setHours(next.getHours() + 1)
      next.setMinutes(0)
    }
    if (next <= now) {
      next.setMinutes(next.getMinutes() + interval)
    }
  } else if (hour.startsWith('*/')) {
    // Every X hours
    const interval = parseInt(hour.substring(2)) || 1
    if (interval <= 0 || interval > 23) {
      return new Date(Date.now() + 60 * 60 * 1000) // Fallback to 1 hour
    }
    next.setMinutes(parseInt(minute) || 0)
    next.setSeconds(0)
    next.setMilliseconds(0)
    const currentHour = now.getHours()
    const nextHour = Math.ceil((currentHour + 1) / interval) * interval
    next.setHours(nextHour % 24)
    if (nextHour >= 24) {
      next.setDate(next.getDate() + 1)
      next.setHours(0)
    }
    if (next <= now) {
      next.setHours(next.getHours() + interval)
    }
  } else if (hour !== '*' && minute !== '*') {
    // Specific time (e.g., 0 9 * * * = daily at 9am)
    const targetHour = parseInt(hour)
    const targetMinute = parseInt(minute)
    
    // Validate hour and minute
    if (isNaN(targetHour) || targetHour < 0 || targetHour > 23 ||
        isNaN(targetMinute) || targetMinute < 0 || targetMinute > 59) {
      return new Date(Date.now() + 60 * 60 * 1000) // Fallback to 1 hour
    }
    
    next.setHours(targetHour)
    next.setMinutes(targetMinute)
    next.setSeconds(0)
    next.setMilliseconds(0)
    
    if (next <= now) {
      // If time has passed today, schedule for tomorrow
      next.setDate(next.getDate() + 1)
    }
    
    // Handle day of week
    if (dayOfWeek !== '*' && dayOfWeek !== '?') {
      const targetDay = parseInt(dayOfWeek)
      if (!isNaN(targetDay) && targetDay >= 0 && targetDay <= 6) {
        let daysToAdd = 0
        while (next.getDay() !== targetDay && daysToAdd < 7) {
          next.setDate(next.getDate() + 1)
          daysToAdd++
        }
      }
    }
    
    // Handle day of month (skip Feb 29 on non-leap years, etc.)
    if (dayOfMonth !== '*' && dayOfMonth !== '?') {
      const targetDayOfMonth = parseInt(dayOfMonth)
      if (!isNaN(targetDayOfMonth) && targetDayOfMonth >= 1 && targetDayOfMonth <= 31) {
        // Find next occurrence of this day
        let attempts = 0
        while (next.getDate() !== targetDayOfMonth && attempts < 365) {
          next.setDate(next.getDate() + 1)
          attempts++
        }
      }
    }
  } else {
    // Default: 1 hour from now
    next = new Date(Date.now() + 60 * 60 * 1000)
  }

  return next
}

export async function updateAgentNextRun(agentId: string, cronExpression: string, timezone: string): Promise<void> {
  const supabase = await createClient()
  
  const nextRun = calculateNextRunTime(cronExpression, timezone)
  
  await supabase
    .from('agents')
    .update({
      next_run_at: nextRun.toISOString(),
      last_run_at: new Date().toISOString(),
      status: 'idle',
    } as never)
    .eq('id', agentId)
}

export async function markAgentRunComplete(
  agentId: string, 
  creditsUsed: number = PRICING.burnRates.typicalRun,
  isHeavyRun: boolean = false
): Promise<void> {
  const supabase = await createClient()
  
  const { data: agent } = await supabase
    .from('agents')
    .select('schedule_type, schedule_cron, schedule_timezone, total_credits_used, user_id, workspace_id')
    .eq('id', agentId)
    .single()

  const agentData = agent as ScheduledAgent & { total_credits_used: number; workspace_id: string | null } | null

  if (!agentData) return

  // Calculate credits to deduct (use provided amount or calculate based on run type)
  const actualCredits = creditsUsed || calculateCreditsForRun(isHeavyRun)
  
  // Deduct credits from workspace balance (single source of truth for the UI)
  if (agentData.workspace_id) {
    await deductWorkspaceCredits(agentData.workspace_id, actualCredits, `Agent run: ${agentId}`)
  }

  if (agentData.schedule_type === 'scheduled' && agentData.schedule_cron) {
    // Update next run time for scheduled agents
    const nextRun = calculateNextRunTime(agentData.schedule_cron, agentData.schedule_timezone)
    
    await supabase
      .from('agents')
      .update({
        next_run_at: nextRun.toISOString(),
        last_run_at: new Date().toISOString(),
        status: 'idle',
        total_credits_used: (agentData.total_credits_used || 0) + actualCredits,
      } as never)
      .eq('id', agentId)
  } else if (agentData.schedule_type === 'once') {
    // Mark one-time tasks as completed
    await supabase
      .from('agents')
      .update({
        status: 'completed',
        last_run_at: new Date().toISOString(),
        total_credits_used: (agentData.total_credits_used || 0) + actualCredits,
      } as never)
      .eq('id', agentId)
  }
}

export function getEstimatedMonthlyCost(scheduleType: string, cronExpression?: string): number {
  const costPerRun = 0.50 // ~$0.50 per hour of VM time, assuming ~1 hour per run
  
  if (scheduleType === 'realtime') {
    // 24/7 running
    return 24 * 30 * costPerRun // ~$360/month
  }
  
  if (scheduleType === 'once') {
    return costPerRun
  }
  
  if (scheduleType === 'scheduled' && cronExpression) {
    // Estimate runs per day based on cron
    const parts = cronExpression.split(' ')
    let runsPerDay = 1
    
    if (parts[1]?.startsWith('*/')) {
      // Every X hours
      runsPerDay = 24 / parseInt(parts[1].substring(2))
    } else if (parts[0]?.startsWith('*/')) {
      // Every X minutes
      runsPerDay = (24 * 60) / parseInt(parts[0].substring(2))
    }
    
    return runsPerDay * 30 * costPerRun
  }
  
  return costPerRun
}
