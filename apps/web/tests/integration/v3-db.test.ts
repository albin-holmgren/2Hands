#!/usr/bin/env npx tsx
// v3 Slice 2 — database integration tests against LOCAL Supabase.
//
// Verifies the privileged boundaries the migration promises:
//   1. cross-tenant denial (member of A sees nothing in B, even by guessed UUID)
//   2. ordinary clients cannot mint approvals/receipts/events/transitions
//   3. task transition RPC enforces the canonical state machine + staleness
//   4. approval respond RPC enforces challenge, exact hash, expiry, idempotency
//   5. approval consumption is exactly-once
//   6. append-only tables reject UPDATE/DELETE for every role (trigger-level)
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
  // Probe availability first — skip cleanly when the stack is down.
  try {
    const res = await fetch(`${url}/auth/v1/health`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) throw new Error(`health ${res.status}`)
  } catch {
    console.log('SKIP: local Supabase is not running (supabase start). No tests executed.')
    process.exit(0)
  }
  if (!serviceKey || !anonKey) {
    console.log('SKIP: TEST_SUPABASE_SERVICE_ROLE_KEY / TEST_SUPABASE_ANON_KEY not set.')
    process.exit(0)
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  // ---- fixtures: two users, two workspaces --------------------------------
  const stamp = Date.now()
  const emailA = `v3-test-a-${stamp}@example.test`
  const emailB = `v3-test-b-${stamp}@example.test`
  const password = `pw-${randomUUID()}`

  const { data: userA, error: uaErr } = await admin.auth.admin.createUser({
    email: emailA,
    password,
    email_confirm: true,
  })
  const { data: userB, error: ubErr } = await admin.auth.admin.createUser({
    email: emailB,
    password,
    email_confirm: true,
  })
  if (uaErr || ubErr || !userA?.user || !userB?.user) {
    console.error('Failed to create test users', uaErr, ubErr)
    process.exit(1)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = (name: string) => (admin as any).from(name)

  const wsA = { id: randomUUID(), name: 'v3-test-A', slug: `v3-test-a-${stamp}`, owner_id: userA.user.id }
  const wsB = { id: randomUUID(), name: 'v3-test-B', slug: `v3-test-b-${stamp}`, owner_id: userB.user.id }
  {
    const { error } = await t('workspaces').insert([wsA, wsB])
    if (error) {
      console.error('workspace insert failed:', error.message)
      process.exit(1)
    }
  }
  {
    const { error } = await t('workspace_members').insert([
      { workspace_id: wsA.id, user_id: userA.user.id, role: 'owner' },
      { workspace_id: wsB.id, user_id: userB.user.id, role: 'owner' },
    ])
    if (error) {
      console.error('membership insert failed:', error.message)
      process.exit(1)
    }
  }

  console.log('\n=== 1. Task creation + transition RPC ===')

  const { data: taskRow, error: taskErr } = await t('tasks')
    .insert({
      workspace_id: wsA.id,
      user_id: userA.user.id,
      type: 'v3',
      description: 'integration test task',
      goal: 'integration test task',
      status: 'draft',
      origin: 'test',
    })
    .select('*')
    .single()
  assert(!taskErr && taskRow?.status === 'draft', 'service role creates v3 task in draft')
  const taskId = taskRow.id as string

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminRpc = (name: string, args: Record<string, unknown>) => (admin as any).rpc(name, args)

  {
    const { data, error } = await adminRpc('v3_transition_task', {
      p_task_id: taskId,
      p_expected_status: 'draft',
      p_new_status: 'planning',
      p_actor_kind: 'system',
      p_actor_id: null,
      p_event_type: null,
      p_payload: {},
    })
    assert(!error && data?.[0]?.new_status === 'planning', 'legal transition draft → planning succeeds')
  }
  {
    const { error } = await adminRpc('v3_transition_task', {
      p_task_id: taskId,
      p_expected_status: 'planning',
      p_new_status: 'completed',
      p_actor_kind: 'system',
      p_actor_id: null,
      p_event_type: null,
      p_payload: {},
    })
    assert(Boolean(error) && /illegal transition/i.test(error?.message ?? ''), 'illegal transition planning → completed fails closed')
  }
  {
    const { error } = await adminRpc('v3_transition_task', {
      p_task_id: taskId,
      p_expected_status: 'draft',
      p_new_status: 'planning',
      p_actor_kind: 'system',
      p_actor_id: null,
      p_event_type: null,
      p_payload: {},
    })
    assert(Boolean(error) && /stale/i.test(error?.message ?? ''), 'stale expected-status is rejected (optimistic concurrency)')
  }

  // events were appended with monotonic sequence
  {
    const { data } = await t('task_events').select('sequence,type').eq('task_id', taskId).order('sequence')
    const seqs = (data ?? []).map((r: { sequence: number | string }) => Number(r.sequence))
    assert(seqs.length >= 1 && seqs.every((s: number, i: number) => s === i + 1), 'event sequence is monotonic from 1')
  }

  console.log('\n=== 2. Append-only enforcement (trigger beats service role) ===')

  {
    const { error } = await t('task_events').update({ type: 'task.tampered' }).eq('task_id', taskId)
    assert(Boolean(error) && /append-only/i.test(error?.message ?? ''), 'UPDATE task_events rejected even for service role')
  }
  {
    const { error } = await t('task_events').delete().eq('task_id', taskId)
    assert(Boolean(error) && /append-only/i.test(error?.message ?? ''), 'DELETE task_events rejected even for service role')
  }

  console.log('\n=== 3. Approvals: challenge + exact hash + single use ===')

  const actionHash = `sha256:${'a'.repeat(64)}`
  const { data: approval, error: apErr } = await t('approvals')
    .insert({
      workspace_id: wsA.id,
      task_id: taskId,
      risk_class: 'r2_external_write',
      category: 'external_communication',
      title: 'Send test email',
      summary: 'integration test approval',
      canonical_action: { action: 'demo.send', target: { recipient: 'x@example.test' } },
      canonical_action_hash: actionHash,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    })
    .select('*')
    .single()
  assert(!apErr && approval?.status === 'pending', 'approval created pending with server challenge')

  {
    const { error } = await adminRpc('v3_respond_approval', {
      p_approval_id: approval.id,
      p_challenge: 'wrong-challenge',
      p_action_hash: actionHash,
      p_response: 'approved',
      p_user_id: userA.user.id,
      p_idempotency_key: 'k1',
    })
    assert(Boolean(error) && /challenge mismatch/i.test(error?.message ?? ''), 'wrong challenge rejected')
  }
  {
    const { error } = await adminRpc('v3_respond_approval', {
      p_approval_id: approval.id,
      p_challenge: approval.challenge,
      p_action_hash: 'sha256:deadbeef',
      p_response: 'approved',
      p_user_id: userA.user.id,
      p_idempotency_key: 'k1',
    })
    assert(Boolean(error) && /hash mismatch/i.test(error?.message ?? ''), 'changed payload hash rejected (approval invalidation)')
  }
  {
    const { error } = await adminRpc('v3_respond_approval', {
      p_approval_id: approval.id,
      p_challenge: approval.challenge,
      p_action_hash: actionHash,
      p_response: 'approved',
      p_user_id: userB.user.id,
      p_idempotency_key: 'k1',
    })
    assert(Boolean(error) && /not a member/i.test(error?.message ?? ''), 'non-member cannot respond')
  }
  {
    const { data, error } = await adminRpc('v3_respond_approval', {
      p_approval_id: approval.id,
      p_challenge: approval.challenge,
      p_action_hash: actionHash,
      p_response: 'approved',
      p_user_id: userA.user.id,
      p_idempotency_key: 'k1',
    })
    assert(!error && data?.[0]?.status === 'approved', 'correct challenge+hash approves')
  }
  {
    const { data, error } = await adminRpc('v3_respond_approval', {
      p_approval_id: approval.id,
      p_challenge: approval.challenge,
      p_action_hash: actionHash,
      p_response: 'approved',
      p_user_id: userA.user.id,
      p_idempotency_key: 'k1',
    })
    assert(!error && data?.[0]?.status === 'approved', 'idempotent replay returns same outcome without error')
  }
  {
    const { error } = await adminRpc('v3_respond_approval', {
      p_approval_id: approval.id,
      p_challenge: approval.challenge,
      p_action_hash: actionHash,
      p_response: 'denied',
      p_user_id: userA.user.id,
      p_idempotency_key: 'k2',
    })
    assert(Boolean(error) && /not pending/i.test(error?.message ?? ''), 'second distinct response rejected (single decision)')
  }
  {
    const { data: c1 } = await adminRpc('v3_consume_approval', { p_approval_id: approval.id, p_action_hash: actionHash })
    const { data: c2 } = await adminRpc('v3_consume_approval', { p_approval_id: approval.id, p_action_hash: actionHash })
    assert(c1 === true && c2 === false, 'consumption is exactly-once')
  }
  {
    const { error } = await t('approvals').update({ canonical_action_hash: 'sha256:tampered' }).eq('id', approval.id)
    assert(Boolean(error) && /immutable/i.test(error?.message ?? ''), 'canonical hash is immutable after insert')
  }

  console.log('\n=== 4. Cross-tenant denial + client minting denial (RLS) ===')

  const clientA = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data: signedA, error: signErr } = await clientA.auth.signInWithPassword({ email: emailA, password })
  assert(!signErr && Boolean(signedA?.session), 'user A signs in')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ta = (name: string) => (clientA as any).from(name)

  {
    const { data } = await ta('task_events').select('id').eq('task_id', taskId)
    assert((data ?? []).length >= 1, 'member A reads own-workspace task events')
  }

  // Workspace B fixture rows to probe against.
  const { data: taskB } = await t('tasks')
    .insert({
      workspace_id: wsB.id,
      user_id: userB.user.id,
      type: 'v3',
      description: 'B task',
      goal: 'B task',
      status: 'draft',
      origin: 'test',
    })
    .select('*')
    .single()
  await adminRpc('v3_append_task_event', {
    p_task_id: taskB.id,
    p_type: 'task.created',
    p_actor_kind: 'system',
    p_actor_id: null,
    p_payload: {},
    p_conversation_id: null,
    p_run_id: null,
  })

  {
    const { data } = await ta('task_events').select('id').eq('task_id', taskB.id)
    assert((data ?? []).length === 0, 'member A sees zero events from workspace B (guessed UUID)')
  }
  {
    const { data } = await ta('approvals').select('id').eq('workspace_id', wsB.id)
    assert((data ?? []).length === 0, 'member A sees zero approvals from workspace B')
  }
  {
    const { error } = await ta('approvals').insert({
      workspace_id: wsA.id,
      risk_class: 'r2_external_write',
      title: 'forged',
      summary: 'forged',
      canonical_action: {},
      canonical_action_hash: 'sha256:forged',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    })
    assert(Boolean(error), 'authenticated client cannot mint an approval')
  }
  {
    const { error } = await ta('action_receipts').insert({
      workspace_id: wsA.id,
      kind: 'forged',
      title: 'forged',
      summary: 'forged',
    })
    assert(Boolean(error), 'authenticated client cannot mint a receipt')
  }
  {
    const { error } = await ta('task_events').insert({
      task_id: taskId,
      workspace_id: wsA.id,
      type: 'task.forged',
      sequence: 999,
    })
    assert(Boolean(error), 'authenticated client cannot append events directly')
  }
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (clientA as any).rpc('v3_transition_task', {
      p_task_id: taskId,
      p_expected_status: 'planning',
      p_new_status: 'queued',
      p_actor_kind: 'user',
      p_actor_id: userA.user.id,
      p_event_type: null,
      p_payload: {},
    })
    assert(Boolean(error), 'authenticated client cannot call privileged transition RPC')
  }

  // ---- cleanup -------------------------------------------------------------
  await t('workspaces').delete().in('id', [wsA.id, wsB.id])
  await admin.auth.admin.deleteUser(userA.user.id)
  await admin.auth.admin.deleteUser(userB.user.id)

  console.log('\n───────────────────────────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error('Integration test crashed:', error)
  process.exit(1)
})
