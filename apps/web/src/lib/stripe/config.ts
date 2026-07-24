// Stripe pricing configuration
// All prices in USD cents

// Stripe Price IDs - loaded from environment variables for security
// NEVER hardcode live price IDs in code - use env vars instead
// Each plan has 3 credit tiers (t1/t2/t3) x 2 intervals = 6 price IDs per plan
const getStripePrices = () => ({
  starter: {
    t1: { monthly: process.env.STRIPE_PRICE_STARTER_T1_MONTHLY || '', yearly: process.env.STRIPE_PRICE_STARTER_T1_YEARLY || '' },
    t2: { monthly: process.env.STRIPE_PRICE_STARTER_T2_MONTHLY || '', yearly: process.env.STRIPE_PRICE_STARTER_T2_YEARLY || '' },
    t3: { monthly: process.env.STRIPE_PRICE_STARTER_T3_MONTHLY || '', yearly: process.env.STRIPE_PRICE_STARTER_T3_YEARLY || '' },
  },
  pro: {
    t1: { monthly: process.env.STRIPE_PRICE_PRO_T1_MONTHLY || '', yearly: process.env.STRIPE_PRICE_PRO_T1_YEARLY || '' },
    t2: { monthly: process.env.STRIPE_PRICE_PRO_T2_MONTHLY || '', yearly: process.env.STRIPE_PRICE_PRO_T2_YEARLY || '' },
    t3: { monthly: process.env.STRIPE_PRICE_PRO_T3_MONTHLY || '', yearly: process.env.STRIPE_PRICE_PRO_T3_YEARLY || '' },
  },
  business: {
    t1: { monthly: process.env.STRIPE_PRICE_BUSINESS_T1_MONTHLY || '', yearly: process.env.STRIPE_PRICE_BUSINESS_T1_YEARLY || '' },
    t2: { monthly: process.env.STRIPE_PRICE_BUSINESS_T2_MONTHLY || '', yearly: process.env.STRIPE_PRICE_BUSINESS_T2_YEARLY || '' },
    t3: { monthly: process.env.STRIPE_PRICE_BUSINESS_T3_MONTHLY || '', yearly: process.env.STRIPE_PRICE_BUSINESS_T3_YEARLY || '' },
  },
  creditPacks: {
    small: process.env.STRIPE_PRICE_CREDITS_SMALL || '',
    medium: process.env.STRIPE_PRICE_CREDITS_MEDIUM || '',
    large: process.env.STRIPE_PRICE_CREDITS_LARGE || '',
    xlarge: process.env.STRIPE_PRICE_CREDITS_XLARGE || '',
  },
})

// Lazy-loaded to ensure env vars are available
let _stripePrices: ReturnType<typeof getStripePrices> | null = null
export const STRIPE_PRICES = new Proxy({} as ReturnType<typeof getStripePrices>, {
  get(_, prop) {
    if (!_stripePrices) _stripePrices = getStripePrices()
    return _stripePrices[prop as keyof typeof _stripePrices]
  },
})

// Credit tier definitions per plan
// Each plan has 3 tiers: t1 (base), t2 (mid), t3 (high)
export type CreditTierKey = 't1' | 't2' | 't3'

export interface CreditTier {
  key: CreditTierKey
  credits: number
  monthlyPrice: number // cents
  yearlyPrice: number  // cents
  label: string        // e.g. "10,000 credits / month"
}

export interface PlanConfig {
  name: string
  description: string
  agents: number
  popular?: boolean
  tiers: CreditTier[]
  features: string[]
}

