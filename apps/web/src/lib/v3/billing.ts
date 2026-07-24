/**
 * v3 billing service — plans, weekly credits, reservation/settlement,
 * usage events, the immutable credit ledger, and spending mandates.
 *
 * Credit model (dual-run): workspaces.credits_balance remains the enforcement
 * balance (legacy system untouched); credit_ledger is the immutable v3 record
 * whose balance_after is the strict running sum of credits_delta. All writes
 * go through the privileged RPCs in migration 20260401000008.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { canonicalActionHash } from '@2hands/core'
import { PLAN_CONFIGS, type PlanConfig } from '@2hands/types/v3'
import { consumeApproval, getApproval } from './approvals'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (sb: ReturnType<typeof createAdminClient>, name: string) => (sb as any).from(name)
const rpc = (sb: ReturnType<typeof createAdminClient>, name: string, args: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb as any).rpc(name, args)

export type PlanId = PlanConfig['id']
export type MandateInterval = 'one_time' | 'monthly' | 'yearly'

export interface SubscriptionRow {
  id: string
  workspace_id: string
  plan_id: PlanId
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  status: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'incomplete'
  current_period_end: string | null
  created_at: string
  updated_at: string
}

export interface CreditLedgerRow {
  id: string
  seq: number
  workspace_id: string
  entry_type: 'grant' | 'reserve' | 'settle' | 'release' | 'adjustment'
  credits_delta: number
  balance_after: number
  ref_id: string | null
  created_at: string
}

export interface SpendingMandateRow {
  id: string
  workspace_id: string
  provider_id: string
  merchant: string
  plan_label: string | null
  currency: string
  max_first_amount_minor: number
  max_recurring_amount_minor: number
  interval: MandateInterval
  country_allowlist: string[]
  expires_at: string
  revoked_at: string | null
  payload_hash: string
  created_by: string
  created_at: string
}

export interface Entitlements {
  planId: PlanId
  plan: PlanConfig
  subscription: {
    status: SubscriptionRow['status']
    currentPeriodEnd: string | null
  } | null
  /** Ledger-derived v3 balance: sum of credits_delta (= latest balance_after). */
  ledgerBalance: number
  weeklyCredits: number
}

