import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PRICING } from '@/lib/stripe/config'

type ProfileCredits = { credits: number; plan_type: string }

type AutoRefillProfile = {
  auto_refill_enabled: boolean
  auto_refill_threshold: number
  auto_refill_amount: number
  stripe_customer_id: string | null
}

export interface CreditDeductionResult {
  success: boolean
  remainingCredits: number
  error?: string
}

interface WorkspaceCreditRpcResult {
  success: boolean
  new_balance: number
  error_message?: string | null
}

interface AdjustCreditsRpcResult {
  success: boolean
  new_balance: number
  previous_balance: number
  error_message: string | null
}

/**
 * Atomically deduct credits using database RPC function
 * This prevents race conditions with concurrent updates
 */
export async function deductCredits(
  userId: string,
  amount: number,
  reason: string
): Promise<CreditDeductionResult> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('adjust_credits', {
    p_user_id: userId,
    p_amount: -amount, // Negative for deduction
    p_reason: reason,
    p_max_credits: null,
  }).single()

  if (error) {
    console.error('deductCredits RPC error:', error)
    return {
      success: false,
      remainingCredits: 0,
      error: 'Failed to deduct credits',
    }
  }

  const result = data as AdjustCreditsRpcResult

  if (!result.success) {
    return {
      success: false,
      remainingCredits: result.previous_balance,
      error: result.error_message || 'Failed to deduct credits',
    }
  }

  console.log(`Deducted ${amount} credits from user ${userId} for: ${reason}. Remaining: ${result.new_balance}`)

  // Check auto-refill (fire-and-forget, don't block the deduction)
  triggerAutoRefillIfNeeded(userId, result.new_balance).catch((e: unknown) =>
    console.error('Auto-refill check failed:', e)
  )

  return {
    success: true,
    remainingCredits: result.new_balance,
  }
}

/**
 * Workspace-scoped credit deduction using workspace_credits RPC
 */
export async function deductWorkspaceCredits(
  workspaceId: string,
  amount: number,
  reason: string
): Promise<CreditDeductionResult> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('adjust_workspace_credits', {
    p_workspace_id: workspaceId,
    p_amount: -amount,
    p_reason: reason,
  }).single()

  if (error) {
    console.error('deductWorkspaceCredits RPC error:', error)
    return {
      success: false,
      remainingCredits: 0,
      error: 'Failed to deduct workspace credits',
    }
  }

  const result = data as WorkspaceCreditRpcResult

  if (!result.success) {
    return {
      success: false,
      remainingCredits: 0,
      error: result.error_message || 'Failed to deduct workspace credits',
    }
  }

  console.log(`Deducted ${amount} credits from workspace ${workspaceId} for: ${reason}. Remaining: ${result.new_balance}`)

  return {
    success: true,
    remainingCredits: result.new_balance,
  }
}

/**
 * Add credits to a workspace
 */
export async function addWorkspaceCredits(
  workspaceId: string,
  amount: number,
  reason: string
): Promise<CreditDeductionResult> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('adjust_workspace_credits', {
    p_workspace_id: workspaceId,
    p_amount: amount,
    p_reason: reason,
  }).single()

  if (error) {
    console.error('addWorkspaceCredits RPC error:', error)
    return {
      success: false,
      remainingCredits: 0,
      error: 'Failed to add workspace credits',
    }
  }

  const result = data as WorkspaceCreditRpcResult

  console.log(`Added ${amount} credits to workspace ${workspaceId} for: ${reason}. New balance: ${result.new_balance}`)

  return {
    success: true,
    remainingCredits: result.new_balance,
  }
}

/**
 * Check workspace credit balance
 */
export async function checkWorkspaceCredits(workspaceId: string): Promise<number> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('workspaces')
    .select('credits_balance')
    .eq('id', workspaceId)
    .single()

  if (error || !data) {
    console.error('Failed to check workspace credits:', error)
    return 0
  }

  return (data as { credits_balance: number }).credits_balance || 0
}

