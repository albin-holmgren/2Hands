/**
 * Email Verification Broker — privileged service correlating verification
 * email (OTP / magic link) with an ACTIVE, user-initiated auth run.
 *
 * Invariants:
 *  - a signed expectation must exist BEFORE any mailbox search;
 *  - queries are narrow: recipient, sender domains, time window, hints;
 *  - forbidden categories are never auto-consumed (password reset, recovery,
 *    security warnings, disable-MFA, bank/payment codes, identity checks,
 *    purchase confirmations) — they require explicit manual handling;
 *  - the extractor returns an opaque secret ref; raw codes/links never reach
 *    the model, events, logs, or API responses;
 *  - each expectation is consumed at most `maximum_uses` times (default 1).
 */
import { createAdminClient } from '@/lib/supabase/admin'
import {
  encryptSecretValue,
  envKeyProvider,
  newSecretRef,
  type SecretContext,
} from '@2hands/secret-broker'
import { randomUUID } from 'node:crypto'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (sb: ReturnType<typeof createAdminClient>, name: string) => (sb as any).from(name)
const rpc = (sb: ReturnType<typeof createAdminClient>, name: string, args: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb as any).rpc(name, args)

export type EmailClassification =
  | { kind: 'otp' }
  | { kind: 'magic_link' }
  | { kind: 'forbidden'; category: ForbiddenCategory }
  | { kind: 'other' }

export type ForbiddenCategory =
  | 'password_reset'
  | 'account_recovery'
  | 'security_warning'
  | 'disable_mfa'
  | 'bank_or_payment'
  | 'identity_verification'
  | 'purchase_confirmation'

const FORBIDDEN_PATTERNS: Array<{ category: ForbiddenCategory; pattern: RegExp }> = [
  { category: 'password_reset', pattern: /reset\s+(your\s+)?password|password\s+reset|forgot(ten)?\s+password/i },
  { category: 'account_recovery', pattern: /account\s+recovery|recover\s+(your\s+)?account|recovery\s+code/i },
  { category: 'security_warning', pattern: /security\s+(alert|warning)|suspicious\s+(sign[- ]?in|activity)|unusual\s+activity/i },
  { category: 'disable_mfa', pattern: /disable\s+(two[- ]?factor|2fa|mfa)|turn\s+off\s+(two[- ]?factor|2fa|mfa)/i },
  { category: 'bank_or_payment', pattern: /bank\s+verification|transaction\s+code|payment\s+authorization|wire\s+transfer/i },
  { category: 'identity_verification', pattern: /identity\s+verification|verify\s+your\s+identity|id\s+document/i },
  { category: 'purchase_confirmation', pattern: /order\s+confirmation|purchase\s+confirmation|receipt\s+for\s+your\s+(order|purchase)/i },
]

const OTP_PATTERN = /\b(\d{6})\b/
const MAGIC_LINK_PATTERN = /https?:\/\/[^\s"'<>]+(?:magic|verify|confirm|token)[^\s"'<>]*/i

/**
 * Classify a message. Forbidden categories win over anything else — a mail
 * that looks like both an OTP and a password reset is a password reset.
 */
export function classifyEmail(subject: string, body: string): EmailClassification {
  const haystack = `${subject}\n${body}`
  for (const { category, pattern } of FORBIDDEN_PATTERNS) {
    if (pattern.test(haystack)) return { kind: 'forbidden', category }
  }
  if (MAGIC_LINK_PATTERN.test(haystack)) return { kind: 'magic_link' }
  if (OTP_PATTERN.test(haystack)) return { kind: 'otp' }
  return { kind: 'other' }
}

/** Reject lookalike sender domains: exact match only (no subdomain tricks). */
export function senderDomainAllowed(fromDomain: string, allowedDomains: string[]): boolean {
  const normalized = fromDomain.trim().toLowerCase()
  return allowedDomains.some((d) => d.trim().toLowerCase() === normalized)
}

export interface CreateExpectationInput {
  authRunId: string
  workspaceId: string
  userId: string
  providerId: string
  targetEmail: string
  allowedSenderDomains: string[]
  allowedTypes: Array<'otp' | 'magic_link'>
  subjectHints?: string[]
  usePolicy?: 'manual' | 'ask_each_time' | 'automatic_if_policy_allows'
  ttlMs?: number
}

export interface ExpectationRow {
  id: string
  auth_run_id: string
  workspace_id: string
  user_id: string
  provider_id: string
  target_email: string
  allowed_sender_domains: string[]
  subject_hints: string[]
  allowed_types: Array<'otp' | 'magic_link'>
  not_before: string
  expires_at: string
  maximum_uses: number
  uses: number
  use_policy: string
  status: 'waiting' | 'candidate_found' | 'approved' | 'consumed' | 'expired' | 'cancelled'
}

export async function createVerificationExpectation(input: CreateExpectationInput): Promise<ExpectationRow> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'verification_expectations')
    .insert({
      auth_run_id: input.authRunId,
      workspace_id: input.workspaceId,
      user_id: input.userId,
      provider_id: input.providerId,
      target_email: input.targetEmail,
      allowed_sender_domains: input.allowedSenderDomains,
      subject_hints: input.subjectHints ?? [],
      allowed_types: input.allowedTypes,
      not_before: new Date().toISOString(),
      expires_at: new Date(Date.now() + (input.ttlMs ?? 10 * 60 * 1000)).toISOString(),
      use_policy: input.usePolicy ?? 'ask_each_time',
    })
    .select('*')
    .single()
  if (error) throw new Error(`createVerificationExpectation failed: ${error.message}`)

  await appendVerificationEvent(data.id, input.workspaceId, 'verification.expectation.created', {
    providerId: input.providerId,
    targetEmailMasked: maskEmail(input.targetEmail),
    allowedTypes: input.allowedTypes,
  })
  return data as ExpectationRow
}

