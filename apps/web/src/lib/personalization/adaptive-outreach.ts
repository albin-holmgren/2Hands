/**
 * Adaptive Outreach System
 * 
 * Learns optimal outreach frequency per user to maximize retention
 * without being annoying. No UI controls - pure ML-driven optimization.
 * 
 * Signals we learn from:
 * - User opens app after outreach → positive signal
 * - User ignores outreach → negative signal
 * - User responds to outreach → strong positive
 * - User creates agent after suggestion → very strong positive
 * - User inactive after outreach → no signal (neutral)
 * - Multiple outreach with no engagement → negative
 */

import { createAdminClient } from '@/lib/supabase/server'

export interface OutreachMetrics {
  userId: string
  totalSent: number
  totalOpened: number
  totalResponded: number
  totalIgnored: number
  avgResponseTimeMinutes: number
  optimalFrequencyHours: number
  lastOutreachAt: string | null
  lastEngagementAt: string | null
  engagementScore: number // 0-1, higher = more engaged
  retentionRisk: 'low' | 'medium' | 'high'
}

export interface OutreachEvent {
  type: 'sent' | 'opened' | 'responded' | 'dismissed' | 'action_taken'
  outreachId: string
  userId: string
  outreachType: string
  metadata?: Record<string, unknown>
}

// Default frequencies by engagement level (hours between outreach)
const FREQUENCY_TIERS = {
  highly_engaged: 24,      // Daily for active users
  engaged: 48,             // Every 2 days
  moderate: 72,            // Every 3 days
  low: 168,                // Weekly
  at_risk: 336,            // Every 2 weeks (don't spam disengaged users)
  new_user: 12,            // More frequent for onboarding
}

// Weights for computing engagement score
const ENGAGEMENT_WEIGHTS: Record<string, number> = {
  sent: 0,
  opened: 0.1,
  responded: 0.3,
  action_taken: 0.5,      // Created agent, accepted suggestion
  dismissed: -0.2,
  ignored: -0.1,
}

/**
 * Determine if we should send outreach to this user right now
 * Based on learned optimal frequency and recent engagement
 */
