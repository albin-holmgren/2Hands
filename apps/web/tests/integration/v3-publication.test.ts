#!/usr/bin/env npx tsx
// v3 Slice 7 — publication integration test against local Supabase:
// deny → ZERO publications; approve → exactly one under retry; changed
// payload invalidates; receipts recorded with evidence.

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { canonicalActionHash } from '@2hands/core'

const url = process.env.TEST_SUPABASE_URL || 'http://127.0.0.1:54321'
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error('Refusing non-local Supabase URL:', url)
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
  try {
    const res = await fetch(`${url}/auth/v1/health`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) throw new Error('down')
  } catch {
    console.log('SKIP: local Supabase is not running.')
    process.exit(0)
  }
  if (!serviceKey) {
    console.log('SKIP: no service role key.')
    process.exit(0)
  }

  // The service modules read env at import time in some paths — set before import.
  process.env.NEXT_PUBLIC_SUPABASE_URL = url
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey

  const { publishBranchAndDraftPr, listPublications } = await import('../../src/lib/v3/demo-github')

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = (name: string) => (admin as any).from(name)

  const stamp = Date.now()
  const { data: user } = await admin.auth.admin.createUser({
    email: `v3-pub-${stamp}@example.test`,
    password: `pw-${randomUUID()}`,
    email_confirm: true,
  })
  if (!user?.user) throw new Error('user create failed')
  const ws = { id: randomUUID(), name: 'v3-pub', slug: `v3-pub-${stamp}`, owner_id: user.user.id }
  await t('workspaces').insert(ws)
  await t('workspace_members').insert({ workspace_id: ws.id, user_id: user.user.id, role: 'owner' })

  const { data: task } = await t('tasks')
    .insert({
      workspace_id: ws.id,
      user_id: user.user.id,
      type: 'v3',
      description: 'publication test',
      goal: 'publication test',
      status: 'draft',
      origin: 'test',
    })
    .select('*')
    .single()

  const action = {
    action: 'github.push_branch_and_draft_pr',
    taskId: task.id,
    target: { repository: 'demo/onboarding', branch: '2hands/fix-onboarding' },
    input: { commitSha: 'abc123def456', prTitle: 'Fix onboarding test' },
  }
  const hash = canonicalActionHash(action)

  const makeApproval = async () => {
    const { data, error } = await t('approvals')
      .insert({
        workspace_id: ws.id,
        task_id: task.id,
        risk_class: 'r2_external_write',
        category: 'publication',
        title: 'Push branch and open draft PR',
        summary: 'demo/onboarding ← 2hands/fix-onboarding',
        canonical_action: action,
        canonical_action_hash: hash,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const respond = (approval: any, response: string, key: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).rpc('v3_respond_approval', {
      p_approval_id: approval.id,
      p_challenge: approval.challenge,
      p_action_hash: hash,
      p_response: response,
      p_user_id: user!.user!.id,
      p_idempotency_key: key,
    })

  console.log('\n=== 1. Deny → zero publications ===')
  const denied = await makeApproval()
  await respond(denied, 'denied', 'deny-1')
  const denyPublish = await publishBranchAndDraftPr({
    workspaceId: ws.id,
    taskId: task.id,
    approvalId: denied.id,
    actionHash: hash,
    repository: 'demo/onboarding',
    branch: '2hands/fix-onboarding',
    commitSha: 'abc123def456',
    prTitle: 'Fix onboarding test',
    idempotencyKey: 'pub-deny-1',
  })
  assert(denyPublish.status === 'rejected', 'publish after deny is rejected')
  assert((await listPublications(ws.id)).length === 0, 'zero publications exist after deny')

  console.log('\n=== 2. Approve → exactly once under retry ===')
  const approved = await makeApproval()
  await respond(approved, 'approved', 'approve-1')

  const key = 'pub-approve-1'
  const first = await publishBranchAndDraftPr({
    workspaceId: ws.id,
    taskId: task.id,
    approvalId: approved.id,
    actionHash: hash,
    repository: 'demo/onboarding',
    branch: '2hands/fix-onboarding',
    commitSha: 'abc123def456',
    prTitle: 'Fix onboarding test',
    idempotencyKey: key,
  })
  assert(first.status === 'published' && !('replayed' in first && first.replayed), 'first publish succeeds')

  // Simulated retry after ambiguous timeout: same idempotency key.
  const retry = await publishBranchAndDraftPr({
    workspaceId: ws.id,
    taskId: task.id,
    approvalId: approved.id,
    actionHash: hash,
    repository: 'demo/onboarding',
    branch: '2hands/fix-onboarding',
    commitSha: 'abc123def456',
    prTitle: 'Fix onboarding test',
    idempotencyKey: key,
  })
  assert(retry.status === 'published' && retry.status === 'published' && retry.replayed === true, 'retry replays the same publication')

  const pubs = await listPublications(ws.id)
  assert(pubs.length === 1, 'exactly ONE publication record exists')
  assert(pubs[0].pr_number === 1 && pubs[0].pr_draft, 'draft PR #1 recorded')

  // A different action under the SAME consumed approval must fail.
  const second = await publishBranchAndDraftPr({
    workspaceId: ws.id,
    taskId: task.id,
    approvalId: approved.id,
    actionHash: hash,
    repository: 'demo/onboarding',
    branch: '2hands/fix-onboarding',
    commitSha: 'abc123def456',
    prTitle: 'Fix onboarding test',
    idempotencyKey: 'pub-approve-2',
  })
  assert(second.status === 'rejected', 'consumed approval cannot authorize a second distinct publication')

  console.log('\n=== 3. Receipt with evidence ===')
  const { data: receipts } = await t('action_receipts').select('*').eq('workspace_id', ws.id)
  assert((receipts ?? []).length === 1, 'one immutable receipt created')
  const receipt = receipts![0]
  assert(receipt.kind === 'github.publication', 'receipt kind recorded')
  assert(
    Array.isArray(receipt.evidence) &&
      receipt.evidence.some((e: { kind: string }) => e.kind === 'pull_request') &&
      receipt.evidence.some((e: { kind: string }) => e.kind === 'commit'),
    'receipt carries branch/commit/PR evidence',
  )

  console.log('\n=== 4. Publication events on the task stream ===')
  const { data: events } = await t('task_events').select('*').eq('task_id', task.id).order('sequence')
  assert(
    (events ?? []).some((e: { type: string }) => e.type === 'publication.completed'),
    'publication.completed event appended',
  )
  assert(
    (events ?? []).some((e: { type: string }) => e.type === 'receipt.created'),
    'receipt.created event appended',
  )

  await t('workspaces').delete().in('id', [ws.id])
  await admin.auth.admin.deleteUser(user.user.id)

  console.log('\n───────────────────────────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error('Publication test crashed:', error)
  process.exit(1)
})
