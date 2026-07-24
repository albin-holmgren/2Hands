/**
 * v3 Auth Orchestrator — deterministic browser-login flow for the Demo
 * Account Provider (control-plane side of Slice 3).
 *
 * Connects auth runs → LocalPlaywrightBrowserProvider → signed one-time
 * secret leases → the demo provider pages. The whole flow is deterministic:
 * page classification is a frozen path lookup (demo adapter), field targets
 * resolve by reviewed `data-semantic` attributes, and secrets travel only as
 * opaque refs until the trusted injector decrypts them immediately before a
 * lease-validated single-field fill.
 *
 * HARD RULES for this file:
 * - No plaintext secret is ever logged, thrown, stored, or placed in an
 *   event/receipt payload. Plaintext exists only inside the injectSecret
 *   plaintextProvider callback and is dropped after the fill.
 * - Every failure path transitions the run to `failed` with a safe machine
 *   code only, stops the browser session, and destroys the run's ephemeral
 *   secrets.
 * - Auth events carry field IDs and state only.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { validateProviderManifest, type ProviderAuthManifest } from '@2hands/account-broker'
import {
  DEMO_PROVIDER_ID,
  LocalPlaywrightBrowserProvider,
  demoDecideNextStep,
  demoPageKindFromPathname,
  type BrowserSessionHandle,
  type PageKind,
  type SafeObservation,
} from '@2hands/browser'
import {
  decryptSecretValue,
  encryptSecretValue,
  envKeyProvider,
  newLeaseId,
  newLeaseNonce,
  signLease,
  type KeyProvider,
  type SecretContext,
  type SecretInjectionLease,
  type StoredCiphertext,
  type UnsignedLease,
} from '@2hands/secret-broker'
import type { AuthRunStatus, SecretReference } from '@2hands/types/v3'
import {
  appendAuthEvent,
  getLatestProviderManifest,
  transitionAuthRun,
  type V3AuthRunRow,
} from './auth-runs'
import { createReceipt } from './approvals'

// New v3 tables are not yet in the generated database types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (sb: ReturnType<typeof createAdminClient>, name: string) => (sb as any).from(name)
const rpc = (sb: ReturnType<typeof createAdminClient>, name: string, args: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb as any).rpc(name, args)

/** The demo provider pages live under this base path on the web app origin. */
const DEMO_BASE_PATH = '/demo-provider'
const LEASE_TTL_MS = 60 * 1000
const BROWSER_CONTEXT_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** Marker fieldKind binding the envelope of an encrypted browser context. */
const BROWSER_CONTEXT_FIELD_KIND = 'browser_context'

/** The two semantic fields the demo password login injects, in fill order. */
const DEMO_LOGIN_FIELDS = ['email', 'password'] as const
type DemoLoginField = (typeof DEMO_LOGIN_FIELDS)[number]

/** Failure with a safe machine code — never carries page or secret data. */
class SafeLoginError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'SafeLoginError'
  }
}

interface ProtectedSecretRow {
  secret_ref: string
  workspace_id: string
  user_id: string
  auth_run_id: string | null
  request_id: string
  field_kind: string
  retention: string
  key_id: string
  salt_hex: string
  nonce_hex: string
  ciphertext_hex: string
  aad_context: SecretContext
  expires_at: string
}

export interface PerformDemoBrowserLoginInput {
  authRunId: string
}

export interface PerformDemoBrowserLoginResult {
  authRunId: string
  status: AuthRunStatus
  providerAccountId?: string
  receiptId?: string
  safeErrorCode?: string
}

/**
 * Classify a demo-site URL deterministically. The frozen demo adapter maps
 * root-relative paths (/login/password, /account, ...); the pages are served
 * under /demo-provider on the web app origin, so the base path is stripped
 * before the pure lookup. Anything else is `unknown` — never a guess.
 */
export function classifyDemoPage(url: string): PageKind {
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    return 'unknown'
  }
  if (!pathname.startsWith(`${DEMO_BASE_PATH}/`)) return 'unknown'
  return demoPageKindFromPathname(pathname.slice(DEMO_BASE_PATH.length))
}

/** Re-key an observation with the demo classification (base path stripped). */
function classifyObservation(observation: SafeObservation): SafeObservation {
  return { ...observation, pageKind: classifyDemoPage(observation.url) }
}

