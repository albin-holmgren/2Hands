/**
 * Conversation State Tracker
 * 
 * Tracks the state of the AI Manager conversation to:
 * - Avoid re-greeting after the first message
 * - Not end every message with "Is there anything else?"
 * - Remember if there's a pending confirmation
 * - Track the current conversation mode
 */

import { createClient } from '@/lib/supabase/server'

export type ConversationMode = 'chat' | 'planning' | 'automation' | 'support'

export interface ConversationState {
  greeted: boolean
  lastMode: ConversationMode
  pendingConfirmation: {
    type: 'create_agent' | 'delete_agent' | 'modify_agent' | 'start_mission' | 'run_agent' | 'destructive_action' | null
    details: Record<string, unknown>
  } | null
  messageCount: number
  lastMessageAt: string | null
}

const DEFAULT_STATE: ConversationState = {
  greeted: false,
  lastMode: 'chat',
  pendingConfirmation: null,
  messageCount: 0,
  lastMessageAt: null,
}

/**
 * Get conversation state for a user's AI Manager conversation
 */
export async function getConversationState(userId: string): Promise<ConversationState> {
  const supabase = await createClient()
  
  try {
    // Get or create conversation context
    const { data } = await supabase
      .from('conversation_context')
      .select('context_data')
      .eq('user_id', userId)
      .single()
    
    if (data && (data as { context_data: unknown }).context_data) {
      const contextData = (data as { context_data: Record<string, unknown> }).context_data
      return {
        greeted: (contextData.greeted as boolean) ?? false,
        lastMode: (contextData.lastMode as ConversationMode) ?? 'chat',
        pendingConfirmation: (contextData.pendingConfirmation as ConversationState['pendingConfirmation']) ?? null,
        messageCount: (contextData.messageCount as number) ?? 0,
        lastMessageAt: (contextData.lastMessageAt as string) ?? null,
      }
    }
  } catch {
    // Table might not exist or other error - use defaults
  }
  
  return DEFAULT_STATE
}

/**
 * Update conversation state
 */
export async function updateConversationState(
  userId: string,
  updates: Partial<ConversationState>
): Promise<void> {
  const supabase = await createClient()
  
  try {
    const currentState = await getConversationState(userId)
    const newState = { ...currentState, ...updates, lastMessageAt: new Date().toISOString() }
    
    await supabase
      .from('conversation_context')
      .upsert({
        user_id: userId,
        context_data: newState,
        updated_at: new Date().toISOString(),
      } as never, { onConflict: 'user_id' })
  } catch {
    // Silently fail if table doesn't exist
  }
}

/**
 * Mark that user has been greeted (don't re-greet)
 */
export async function markGreeted(userId: string): Promise<void> {
  await updateConversationState(userId, { greeted: true })
}

/**
 * Set pending confirmation (waiting for user to confirm an action)
 */
export async function setPendingConfirmation(
  userId: string,
  type: 'create_agent' | 'delete_agent' | 'modify_agent' | 'start_mission' | 'run_agent' | 'destructive_action',
  details: Record<string, unknown>
): Promise<void> {
  await updateConversationState(userId, {
    pendingConfirmation: { type, details },
  })
}

export async function setPendingMissionProposal(
  userId: string,
  proposal: { goal: string; why: string; first_steps: string; autonomy_level: string; tick_timebox_minutes: number }
): Promise<void> {
  await setPendingConfirmation(userId, 'start_mission', proposal)
}

/**
 * Clear pending confirmation (action was confirmed or cancelled)
 */
export async function clearPendingConfirmation(userId: string): Promise<void> {
  await updateConversationState(userId, { pendingConfirmation: null })
}

/**
 * Increment message count
 */
export async function incrementMessageCount(userId: string): Promise<void> {
  const state = await getConversationState(userId)
  await updateConversationState(userId, { messageCount: state.messageCount + 1 })
}

/**
 * Build conversation state instructions for the system prompt
 */
export function buildStateInstructions(state: ConversationState): string {
  const instructions: string[] = []
  
  // Don't re-greet
  if (state.greeted) {
    instructions.push('User has already been greeted - do NOT start with a greeting.')
  }
  
  // Handle pending confirmation
  if (state.pendingConfirmation) {
    if (state.pendingConfirmation.type === 'start_mission') {
      const d = state.pendingConfirmation.details as { goal?: string; autonomy_level?: string; tick_timebox_minutes?: number }
      instructions.push(
        `MISSION PENDING CONFIRMATION: You showed the user a mission proposal with goal: "${d.goal}". ` +
        `If the user's message is ANY form of agreement (yes, yep, ok, sure, go ahead, let's do it, start it, do it, absolutely, proceed, great, sounds good, etc.), ` +
        `you MUST immediately call the start_mission tool with these EXACT parameters: goal="${d.goal}", autonomy_level="${d.autonomy_level || 'full_auto'}", tick_timebox_minutes=${d.tick_timebox_minutes || 30}. ` +
        `Do NOT say anything before calling the tool. Call it immediately as your first action.`
      )
    } else if (state.pendingConfirmation.type === 'run_agent') {
      const d = state.pendingConfirmation.details as { agent_id?: string; agent_name?: string }
      instructions.push(
        `RUN AGENT PENDING CONFIRMATION: You asked the user to confirm running agent "${d.agent_name || 'the agent'}" (id: ${d.agent_id}). ` +
        `If the user's message is ANY form of agreement (yes, yep, ok, sure, go ahead, do it, run it, start it, now, absolutely, proceed, great, sounds good, etc.), ` +
        `you MUST immediately call the run_agent tool with agent_id="${d.agent_id}". ` +
        `Do NOT say anything before calling the tool. Call it immediately as your first action.`
      )
    } else if (state.pendingConfirmation.type === 'destructive_action') {
      const d = state.pendingConfirmation.details as { originalRequest?: string; reason?: string }
      instructions.push(
        `DESTRUCTIVE ACTION PENDING CONFIRMATION: You asked the user to confirm a destructive request: "${d.originalRequest || 'the action'}". ` +
        `Reason: ${d.reason || 'Dangerous/irreversible operation'}. ` +
        `If the user's message is ANY form of agreement (yes, yep, ok, sure, go ahead, do it, proceed, confirm, absolutely, etc.), ` +
        `you MUST immediately execute the original request. Do NOT ask again. ` +
        `If they decline, acknowledge and do nothing.`
      )
    } else {
      instructions.push(`PENDING CONFIRMATION: You proposed to ${state.pendingConfirmation.type}. If user confirms (yes/go ahead/sure), proceed. If they decline, acknowledge and move on.`)
    }
  }
  
  // Avoid repetitive closings after several messages
  if (state.messageCount > 3) {
    instructions.push('Do NOT end every message with "Is there anything else?" or similar. Just respond naturally.')
  }
  
  if (instructions.length === 0) return ''
  
  return `\n\n## CONVERSATION STATE\n${instructions.join('\n')}`
}