export const PRICING = {
  subscriptions: {
    starter: {
      name: 'Starter',
      description: 'For individuals getting started with AI automation',
      agents: 5,
      tiers: [
        { key: 't1', credits: 10000, monthlyPrice: 2500, yearlyPrice: 25000, label: '10,000 credits / month' },
        { key: 't2', credits: 20000, monthlyPrice: 4000, yearlyPrice: 40000, label: '20,000 credits / month' },
        { key: 't3', credits: 35000, monthlyPrice: 6000, yearlyPrice: 60000, label: '35,000 credits / month' },
      ],
      features: [
        'Up to 5 agents',
        'Basic scheduling',
        'Email support',
      ],
    } as PlanConfig,
    pro: {
      name: 'Pro',
      description: 'For power users and small teams',
      agents: 15,
      popular: true,
      tiers: [
        { key: 't1', credits: 50000, monthlyPrice: 4900, yearlyPrice: 49000, label: '50,000 credits / month' },
        { key: 't2', credits: 80000, monthlyPrice: 7900, yearlyPrice: 79000, label: '80,000 credits / month' },
        { key: 't3', credits: 120000, monthlyPrice: 11900, yearlyPrice: 119000, label: '120,000 credits / month' },
      ],
      features: [
        'Up to 15 agents',
        'Advanced scheduling',
        'Higher concurrency',
        'Priority support',
      ],
    } as PlanConfig,
    business: {
      name: 'Business',
      description: 'For growing teams and departments',
      agents: 50,
      tiers: [
        { key: 't1', credits: 200000, monthlyPrice: 14900, yearlyPrice: 149000, label: '200,000 credits / month' },
        { key: 't2', credits: 350000, monthlyPrice: 24900, yearlyPrice: 249000, label: '350,000 credits / month' },
        { key: 't3', credits: 600000, monthlyPrice: 39900, yearlyPrice: 399000, label: '600,000 credits / month' },
      ],
      features: [
        'Up to 50 agents',
        'Highest concurrency',
        'Priority queue',
        'Dedicated support',
      ],
    } as PlanConfig,
  },
  creditPacks: {
    small: {
      name: 'Small Pack',
      price: 1000, // $10
      credits: 2500,
    },
    medium: {
      name: 'Medium Pack',
      price: 2500, // $25
      credits: 7500,
      bestValue: true,
    },
    large: {
      name: 'Large Pack',
      price: 6000, // $60
      credits: 20000,
    },
    xlarge: {
      name: 'XL Pack',
      price: 12000, // $120
      credits: 45000,
    },
  },
  // Credit burn rates
  burnRates: {
    typicalRun: 50,
    heavyRun: 300,
    realtimePerHour: 1000,
    chatMessageBase: 5,
    tokensPerCredit: 1000, // 1 credit per 1000 tokens
  },
  // Free tier
  free: {
    dailyCredits: 300,
    agents: 2,
  },
} as const

// Rollover cap multiplier: credits cap = monthly_credits * ROLLOVER_CAP_MULTIPLIER
export const ROLLOVER_CAP_MULTIPLIER = 2

export type PlanType = 'free' | 'starter' | 'pro' | 'business'
export type SubscriptionPlanType = 'starter' | 'pro' | 'business'
export type CreditPackType = 'small' | 'medium' | 'large' | 'xlarge'
export type BillingInterval = 'monthly' | 'yearly'

// Reverse mapping: Price ID -> Plan details
// Used in webhooks to determine plan from Stripe price ID (source of truth)
export interface PriceIdMapping {
  plan: PlanType
  interval: BillingInterval
  credits: number
  agents: number
}

export interface CreditPackMapping {
  packType: CreditPackType
  credits: number
}

// Build reverse mapping for subscriptions dynamically from tiers
// Skips empty price IDs to avoid '' key collisions
function buildPriceToPlan(): Record<string, PriceIdMapping> {
  const map: Record<string, PriceIdMapping> = {}
  const plans: SubscriptionPlanType[] = ['starter', 'pro', 'business']
  const intervals: BillingInterval[] = ['monthly', 'yearly']
  const tierKeys: CreditTierKey[] = ['t1', 't2', 't3']

  for (const plan of plans) {
    const planConfig = PRICING.subscriptions[plan]
    for (const tierKey of tierKeys) {
      const tier = planConfig.tiers.find(t => t.key === tierKey)
      if (!tier) continue
      for (const interval of intervals) {
        const priceId = STRIPE_PRICES[plan]?.[tierKey]?.[interval]
        if (priceId) {
          map[priceId] = {
            plan,
            interval,
            credits: tier.credits,
            agents: planConfig.agents,
          }
        }
      }
    }
  }
  return map
}

