/**
 * Provider-neutral BrowserProvider contract (CODEX_ONE_SHOT §8,
 * ACCOUNT_BROKER §15, AUTH_SECRETS §10).
 *
 * Every implementation must uphold the authentication browser policy:
 * - recording disabled (no video, no HAR, no screenshots of auth pages);
 * - navigation locked to an exact-origin allowlist;
 * - protected fields surface only as empty semantic descriptors — the model
 *   never sees raw DOM, input values, or secret-derived data;
 * - secrets enter the page only through `injectSecret` with a signed
 *   one-time lease validated immediately before fill.
 */
import type { InjectionReceipt } from '@2hands/types/v3'
import type { SecretInjectionLease } from '@2hands/secret-broker'

/**
 * Deterministic page classification. Detected from the provider adapter's
 * known URL paths + `data-semantic` field attributes — never by an LLM.
 */
export type PageKind =
  | 'login_password'
  | 'login_otp'
  | 'login_magic_link'
  | 'login_mfa'
  | 'signup'
  | 'terms'
  | 'checkout'
  | 'account'
  | 'logout'
  | 'unknown'

/** Semantic field kinds that may be observed on a page (descriptors only). */
export type ObservedSemantic = 'username' | 'email' | 'password' | 'otp'

/**
 * The only page representation that may leave the browser boundary.
 * Protected fields appear ONLY as empty semantic descriptors — never values,
 * lengths, or hashes. `safeTexts` never includes input values: the collector
 * reads headings/labels/buttons and structurally cannot read form controls.
 */
export interface SafeObservation {
  url: string
  origin: string
  pageKind: PageKind
  semanticFields: Array<{ semantic: ObservedSemantic; present: true }>
  safeTexts: string[]
}

export interface CreateBrowserSessionInput {
  workspaceId: string
  userId: string
  authRunId?: string
  providerId: string
  /** Exact-origin allowlist; navigation outside it is force-aborted. */
  allowedOrigins: string[]
  /** Stable ref under which `saveContext` should persist this session's context. */
  persistContextRef?: string
}

export interface ResumeBrowserSessionInput extends CreateBrowserSessionInput {
  contextRef: string
  /**
   * Decrypted storage state supplied by the Account Broker (which owns the
   * encrypted `private.browser_contexts` row). The provider never persists
   * this JSON durably itself.
   */
  storageStateJson?: string
}

/**
 * Opaque per-session handle. `id` is the browser session id that
 * secret-injection leases bind to (`SecretInjectionLease.browserSessionId`).
 */
export interface BrowserSessionHandle {
  id: string
  providerId: string
  workspaceId: string
  userId: string
  authRunId?: string
  /** Normalized bare origins (lowercase, no path/query/hash). */
  allowedOrigins: string[]
  createdAt: string
}

/**
 * Semantic actions the orchestrator may request. Targets are resolved by
 * reviewed `data-action` attributes on the provider's known pages — the model
 * never supplies CSS selectors. Ambiguous resolution aborts; it never guesses.
 */
export type SemanticAction =
  | { kind: 'submit' }
  | { kind: 'click'; target: string }
  | { kind: 'check'; target: string }

export interface SafeActionResult {
  success: boolean
  /** Safe metadata only — never page content or input-derived data. */
  safeErrorCode?: string
  observation?: SafeObservation
}

export interface BrowserProvider {
  readonly id: string

  createSession(input: CreateBrowserSessionInput): Promise<BrowserSessionHandle>
  resumeSession(input: ResumeBrowserSessionInput): Promise<BrowserSessionHandle>

  /** Navigate within the allowlist; rejects/aborts anything outside it. */
  navigate(session: BrowserSessionHandle, url: string): Promise<SafeObservation>

  /** Deterministic safe observation of the current page. */
  observeSafely(session: BrowserSessionHandle): Promise<SafeObservation>

  actSemantically(session: BrowserSessionHandle, action: SemanticAction): Promise<SafeActionResult>

  /**
   * Fill exactly one semantic field with a secret under a signed one-time
   * lease. `plaintextProvider` consumes the DB lease and must be called only
   * after every check passes. Returns a receipt with safe metadata only; any
   * failure yields `success: false` with a `safeErrorCode` — never a partial
   * fill, never secret-derived data.
   */
  injectSecret(
    session: BrowserSessionHandle,
    lease: SecretInjectionLease,
    plaintextProvider: (leaseId: string) => Promise<string>
  ): Promise<InjectionReceipt>

  /** Short-lived user-takeover live view (hosted providers only). */
  getLiveView?(session: BrowserSessionHandle): Promise<{ url: string; expiresAt: string }>

  /**
   * Export storage state after a validated success state. The caller encrypts
   * `storageStateJson` and persists it under `contextRef`.
   */
  saveContext(session: BrowserSessionHandle): Promise<{ contextRef: string; storageStateJson: string }>

  deleteContext(contextRef: string): Promise<void>

  stopSession(session: BrowserSessionHandle): Promise<void>
}
