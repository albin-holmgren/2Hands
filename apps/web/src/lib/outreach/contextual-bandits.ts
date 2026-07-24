/**
 * Contextual Bandits for Outreach Optimization
 * 
 * Uses Thompson Sampling to learn optimal outreach strategies per user.
 * Optimizes: timing, message type, tone, and depth.
 */

import { createAdminClient } from '@/lib/supabase/admin'

// Types
interface OutreachArm {
  id: string
  arm_name: string
  arm_type: 'timing' | 'message_type' | 'tone' | 'depth'
  arm_value: string
  description: string | null
  is_active: boolean
}

interface BanditState {
  id: string
  user_id: string
  arm_id: string
  alpha: number // successes + 1
  beta: number // failures + 1
  total_pulls: number
  total_reward: number
  last_pulled_at: string | null
}

interface OutreachEvent {
  user_id: string
  outreach_id?: string
  arms_used: Record<string, string> // arm_type -> arm_value
  context_features: Record<string, unknown>
  outcome: 'opened' | 'replied' | 'action_taken' | 'dismissed' | 'ignored'
  reward: number
}

interface OutreachDecision {
  timing: string
  message_type: string
  tone: string
  depth: string
  confidence: number
  exploration_rate: number
}

// Reward values for different outcomes
const OUTCOME_REWARDS: Record<string, number> = {
  action_taken: 1.0, // Best outcome - user took action
  replied: 0.8, // Great - user engaged
  opened: 0.3, // Good - user saw it
  dismissed: -0.2, // Slightly negative - explicit rejection
  ignored: 0.0, // Neutral - no signal
}

/**
 * Sample from Beta distribution using Thompson Sampling
 */
function sampleBeta(alpha: number, beta: number): number {
  // Use the Jönsson-Tarsitano approximation for beta sampling
  const u1 = Math.random()
  const u2 = Math.random()
  
  // Gamma sampling approximation
  const gammaAlpha = -Math.log(1 - Math.pow(u1, 1 / alpha))
  const gammaBeta = -Math.log(1 - Math.pow(u2, 1 / beta))
  
  return gammaAlpha / (gammaAlpha + gammaBeta)
}

/**
 * Get or initialize bandit state for a user
 */
async function getBanditState(
  userId: string,
  armId: string
): Promise<BanditState> {
  const supabase = createAdminClient()
  
  const { data } = await supabase
    .from('outreach_bandit_state')
    .select('*')
    .eq('user_id', userId)
    .eq('arm_id', armId)
    .maybeSingle()
  
  if (data) {
    return data as unknown as BanditState
  }
  
  // Initialize with uniform prior (alpha=1, beta=1)
  const { data: newState } = await supabase
    .from('outreach_bandit_state')
    .insert({
      user_id: userId,
      arm_id: armId,
      alpha: 1.0,
      beta: 1.0,
      total_pulls: 0,
      total_reward: 0,
    } as never)
    .select('*')
    .single()
  
  return (newState as unknown as BanditState) || {
    id: '',
    user_id: userId,
    arm_id: armId,
    alpha: 1.0,
    beta: 1.0,
    total_pulls: 0,
    total_reward: 0,
    last_pulled_at: null,
  }
}

/**
 * Get all active arms
 */
async function getActiveArms(): Promise<OutreachArm[]> {
  const supabase = createAdminClient()
  
  const { data } = await supabase
    .from('outreach_arms')
    .select('*')
    .eq('is_active', true)
  
  return (data || []) as unknown as OutreachArm[]
}

/**
 * Select best arm for each type using Thompson Sampling
 */
