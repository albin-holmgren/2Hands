// Force Node.js runtime for Stripe webhook verification
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { createClient } from '@supabase/supabase-js'
import { 
  getPlanFromPriceId, 
  getCreditPackFromPriceId,
  hasFullAccess,
  ROLLOVER_CAP_MULTIPLIER
} from '@/lib/stripe/config'
import Stripe from 'stripe'
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit'
import { resizeComputersForPlan } from '@/lib/v3/computers'

// Lazy initialization to avoid build-time errors
let _supabaseAdmin: ReturnType<typeof createClient> | null = null

function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing required Supabase environment variables for webhook')
    }
    
    _supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
  }
  return _supabaseAdmin
}

/**
 * Atomically claim webhook event for processing (prevents race conditions)
 * Returns true only if this instance successfully claimed the event
 */
async function claimWebhookEvent(eventId: string, eventType: string): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (getSupabaseAdmin().rpc as any)('claim_webhook_event', { p_event_id: eventId, p_event_type: eventType })
  
  if (error) {
    console.error('Failed to claim webhook event:', error)
    return false
  }
  
  return data === true
}

/**
 * Atomically adjust user credits using database function
 */
async function adjustCredits(
  userId: string, 
  amount: number, 
  reason?: string,
  maxCredits?: number
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (getSupabaseAdmin().rpc as any)('adjust_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_reason: reason || null,
      p_max_credits: maxCredits || null,
    })
    .single()

  if (error) {
    console.error('adjust_credits RPC error:', error)
    return { success: false, newBalance: 0, error: error.message }
  }

  const result = data as { success: boolean; new_balance: number; error_message: string | null }
  return { 
    success: result.success, 
    newBalance: result.new_balance,
    error: result.error_message || undefined 
  }
}

/**
 * Add paid credits to the user's personal workspace.
 * Uses the add_paid_workspace_credits RPC which increments both
 * paid_credits_balance and credits_balance atomically.
 */
