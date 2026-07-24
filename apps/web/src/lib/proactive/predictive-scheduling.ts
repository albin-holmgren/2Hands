/**
 * Predictive Task Scheduling
 * 
 * Analyzes user behavior patterns to:
 * - Suggest optimal times for agent runs
 * - Auto-adjust schedules based on usage patterns
 * - Predict when user might need information
 * 
 * Best UX: Schedules feel intuitive - agents run right before
 * the user typically needs the information.
 */

import { createClient } from '@/lib/supabase/server'

export interface ScheduleRecommendation {
  suggestedCron: string
  humanReadable: string
  confidence: number
  reasoning: string
  basedOn: string[]
}

export interface UserActivityPattern {
  dayOfWeek: number // 0-6
  hourOfDay: number // 0-23
  activityCount: number
  averageEngagementMinutes: number
}

/**
 * Analyze when user is typically active
 */
export async function analyzeUserActivityPatterns(userId: string): Promise<UserActivityPattern[]> {
  const supabase = await createClient()
  
  // Get user's message timestamps (when they interact with AI Manager)
  const { data: messages } = await supabase
    .from('messages')
    .select('created_at, conversations!inner(user_id)')
    .eq('conversations.user_id', userId)
    .eq('role', 'user')
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(500)
  
  if (!messages || messages.length < 10) {
    return getDefaultActivityPatterns()
  }
  
  // Group by day of week and hour
  const patterns: Map<string, { count: number; timestamps: Date[] }> = new Map()
  
  for (const msg of messages as { created_at: string }[]) {
    const date = new Date(msg.created_at)
    const key = `${date.getDay()}-${date.getHours()}`
    
    if (!patterns.has(key)) {
      patterns.set(key, { count: 0, timestamps: [] })
    }
    
    const pattern = patterns.get(key)!
    pattern.count++
    pattern.timestamps.push(date)
  }
  
  // Convert to activity patterns
  const activityPatterns: UserActivityPattern[] = []
  
  patterns.forEach((value, key) => {
    const [day, hour] = key.split('-').map(Number)
    activityPatterns.push({
      dayOfWeek: day,
      hourOfDay: hour,
      activityCount: value.count,
      averageEngagementMinutes: calculateAverageEngagement(value.timestamps),
    })
  })
  
  return activityPatterns.sort((a, b) => b.activityCount - a.activityCount)
}

function calculateAverageEngagement(timestamps: Date[]): number {
  if (timestamps.length < 2) return 5
  
  // Group messages within 30 minutes of each other as one session
  let totalMinutes = 0
  let sessionCount = 0
  let sessionStart = timestamps[0]
  
  for (let i = 1; i < timestamps.length; i++) {
    const diff = Math.abs(timestamps[i].getTime() - timestamps[i-1].getTime()) / 60000
    
    if (diff > 30) {
      // New session
      totalMinutes += (timestamps[i-1].getTime() - sessionStart.getTime()) / 60000
      sessionCount++
      sessionStart = timestamps[i]
    }
  }
  
  return sessionCount > 0 ? Math.round(totalMinutes / sessionCount) : 5
}

function getDefaultActivityPatterns(): UserActivityPattern[] {
  // Default: Most active weekdays 9am-6pm
  const patterns: UserActivityPattern[] = []
  
  for (let day = 1; day <= 5; day++) { // Mon-Fri
    for (let hour = 9; hour <= 17; hour++) {
      patterns.push({
        dayOfWeek: day,
        hourOfDay: hour,
        activityCount: hour === 9 || hour === 14 ? 10 : 5, // Peak at 9am and 2pm
        averageEngagementMinutes: 10,
      })
    }
  }
  
  return patterns
}

/**
 * Recommend optimal schedule for an agent task
 */
