/**
 * Behavior Learning Engine
 *
 * The core algorithm that learns what the user values and adapts the entire
 * experience to maximize retention and satisfaction. Every interaction feeds
 * into this engine.
 *
 * What it learns:
 *   - Session patterns (when, how long, how often)
 *   - Topic interests (which agents/updates they engage with)
 *   - Notification preferences (what they tap vs ignore)
 *   - Engagement momentum (trending up or down?)
 *   - Optimal contact windows (time-of-day, day-of-week)
 *   - Content preferences (what type of updates they value)
 *   - Churn risk signals (declining usage, ignoring notifications)
 *
 * How it works:
 *   - Exponential Moving Averages (EMA) for adaptive learning
 *   - Bayesian-inspired scoring for notification relevance
 *   - Decay functions so stale behavior fades over time
 *   - Reinforcement signals: tapped notification = reward, ignored = penalty
 */

import { createClient } from '@/lib/supabase/server'

// ============================================================
// Types
// ============================================================

export interface BehaviorProfile {
  userId: string

  // Session patterns
  sessionCount: number
  avgSessionGapHours: number           // average hours between sessions
  activeHours: number[]                // hours of day user is most active (0-23)
  activeDays: number[]                 // days of week (0=Sun, 6=Sat)
  avgSessionDurationMinutes: number
  currentStreak: number                // consecutive days with a session
  longestStreak: number

  // Engagement momentum (0-1, EMA-smoothed)
  engagementMomentum: number
  momentumTrend: 'rising' | 'stable' | 'declining'

  // Topic interests — agent categories the user cares about, scored 0-1
  topicScores: Record<string, number>

  // Notification preferences — learned from tap/ignore signals
  notificationScores: Record<string, number>  // type → score (0-1)
  notificationTapRate: number                 // overall tap rate
  quietHoursStart: number | null              // e.g., 22 (10 PM)
  quietHoursEnd: number | null                // e.g., 7 (7 AM)
  maxDailyNotifications: number               // learned cap

  // Retention signals
  churnRisk: number                    // 0-1, higher = more likely to churn
  daysSinceLastSession: number
  reactivationCount: number            // times user came back after going quiet

  // Content preferences
  preferredUpdateTypes: string[]       // ranked list of update types they engage with
  valueSignals: string[]               // what brings user back (e.g., "agent_results", "insights")

  updatedAt: string
}

export interface BehaviorSignal {
  type: 'session_start' | 'session_end' | 'message_sent' | 'agent_viewed'
      | 'agent_created' | 'notification_tapped' | 'notification_ignored'
      | 'notification_dismissed' | 'insight_read' | 'insight_ignored'
      | 'feature_used' | 'agent_run_triggered'
  metadata?: Record<string, unknown>
}

/** Score for whether a notification should be sent */
export interface NotificationDecision {
  shouldSend: boolean
  score: number           // 0-1, how confident we are this is worth sending
  reason: string
  delayMinutes: number    // 0 = now, >0 = batch/delay
  personalizedTitle?: string
  personalizedBody?: string
}

// ============================================================
// Constants
// ============================================================

const EMA_ALPHA = 0.15                  // smoothing factor for exponential moving averages
const DECAY_RATE = 0.02                 // per-day decay for scores
const MIN_SCORE = 0.05                  // floor for any score
const MAX_SCORE = 0.95                  // ceiling for any score
const NOTIFICATION_TAP_REWARD = 0.12    // boost when user taps a notification
const NOTIFICATION_IGNORE_PENALTY = 0.06 // penalty when user ignores
const INSIGHT_ENGAGE_REWARD = 0.08      // boost when user reads an insight
const SESSION_MOMENTUM_BOOST = 0.05     // per-session boost to momentum
const INACTIVITY_MOMENTUM_DECAY = 0.03  // per-day decay when no sessions
const CHURN_THRESHOLD_DAYS = 7          // days without session = churn risk starts

// ============================================================
// Core: Get & Update Behavior Profile
// ============================================================

/**
 * Get or initialize the user's behavior profile.
 */
