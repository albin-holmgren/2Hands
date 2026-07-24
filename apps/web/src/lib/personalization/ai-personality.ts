/**
 * AI Manager Personality
 * 
 * Defines how the AI Manager communicates:
 * - Warm, caring, genuine
 * - Adapts to user's style
 * - Remembers past conversations
 * - Asks questions to learn
 * - Celebrates wins
 * 
 * Goal: Feel like a trusted colleague who genuinely cares
 */

import { getUserPersonalization, type UserPersonalization } from './user-profile'

export interface AIPersonalityContext {
  greeting: string
  tone: string
  shouldAskQuestion: boolean
  questionToAsk: string | null
  recentContext: string[]
  celebrationNote: string | null
}

/**
 * Build the AI Manager's personality prompt based on user personalization
 * NOTE: This should ONLY add style/tone preferences, NOT goals or behavior instructions.
 * The main system prompt already defines behavior - this just personalizes tone.
 */
export function buildPersonalityPrompt(profile: UserPersonalization): string {
  const name = profile.preferredName || 'there'
  
  let prompt = `## PERSONALIZATION FOR ${name.toUpperCase()}

`

  // Adapt based on detected style
  switch (profile.communicationStyle) {
    case 'formal':
      prompt += `- Professional and polished
- Clear and well-structured responses
- Respectful tone, avoid slang`
      break
    case 'casual':
      prompt += `- Relaxed and friendly
- Use contractions, be conversational
- Can use humor when appropriate`
      break
    case 'professional':
      prompt += `- Professional but approachable
- Focus on efficiency and clarity
- Respect their time`
      break
    case 'friendly':
    default:
      prompt += `- Warm and personable
- Balance professionalism with friendliness
- Show genuine interest`
  }
  
  prompt += '\n\n'
  
  // Detail level
  switch (profile.preferredDetailLevel) {
    case 'brief':
      prompt += `## DETAIL LEVEL: Keep responses SHORT
- Get to the point quickly
- Bullet points over paragraphs
- Only elaborate if asked`
      break
    case 'detailed':
      prompt += `## DETAIL LEVEL: They appreciate THOROUGH responses
- Explain your reasoning
- Provide context and options
- Be comprehensive`
      break
    default:
      prompt += `## DETAIL LEVEL: MODERATE detail
- Balance brevity with helpfulness
- Elaborate on important points
- Keep routine stuff brief`
  }
  
  prompt += '\n\n'
  
  // Relationship stage - just affects familiarity level, not behavior
  switch (profile.relationshipStage) {
    case 'new':
      prompt += `RELATIONSHIP: New user - be welcoming, don't assume familiarity`
      break
    case 'building':
      prompt += `RELATIONSHIP: Getting to know each other - can reference things learned`
      break
    case 'established':
      prompt += `RELATIONSHIP: Established - can be more direct and personal`
      break
    case 'trusted':
      prompt += `RELATIONSHIP: Trusted - act like a close colleague`
      break
  }
  
  prompt += '\n\n'
  
  // Add known facts
  if (profile.learnedFacts.length > 0) {
    prompt += `## THINGS YOU KNOW ABOUT THEM
Remember and naturally reference these when relevant:\n`
    
    const recentFacts = profile.learnedFacts.slice(-10)
    recentFacts.forEach(fact => {
      prompt += `- ${fact.fact}\n`
    })
    prompt += '\n'
  }
  
  // Goals and challenges
  if (profile.goals.length > 0) {
    prompt += `## THEIR GOALS (help them achieve these)
${profile.goals.map(g => `- ${g}`).join('\n')}\n\n`
  }
  
  if (profile.challenges.length > 0) {
    prompt += `## THEIR CHALLENGES (be empathetic, help where you can)
${profile.challenges.map(c => `- ${c}`).join('\n')}\n\n`
  }
  
  // Emoji usage
  if (profile.usesEmoji) {
    prompt += `They use emojis, so you can too (sparingly, 1-2 per message max).\n\n`
  } else {
    prompt += `They don't use emojis much, so keep your responses emoji-free.\n\n`
  }
  
  // Minimal style guidelines - behavior is in main system prompt
  prompt += `

STYLE NOTES:
- Be natural, not robotic
- Don't end every message with a question
- Don't say "As an AI..." or similar phrases`
  
  return prompt
}

/**
 * Generate a contextual greeting based on time and relationship
 */
