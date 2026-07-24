/**
 * User Personalization Profile
 * 
 * Tracks everything about the user to enable genuine personalization:
 * - Communication preferences (formal/casual, detail level)
 * - Personal facts (timezone, work schedule, interests)
 * - Emotional context (mood patterns, stress indicators)
 * - Relationship stage (new user → trusted partner)
 * 
 * Goal: AI Manager that genuinely knows and cares about the user
 */

import { createClient } from '@/lib/supabase/server'

export interface UserPersonalization {
  userId: string
  
  // Basic info
  preferredName: string | null
  timezone: string | null
  workSchedule: WorkSchedule | null
  
  // Communication style
  communicationStyle: 'formal' | 'casual' | 'friendly' | 'professional'
  preferredDetailLevel: 'brief' | 'moderate' | 'detailed'
  usesEmoji: boolean
  
  // Personal context
  interests: string[]
  goals: string[]
  challenges: string[]
  industryOrRole: string | null
  
  // Relationship tracking
  relationshipStage: 'new' | 'building' | 'established' | 'trusted'
  totalInteractions: number
  lastInteraction: string | null
  positiveInteractions: number
  
  // Behavioral patterns
  typicalResponseTime: number | null // minutes
  preferredContactTimes: string[] // e.g., ["morning", "afternoon"]
  stressIndicators: string[]
  
  // What we've learned
  learnedFacts: LearnedFact[]
  pendingQuestions: string[] // Questions we want to ask
  
  createdAt: string
  updatedAt: string
}

export interface WorkSchedule {
  workDays: number[] // 0-6
  workStartHour: number
  workEndHour: number
  timezone: string
}

export interface LearnedFact {
  fact: string
  category: 'personal' | 'work' | 'preference' | 'goal' | 'challenge'
  confidence: number
  source: string // How we learned it
  learnedAt: string
}

// Questions to ask users to build relationship (by stage)
const RELATIONSHIP_QUESTIONS = {
  new: [
    "By the way, what should I call you?",
    "What's your main goal for using 2Hands?",
    "What kind of work do you do?",
    "Is there anything specific you'd like me to help you with regularly?",
  ],
  building: [
    "How's your week going so far?",
    "I noticed you've been working on [X] a lot - is that a big project?",
    "Is there anything I could do differently to be more helpful?",
    "What's taking up most of your time lately?",
  ],
  established: [
    "How did [recent project/task] go?",
    "Anything exciting coming up this week?",
    "I remember you mentioned [X] - how's that going?",
    "What's the biggest challenge you're facing right now?",
  ],
  trusted: [
    "How are you feeling about work lately?",
    "What would make your life easier right now?",
    "Is there anything on your mind I can help think through?",
    "What are you most excited about these days?",
  ],
}

/**
 * Get or create user personalization profile scoped to a workspace
 */
