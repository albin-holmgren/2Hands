import { createClient } from '@/lib/supabase/server'
import { PRICING, hasFullAccess, hasGracePeriodAccess } from '@/lib/stripe/config'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Plan limits configuration
export const PLAN_LIMITS = {
  free: {
    agents: 2,
    creditsPerMonth: 300,
    maxConcurrentRuns: 1,
    features: ['basic_scheduling'],
  },
  starter: {
    agents: PRICING.subscriptions.starter.agents,
    creditsPerMonth: PRICING.subscriptions.starter.tiers[0].credits,
    maxConcurrentRuns: 2,
    features: ['basic_scheduling', 'email_notifications'],
  },
  pro: {
    agents: PRICING.subscriptions.pro.agents,
    creditsPerMonth: PRICING.subscriptions.pro.tiers[0].credits,
    maxConcurrentRuns: 5,
    features: ['basic_scheduling', 'email_notifications', 'advanced_scheduling', 'priority_support'],
  },
  business: {
    agents: PRICING.subscriptions.business.agents,
    creditsPerMonth: PRICING.subscriptions.business.tiers[0].credits,
    maxConcurrentRuns: 15,
    features: ['basic_scheduling', 'email_notifications', 'advanced_scheduling', 'priority_support', 'dedicated_support', 'api_access'],
  },
} as const

export type PlanType = keyof typeof PLAN_LIMITS

export interface PlanLimits {
  agents: number
  creditsPerMonth: number
  maxConcurrentRuns: number
  features: readonly string[]
}

interface UserProfile {
  id: string
  plan_type: PlanType | null
  credits: number
  subscription_status: string | null
}

interface LimitCheckResult {
  allowed: boolean
  reason?: string
  currentCount?: number
  limit?: number
}

type SupabaseLike = {
  from: SupabaseClient<Database>['from']
  rpc: SupabaseClient<Database>['rpc']
}

/**
 * Get user's current plan limits
 */
export function getPlanLimits(planType: PlanType | null): PlanLimits {
  return PLAN_LIMITS[planType || 'free'] || PLAN_LIMITS.free
}

/**
 * Check if user can create a new agent
 */
export async function canCreateAgent(userId: string, supabase?: SupabaseLike): Promise<LimitCheckResult> {
  const sb = supabase ?? (await createClient())
  
  // Get user profile
  const { data: profile, error: profileError } = await sb
    .from('profiles')
    .select('plan_type, subscription_status')
    .eq('id', userId)
    .single() as { data: { plan_type: PlanType | null; subscription_status: string | null } | null; error: { message?: string } | null }

  let effectiveProfile = profile

  if (!effectiveProfile && profileError && String(profileError.message || '').includes('subscription_status')) {
    const { data: retryProfile } = await sb
      .from('profiles')
      .select('plan_type')
      .eq('id', userId)
      .single() as { data: { plan_type: PlanType | null } | null }
    if (retryProfile) {
      effectiveProfile = { plan_type: retryProfile.plan_type, subscription_status: null }
    }
  }
  
  if (!effectiveProfile) {
    return { allowed: false, reason: 'User profile not found' }
  }
  
  // Check subscription status - block only truly inactive states
  // Grace period (past_due) still allows limited access
  const status = effectiveProfile.subscription_status
  if (status && !hasFullAccess(status) && !hasGracePeriodAccess(status)) {
    return { allowed: false, reason: 'Your subscription is inactive. Please update your subscription to continue.' }
  }
  
  // Get current agent count
  const { count } = await sb
    .from('agents')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
  
  const currentCount = count || 0
  const limits = getPlanLimits(effectiveProfile.plan_type)
  
  if (currentCount >= limits.agents) {
    return { 
      allowed: false, 
      reason: `You've reached your plan's agent limit (${limits.agents}). Upgrade to create more agents.`,
      currentCount,
      limit: limits.agents,
    }
  }
  
  return { allowed: true, currentCount, limit: limits.agents }
}

/**
 * Check if user has enough credits for an operation
 */
export async function hasEnoughCredits(userId: string, requiredCredits: number, supabase?: SupabaseLike): Promise<LimitCheckResult> {
  const sb = supabase ?? (await createClient())
  
  const { data: profile, error: profileError } = await sb
    .from('profiles')
    .select('credits, plan_type, subscription_status')
    .eq('id', userId)
    .single() as { data: UserProfile | null; error: { message?: string } | null }

  let effectiveProfile = profile
  if (!effectiveProfile && profileError && String(profileError.message || '').includes('subscription_status')) {
    const { data: retryProfile } = await sb
      .from('profiles')
      .select('credits, plan_type')
      .eq('id', userId)
      .single() as { data: (Omit<UserProfile, 'subscription_status'> & { subscription_status?: never }) | null }
    if (retryProfile) {
      effectiveProfile = { ...retryProfile, subscription_status: null } as UserProfile
    }
  }
  
  if (!effectiveProfile) {
    return { allowed: false, reason: 'User profile not found' }
  }
  
  // Check subscription status - block only truly inactive states
  const status = effectiveProfile.subscription_status
  if (status && !hasFullAccess(status) && !hasGracePeriodAccess(status)) {
    return { allowed: false, reason: 'Your subscription is inactive. Please update your subscription to continue.' }
  }
  
  if (effectiveProfile.credits < requiredCredits) {
    return { 
      allowed: false, 
      reason: `Insufficient credits. You need ${requiredCredits} credits but only have ${effectiveProfile.credits}.`,
      currentCount: effectiveProfile.credits,
      limit: requiredCredits,
    }
  }
  
  return { allowed: true, currentCount: effectiveProfile.credits }
}

