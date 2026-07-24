/**
 * Feedback Keywords System
 * 
 * Detects keywords in user messages that indicate outreach preferences:
 * - "too many messages" → decrease frequency
 * - "check in more often" → increase frequency
 * - "stop notifications" → pause outreach
 * - "love the updates" → positive signal
 * 
 * No UI controls needed - learns from natural conversation.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { recordOutreachEvent } from './adaptive-outreach'

export interface FeedbackSignal {
  type: 'increase_frequency' | 'decrease_frequency' | 'pause_outreach' | 'positive' | 'negative'
  confidence: number
  matchedKeywords: string[]
}

// Keywords that indicate user wants LESS outreach
const DECREASE_KEYWORDS = [
  'too many messages',
  'too much',
  'stop messaging',
  'too often',
  'less often',
  'fewer updates',
  'fewer messages',
  'not so often',
  'back off',
  'give me space',
  'overwhelming',
  'spammy',
  'spam',
  'annoying',
  'stop checking in',
  'leave me alone',
  'too frequent',
]

// Keywords that indicate user wants MORE outreach
const INCREASE_KEYWORDS = [
  'check in more',
  'more updates',
  'keep me posted',
  'update me more',
  'more often',
  'don\'t forget',
  'remind me',
  'stay in touch',
  'keep me in the loop',
  'more frequent',
  'check on me',
]

// Keywords that indicate PAUSE all outreach
const PAUSE_KEYWORDS = [
  'stop all',
  'no more messages',
  'unsubscribe',
  'stop notifications',
  'mute',
  'silence',
  'pause notifications',
  'don\'t contact',
  'stop reaching out',
]

// Keywords that indicate POSITIVE feedback
const POSITIVE_KEYWORDS = [
  'love the updates',
  'thanks for checking',
  'appreciate',
  'helpful',
  'great timing',
  'perfect',
  'love it',
  'keep it up',
  'good job',
  'well done',
  'exactly what i needed',
  'just right',
]

// Keywords that indicate NEGATIVE feedback (but not necessarily frequency)
const NEGATIVE_KEYWORDS = [
  'not helpful',
  'useless',
  'waste of time',
  'don\'t care',
  'irrelevant',
  'not interested',
  'wrong time',
  'bad timing',
]

/**
 * Detect feedback signals in user message
 */
export function detectFeedbackSignal(message: string): FeedbackSignal | null {
  const lowerMessage = message.toLowerCase()
  
  // Check for pause keywords first (highest priority)
  const pauseMatches = PAUSE_KEYWORDS.filter(kw => lowerMessage.includes(kw))
  if (pauseMatches.length > 0) {
    return {
      type: 'pause_outreach',
      confidence: Math.min(1, 0.7 + pauseMatches.length * 0.1),
      matchedKeywords: pauseMatches,
    }
  }
  
  // Check for decrease keywords
  const decreaseMatches = DECREASE_KEYWORDS.filter(kw => lowerMessage.includes(kw))
  if (decreaseMatches.length > 0) {
    return {
      type: 'decrease_frequency',
      confidence: Math.min(1, 0.5 + decreaseMatches.length * 0.15),
      matchedKeywords: decreaseMatches,
    }
  }
  
  // Check for increase keywords
  const increaseMatches = INCREASE_KEYWORDS.filter(kw => lowerMessage.includes(kw))
  if (increaseMatches.length > 0) {
    return {
      type: 'increase_frequency',
      confidence: Math.min(1, 0.5 + increaseMatches.length * 0.15),
      matchedKeywords: increaseMatches,
    }
  }
  
  // Check for positive feedback
  const positiveMatches = POSITIVE_KEYWORDS.filter(kw => lowerMessage.includes(kw))
  if (positiveMatches.length > 0) {
    return {
      type: 'positive',
      confidence: Math.min(1, 0.4 + positiveMatches.length * 0.2),
      matchedKeywords: positiveMatches,
    }
  }
  
  // Check for negative feedback
  const negativeMatches = NEGATIVE_KEYWORDS.filter(kw => lowerMessage.includes(kw))
  if (negativeMatches.length > 0) {
    return {
      type: 'negative',
      confidence: Math.min(1, 0.4 + negativeMatches.length * 0.2),
      matchedKeywords: negativeMatches,
    }
  }
  
  return null
}

