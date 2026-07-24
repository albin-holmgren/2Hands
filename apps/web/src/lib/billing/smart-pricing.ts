/**
 * Smart Pricing Engine
 *
 * Analyzes user usage patterns to:
 * - Suggest the optimal plan (avoid overpaying or running out)
 * - Predict credit consumption for the next billing period
 * - Warn about upcoming overages
 * - Calculate cost-per-task efficiency
 */

import { createClient } from '@/lib/supabase/server'
import { PRICING, type SubscriptionPlanType } from '@/lib/stripe/config'

// ============================================================
// Types
// ============================================================

export interface UsageAnalysis {
  currentPlan: string
  creditsUsedThisPeriod: number
  creditsRemaining: number
  daysLeftInPeriod: number
  projectedUsage: number
  projectedOverage: number
  costPerTask: number
  avgTasksPerDay: number
  recommendation: PlanRecommendation | null
  trend: 'increasing' | 'stable' | 'decreasing'
}

export interface PlanRecommendation {
  suggestedPlan: string
  reason: string
  monthlySavings: number
  confidence: 'high' | 'medium' | 'low'
}

interface PlanInfo {
  name: string
  monthlyCredits: number
  priceUsd: number
  features: string[]
}

// Derive PLANS from PRICING config (using t1 base tier as the reference)
const PLANS: Record<string, PlanInfo> = {
  free: {
    name: 'Free',
    monthlyCredits: PRICING.free.dailyCredits * 30,
    priceUsd: 0,
    features: [`${PRICING.free.agents} agents`, `${PRICING.free.dailyCredits} credits/day`],
  },
  ...(['starter', 'pro', 'business'] as SubscriptionPlanType[]).reduce((acc, key) => {
    const plan = PRICING.subscriptions[key]
    const baseTier = plan.tiers[0]
    acc[key] = {
      name: plan.name,
      monthlyCredits: baseTier.credits,
      priceUsd: baseTier.monthlyPrice / 100,
      features: [`${plan.agents} agents`, `${baseTier.credits.toLocaleString()} credits/mo`, ...plan.features],
    }
    return acc
  }, {} as Record<string, PlanInfo>),
}

// ============================================================
// Usage Analysis
// ============================================================

/**
 * Analyze a user's usage pattern and generate smart pricing recommendations.
 * Uses workspace-scoped credits as the single source of truth, matching the UI badge.
 */