export async function getBehaviorProfile(userId: string): Promise<BehaviorProfile> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('behavior_profiles')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (data) {
    const d = data as Record<string, unknown>
    return {
      userId,
      sessionCount: (d.session_count as number) || 0,
      avgSessionGapHours: (d.avg_session_gap_hours as number) || 24,
      activeHours: (d.active_hours as number[]) || [9, 10, 11, 14, 15, 16],
      activeDays: (d.active_days as number[]) || [1, 2, 3, 4, 5],
      avgSessionDurationMinutes: (d.avg_session_duration_minutes as number) || 5,
      currentStreak: (d.current_streak as number) || 0,
      longestStreak: (d.longest_streak as number) || 0,
      engagementMomentum: (d.engagement_momentum as number) || 0.5,
      momentumTrend: (d.momentum_trend as BehaviorProfile['momentumTrend']) || 'stable',
      topicScores: (d.topic_scores as Record<string, number>) || {},
      notificationScores: (d.notification_scores as Record<string, number>) || {},
      notificationTapRate: (d.notification_tap_rate as number) || 0.5,
      quietHoursStart: (d.quiet_hours_start as number) ?? null,
      quietHoursEnd: (d.quiet_hours_end as number) ?? null,
      maxDailyNotifications: (d.max_daily_notifications as number) || 5,
      churnRisk: (d.churn_risk as number) || 0,
      daysSinceLastSession: (d.days_since_last_session as number) || 0,
      reactivationCount: (d.reactivation_count as number) || 0,
      preferredUpdateTypes: (d.preferred_update_types as string[]) || [],
      valueSignals: (d.value_signals as string[]) || [],
      updatedAt: (d.updated_at as string) || new Date().toISOString(),
    }
  }

  // New user defaults
  return {
    userId,
    sessionCount: 0,
    avgSessionGapHours: 24,
    activeHours: [9, 10, 11, 14, 15, 16],
    activeDays: [1, 2, 3, 4, 5],
    avgSessionDurationMinutes: 5,
    currentStreak: 0,
    longestStreak: 0,
    engagementMomentum: 0.5,
    momentumTrend: 'stable',
    topicScores: {},
    notificationScores: {},
    notificationTapRate: 0.5,
    quietHoursStart: null,
    quietHoursEnd: null,
    maxDailyNotifications: 5,
    churnRisk: 0,
    daysSinceLastSession: 0,
    reactivationCount: 0,
    preferredUpdateTypes: [],
    valueSignals: [],
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Persist behavior profile to database.
 */
async function saveBehaviorProfile(profile: BehaviorProfile): Promise<void> {
  const supabase = await createClient()

  await supabase
    .from('behavior_profiles')
    .upsert({
      user_id: profile.userId,
      session_count: profile.sessionCount,
      avg_session_gap_hours: profile.avgSessionGapHours,
      active_hours: profile.activeHours,
      active_days: profile.activeDays,
      avg_session_duration_minutes: profile.avgSessionDurationMinutes,
      current_streak: profile.currentStreak,
      longest_streak: profile.longestStreak,
      engagement_momentum: profile.engagementMomentum,
      momentum_trend: profile.momentumTrend,
      topic_scores: profile.topicScores,
      notification_scores: profile.notificationScores,
      notification_tap_rate: profile.notificationTapRate,
      quiet_hours_start: profile.quietHoursStart,
      quiet_hours_end: profile.quietHoursEnd,
      max_daily_notifications: profile.maxDailyNotifications,
      churn_risk: profile.churnRisk,
      days_since_last_session: profile.daysSinceLastSession,
      reactivation_count: profile.reactivationCount,
      preferred_update_types: profile.preferredUpdateTypes,
      value_signals: profile.valueSignals,
      updated_at: new Date().toISOString(),
    } as never, { onConflict: 'user_id' })
}

// ============================================================
// Signal Processing — The Learning Algorithm
// ============================================================

/**
 * Process a behavior signal and update the profile.
 * This is the core learning function — every user action feeds in here.
 */
export async function recordBehaviorSignal(
  userId: string,
  signal: BehaviorSignal
): Promise<void> {
  const profile = await getBehaviorProfile(userId)
  const now = new Date()
  const currentHour = now.getHours()
  const currentDay = now.getDay()

  switch (signal.type) {
    case 'session_start': {
      // Update session count
      profile.sessionCount++

      // Calculate gap since last session
      const lastUpdated = new Date(profile.updatedAt)
      const gapHours = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60)
      profile.avgSessionGapHours = ema(profile.avgSessionGapHours, gapHours, EMA_ALPHA)

      // Update active hours (boost current hour)
      profile.activeHours = updateActiveHours(profile.activeHours, currentHour)

      // Update active days
      if (!profile.activeDays.includes(currentDay)) {
        profile.activeDays.push(currentDay)
        profile.activeDays.sort()
      }

      // Streak tracking
      const daysSinceLastUpdate = gapHours / 24
      profile.daysSinceLastSession = 0
      if (daysSinceLastUpdate <= 1.5) {
        profile.currentStreak++
        profile.longestStreak = Math.max(profile.longestStreak, profile.currentStreak)
      } else {
        // Was the user previously inactive? Track reactivation
        if (daysSinceLastUpdate > CHURN_THRESHOLD_DAYS) {
          profile.reactivationCount++
          // User came back! Big value signal
          profile.valueSignals = addValueSignal(profile.valueSignals, 'reactivation')
        }
        profile.currentStreak = 1
      }

      // Boost engagement momentum
      profile.engagementMomentum = clampScore(
        profile.engagementMomentum + SESSION_MOMENTUM_BOOST
      )

      // Reduce churn risk
      profile.churnRisk = clampScore(profile.churnRisk * 0.7)
      break
    }

    case 'session_end': {
      // Learn session duration
      const durationMin = (signal.metadata?.durationMinutes as number) || 5
      profile.avgSessionDurationMinutes = ema(
        profile.avgSessionDurationMinutes, durationMin, EMA_ALPHA
      )
      break
    }

    case 'message_sent': {
      // Boost engagement momentum
      profile.engagementMomentum = clampScore(
        profile.engagementMomentum + SESSION_MOMENTUM_BOOST * 0.5
      )
      break
    }

    case 'agent_viewed': {
      const agentCategory = (signal.metadata?.category as string) || 'general'
      profile.topicScores[agentCategory] = clampScore(
        (profile.topicScores[agentCategory] || 0.5) + INSIGHT_ENGAGE_REWARD
      )
      profile.valueSignals = addValueSignal(profile.valueSignals, 'agent_results')
      break
    }

    case 'agent_created': {
      profile.engagementMomentum = clampScore(
        profile.engagementMomentum + SESSION_MOMENTUM_BOOST * 2
      )
      profile.churnRisk = clampScore(profile.churnRisk * 0.5) // big retention signal
      profile.valueSignals = addValueSignal(profile.valueSignals, 'agent_creation')
      break
    }

    case 'notification_tapped': {
      const notifType = (signal.metadata?.notificationType as string) || 'general'
      profile.notificationScores[notifType] = clampScore(
        (profile.notificationScores[notifType] || 0.5) + NOTIFICATION_TAP_REWARD
      )
      profile.notificationTapRate = ema(profile.notificationTapRate, 1, EMA_ALPHA)

      // Learn that this hour is good for notifications
      profile.activeHours = updateActiveHours(profile.activeHours, currentHour)

      // The content that brought them back is a value signal
      profile.valueSignals = addValueSignal(profile.valueSignals, `notif_${notifType}`)
      break
    }

    case 'notification_ignored': {
      const ignoredType = (signal.metadata?.notificationType as string) || 'general'
      profile.notificationScores[ignoredType] = clampScore(
        (profile.notificationScores[ignoredType] || 0.5) - NOTIFICATION_IGNORE_PENALTY
      )
      profile.notificationTapRate = ema(profile.notificationTapRate, 0, EMA_ALPHA)

      // If many ignores, maybe this hour is bad → learn quiet hours
      const consecutiveIgnores = (signal.metadata?.consecutiveIgnores as number) || 0
      if (consecutiveIgnores >= 3) {
        profile.quietHoursStart = profile.quietHoursStart ?? currentHour
        profile.quietHoursEnd = profile.quietHoursEnd ?? ((currentHour + 2) % 24)
      }
      break
    }

    case 'notification_dismissed': {
      const dismissedType = (signal.metadata?.notificationType as string) || 'general'
      // Dismissal is softer than ignore — user saw it but didn't find it valuable
      profile.notificationScores[dismissedType] = clampScore(
        (profile.notificationScores[dismissedType] || 0.5) - NOTIFICATION_IGNORE_PENALTY * 0.5
      )
      break
    }

    case 'insight_read': {
      const insightCategory = (signal.metadata?.category as string) || 'general'
      profile.topicScores[insightCategory] = clampScore(
        (profile.topicScores[insightCategory] || 0.5) + INSIGHT_ENGAGE_REWARD
      )
      profile.preferredUpdateTypes = updatePreferredTypes(
        profile.preferredUpdateTypes, insightCategory, true
      )
      break
    }

    case 'insight_ignored': {
      const ignoredCategory = (signal.metadata?.category as string) || 'general'
      profile.topicScores[ignoredCategory] = clampScore(
        (profile.topicScores[ignoredCategory] || 0.5) - INSIGHT_ENGAGE_REWARD * 0.5
      )
      profile.preferredUpdateTypes = updatePreferredTypes(
        profile.preferredUpdateTypes, ignoredCategory, false
      )
      break
    }

    case 'feature_used': {
      const feature = (signal.metadata?.feature as string) || 'unknown'
      profile.valueSignals = addValueSignal(profile.valueSignals, `feature_${feature}`)
      profile.engagementMomentum = clampScore(
        profile.engagementMomentum + SESSION_MOMENTUM_BOOST * 0.3
      )
      break
    }

    case 'agent_run_triggered': {
      profile.engagementMomentum = clampScore(
        profile.engagementMomentum + SESSION_MOMENTUM_BOOST
      )
      profile.valueSignals = addValueSignal(profile.valueSignals, 'manual_run')
      break
    }
  }

  // Update momentum trend
  profile.momentumTrend = computeMomentumTrend(profile)

  await saveBehaviorProfile(profile)
}

