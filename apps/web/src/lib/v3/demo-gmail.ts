/**
 * Demo Gmail connector — deterministic, clearly-labeled DEMO mailbox backed by
 * public.demo_inbox. It exercises the exact v3 connector contract the real
 * Gmail connector implements against the Gmail API:
 *
 *   - gmail.search  (R0): safe metadata only — NEVER bodies, and rows of kind
 *     otp/magic_link never expose their content outside the Verification
 *     Broker (those bodies carry verification secrets);
 *   - gmail.read    (R0): body only for kind 'other' messages;
 *   - gmail.draft   (R1): drafts are stored as `artifacts` rows (kind
 *     'document'); the body is user/agent-authored content, not a secret;
 *   - gmail.send    (R2): the trust loop — exact-approval consumption
 *     (single-use, hash-bound), exactly-once under retry via idempotency-key
 *     replay on action_receipts, immutable receipt with the provider message
 *     id as evidence, task event. Mirrors demo-github.ts.
 *
 * Exactly-once protocol (survives retries and ambiguous timeouts):
 *   1. replay check — an existing 'gmail.send' receipt under this idempotency
 *      key is returned as-is (reconciliation after ambiguity);
 *   2. exact-approval consumption — v3_consume_approval succeeds once, so a
 *      concurrent duplicate cannot send a second mail;
 *   3. insert the outbound message; 4. immutable receipt + task event.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { consumeApproval, createReceipt, type ReceiptRow } from './approvals'
import { appendTaskEvent } from './tasks'

// New v3 tables are not yet in the generated database types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (sb: ReturnType<typeof createAdminClient>, name: string) => (sb as any).from(name)

/** Sender domain stamped on outbound Demo Gmail mail. */
export const DEMO_GMAIL_OUTBOUND_DOMAIN = '2hands-user.test'
export const DEMO_GMAIL_PROVIDER = 'demo-gmail'

export type DemoInboxKind = 'otp' | 'magic_link' | 'other'

/** Safe metadata for one mailbox message. Never carries the body. */
export interface DemoGmailMessageMeta {
  id: string
  fromDomain: string
  subject: string
  kind: DemoInboxKind
  createdAt: string
}

export interface SearchInboxInput {
  /**
   * Present for connector-contract parity and future scoping; the demo inbox
   * is a shared demo fixture without workspace rows.
   */
  workspaceId: string
  query: {
    toEmail?: string
    fromDomain?: string
    sinceIso?: string
  }
  limit?: number
}

/**
 * R0 search: returns safe metadata only. Bodies are never selected — for
 * otp/magic_link rows the content is a verification secret that must flow
 * exclusively through the Email Verification Broker.
 */
export async function searchInbox(input: SearchInboxInput): Promise<DemoGmailMessageMeta[]> {
  const admin = createAdminClient()
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50)

  let query = table(admin, 'demo_inbox')
    .select('id, from_domain, subject, kind, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (input.query.toEmail) query = query.eq('to_email', input.query.toEmail)
  if (input.query.fromDomain) query = query.eq('from_domain', input.query.fromDomain)
  if (input.query.sinceIso) query = query.gte('created_at', input.query.sinceIso)

  const { data, error } = await query
  if (error) throw new Error(`searchInbox failed: ${error.message}`)

  return ((data ?? []) as Array<Record<string, string>>).map((row) => ({
    id: row.id,
    fromDomain: row.from_domain,
    subject: row.subject,
    kind: (row.kind ?? 'other') as DemoInboxKind,
    createdAt: row.created_at,
  }))
}

export interface ReadMessageResult {
  message: DemoGmailMessageMeta
  /** Present only for kind 'other'. */
  body: string | null
  /** True when the body was withheld (verification mail). */
  bodyWithheld: boolean
}

/**
 * R0 read: the body is returned ONLY for kind 'other'. Verification mail
 * (otp/magic_link) bodies are withheld — they are consumed by the
 * Verification Broker under a signed expectation, never read directly.
 */
export async function readMessage(messageId: string): Promise<ReadMessageResult | null> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'demo_inbox')
    .select('id, from_domain, subject, kind, created_at, body_text')
    .eq('id', messageId)
    .maybeSingle()
  if (error) throw new Error(`readMessage failed: ${error.message}`)
  if (!data) return null

  const kind = ((data as { kind?: string }).kind ?? 'other') as DemoInboxKind
  const meta: DemoGmailMessageMeta = {
    id: data.id,
    fromDomain: data.from_domain,
    subject: data.subject,
    kind,
    createdAt: data.created_at,
  }
  if (kind !== 'other') {
    return { message: meta, body: null, bodyWithheld: true }
  }
  return { message: meta, body: (data as { body_text: string }).body_text, bodyWithheld: false }
}

export interface EmailDraft {
  artifactId: string
  to: string
  subject: string
  body: string
  createdAt: string
}

export interface CreateDraftInput {
  workspaceId: string
  taskId?: string
  to: string
  subject: string
  body: string
}

/**
 * R1 draft: stored as an artifacts row (kind 'document'). The body here is
 * authored content the user reviews in the approval preview — not a secret.
 */
