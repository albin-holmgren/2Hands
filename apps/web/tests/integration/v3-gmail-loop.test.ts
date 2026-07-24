#!/usr/bin/env npx tsx
// v3 Slice 4 — Demo Gmail trust loop + email verification integration test
// against LOCAL Supabase:
//   A. draft → approval → send: deny sends NOTHING; approve sends exactly once
//      under retry; receipt carries the provider message id as evidence.
//   B. Verification positive path: expectation → seeded OTP mail from an
//      allowed domain → candidate found with an opaque secret ref; the raw
//      code appears in ZERO API-shaped outputs and verification_events.
//   C. Forbidden-category path: a password-reset mail with an embedded code is
//      rejected (forbidden_category) and NO secret is extracted.
//
// Requires a running local stack (`supabase start`). Skips politely otherwise.

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

  // Service modules read env at import time in some paths — set before import.
  process.env.NEXT_PUBLIC_SUPABASE_URL = url
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey
  process.env.SECRET_BROKER_MASTER_KEY = process.env.SECRET_BROKER_MASTER_KEY || 'a'.repeat(64)
  process.env.SECRET_BROKER_KEY_ID = process.env.SECRET_BROKER_KEY_ID || 'test-key'

  const { createDraft, sendEmail, searchInbox, readMessage } = await import('../../src/lib/v3/demo-gmail')
  const { createVerificationExpectation, searchDemoInboxForExpectation, consumeVerification } = await import(
    '../../src/lib/v3/email-verification'
  )

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = (name: string) => (admin as any).from(name)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminRpc = (name: string, args: Record<string, unknown>) => (admin as any).rpc(name, args)

  const stamp = Date.now()
  const { data: user } = await admin.auth.admin.createUser({
    email: `v3-gmail-${stamp}@example.test`,
    password: `pw-${randomUUID()}`,
    email_confirm: true,
  })
  if (!user?.user) throw new Error('user create failed')
  const ws = { id: randomUUID(), name: 'v3-gmail', slug: `v3-gmail-${stamp}`, owner_id: user.user.id }
  await t('workspaces').insert(ws)
  await t('workspace_members').insert({ workspace_id: ws.id, user_id: user.user.id, role: 'owner' })

  const { data: task } = await t('tasks')
    .insert({
      workspace_id: ws.id,
      user_id: user.user.id,
      type: 'v3',
      description: 'gmail loop test',
      goal: 'gmail loop test',
      status: 'draft',
      origin: 'test',
    })
    .select('*')
    .single()

  const recipient = `recipient-${stamp}@example.test`
  const seededEmails: string[] = [recipient]

  try {
    console.log('\n=== A1. Draft stored as artifact ===')
    const draft = await createDraft({
      workspaceId: ws.id,
      taskId: task.id,
      to: recipient,
      subject: 'Hello from 2Hands',
      body: 'Meeting notes: everything on track for Thursday.',
    })
    assert(Boolean(draft.artifactId), 'draft created with artifact id')
    const { data: artifact } = await t('artifacts').select('*').eq('id', draft.artifactId).single()
    assert(
      artifact?.kind === 'document' && artifact?.safe_metadata?.to === recipient,
      'artifact row is kind document with to/subject metadata',
    )

    const action = {
      action: 'gmail.send',
      taskId: task.id,
      target: { to: recipient },
      input: { draftArtifactId: draft.artifactId, subject: 'Hello from 2Hands' },
    }
    const hash = canonicalActionHash(action)

    const makeApproval = async () => {
      const { data, error } = await t('approvals')
        .insert({
          workspace_id: ws.id,
          task_id: task.id,
          risk_class: 'r2_external_write',
          category: 'external_communication',
          title: 'Send email',
          summary: `"Hello from 2Hands" → ${recipient}`,
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
      adminRpc('v3_respond_approval', {
        p_approval_id: approval.id,
        p_challenge: approval.challenge,
        p_action_hash: hash,
        p_response: response,
        p_user_id: user!.user!.id,
        p_idempotency_key: key,
      })

    const outboundCount = async () => {
      const { data } = await t('demo_inbox').select('id').eq('to_email', recipient)
      return (data ?? []).length
    }

    console.log('\n=== A2. Deny → nothing is sent ===')
    const denied = await makeApproval()
    await respond(denied, 'denied', `deny-${stamp}`)
    const denySend = await sendEmail({
      workspaceId: ws.id,
      taskId: task.id,
      approvalId: denied.id,
      actionHash: hash,
      draftArtifactId: draft.artifactId,
      idempotencyKey: `gmail-deny-${stamp}`,
    })
    assert(denySend.status === 'rejected', 'send after deny is rejected')
    assert((await outboundCount()) === 0, 'zero outbound messages after deny')
    const { data: denyReceipts } = await t('action_receipts').select('id').eq('workspace_id', ws.id).eq('kind', 'gmail.send')
    assert((denyReceipts ?? []).length === 0, 'zero gmail.send receipts after deny')

    console.log('\n=== A3. Approve → exactly once under retry ===')
    const approved = await makeApproval()
    await respond(approved, 'approved', `approve-${stamp}`)

    const key = `gmail-send-${stamp}`
    const first = await sendEmail({
      workspaceId: ws.id,
      taskId: task.id,
      approvalId: approved.id,
      actionHash: hash,
      draftArtifactId: draft.artifactId,
      idempotencyKey: key,
    })
    assert(first.status === 'sent' && first.replayed === false, 'first send succeeds')

    // Simulated retry after ambiguous timeout: same idempotency key.
    const retry = await sendEmail({
      workspaceId: ws.id,
      taskId: task.id,
      approvalId: approved.id,
      actionHash: hash,
      draftArtifactId: draft.artifactId,
      idempotencyKey: key,
    })
    assert(retry.status === 'sent' && retry.replayed === true, 'retry replays instead of re-sending')
    assert(
      first.status === 'sent' && retry.status === 'sent' && retry.messageId === first.messageId,
      'retry returns the SAME provider message id',
    )
    assert((await outboundCount()) === 1, 'exactly ONE outbound message exists')

    console.log('\n=== A4. Receipt with provider message id evidence ===')
    const { data: receipts } = await t('action_receipts').select('*').eq('workspace_id', ws.id).eq('kind', 'gmail.send')
    assert((receipts ?? []).length === 1, 'exactly one gmail.send receipt')
    const receipt = receipts![0]
    const sentMessageId = first.status === 'sent' ? first.messageId : ''
    assert(receipt.provider === 'demo-gmail', 'receipt provider is demo-gmail')
    assert(receipt.provider_request_ref === sentMessageId, 'receipt provider_request_ref is the message id')
    assert(receipt.idempotency_key === key, 'receipt carries the idempotency key')
    assert(
      Array.isArray(receipt.evidence) &&
        receipt.evidence.some(
          (e: { kind: string; ref: string }) => e.kind === 'provider_message_id' && e.ref === sentMessageId,
        ),
      'receipt evidence includes the provider message id',
    )

    console.log('\n=== A5. Consumed approval cannot authorize a second send ===')
    const second = await sendEmail({
      workspaceId: ws.id,
      taskId: task.id,
      approvalId: approved.id,
      actionHash: hash,
      draftArtifactId: draft.artifactId,
      idempotencyKey: `gmail-send-2-${stamp}`,
    })
    assert(second.status === 'rejected', 'distinct send under consumed approval is rejected')
    assert((await outboundCount()) === 1, 'still exactly one outbound message')

    const { data: events } = await t('task_events').select('*').eq('task_id', task.id).order('sequence')
    assert(
      (events ?? []).some((e: { type: string }) => e.type === 'artifact.created'),
      'artifact.created event appended for the draft',
    )
    assert(
      (events ?? []).some(
        (e: { type: string; payload: { action?: string } }) =>
          e.type === 'task.step.completed' && e.payload?.action === 'gmail.send',
      ),
      'task.step.completed(gmail.send) event appended',
    )
    assert(
      (events ?? []).some((e: { type: string }) => e.type === 'receipt.created'),
      'receipt.created event appended',
    )

    console.log('\n=== A6. Search/read connector surface stays safe ===')
    const found = await searchInbox({ workspaceId: ws.id, query: { toEmail: recipient } })
    assert(found.length === 1 && !('body' in (found[0] as unknown as Record<string, unknown>)), 'search returns metadata only')
    const readable = await readMessage(found[0].id)
    assert(readable !== null && readable.bodyWithheld === false && typeof readable.body === 'string', "read returns body for kind 'other'")

    // ========================================================================
    console.log('\n=== B. Verification positive path ===')
    const verifyEmail = `verify-${stamp}@demo-user.test`
    seededEmails.push(verifyEmail)
    const { data: authRun } = await t('auth_runs')
      .insert({
        workspace_id: ws.id,
        user_id: user.user.id,
        provider_id: 'demo-account-provider',
        capability: 'demo.capability',
        status: 'awaiting_email_verification',
        expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      })
      .select('*')
      .single()

    const expectation = await createVerificationExpectation({
      authRunId: authRun.id,
      workspaceId: ws.id,
      userId: user.user.id,
      providerId: 'demo-account-provider',
      targetEmail: verifyEmail,
      allowedSenderDomains: ['demo-provider.test'],
      allowedTypes: ['otp'],
      usePolicy: 'ask_each_time',
    })
    assert(expectation.status === 'waiting', 'expectation created in waiting status')

    const RAW_CODE = '654321'
    await t('demo_inbox').insert({
      to_email: verifyEmail,
      from_domain: 'demo-provider.test',
      subject: 'Your Demo Provider verification code',
      body_text: `Your code is ${RAW_CODE}. It expires in 10 minutes.`,
      kind: 'otp',
    })

    const searchResult = await searchDemoInboxForExpectation(expectation.id)
    assert(searchResult.found === true, 'candidate found')
    assert(searchResult.candidate?.classification === 'otp', 'candidate classified as otp')
    assert(
      typeof searchResult.candidate?.secretRef === 'string' && searchResult.candidate.secretRef.startsWith('sec_'),
      'candidate carries an opaque secret ref',
    )
    assert(!JSON.stringify(searchResult).includes(RAW_CODE), 'raw code absent from the search result (API shape)')

    const { data: expRow } = await t('verification_expectations').select('*').eq('id', expectation.id).single()
    assert(expRow.status === 'candidate_found', 'expectation moved to candidate_found')
    assert(!JSON.stringify(expRow).includes(RAW_CODE), 'raw code absent from the expectation row')

    const { data: verifEvents } = await t('verification_events').select('*').eq('expectation_id', expectation.id)
    assert((verifEvents ?? []).length > 0, 'verification events recorded')
    assert(
      !(verifEvents ?? []).some((e: unknown) => JSON.stringify(e).includes(RAW_CODE)),
      'raw code absent from ALL verification_events',
    )
    assert(
      (verifEvents ?? []).some((e: { type: string }) => e.type === 'verification.candidate.found'),
      'verification.candidate.found event recorded',
    )

    const { data: refs } = await adminRpc('v3_list_auth_run_secret_refs', { p_auth_run_id: authRun.id })
    assert((refs ?? []).length === 1, 'exactly one protected secret stored for the auth run')
    assert(
      (refs ?? []).every((r: { secret_ref: string }) => !r.secret_ref.includes(RAW_CODE)),
      'secret ref carries no raw code material',
    )

    await consumeVerification(expectation.id, user.user.id)
    const { data: consumedRow } = await t('verification_expectations').select('status, uses').eq('id', expectation.id).single()
    assert(consumedRow.status === 'consumed' && consumedRow.uses === 1, 'expectation consumed exactly once')
    let doubleConsumeFailed = false
    try {
      await consumeVerification(expectation.id, user.user.id)
    } catch {
      doubleConsumeFailed = true
    }
    assert(doubleConsumeFailed, 'second consume is refused')

    // ========================================================================
    console.log('\n=== C. Forbidden category: password reset is never extracted ===')
    const forbiddenEmail = `forbidden-${stamp}@demo-user.test`
    seededEmails.push(forbiddenEmail)
    const { data: authRun2 } = await t('auth_runs')
      .insert({
        workspace_id: ws.id,
        user_id: user.user.id,
        provider_id: 'demo-account-provider',
        capability: 'demo.capability',
        status: 'awaiting_email_verification',
        expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      })
      .select('*')
      .single()

    const forbiddenExpectation = await createVerificationExpectation({
      authRunId: authRun2.id,
      workspaceId: ws.id,
      userId: user.user.id,
      providerId: 'demo-account-provider',
      targetEmail: forbiddenEmail,
      allowedSenderDomains: ['demo-provider.test'],
      allowedTypes: ['otp'],
    })

    const FORBIDDEN_CODE = '111222'
    const { data: forbiddenMail } = await t('demo_inbox')
      .insert({
        to_email: forbiddenEmail,
        from_domain: 'demo-provider.test',
        subject: 'Reset your password',
        body_text: `Use code ${FORBIDDEN_CODE} to reset your password.`,
        kind: 'otp',
      })
      .select('*')
      .single()

    const forbiddenResult = await searchDemoInboxForExpectation(forbiddenExpectation.id)
    assert(forbiddenResult.found === false, 'no candidate found for the password-reset mail')
    assert(forbiddenResult.rejectedCount >= 1, 'the mail was rejected')

    const { data: forbiddenEvents } = await t('verification_events')
      .select('*')
      .eq('expectation_id', forbiddenExpectation.id)
    assert(
      (forbiddenEvents ?? []).some(
        (e: { type: string; payload: { reason?: string; category?: string } }) =>
          e.type === 'verification.candidate.rejected' &&
          e.payload?.reason === 'forbidden_category' &&
          e.payload?.category === 'password_reset',
      ),
      'rejection event says forbidden_category / password_reset',
    )
    assert(
      !(forbiddenEvents ?? []).some((e: unknown) => JSON.stringify(e).includes(FORBIDDEN_CODE)),
      'embedded code absent from ALL verification_events',
    )

    const { data: refs2 } = await adminRpc('v3_list_auth_run_secret_refs', { p_auth_run_id: authRun2.id })
    assert((refs2 ?? []).length === 0, 'NO protected secret extracted for the forbidden mail')

    const { data: forbiddenMailAfter } = await t('demo_inbox').select('consumed_at').eq('id', forbiddenMail.id).single()
    assert(forbiddenMailAfter.consumed_at === null, 'forbidden mail was not consumed')

    const { data: forbiddenExpAfter } = await t('verification_expectations')
      .select('status')
      .eq('id', forbiddenExpectation.id)
      .single()
    assert(forbiddenExpAfter.status === 'waiting', 'expectation stays waiting (no candidate)')
  } finally {
    // Cleanup: demo_inbox is a shared fixture without workspace rows.
    for (const email of seededEmails) {
      await t('demo_inbox').delete().eq('to_email', email)
    }
    await t('workspaces').delete().eq('id', ws.id)
    await admin.auth.admin.deleteUser(user.user.id)
  }

  console.log('\n───────────────────────────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error('Gmail loop test crashed:', error)
  process.exit(1)
})