/** Plan + ledger-derived balance. Free = no subscription row. */
export async function getEntitlements(workspaceId: string): Promise<Entitlements> {
  const admin = createAdminClient()

  const { data: sub, error: subError } = await table(admin, 'subscriptions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (subError) throw new Error(`getEntitlements failed: ${subError.message}`)

  const subscription = sub as SubscriptionRow | null
  const active = subscription && ['active', 'trialing'].includes(subscription.status)
  const planId: PlanId = active ? subscription.plan_id : 'free'
  const plan = PLAN_CONFIGS.find((p) => p.id === planId) ?? PLAN_CONFIGS[0]

  // Latest balance_after equals the sum of credits_delta (strict running sum).
  const { data: last, error: ledgerError } = await table(admin, 'credit_ledger')
    .select('balance_after')
    .eq('workspace_id', workspaceId)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (ledgerError) throw new Error(`getEntitlements ledger read failed: ${ledgerError.message}`)

  return {
    planId,
    plan,
    subscription: subscription
      ? { status: subscription.status, currentPeriodEnd: subscription.current_period_end }
      : null,
    ledgerBalance: Number((last as { balance_after: number } | null)?.balance_after ?? 0),
    weeklyCredits: plan.weeklyCredits,
  }
}

/** Reserve estimated credits before expensive work. Throws 'insufficient_credits…' when short. */
export async function reserveCredits(input: {
  workspaceId: string
  taskId?: string
  estimatedCredits: number
}): Promise<string> {
  const admin = createAdminClient()
  const { data, error } = await rpc(admin, 'v3_reserve_credits', {
    p_workspace_id: input.workspaceId,
    p_task_id: input.taskId ?? null,
    p_estimated: input.estimatedCredits,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export interface SettlementResult {
  reservationId: string
  settledCredits: number
  refundedCredits: number
}

/** Settle a reservation with measured actual usage; refunds the unused delta. */
export async function settleReservation(
  reservationId: string,
  actualCredits: number,
): Promise<SettlementResult> {
  const admin = createAdminClient()
  const { data, error } = await rpc(admin, 'v3_settle_reservation', {
    p_reservation_id: reservationId,
    p_actual: actualCredits,
  })
  if (error) throw new Error(error.message)
  const row = Array.isArray(data) ? data[0] : data
  return {
    reservationId: row.reservation_id,
    settledCredits: Number(row.settled_credits),
    refundedCredits: Number(row.refunded_credits),
  }
}

export interface WeeklyGrantResult {
  granted: boolean
  grantId: string | null
  credits: number
}

/** Idempotent per UTC ISO week per workspace. */
export async function grantWeeklyCredits(workspaceId: string): Promise<WeeklyGrantResult> {
  const admin = createAdminClient()
  const { data, error } = await rpc(admin, 'v3_grant_weekly_credits', {
    p_workspace_id: workspaceId,
  })
  if (error) throw new Error(`grantWeeklyCredits failed: ${error.message}`)
  const row = Array.isArray(data) ? data[0] : data
  return { granted: row.granted === true, grantId: row.grant_id ?? null, credits: Number(row.credits) }
}

export type UsageEventCategory =
  | 'model_tokens'
  | 'speech'
  | 'browser_time'
  | 'active_compute'
  | 'storage'
  | 'network_egress'
  | 'premium_tool'
  | 'retry'
  | 'external_subscription'

/** Append-only usage record. Never contains secrets. */
export async function recordUsageEvent(input: {
  workspaceId: string
  taskId?: string
  reservationId?: string
  category: UsageEventCategory
  credits: number
  providerCostMicros?: number
  metadata?: Record<string, unknown>
}): Promise<string> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'usage_events')
    .insert({
      workspace_id: input.workspaceId,
      task_id: input.taskId ?? null,
      reservation_id: input.reservationId ?? null,
      category: input.category,
      credits: input.credits,
      provider_cost_micros: input.providerCostMicros ?? null,
      metadata: input.metadata ?? {},
    })
    .select('id')
    .single()
  if (error) throw new Error(`recordUsageEvent failed: ${error.message}`)
  return (data as { id: string }).id
}

export interface CreateSpendingMandateInput {
  workspaceId: string
  userId: string
  providerId: string
  merchant: string
  planLabel?: string
  currency: string
  maxFirstAmountMinor: number
  maxRecurringAmountMinor: number
  interval: MandateInterval
  countryAllowlist?: string[]
  expiresAt: string
  /** An approved approval whose canonical action must hash-match this mandate. */
  approvalId: string
}

/** Canonical payload for hashing — the exact thing the user approved. */
export function spendingMandatePayload(
  input: Omit<CreateSpendingMandateInput, 'userId' | 'approvalId'>,
): Record<string, unknown> {
  return {
    type: 'spending_mandate',
    workspaceId: input.workspaceId,
    providerId: input.providerId,
    merchant: input.merchant,
    planLabel: input.planLabel ?? null,
    currency: input.currency.toUpperCase(),
    maxFirstAmountMinor: input.maxFirstAmountMinor,
    maxRecurringAmountMinor: input.maxRecurringAmountMinor,
    interval: input.interval,
    countryAllowlist: input.countryAllowlist ?? [],
    expiresAt: input.expiresAt,
  }
}

/**
 * Create a spending mandate. Requires an approved, unconsumed approval whose
 * canonical action hash equals this mandate's canonical payload hash; the
 * approval is consumed exactly once here.
 */
export async function createSpendingMandate(
  input: CreateSpendingMandateInput,
): Promise<SpendingMandateRow> {
  const payload = spendingMandatePayload(input)
  const payloadHash = canonicalActionHash(payload)

  const approval = await getApproval(input.approvalId, input.workspaceId)
  if (!approval) throw new Error('createSpendingMandate: approval not found')
  if (approval.status !== 'approved') {
    throw new Error(`createSpendingMandate: approval is ${approval.status} — not approved`)
  }
  if (approval.canonical_action_hash !== payloadHash) {
    throw new Error('createSpendingMandate: approval hash mismatch — payload changed')
  }
  const consumed = await consumeApproval({ approvalId: input.approvalId, actionHash: payloadHash })
  if (!consumed) {
    throw new Error('createSpendingMandate: approval already consumed or expired')
  }

  const admin = createAdminClient()
  const { data, error } = await table(admin, 'spending_mandates')
    .insert({
      workspace_id: input.workspaceId,
      provider_id: input.providerId,
      merchant: input.merchant,
      plan_label: input.planLabel ?? null,
      currency: input.currency.toUpperCase(),
      max_first_amount_minor: input.maxFirstAmountMinor,
      max_recurring_amount_minor: input.maxRecurringAmountMinor,
      interval: input.interval,
      country_allowlist: input.countryAllowlist ?? [],
      expires_at: input.expiresAt,
      payload_hash: payloadHash,
      created_by: input.userId,
    })
    .select('*')
    .single()
  if (error) throw new Error(`createSpendingMandate failed: ${error.message}`)
  return data as SpendingMandateRow
}

export async function listSpendingMandates(workspaceId: string): Promise<SpendingMandateRow[]> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'spending_mandates')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(`listSpendingMandates failed: ${error.message}`)
  return (data ?? []) as SpendingMandateRow[]
}