/**
 * Workspace-scoped credit deduction using admin client (no auth context required)
 */
export async function deductWorkspaceCreditsAdmin(
  workspaceId: string,
  amount: number,
  reason: string
): Promise<CreditDeductionResult> {
  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('adjust_workspace_credits', {
    p_workspace_id: workspaceId,
    p_amount: -amount,
    p_reason: reason,
  }).single()

  if (error) {
    console.error('deductWorkspaceCreditsAdmin RPC error:', error)
    return {
      success: false,
      remainingCredits: 0,
      error: 'Failed to deduct workspace credits',
    }
  }

  const result = data as WorkspaceCreditRpcResult

  if (!result.success) {
    return {
      success: false,
      remainingCredits: 0,
      error: result.error_message || 'Failed to deduct workspace credits',
    }
  }

  console.log(`Deducted ${amount} credits from workspace ${workspaceId} for: ${reason}. Remaining: ${result.new_balance}`)

  return {
    success: true,
    remainingCredits: result.new_balance,
  }
}

export async function deductCreditsAdmin(
  userId: string,
  amount: number,
  reason: string
): Promise<CreditDeductionResult> {
  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('adjust_credits', {
    p_user_id: userId,
    p_amount: -amount,
    p_reason: reason,
    p_max_credits: null,
  }).single()

  if (error) {
    console.error('deductCreditsAdmin RPC error:', error)
    return {
      success: false,
      remainingCredits: 0,
      error: 'Failed to deduct credits',
    }
  }

  const result = data as AdjustCreditsRpcResult

  if (!result.success) {
    return {
      success: false,
      remainingCredits: result.previous_balance,
      error: result.error_message || 'Failed to deduct credits',
    }
  }

  console.log(`Deducted ${amount} credits from user ${userId} for: ${reason}. Remaining: ${result.new_balance}`)

  // Check auto-refill (fire-and-forget)
  triggerAutoRefillIfNeeded(userId, result.new_balance).catch((e: unknown) =>
    console.error('Auto-refill check failed:', e)
  )

  return {
    success: true,
    remainingCredits: result.new_balance,
  }
}

/**
 * Atomically add credits using database RPC function
 * This prevents race conditions with concurrent updates
 */
export async function addCredits(
  userId: string,
  amount: number,
  reason: string,
  maxCredits?: number
): Promise<CreditDeductionResult> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('adjust_credits', {
    p_user_id: userId,
    p_amount: amount, // Positive for addition
    p_reason: reason,
    p_max_credits: maxCredits || null,
  }).single()

  if (error) {
    console.error('addCredits RPC error:', error)
    return {
      success: false,
      remainingCredits: 0,
      error: 'Failed to add credits',
    }
  }

  const result = data as AdjustCreditsRpcResult

  if (!result.success) {
    return {
      success: false,
      remainingCredits: result.previous_balance,
      error: result.error_message || 'Failed to add credits',
    }
  }

  console.log(`Added ${amount} credits to user ${userId} for: ${reason}. New total: ${result.new_balance}`)

  return {
    success: true,
    remainingCredits: result.new_balance,
  }
}

export async function checkCredits(userId: string): Promise<{
  credits: number
  planType: string
  canRun: boolean
}> {
  const supabase = await createClient()

  const { data: profileCheck } = await supabase
    .from('profiles')
    .select('credits, plan_type')
    .eq('id', userId)
    .single() as { data: ProfileCredits | null }

  const credits = profileCheck?.credits || 0
  const planType = profileCheck?.plan_type || 'free'

  return {
    credits,
    planType,
    canRun: credits >= PRICING.burnRates.typicalRun,
  }
}

export async function checkCreditsAdmin(userId: string): Promise<{
  credits: number
  planType: string
  canRun: boolean
}> {
  const supabase = createAdminClient()

  const { data: profileCheck } = await supabase
    .from('profiles')
    .select('credits, plan_type')
    .eq('id', userId)
    .single() as { data: ProfileCredits | null }

  const credits = profileCheck?.credits || 0
  const planType = profileCheck?.plan_type || 'free'

  return {
    credits,
    planType,
    canRun: credits >= PRICING.burnRates.typicalRun,
  }
}