export async function analyzeUsage(userId: string, workspaceId?: string): Promise<UsageAnalysis> {
  const supabase = await createClient()

  // Fetch workspace credits + plan (workspace is the source of truth shown in the UI)
  let creditsRemaining = 0
  let currentPlan = 'free'
  let billingPeriodStart: string | null = null

  if (workspaceId) {
    const { data: ws } = await supabase
      .from('workspaces')
      .select('credits_balance, plan_type')
      .eq('id', workspaceId)
      .single()
    const wsData = ws as { credits_balance: number | null; plan_type: string | null } | null
    creditsRemaining = wsData?.credits_balance ?? 0
    currentPlan = wsData?.plan_type || 'free'
  } else {
    // Fallback to profile when no workspace context (legacy paths)
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits, plan_type, billing_period_start')
      .eq('id', userId)
      .single()
    const profileData = profile as { credits: number; plan_type: string; billing_period_start: string | null } | null
    creditsRemaining = profileData?.credits ?? 0
    currentPlan = profileData?.plan_type || 'free'
    billingPeriodStart = profileData?.billing_period_start ?? null
  }

  const planInfo = PLANS[currentPlan] || PLANS.free

  // Get recent daily usage (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: recentRuns } = await supabase
    .from('agent_progress')
    .select('created_at, status')
    .eq('user_id', userId)
    .gte('created_at', thirtyDaysAgo)
    .in('status', ['completed', 'failed'])

  const runs = (recentRuns || []) as Array<{ created_at: string; status: string }>

  // Calculate daily usage stats
  const dailyUsage = new Map<string, number>()
  for (const run of runs) {
    const dateKey = run.created_at.split('T')[0]
    dailyUsage.set(dateKey, (dailyUsage.get(dateKey) || 0) + 1)
  }

  const totalTasks = runs.length
  const activeDays = dailyUsage.size || 1
  const avgTasksPerDay = Math.round((totalTasks / Math.max(activeDays, 1)) * 10) / 10

  // Estimate credits used this period
  const creditsUsedThisPeriod = planInfo.monthlyCredits - creditsRemaining

  // Calculate days left in billing period
  const periodStart = billingPeriodStart
    ? new Date(billingPeriodStart)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const periodEnd = new Date(periodStart)
  periodEnd.setMonth(periodEnd.getMonth() + 1)
  const daysLeftInPeriod = Math.max(0, Math.ceil((periodEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
  const daysPassed = Math.max(1, 30 - daysLeftInPeriod)

  // Project usage for the rest of the period
  const dailyBurnRate = creditsUsedThisPeriod / daysPassed
  const projectedUsage = Math.round(dailyBurnRate * 30)
  const projectedOverage = Math.max(0, projectedUsage - planInfo.monthlyCredits)

  // Calculate cost per task
  const completedTasks = runs.filter(r => r.status === 'completed').length
  const costPerTask = completedTasks > 0
    ? Math.round((planInfo.priceUsd / Math.max(completedTasks, 1)) * 100) / 100
    : 0

  // Detect trend (compare first half vs second half of the period)
  const halfwayDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  let firstHalf = 0, secondHalf = 0
  for (const [date, count] of dailyUsage) {
    if (date < halfwayDate) firstHalf += count
    else secondHalf += count
  }
  const trend: UsageAnalysis['trend'] = secondHalf > firstHalf * 1.2
    ? 'increasing'
    : secondHalf < firstHalf * 0.8
      ? 'decreasing'
      : 'stable'

  // Generate plan recommendation
  const recommendation = generateRecommendation(
    currentPlan, projectedUsage, creditsRemaining, daysLeftInPeriod, avgTasksPerDay, trend
  )

  return {
    currentPlan,
    creditsUsedThisPeriod,
    creditsRemaining,
    daysLeftInPeriod,
    projectedUsage,
    projectedOverage,
    costPerTask,
    avgTasksPerDay,
    recommendation,
    trend,
  }
}

// ============================================================
// Plan Recommendation
// ============================================================

function generateRecommendation(
  currentPlan: string,
  projectedUsage: number,
  creditsRemaining: number,
  daysLeft: number,
  avgTasksPerDay: number,
  trend: UsageAnalysis['trend']
): PlanRecommendation | null {
  const planOrder = ['free', 'starter', 'pro', 'business']
  const currentIdx = planOrder.indexOf(currentPlan)
  const current = PLANS[currentPlan] || PLANS.free

  // Check if user is about to run out
  if (creditsRemaining < projectedUsage * 0.3 && daysLeft > 5) {
    // User will likely run out — suggest upgrade
    const nextPlan = planOrder[Math.min(currentIdx + 1, planOrder.length - 1)]
    if (nextPlan !== currentPlan) {
      const next = PLANS[nextPlan]
      return {
        suggestedPlan: nextPlan,
        reason: `At your current pace (~${avgTasksPerDay} tasks/day), you'll run out of credits with ${daysLeft} days left. ${next.name} gives you ${next.monthlyCredits} credits/month.`,
        monthlySavings: 0, // upgrade costs more but prevents overages
        confidence: trend === 'increasing' ? 'high' : 'medium',
      }
    }
  }

  // Check if user is overpaying (using <40% of plan)
  if (projectedUsage < current.monthlyCredits * 0.4 && currentIdx > 0) {
    const lowerPlan = planOrder[currentIdx - 1]
    const lower = PLANS[lowerPlan]
    if (projectedUsage < lower.monthlyCredits * 0.9) {
      return {
        suggestedPlan: lowerPlan,
        reason: `You're only using ~${Math.round((projectedUsage / current.monthlyCredits) * 100)}% of your ${current.name} plan. ${lower.name} would cover your usage and save you $${current.priceUsd - lower.priceUsd}/month.`,
        monthlySavings: current.priceUsd - lower.priceUsd,
        confidence: trend === 'decreasing' ? 'high' : 'medium',
      }
    }
  }

  // Check if user is on free plan and hitting limits
  if (currentPlan === 'free' && avgTasksPerDay > 1) {
    return {
      suggestedPlan: 'starter',
      reason: `You're actively using 2Hands with ~${avgTasksPerDay} tasks/day. Starter plan unlocks more agents and 2000 credits/month for just $25.`,
      monthlySavings: 0,
      confidence: 'high',
    }
  }

  return null
}

/**
 * Generate a prompt section for the AI Manager about pricing context.
 * Pass workspaceId so credits reflect what the user sees in the UI badge.
 */
export async function getPricingContext(userId: string, workspaceId?: string): Promise<string> {
  try {
    const analysis = await analyzeUsage(userId, workspaceId)

    if (!analysis.recommendation) return ''

    return `\n\nPRICING INSIGHT: ${analysis.recommendation.reason} (${analysis.recommendation.confidence} confidence). Current usage: ${analysis.creditsUsedThisPeriod} credits used, ${analysis.creditsRemaining} remaining, ${analysis.daysLeftInPeriod} days left. Only mention this if the user asks about pricing/credits/plans, or if they're about to create a new agent and might run out.`
  } catch {
    return ''
  }
}