export async function getUserPersonalization(userId: string, workspaceId: string): Promise<UserPersonalization> {
  const supabase = await createClient()
  
  interface ProfileRow {
    user_id: string
    workspace_id: string
    preferred_name: string | null
    timezone: string | null
    work_schedule: WorkSchedule | null
    communication_style: string
    preferred_detail_level: string
    uses_emoji: boolean
    interests: string[]
    goals: string[]
    challenges: string[]
    industry_or_role: string | null
    relationship_stage: string
    total_interactions: number
    last_interaction: string | null
    positive_interactions: number
    typical_response_time: number | null
    preferred_contact_times: string[]
    stress_indicators: string[]
    learned_facts: LearnedFact[]
    pending_questions: string[]
    created_at: string
    updated_at: string
  }
  
  const { data, error } = await supabase
    .from('user_personalization')
    .select('*')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .single()
  
  if (error || !data) {
    // Create default profile for this workspace (fresh start)
    const defaultProfile = createDefaultProfile(userId)
    
    try {
      await supabase
        .from('user_personalization')
        .upsert({ ...profileToRow(defaultProfile), workspace_id: workspaceId } as never)
    } catch {
      // Ignore if workspace_id column not yet present (pre-migration)
    }
    
    return defaultProfile
  }
  
  const row = data as ProfileRow
  
  return {
    userId: row.user_id,
    preferredName: row.preferred_name,
    timezone: row.timezone,
    workSchedule: row.work_schedule,
    communicationStyle: row.communication_style as UserPersonalization['communicationStyle'],
    preferredDetailLevel: row.preferred_detail_level as UserPersonalization['preferredDetailLevel'],
    usesEmoji: row.uses_emoji,
    interests: row.interests || [],
    goals: row.goals || [],
    challenges: row.challenges || [],
    industryOrRole: row.industry_or_role,
    relationshipStage: row.relationship_stage as UserPersonalization['relationshipStage'],
    totalInteractions: row.total_interactions,
    lastInteraction: row.last_interaction,
    positiveInteractions: row.positive_interactions,
    typicalResponseTime: row.typical_response_time,
    preferredContactTimes: row.preferred_contact_times || [],
    stressIndicators: row.stress_indicators || [],
    learnedFacts: row.learned_facts || [],
    pendingQuestions: row.pending_questions || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function createDefaultProfile(userId: string): UserPersonalization {
  return {
    userId,
    preferredName: null,
    timezone: null,
    workSchedule: null,
    communicationStyle: 'friendly',
    preferredDetailLevel: 'moderate',
    usesEmoji: false,
    interests: [],
    goals: [],
    challenges: [],
    industryOrRole: null,
    relationshipStage: 'new',
    totalInteractions: 0,
    lastInteraction: null,
    positiveInteractions: 0,
    typicalResponseTime: null,
    preferredContactTimes: [],
    stressIndicators: [],
    learnedFacts: [],
    pendingQuestions: RELATIONSHIP_QUESTIONS.new.slice(0, 2),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function profileToRow(profile: UserPersonalization) {
  return {
    user_id: profile.userId,
    preferred_name: profile.preferredName,
    timezone: profile.timezone,
    work_schedule: profile.workSchedule,
    communication_style: profile.communicationStyle,
    preferred_detail_level: profile.preferredDetailLevel,
    uses_emoji: profile.usesEmoji,
    interests: profile.interests,
    goals: profile.goals,
    challenges: profile.challenges,
    industry_or_role: profile.industryOrRole,
    relationship_stage: profile.relationshipStage,
    total_interactions: profile.totalInteractions,
    last_interaction: profile.lastInteraction,
    positive_interactions: profile.positiveInteractions,
    typical_response_time: profile.typicalResponseTime,
    preferred_contact_times: profile.preferredContactTimes,
    stress_indicators: profile.stressIndicators,
    learned_facts: profile.learnedFacts,
    pending_questions: profile.pendingQuestions,
    updated_at: new Date().toISOString(),
  }
}

/**
 * Update personalization after an interaction, scoped to a workspace
 */
export async function updatePersonalization(
  userId: string,
  workspaceId: string,
  updates: Partial<UserPersonalization>
): Promise<void> {
  const supabase = await createClient()
  
  const current = await getUserPersonalization(userId, workspaceId)
  const updated = { ...current, ...updates, updatedAt: new Date().toISOString() }
  
  // Update relationship stage based on interactions
  if (updated.totalInteractions >= 50 && updated.positiveInteractions >= 40) {
    updated.relationshipStage = 'trusted'
  } else if (updated.totalInteractions >= 20 && updated.positiveInteractions >= 15) {
    updated.relationshipStage = 'established'
  } else if (updated.totalInteractions >= 5) {
    updated.relationshipStage = 'building'
  }
  
  await supabase
    .from('user_personalization')
    .upsert({ ...profileToRow(updated), workspace_id: workspaceId } as never)
}

/**
 * Learn a fact about the user scoped to a workspace
 */
export async function learnFactAboutUser(
  userId: string,
  workspaceId: string,
  fact: string,
  category: LearnedFact['category'],
  source: string
): Promise<void> {
  const profile = await getUserPersonalization(userId, workspaceId)
  
  // Check if we already know this
  const alreadyKnown = profile.learnedFacts.some(
    f => f.fact.toLowerCase() === fact.toLowerCase()
  )
  
  if (alreadyKnown) return
  
  const newFact: LearnedFact = {
    fact,
    category,
    confidence: 0.8,
    source,
    learnedAt: new Date().toISOString(),
  }
  
  await updatePersonalization(userId, workspaceId, {
    learnedFacts: [...profile.learnedFacts, newFact],
  })
}

/**
 * Get a question to ask the user (relationship building)
 */
export function getRelationshipQuestion(profile: UserPersonalization): string | null {
  // Don't ask too often
  if (profile.pendingQuestions.length === 0) {
    // Refill from appropriate stage
    const questions = RELATIONSHIP_QUESTIONS[profile.relationshipStage]
    const unusedQuestions = questions.filter(q => 
      !profile.learnedFacts.some(f => f.source.includes(q.slice(0, 20)))
    )
    return unusedQuestions[Math.floor(Math.random() * unusedQuestions.length)] || null
  }
  
  return profile.pendingQuestions[0]
}

/**
 * Mark a question as asked
 */
export async function markQuestionAsked(userId: string, workspaceId: string, question: string): Promise<void> {
  const profile = await getUserPersonalization(userId, workspaceId)
  
  await updatePersonalization(userId, workspaceId, {
    pendingQuestions: profile.pendingQuestions.filter(q => q !== question),
  })
}

/**
 * Format personalization context for AI Manager prompt
 */
export function formatPersonalizationForPrompt(profile: UserPersonalization): string {
  const parts: string[] = []
  
  parts.push('=== USER PERSONALIZATION ===')
  
  // Name and basics
  if (profile.preferredName) {
    parts.push(`- Call them: ${profile.preferredName}`)
  }
  
  if (profile.industryOrRole) {
    parts.push(`- Role/Industry: ${profile.industryOrRole}`)
  }
  
  // Communication style
  parts.push(`- Communication style: ${profile.communicationStyle}`)
  parts.push(`- Detail level: ${profile.preferredDetailLevel}`)
  if (profile.usesEmoji) {
    parts.push(`- Uses emojis in messages`)
  }
  
  // Relationship stage
  parts.push(`- Relationship: ${profile.relationshipStage} (${profile.totalInteractions} interactions)`)
  
  // Goals and challenges
  if (profile.goals.length > 0) {
    parts.push(`- Their goals: ${profile.goals.join(', ')}`)
  }
  
  if (profile.challenges.length > 0) {
    parts.push(`- Their challenges: ${profile.challenges.join(', ')}`)
  }
  
  // Learned facts (recent ones)
  const recentFacts = profile.learnedFacts.slice(-5)
  if (recentFacts.length > 0) {
    parts.push(`- Things you know about them:`)
    recentFacts.forEach(f => {
      parts.push(`  • ${f.fact}`)
    })
  }
  
  // Guidance based on relationship stage
  if (profile.relationshipStage === 'new') {
    parts.push(`\nThis is a new user - be warm and helpful, ask questions to learn about them.`)
  } else if (profile.relationshipStage === 'trusted') {
    parts.push(`\nThis is a trusted user - you can be more personal, reference past conversations, show genuine care.`)
  }
  
  return parts.join('\n')
}

/**
 * Detect user's communication style from their messages
 */
export function detectCommunicationStyle(messages: string[]): {
  style: UserPersonalization['communicationStyle']
  usesEmoji: boolean
  detailLevel: UserPersonalization['preferredDetailLevel']
} {
  const combined = messages.join(' ').toLowerCase()
  
  // Check for emoji usage
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu
  const usesEmoji = emojiRegex.test(messages.join(' '))
  
  // Check formality
  const formalIndicators = ['please', 'thank you', 'kindly', 'would you', 'could you', 'i would appreciate']
  const casualIndicators = ['hey', 'cool', 'awesome', 'gonna', 'wanna', 'yeah', 'nope', 'lol', 'haha']
  
  const formalCount = formalIndicators.filter(i => combined.includes(i)).length
  const casualCount = casualIndicators.filter(i => combined.includes(i)).length
  
  let style: UserPersonalization['communicationStyle'] = 'friendly'
  if (formalCount > casualCount + 2) {
    style = 'professional'
  } else if (casualCount > formalCount + 2) {
    style = 'casual'
  }
  
  // Check detail level (average message length)
  const avgLength = messages.reduce((sum, m) => sum + m.length, 0) / messages.length
  let detailLevel: UserPersonalization['preferredDetailLevel'] = 'moderate'
  if (avgLength < 50) {
    detailLevel = 'brief'
  } else if (avgLength > 200) {
    detailLevel = 'detailed'
  }
  
  return { style, usesEmoji, detailLevel }
}