/**
 * Check if user can run an agent (credits + concurrent runs)
 */
export async function canRunAgent(userId: string, estimatedCredits: number = 10, supabase?: SupabaseLike): Promise<LimitCheckResult> {
  const sb = supabase ?? (await createClient())
  
  // Get user profile
  const { data: profile, error: profileError } = await sb
    .from('profiles')
    .select('credits, plan_type, subscription_status')
    .eq('id', userId)
    .single() as { data: UserProfile | null; error: { message?: string } | null }

  let effectiveProfile = profile
  if (!effectiveProfile && profileError && String(profileError.message || '').includes('subscription_status')) {
    const { data: retryProfile } = await sb
      .from('profiles')
      .select('credits, plan_type')
      .eq('id', userId)
      .single() as { data: (Omit<UserProfile, 'subscription_status'> & { subscription_status?: never }) | null }
    if (retryProfile) {
      effectiveProfile = { ...retryProfile, subscription_status: null } as UserProfile
    }
  }
  
  if (!effectiveProfile) {
    return { allowed: false, reason: 'User profile not found' }
  }
  
  // Check subscription status - block only truly inactive states
  const status = effectiveProfile.subscription_status
  if (status && !hasFullAccess(status) && !hasGracePeriodAccess(status)) {
    return { allowed: false, reason: 'Your subscription is inactive. Please update your subscription to continue.' }
  }
  
  // Check credits
  if (effectiveProfile.credits < estimatedCredits) {
    return { 
      allowed: false, 
      reason: `Insufficient credits. This run requires ~${estimatedCredits} credits but you have ${effectiveProfile.credits}.`,
      currentCount: effectiveProfile.credits,
      limit: estimatedCredits,
    }
  }
  
  // Check concurrent runs
  const limits = getPlanLimits(effectiveProfile.plan_type)
  const { count } = await sb
    .from('agents')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['working', 'initializing'])
  
  const runningCount = count || 0
  
  if (runningCount >= limits.maxConcurrentRuns) {
    return { 
      allowed: false, 
      reason: `You've reached your concurrent run limit (${limits.maxConcurrentRuns}). Wait for a run to complete or upgrade your plan.`,
      currentCount: runningCount,
      limit: limits.maxConcurrentRuns,
    }
  }
  
  return { allowed: true }
}

/**
 * Check if user has access to a specific feature
 */
export async function hasFeatureAccess(userId: string, feature: string, supabase?: SupabaseLike): Promise<boolean> {
  const sb = supabase ?? (await createClient())
  
  const { data: profile } = await sb
    .from('profiles')
    .select('plan_type, subscription_status')
    .eq('id', userId)
    .single() as { data: { plan_type: PlanType | null; subscription_status: string | null } | null }
  
  if (!profile) return false
  const status = profile.subscription_status
  if (status && !hasFullAccess(status) && !hasGracePeriodAccess(status)) return false
  
  const limits = getPlanLimits(profile.plan_type)
  return limits.features.includes(feature)
}

/**
 * Get user's usage summary
 */
export async function getUserUsageSummary(userId: string, supabase?: SupabaseLike) {
  const sb = supabase ?? (await createClient())
  
  const { data: profile } = await sb
    .from('profiles')
    .select('plan_type, credits, subscription_status')
    .eq('id', userId)
    .single() as { data: UserProfile | null }
  
  if (!profile) return null
  
  const { count: agentCount } = await sb
    .from('agents')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
  
  const { count: runningCount } = await sb
    .from('agents')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['working', 'initializing'])
  
  const limits = getPlanLimits(profile.plan_type)
  
  return {
    plan: profile.plan_type || 'free',
    subscriptionStatus: profile.subscription_status,
    credits: {
      current: profile.credits,
      monthlyAllowance: limits.creditsPerMonth,
    },
    agents: {
      current: agentCount || 0,
      limit: limits.agents,
    },
    concurrentRuns: {
      current: runningCount || 0,
      limit: limits.maxConcurrentRuns,
    },
    features: limits.features,
  }
}
