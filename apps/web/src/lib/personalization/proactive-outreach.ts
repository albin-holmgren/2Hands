/**
 * Proactive Outreach System
 * 
 * AI Manager initiates conversations with users:
 * - Check-ins to build rapport ("How's your week going?")
 * - Agent completion updates ("Your report is ready!")
 * - Personalization questions ("Quick question - what's your timezone?")
 * - Celebration moments ("You've automated 10 hours of work this month!")
 * 
 * Key principle: Feel like a thoughtful colleague, not a notification bot
 */

import { createClient } from '@/lib/supabase/server'
import { createNonStreamingMessageWithFallback, DEFAULT_MODEL } from '@/lib/ai/ai-client'
import { 
  getUserPersonalization, 
  formatPersonalizationForPrompt,
  getRelationshipQuestion,
  markQuestionAsked,
  type UserPersonalization 
} from './user-profile'
import { 
  selectOutreachStrategy, 
  recordOutreachOutcome,
  getOutreachPromptModifiers,
  applyContextualAdjustments
} from '@/lib/outreach/contextual-bandits'


export type OutreachType = 
  | 'check_in'           // Casual rapport building
  | 'agent_completion'   // Agent finished a task
  | 'report_ready'       // Scheduled report available
  | 'learning_question'  // Question to learn about user
  | 'celebration'        // Milestone or achievement
  | 'reminder'           // Gentle reminder about something
  | 'suggestion'         // Proactive automation suggestion
  | 'insight'            // Interesting observation

export interface OutreachMessage {
  id: string
  userId: string
  type: OutreachType
  content: string
  metadata: Record<string, unknown>
  scheduledFor: string
  sentAt: string | null
  readAt: string | null
  createdAt: string
}

export interface OutreachContext {
  userId: string
  workspaceId: string
  type: OutreachType
  agentName?: string
  agentId?: string
  taskSummary?: string
  summary?: string // Agent completion summary
  insights?: string[] // Key insights from agent run
  reportContent?: string
  milestone?: string
  suggestion?: string
}

/**
 * Generate a personalized outreach message
 * Uses AI to craft natural, caring messages based on user profile
 * Now enhanced with contextual bandits for optimization
 */
export async function generateOutreachMessage(context: OutreachContext): Promise<string> {
  const profile = await getUserPersonalization(context.userId, context.workspaceId)
  const personalizationContext = formatPersonalizationForPrompt(profile)
  
  // Use contextual bandits to select optimal outreach strategy
  const strategy = await selectOutreachStrategy(context.userId, {
    type: context.type,
    hour_of_day: new Date().getHours(),
    day_of_week: new Date().getDay(),
  })
  
  // Apply contextual adjustments based on user activity
  const adjustedStrategy = applyContextualAdjustments(strategy, {
    hour_of_day: new Date().getHours(),
    day_of_week: new Date().getDay(),
  })
  
  // Get prompt modifiers from bandit decision
  const modifiers = getOutreachPromptModifiers(adjustedStrategy)
  
  const prompt = buildOutreachPrompt(context, profile)
  
  try {
    const { response } = await createNonStreamingMessageWithFallback({
      model: DEFAULT_MODEL,
      max_tokens: 300,
      system: `You are the AI Manager for 2Hands - a personal AI assistant that genuinely cares about the user.
Your job is to write a brief, warm outreach message.

${personalizationContext}

OUTREACH STRATEGY (optimized via contextual bandits):
${modifiers.timing_instruction}
${modifiers.tone_instruction}
${modifiers.depth_instruction}
${modifiers.type_instruction}

Guidelines:
- Be warm and genuine, not robotic
- Match their communication style
- If they use emojis, you can too (sparingly)
- Never be pushy or salesy
- Sound like a thoughtful colleague, not a notification`,
      messages: [{ role: 'user', content: prompt }],
    })
    
    return response.content[0].type === 'text' 
      ? response.content[0].text 
      : ''
  } catch (error) {
    console.error('[ProactiveOutreach] Error generating message:', error)
    return getFallbackMessage(context, profile)
  }
}