// ============================================================
// Notification Decision Engine
// ============================================================

/**
 * Score a potential notification and decide whether to send it.
 * This is the key algorithm for personalized, non-spammy notifications.
 *
 * Factors:
 *   1. Content relevance (does user care about this topic?)
 *   2. Timing (is now a good time for this user?)
 *   3. Frequency (have we sent too many today?)
 *   4. Engagement momentum (is user actively engaged or declining?)
 *   5. Notification fatigue (has user been ignoring recent notifs?)
 *   6. Priority (urgent overrides most factors)
 */
export async function scoreNotification(
  userId: string,
  notificationType: string,
  contentCategory: string,
  priority: 'urgent' | 'high' | 'normal' | 'low',
  agentName?: string
): Promise<NotificationDecision> {
  const profile = await getBehaviorProfile(userId)
  const now = new Date()
  const currentHour = now.getHours()

  // Urgent always sends immediately
  if (priority === 'urgent') {
    return {
      shouldSend: true,
      score: 1.0,
      reason: 'Urgent priority — always deliver',
      delayMinutes: 0,
    }
  }

  let score = 0.5 // start neutral

  // Factor 1: Content relevance — does this user care about this topic?
  const topicScore = profile.topicScores[contentCategory] ?? 0.5
  score += (topicScore - 0.5) * 0.3  // topic relevance contributes ±0.15

  // Factor 2: Notification type score — has user engaged with this type before?
  const typeScore = profile.notificationScores[notificationType] ?? 0.5
  score += (typeScore - 0.5) * 0.25  // type preference contributes ±0.125

  // Factor 3: Timing — is this a good hour for this user?
  const isActiveHour = profile.activeHours.includes(currentHour)
  if (!isActiveHour) {
    score -= 0.15 // penalize off-hours
  }

  // Factor 4: Quiet hours — hard block
  if (isInQuietHours(currentHour, profile.quietHoursStart, profile.quietHoursEnd)) {
    if (priority !== 'high') {
      return {
        shouldSend: false,
        score: 0,
        reason: 'User is in quiet hours',
        delayMinutes: minutesUntilEndOfQuietHours(currentHour, profile.quietHoursEnd),
      }
    }
    // High priority during quiet hours → delay to end of quiet hours
    return {
      shouldSend: true,
      score: 0.6,
      reason: 'High priority — delaying to end of quiet hours',
      delayMinutes: minutesUntilEndOfQuietHours(currentHour, profile.quietHoursEnd),
    }
  }

  // Factor 5: Daily notification cap
  const todayCount = await getNotificationCountToday(userId)
  if (todayCount >= profile.maxDailyNotifications) {
    if (priority === 'high') {
      score -= 0.1 // soft penalty for high priority
    } else {
      return {
        shouldSend: false,
        score: 0.1,
        reason: `Daily cap reached (${todayCount}/${profile.maxDailyNotifications})`,
        delayMinutes: minutesUntilMidnight(),
      }
    }
  }

  // Factor 6: Notification fatigue — if tap rate is low, send less
  if (profile.notificationTapRate < 0.2) {
    score -= 0.2  // user is ignoring notifications
  } else if (profile.notificationTapRate > 0.6) {
    score += 0.1  // user actively engages with notifications
  }

  // Factor 7: Engagement momentum
  if (profile.momentumTrend === 'declining') {
    // User is disengaging — be more selective, only send high-value content
    score -= 0.1
  } else if (profile.momentumTrend === 'rising') {
    // User is increasingly active — they're receptive
    score += 0.05
  }

  // Factor 8: Churn risk — strategic notifications for at-risk users
  if (profile.churnRisk > 0.6) {
    // High churn risk — only send if content is genuinely valuable
    if (priority === 'low' || priority === 'normal') {
      return {
        shouldSend: false,
        score: 0.1,
        reason: 'High churn risk — avoiding low-value notifications',
        delayMinutes: 0,
      }
    }
    // For high priority, boost slightly (re-engagement opportunity)
    score += 0.05
  }

  // Priority adjustments
  if (priority === 'high') score += 0.15
  if (priority === 'low') score -= 0.15

  // Clamp final score
  score = Math.max(0, Math.min(1, score))

  // Decision threshold
  const threshold = profile.notificationTapRate > 0.4 ? 0.35 : 0.45
  const shouldSend = score >= threshold

  // Delay logic: lower scores get delayed more
  let delayMinutes = 0
  if (shouldSend && score < 0.5) {
    delayMinutes = Math.round((0.5 - score) * 60) // up to 30 min delay for borderline
  }

  return {
    shouldSend,
    score,
    reason: shouldSend
      ? `Score ${score.toFixed(2)} above threshold ${threshold} — sending${delayMinutes > 0 ? ` (delayed ${delayMinutes}m)` : ''}`
      : `Score ${score.toFixed(2)} below threshold ${threshold} — suppressing`,
    delayMinutes,
  }
}