export async function selectOutreachStrategy(
  userId: string,
  contextFeatures?: Record<string, unknown>
): Promise<OutreachDecision> {
  const arms = await getActiveArms()
  
  // Group arms by type
  const armsByType: Record<string, OutreachArm[]> = {}
  for (const arm of arms) {
    if (!armsByType[arm.arm_type]) {
      armsByType[arm.arm_type] = []
    }
    armsByType[arm.arm_type].push(arm)
  }
  
  const decision: Record<string, string> = {}
  let totalConfidence = 0
  let explorationCount = 0
  
  // For each arm type, select the best using Thompson Sampling
  for (const [armType, typeArms] of Object.entries(armsByType)) {
    let bestArm: OutreachArm | null = null
    let bestSample = -1
    
    for (const arm of typeArms) {
      const state = await getBanditState(userId, arm.id)
      const sample = sampleBeta(state.alpha, state.beta)
      
      if (sample > bestSample) {
        bestSample = sample
        bestArm = arm
      }
    }
    
    if (bestArm) {
      decision[armType] = bestArm.arm_value
      totalConfidence += bestSample
      
      // Track if this was exploration (sample far from mean)
      const state = await getBanditState(userId, bestArm.id)
      const mean = state.alpha / (state.alpha + state.beta)
      if (Math.abs(bestSample - mean) > 0.2) {
        explorationCount++
      }
    }
  }
  
  const armTypeCount = Object.keys(armsByType).length
  
  return {
    timing: decision.timing || 'morning',
    message_type: decision.message_type || 'check_in',
    tone: decision.tone || 'warm',
    depth: decision.depth || 'moderate',
    confidence: armTypeCount > 0 ? totalConfidence / armTypeCount : 0.5,
    exploration_rate: armTypeCount > 0 ? explorationCount / armTypeCount : 0,
  }
}

/**
 * Record outreach outcome and update bandit states
 */