export async function createDraft(input: CreateDraftInput): Promise<EmailDraft> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'artifacts')
    .insert({
      workspace_id: input.workspaceId,
      task_id: input.taskId ?? null,
      kind: 'document',
      title: `Email draft: ${input.subject}`,
      mime_type: 'text/plain',
      safe_metadata: {
        connector: DEMO_GMAIL_PROVIDER,
        type: 'email_draft',
        to: input.to,
        subject: input.subject,
        body: input.body,
      },
    })
    .select('*')
    .single()
  if (error) throw new Error(`createDraft failed: ${error.message}`)

  if (input.taskId) {
    await appendTaskEvent({
      taskId: input.taskId,
      type: 'artifact.created',
      actorKind: 'connector',
      payload: {
        artifactId: data.id,
        kind: 'document',
        connector: DEMO_GMAIL_PROVIDER,
        artifactType: 'email_draft',
        subject: input.subject,
      },
    })
  }

  return {
    artifactId: data.id,
    to: input.to,
    subject: input.subject,
    body: input.body,
    createdAt: data.created_at,
  }
}

export async function getDraft(draftArtifactId: string, workspaceId: string): Promise<EmailDraft | null> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'artifacts')
    .select('*')
    .eq('id', draftArtifactId)
    .eq('workspace_id', workspaceId)
    .eq('kind', 'document')
    .maybeSingle()
  if (error) throw new Error(`getDraft failed: ${error.message}`)
  if (!data) return null
  const meta = (data.safe_metadata ?? {}) as Record<string, unknown>
  if (meta.connector !== DEMO_GMAIL_PROVIDER || meta.type !== 'email_draft') return null
  if (typeof meta.to !== 'string' || typeof meta.subject !== 'string' || typeof meta.body !== 'string') {
    return null
  }
  return {
    artifactId: data.id,
    to: meta.to,
    subject: meta.subject,
    body: meta.body,
    createdAt: data.created_at,
  }
}

export interface SendEmailInput {
  workspaceId: string
  taskId?: string
  approvalId: string
  /** Hash the approval was granted for — must still match. */
  actionHash: string
  draftArtifactId: string
  idempotencyKey: string
}

export type SendEmailResult =
  | { status: 'sent'; messageId: string; receipt: ReceiptRow; replayed: boolean }
  | { status: 'rejected'; reason: 'approval_not_consumable' | 'draft_not_found' }

/** R2 send — the trust loop. See module header for the exactly-once protocol. */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const admin = createAdminClient()

  // 1. Idempotent replay: same key → same receipt/message, no second send.
  const { data: existingReceipt, error: replayError } = await table(admin, 'action_receipts')
    .select('*')
    .eq('workspace_id', input.workspaceId)
    .eq('kind', 'gmail.send')
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle()
  if (replayError) throw new Error(`sendEmail replay check failed: ${replayError.message}`)
  if (existingReceipt) {
    return {
      status: 'sent',
      messageId: (existingReceipt as { provider_request_ref: string }).provider_request_ref,
      receipt: existingReceipt as ReceiptRow,
      replayed: true,
    }
  }

  // 2. The draft is the exact content the approval previewed.
  const draft = await getDraft(input.draftArtifactId, input.workspaceId)
  if (!draft) {
    return { status: 'rejected', reason: 'draft_not_found' }
  }

  // 3. Exact approval consumption — single use, hash must still match. This is
  // the serialization point: a concurrent duplicate cannot also consume, so at
  // most one send happens per approval.
  const consumed = await consumeApproval({ approvalId: input.approvalId, actionHash: input.actionHash })
  if (!consumed) {
    return { status: 'rejected', reason: 'approval_not_consumable' }
  }

  // 4. "Send": insert the outbound message into the demo mailbox.
  const { data: message, error: sendError } = await table(admin, 'demo_inbox')
    .insert({
      to_email: draft.to,
      from_domain: DEMO_GMAIL_OUTBOUND_DOMAIN,
      subject: draft.subject,
      body_text: draft.body,
      kind: 'other',
    })
    .select('id, created_at')
    .single()
  if (sendError) throw new Error(`sendEmail insert failed: ${sendError.message}`)
  const messageId = (message as { id: string }).id

  // 5. Immutable receipt with the provider message id as evidence.
  const receipt = await createReceipt({
    workspaceId: input.workspaceId,
    taskId: input.taskId,
    approvalId: input.approvalId,
    kind: 'gmail.send',
    title: `Email sent: ${draft.subject}`,
    summary: `Sent "${draft.subject}" to ${draft.to} (Demo Gmail).`,
    evidence: [
      { kind: 'provider_message_id', ref: messageId },
      { kind: 'recipient', ref: draft.to },
      { kind: 'draft_artifact', ref: input.draftArtifactId },
    ],
    provider: DEMO_GMAIL_PROVIDER,
    providerRequestRef: messageId,
    idempotencyKey: input.idempotencyKey,
    outcome: 'success',
  })

  // 6. Task event (safe metadata only — never the body).
  if (input.taskId) {
    await appendTaskEvent({
      taskId: input.taskId,
      type: 'task.step.completed',
      actorKind: 'connector',
      payload: {
        action: 'gmail.send',
        connector: DEMO_GMAIL_PROVIDER,
        approvalId: input.approvalId,
        providerMessageId: messageId,
        receiptId: receipt.id,
      },
    })
  }

  return { status: 'sent', messageId, receipt, replayed: false }
}