// ============================================================
// Daily Decay — Run Once Per Day (cron)
// ============================================================

/**
 * Apply daily decay to all behavior profiles.
 * Ensures stale data fades and scores don't get stuck.
 * Call this from a daily cron job.
 */
export async function applyDailyDecay(userId: string): Promise<void> {
  const profile = await getBehaviorProfile(userId)

  // Decay topic scores toward neutral (0.5)
  for (const key of Object.keys(profile.topicScores)) {
    profile.topicScores[key] = decayToward(profile.topicScores[key], 0.5, DECAY_RATE)
  }

  // Decay notification scores toward neutral
  for (const key of Object.keys(profile.notificationScores)) {
    profile.notificationScores[key] = decayToward(
      profile.notificationScores[key], 0.5, DECAY_RATE
    )
  }

  // Increment days since last session (will be reset on next session_start)
  const lastUpdated = new Date(profile.updatedAt)
  const daysSince = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24)
  profile.daysSinceLastSession = Math.round(daysSince)

  // Decay engagement momentum if no recent sessions
  if (profile.daysSinceLastSession > 1) {
    profile.engagementMomentum = clampScore(
      profile.engagementMomentum - INACTIVITY_MOMENTUM_DECAY * profile.daysSinceLastSession
    )
  }

  // Update churn risk based on inactivity
  if (profile.daysSinceLastSession > CHURN_THRESHOLD_DAYS) {
    const riskIncrease = Math.min(
      0.1,
      (profile.daysSinceLastSession - CHURN_THRESHOLD_DAYS) * 0.02
    )
    profile.churnRisk = clampScore(profile.churnRisk + riskIncrease)
  }

  // Adapt max daily notifications based on tap rate
  if (profile.notificationTapRate < 0.15) {
    profile.maxDailyNotifications = Math.max(1, profile.maxDailyNotifications - 1)
  } else if (profile.notificationTapRate > 0.6 && profile.maxDailyNotifications < 8) {
    profile.maxDailyNotifications++
  }

  // Update momentum trend
  profile.momentumTrend = computeMomentumTrend(profile)

  await saveBehaviorProfile(profile)
}

