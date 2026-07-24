#!/usr/bin/env npx tsx
// v3 Slice 3 — secret-canary integration test against LOCAL Supabase.
//
// Drives the SERVER-SIDE secure-input flow programmatically (no browser, no
// HTTP): challenge → seal a unique canary password → submit → verify. Then
// asserts the canary value (in any obvious encoding, via the secret-broker
// scanner) appears in ZERO rows of every model/log-adjacent table, that the
// stored envelope does not contain it in plaintext form, and that the trusted
// injector path (v3_consume_secret_lease + decryptSecretValue) can recover it
// exactly once.
//
// Requires a running local stack (`supabase start`). Skips politely otherwise.
// Never points at production: refuses non-local URLs.

import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'

const url = process.env.TEST_SUPABASE_URL || 'http://127.0.0.1:54321'
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const anonKey = process.env.TEST_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error('Refusing to run integration tests against a non-local Supabase URL:', url)
  process.exit(1)
}

// The secure-input service reads these lazily at call time; set them
// in-process so the test is self-contained when run without a wrapper.
process.env.NEXT_PUBLIC_SUPABASE_URL = url
process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey
process.env.SECRET_BROKER_MASTER_KEY = process.env.SECRET_BROKER_MASTER_KEY || 'a'.repeat(64)
process.env.SECRET_BROKER_KEY_ID = process.env.SECRET_BROKER_KEY_ID || 'test-key'
process.env.SECRET_LEASE_SIGNING_KEY = process.env.SECRET_LEASE_SIGNING_KEY || 'b'.repeat(64)

import {
  decryptSecretValue,
  envKeyProvider,
  newLeaseId,
  newLeaseNonce,
  scanForSecrets,
  scanObjectForSecrets,
  sealSecretValue,
  signLease,
  validateLease,
  type StoredCiphertext,
  type UnsignedLease,
} from '@2hands/secret-broker'
import type { SecretReference } from '@2hands/types/v3'
import { createSecureInputChallenge, submitSecureInput } from '../../src/lib/v3/secure-input'
import { getAuthRun, setAuthRunSelectedMode, transitionAuthRun } from '../../src/lib/v3/auth-runs'

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