/** Fixed-width email mask for account labels: never reveals local-part length. */
function maskEmailLabel(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) return '***'
  return `${email.slice(0, 1)}***@${email.slice(at + 1)}`
}

function keyProvider(): KeyProvider {
  return envKeyProvider({
    SECRET_BROKER_MASTER_KEY: process.env.SECRET_BROKER_MASTER_KEY,
    SECRET_BROKER_KEY_ID: process.env.SECRET_BROKER_KEY_ID,
  })
}

function leaseSigningKeyHex(): string {
  const hex = process.env.SECRET_LEASE_SIGNING_KEY?.trim()
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new SafeLoginError('lease_signing_unconfigured')
  }
  return hex
}

async function loadAuthRunById(
  admin: ReturnType<typeof createAdminClient>,
  authRunId: string,
): Promise<V3AuthRunRow | null> {
  const { data, error } = await table(admin, 'auth_runs').select('*').eq('id', authRunId).maybeSingle()
  if (error) throw new Error(`loadAuthRunById failed: ${error.message}`)
  return (data as V3AuthRunRow) ?? null
}

/** Transition a run to failed with a safe code; no-op if already terminal. */
async function failAuthRun(
  admin: ReturnType<typeof createAdminClient>,
  authRunId: string,
  code: string,
): Promise<void> {
  try {
    const run = await loadAuthRunById(admin, authRunId)
    if (!run) return
    if (['completed', 'failed', 'cancelled', 'expired'].includes(run.status)) return
    await transitionAuthRun({
      authRunId,
      expectedStatus: run.status,
      newStatus: 'failed',
      actorKind: '2hands',
      eventType: 'auth.failed',
      payload: { safeError: { code, message: 'Browser login failed', retryable: false } },
    })
  } catch {
    // Fail-path bookkeeping must never mask the original safe error.
  }
}

/**
 * Deterministic demo browser login. Preconditions (enforced by the
 * execute-browser-login route): the run is `browser_running`, belongs to the
 * demo provider, and its secure input (email + password) was already supplied
 * into private.protected_secrets.
 *
 * On success: run → validating_session → completed, a provider_accounts row
 * (mode user_browser_session) with an encrypted browser context, an
 * account.connected receipt. On any failure: run → failed with a safe code.
 * Either way the browser session is stopped and the run's ephemeral secrets
 * are destroyed.
 */