let _priceToPlan: Record<string, PriceIdMapping> | null = null
function getPriceToPlan() {
  if (!_priceToPlan) _priceToPlan = buildPriceToPlan()
  return _priceToPlan
}

// Build reverse mapping for credit packs
const PRICE_TO_CREDIT_PACK: Record<string, CreditPackMapping> = {
  [STRIPE_PRICES.creditPacks.small]: { packType: 'small', credits: PRICING.creditPacks.small.credits },
  [STRIPE_PRICES.creditPacks.medium]: { packType: 'medium', credits: PRICING.creditPacks.medium.credits },
  [STRIPE_PRICES.creditPacks.large]: { packType: 'large', credits: PRICING.creditPacks.large.credits },
  [STRIPE_PRICES.creditPacks.xlarge]: { packType: 'xlarge', credits: PRICING.creditPacks.xlarge.credits },
}

/**
 * Get plan details from a Stripe Price ID
 * Used in webhooks to determine plan from subscription line items
 */
export function getPlanFromPriceId(priceId: string): PriceIdMapping | null {
  return getPriceToPlan()[priceId] || null
}

/**
 * Get credit pack details from a Stripe Price ID
 */
export function getCreditPackFromPriceId(priceId: string): CreditPackMapping | null {
  return PRICE_TO_CREDIT_PACK[priceId] || null
}

/**
 * Check if a price ID is a subscription price
 */
export function isSubscriptionPrice(priceId: string): boolean {
  return priceId in getPriceToPlan()
}

/**
 * Get the Stripe Price ID for a specific plan + tier + interval combo.
 * Used in checkout to map user selection to the correct Stripe price.
 */
export function getStripePriceId(
  plan: SubscriptionPlanType,
  tierKey: CreditTierKey,
  interval: BillingInterval
): string | null {
  const priceId = STRIPE_PRICES[plan]?.[tierKey]?.[interval]
  return priceId || null
}

/**
 * Get the default (t1) tier for a plan
 */
export function getDefaultTier(plan: SubscriptionPlanType): CreditTier {
  return PRICING.subscriptions[plan].tiers[0]
}

/**
 * Find which tier key matches a given credits-per-month value for a plan
 */
export function getTierByCredits(plan: SubscriptionPlanType, credits: number): CreditTier | null {
  return PRICING.subscriptions[plan].tiers.find(t => t.credits === credits) || null
}

/**
 * Check if a price ID is a credit pack price
 */
export function isCreditPackPrice(priceId: string): boolean {
  return priceId in PRICE_TO_CREDIT_PACK
}

// Valid subscription statuses that grant access
export const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing'] as const
export const GRACE_PERIOD_STATUSES = ['past_due'] as const // Limited access
export const INACTIVE_STATUSES = ['canceled', 'unpaid', 'paused', 'incomplete', 'incomplete_expired'] as const

export type SubscriptionStatus = 
  | typeof ACTIVE_SUBSCRIPTION_STATUSES[number]
  | typeof GRACE_PERIOD_STATUSES[number]
  | typeof INACTIVE_STATUSES[number]

/**
 * Check if a subscription status grants full access
 */
export function hasFullAccess(status: string | null): boolean {
  if (!status) return false
  return (ACTIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status)
}

/**
 * Check if a subscription status grants limited/grace period access
 */
export function hasGracePeriodAccess(status: string | null): boolean {
  if (!status) return false
  return (GRACE_PERIOD_STATUSES as readonly string[]).includes(status)
}

/**
 * Check if user has any access (full or grace period)
 */
export function hasAnyAccess(status: string | null): boolean {
  return hasFullAccess(status) || hasGracePeriodAccess(status)
}