export async function recordOutreachOutcome(
  userId: string,
  armsUsed: Record<string, string>,
  outcome: OutreachEvent['outcome'],
  outreachId?: string,
  contextFeatures?: Record<string, unknown>
): Promise<void> {
  const supabase = createAdminClient()
  
  const reward = OUTCOME_REWARDS[outcome]
  
  // Log the event
  await supabase
    .from('outreach_events')
    .insert({
      user_id: userId,
      outreach_id: outreachId || null,
      arms_used: armsUsed,
      context_features: contextFeatures || {},
      outcome,
      reward,
    } as never)
  
  // Update bandit states for each arm used
  const arms = await getActiveArms()
  
  for (const [armType, armValue] of Object.entries(armsUsed)) {
    const arm = arms.find(a => a.arm_type === armType && a.arm_value === armValue)
    if (!arm) continue
    
    const state = await getBanditState(userId, arm.id)
    
    // Update beta distribution parameters
    // For rewards in [0,1]: alpha += reward, beta += (1 - reward)
    // For negative rewards: only increment beta
    const alphaIncrement = reward > 0 ? reward : 0
    const betaIncrement = reward <= 0 ? Math.abs(reward) + 0.1 : 1 - reward
    
    await supabase
      .from('outreach_bandit_state')
      .update({
        alpha: state.alpha + alphaIncrement,
        beta: state.beta + betaIncrement,
        total_pulls: state.total_pulls + 1,
        total_reward: state.total_reward + reward,
        last_pulled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', state.id)
  }
}

/**
 * Get bandit statistics for a user
 */
export async function getBanditStats(
  userId: string
): Promise<{
  arms: Array<{
    arm_name: string
    arm_type: string
    arm_value: string
    mean_reward: number
    confidence_interval: [number, number]
    total_pulls: number
  }>
  total_outreaches: number
  avg_reward: number
  best_performing: Record<string, string>
}> {
  const supabase = createAdminClient()
  const arms = await getActiveArms()
  
  const armStats: Array<{
    arm_name: string
    arm_type: string
    arm_value: string
    mean_reward: number
    confidence_interval: [number, number]
    total_pulls: number
  }> = []
  
  const bestPerforming: Record<string, { value: string; mean: number }> = {}
  let totalPulls = 0
  let totalReward = 0
  
  for (const arm of arms) {
    const state = await getBanditState(userId, arm.id)
    
    // Calculate mean and confidence interval
    const mean = state.alpha / (state.alpha + state.beta)
    const variance = (state.alpha * state.beta) / 
      (Math.pow(state.alpha + state.beta, 2) * (state.alpha + state.beta + 1))
    const stdDev = Math.sqrt(variance)
    
    // 95% confidence interval
    const ci: [number, number] = [
      Math.max(0, mean - 1.96 * stdDev),
      Math.min(1, mean + 1.96 * stdDev),
    ]
    
    armStats.push({
      arm_name: arm.arm_name,
      arm_type: arm.arm_type,
      arm_value: arm.arm_value,
      mean_reward: mean,
      confidence_interval: ci,
      total_pulls: state.total_pulls,
    })
    
    totalPulls += state.total_pulls
    totalReward += state.total_reward
    
    // Track best performing per type
    if (!bestPerforming[arm.arm_type] || mean > bestPerforming[arm.arm_type].mean) {
      bestPerforming[arm.arm_type] = { value: arm.arm_value, mean }
    }
  }
  
  return {
    arms: armStats,
    total_outreaches: totalPulls / Object.keys(bestPerforming).length, // Approximate
    avg_reward: totalPulls > 0 ? totalReward / totalPulls : 0,
    best_performing: Object.fromEntries(
      Object.entries(bestPerforming).map(([k, v]) => [k, v.value])
    ),
  }
}

/**
 * Reset bandit state for a user (e.g., after preference changes)
 */
export async function resetBanditState(userId: string): Promise<void> {
  const supabase = createAdminClient()
  
  await supabase
    .from('outreach_bandit_state')
    .update({
      alpha: 1.0,
      beta: 1.0,
      total_pulls: 0,
      total_reward: 0,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('user_id', userId)
}

/**
 * Apply contextual adjustments to arm selection
 * (Future enhancement: use context features to adjust priors)
 */
export function applyContextualAdjustments(
  decision: OutreachDecision,
  context: {
    hour_of_day?: number
    day_of_week?: number
    user_activity_level?: 'low' | 'medium' | 'high'
    last_interaction_hours_ago?: number
  }
): OutreachDecision {
  const adjusted = { ...decision }
  
  // Timing adjustments based on current hour
  if (context.hour_of_day !== undefined) {
    if (context.hour_of_day < 9) {
      adjusted.timing = 'morning'
    } else if (context.hour_of_day < 14) {
      adjusted.timing = 'afternoon'
    } else if (context.hour_of_day < 20) {
      adjusted.timing = 'evening'
    }
  }
  
  // Tone adjustments based on activity
  if (context.user_activity_level === 'low') {
    // More engaging tone for inactive users
    adjusted.tone = 'warm'
    adjusted.depth = 'brief' // Don't overwhelm
  } else if (context.user_activity_level === 'high') {
    // More professional for active users
    adjusted.tone = 'professional'
    adjusted.depth = 'detailed' // They can handle more info
  }
  
  // Message type based on recency
  if (context.last_interaction_hours_ago !== undefined) {
    if (context.last_interaction_hours_ago > 72) {
      // Re-engagement needed
      adjusted.message_type = 'check_in'
    } else if (context.last_interaction_hours_ago < 4) {
      // Recent interaction - provide value
      adjusted.message_type = 'insight'
    }
  }
  
  return adjusted
}

/**
 * Generate outreach content based on selected strategy
 */
export function getOutreachPromptModifiers(
  decision: OutreachDecision
): {
  timing_instruction: string
  tone_instruction: string
  depth_instruction: string
  type_instruction: string
} {
  const toneInstructions: Record<string, string> = {
    warm: 'Use a friendly, caring tone. Show genuine interest in the user.',
    professional: 'Use a professional, efficient tone. Be direct and helpful.',
    casual: 'Use a casual, relaxed tone. Keep it light and brief.',
  }
  
  const depthInstructions: Record<string, string> = {
    brief: 'Keep the message to 1-2 sentences. Be concise.',
    moderate: 'Use 2-3 sentences. Provide enough context.',
    detailed: 'Include relevant details and actionable items. 3-5 sentences.',
  }
  
  const typeInstructions: Record<string, string> = {
    check_in: 'This is a casual check-in to build rapport. Ask how things are going.',
    suggestion: 'Proactively suggest a new automation or improvement.',
    insight: 'Share an interesting insight from recent agent activity.',
    summary: 'Provide a summary of recent agent work and results.',
  }
  
  const timingInstructions: Record<string, string> = {
    morning: 'Frame as a start-of-day message. Reference the day ahead.',
    afternoon: 'Frame as a midday update. Reference progress so far.',
    evening: 'Frame as an end-of-day wrap-up. Reference accomplishments.',
  }
  
  return {
    timing_instruction: timingInstructions[decision.timing] || timingInstructions.morning,
    tone_instruction: toneInstructions[decision.tone] || toneInstructions.warm,
    depth_instruction: depthInstructions[decision.depth] || depthInstructions.moderate,
    type_instruction: typeInstructions[decision.message_type] || typeInstructions.check_in,
  }
}