export async function performDemoBrowserLogin(
  input: PerformDemoBrowserLoginInput,
): Promise<PerformDemoBrowserLoginResult> {
  const admin = createAdminClient()

  const run = await loadAuthRunById(admin, input.authRunId)
  if (!run) throw new Error('Auth run not found')
  if (run.status !== 'browser_running') {
    throw new Error(`stale transition: auth run is ${run.status}, expected browser_running`)
  }

  let provider: LocalPlaywrightBrowserProvider | null = null
  let handle: BrowserSessionHandle | null = null
  let sessionRowId: string | null = null
  let outcome: 'completed' | 'failed' = 'failed'

  try {
    if (run.provider_id !== DEMO_PROVIDER_ID) throw new SafeLoginError('provider_not_supported')
    if (new Date(run.expires_at).getTime() <= Date.now()) throw new SafeLoginError('auth_run_expired')

    const manifest = await loadDemoManifest(run.provider_id)
    const allowedOrigins = manifest.browser?.allowedOrigins ?? []
    if (allowedOrigins.length === 0) throw new SafeLoginError('manifest_missing_browser_policy')

    // Envelope + lease keys fail loudly before any browser work.
    let secretsProvider: KeyProvider
    try {
      secretsProvider = keyProvider()
    } catch (error) {
      if (error instanceof SafeLoginError) throw error
      throw new SafeLoginError('secret_broker_unconfigured')
    }
    const signingKeyHex = leaseSigningKeyHex()

    // The supplied secure-input secrets, as opaque refs keyed by field kind.
    const secretRefByField = await loadLoginSecretRefs(admin, run.id)

    // Durable browser_sessions row; leases and the auth run bind to its id.
    sessionRowId = await insertBrowserSessionRow(admin, run)

    provider = new LocalPlaywrightBrowserProvider({ leaseSigningKeyHex: signingKeyHex })
    handle = await provider.createSession({
      workspaceId: run.workspace_id,
      userId: run.user_id,
      authRunId: run.id,
      providerId: run.provider_id,
      allowedOrigins,
    })

    // Navigate to the password login page and verify it deterministically.
    const loginUrl = `${new URL(allowedOrigins[0]).origin}${DEMO_BASE_PATH}/login/password`
    const observation = classifyObservation(await provider.navigate(handle, loginUrl))
    if (observation.pageKind !== 'login_password') throw new SafeLoginError('unexpected_page')
    if (demoDecideNextStep(observation) !== 'inject_and_submit') {
      throw new SafeLoginError('page_fields_mismatch')
    }

    // Inject email + password under signed one-time leases. The masked email
    // label is the only value-derived datum that leaves the injector scope,
    // and only in masked form (first character + domain).
    let accountLabel: string | null = null
    for (const fieldSemantic of DEMO_LOGIN_FIELDS) {
      const secretRef = secretRefByField[fieldSemantic]
      const lease = await mintAndPersistLease(admin, {
        run,
        browserSessionRowId: sessionRowId,
        browserSessionHandleId: handle.id,
        allowedOrigins,
        fieldSemantic,
        secretRef,
        signingKeyHex,
      })

      const receipt = await provider.injectSecret(handle, lease, async (leaseId) => {
        // (a) Atomically consume the single-use lease; a second call, an
        // expired lease, or an unknown id returns false → abort.
        const { data: consumed, error: consumeError } = await rpc(admin, 'v3_consume_secret_lease', {
          p_lease_id: leaseId,
        })
        if (consumeError || consumed !== true) throw new Error('lease_consume_failed')

        // (b) Load the envelope and decrypt inside this callback only.
        const plaintext = await decryptProtectedSecret(admin, secretRef, secretsProvider)
        if (fieldSemantic === 'email') accountLabel = maskEmailLabel(plaintext)
        return plaintext
      })
      if (!receipt.success) {
        throw new SafeLoginError(receipt.safeErrorCode ?? 'injection_failed')
      }
    }

    // Submit and verify the deterministic success page (/account).
    const submitted = await provider.actSemantically(handle, { kind: 'submit' })
    if (!submitted.success || !submitted.observation) {
      throw new SafeLoginError(submitted.safeErrorCode ?? 'submit_failed')
    }
    const postSubmit = classifyObservation(submitted.observation)
    if (postSubmit.pageKind !== 'account') throw new SafeLoginError('login_not_validated')

    await transitionAuthRun({
      authRunId: run.id,
      expectedStatus: 'browser_running',
      newStatus: 'validating_session',
      actorKind: '2hands',
    })

    // Persist the validated session: encrypt the storage state into
    // private.browser_contexts under an opaque bctx_ ref.
    const saved = await provider.saveContext(handle)
    const contextRef = await storeEncryptedBrowserContext(admin, run, saved, secretsProvider)
    saved.storageStateJson = ''
    await appendAuthEvent({
      authRunId: run.id,
      workspaceId: run.workspace_id,
      type: 'auth.session.saved',
      actorKind: '2hands',
      payload: { contextRef, browserSessionId: sessionRowId },
    })

    const providerAccountId = await createConnectedProviderAccount(admin, run, {
      externalAccountLabel: accountLabel,
      browserContextRef: contextRef,
    })

    await transitionAuthRun({
      authRunId: run.id,
      expectedStatus: 'validating_session',
      newStatus: 'completed',
      actorKind: '2hands',
      eventType: 'auth.completed',
      payload: { providerAccountId },
    })
    await appendAuthEvent({
      authRunId: run.id,
      workspaceId: run.workspace_id,
      type: 'provider_account.connected',
      actorKind: '2hands',
      payload: { providerAccountId, providerId: run.provider_id, mode: 'user_browser_session' },
    })

    const receipt = await createReceipt({
      workspaceId: run.workspace_id,
      taskId: run.task_id ?? undefined,
      kind: 'account.connected',
      title: 'Connected Demo Account Provider',
      summary: 'Signed in with a protected browser session and saved an encrypted session context.',
      evidence: [{ kind: 'auth_run', ref: run.id }],
      provider: run.provider_id,
      outcome: 'success',
    })

    outcome = 'completed'
    return { authRunId: run.id, status: 'completed', providerAccountId, receiptId: receipt.id }
  } catch (error) {
    const code = error instanceof SafeLoginError ? error.code : 'browser_login_failed'
    await failAuthRun(admin, run.id, code)
    return { authRunId: run.id, status: 'failed', safeErrorCode: code }
  } finally {
    // Terminal either way: destroy the run's ephemeral secrets, stop the
    // browser, and close out the session row. Nothing here can throw out.
    try {
      await rpc(admin, 'v3_destroy_auth_run_secrets', { p_auth_run_id: run.id })
    } catch {
      // Ephemeral secrets still expire on their own TTL.
    }
    if (provider && handle) await provider.stopSession(handle).catch(() => {})
    if (provider) await provider.dispose().catch(() => {})
    if (sessionRowId) {
      try {
        await table(admin, 'browser_sessions')
          .update({
            status: outcome === 'completed' ? 'stopped' : 'failed',
            stopped_at: new Date().toISOString(),
          })
          .eq('id', sessionRowId)
      } catch {
        // Session-row bookkeeping is best-effort.
      }
    }
  }
}