export function calculateCreditsForRun(
  isHeavyRun: boolean = false
): number {
  return isHeavyRun 
    ? PRICING.burnRates.heavyRun 
    : PRICING.burnRates.typicalRun
}

export function calculateCreditsForTokens(tokens: number): number {
  return Math.max(
    PRICING.burnRates.chatMessageBase,
    Math.ceil(tokens / PRICING.burnRates.tokensPerCredit)
  )
}

// ============================================
// CREDIT RESERVATION SYSTEM
// ============================================

export interface CreditReservation {
  reservationId: string | null
  success: boolean
  error?: string
}

async function isReservationAlreadyCommitted(reservationId: string): Promise<boolean> {
  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('credit_reservations')
    .select('status')
    .eq('id', reservationId)
    .single()

  if (error || !data) {
    return false
  }

  return (data as { status?: string }).status === 'committed'
}

/**
 * Reserve credits atomically before starting an operation.
 * Primary path: reserve_credits RPC (reads profiles.credits).
 * Fallback path: workspace credits (workspaces.credits_balance) for users
 * whose profiles.credits is 0 but have a workspace with a positive balance.
 */
export async function reserveCredits(
  userId: string,
  amount: number,
  operationType: string,
  operationId?: string,
  ttlMinutes: number = 60
): Promise<CreditReservation> {
  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('reserve_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_operation_type: operationType,
    p_operation_id: operationId || null,
    p_ttl_minutes: ttlMinutes,
  })

  if (error) {
    console.error('reserveCredits RPC error:', error)
    return { reservationId: null, success: false, error: 'Failed to reserve credits' }
  }

  if (data) {
    return { reservationId: data as string, success: true }
  }

  // RPC returned null — profiles.credits may be 0 while workspace has balance.
  // Fall back to workspace-scoped credit check.
  console.log('[Credits] reserve_credits returned null for user', userId, '— trying workspace fallback')

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, credits_balance')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const workspaceBalance = (workspace as { credits_balance?: number } | null)?.credits_balance ?? 0
  if (!workspace || workspaceBalance < amount) {
    console.log('[Credits] Workspace balance insufficient:', workspaceBalance, '<', amount)
    return { reservationId: null, success: false, error: 'Insufficient credits' }
  }

  // Count already-reserved credits for this user
  const { data: activeRes } = await supabase
    .from('credit_reservations')
    .select('amount')
    .eq('user_id', userId)
    .eq('status', 'reserved')
    .gt('expires_at', new Date().toISOString())

  const alreadyReserved = ((activeRes || []) as { amount: number }[]).reduce((s, r) => s + (r.amount || 0), 0)
  const available = workspaceBalance - alreadyReserved

  if (available < amount) {
    console.log('[Credits] Workspace available after reservations insufficient:', available, '<', amount)
    return { reservationId: null, success: false, error: 'Insufficient credits' }
  }

  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString()
  const { data: newRes, error: insertErr } = await supabase
    .from('credit_reservations')
    .insert({
      user_id: userId,
      amount,
      operation_type: operationType,
      operation_id: operationId || null,
      expires_at: expiresAt,
      status: 'reserved',
    } as never)
    .select('id')
    .maybeSingle()

  if (insertErr || !newRes) {
    console.error('[Credits] Workspace fallback reservation insert failed:', insertErr)
    return { reservationId: null, success: false, error: 'Failed to reserve credits' }
  }

  console.log('[Credits] Workspace fallback reservation created:', (newRes as { id: string }).id, 'workspace balance:', workspaceBalance)
  return { reservationId: (newRes as { id: string }).id, success: true }
}

/**
 * Commit a reservation - actually deduct the credits
 * Call this when operation completes successfully
 */
