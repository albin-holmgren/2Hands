/**
 * LocalPlaywrightBrowserProvider — deterministic self-hosted BrowserProvider
 * for development and CI, driving headless Chromium against the first-party
 * Demo Account Provider site.
 *
 * SECURITY INVARIANTS (AUTH_SECRETS §7/§8/§10, ACCOUNT_BROKER §15):
 * 1. Recording is disabled by construction: no `recordVideo`, no `recordHar`,
 *    and no screenshot API is ever called. Nothing beyond SafeObservation
 *    leaves this module.
 * 2. Navigation is locked to the session's exact-origin allowlist. Every
 *    `navigate` asserts before `goto`; a network-layer route blocks
 *    off-allowlist main-frame document requests; a request-event watcher
 *    catches redirect hops (which bypass route re-interception) and poisons
 *    the session; and a `framenavigated` listener force-aborts (closes the
 *    page) if the main frame ever lands outside the allowlist anyway.
 * 3. Popups are closed immediately; downloads are refused.
 * 4. Page classification is deterministic (demo adapter path map +
 *    `data-semantic` attributes) — no LLM, no heuristics on unknown pages.
 * 5. `injectSecret` validates the signed one-time lease against the live page
 *    origin, resolves the target field by `[data-semantic]` with an
 *    exactly-one rule, re-verifies the origin immediately before filling,
 *    fetches plaintext only after every check passed (that call consumes the
 *    DB lease), and scrubs the local reference after use. Any failure returns
 *    a `success: false` receipt with a safe error code — never a partial
 *    fill, never secret-derived data, never a thrown secret.
 */
import { randomBytes } from 'node:crypto'
import type { Browser, BrowserContext, LaunchOptions, Page } from 'playwright-core'
import type { InjectionReceipt } from '@2hands/types/v3'
import { validateLease, type SecretInjectionLease } from '@2hands/secret-broker'
import type {
  BrowserProvider,
  BrowserSessionHandle,
  CreateBrowserSessionInput,
  PageKind,
  ResumeBrowserSessionInput,
  SafeActionResult,
  SafeObservation,
  SemanticAction,
} from './types'
import {
  buildSafeObservation,
  fieldMatchDecision,
  isUrlOriginAllowed,
  isValidActionTarget,
  normalizeAllowedOrigins,
  originOf,
} from './safety'
import { DEMO_PROVIDER_ID, demoPageKindFromPathname } from './demo-adapter'

interface SessionRecord {
  handle: BrowserSessionHandle
  context: BrowserContext
  page: Page
  persistContextRef?: string
  /** Set when the origin guard force-aborted; all later operations fail closed. */
  violated: boolean
}

export interface LocalPlaywrightOptions {
  /** HMAC key (hex) that signed secret-injection leases; required to validate them. */
  leaseSigningKeyHex: string
  /** Extra Chromium launch options (headless stays forced on). */
  launchOptions?: Omit<LaunchOptions, 'headless'>
}

export class LocalPlaywrightBrowserProvider implements BrowserProvider {
  readonly id = 'local-playwright'

  private browser: Browser | null = null
  private launching: Promise<Browser> | null = null
  private readonly records = new Map<string, SessionRecord>()
  /**
   * In-process context store: contextRef → storageState JSON. Durable
   * persistence (encrypted, in `private.browser_contexts`) is the caller's
   * job; this map only lets `resumeSession` work within one process.
   */
  private readonly contexts = new Map<string, string>()

  constructor(private readonly options: LocalPlaywrightOptions) {
    if (!options.leaseSigningKeyHex) throw new Error('leaseSigningKeyHex is required')
  }

