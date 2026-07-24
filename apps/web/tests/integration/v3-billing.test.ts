#!/usr/bin/env npx tsx
// v3 Slice 8 — billing integration tests against LOCAL Supabase.
//
//   1. weekly grant is idempotent per ISO week (twice → one grant)
//   2. subscription plan drives weekly grant amount (pro → 500)
//   3. reserve → settle with actual < reserved → refund ledger + balance math
//   4. reserve beyond balance → insufficient_credits, nothing written
//   5. usage_events / credit_ledger are append-only (trigger-level)
//   6. spending mandate requires a matching approved approval (hash-bound,
//      consumed exactly once)
//   7. checkMandateCovers matrix (pure)
//
// Requires a running local stack (`supabase start`). Skips politely otherwise.
// Never points at production: refuses non-local URLs.

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const url = process.env.TEST_SUPABASE_URL || 'http://127.0.0.1:54321'
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const anonKey = process.env.TEST_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error('Refusing to run integration tests against a non-local Supabase URL:', url)
  process.exit(1)
}

// The billing service reads these lazily via createAdminClient.
process.env.NEXT_PUBLIC_SUPABASE_URL = url
process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey || 'unused'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++
    console.log(`  ✓ ${message}`)
  } else {
    failed++
    console.log(`  ✗ ${message}`)
  }
}