export async function recommendSchedule(
  userId: string,
  taskType: string,
  taskDescription: string
): Promise<ScheduleRecommendation> {
  const patterns = await analyzeUserActivityPatterns(userId)
  
  if (patterns.length === 0) {
    return getDefaultRecommendation(taskType)
  }
  
  // Find peak activity times
  const topPattern = patterns[0]
  
  // Schedule agent to run BEFORE peak activity (so results are ready)
  const runHour = Math.max(0, topPattern.hourOfDay - 1)
  
  // Determine if daily or weekly based on task type
  const isDaily = shouldRunDaily(taskType, taskDescription)
  
  if (isDaily) {
    return {
      suggestedCron: `0 ${runHour} * * 1-5`, // Weekdays only
      humanReadable: `Every weekday at ${formatHour(runHour)}`,
      confidence: 0.75,
      reasoning: `Based on your activity, you're most active around ${formatHour(topPattern.hourOfDay)}. I'll have results ready before then.`,
      basedOn: ['user_activity_patterns', 'task_type'],
    }
  } else {
    // Weekly - pick the day with most activity
    const topDay = patterns.reduce((a, b) => 
      a.activityCount > b.activityCount ? a : b
    ).dayOfWeek
    
    return {
      suggestedCron: `0 ${runHour} * * ${topDay}`,
      humanReadable: `Every ${getDayName(topDay)} at ${formatHour(runHour)}`,
      confidence: 0.7,
      reasoning: `You're most active on ${getDayName(topDay)}s around ${formatHour(topPattern.hourOfDay)}.`,
      basedOn: ['user_activity_patterns', 'task_type'],
    }
  }
}

function shouldRunDaily(taskType: string, description: string): boolean {
  const dailyKeywords = [
    'daily', 'every day', 'each day', 'morning',
    'check', 'monitor', 'inbox', 'email', 'messages',
    'notifications', 'updates', 'news', 'sales'
  ]
  
  const combined = `${taskType} ${description}`.toLowerCase()
  return dailyKeywords.some(keyword => combined.includes(keyword))
}

function getDefaultRecommendation(taskType: string): ScheduleRecommendation {
  return {
    suggestedCron: '0 9 * * 1-5',
    humanReadable: 'Every weekday at 9:00 AM',
    confidence: 0.5,
    reasoning: 'Default schedule based on common work patterns.',
    basedOn: ['default_patterns'],
  }
}

function formatHour(hour: number): string {
  if (hour === 0) return '12:00 AM'
  if (hour === 12) return '12:00 PM'
  if (hour < 12) return `${hour}:00 AM`
  return `${hour - 12}:00 PM`
}

function getDayName(day: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[day]
}

/**
 * Auto-adjust schedule based on actual usage
 * Call this after each agent run to learn from usage
 */
export async function learnFromUsage(
  agentId: string,
  wasHelpful: boolean,
  userViewedAt?: Date
): Promise<void> {
  const supabase = await createClient()
  
  // Get agent info
  const { data: agent } = await supabase
    .from('agents')
    .select('user_id, schedule_cron, last_run_at')
    .eq('id', agentId)
    .single()
  
  if (!agent) return
  
  const agentData = agent as { user_id: string; schedule_cron: string | null; last_run_at: string | null }
  
  // If user viewed results quickly after run, timing was good
  // If user didn't view for hours, maybe adjust schedule
  if (userViewedAt && agentData.last_run_at) {
    const runTime = new Date(agentData.last_run_at)
    const viewTime = userViewedAt
    const delayMinutes = (viewTime.getTime() - runTime.getTime()) / 60000
    
    // Store this data point for future optimization
    await supabase
      .from('agent_schedule_feedback')
      .insert({
        agent_id: agentId,
        user_id: agentData.user_id,
        run_at: runTime.toISOString(),
        viewed_at: viewTime.toISOString(),
        delay_minutes: delayMinutes,
        was_helpful: wasHelpful,
        created_at: new Date().toISOString(),
      } as never)
  }
}

/**
 * Get smart schedule suggestions for AI Manager to present
 */
export function formatScheduleForAIManager(recommendation: ScheduleRecommendation): string {
  return `Based on when you're typically active, I recommend running this **${recommendation.humanReadable}**.

${recommendation.reasoning}

Would you like me to set this schedule, or would you prefer a different time?`
}