// ============================================================
// Retention Analysis
// ============================================================

/**
 * Get a retention-focused summary for the AI Manager.
 * Helps the AI Manager know how to treat this user.
 */
export function getRetentionContext(profile: BehaviorProfile): string {
  const parts: string[] = []

  // Engagement state
  if (profile.engagementMomentum > 0.7) {
    parts.push('User is highly engaged right now — keep delivering value.')
  } else if (profile.engagementMomentum > 0.4) {
    parts.push('User engagement is moderate — be helpful but not pushy.')
  } else {
    parts.push('User engagement is low — make every interaction count. Focus on value.')
  }

  // Streak
  if (profile.currentStreak >= 7) {
    parts.push(`Amazing ${profile.currentStreak}-day streak! Acknowledge it naturally if it fits.`)
  } else if (profile.currentStreak >= 3) {
    parts.push(`${profile.currentStreak}-day streak going.`)
  }

  // Churn risk
  if (profile.churnRisk > 0.6) {
    parts.push('⚠️ User may be disengaging. Show genuine value. Don\'t overwhelm with updates.')
  }

  // Preferred topics
  const topTopics = Object.entries(profile.topicScores)
    .filter(([, score]) => score > 0.6)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([topic]) => topic)

  if (topTopics.length > 0) {
    parts.push(`User cares most about: ${topTopics.join(', ')}.`)
  }

  // Notification preference
  if (profile.notificationTapRate < 0.2) {
    parts.push('User rarely taps notifications — keep in-app updates minimal and high-value only.')
  }

  // Reactivation
  if (profile.daysSinceLastSession > 3 && profile.reactivationCount > 0) {
    parts.push(`User has come back ${profile.reactivationCount} time(s) before after going quiet. They may return.`)
  }

  return parts.length > 0
    ? `\n### User Engagement Context\n${parts.join('\n')}`
    : ''
}