function buildOutreachPrompt(context: OutreachContext, profile: UserPersonalization): string {
  const name = profile.preferredName || 'there'
  
  switch (context.type) {
    case 'check_in':
      return `Write a casual check-in message to ${name}. 
${profile.relationshipStage === 'new' ? 'This is a new user, be welcoming.' : ''}
${profile.relationshipStage === 'trusted' ? 'You know them well, be personal.' : ''}
Maybe ask how they're doing or reference something relevant to their work.`
    
    case 'agent_completion':
      return `Write a message letting ${name} know their agent "${context.agentName}" just finished.
Task summary: ${context.taskSummary}
Be brief but informative. Offer to explain more if they want.`
    
    case 'report_ready':
      return `Write a message letting ${name} know a report is ready.
Agent: ${context.agentName}
Brief summary: ${context.taskSummary}
Don't dump the whole report, just let them know it's available.`
    
    case 'learning_question':
      const question = getRelationshipQuestion(profile)
      return `Write a message that naturally asks ${name} this question: "${question}"
Make it feel conversational, not like a survey.`
    
    case 'celebration':
      return `Write a brief congratulatory message to ${name}.
Milestone: ${context.milestone}
Be genuine, not over-the-top. One sentence is fine.`
    
    case 'suggestion':
      return `Write a message suggesting an automation to ${name}.
Suggestion: ${context.suggestion}
Be helpful, not pushy. They can say no.`
    
    case 'insight':
      return `Share an interesting observation with ${name}.
Insight: ${context.taskSummary}
Make it useful and brief.`
    
    case 'reminder':
      return `Write a gentle reminder to ${name}.
About: ${context.taskSummary}
Be helpful, not nagging.`
    
    default:
      return `Write a brief, friendly message to ${name}.`
  }
}

function getFallbackMessage(context: OutreachContext, profile: UserPersonalization): string {
  const name = profile.preferredName || ''
  const greeting = name ? `Hey ${name}` : 'Hey'
  
  switch (context.type) {
    case 'check_in':
      return `${greeting}, just checking in - how's everything going?`
    case 'agent_completion':
      return `${greeting}, ${context.agentName || 'your agent'} just finished! Let me know if you want the details.`
    case 'report_ready':
      return `${greeting}, your report from ${context.agentName || 'the agent'} is ready.`
    case 'celebration':
      return `${greeting}, congrats on ${context.milestone || 'this milestone'}!`
    default:
      return `${greeting}, hope you're having a good day.`
  }
}

/**
 * Schedule a proactive outreach message
 */
