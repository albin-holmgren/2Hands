/**
 * v3 Secure Input service — the isolated server flow for protected values.
 *
 * A challenge issues short-lived x25519 keypair material; the client seals
 * each protected value to the challenge public key (transport sealing from
 * @2hands/secret-broker) and submits ciphertext only. This module opens the
 * sealed values inside the privileged boundary and IMMEDIATELY envelope-
 * encrypts them into private.protected_secrets. Plaintext exists only as
 * short-lived locals inside submitSecureInput and is overwritten after
 * encryption.
 *
 * HARD RULES for this file:
 * - No logging of request bodies, values, lengths, or hashes — anywhere.
 * - Errors thrown are safe machine codes only (no user input echoed).
 * - Auth events carry field IDs and state only.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import {
  decryptSecretValue,
  encryptSecretValue,
  envKeyProvider,
  generateChallengeKeypair,
  newSecretRef,
  openSealedValue,
  type SealedValue,
  type SecretContext,
  type StoredCiphertext,
} from '@2hands/secret-broker'
import type { SecretKind } from '@2hands/types/v3'
import { appendAuthEvent, getAuthRun, transitionAuthRun } from './auth-runs'

const rpc = (sb: ReturnType<typeof createAdminClient>, name: string, args: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb as any).rpc(name, args)

const CHALLENGE_TTL_MS = 10 * 60 * 1000
const EPHEMERAL_SECRET_TTL_MS = 15 * 60 * 1000
const RETAINED_SECRET_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** Marker fieldKind binding the envelope of the challenge secret key itself. */
const CHALLENGE_KEY_FIELD_KIND = 'challenge_key'

export type SecureInputFieldKind = Exclude<SecretKind, 'magic_link'>

export interface SecureInputFieldSpec {
  id: string
  kind: SecureInputFieldKind
  label: string
  autocomplete?: string
  retainOption?: boolean
}

interface SecureInputChallengeRow {
  id: string
  request_id: string
  auth_run_id: string
  workspace_id: string
  user_id: string
  challenge_public_key_hex: string
  challenge_secret_key_hex: string
  field_specs: SecureInputFieldSpec[]
  consumed_at: string | null
  expires_at: string
  created_at: string
}

function keyProvider() {
  return envKeyProvider({
    SECRET_BROKER_MASTER_KEY: process.env.SECRET_BROKER_MASTER_KEY,
    SECRET_BROKER_KEY_ID: process.env.SECRET_BROKER_KEY_ID,
  })
}

function challengeKeyContext(input: {
  requestId: string
  authRunId: string
  workspaceId: string
  userId: string
  keyId: string
  expiresAt: string
}): SecretContext {
  return {
    userId: input.userId,
    workspaceId: input.workspaceId,
    authRunId: input.authRunId,
    requestId: input.requestId,
    fieldKind: CHALLENGE_KEY_FIELD_KIND,
    keyId: input.keyId,
    expiresAt: input.expiresAt,
  }
}

export interface CreateSecureInputChallengeInput {
  authRunId: string
  workspaceId: string
  userId: string
  fields: SecureInputFieldSpec[]
}

export interface SecureInputChallenge {
  requestId: string
  publicKeyHex: string
  fields: SecureInputFieldSpec[]
  expiresAt: string
}

export async function createSecureInputChallenge(
  input: CreateSecureInputChallengeInput,
): Promise<SecureInputChallenge> {
  const provider = keyProvider()
  const requestId = `sir_${crypto.randomUUID()}`
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString()

  const keypair = generateChallengeKeypair()
  // The challenge secret key never rests in plaintext: envelope-encrypt it
  // with AAD binding request, run, workspace, user, and expiry.
  const sealedSecretKey = encryptSecretValue(
    keypair.secretKeyHex,
    challengeKeyContext({
      requestId,
      authRunId: input.authRunId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      keyId: provider.keyId,
      expiresAt,
    }),
    provider,
  )

  const admin = createAdminClient()
  const { error } = await rpc(admin, 'v3_create_secure_input_challenge', {
    p_request_id: requestId,
    p_auth_run_id: input.authRunId,
    p_workspace_id: input.workspaceId,
    p_user_id: input.userId,
    p_challenge_public_key_hex: keypair.publicKeyHex,
    p_challenge_secret_key_hex: JSON.stringify(sealedSecretKey),
    p_field_specs: input.fields,
    p_expires_at: expiresAt,
  })
  if (error) throw new Error('challenge_create_failed')

  await appendAuthEvent({
    authRunId: input.authRunId,
    workspaceId: input.workspaceId,
    type: 'auth.secure_input.requested',
    actorKind: '2hands',
    payload: {
      requestId,
      fieldIds: input.fields.map((f) => f.id),
      expiresAt,
    },
  })

  return { requestId, publicKeyHex: keypair.publicKeyHex, fields: input.fields, expiresAt }
}

export interface SubmitSecureInputInput {
  requestId: string
  workspaceId: string
  userId: string
  sealedValues: Array<{
    fieldId: string
    kind: SecureInputFieldKind
    sealed: SealedValue
    retain?: boolean
  }>
}

export interface SecureInputSubmissionResult {
  requestId: string
  supplied: Array<{ fieldId: string; secretRef: string; retained: boolean }>
  submittedAt: string
}