/** Workspace-scoped lookup for route authorization. */
export async function getVerificationExpectation(
  expectationId: string,
  workspaceId: string,
): Promise<ExpectationRow | null> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'verification_expectations')
    .select('*')
    .eq('id', expectationId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (error) throw new Error(`getVerificationExpectation failed: ${error.message}`)
  return (data as ExpectationRow) ?? null
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '***'
  return `${local.slice(0, 1)}***@${domain}`
}

async function appendVerificationEvent(
  expectationId: string,
  workspaceId: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await table(admin, 'verification_events').insert({
    expectation_id: expectationId,
    workspace_id: workspaceId,
    type,
    payload,
  })
  if (error) throw new Error(`appendVerificationEvent failed: ${error.message}`)
}

export interface DemoInboxMessage {
  id: string
  to_email: string
  from_domain: string
  subject: string
  body_text: string
  kind: string
  consumed_at: string | null
  created_at: string
}

export interface CandidateResult {
  found: boolean
  /** Safe metadata only. */
  candidate?: {
    messageId: string
    fromDomain: string
    classification: 'otp' | 'magic_link'
    secretRef: string
  }
  rejectedCount: number
}

/**
 * Search the Demo Inbox (the deterministic connector source) for a message
 * satisfying an ACTIVE expectation, extract its verification secret into the
 * Secret Broker, and mark the candidate found. Real Gmail plugs in through
 * the connector boundary with the same narrow-query semantics.
 */