export function getContextualGreeting(profile: UserPersonalization): string {
  const name = profile.preferredName || ''
  const hour = new Date().getHours()
  
  // Time-based greeting
  let timeGreeting = ''
  if (hour < 12) {
    timeGreeting = 'Good morning'
  } else if (hour < 17) {
    timeGreeting = 'Good afternoon'
  } else {
    timeGreeting = 'Good evening'
  }
  
  // Relationship-based greeting
  switch (profile.relationshipStage) {
    case 'new':
      return name ? `Hi ${name}! ` : 'Hi there! '
    case 'building':
      return name ? `Hey ${name}! ` : 'Hey! '
    case 'established':
    case 'trusted':
      // More varied greetings for established relationships
      const greetings = [
        name ? `Hey ${name}! ` : 'Hey! ',
        name ? `${timeGreeting}, ${name}! ` : `${timeGreeting}! `,
        name ? `Hi ${name}! ` : 'Hi! ',
        'Hey there! ',
      ]
      return greetings[Math.floor(Math.random() * greetings.length)]
    default:
      return name ? `Hi ${name}! ` : 'Hi! '
  }
}

/**
 * Determine if we should ask a learning question in this response
 */
export function shouldAskLearningQuestion(profile: UserPersonalization): boolean {
  // New users: ask more often (40% chance)
  if (profile.relationshipStage === 'new') {
    return Math.random() < 0.4
  }
  
  // Building: moderate (25% chance)
  if (profile.relationshipStage === 'building') {
    return Math.random() < 0.25
  }
  
  // Established/trusted: less often (15% chance)
  return Math.random() < 0.15
}

/**
 * Get a natural follow-up question based on context
 */
export function getFollowUpQuestion(profile: UserPersonalization, messageContext: string): string | null {
  const context = messageContext.toLowerCase()
  
  // Context-specific questions
  if (context.includes('project') || context.includes('work')) {
    if (!profile.industryOrRole) {
      return "What kind of work do you do, by the way?"
    }
    return "How's that project going?"
  }
  
  if (context.includes('busy') || context.includes('stressed')) {
    return "Anything I can help take off your plate?"
  }
  
  if (context.includes('thanks') || context.includes('great')) {
    if (profile.relationshipStage === 'new') {
      return "Is there anything else you'd like help with?"
    }
    return null // Don't always ask
  }
  
  // Generic relationship-building questions
  const questions = {
    new: [
      "What's the main thing you're hoping to accomplish with 2Hands?",
      "Is there a specific task that takes up too much of your time?",
    ],
    building: [
      "How's your week going?",
      "Anything on your mind I can help with?",
    ],
    established: [
      "What's keeping you busy lately?",
      "Anything exciting coming up?",
    ],
    trusted: [
      "How are you doing?",
      "What's on your radar this week?",
    ],
  }
  
  const stageQuestions = questions[profile.relationshipStage] || questions.new
  return stageQuestions[Math.floor(Math.random() * stageQuestions.length)]
}

/**
 * Build complete AI Manager system prompt with personalization
 */
export async function buildAIManagerPrompt(userId: string, workspaceId: string): Promise<string> {
  const profile = await getUserPersonalization(userId, workspaceId)
  
  const personalityPrompt = buildPersonalityPrompt(profile)
  
  return personalityPrompt
}

/**
 * Extract learnable facts from user message
 */
export function extractLearnableFacts(message: string): Array<{
  fact: string
  category: 'personal' | 'work' | 'preference' | 'goal' | 'challenge'
}> {
  const facts: Array<{ fact: string; category: 'personal' | 'work' | 'preference' | 'goal' | 'challenge' }> = []
  const msg = message.toLowerCase()
  
  // Name detection
  const nameMatch = message.match(/(?:call me|i'm|my name is|i am)\s+(\w+)/i)
  if (nameMatch) {
    facts.push({ fact: `Prefers to be called ${nameMatch[1]}`, category: 'personal' })
  }
  
  // Role/job detection
  const roleMatch = message.match(/(?:i work as|i'm a|i am a|my job is)\s+(.+?)(?:\.|,|$)/i)
  if (roleMatch) {
    facts.push({ fact: `Works as ${roleMatch[1].trim()}`, category: 'work' })
  }
  
  // Goal detection
  if (msg.includes('i want to') || msg.includes("i'm trying to") || msg.includes('my goal is')) {
    const goalMatch = message.match(/(?:i want to|i'm trying to|my goal is)\s+(.+?)(?:\.|,|$)/i)
    if (goalMatch) {
      facts.push({ fact: goalMatch[1].trim(), category: 'goal' })
    }
  }
  
  // Challenge detection
  if (msg.includes('struggle with') || msg.includes('hard to') || msg.includes('challenge is')) {
    const challengeMatch = message.match(/(?:struggle with|hard to|challenge is)\s+(.+?)(?:\.|,|$)/i)
    if (challengeMatch) {
      facts.push({ fact: challengeMatch[1].trim(), category: 'challenge' })
    }
  }
  
  // Preference detection
  if (msg.includes('i prefer') || msg.includes('i like') || msg.includes("i don't like")) {
    const prefMatch = message.match(/(?:i prefer|i like|i don't like)\s+(.+?)(?:\.|,|$)/i)
    if (prefMatch) {
      facts.push({ fact: prefMatch[0].trim(), category: 'preference' })
    }
  }
  
  return facts
}