export async function scheduleOutreach(
  context: OutreachContext,
  scheduledFor?: Date
): Promise<string> {
  const supabase = await createClient()
  
  const message = await generateOutreachMessage(context)
  const id = `out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  
  const outreach: OutreachMessage = {
    id,
    userId: context.userId,
    type: context.type,
    content: message,
    metadata: context as unknown as Record<string, unknown>,
    scheduledFor: (scheduledFor || new Date()).toISOString(),
    sentAt: null,
    readAt: null,
    createdAt: new Date().toISOString(),
  }
  
  await supabase
    .from('proactive_outreach')
    .insert({
      id: outreach.id,
      user_id: outreach.userId,
      workspace_id: context.workspaceId || null,
      type: outreach.type,
      content: outreach.content,
      metadata: context as unknown as Record<string, unknown>,
      scheduled_for: outreach.scheduledFor,
      created_at: outreach.createdAt,
    } as never)
  
  return id
}

/**
 * Send outreach message to user (insert into AI Manager conversation)
 */
export async function sendOutreachMessage(outreachId: string): Promise<boolean> {
  const supabase = await createClient()
  
  // Get the outreach message
  interface OutreachRow {
    id: string
    user_id: string
    content: string
    type: string
    metadata: Record<string, unknown>
  }
  
  const { data: outreach } = await supabase
    .from('proactive_outreach')
    .select('*')
    .eq('id', outreachId)
    .single()
  
  if (!outreach) return false
  
  const row = outreach as OutreachRow
  
  // Get or create AI Manager conversation
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('user_id', row.user_id)
    .eq('title', 'AI Manager')
    .single()
  
  if (!conversation) return false
  
  const conversationId = (conversation as { id: string }).id
  
  // Insert message as assistant (AI initiating)
  await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: row.content,
      created_at: new Date().toISOString(),
    } as never)
  
  // Mark as sent
  await supabase
    .from('proactive_outreach')
    .update({ sent_at: new Date().toISOString() } as never)
    .eq('id', outreachId)
  
  // If it was a learning question, mark it as asked
  if (row.type === 'learning_question' && row.metadata) {
    const wsId = (row.metadata.workspaceId as string) || ''
    if (wsId) {
      await markQuestionAsked(row.user_id, wsId, row.metadata.question as string || '')
    }
  }
  
  return true
}

/**
 * Get pending outreach messages ready to send
 */
export async function getPendingOutreach(): Promise<OutreachMessage[]> {
  const supabase = await createClient()
  
  interface OutreachRow {
    id: string
    user_id: string
    type: string
    content: string
    metadata: Record<string, unknown>
    scheduled_for: string
    sent_at: string | null
    read_at: string | null
    created_at: string
  }
  
  const { data } = await supabase
    .from('proactive_outreach')
    .select('*')
    .is('sent_at', null)
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(50)
  
  if (!data) return []
  
  return (data as OutreachRow[]).map(row => ({
    id: row.id,
    userId: row.user_id,
    type: row.type as OutreachType,
    content: row.content,
    metadata: row.metadata,
    scheduledFor: row.scheduled_for,
    sentAt: row.sent_at,
    readAt: row.read_at,
    createdAt: row.created_at,
  }))
}

/**
 * Notify user when agent completes a task.
 * Uses priority-based delivery: urgent/high → immediate, normal/low → batched.
 */
export async function notifyAgentCompletion(
  userId: string,
  workspaceId: string,
  agentId: string,
  agentName: string,
  taskSummary: string,
  priority: 'urgent' | 'high' | 'normal' | 'low' = 'normal'
): Promise<void> {
  const sendImmediately = priority === 'urgent' || priority === 'high'

  if (sendImmediately) {
    await scheduleOutreach({
      userId,
      workspaceId,
      type: 'agent_completion',
      agentId,
      agentName,
      taskSummary,
    })

    const pending = await getPendingOutreach()
    const thisOutreach = pending.find(o =>
      o.userId === userId &&
      o.type === 'agent_completion' &&
      o.metadata.agentId === agentId
    )
    if (thisOutreach) {
      await sendOutreachMessage(thisOutreach.id)
    }
  } else {
    // Batch: schedule for 30 min from now (will be picked up by processProactiveOutreach)
    const batchTime = new Date(Date.now() + 30 * 60 * 1000)
    await scheduleOutreach({
      userId,
      workspaceId,
      type: 'agent_completion',
      agentId,
      agentName,
      taskSummary,
    }, batchTime)
  }
}

/**
 * Notify user about an important agent insight (not a completion).
 * Urgent insights send immediately; everything else batches.
 */
export async function notifyAgentInsight(
  userId: string,
  workspaceId: string,
  agentId: string,
  agentName: string,
  insight: string,
  priority: 'urgent' | 'high' | 'normal' | 'low' = 'normal'
): Promise<void> {
  if (priority === 'urgent') {
    await scheduleOutreach({
      userId,
      workspaceId,
      type: 'insight',
      agentId,
      agentName,
      taskSummary: insight,
    })
    const pending = await getPendingOutreach()
    const thisOutreach = pending.find(o =>
      o.userId === userId &&
      o.type === 'insight' &&
      o.metadata.agentId === agentId
    )
    if (thisOutreach) {
      await sendOutreachMessage(thisOutreach.id)
    }
  } else {
    // Non-urgent insights batch into the next digest cycle
    const batchTime = priority === 'high'
      ? new Date(Date.now() + 15 * 60 * 1000)   // 15 min for high
      : new Date(Date.now() + 60 * 60 * 1000)    // 1 hour for normal/low
    await scheduleOutreach({
      userId,
      workspaceId,
      type: 'insight',
      agentId,
      agentName,
      taskSummary: insight,
    }, batchTime)
  }
}

/**
 * Schedule a check-in for a user
 */
export async function scheduleCheckIn(userId: string, workspaceId: string, delayHours: number = 24): Promise<void> {
  const scheduledFor = new Date(Date.now() + delayHours * 60 * 60 * 1000)
  
  await scheduleOutreach({
    userId,
    workspaceId,
    type: 'check_in',
  }, scheduledFor)
}

/**
 * Celebrate a user milestone
 */
export async function celebrateMilestone(userId: string, workspaceId: string, milestone: string): Promise<void> {
  await scheduleOutreach({
    userId,
    workspaceId,
    type: 'celebration',
    milestone,
  })
  
  // Send immediately for celebrations
  const pending = await getPendingOutreach()
  const thisOutreach = pending.find(o => 
    o.userId === userId && 
    o.type === 'celebration'
  )
  
  if (thisOutreach) {
    await sendOutreachMessage(thisOutreach.id)
  }
}

/**
 * Determine if we should reach out to user today
 */
export async function shouldReachOut(userId: string, workspaceId: string): Promise<{
  shouldReach: boolean
  type: OutreachType | null
  reason: string
}> {
  const supabase = await createClient()
  const profile = await getUserPersonalization(userId, workspaceId)
  
  // Don't overwhelm new users
  if (profile.relationshipStage === 'new' && profile.totalInteractions < 3) {
    return { shouldReach: false, type: null, reason: 'New user, waiting for more interactions' }
  }
  
  // Check last outreach
  const { data: lastOutreach } = await supabase
    .from('proactive_outreach')
    .select('sent_at, type')
    .eq('user_id', userId)
    .not('sent_at', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(1)
    .single()
  
  if (lastOutreach) {
    const lastSent = new Date((lastOutreach as { sent_at: string }).sent_at)
    const hoursSinceLastOutreach = (Date.now() - lastSent.getTime()) / (60 * 60 * 1000)
    
    // Don't message more than once per 8 hours
    if (hoursSinceLastOutreach < 8) {
      return { shouldReach: false, type: null, reason: 'Recent outreach' }
    }
  }
  
  // Check if user has been active recently
  const { data: lastMessage } = await supabase
    .from('messages')
    .select('created_at')
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  
  if (lastMessage) {
    const lastActive = new Date((lastMessage as { created_at: string }).created_at)
    const hoursSinceActive = (Date.now() - lastActive.getTime()) / (60 * 60 * 1000)
    
    // If user was active in last 2 hours, don't interrupt
    if (hoursSinceActive < 2) {
      return { shouldReach: false, type: null, reason: 'User recently active' }
    }
    
    // If user hasn't been active in 48+ hours, check in
    if (hoursSinceActive > 48) {
      return { shouldReach: true, type: 'check_in', reason: 'User inactive for 48+ hours' }
    }
  }
  
  // Random chance for learning question (30% daily)
  if (Math.random() < 0.3 && profile.relationshipStage !== 'new') {
    const question = getRelationshipQuestion(profile)
    if (question) {
      return { shouldReach: true, type: 'learning_question', reason: 'Relationship building' }
    }
  }
  
  return { shouldReach: false, type: null, reason: 'No trigger' }
}

/**
 * Process outreach for all users (run via cron)
 */
export async function processProactiveOutreach(): Promise<number> {
  // Send any pending scheduled messages
  const pending = await getPendingOutreach()
  let sentCount = 0
  
  for (const outreach of pending) {
    const success = await sendOutreachMessage(outreach.id)
    if (success) sentCount++
  }
  
  return sentCount
}
