/**
 * Emotion-Aware Interaction System
 * 
 * Detects user emotional state from interactions and adapts agent
 * communication style accordingly for better user experience.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createNonStreamingMessageWithFallback, DEFAULT_MODEL, extractTextFromResponse } from '@/lib/ai/ai-client'

export interface UserEmotionalState {
  user_id: string
  detected_mood: 'positive' | 'neutral' | 'frustrated' | 'stressed' | 'urgent'
  confidence: number
  indicators: {
    message_tone?: string
    response_time_ms?: number
    word_choices?: string[]
    punctuation_style?: string
    message_length?: string
  }
  mood_history: Array<{
    mood: string
    timestamp: string
  }>
  recommended_tone: 'empathetic' | 'professional' | 'encouraging' | 'direct'
  recommended_detail_level: 'brief' | 'moderate' | 'detailed'
  updated_at: string
}

/**
 * Analyze a message to detect emotional state
 */
export async function analyzeEmotionalState(
  userId: string,
  message: string,
  responseTimeMs?: number
): Promise<UserEmotionalState> {
  const supabase = createAdminClient()

  // Get current state
  const { data: existing } = await supabase
    .from('user_emotional_state')
    .select('*')
    .eq('user_id', userId)
    .single()

  const currentState = existing as UserEmotionalState | null

  // Quick heuristic analysis
  const quickAnalysis = analyzeMessageQuickly(message, responseTimeMs)

  // If significant change detected, do deeper analysis
  let mood = quickAnalysis.mood
  let confidence = quickAnalysis.confidence

  if (quickAnalysis.needsDeeperAnalysis) {
    const deepAnalysis = await analyzeMessageDeeply(message)
    mood = deepAnalysis.mood
    confidence = deepAnalysis.confidence
  }

  // Determine recommended response style
  const { tone, detailLevel } = getRecommendedStyle(mood, currentState?.mood_history || [])

  // Update mood history
  const moodHistory = currentState?.mood_history || []
  moodHistory.unshift({ mood, timestamp: new Date().toISOString() })
  if (moodHistory.length > 10) moodHistory.pop()

  // Save state
  const newState: Omit<UserEmotionalState, 'updated_at'> = {
    user_id: userId,
    detected_mood: mood,
    confidence,
    indicators: {
      message_tone: quickAnalysis.tone,
      response_time_ms: responseTimeMs,
      word_choices: quickAnalysis.significantWords,
      punctuation_style: quickAnalysis.punctuationStyle,
      message_length: message.length < 50 ? 'short' : message.length < 200 ? 'medium' : 'long',
    },
    mood_history: moodHistory,
    recommended_tone: tone,
    recommended_detail_level: detailLevel,
  }

  await supabase
    .from('user_emotional_state')
    .upsert({
      ...newState,
      updated_at: new Date().toISOString(),
    } as never, {
      onConflict: 'user_id',
    })

  return { ...newState, updated_at: new Date().toISOString() }
}

/**
 * Quick heuristic analysis of message
 */
function analyzeMessageQuickly(message: string, responseTimeMs?: number): {
  mood: UserEmotionalState['detected_mood']
  confidence: number
  tone: string
  significantWords: string[]
  punctuationStyle: string
  needsDeeperAnalysis: boolean
} {
  const lower = message.toLowerCase()

  // Check for urgency indicators
  const urgentWords = ['urgent', 'asap', 'immediately', 'now', 'emergency', 'critical', 'deadline']
  const hasUrgency = urgentWords.some(w => lower.includes(w))

  // Check for frustration indicators
  const frustrationWords = ['not working', 'broken', 'wrong', 'failed', 'again', 'still', 'why isn\'t', 'doesn\'t work']
  const hasFrustration = frustrationWords.some(w => lower.includes(w))

  // Check for positive indicators
  const positiveWords = ['thanks', 'great', 'perfect', 'awesome', 'love', 'excellent', 'amazing']
  const hasPositive = positiveWords.some(w => lower.includes(w))

  // Check punctuation
  const exclamationCount = (message.match(/!/g) || []).length
  const questionCount = (message.match(/\?/g) || []).length
  const capsRatio = (message.match(/[A-Z]/g) || []).length / message.length

  // Determine punctuation style
  let punctuationStyle = 'normal'
  if (exclamationCount > 2 || capsRatio > 0.5) punctuationStyle = 'emphatic'
  if (questionCount > 2) punctuationStyle = 'inquisitive'

  // Determine mood
  let mood: UserEmotionalState['detected_mood'] = 'neutral'
  let confidence = 0.5

  if (hasUrgency && (exclamationCount > 0 || capsRatio > 0.3)) {
    mood = 'urgent'
    confidence = 0.8
  } else if (hasFrustration) {
    mood = 'frustrated'
    confidence = 0.7
  } else if (hasPositive) {
    mood = 'positive'
    confidence = 0.7
  }

  // Very short responses with delays might indicate stress
  if (responseTimeMs && responseTimeMs > 60000 && message.length < 30) {
    mood = mood === 'neutral' ? 'stressed' : mood
    confidence = Math.max(confidence, 0.6)
  }

  const significantWords = [
    ...urgentWords.filter(w => lower.includes(w)),
    ...frustrationWords.filter(w => lower.includes(w)),
    ...positiveWords.filter(w => lower.includes(w)),
  ]

  return {
    mood,
    confidence,
    tone: hasFrustration ? 'negative' : hasPositive ? 'positive' : 'neutral',
    significantWords,
    punctuationStyle,
    needsDeeperAnalysis: confidence < 0.6 && message.length > 50,
  }
}

/**
 * Deep analysis using LLM
 */