/**
 * Process feedback and update user preferences
 */
export async function processFeedbackSignal(
  userId: string,
  signal: FeedbackSignal
): Promise<{ applied: boolean; newFrequencyHours?: number; message?: string }> {
  const supabase = createAdminClient()
  
  // Get current metrics
  const { data: metrics } = await supabase
    .from('user_outreach_metrics')
    .select('optimal_frequency_hours, engagement_score')
    .eq('user_id', userId)
    .single()
  
  const current = metrics as { optimal_frequency_hours: number; engagement_score: number } | null
  const currentFrequency = current?.optimal_frequency_hours || 48
  
  let newFrequency: number
  let message: string
  
  switch (signal.type) {
    case 'pause_outreach':
      // Set very long frequency (effectively paused)
      newFrequency = 720 // 30 days
      message = "Got it, I'll give you more space. Let me know when you'd like me to check in again."
      break
      
    case 'decrease_frequency':
      // Double the current frequency (less often)
      newFrequency = Math.min(336, currentFrequency * 2) // Max 2 weeks
      message = `Understood, I'll reach out less often. I'll check in about every ${Math.round(newFrequency / 24)} days instead.`
      break
      
    case 'increase_frequency':
      // Halve the current frequency (more often)
      newFrequency = Math.max(12, currentFrequency / 2) // Min 12 hours
      message = `Sure thing! I'll check in more frequently - about every ${newFrequency < 24 ? `${Math.round(newFrequency)} hours` : `${Math.round(newFrequency / 24)} day${newFrequency >= 48 ? 's' : ''}`}.`
      break
      
    case 'positive':
      // Slight decrease in frequency (they like current rate)
      newFrequency = Math.max(12, currentFrequency * 0.9)
      message = "Glad the updates are helpful! I'll keep it up."
      // Also boost engagement score
      await supabase
        .from('user_outreach_metrics')
        .upsert({
          user_id: userId,
          engagement_score: Math.min(1, (current?.engagement_score || 0.5) + 0.1),
          updated_at: new Date().toISOString(),
        } as never, { onConflict: 'user_id' })
      break
      
    case 'negative':
      // Slight increase in frequency (being less pushy)
      newFrequency = Math.min(168, currentFrequency * 1.3)
      message = "I hear you. I'll adjust my approach."
      // Also reduce engagement score slightly
      await supabase
        .from('user_outreach_metrics')
        .upsert({
          user_id: userId,
          engagement_score: Math.max(0, (current?.engagement_score || 0.5) - 0.05),
          updated_at: new Date().toISOString(),
        } as never, { onConflict: 'user_id' })
      break
      
    default:
      return { applied: false }
  }
  
  // Update frequency
  await supabase
    .from('user_outreach_metrics')
    .upsert({
      user_id: userId,
      optimal_frequency_hours: newFrequency,
      updated_at: new Date().toISOString(),
    } as never, { onConflict: 'user_id' })
  
  // Log the feedback event
  await supabase
    .from('outreach_events')
    .insert({
      outreach_id: `feedback_${Date.now()}`,
      user_id: userId,
      event_type: 'action_taken',
      outreach_type: 'feedback',
      metadata: {
        signal_type: signal.type,
        confidence: signal.confidence,
        keywords: signal.matchedKeywords,
        old_frequency: currentFrequency,
        new_frequency: newFrequency,
      },
      created_at: new Date().toISOString(),
    } as never)
  
  return { applied: true, newFrequencyHours: newFrequency, message }
}

/**
 * Check message for feedback and process it
 * Returns a response message if feedback was detected
 */
export async function checkAndProcessFeedback(
  userId: string,
  message: string
): Promise<string | null> {
  const signal = detectFeedbackSignal(message)
  
  if (!signal || signal.confidence < 0.5) {
    return null
  }
  
  const result = await processFeedbackSignal(userId, signal)
  
  if (result.applied && result.message) {
    return result.message
  }
  
  return null
}