export interface MandateCoverageInput {
  mandate: Pick<
    SpendingMandateRow,
    | 'merchant'
    | 'currency'
    | 'interval'
    | 'max_first_amount_minor'
    | 'max_recurring_amount_minor'
    | 'expires_at'
    | 'revoked_at'
  > | null
  amountMinor: number
  currency: string
  interval: MandateInterval
  merchant: string
  /** First purchase at this merchant (uses the first-amount ceiling). */
  isFirstPurchase?: boolean
  now?: Date
}

export type MandateCoverageReason =
  | 'no_mandate'
  | 'revoked'
  | 'expired'
  | 'merchant_mismatch'
  | 'currency_mismatch'
  | 'interval_change'
  | 'price_exceeded'

export interface MandateCoverage {
  covered: boolean
  reason?: MandateCoverageReason
}

/**
 * Pure decision: does an existing mandate cover this purchase, or is a fresh
 * approval needed? Fresh approval is required on: first merchant purchase
 * without a mandate, price above the ceiling, interval change, expiry,
 * revocation, currency or merchant mismatch.
 */
export function checkMandateCovers(input: MandateCoverageInput): MandateCoverage {
  const { mandate } = input
  if (!mandate) return { covered: false, reason: 'no_mandate' }
  if (mandate.revoked_at) return { covered: false, reason: 'revoked' }

  const now = input.now ?? new Date()
  if (new Date(mandate.expires_at).getTime() <= now.getTime()) {
    return { covered: false, reason: 'expired' }
  }
  if (mandate.merchant.trim().toLowerCase() !== input.merchant.trim().toLowerCase()) {
    return { covered: false, reason: 'merchant_mismatch' }
  }
  if (mandate.currency.trim().toUpperCase() !== input.currency.trim().toUpperCase()) {
    return { covered: false, reason: 'currency_mismatch' }
  }
  if (mandate.interval !== input.interval) {
    return { covered: false, reason: 'interval_change' }
  }
  const ceiling =
    input.isFirstPurchase === false
      ? mandate.max_recurring_amount_minor
      : mandate.max_first_amount_minor
  if (input.amountMinor > ceiling) {
    return { covered: false, reason: 'price_exceeded' }
  }
  return { covered: true }
}

export async function listLedger(
  workspaceId: string,
  limit = 100,
): Promise<CreditLedgerRow[]> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'credit_ledger')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('seq', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500))
  if (error) throw new Error(`listLedger failed: ${error.message}`)
  return (data ?? []) as CreditLedgerRow[]
}