async function main() {
  try {
    const res = await fetch(`${url}/auth/v1/health`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) throw new Error(`health ${res.status}`)
  } catch {
    console.log('SKIP: local Supabase is not running (supabase start). No tests executed.')
    process.exit(0)
  }
  if (!serviceKey) {
    console.log('SKIP: TEST_SUPABASE_SERVICE_ROLE_KEY not set.')
    process.exit(0)
  }

  // Import after env is set so the service layer sees local credentials.
  const { canonicalActionHash } = await import('@2hands/core')
  const {
    grantWeeklyCredits,
    reserveCredits,
    settleReservation,
    recordUsageEvent,
    getEntitlements,
    listLedger,
    createSpendingMandate,
    spendingMandatePayload,
    checkMandateCovers,
  } = await import('../../src/lib/v3/billing')

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = (name: string) => (admin as any).from(name)

  // ---- fixtures -----------------------------------------------------------
  const stamp = Date.now()
  const { data: user, error: userErr } = await admin.auth.admin.createUser({
    email: `v3-billing-${stamp}@example.test`,
    password: `pw-${randomUUID()}`,
    email_confirm: true,
  })
  if (userErr || !user?.user) {
    console.error('Failed to create test user', userErr)
    process.exit(1)
  }
  const userId = user.user.id

  const wsFree = { id: randomUUID(), name: 'v3-billing-free', slug: `v3-billing-free-${stamp}`, owner_id: userId }
  const wsPro = { id: randomUUID(), name: 'v3-billing-pro', slug: `v3-billing-pro-${stamp}`, owner_id: userId }
  {
    const { error } = await t('workspaces').insert([wsFree, wsPro])
    if (error) {
      console.error('workspace insert failed:', error.message)
      process.exit(1)
    }
  }
  {
    const { error } = await t('workspace_members').insert([
      { workspace_id: wsFree.id, user_id: userId, role: 'owner' },
      { workspace_id: wsPro.id, user_id: userId, role: 'owner' },
    ])
    if (error) {
      console.error('membership insert failed:', error.message)
      process.exit(1)
    }
  }
  const { data: wsRow } = await t('workspaces').select('credits_balance').eq('id', wsFree.id).single()
  const openingBalance = Number(wsRow.credits_balance)

  console.log('\n=== 1. Weekly grant idempotency ===')
  {
    const first = await grantWeeklyCredits(wsFree.id)
    assert(first.granted && first.credits === 50 && !!first.grantId, 'first weekly grant on free plan grants 50')
    const second = await grantWeeklyCredits(wsFree.id)
    assert(!second.granted && second.credits === 0, 'second weekly grant in the same ISO week is a no-op')

    const { data: grants } = await t('credit_grants')
      .select('*')
      .eq('workspace_id', wsFree.id)
      .eq('source', 'weekly')
    assert(grants?.length === 1, 'exactly one weekly credit_grants row exists')

    const ledger = await listLedger(wsFree.id)
    assert(
      ledger.length === 1 && ledger[0].entry_type === 'grant' && Number(ledger[0].credits_delta) === 50,
      'ledger has exactly one grant row of +50',
    )

    const { data: ws } = await t('workspaces').select('credits_balance').eq('id', wsFree.id).single()
    assert(Number(ws.credits_balance) === openingBalance + 50, 'workspace enforcement balance increased by 50')

    const ent = await getEntitlements(wsFree.id)
    assert(ent.planId === 'free' && ent.weeklyCredits === 50, 'entitlements report free plan / 50 weekly')
    assert(ent.ledgerBalance === 50, 'ledger-derived balance equals sum of deltas (50)')
  }

  console.log('\n=== 2. Subscription plan drives grant amount ===')
  {
    const { error } = await t('subscriptions').insert({
      workspace_id: wsPro.id,
      plan_id: 'pro',
      status: 'active',
    })
    assert(!error, 'service role creates pro subscription')
    const grant = await grantWeeklyCredits(wsPro.id)
    assert(grant.granted && grant.credits === 500, 'pro workspace weekly grant is 500')
    const ent = await getEntitlements(wsPro.id)
    assert(ent.planId === 'pro' && ent.weeklyCredits === 500, 'entitlements report pro plan')
  }

  console.log('\n=== 3. Reserve → settle (actual < reserved) ===')
  let settledReservationId = ''
  {
    const reservationId = await reserveCredits({ workspaceId: wsFree.id, estimatedCredits: 100 })
    settledReservationId = reservationId
    assert(!!reservationId, 'reservation created')

    const { data: resRow } = await t('usage_reservations').select('*').eq('id', reservationId).single()
    assert(
      resRow?.status === 'reserved' && Number(resRow.reserved_credits) === 100,
      'reservation row is reserved for 100',
    )

    const { data: wsAfterReserve } = await t('workspaces').select('credits_balance').eq('id', wsFree.id).single()
    assert(
      Number(wsAfterReserve.credits_balance) === openingBalance + 50 - 100,
      'reserve deducts the full estimate from the enforcement balance',
    )

    const result = await settleReservation(reservationId, 40)
    assert(
      result.settledCredits === 40 && result.refundedCredits === 60,
      'settlement reports actual 40 / refund 60',
    )

    const { data: settledRow } = await t('usage_reservations').select('*').eq('id', reservationId).single()
    assert(
      settledRow?.status === 'settled' && Number(settledRow.settled_credits) === 40 && !!settledRow.settled_at,
      'reservation row is settled with actual credits',
    )

    const ledger = await listLedger(wsFree.id)
    const reserveRow = ledger.find((r) => r.entry_type === 'reserve' && r.ref_id === reservationId)
    const settleRow = ledger.find((r) => r.entry_type === 'settle' && r.ref_id === reservationId)
    assert(!!reserveRow && Number(reserveRow!.credits_delta) === -100, 'ledger reserve row is -100')
    assert(!!settleRow && Number(settleRow!.credits_delta) === 60, 'ledger settle (refund) row is +60')

    const sum = ledger.reduce((acc, r) => acc + Number(r.credits_delta), 0)
    assert(Number(ledger[0].balance_after) === sum, 'latest balance_after equals sum of credits_delta')
    assert(sum === 50 - 100 + 60, 'net ledger effect of reserve+settle is -actual (ledger at 10)')

    const { data: wsAfterSettle } = await t('workspaces').select('credits_balance').eq('id', wsFree.id).single()
    assert(
      Number(wsAfterSettle.credits_balance) === openingBalance + 50 - 40,
      'workspace balance charged exactly the actual usage (opening + 50 - 40)',
    )

    let doubleSettle = ''
    try {
      await settleReservation(reservationId, 10)
    } catch (error) {
      doubleSettle = error instanceof Error ? error.message : String(error)
    }
    assert(/already finalized/.test(doubleSettle), 'settling twice is rejected')
  }

  console.log('\n=== 4. Reserve beyond balance → insufficient_credits ===')
  {
    const ledgerBefore = await listLedger(wsFree.id)
    const { data: wsBefore } = await t('workspaces').select('credits_balance').eq('id', wsFree.id).single()

    let message = ''
    try {
      await reserveCredits({ workspaceId: wsFree.id, estimatedCredits: 1_000_000 })
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    assert(/insufficient_credits/.test(message), 'over-balance reserve raises insufficient_credits')

    const ledgerAfter = await listLedger(wsFree.id)
    const { data: wsAfter } = await t('workspaces').select('credits_balance').eq('id', wsFree.id).single()
    assert(ledgerAfter.length === ledgerBefore.length, 'failed reserve writes no ledger rows')
    assert(
      Number(wsAfter.credits_balance) === Number(wsBefore.credits_balance),
      'failed reserve leaves the balance untouched',
    )
    const { data: reservations } = await t('usage_reservations')
      .select('id')
      .eq('workspace_id', wsFree.id)
      .eq('status', 'reserved')
    assert((reservations ?? []).length === 0, 'failed reserve leaves no dangling reservation')
  }

  console.log('\n=== 5. Append-only enforcement ===')
  {
    const eventId = await recordUsageEvent({
      workspaceId: wsFree.id,
      reservationId: settledReservationId,
      category: 'model_tokens',
      credits: 40,
      providerCostMicros: 123456,
      metadata: { model: 'demo' },
    })
    assert(!!eventId, 'usage event recorded')

    const { error: updateErr } = await t('usage_events').update({ credits: 0 }).eq('id', eventId)
    assert(!!updateErr, 'usage_events UPDATE is rejected even for service role')
    const { error: deleteErr } = await t('usage_events').delete().eq('id', eventId)
    assert(!!deleteErr, 'usage_events DELETE is rejected even for service role')

    const ledger = await listLedger(wsFree.id)
    const { error: ledgerUpdateErr } = await t('credit_ledger')
      .update({ credits_delta: 999 })
      .eq('id', ledger[0].id)
    assert(!!ledgerUpdateErr, 'credit_ledger UPDATE is rejected even for service role')
    const { error: ledgerDeleteErr } = await t('credit_ledger').delete().eq('id', ledger[0].id)
    assert(!!ledgerDeleteErr, 'credit_ledger DELETE is rejected even for service role')
  }

  console.log('\n=== 6. Spending mandate creation (approval-bound) ===')
  {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const mandateInput = {
      workspaceId: wsFree.id,
      providerId: 'demo-provider',
      merchant: 'Demo SaaS Inc',
      planLabel: 'Starter',
      currency: 'USD',
      maxFirstAmountMinor: 2900,
      maxRecurringAmountMinor: 1900,
      interval: 'monthly' as const,
      countryAllowlist: ['SE', 'US'],
      expiresAt,
    }
    const payload = spendingMandatePayload(mandateInput)
    const hash = canonicalActionHash(payload)

    const approvalId = randomUUID()
    const { error: approvalErr } = await t('approvals').insert({
      id: approvalId,
      workspace_id: wsFree.id,
      risk_class: 'r3_high_impact',
      category: 'financial',
      title: 'Approve spending mandate for Demo SaaS Inc',
      summary: 'Up to $29.00 first / $19.00 monthly',
      canonical_action: payload,
      canonical_action_hash: hash,
      reversibility: 'irreversible',
      status: 'approved',
      responded_by: userId,
      responded_at: new Date().toISOString(),
      expires_at: expiresAt,
    })
    assert(!approvalErr, 'approved approval fixture created')

    // Wrong payload (price bumped) must not pass the hash check.
    let mismatch = ''
    try {
      await createSpendingMandate({
        ...mandateInput,
        maxFirstAmountMinor: 99900,
        userId,
        approvalId,
      })
    } catch (error) {
      mismatch = error instanceof Error ? error.message : String(error)
    }
    assert(/hash mismatch/.test(mismatch), 'changed payload is rejected (hash mismatch)')

    const mandate = await createSpendingMandate({ ...mandateInput, userId, approvalId })
    assert(mandate.payload_hash === hash, 'mandate created with canonical payload hash')
    assert(mandate.workspace_id === wsFree.id && mandate.interval === 'monthly', 'mandate row fields persisted')

    const { data: consumedApproval } = await t('approvals').select('status, consumed_at').eq('id', approvalId).single()
    assert(consumedApproval?.status === 'consumed' && !!consumedApproval.consumed_at, 'approval consumed exactly once')

    let reuse = ''
    try {
      await createSpendingMandate({ ...mandateInput, userId, approvalId })
    } catch (error) {
      reuse = error instanceof Error ? error.message : String(error)
    }
    assert(/not approved|already consumed/.test(reuse), 'consumed approval cannot mint a second mandate')

    console.log('\n=== 7. checkMandateCovers matrix ===')
    const base = {
      merchant: mandate.merchant,
      currency: mandate.currency,
      interval: mandate.interval,
      max_first_amount_minor: Number(mandate.max_first_amount_minor),
      max_recurring_amount_minor: Number(mandate.max_recurring_amount_minor),
      expires_at: mandate.expires_at,
      revoked_at: mandate.revoked_at,
    }
    const purchase = {
      amountMinor: 2500,
      currency: 'USD',
      interval: 'monthly' as const,
      merchant: 'Demo SaaS Inc',
    }

    assert(
      checkMandateCovers({ mandate: base, ...purchase }).covered === true,
      'covered: first purchase within first-amount ceiling',
    )
    assert(
      checkMandateCovers({ mandate: base, ...purchase, amountMinor: 1900, isFirstPurchase: false }).covered === true,
      'covered: recurring purchase within recurring ceiling',
    )
    assert(
      checkMandateCovers({ mandate: null, ...purchase }).reason === 'no_mandate',
      'fresh approval needed: no mandate for merchant',
    )
    assert(
      checkMandateCovers({ mandate: base, ...purchase, amountMinor: 3000 }).reason === 'price_exceeded',
      'fresh approval needed: price above first-purchase max',
    )
    assert(
      checkMandateCovers({ mandate: base, ...purchase, amountMinor: 2500, isFirstPurchase: false }).reason ===
        'price_exceeded',
      'fresh approval needed: recurring price above recurring max',
    )
    assert(
      checkMandateCovers({
        mandate: { ...base, expires_at: new Date(Date.now() - 1000).toISOString() },
        ...purchase,
      }).reason === 'expired',
      'fresh approval needed: mandate expired',
    )
    assert(
      checkMandateCovers({ mandate: base, ...purchase, currency: 'EUR' }).reason === 'currency_mismatch',
      'fresh approval needed: wrong currency',
    )
    assert(
      checkMandateCovers({ mandate: base, ...purchase, interval: 'yearly' }).reason === 'interval_change',
      'fresh approval needed: interval change',
    )
    assert(
      checkMandateCovers({
        mandate: { ...base, revoked_at: new Date().toISOString() },
        ...purchase,
      }).reason === 'revoked',
      'fresh approval needed: mandate revoked',
    )
    assert(
      checkMandateCovers({ mandate: base, ...purchase, merchant: 'Other Corp' }).reason === 'merchant_mismatch',
      'fresh approval needed: different merchant',
    )
  }

  // ---- cleanup ------------------------------------------------------------
  await t('workspaces').delete().in('id', [wsFree.id, wsPro.id])
  await admin.auth.admin.deleteUser(userId).catch(() => undefined)

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('Test run crashed:', error)
  process.exit(1)
})