async function addPaidWorkspaceCredits(
  userId: string,
  amount: number,
  reason?: string
): Promise<{ success: boolean; newBalance: number; error?: string }> {
  // Resolve personal workspace
  const { data: ws, error: wsError } = await getSupabaseAdmin()
    .from('workspaces')
    .select('id')
    .eq('owner_id', userId)
    .eq('is_personal', true)
    .single()

  if (wsError || !ws) {
    // Fall back to any workspace owned by this user
    const { data: anyWs } = await getSupabaseAdmin()
      .from('workspaces')
      .select('id')
      .eq('owner_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    if (!anyWs) {
      console.error('[Webhook] No workspace found for user', userId)
      return { success: false, newBalance: 0, error: 'Workspace not found' }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (getSupabaseAdmin().rpc as any)('add_paid_workspace_credits', {
      p_workspace_id: (anyWs as { id: string }).id,
      p_amount: amount,
      p_reason: reason || 'purchase',
    }).single()
    if (error) return { success: false, newBalance: 0, error: error.message }
    const r = data as { new_balance: number; success: boolean }
    return { success: r.success, newBalance: r.new_balance }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (getSupabaseAdmin().rpc as any)('add_paid_workspace_credits', {
    p_workspace_id: (ws as { id: string }).id,
    p_amount: amount,
    p_reason: reason || 'purchase',
  }).single()

  if (error) {
    console.error('add_paid_workspace_credits RPC error:', error)
    return { success: false, newBalance: 0, error: error.message }
  }

  const result = data as { new_balance: number; success: boolean }
  return { success: result.success, newBalance: result.new_balance }
}

/**
 * Get plan details from subscription's current price
 * This is the source of truth - not metadata
 */
function getPlanFromSubscription(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0]
  if (!item) return null
  
  const priceId = item.price.id
  return getPlanFromPriceId(priceId)
}

/**
 * Get user ID from subscription (try metadata first, then customer lookup)
 */
async function getUserIdFromSubscription(subscription: Stripe.Subscription): Promise<string | null> {
  // First try metadata
  if (subscription.metadata?.user_id) {
    return subscription.metadata.user_id
  }
  
  // Fallback: lookup by stripe_subscription_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (getSupabaseAdmin() as any)
    .from('profiles')
    .select('id')
    .eq('stripe_subscription_id', subscription.id)
    .single()
  
  return data?.id || null
}


/**
 * Give the user the hardware their plan now grants.
 *
 * Never allowed to break the webhook: a computer left on the old size is
 * recoverable, whereas throwing here makes Stripe retry the event and can
 * leave the subscription itself unapplied.
 */
async function applyPlanToComputers(userId: string, plan: string) {
  try {
    const result = await resizeComputersForPlan(userId, plan as never)
    if (result.resized || result.failed) {
      console.log(
        `Computers resized for ${userId} -> ${plan}: ${result.resized} ok, ${result.failed} failed`,
        result.errors,
      )
    }
  } catch (error) {
    console.error(`Computer resize failed for ${userId} -> ${plan}:`, error)
  }
}

export async function POST(request: NextRequest) {
  // Rate limiting to prevent flooding
  const rateLimitResponse = await checkRateLimit(request, 'stripe-webhook', RATE_LIMITS.webhook)
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET || '').trim()
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not set')
    }
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Atomic claim - only one instance can process this event
  const claimed = await claimWebhookEvent(event.id, event.type)
  if (!claimed) {
    // Event already claimed by another instance
    return NextResponse.json({ received: true, skipped: true })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.user_id

        if (!userId) {
          console.error('No user_id in session metadata')
          break
        }

        if (session.mode === 'subscription') {
          // Get subscription to extract price ID (source of truth)
          const subscriptionId = session.subscription as string
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          const planDetails = getPlanFromSubscription(subscription)

          if (!planDetails) {
            console.error('Could not determine plan from subscription price')
            break
          }

          // Set initial credits for new subscription (capped at rollover limit)
          const creditCap = planDetails.credits * ROLLOVER_CAP_MULTIPLIER
          const { newBalance } = await adjustCredits(userId, planDetails.credits, 'New subscription activated', creditCap)

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (getSupabaseAdmin() as any)
            .from('profiles')
            .update({
              plan_type: planDetails.plan,
              stripe_subscription_id: subscriptionId,
              subscription_status: 'active',
              monthly_credits: planDetails.credits,
              monthly_credit_cap: creditCap,
              billing_period_start: new Date(((subscription as unknown as { current_period_start: number }).current_period_start) * 1000).toISOString(),
            })
            .eq('id', userId)

          console.log(`Subscription activated for user ${userId}: ${planDetails.plan} with ${planDetails.credits} credits/mo (cap: ${creditCap}). Balance: ${newBalance}`)

          await applyPlanToComputers(userId, planDetails.plan)

        } else if (session.mode === 'payment') {
          // One-time credit pack purchase - get credits from line items
          const lineItems = await stripe.checkout.sessions.listLineItems(session.id)
          const priceId = lineItems.data[0]?.price?.id
          
          let credits = 0
          if (priceId) {
            const packDetails = getCreditPackFromPriceId(priceId)
            credits = packDetails?.credits || 0
          }
          
          // Fallback to metadata if price lookup fails
          if (!credits) {
            credits = parseInt(session.metadata?.credits || '0', 10)
          }

          if (credits > 0) {
            const { newBalance } = await addPaidWorkspaceCredits(userId, credits, 'Credit pack purchase')
            console.log(`Added ${credits} paid credits to workspace for user ${userId}. New balance: ${newBalance}`)
          }
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = await getUserIdFromSubscription(subscription)

        if (!userId) {
          console.error('Could not find user for subscription', subscription.id)
          break
        }

        // Get plan from current price (handles upgrades/downgrades)
        const planDetails = getPlanFromSubscription(subscription)
        const status = subscription.status

        const updateData: Record<string, unknown> = {
          subscription_status: status,
        }

        // Update plan based on status and price
        if (hasFullAccess(status) && planDetails) {
          updateData.plan_type = planDetails.plan
          updateData.monthly_credits = planDetails.credits
          updateData.monthly_credit_cap = planDetails.credits * ROLLOVER_CAP_MULTIPLIER
        } else if (['canceled', 'unpaid', 'incomplete_expired'].includes(status)) {
          updateData.plan_type = 'free'
          updateData.monthly_credits = 0
          updateData.monthly_credit_cap = 0
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (getSupabaseAdmin() as any)
          .from('profiles')
          .update(updateData)
          .eq('id', userId)

        console.log(`Subscription updated for user ${userId}: status=${status}, plan=${planDetails?.plan || 'unchanged'}`)

        if (updateData.plan_type) {
          await applyPlanToComputers(userId, String(updateData.plan_type))
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = await getUserIdFromSubscription(subscription)

        if (!userId) break

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (getSupabaseAdmin() as any)
          .from('profiles')
          .update({
            plan_type: 'free',
            stripe_subscription_id: null,
            subscription_status: 'canceled',
            monthly_credits: 0,
            monthly_credit_cap: 0,
          })
          .eq('id', userId)

        console.log(`Subscription canceled for user ${userId}`)
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        
        // Only process subscription renewals (not the first payment)
        if (invoice.billing_reason === 'subscription_cycle') {
          const subscriptionId = (invoice as { subscription?: string }).subscription
          
          if (!subscriptionId) break
          
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          const userId = await getUserIdFromSubscription(subscription)
          const planDetails = getPlanFromSubscription(subscription)
          
          if (userId && planDetails) {
            // Add monthly credits atomically with rollover cap
            const creditCap = planDetails.credits * ROLLOVER_CAP_MULTIPLIER
            const { newBalance } = await adjustCredits(
              userId, 
              planDetails.credits, 
              `Monthly renewal: ${planDetails.plan}`,
              creditCap
            )

            // Ensure subscription status is active
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (getSupabaseAdmin() as any)
              .from('profiles')
              .update({ 
                subscription_status: 'active',
                plan_type: planDetails.plan,
                monthly_credits: planDetails.credits,
                monthly_credit_cap: creditCap,
                billing_period_start: new Date(((subscription as unknown as { current_period_start: number }).current_period_start) * 1000).toISOString(),
              })
              .eq('id', userId)

            console.log(`Renewed ${planDetails.credits} credits for user ${userId} (cap: ${creditCap}). New balance: ${newBalance}`)
          }
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = (invoice as { subscription?: string }).subscription

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          const userId = await getUserIdFromSubscription(subscription)

          if (userId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (getSupabaseAdmin() as any)
              .from('profiles')
              .update({ subscription_status: 'past_due' })
              .eq('id', userId)

            console.log(`Payment failed for user ${userId}, marked as past_due`)
          }
        }
        break
      }
    }

    // Event already claimed atomically at start - no need to mark again
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook processing error:', error)
    // Don't mark as processed on error - allow retry
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