async function analyzeMessageDeeply(message: string): Promise<{
  mood: UserEmotionalState['detected_mood']
  confidence: number
}> {
  try {
    const { response } = await createNonStreamingMessageWithFallback({
      model: DEFAULT_MODEL,
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `Analyze the emotional state of this message. Respond with ONLY a JSON object.

Message: "${message.slice(0, 500)}"

{
  "mood": "positive|neutral|frustrated|stressed|urgent",
  "confidence": 0.0-1.0
}`
      }],
    })

    const text = extractTextFromResponse(response)

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        mood: parsed.mood || 'neutral',
        confidence: parsed.confidence || 0.5,
      }
    }
  } catch (error) {
    console.error('[EmotionAware] Deep analysis error:', error)
  }

  return { mood: 'neutral', confidence: 0.5 }
}

/**
 * Get recommended response style based on mood
 */
function getRecommendedStyle(
  currentMood: UserEmotionalState['detected_mood'],
  moodHistory: Array<{ mood: string }>
): {
  tone: UserEmotionalState['recommended_tone']
  detailLevel: UserEmotionalState['recommended_detail_level']
} {
  // Check for persistent frustration
  const recentFrustration = moodHistory
    .slice(0, 3)
    .filter(h => h.mood === 'frustrated' || h.mood === 'stressed')
    .length

  if (currentMood === 'frustrated' || recentFrustration >= 2) {
    return {
      tone: 'empathetic',
      detailLevel: 'moderate', // Not too brief (dismissive) or too long (overwhelming)
    }
  }

  if (currentMood === 'urgent' || currentMood === 'stressed') {
    return {
      tone: 'direct',
      detailLevel: 'brief', // Get to the point quickly
    }
  }

  if (currentMood === 'positive') {
    return {
      tone: 'encouraging',
      detailLevel: 'moderate',
    }
  }

  return {
    tone: 'professional',
    detailLevel: 'moderate',
  }
}

/**
 * Get current emotional state for a user
 */
export async function getEmotionalState(userId: string): Promise<UserEmotionalState | null> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('user_emotional_state')
    .select('*')
    .eq('user_id', userId)
    .single()

  return data as UserEmotionalState | null
}

/**
 * Generate tone instructions for agent prompt
 */
export function generateToneInstructions(state: UserEmotionalState): string {
  let instructions = '\n## Communication Style Guidance\n\n'

  switch (state.recommended_tone) {
    case 'empathetic':
      instructions += `The user seems ${state.detected_mood}. Please be extra patient and understanding.
- Acknowledge any difficulties they're experiencing
- Offer clear, step-by-step guidance
- Reassure them that issues can be resolved
- Avoid technical jargon unless necessary\n`
      break

    case 'direct':
      instructions += `The user needs quick results. Be concise and action-oriented.
- Lead with the most important information
- Skip lengthy explanations unless asked
- Provide clear, actionable next steps
- Confirm completion immediately\n`
      break

    case 'encouraging':
      instructions += `The user is in a positive state. Match their energy.
- Be friendly and conversational
- Celebrate successes together
- Suggest next steps proactively
- Keep the momentum going\n`
      break

    default:
      instructions += `Maintain a professional, helpful tone.
- Be clear and thorough
- Anticipate follow-up questions
- Provide context where helpful\n`
  }

  switch (state.recommended_detail_level) {
    case 'brief':
      instructions += '\n**Detail Level:** Keep responses concise. Bullet points preferred over paragraphs.\n'
      break
    case 'detailed':
      instructions += '\n**Detail Level:** Provide comprehensive explanations with context and examples.\n'
      break
    default:
      instructions += '\n**Detail Level:** Balance conciseness with helpfulness.\n'
  }

  return instructions
}

/**
 * Adapt message based on emotional state
 */
export async function adaptMessageToEmotionalState(
  message: string,
  state: UserEmotionalState
): Promise<string> {
  // For frustrated users, add acknowledgment
  if (state.detected_mood === 'frustrated') {
    if (!message.toLowerCase().includes('understand') && !message.toLowerCase().includes('sorry')) {
      return `I understand this has been frustrating. ${message}`
    }
  }

  // For urgent requests, remove filler words
  if (state.detected_mood === 'urgent') {
    return message
      .replace(/I'd be happy to /gi, '')
      .replace(/Let me /gi, '')
      .replace(/I'll go ahead and /gi, '')
  }

  return message
}

/**
 * Check if we should proactively check in on user
 */
export async function shouldCheckIn(userId: string): Promise<{
  shouldCheckIn: boolean
  reason?: string
  suggestedMessage?: string
}> {
  const state = await getEmotionalState(userId)
  if (!state) return { shouldCheckIn: false }

  // Check for prolonged frustration
  const frustratedCount = state.mood_history
    .slice(0, 5)
    .filter(h => h.mood === 'frustrated' || h.mood === 'stressed')
    .length

  if (frustratedCount >= 3) {
    return {
      shouldCheckIn: true,
      reason: 'User has shown signs of frustration in recent interactions',
      suggestedMessage: "I noticed things haven't been going smoothly. Is there anything specific I can help with or clarify?",
    }
  }

  // Check for sudden mood drop
  if (state.mood_history.length >= 2) {
    const previousMood = state.mood_history[1]?.mood
    if (previousMood === 'positive' && (state.detected_mood === 'frustrated' || state.detected_mood === 'stressed')) {
      return {
        shouldCheckIn: true,
        reason: 'User mood has dropped significantly',
        suggestedMessage: "It seems something might have gone wrong. How can I help make this right?",
      }
    }
  }

  return { shouldCheckIn: false }
}