export async function searchDemoInboxForExpectation(expectationId: string): Promise<CandidateResult> {
  const admin = createAdminClient()
  const { data: expectation, error } = await table(admin, 'verification_expectations')
    .select('*')
    .eq('id', expectationId)
    .single()
  if (error || !expectation) throw new Error('Expectation not found')
  const exp = expectation as ExpectationRow

  if (exp.status !== 'waiting' && exp.status !== 'candidate_found') {
    throw new Error(`Expectation is ${exp.status} — search requires an active expectation`)
  }
  if (new Date(exp.expires_at).getTime() <= Date.now()) {
    await table(admin, 'verification_expectations').update({ status: 'expired' }).eq('id', expectationId)
    throw new Error('Expectation expired')
  }

  // Narrow query: recipient + window; sender filter applied per-row exactly.
  const { data: messages, error: inboxError } = await table(admin, 'demo_inbox')
    .select('*')
    .eq('to_email', exp.target_email)
    .gte('created_at', exp.not_before)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(20)
  if (inboxError) throw new Error(`demo inbox query failed: ${inboxError.message}`)

  let rejectedCount = 0
  for (const message of (messages ?? []) as DemoInboxMessage[]) {
    if (!senderDomainAllowed(message.from_domain, exp.allowed_sender_domains)) {
      rejectedCount++
      await appendVerificationEvent(expectationId, exp.workspace_id, 'verification.candidate.rejected', {
        reason: 'sender_domain_not_allowed',
        fromDomain: message.from_domain,
      })
      continue
    }
    const classification = classifyEmail(message.subject, message.body_text)
    if (classification.kind === 'forbidden') {
      rejectedCount++
      await appendVerificationEvent(expectationId, exp.workspace_id, 'verification.candidate.rejected', {
        reason: 'forbidden_category',
        category: classification.category,
      })
      continue
    }
    if (classification.kind === 'other' || !exp.allowed_types.includes(classification.kind)) {
      rejectedCount++
      await appendVerificationEvent(expectationId, exp.workspace_id, 'verification.candidate.rejected', {
        reason: 'type_not_allowed',
      })
      continue
    }

    // Privileged extraction → Secret Broker; raw value never leaves.
    const value =
      classification.kind === 'otp'
        ? message.body_text.match(OTP_PATTERN)?.[1]
        : message.body_text.match(MAGIC_LINK_PATTERN)?.[0]
    if (!value) {
      rejectedCount++
      continue
    }

    const provider = envKeyProvider(process.env as Record<string, string>)
    const requestId = `verif_${randomUUID()}`
    const context: SecretContext = {
      userId: exp.user_id,
      workspaceId: exp.workspace_id,
      authRunId: exp.auth_run_id,
      requestId,
      fieldKind: classification.kind,
      keyId: provider.keyId,
      expiresAt: exp.expires_at,
    }
    const stored = encryptSecretValue(value, context, provider)
    const secretRef = newSecretRef()
    // private.protected_secrets is NOT reachable through PostgREST (not even
    // for the service role) — writes go through the SECURITY DEFINER RPC,
    // same as the secure-input path.
    const { error: secretError } = await rpc(admin, 'v3_insert_protected_secret', {
      p_secret_ref: secretRef,
      p_workspace_id: exp.workspace_id,
      p_user_id: exp.user_id,
      p_auth_run_id: exp.auth_run_id,
      p_request_id: requestId,
      p_field_kind: classification.kind,
      p_retention: 'ephemeral',
      p_key_id: stored.keyId,
      p_salt_hex: stored.saltHex,
      p_nonce_hex: stored.nonceHex,
      p_ciphertext_hex: stored.ciphertextHex,
      // AAD context is safe metadata; decryption recomputes it from here.
      p_aad_context: context,
      p_expires_at: exp.expires_at,
    })
    if (secretError) throw new Error(`storing verification secret failed: ${secretError.message}`)

    await table(admin, 'demo_inbox').update({ consumed_at: new Date().toISOString() }).eq('id', message.id)
    await table(admin, 'verification_expectations')
      .update({ status: 'candidate_found' })
      .eq('id', expectationId)
    await appendVerificationEvent(expectationId, exp.workspace_id, 'verification.candidate.found', {
      classification: classification.kind,
      fromDomain: message.from_domain,
    })

    return {
      found: true,
      candidate: {
        messageId: message.id,
        fromDomain: message.from_domain,
        classification: classification.kind,
        secretRef,
      },
      rejectedCount,
    }
  }

  return { found: false, rejectedCount }
}

/**
 * Approve and consume the found candidate (per use policy). Marks the
 * expectation consumed; the secret is used exactly once by the injector and
 * destroyed by the broker's lease flow.
 */
export async function consumeVerification(expectationId: string, approvedByUserId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: expectation, error } = await table(admin, 'verification_expectations')
    .select('*')
    .eq('id', expectationId)
    .single()
  if (error || !expectation) throw new Error('Expectation not found')
  const exp = expectation as ExpectationRow

  if (exp.status !== 'candidate_found') {
    throw new Error(`Cannot consume expectation in status ${exp.status}`)
  }
  if (exp.uses >= exp.maximum_uses) {
    throw new Error('Expectation already fully used')
  }

  const { error: updateError } = await table(admin, 'verification_expectations')
    .update({ status: 'consumed', uses: exp.uses + 1 })
    .eq('id', expectationId)
    .eq('status', 'candidate_found')
  if (updateError) throw new Error(`consume failed: ${updateError.message}`)

  await appendVerificationEvent(expectationId, exp.workspace_id, 'verification.consumed', {
    approvedBy: approvedByUserId,
  })
}