async function loadDemoManifest(providerId: string): Promise<ProviderAuthManifest> {
  const row = await getLatestProviderManifest(providerId)
  if (!row || row.status !== 'enabled') throw new SafeLoginError('provider_not_enabled')
  const validation = validateProviderManifest(row.manifest)
  if (!validation.valid) throw new SafeLoginError('manifest_invalid')
  return validation.manifest
}

async function loadLoginSecretRefs(
  admin: ReturnType<typeof createAdminClient>,
  authRunId: string,
): Promise<Record<DemoLoginField, string>> {
  const { data, error } = await rpc(admin, 'v3_list_auth_run_secret_refs', { p_auth_run_id: authRunId })
  if (error) throw new SafeLoginError('secret_lookup_failed')
  const rows = (data ?? []) as Array<{ secret_ref: string; field_kind: string }>
  const refs: Partial<Record<DemoLoginField, string>> = {}
  for (const field of DEMO_LOGIN_FIELDS) {
    // Latest supplied value wins if the user re-submitted secure input.
    const match = [...rows].reverse().find((row) => row.field_kind === field)
    if (!match) throw new SafeLoginError('missing_secure_input')
    refs[field] = match.secret_ref
  }
  return refs as Record<DemoLoginField, string>
}

async function insertBrowserSessionRow(
  admin: ReturnType<typeof createAdminClient>,
  run: V3AuthRunRow,
): Promise<string> {
  const { data, error } = await table(admin, 'browser_sessions')
    .insert({
      workspace_id: run.workspace_id,
      user_id: run.user_id,
      auth_run_id: run.id,
      provider_id: run.provider_id,
      browser_provider: 'local-playwright',
      purpose: 'authentication',
      status: 'running',
    })
    .select('id')
    .single()
  if (error) throw new SafeLoginError('browser_session_create_failed')
  const sessionRowId = (data as { id: string }).id

  const { error: linkError } = await table(admin, 'auth_runs')
    .update({ browser_session_id: sessionRowId })
    .eq('id', run.id)
  if (linkError) throw new SafeLoginError('browser_session_link_failed')
  return sessionRowId
}

async function mintAndPersistLease(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    run: V3AuthRunRow
    browserSessionRowId: string
    browserSessionHandleId: string
    allowedOrigins: string[]
    fieldSemantic: DemoLoginField
    secretRef: string
    signingKeyHex: string
  },
): Promise<SecretInjectionLease> {
  const unsigned: UnsignedLease = {
    id: newLeaseId(),
    secretRef: input.secretRef as SecretReference,
    workspaceId: input.run.workspace_id,
    userId: input.run.user_id,
    taskId: input.run.task_id ?? '',
    authRunId: input.run.id,
    providerId: input.run.provider_id,
    // The lease binds to the provider's in-process session handle — that is
    // what injectSecret validates against the live page.
    browserSessionId: input.browserSessionHandleId,
    allowedOrigins: input.allowedOrigins,
    fieldSemantic: input.fieldSemantic,
    purpose: 'login',
    maximumUses: 1,
    expiresAt: new Date(Date.now() + LEASE_TTL_MS).toISOString(),
    nonce: newLeaseNonce(),
  }
  const lease = signLease(unsigned, input.signingKeyHex)

  const { error } = await rpc(admin, 'v3_insert_secret_lease', {
    p_lease_id: lease.id,
    p_secret_ref: lease.secretRef,
    p_workspace_id: lease.workspaceId,
    p_user_id: lease.userId,
    p_task_id: input.run.task_id,
    p_auth_run_id: lease.authRunId,
    p_provider_id: lease.providerId,
    // The durable row references the browser_sessions UUID for audit joins.
    p_browser_session_id: input.browserSessionRowId,
    p_allowed_origins: lease.allowedOrigins,
    p_field_semantic: lease.fieldSemantic,
    p_purpose: lease.purpose,
    p_nonce: lease.nonce,
    p_signature: lease.signature,
    p_expires_at: lease.expiresAt,
  })
  if (error) throw new SafeLoginError('lease_store_failed')
  return lease
}

