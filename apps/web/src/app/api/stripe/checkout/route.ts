/* eslint-disable @typescript-eslint/no-explicit-any */
// Stripe SDK types are mismatched with actual API - using any casts for checkout params

// Force Node.js runtime for Stripe API
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { createClient } from '@/lib/supabase/server'
import { PRICING, getStripePriceId, type SubscriptionPlanType, type CreditTierKey, STRIPE_PRICES } from '@/lib/stripe/config'
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { parseAndValidate, stripeCheckoutRequestSchema, validationErrorResponse } from '@/lib/validation/schemas'

export async function POST(request: NextRequest) {
  try {
    // Check for Bearer token (mobile) or cookies (web)
    const authHeader = request.headers.get('Authorization')
    let supabase = await createClient()
    let user = null

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const { createClient: createBrowserClient } = await import('@supabase/supabase-js')
      const supabaseWithToken = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        }
      )
      const { data: { user: tokenUser }, error } = await supabaseWithToken.auth.getUser(token)
      if (!error && tokenUser) {
        user = tokenUser
        supabase = supabaseWithToken
      }
    } else {
      const { data: { user: cookieUser }, error } = await supabase.auth.getUser()
      if (!error) user = cookieUser
    }

    // ALWAYS require authentication - no exceptions
    if (!user || !user.id) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
    }

    // Rate limiting
    const rateKey = createRateLimitKey(user.id, 'checkout')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.checkout)
    if (!rateCheck.allowed) {
      return NextResponse.json({ 
        error: 'Too many checkout requests. Please wait a moment.',
        code: 'RATE_LIMITED',
        retryAfter: Math.ceil((rateCheck.resetAt - Date.now()) / 1000),
      }, { status: 429 })
    }

    const parsed = await parseAndValidate(request, stripeCheckoutRequestSchema)
    if (!parsed.success) {
      return NextResponse.json(validationErrorResponse(parsed.error), { status: parsed.status })
    }
    
    const { priceType, plan, interval, tierKey, packType } = parsed.data
    const customAmount = parsed.data.customAmount

    // Get or create Stripe customer and check plan
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, email, plan_type, subscription_status')
      .eq('id', user.id)
      .single() as { data: { stripe_customer_id: string | null; email: string; plan_type: string | null; subscription_status: string | null } | null }

    // Gate: credit pack purchases are only allowed on paid plans
    if (priceType === 'credits') {
      const planType = profile?.plan_type || 'free'
      const subStatus = profile?.subscription_status
      const isPaid = planType !== 'free' && (subStatus === 'active' || subStatus === 'trialing' || subStatus === 'past_due')
      if (!isPaid) {
        return NextResponse.json(
          { error: 'Credit packs are only available on paid plans. Please upgrade first.', code: 'FREE_PLAN' },
          { status: 403 }
        )
      }
    }

    let customerId = profile?.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || profile?.email,
        metadata: {
          supabase_user_id: user.id,
        },
      })
      customerId = customer.id

      // Save customer ID to profile
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId } as never)
        .eq('id', user.id)
    }

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim() || 'http://localhost:3000'

    if (priceType === 'subscription') {
      // Validate plan
      const validPlans: SubscriptionPlanType[] = ['starter', 'pro', 'business']
      if (!validPlans.includes(plan as SubscriptionPlanType)) {
        return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
      }
      const planConfig = PRICING.subscriptions[plan as SubscriptionPlanType]

      // Resolve tier (default to t1 if not specified)
      const selectedTier = (tierKey || 't1') as CreditTierKey
      const tier = planConfig.tiers.find(t => t.key === selectedTier)
      if (!tier) {
        return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
      }

      // Get the correct Stripe Price ID based on plan + tier + interval
      const billingInterval = interval === 'yearly' ? 'yearly' : 'monthly' as const
      const priceId = getStripePriceId(plan as SubscriptionPlanType, selectedTier, billingInterval)
      if (!priceId) {
        return NextResponse.json({ error: 'Price not configured for this tier' }, { status: 400 })
      }

      const session = await (stripe.checkout.sessions.create as any)({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        metadata: {
          user_id: user.id,
          plan: plan,
          interval: billingInterval,
          tier: selectedTier,
          credits: tier.credits.toString(),
        },
        success_url: `${baseUrl}/app?checkout=success`,
        cancel_url: `${baseUrl}/pricing?checkout=cancelled`,
        subscription_data: {
          metadata: {
            user_id: user.id,
            plan: plan,
            tier: selectedTier,
            credits: tier.credits.toString(),
          },
        },
      })

      return NextResponse.json({ url: session.url })
    } else if (priceType === 'credits') {
      let packPriceId: string | undefined
      let credits = 0
      let amount = 0

      if (packType === 'custom') {
        const customCredits = customAmount ?? 10000
        // Standard rate: $4 per 1000 credits = $0.004 per credit
        amount = Math.ceil(customCredits * 0.4) // Amount in cents ($0.004 * 100 cents)
        credits = customCredits
        
        // For custom amounts, we'll use a specific product and create a price on the fly or use a generic one
        // Better: create a checkout session with ad-hoc price data if possible, 
        // but Stripe Checkout sessions usually require a price_id for 'payment' mode line items
        // unless using 'price_data'.
      } else {
        const packConfig = PRICING.creditPacks[packType as keyof typeof PRICING.creditPacks]
        if (!packConfig) {
          return NextResponse.json({ error: 'Invalid pack type' }, { status: 400 })
        }
        packPriceId = STRIPE_PRICES.creditPacks[packType as keyof typeof STRIPE_PRICES.creditPacks]
        credits = packConfig.credits
      }

      const session = await (stripe.checkout.sessions.create as any)({
        customer: customerId,
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          packType === 'custom' 
            ? {
                price_data: {
                  currency: 'usd',
                  product_data: {
                    name: `Custom Credit Pack (${credits.toLocaleString()} credits)`,
                    description: 'One-time credit purchase for 2Hands agents',
                  },
                  unit_amount: amount,
                },
                quantity: 1,
              }
            : {
                price: packPriceId,
                quantity: 1,
              },
        ],
        metadata: {
          user_id: user.id,
          type: 'credit_pack',
          pack: packType,
          credits: credits.toString(),
        },
        success_url: `${baseUrl}/app?credits=success`,
        cancel_url: `${baseUrl}/app?credits=cancelled`,
      })

      return NextResponse.json({ url: session.url })
    }

    return NextResponse.json({ error: 'Invalid price type' }, { status: 400 })
  } catch (error) {
    console.error('Stripe checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