// ============================================================
// Helpers
// ============================================================

/** Exponential Moving Average */
function ema(current: number, newValue: number, alpha: number): number {
  return current * (1 - alpha) + newValue * alpha
}

/** Clamp score between MIN_SCORE and MAX_SCORE */
function clampScore(score: number): number {
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, score))
}

/** Decay a value toward a target by a rate */
function decayToward(current: number, target: number, rate: number): number {
  return current + (target - current) * rate
}

/** Update active hours — keep top 6 hours, boost the current one */
function updateActiveHours(current: number[], hour: number): number[] {
  // Simple frequency-based approach: add hour, dedupe, keep top 6 by frequency
  const hourCounts = new Map<number, number>()
  for (const h of current) {
    hourCounts.set(h, (hourCounts.get(h) || 0) + 1)
  }
  hourCounts.set(hour, (hourCounts.get(hour) || 0) + 2) // boost current hour

  return Array.from(hourCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([h]) => h)
    .sort((a, b) => a - b)
}

/** Add a value signal, keeping max 10, most recent first */
function addValueSignal(signals: string[], signal: string): string[] {
  const filtered = signals.filter(s => s !== signal)
  return [signal, ...filtered].slice(0, 10)
}

/** Update preferred update types based on engagement */
function updatePreferredTypes(
  current: string[],
  type: string,
  engaged: boolean
): string[] {
  if (engaged) {
    // Move to front
    const filtered = current.filter(t => t !== type)
    return [type, ...filtered].slice(0, 8)
  } else {
    // Move to back
    const filtered = current.filter(t => t !== type)
    return [...filtered, type].slice(0, 8)
  }
}

/** Check if current hour is in quiet hours */
function isInQuietHours(
  currentHour: number,
  start: number | null,
  end: number | null
): boolean {
  if (start === null || end === null) return false
  if (start < end) {
    return currentHour >= start && currentHour < end
  }
  // Wraps around midnight (e.g., 22-7)
  return currentHour >= start || currentHour < end
}

/** Minutes until end of quiet hours */
function minutesUntilEndOfQuietHours(
  currentHour: number,
  end: number | null
): number {
  if (end === null) return 0
  const hoursUntil = end > currentHour
    ? end - currentHour
    : 24 - currentHour + end
  return hoursUntil * 60
}

/** Minutes until midnight */
function minutesUntilMidnight(): number {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  return Math.round((midnight.getTime() - now.getTime()) / 60000)
}

/** Compute momentum trend from profile state */
function computeMomentumTrend(
  profile: BehaviorProfile
): BehaviorProfile['momentumTrend'] {
  if (profile.engagementMomentum > 0.65) return 'rising'
  if (profile.engagementMomentum < 0.35) return 'declining'
  return 'stable'
}

/** Get count of notifications sent today for this user */
async function getNotificationCountToday(userId: string): Promise<number> {
  const supabase = await createClient()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { count } = await supabase
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'sent')
    .gte('created_at', todayStart.toISOString())

  return count || 0
}