/** Tables the model/log pipeline can read; the canary must never appear here. */
const SCANNED_TABLES = [
  'messages',
  'conversations',
  'task_events',
  'auth_events',
  'action_receipts',
  'verification_events',
  'artifacts',
  'provider_accounts',
  'approvals',
] as const

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = (name: string) => (admin as any).from(name)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminRpc = (name: string, args: Record<string, unknown>) => (admin as any).rpc(name, args)

  // ---- fixtures: one user, one workspace ----------------------------------
  const stamp = Date.now()
  const email = `v3-canary-${stamp}@example.test`
  const password = `pw-${randomUUID()}`

  const { data: user, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (userErr || !user?.user) {
    console.error('Failed to create test user', userErr)
    process.exit(1)
  }
  const userId = user.user.id

  const ws = { id: randomUUID(), name: 'v3-canary', slug: `v3-canary-${stamp}`, owner_id: userId }
  {
    const { error } = await t('workspaces').insert(ws)
    if (error) {
      console.error('workspace insert failed:', error.message)
      process.exit(1)
    }
  }
  {
    const { error } = await t('workspace_members').insert({
      workspace_id: ws.id,
      user_id: userId,
      role: 'owner',
    })
    if (error) {
      console.error('membership insert failed:', error.message)
      process.exit(1)
    }
  }

  console.log('\n=== 1. Auth run reaches awaiting_secure_input (browser-session mode) ===')

  const { data: runRow, error: runErr } = await t('auth_runs')
    .insert({
      workspace_id: ws.id,
      user_id: userId,
      provider_id: 'demo-account-provider',
      capability: 'demo.access',
      status: 'created',
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    })
    .select('*')
    .single()
  assert(!runErr && runRow?.status === 'created', 'auth run created')
  const authRunId = runRow.id as string

  await transitionAuthRun({
    authRunId,
    expectedStatus: 'created',
    newStatus: 'selecting_method',
    actorKind: '2hands',
  })
  await setAuthRunSelectedMode({ authRunId, workspaceId: ws.id, mode: 'user_browser_session' })
  await transitionAuthRun({
    authRunId,
    expectedStatus: 'selecting_method',
    newStatus: 'awaiting_secure_input',
    actorKind: '2hands',
  })
  {
    const run = await getAuthRun(authRunId, ws.id)
    assert(run?.status === 'awaiting_secure_input', 'run is awaiting_secure_input')
    assert(run?.selected_mode === 'user_browser_session', 'selected mode is user_browser_session')
  }

  console.log('\n=== 2. Secure input: challenge → seal canary → submit ===')

  const challenge = await createSecureInputChallenge({
    authRunId,
    workspaceId: ws.id,
    userId,
    fields: [
      { id: 'email', kind: 'email', label: 'Email', autocomplete: 'username' },
      { id: 'password', kind: 'password', label: 'Password', autocomplete: 'current-password', retainOption: true },
    ],
  })
  assert(/^sir_/.test(challenge.requestId), 'challenge issues a sir_ request id')
  assert(/^[0-9a-f]{64}$/.test(challenge.publicKeyHex), 'challenge public key is 32-byte hex')
  assert(challenge.fields.length === 2, 'challenge echoes the field specs')

  // Unique canary values — never reused, never a fixture value.
  const canary = `canary-${stamp}-${randomBytes(9).toString('hex')}`
  const canaryEmail = `canary-${stamp}@canary-${randomBytes(6).toString('hex')}.test`
  const secrets = [canary, canaryEmail]

  const submission = await submitSecureInput({
    requestId: challenge.requestId,
    workspaceId: ws.id,
    userId,
    sealedValues: [
      { fieldId: 'email', kind: 'email', sealed: sealSecretValue(canaryEmail, challenge.publicKeyHex) },
      { fieldId: 'password', kind: 'password', sealed: sealSecretValue(canary, challenge.publicKeyHex) },
    ],
  })
  assert(submission.supplied.length === 2, 'submission stored two protected values')
  assert(
    submission.supplied.every((s) => /^sec_[0-9a-f]{32}$/.test(s.secretRef)),
    'secret refs are opaque sec_ handles'
  )
  assert(
    submission.supplied.every((s) => s.retained === false),
    'no retention without explicit opt-in'
  )
  const passwordRef = submission.supplied.find((s) => s.fieldId === 'password')?.secretRef ?? ''

  {
    // Replay of the burned challenge fails closed.
    let code = ''
    try {
      await submitSecureInput({
        requestId: challenge.requestId,
        workspaceId: ws.id,
        userId,
        sealedValues: [
          { fieldId: 'password', kind: 'password', sealed: sealSecretValue(canary, challenge.publicKeyHex) },
        ],
      })
    } catch (error) {
      code = error instanceof Error ? error.message : ''
    }
    assert(code === 'challenge_consumed', 'challenge replay rejected (single use)')
  }
  {
    // Browser-session logins stay awaiting_secure_input for the login flow.
    const run = await getAuthRun(authRunId, ws.id)
    assert(run?.status === 'awaiting_secure_input', 'run stays awaiting_secure_input for the browser flow')
  }

  console.log('\n=== 3. Canary appears in ZERO scannable rows ===')

  for (const tableName of SCANNED_TABLES) {
    const { data, error } = await t(tableName).select('*')
    if (error) {
      failed++
      console.log(`  ✗ ${tableName}: select failed (${error.message})`)
      continue
    }
    const hits = scanObjectForSecrets(data ?? [], secrets)
    assert(hits.length === 0, `${tableName}: ${data?.length ?? 0} rows scanned, zero canary hits`)
    if (hits.length > 0) {
      // Paths only — never the value.
      console.log(`    leak paths: ${hits.map((h) => `${h.path} (${h.encoding})`).join(', ')}`)
    }
  }

  console.log('\n=== 4. Stored envelopes: ciphertext only, no plaintext canary ===')

  {
    // The private schema must not be reachable through PostgREST at all.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any).schema('private').from('protected_secrets').select('*')
    assert(Boolean(error) && !data, 'private.protected_secrets is not exposed through PostgREST (even service role)')
  }
  const { data: refRows, error: refErr } = await adminRpc('v3_list_auth_run_secret_refs', {
    p_auth_run_id: authRunId,
  })
  assert(!refErr && (refRows ?? []).length === 2, 'run has exactly two live protected secrets')
  assert(
    (refRows ?? []).every(
      (r: { secret_ref: string; field_kind: string }) => scanForSecrets(`${r.secret_ref} ${r.field_kind}`, secrets).length === 0
    ),
    'secret refs carry no canary material'
  )
  const envelopes: Array<Record<string, unknown>> = []
  for (const ref of (refRows ?? []) as Array<{ secret_ref: string }>) {
    const { data, error } = await adminRpc('v3_load_protected_secret', { p_secret_ref: ref.secret_ref })
    const row = Array.isArray(data) ? data[0] : data
    if (error || !row) {
      failed++
      console.log(`  ✗ envelope load failed for a secret ref`)
      continue
    }
    envelopes.push(row as Record<string, unknown>)
  }
  {
    const hits = scanObjectForSecrets(envelopes, secrets)
    assert(hits.length === 0, 'envelope rows (ciphertext, salt, nonce, AAD) contain no canary in any encoding')
  }

  console.log('\n=== 5. Injector path: lease-gated decrypt is exactly-once ===')

  const signingKeyHex = process.env.SECRET_LEASE_SIGNING_KEY as string
  const browserSessionId = randomUUID()
  const unsigned: UnsignedLease = {
    id: newLeaseId(),
    secretRef: passwordRef as SecretReference,
    workspaceId: ws.id,
    userId,
    taskId: '',
    authRunId,
    providerId: 'demo-account-provider',
    browserSessionId,
    allowedOrigins: ['http://localhost:3000'],
    fieldSemantic: 'password',
    purpose: 'login',
    maximumUses: 1,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    nonce: newLeaseNonce(),
  }
  const lease = signLease(unsigned, signingKeyHex)
  {
    const validation = validateLease({
      lease,
      signingKeyHex,
      currentOrigin: 'http://localhost:3000',
      fieldSemantic: 'password',
      browserSessionId,
      providerId: 'demo-account-provider',
    })
    assert(validation.valid, 'signed lease validates for the exact origin/field/session/provider')
  }
  {
    const { error } = await adminRpc('v3_insert_secret_lease', {
      p_lease_id: lease.id,
      p_secret_ref: lease.secretRef,
      p_workspace_id: lease.workspaceId,
      p_user_id: lease.userId,
      p_task_id: null,
      p_auth_run_id: lease.authRunId,
      p_provider_id: lease.providerId,
      p_browser_session_id: browserSessionId,
      p_allowed_origins: lease.allowedOrigins,
      p_field_semantic: lease.fieldSemantic,
      p_purpose: lease.purpose,
      p_nonce: lease.nonce,
      p_signature: lease.signature,
      p_expires_at: lease.expiresAt,
    })
    assert(!error, 'lease row persisted')
  }
  {
    const { data: first } = await adminRpc('v3_consume_secret_lease', { p_lease_id: lease.id })
    assert(first === true, 'first lease consumption succeeds')

    const { data: envRows } = await adminRpc('v3_load_protected_secret', { p_secret_ref: passwordRef })
    const row = (Array.isArray(envRows) ? envRows[0] : envRows) as {
      key_id: string
      salt_hex: string
      nonce_hex: string
      ciphertext_hex: string
      aad_context: Record<string, string>
    }
    const stored: StoredCiphertext = {
      keyId: row.key_id,
      saltHex: row.salt_hex,
      nonceHex: row.nonce_hex,
      ciphertextHex: row.ciphertext_hex,
    }
    const provider = envKeyProvider({
      SECRET_BROKER_MASTER_KEY: process.env.SECRET_BROKER_MASTER_KEY,
      SECRET_BROKER_KEY_ID: process.env.SECRET_BROKER_KEY_ID,
    })
    const decrypted = decryptSecretValue(
      stored,
      row.aad_context as unknown as Parameters<typeof decryptSecretValue>[1],
      provider
    )
    assert(decrypted === canary, 'injector decrypt returns the exact canary value')

    const { data: second } = await adminRpc('v3_consume_secret_lease', { p_lease_id: lease.id })
    assert(second === false, 'second lease consumption returns false (single use)')
  }

  console.log('\n=== 6. Auth events: field IDs and state only ===')

  {
    const { data: events } = await t('auth_events')
      .select('type,sequence,payload')
      .eq('auth_run_id', authRunId)
      .order('sequence')
    const rows = (events ?? []) as Array<{ type: string; payload: Record<string, unknown> }>
    const supplied = rows.find((r) => r.type === 'auth.secure_input.supplied')
    assert(Boolean(supplied), 'auth.secure_input.supplied event exists')
    const suppliedIds = (supplied?.payload?.suppliedFieldIds ?? []) as string[]
    assert(
      Array.isArray(suppliedIds) && [...suppliedIds].sort().join(',') === 'email,password',
      'supplied event carries exactly the field IDs'
    )
    const forbiddenKey = /value|length|hash|secret|cipher|plain/i
    const keysOf = (value: unknown, acc: string[] = []): string[] => {
      if (Array.isArray(value)) value.forEach((v) => keysOf(v, acc))
      else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
          acc.push(k)
          keysOf(v, acc)
        }
      }
      return acc
    }
    assert(
      rows.every((r) => keysOf(r.payload).every((k) => !forbiddenKey.test(k))),
      'no auth event payload key names a value/length/hash'
    )
    const requested = rows.find((r) => r.type === 'auth.secure_input.requested')
    assert(Boolean(requested), 'auth.secure_input.requested event exists')
    assert(scanObjectForSecrets(rows, secrets).length === 0, 'auth events for the run contain no canary')
  }

  // ---- cleanup -------------------------------------------------------------
  // Destroy the run's ephemeral envelopes (rows in private.* have no FK to
  // workspaces; the ciphertext purge is the meaningful cleanup — the metadata
  // rows expire on their own TTL).
  await adminRpc('v3_destroy_auth_run_secrets', { p_auth_run_id: authRunId })
  await t('workspaces').delete().eq('id', ws.id)
  await admin.auth.admin.deleteUser(userId)

  console.log('\n───────────────────────────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error('Integration test crashed:', error)
  process.exit(1)
})