/**
 * Trusted-injector decrypt: load the envelope by opaque ref and open it with
 * the AAD context stored beside it. Only ever called from inside the
 * injectSecret plaintextProvider, after the lease was consumed.
 */
async function decryptProtectedSecret(
  admin: ReturnType<typeof createAdminClient>,
  secretRef: string,
  provider: KeyProvider,
): Promise<string> {
  const { data, error } = await rpc(admin, 'v3_load_protected_secret', { p_secret_ref: secretRef })
  if (error) throw new Error('secret_load_failed')
  const row = (Array.isArray(data) ? data[0] : data) as ProtectedSecretRow | undefined
  if (!row) throw new Error('secret_unavailable')
  const stored: StoredCiphertext = {
    keyId: row.key_id,
    saltHex: row.salt_hex,
    nonceHex: row.nonce_hex,
    ciphertextHex: row.ciphertext_hex,
  }
  try {
    return decryptSecretValue(stored, row.aad_context, provider)
  } catch {
    // AAD/context mismatch or key rotation — never surface crypto errors.
    throw new Error('secret_unsealable')
  }
}

async function storeEncryptedBrowserContext(
  admin: ReturnType<typeof createAdminClient>,
  run: V3AuthRunRow,
  saved: { contextRef: string; storageStateJson: string },
  provider: KeyProvider,
): Promise<string> {
  const expiresAt = new Date(Date.now() + BROWSER_CONTEXT_TTL_MS).toISOString()
  const context: SecretContext = {
    userId: run.user_id,
    workspaceId: run.workspace_id,
    authRunId: run.id,
    requestId: saved.contextRef,
    fieldKind: BROWSER_CONTEXT_FIELD_KIND,
    keyId: provider.keyId,
    expiresAt,
  }
  const stored = encryptSecretValue(saved.storageStateJson, context, provider)

  const { error } = await rpc(admin, 'v3_store_browser_context', {
    p_context_ref: saved.contextRef,
    p_workspace_id: run.workspace_id,
    p_user_id: run.user_id,
    p_provider_id: run.provider_id,
    p_key_id: stored.keyId,
    p_salt_hex: stored.saltHex,
    p_nonce_hex: stored.nonceHex,
    p_ciphertext_hex: stored.ciphertextHex,
    // AAD context is safe metadata; decryption recomputes it from here.
    p_aad_context: context,
  })
  if (error) throw new SafeLoginError('browser_context_store_failed')
  return saved.contextRef
}

async function createConnectedProviderAccount(
  admin: ReturnType<typeof createAdminClient>,
  run: V3AuthRunRow,
  input: { externalAccountLabel: string | null; browserContextRef: string },
): Promise<string> {
  const { data, error } = await table(admin, 'provider_accounts')
    .insert({
      workspace_id: run.workspace_id,
      user_id: run.user_id,
      provider_id: run.provider_id,
      external_account_label: input.externalAccountLabel,
      account_owner: 'user',
      billing_owner: 'user',
      mode: 'user_browser_session',
      status: 'connected',
      granted_capabilities: [run.capability],
      browser_context_ref: input.browserContextRef,
      last_verified_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error) throw new SafeLoginError('provider_account_create_failed')
  const providerAccountId = (data as { id: string }).id

  const { error: linkError } = await table(admin, 'auth_runs')
    .update({ provider_account_id: providerAccountId })
    .eq('id', run.id)
  if (linkError) throw new SafeLoginError('provider_account_link_failed')
  return providerAccountId
}