export async function commitCreditReservation(
  reservationId: string,
  actualAmount?: number
): Promise<boolean> {
  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('commit_credit_reservation', {
    p_reservation_id: reservationId,
    p_actual_amount: actualAmount || null,
  })

  const rpcCommitted = !error && data === true
  if (error) {
    console.error('commitCreditReservation RPC error:', error)
  }

  const committed = rpcCommitted || await isReservationAlreadyCommitted(reservationId)
  if (!committed) return false

  // Deduct from workspace credits (the real balance source) regardless of whether
  // profiles.credits was updated by the RPC.
  try {
    const { data: res } = await supabase
      .from('credit_reservations')
      .select('user_id, amount')
      .eq('id', reservationId)
      .maybeSingle()

    if (res) {
      const uid = (res as { user_id: string }).user_id
      const deduct = actualAmount ?? (res as { amount: number }).amount
      const { data: ws } = await supabase
        .from('workspaces')
        .select('id')
        .eq('owner_id', uid)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (ws) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.rpc as any)('adjust_workspace_credits', {
          p_workspace_id: (ws as { id: string }).id,
          p_amount: -deduct,
          p_reason: `agent_run_commit_${reservationId.slice(0, 8)}`,
        })
      }
    }
  } catch (e) {
    console.error('[Credits] Failed to deduct workspace credits on commit:', e)
  }

  return true
}

/**
 * Release a reservation without deducting credits
 * Call this when operation fails or is cancelled
 */
export async function releaseCreditReservation(reservationId: string): Promise<boolean> {
  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('release_credit_reservation', {
    p_reservation_id: reservationId,
  })

  if (error) {
    console.error('releaseCreditReservation RPC error:', error)
    return false
  }

  return data === true
}

// ============================================
// AUTO-REFILL
// ============================================

/**
 * Check if auto-refill should trigger and create a Stripe charge if needed.
 * Called after every credit deduction (fire-and-forget).
 */
async function triggerAutoRefillIfNeeded(
  userId: string,
  currentBalance: number
): Promise<void> {
  const supabase = createAdminClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('auto_refill_enabled, auto_refill_threshold, auto_refill_amount, stripe_customer_id')
    .eq('id', userId)
    .single() as { data: AutoRefillProfile | null }

  if (!profile) return
  if (!profile.auto_refill_enabled) return
  if (!profile.stripe_customer_id) return
  if (currentBalance >= profile.auto_refill_threshold) return

  console.log(
    `[auto-refill] User ${userId}: balance ${currentBalance} < threshold ${profile.auto_refill_threshold}. Adding ${profile.auto_refill_amount} credits.`
  )

  try {
    const { stripe } = await import('@/lib/stripe/client')

    // Calculate price: credits / 250 = dollars, in cents
    const amountCents = Math.round((profile.auto_refill_amount / 250) * 100)

    // Create an invoice item
    await stripe.invoiceItems.create({
      customer: profile.stripe_customer_id,
      amount: amountCents,
      currency: 'usd',
      description: `Auto-refill: ${profile.auto_refill_amount.toLocaleString()} credits`,
    })

    // Create and pay invoice immediately
    const invoice = await stripe.invoices.create({
      customer: profile.stripe_customer_id,
      auto_advance: true,
      collection_method: 'charge_automatically',
      metadata: {
        type: 'auto_refill',
        user_id: userId,
        credits: String(profile.auto_refill_amount),
      },
    })

    await stripe.invoices.pay(invoice.id)

    // Add credits atomically
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.rpc as any)('adjust_credits', {
      p_user_id: userId,
      p_amount: profile.auto_refill_amount,
      p_reason: `Auto-refill: ${profile.auto_refill_amount.toLocaleString()} credits`,
      p_max_credits: null,
    })

    console.log(`[auto-refill] Successfully added ${profile.auto_refill_amount} credits for user ${userId}`)
  } catch (error) {
    console.error(`[auto-refill] Failed to charge user ${userId}:`, error)
  }
}