  /** Launch Chromium lazily on first session; imported dynamically so merely
   *  loading this module never spawns a browser. */
  private async ensureBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser
    if (!this.launching) {
      this.launching = import('playwright-core').then(async ({ chromium }) => {
        const browser = await chromium.launch({ ...this.options.launchOptions, headless: true })
        this.browser = browser
        this.launching = null
        return browser
      })
    }
    return this.launching
  }

  async createSession(input: CreateBrowserSessionInput): Promise<BrowserSessionHandle> {
    return this.openSession(input, undefined)
  }

  async resumeSession(input: ResumeBrowserSessionInput): Promise<BrowserSessionHandle> {
    const storageStateJson = input.storageStateJson ?? this.contexts.get(input.contextRef)
    if (!storageStateJson) throw new Error('browser_context_unknown')
    return this.openSession({ ...input, persistContextRef: input.contextRef }, storageStateJson)
  }

  private async openSession(
    input: CreateBrowserSessionInput,
    storageStateJson: string | undefined
  ): Promise<BrowserSessionHandle> {
    // Fails closed: malformed or empty allowlists throw before any browser work.
    const allowedOrigins = normalizeAllowedOrigins(input.allowedOrigins)
    const browser = await this.ensureBrowser()

    const context = await browser.newContext({
      // INVARIANT 1: recording explicitly disabled — no video, no HAR.
      recordVideo: undefined,
      recordHar: undefined,
      viewport: { width: 1280, height: 800 },
      acceptDownloads: false,
      serviceWorkers: 'block',
      storageState: storageStateJson ? JSON.parse(storageStateJson) : undefined,
    })

    const handle: BrowserSessionHandle = {
      id: `bsess_${randomBytes(12).toString('hex')}`,
      providerId: input.providerId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      authRunId: input.authRunId,
      allowedOrigins,
      createdAt: new Date().toISOString(),
    }

    const page = await context.newPage()
    const record: SessionRecord = {
      handle,
      context,
      page,
      persistContextRef: input.persistContextRef,
      violated: false,
    }

    // INVARIANT 2a: block off-allowlist main-frame navigations at the
    // network layer. This catches HTTP redirect chains before the document
    // ever commits (a 302 to a foreign origin aborts instead of loading).
    // Subresource and iframe requests are not origin-locked here; only the
    // top document is, and observation/injection read the main frame only.
    await page.route('**/*', async (route) => {
      try {
        const request = route.request()
        if (
          request.isNavigationRequest() &&
          request.frame() === page.mainFrame() &&
          !isUrlOriginAllowed(request.url(), allowedOrigins)
        ) {
          record.violated = true
          await route.abort('blockedbyclient').catch(() => {})
          void page.close().catch(() => {})
          return
        }
        await route.continue()
      } catch {
        // Fail closed: if the request cannot be evaluated, abort it.
        await route.abort('blockedbyclient').catch(() => {})
      }
    })

    // INVARIANT 2b: HTTP redirect hops are followed by the browser without
    // re-entering page.route, so watch every main-frame navigation request
    // (including redirect hops) and poison + close the session the moment
    // one leaves the allowlist. The violated flag is set synchronously; all
    // observation/injection paths check it before touching the page.
    page.on('request', (request) => {
      try {
        if (
          request.isNavigationRequest() &&
          request.frame() === page.mainFrame() &&
          !isUrlOriginAllowed(request.url(), allowedOrigins)
        ) {
          record.violated = true
          void page.close().catch(() => {})
        }
      } catch {
        // request.frame() can throw for detached frames; the framenavigated
        // guard below still applies to anything that commits.
      }
    })

    // INVARIANT 2c: force-abort on any main-frame navigation that still
    // lands outside the allowlist (client redirects, meta refresh, JS
    // location changes). The page is closed — not merely flagged — so no
    // off-allowlist document is ever observable or fillable.
    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame()) return
      const url = frame.url()
      if (url === 'about:blank' || url === '') return
      if (!isUrlOriginAllowed(url, allowedOrigins)) {
        record.violated = true
        void page.close().catch(() => {})
      }
    })

    // INVARIANT 3: auth sessions never open popups; close them unseen.
    context.on('page', (extra) => {
      if (extra !== page) void extra.close().catch(() => {})
    })

    this.records.set(handle.id, record)
    return handle
  }

  async navigate(session: BrowserSessionHandle, url: string): Promise<SafeObservation> {
    const record = this.requireLiveRecord(session)
    // INVARIANT 2: assert before goto — never even request an off-allowlist URL.
    if (!isUrlOriginAllowed(url, record.handle.allowedOrigins)) {
      throw new Error('browser_navigation_blocked')
    }
    try {
      await record.page.goto(url, { waitUntil: 'load' })
    } catch (error) {
      // If the origin guard closed the page mid-redirect, surface that
      // instead of the raw playwright error.
      if (record.violated) throw new Error('browser_navigation_blocked')
      throw error
    }
    if (record.violated || record.page.isClosed()) throw new Error('browser_navigation_blocked')
    return this.observeSafely(session)
  }

  async observeSafely(session: BrowserSessionHandle): Promise<SafeObservation> {
    const record = this.requireLiveRecord(session)
    const page = record.page
    const url = page.url()

    // Collect only semantic descriptors and non-form-control text. The
    // evaluate callback structurally cannot leak input values: it never reads
    // `.value`, and form controls are excluded from the text walk (innerText
    // of labels/headings does not include control values).
    const raw = await page.evaluate(() => {
      const semantics = Array.from(document.querySelectorAll('[data-semantic]')).map(
        (el) => el.getAttribute('data-semantic') ?? ''
      )
      const textNodes = Array.from(
        document.querySelectorAll('h1, h2, h3, label, button, [data-safe-text], [data-error]')
      )
      const texts = textNodes
        .filter(
          (el) =>
            !(el instanceof HTMLInputElement) &&
            !(el instanceof HTMLTextAreaElement) &&
            !(el instanceof HTMLSelectElement)
        )
        .map((el) => (el instanceof HTMLElement ? el.innerText : el.textContent ?? ''))
      return { semantics, texts }
    })

    return buildSafeObservation({
      url,
      pageKind: this.classifyPage(session.providerId, url),
      rawSemantics: raw.semantics,
      rawTexts: raw.texts,
    })
  }

  /**
   * INVARIANT 4: deterministic classification. The demo provider is
   * classified by its frozen path map; other providers are `unknown` until a
   * reviewed adapter for them exists — which routes to user takeover, never
   * to guessing.
   */
  private classifyPage(providerId: string, url: string): PageKind {
    if (providerId !== DEMO_PROVIDER_ID) return 'unknown'
    try {
      return demoPageKindFromPathname(new URL(url).pathname)
    } catch {
      return 'unknown'
    }
  }

  async actSemantically(session: BrowserSessionHandle, action: SemanticAction): Promise<SafeActionResult> {
    const record = this.records.get(session.id)
    if (!record || record.violated || record.page.isClosed()) {
      return { success: false, safeErrorCode: 'session_unavailable' }
    }
    const page = record.page

    let selector: string
    if (action.kind === 'submit') {
      selector = '[data-action="submit"]'
    } else {
      if (!isValidActionTarget(action.target)) {
        return { success: false, safeErrorCode: 'invalid_target' }
      }
      selector = `[data-action="${action.target}"]`
    }

    try {
      const locator = page.locator(selector)
      const count = await locator.count()
      // Same exactly-one rule as injection: ambiguity aborts, never guesses.
      if (count !== 1) {
        return { success: false, safeErrorCode: count === 0 ? 'target_not_found' : 'ambiguous_target' }
      }
      if (action.kind === 'check') {
        await locator.check()
      } else {
        await locator.click()
      }
      await page.waitForLoadState('load').catch(() => {})
      if (record.violated || page.isClosed()) {
        return { success: false, safeErrorCode: 'origin_violation' }
      }
      return { success: true, observation: await this.observeSafely(session) }
    } catch {
      if (record.violated || page.isClosed()) {
        return { success: false, safeErrorCode: 'origin_violation' }
      }
      return { success: false, safeErrorCode: 'action_failed' }
    }
  }

  async injectSecret(
    session: BrowserSessionHandle,
    lease: SecretInjectionLease,
    plaintextProvider: (leaseId: string) => Promise<string>
  ): Promise<InjectionReceipt> {
    const receipt = (success: boolean, origin: string, safeErrorCode?: string): InjectionReceipt => ({
      leaseId: lease.id,
      browserSessionId: session.id,
      origin,
      fieldSemantic: lease.fieldSemantic,
      success,
      consumedAt: new Date().toISOString(),
      ...(safeErrorCode ? { safeErrorCode } : {}),
    })

    const record = this.records.get(session.id)
    if (!record || record.violated || record.page.isClosed()) {
      return receipt(false, '', 'session_unavailable')
    }
    const page = record.page

    try {
      // (a) Validate the signed one-time lease against the LIVE page origin
      // and the semantic field. validateLease fails closed on signature,
      // expiry, use-count, origin, field, session, or provider mismatch.
      const currentOrigin = originOf(page.url())
      if (!currentOrigin) return receipt(false, '', 'malformed_origin')
      const validation = validateLease({
        lease,
        signingKeyHex: this.options.leaseSigningKeyHex,
        currentOrigin,
        fieldSemantic: lease.fieldSemantic,
        browserSessionId: session.id,
        providerId: session.providerId,
      })
      if (!validation.valid) return receipt(false, currentOrigin, `lease_${validation.reason}`)

      // (c) Resolve the target field by [data-semantic] exactly. Zero or
      // multiple matches (duplicate/overlaid fields) abort — never guess,
      // never fill more than one field.
      const locator = page.locator(`input[data-semantic="${lease.fieldSemantic}"]`)
      const decision = fieldMatchDecision(await locator.count())
      if (!decision.ok) return receipt(false, currentOrigin, decision.safeErrorCode)

      // (b) Re-verify the page origin immediately before fill: the page may
      // have navigated between validation and now (nothing else is awaited
      // between this check, the plaintext fetch, and the fill).
      if (record.violated || page.isClosed()) return receipt(false, currentOrigin, 'origin_violation')
      const preFetchOrigin = originOf(page.url())
      if (preFetchOrigin !== currentOrigin) return receipt(false, currentOrigin, 'origin_changed')

      // (d) Only now fetch the plaintext — this call consumes the single-use
      // DB lease, so every cheaper check must already have passed.
      let plaintext: string
      try {
        plaintext = await plaintextProvider(lease.id)
      } catch {
        return receipt(false, currentOrigin, 'plaintext_unavailable')
      }

      try {
        // Navigation lock: final origin check after the async fetch, then fill.
        if (record.violated || page.isClosed() || originOf(page.url()) !== currentOrigin) {
          return receipt(false, currentOrigin, 'origin_changed')
        }
        // (e) Atomic single-field fill; playwright sets the value in one
        // protocol call, so there is no partially-typed state on failure.
        await locator.fill(plaintext)
      } catch {
        return receipt(false, currentOrigin, 'fill_failed')
      } finally {
        // (f) Scrub the local reference. JS strings are immutable, so this
        // drops our only reference for GC rather than zeroing memory — the
        // plaintext never lands in any other variable, log, or error.
        plaintext = ''
      }

      // (g) Safe metadata only: field id/semantic + origin + outcome.
      return receipt(true, currentOrigin)
    } catch {
      // Any unexpected failure fails closed with a generic safe code; the
      // caught error object is never rethrown or serialized from here.
      return receipt(false, originOf(page.url()) ?? '', 'injection_error')
    }
  }

  // getLiveView is intentionally not implemented: live view/user takeover is
  // a hosted-provider feature (Browserbase adapter). Local dev uses headful
  // debugging instead; the orchestrator treats absence as "takeover requires
  // a hosted session".

  async saveContext(session: BrowserSessionHandle): Promise<{ contextRef: string; storageStateJson: string }> {
    const record = this.requireLiveRecord(session)
    // Persist only after the Account Broker validated the session — this
    // method is mechanical; the "validated success state" gate lives in the
    // auth orchestrator that calls it.
    const storageState = await record.context.storageState()
    const storageStateJson = JSON.stringify(storageState)
    const contextRef = record.persistContextRef ?? `bctx_${randomBytes(12).toString('hex')}`
    this.contexts.set(contextRef, storageStateJson)
    return { contextRef, storageStateJson }
  }

  async deleteContext(contextRef: string): Promise<void> {
    this.contexts.delete(contextRef)
  }

  async stopSession(session: BrowserSessionHandle): Promise<void> {
    const record = this.records.get(session.id)
    if (!record) return
    this.records.delete(session.id)
    await record.page.close().catch(() => {})
    await record.context.close().catch(() => {})
  }

  /** Close everything (test teardown). */
  async dispose(): Promise<void> {
    for (const id of [...this.records.keys()]) {
      const record = this.records.get(id)
      this.records.delete(id)
      await record?.context.close().catch(() => {})
    }
    await this.browser?.close().catch(() => {})
    this.browser = null
  }

  private requireLiveRecord(session: BrowserSessionHandle): SessionRecord {
    const record = this.records.get(session.id)
    if (!record) throw new Error('browser_session_unknown')
    if (record.violated) throw new Error('browser_session_origin_violation')
    if (record.page.isClosed()) throw new Error('browser_session_closed')
    return record
  }
}