export async function shouldSendOutreach(
  userId: string,
  outreachType: string
): Promise<{ shouldSend: boolean; reason: string; nextWindowHours?: number }> {
  const supabase = createAdminClient()
  
  // Get user's outreach metrics
  const metrics = await getUserOutreachMetrics(userId)
  
  // Check cooldown based on learned frequency
  if (metrics.lastOutreachAt) {
    const hoursSinceLastOutreach = 
      (Date.now() - new Date(metrics.lastOutreachAt).getTime()) / (1000 * 60 * 60)
    
    if (hoursSinceLastOutreach < metrics.optimalFrequencyHours) {
      return {
        shouldSend: false,
        reason: `In cooldown period (${Math.round(metrics.optimalFrequencyHours - hoursSinceLastOutreach)}h remaining)`,
        nextWindowHours: metrics.optimalFrequencyHours - hoursSinceLastOutreach,
      }
    }
  }
  
  // Check if user has been ignoring outreach (back off)
  const recentIgnored = await getRecentIgnoredCount(userId, 7)
  if (recentIgnored >= 3) {
    return {
      shouldSend: false,
      reason: 'User has ignored recent outreach, backing off',
      nextWindowHours: 168, // Wait a week
    }
  }
  
  // Check dedupe: don't send same type twice in a row
  const { data: lastOutreach } = await supabase
    .from('proactive_outreach')
    .select('type')
    .eq('user_id', userId)
    .not('sent_at', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(1)
    .single()
  
  if (lastOutreach && (lastOutreach as { type: string }).type === outreachType) {
    return {
      shouldSend: false,
      reason: 'Same outreach type as last time, varying content',
    }
  }
  
  // Check user's preferred times (learned from engagement patterns)
  const currentHour = new Date().getHours()
  const preferredHours = await getPreferredOutreachHours(userId)
  
  if (preferredHours.length > 0 && !preferredHours.includes(currentHour)) {
    const nextPreferredHour = preferredHours.find(h => h > currentHour) || preferredHours[0]
    const hoursUntilPreferred = nextPreferredHour > currentHour 
      ? nextPreferredHour - currentHour 
      : 24 - currentHour + nextPreferredHour
    
    return {
      shouldSend: false,
      reason: `Not in user's preferred hours (best: ${preferredHours.join(', ')})`,
      nextWindowHours: hoursUntilPreferred,
    }
  }
  
  return { shouldSend: true, reason: 'Within optimal engagement window' }
}

/**
 * Record an outreach event and update learning
 */
export async function recordOutreachEvent(event: OutreachEvent): Promise<void> {
  const supabase = createAdminClient()
  
  // Log the event
  await supabase
    .from('outreach_events')
    .insert({
      outreach_id: event.outreachId,
      user_id: event.userId,
      event_type: event.type,
      outreach_type: event.outreachType,
      metadata: event.metadata || {},
      created_at: new Date().toISOString(),
    } as never)
  
  // Update metrics based on event type
  await updateOutreachMetrics(event.userId, event.type)
  
  // Recalculate optimal frequency
  await recalculateOptimalFrequency(event.userId)
}

/**
 * Get user's outreach metrics
 */
export async function getUserOutreachMetrics(userId: string): Promise<OutreachMetrics> {
  const supabase = createAdminClient()
  
  // Try to get cached metrics
  const { data: cached } = await supabase
    .from('user_outreach_metrics')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  if (cached) {
    const c = cached as {
      total_sent: number
      total_opened: number
      total_responded: number
      total_ignored: number
      avg_response_time_minutes: number
      optimal_frequency_hours: number
      last_outreach_at: string | null
      last_engagement_at: string | null
      engagement_score: number
      retention_risk: 'low' | 'medium' | 'high'
    }
    return {
      userId,
      totalSent: c.total_sent,
      totalOpened: c.total_opened,
      totalResponded: c.total_responded,
      totalIgnored: c.total_ignored,
      avgResponseTimeMinutes: c.avg_response_time_minutes,
      optimalFrequencyHours: c.optimal_frequency_hours,
      lastOutreachAt: c.last_outreach_at,
      lastEngagementAt: c.last_engagement_at,
      engagementScore: c.engagement_score,
      retentionRisk: c.retention_risk,
    }
  }
  
  // Return defaults for new user
  return {
    userId,
    totalSent: 0,
    totalOpened: 0,
    totalResponded: 0,
    totalIgnored: 0,
    avgResponseTimeMinutes: 0,
    optimalFrequencyHours: FREQUENCY_TIERS.new_user,
    lastOutreachAt: null,
    lastEngagementAt: null,
    engagementScore: 0.5, // Neutral starting point
    retentionRisk: 'low',
  }
}

/**
 * Update metrics after an event
 */
async function updateOutreachMetrics(
  userId: string,
  eventType: OutreachEvent['type']
): Promise<void> {
  const supabase = createAdminClient()
  const metrics = await getUserOutreachMetrics(userId)
  
  // Calculate new values
  const updates: Record<string, number | string> = {}
  
  switch (eventType) {
    case 'sent':
      updates.total_sent = metrics.totalSent + 1
      updates.last_outreach_at = new Date().toISOString()
      break
    case 'opened':
      updates.total_opened = metrics.totalOpened + 1
      updates.last_engagement_at = new Date().toISOString()
      break
    case 'responded':
      updates.total_responded = metrics.totalResponded + 1
      updates.last_engagement_at = new Date().toISOString()
      break
    case 'dismissed':
    case 'action_taken':
      updates.last_engagement_at = new Date().toISOString()
      break
  }
  
  // Calculate new engagement score
  const weight = ENGAGEMENT_WEIGHTS[eventType] || 0
  const newScore = Math.max(0, Math.min(1, metrics.engagementScore + weight * 0.1))
  updates.engagement_score = newScore
  
  // Determine retention risk
  if (newScore > 0.7) {
    updates.retention_risk = 'low'
  } else if (newScore > 0.4) {
    updates.retention_risk = 'medium'
  } else {
    updates.retention_risk = 'high'
  }
  
  // Upsert metrics
  await supabase
    .from('user_outreach_metrics')
    .upsert({
      user_id: userId,
      ...updates,
      updated_at: new Date().toISOString(),
    } as never, { onConflict: 'user_id' })
}

/**
 * Recalculate optimal outreach frequency based on engagement patterns
 */
async function recalculateOptimalFrequency(userId: string): Promise<number> {
  const supabase = createAdminClient()
  const metrics = await getUserOutreachMetrics(userId)
  
  let optimalHours: number
  
  // Engagement-based frequency
  if (metrics.engagementScore > 0.8) {
    optimalHours = FREQUENCY_TIERS.highly_engaged
  } else if (metrics.engagementScore > 0.6) {
    optimalHours = FREQUENCY_TIERS.engaged
  } else if (metrics.engagementScore > 0.4) {
    optimalHours = FREQUENCY_TIERS.moderate
  } else if (metrics.engagementScore > 0.2) {
    optimalHours = FREQUENCY_TIERS.low
  } else {
    optimalHours = FREQUENCY_TIERS.at_risk
  }
  
  // Adjust for new users (first week)
  if (metrics.totalSent < 5) {
    optimalHours = Math.min(optimalHours, FREQUENCY_TIERS.new_user)
  }
  
  // Adjust based on response time patterns
  if (metrics.avgResponseTimeMinutes > 0 && metrics.avgResponseTimeMinutes < 30) {
    // Quick responders - can message more often
    optimalHours = Math.max(12, optimalHours * 0.8)
  } else if (metrics.avgResponseTimeMinutes > 1440) {
    // Slow responders (>1 day) - back off
    optimalHours = Math.min(336, optimalHours * 1.5)
  }
  
  // Update stored value
  await supabase
    .from('user_outreach_metrics')
    .upsert({
      user_id: userId,
      optimal_frequency_hours: optimalHours,
      updated_at: new Date().toISOString(),
    } as never, { onConflict: 'user_id' })
  
  return optimalHours
}

/**
 * Get count of ignored outreach in last N days
 */
async function getRecentIgnoredCount(userId: string, days: number): Promise<number> {
  const supabase = createAdminClient()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  
  // Count outreach that was sent but never opened/responded
  const { count } = await supabase
    .from('proactive_outreach')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('sent_at', 'is', null)
    .is('read_at', null)
    .gt('sent_at', since)
  
  return count || 0
}

/**
 * Learn user's preferred outreach hours from engagement patterns
 */
async function getPreferredOutreachHours(userId: string): Promise<number[]> {
  const supabase = createAdminClient()
  
  // Get outreach that got engagement
  const { data: engagedOutreach } = await supabase
    .from('proactive_outreach')
    .select('sent_at, read_at')
    .eq('user_id', userId)
    .not('read_at', 'is', null)
    .limit(50)
  
  if (!engagedOutreach || engagedOutreach.length < 5) {
    // Not enough data - return default work hours
    return [9, 10, 11, 14, 15, 16]
  }
  
  // Count engagement by hour
  const hourCounts: Record<number, number> = {}
  for (const outreach of engagedOutreach as { sent_at: string; read_at: string }[]) {
    const hour = new Date(outreach.sent_at).getHours()
    hourCounts[hour] = (hourCounts[hour] || 0) + 1
  }
  
  // Get top 6 hours
  const sortedHours = Object.entries(hourCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([hour]) => parseInt(hour))
  
  return sortedHours
}

/**
 * Detect retention risk and trigger win-back if needed
 */
export async function detectRetentionRisk(userId: string): Promise<{
  risk: 'low' | 'medium' | 'high' | 'churning'
  daysSinceLastActivity: number
  recommendedAction: string | null
}> {
  const supabase = createAdminClient()
  
  // Get last activity
  const { data: lastMessage } = await supabase
    .from('messages')
    .select('created_at')
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  
  const lastActivityAt = lastMessage 
    ? new Date((lastMessage as { created_at: string }).created_at)
    : null
  
  if (!lastActivityAt) {
    return { risk: 'churning', daysSinceLastActivity: 999, recommendedAction: 'onboarding_reminder' }
  }
  
  const daysSince = (Date.now() - lastActivityAt.getTime()) / (1000 * 60 * 60 * 24)
  
  if (daysSince < 3) {
    return { risk: 'low', daysSinceLastActivity: daysSince, recommendedAction: null }
  } else if (daysSince < 7) {
    return { risk: 'medium', daysSinceLastActivity: daysSince, recommendedAction: 'gentle_check_in' }
  } else if (daysSince < 14) {
    return { risk: 'high', daysSinceLastActivity: daysSince, recommendedAction: 'value_reminder' }
  } else {
    return { risk: 'churning', daysSinceLastActivity: daysSince, recommendedAction: 'win_back' }
  }
}

/**
 * Track when user engages with app (called on chat, agent view, etc.)
 */
export async function trackUserEngagement(
  userId: string,
  engagementType: 'app_open' | 'chat' | 'agent_view' | 'agent_create'
): Promise<void> {
  const supabase = createAdminClient()
  
  // Check if there's pending outreach that should be marked as "opened"
  const { data: pendingOutreach } = await supabase
    .from('proactive_outreach')
    .select('id, type')
    .eq('user_id', userId)
    .not('sent_at', 'is', null)
    .is('read_at', null)
    .order('sent_at', { ascending: false })
    .limit(1)
    .single()
  
  if (pendingOutreach) {
    const outreach = pendingOutreach as { id: string; type: string }
    
    // Mark as read
    await supabase
      .from('proactive_outreach')
      .update({ read_at: new Date().toISOString() } as never)
      .eq('id', outreach.id)
    
    // Record event
    await recordOutreachEvent({
      type: engagementType === 'chat' ? 'responded' : 'opened',
      outreachId: outreach.id,
      userId,
      outreachType: outreach.type,
    })
  }
  
  // Update last engagement
  await supabase
    .from('user_outreach_metrics')
    .upsert({
      user_id: userId,
      last_engagement_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never, { onConflict: 'user_id' })
}
