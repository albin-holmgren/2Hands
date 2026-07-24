#!/usr/bin/env npx tsx
// v3 Slice 7 (Track C) — publication route service flow against local
// Supabase: propose (verifying → exact approval → awaiting_approval) →
// approve → execute (running → verifying → completed, exactly-once publish,
// receipt on the task). Deny path leaves the task untouched with zero
// publications. Retry of execute replays the same publication.

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

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

async function expectThrow(fn: () => Promise<unknown>, pattern: RegExp, message: string) {
  try {
    await fn()
    assert(false, `${message} (did not throw)`)
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    assert(pattern.test(text), `${message} (${text.slice(0, 80)})`)
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

  // Services read env at import time in some paths — set before import.
  process.env.NEXT_PUBLIC_SUPABASE_URL = url
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey

  const { proposePublication, executePublication, deterministicCommitSha } = await import(
    '../../src/lib/v3/publication'
  )
  const { createTask, transitionTask, getTask } = await import('../../src/lib/v3/tasks')
  const { respondApproval, getApproval } = await import('../../src/lib/v3/approvals')
  const { listPublications } = await import('../../src/lib/v3/demo-github')

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = (name: string) => (admin as any).from(name)

  const stamp = Date.now()
  const { data: user } = await admin.auth.admin.createUser({
    email: `v3-pubflow-${stamp}@example.test`,
    password: `pw-${randomUUID()}`,
    email_confirm: true,
  })
  if (!user?.user) throw new Error('user create failed')
  const userId = user.user.id
  // Signup trigger creates the profile; upsert defensively for computers FK.
  await t('profiles').upsert({ id: userId, email: user.user.email }, { onConflict: 'id' })

  const ws = { id: randomUUID(), name: 'v3-pubflow', slug: `v3-pubflow-${stamp}`, owner_id: userId }
  await t('workspaces').insert(ws)
  await t('workspace_members').insert({ workspace_id: ws.id, user_id: userId, role: 'owner' })

  const driveToVerifying = async (taskId: string) => {
    await transitionTask({ taskId, expectedStatus: 'draft', newStatus: 'planning' })
    await transitionTask({ taskId, expectedStatus: 'planning', newStatus: 'queued' })
    await transitionTask({ taskId, expectedStatus: 'queued', newStatus: 'running' })
    await transitionTask({ taskId, expectedStatus: 'running', newStatus: 'verifying' })
  }

  // A demo computer with a checkpoint and changed-file evidence.
  const { data: computer, error: computerError } = await t('computers')
    .insert({
      workspace_id: ws.id,
      owner_user_id: userId,
      provider: 'fixture',
      name: 'Demo Computer',
      state: 'ready',
      image_ref: 'fixture',
      is_demo: true,
    })
    .select('*')
    .single()
  if (computerError) throw new Error(`computer insert failed: ${computerError.message}`)

  const { data: checkpoint } = await t('computer_checkpoints')
    .insert({ computer_id: computer.id, workspace_id: ws.id, label: 'pre-publication' })
    .select('*')
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).rpc('v3_append_computer_event', {
    p_computer_id: computer.id,
    p_type: 'agent.file.changed',
    p_payload: { file: 'src/onboarding.ts' },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).rpc('v3_append_computer_event', {
    p_computer_id: computer.id,
    p_type: 'agent.file.changed',
    p_payload: { file: 'src/onboarding.test.ts' },
  })

  console.log('\n=== 1. Propose requires verifying ===')
  const task = await createTask({ workspaceId: ws.id, userId, goal: 'Fix the onboarding bug' })
  await expectThrow(
    () =>
      proposePublication({
        taskId: task.id,
        workspaceId: ws.id,
        userId,
        computerId: computer.id,
        repository: 'demo/onboarding',
        branch: '2hands/fix-onboarding',
        prTitle: 'Fix onboarding',
      }),
    /Illegal transition/i,
    'propose from draft rejected',
  )

  await driveToVerifying(task.id)

  console.log('\n=== 2. Propose from verifying → exact approval + awaiting_approval ===')
  const proposal = await proposePublication({
    taskId: task.id,
    workspaceId: ws.id,
    userId,
    computerId: computer.id,
    repository: 'demo/onboarding',
    branch: '2hands/fix-onboarding',
    prTitle: 'Fix onboarding',
  })
  assert(proposal.approval.riskClass === 'r2_external_write', 'approval risk class is r2_external_write')
  assert(proposal.approval.category === 'publication', 'approval category is publication')
  assert(
    proposal.approval.title.includes('demo/onboarding') &&
      proposal.approval.summary.includes('2hands/fix-onboarding'),
    'title/summary show exact repo + branch',
  )
  assert(
    proposal.commitSha === deterministicCommitSha(checkpoint?.id ?? null, task.id) &&
      /^[0-9a-f]{40}$/.test(proposal.commitSha),
    'commit sha deterministic from latest checkpoint',
  )
  assert(
    proposal.changedFiles.includes('src/onboarding.ts') &&
      (proposal.diffSummary ?? '').includes('2 files changed'),
    'diff summary gathered from computer events',
  )
  assert(typeof proposal.approval.challenge === 'string' && proposal.approval.challenge.length > 0, 'challenge returned')

  let taskRow = await getTask(task.id, ws.id)
  assert(taskRow?.status === 'awaiting_approval', 'task transitioned verifying → awaiting_approval')
  assert(taskRow?.waiting_resource_id === proposal.approval.id, 'waiting resource is the approval')

  console.log('\n=== 3. Execute before approval is rejected ===')
  await expectThrow(
    () =>
      executePublication({
        taskId: task.id,
        workspaceId: ws.id,
        userId,
        approvalId: proposal.approval.id,
      }),
    /Illegal transition: approval is 'pending'/i,
    'execute with pending approval rejected',
  )

  console.log('\n=== 4. Approve → execute → completed with receipt ===')
  await respondApproval({
    approvalId: proposal.approval.id,
    workspaceId: ws.id,
    userId,
    challenge: proposal.approval.challenge,
    actionHash: proposal.approval.canonicalActionHash,
    response: 'approved',
    idempotencyKey: `approve-${stamp}`,
  })

  const executed = await executePublication({
    taskId: task.id,
    workspaceId: ws.id,
    userId,
    approvalId: proposal.approval.id,
  })
  assert(executed.taskStatus === 'completed', 'task completed after execution')
  assert(executed.replayed === false, 'first execution is not a replay')
  assert(executed.publication.repository === 'demo/onboarding', 'publication targets exact repository')
  assert(executed.publication.pr_draft === true, 'PR recorded as draft')
  assert(typeof executed.receiptId === 'string' && executed.receiptId.length > 0, 'receipt id returned')

  taskRow = await getTask(task.id, ws.id)
  assert(taskRow?.status === 'completed', 'task row is completed')
  assert(taskRow?.receipt_id === executed.receiptId, 'tasks.receipt_id set to the publication receipt')

  const { data: events } = await t('task_events').select('type').eq('task_id', task.id).order('sequence')
  const types = (events ?? []).map((e: { type: string }) => e.type)
  for (const expected of [
    'task.created',
    'approval.requested',
    'task.waiting',
    'approval.approved',
    'task.resumed',
    'publication.completed',
    'receipt.created',
    'task.verification.started',
    'task.verification.completed',
    'task.completed',
  ]) {
    assert(types.includes(expected), `event stream contains ${expected}`)
  }

  const approvalRow = await getApproval(proposal.approval.id, ws.id)
  assert(approvalRow?.status === 'consumed', 'approval consumed exactly once')

  console.log('\n=== 5. Retry executes exactly once (replay) ===')
  const retried = await executePublication({
    taskId: task.id,
    workspaceId: ws.id,
    userId,
    approvalId: proposal.approval.id,
  })
  assert(retried.replayed === true, 'retry replays the publication')
  assert((await listPublications(ws.id)).length === 1, 'exactly ONE publication record exists')

  console.log('\n=== 6. Deny → zero new publications, task untouched ===')
  const task2 = await createTask({ workspaceId: ws.id, userId, goal: 'Second fix' })
  await driveToVerifying(task2.id)
  const proposal2 = await proposePublication({
    taskId: task2.id,
    workspaceId: ws.id,
    userId,
    computerId: computer.id,
    repository: 'demo/onboarding',
    branch: '2hands/fix-two',
    prTitle: 'Second fix',
  })
  await respondApproval({
    approvalId: proposal2.approval.id,
    workspaceId: ws.id,
    userId,
    challenge: proposal2.approval.challenge,
    actionHash: proposal2.approval.canonicalActionHash,
    response: 'denied',
    idempotencyKey: `deny-${stamp}`,
  })
  await expectThrow(
    () =>
      executePublication({
        taskId: task2.id,
        workspaceId: ws.id,
        userId,
        approvalId: proposal2.approval.id,
      }),
    /Illegal transition: approval is 'denied'/i,
    'execute after deny rejected',
  )
  const task2Row = await getTask(task2.id, ws.id)
  assert(task2Row?.status === 'awaiting_approval', 'denied task remains awaiting_approval (no side effect)')
  assert((await listPublications(ws.id)).length === 1, 'still exactly one publication after deny')

  console.log('\n=== 7. Approval from another task cannot execute here ===')
  await expectThrow(
    () =>
      executePublication({
        taskId: task.id,
        workspaceId: ws.id,
        userId,
        approvalId: proposal2.approval.id,
      }),
    /mismatch/i,
    'cross-task approval rejected',
  )

  await t('workspaces').delete().in('id', [ws.id])
  await admin.auth.admin.deleteUser(userId)

  console.log('\n───────────────────────────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error('Publication flow test crashed:', error)
  process.exit(1)
})