export async function submitSecureInput(input: SubmitSecureInputInput): Promise<SecureInputSubmissionResult> {
  const provider = keyProvider()
  const admin = createAdminClient()

  const { data: rows, error: loadError } = await rpc(admin, 'v3_load_secure_input_challenge', {
    p_request_id: input.requestId,
  })
  if (loadError) throw new Error('challenge_load_failed')
  const challenge = (Array.isArray(rows) ? rows[0] : rows) as SecureInputChallengeRow | undefined
  if (!challenge) throw new Error('challenge_not_found')
  if (challenge.workspace_id !== input.workspaceId || challenge.user_id !== input.userId) {
    throw new Error('challenge_scope_mismatch')
  }
  if (challenge.consumed_at) throw new Error('challenge_consumed')
  if (new Date(challenge.expires_at).getTime() <= Date.now()) throw new Error('challenge_expired')

  const specById = new Map(challenge.field_specs.map((spec) => [spec.id, spec]))
  for (const value of input.sealedValues) {
    const spec = specById.get(value.fieldId)
    if (!spec) throw new Error('unknown_field')
    if (spec.kind !== value.kind) throw new Error('field_kind_mismatch')
    if (value.retain && !spec.retainOption) throw new Error('retention_not_permitted')
  }

  // Burn the challenge before opening anything: replays and concurrent
  // submissions fail closed even if this request later errors.
  const { data: consumed, error: consumeError } = await rpc(admin, 'v3_consume_secure_input_challenge', {
    p_request_id: input.requestId,
  })
  if (consumeError) throw new Error('challenge_consume_failed')
  if (consumed !== true) throw new Error('challenge_consumed')

  let challengeSecretKeyHex = ''
  try {
    const storedKey = JSON.parse(challenge.challenge_secret_key_hex) as StoredCiphertext
    challengeSecretKeyHex = decryptSecretValue(
      storedKey,
      challengeKeyContext({
        requestId: challenge.request_id,
        authRunId: challenge.auth_run_id,
        workspaceId: challenge.workspace_id,
        userId: challenge.user_id,
        keyId: storedKey.keyId,
        expiresAt: new Date(challenge.expires_at).toISOString(),
      }),
      provider,
    )
  } catch {
    throw new Error('challenge_key_unsealable')
  }

  const supplied: Array<{ fieldId: string; secretRef: string; retained: boolean }> = []
  try {
    for (const value of input.sealedValues) {
      const retained = value.retain === true
      const secretRef = newSecretRef()
      const secretExpiresAt = new Date(
        Date.now() + (retained ? RETAINED_SECRET_TTL_MS : EPHEMERAL_SECRET_TTL_MS),
      ).toISOString()

      // Plaintext lives only in this local; overwritten right after the
      // envelope encryption below.
      let plaintext: string
      try {
        plaintext = openSealedValue(value.sealed, challengeSecretKeyHex)
      } catch {
        throw new Error('sealed_value_invalid')
      }

      const context: SecretContext = {
        userId: challenge.user_id,
        workspaceId: challenge.workspace_id,
        authRunId: challenge.auth_run_id,
        requestId: challenge.request_id,
        fieldKind: value.kind,
        keyId: provider.keyId,
        expiresAt: secretExpiresAt,
      }
      const stored = encryptSecretValue(plaintext, context, provider)
      plaintext = ''

      const { error: insertError } = await rpc(admin, 'v3_insert_protected_secret', {
        p_secret_ref: secretRef,
        p_workspace_id: challenge.workspace_id,
        p_user_id: challenge.user_id,
        p_auth_run_id: challenge.auth_run_id,
        p_request_id: challenge.request_id,
        p_field_kind: value.kind,
        p_retention: retained ? 'durable_user_opt_in' : 'ephemeral',
        p_key_id: stored.keyId,
        p_salt_hex: stored.saltHex,
        p_nonce_hex: stored.nonceHex,
        p_ciphertext_hex: stored.ciphertextHex,
        // AAD context is safe metadata; decryption recomputes it from here.
        p_aad_context: context,
        p_expires_at: secretExpiresAt,
      })
      if (insertError) throw new Error('secret_store_failed')

      supplied.push({ fieldId: value.fieldId, secretRef, retained })
    }
  } finally {
    challengeSecretKeyHex = ''
  }
  void challengeSecretKeyHex

  const submittedAt = new Date().toISOString()
  const suppliedFieldIds = supplied.map((s) => s.fieldId)

  // Event carries field IDs and state only. Use the state-machine RPC when
  // the run is waiting on this input; otherwise append directly with the next
  // sequence (same pattern as v3_transition_auth_run).
  //
  // Browser-session logins are the exception: the supplied secrets are inputs
  // to the deterministic browser flow, so the run STAYS in
  // awaiting_secure_input until the execute-browser-login route drives it to
  // browser_running (validating_session -> browser_running is illegal).
  const run = await getAuthRun(challenge.auth_run_id, challenge.workspace_id)
  if (run && run.status === 'awaiting_secure_input' && run.selected_mode === 'user_browser_session') {
    await appendAuthEvent({
      authRunId: challenge.auth_run_id,
      workspaceId: challenge.workspace_id,
      type: 'auth.secure_input.supplied',
      actorKind: 'user',
      payload: { requestId: challenge.request_id, suppliedFieldIds },
    })
  } else if (run && run.status === 'awaiting_secure_input') {
    await transitionAuthRun({
      authRunId: challenge.auth_run_id,
      expectedStatus: 'awaiting_secure_input',
      newStatus: 'validating_session',
      actorKind: 'user',
      eventType: 'auth.secure_input.supplied',
      payload: { requestId: challenge.request_id, suppliedFieldIds },
    })
  } else {
    await appendAuthEvent({
      authRunId: challenge.auth_run_id,
      workspaceId: challenge.workspace_id,
      type: 'auth.secure_input.supplied',
      actorKind: 'user',
      payload: { requestId: challenge.request_id, suppliedFieldIds },
    })
  }

  return { requestId: challenge.request_id, supplied, submittedAt }
}
