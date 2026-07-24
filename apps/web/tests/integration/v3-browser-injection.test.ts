#!/usr/bin/env npx tsx
// v3 Slice 3 — deterministic browser-injection tests.
//
// Plain tsx script (not the @playwright/test runner). Three layers:
//   1. Pure lease-validation matrix — always runs, no browser, no server.
//   2. Navigation-lock scenarios — headless chromium against throwaway
//      node:http fixture servers (no Next.js needed): direct foreign
//      navigation refused before any request; an HTTP redirect chain to a
//      foreign origin aborts and poisons the session.
//   3. Live demo-provider page scenarios (needs a dev server on
//      DEMO_PROVIDER_BASE_URL, default http://localhost:3000):
//        - a lease signed for a different origin is rejected (origin_not_allowed)
//        - the redirect_wrong_origin scenario never lands off-origin (the app's
//          CSP form-action 'self' is the outer layer; the provider lock is the
//          backstop, exercised directly in layer 2)
//        - the duplicate_fields scenario aborts with ambiguous_field before
//          the single-use lease is ever consumed
//        - the prompt_injection scenario: page text exists, but injection still
//          only fills [data-semantic] fields and no canary reaches SafeObservation
//      Layers 2/3 skip cleanly (with layer 1 still asserted) when chromium or
//      the server is absent.

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import {
  newLeaseId,
  newLeaseNonce,
  scanObjectForSecrets,
  signLease,
  validateLease,
  type SecretInjectionLease,
  type UnsignedLease,
} from '@2hands/secret-broker'
import { LocalPlaywrightBrowserProvider, DEMO_PROVIDER_ID, type BrowserSessionHandle } from '@2hands/browser'
import type { SecretReference } from '@2hands/types/v3'

const baseUrl = (process.env.DEMO_PROVIDER_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(baseUrl)) {
  console.error('Refusing to run browser-injection tests against a non-local base URL:', baseUrl)
  process.exit(1)
}
const baseOrigin = new URL(baseUrl).origin
const SIGNING_KEY = 'c'.repeat(64)
const LOGIN_PATH = '/demo-provider/login/password'

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

interface LeaseOverrides extends Partial<Omit<UnsignedLease, 'maximumUses'>> {
  maximumUses?: 1
}

function mintLease(overrides: LeaseOverrides = {}, signingKey = SIGNING_KEY): SecretInjectionLease {
  const unsigned: UnsignedLease = {
    id: newLeaseId(),
    secretRef: `sec_${'0'.repeat(32)}` as SecretReference,
    workspaceId: randomUUID(),
    userId: randomUUID(),
    taskId: '',
    authRunId: randomUUID(),
    providerId: DEMO_PROVIDER_ID,
    browserSessionId: 'bsess_matrix',
    allowedOrigins: [baseOrigin],
    fieldSemantic: 'password',
    purpose: 'login',
    maximumUses: 1,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    nonce: newLeaseNonce(),
    ...overrides,
  }
  return signLease(unsigned, signingKey)
}

function reasonOf(lease: SecretInjectionLease, input?: Partial<Parameters<typeof validateLease>[0]>): string {
  const result = validateLease({
    lease,
    signingKeyHex: SIGNING_KEY,
    currentOrigin: baseOrigin,
    fieldSemantic: lease.fieldSemantic,
    browserSessionId: lease.browserSessionId,
    providerId: lease.providerId,
    ...input,
  })
  return result.valid ? 'valid' : result.reason
}

function pureLeaseMatrix(): void {
  console.log('\n=== 1. Lease validation matrix (pure, always runs) ===')

  assert(reasonOf(mintLease()) === 'valid', 'exact-match lease validates')
  assert(
    reasonOf({ ...mintLease(), signature: 'ab'.repeat(32) }) === 'signature_mismatch',
    'tampered signature → signature_mismatch'
  )
  assert(
    reasonOf(mintLease({}, 'd'.repeat(64))) === 'signature_mismatch',
    'lease signed with a different key → signature_mismatch'
  )
  {
    const lease = mintLease()
    const mutated = { ...lease, allowedOrigins: [...lease.allowedOrigins, 'http://localhost:3999'] }
    assert(reasonOf(mutated) === 'signature_mismatch', 'origin list widened after signing → signature_mismatch')
  }
  assert(
    reasonOf(mintLease({ expiresAt: new Date(Date.now() - 1000).toISOString() })) === 'expired',
    'expired lease → expired'
  )
  {
    const lease = mintLease()
    const multiUse = signLease(
      { ...lease, maximumUses: 2 as unknown as 1, signature: undefined } as unknown as UnsignedLease,
      SIGNING_KEY
    )
    assert(reasonOf(multiUse) === 'invalid_use_count', 'maximumUses !== 1 → invalid_use_count')
  }
  assert(
    reasonOf(mintLease(), { currentOrigin: 'http://localhost:3999' }) === 'origin_not_allowed',
    'wrong current origin → origin_not_allowed'
  )
  assert(
    reasonOf(mintLease(), { currentOrigin: `${baseOrigin}/some/path` }) === 'malformed_origin',
    'origin with a path → malformed_origin'
  )
  assert(
    reasonOf(mintLease(), { fieldSemantic: 'email' }) === 'field_mismatch',
    'different live field semantic → field_mismatch'
  )
  assert(
    reasonOf(mintLease(), { browserSessionId: 'bsess_other' }) === 'session_mismatch',
    'different browser session → session_mismatch'
  )
  assert(
    reasonOf(mintLease(), { providerId: 'other-provider' }) === 'provider_mismatch',
    'different provider → provider_mismatch'
  )
}

async function serverUp(): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}${LOGIN_PATH}`, { signal: AbortSignal.timeout(4000) })
    return res.ok
  } catch {
    return false
  }
}

function newSessionFactory(provider: LocalPlaywrightBrowserProvider, allowedOrigins: string[]) {
  return (): Promise<BrowserSessionHandle> =>
    provider.createSession({
      workspaceId: randomUUID(),
      userId: randomUUID(),
      authRunId: randomUUID(),
      providerId: DEMO_PROVIDER_ID,
      allowedOrigins,
    })
}

/** Chromium probe: playwright-core does not download browsers, so a fresh
 *  checkout may not have one. Returns false (after logging) when unavailable. */
async function chromiumAvailable(provider: LocalPlaywrightBrowserProvider): Promise<boolean> {
  try {
    const probe = await newSessionFactory(provider, [baseOrigin])()
    await provider.stopSession(probe)
    return true
  } catch (error) {
    console.log(
      `SKIP: could not launch headless chromium (${error instanceof Error ? error.message.split('\n')[0] : 'unknown'})`
    )
    return false
  }
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve(`http://127.0.0.1:${port}`)
    })
  })
}

/**
 * Navigation-lock scenarios against throwaway fixture servers. An HTTP
 * redirect chain is the case the app-level CSP cannot cover for third-party
 * sites, so the provider's own lock must abort it.
 */
async function navigationLockScenarios(provider: LocalPlaywrightBrowserProvider): Promise<void> {
  console.log('\n=== 2. Navigation lock (headless chromium, fixture servers) ===')

  let foreignHits = 0
  const foreign = createServer((req, res) => {
    foreignHits++
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<h1>foreign origin</h1>')
  })
  const foreignOrigin = await listen(foreign)

  const allowed = createServer((req, res) => {
    if (req.url?.startsWith('/redir')) {
      res.writeHead(302, { location: `${foreignOrigin}/evil` })
      res.end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<h1>allowed origin</h1>')
  })
  const allowedOrigin = await listen(allowed)

  try {
    const newSession = newSessionFactory(provider, [allowedOrigin])

    // ---- 2a. direct off-allowlist navigation refused before any request ---
    {
      const session = await newSession()
      let code = ''
      try {
        await provider.navigate(session, `${foreignOrigin}/evil`)
      } catch (error) {
        code = error instanceof Error ? error.message : ''
      }
      assert(code === 'browser_navigation_blocked', 'direct foreign navigation → browser_navigation_blocked')
      assert(foreignHits === 0, 'foreign origin never contacted on a direct block (pre-goto assert)')

      // The session survives a pre-goto refusal: it never left the allowlist.
      const observation = await provider.navigate(session, `${allowedOrigin}/`)
      assert(observation.origin === new URL(allowedOrigin).origin, 'session still usable on the allowlisted origin')
      await provider.stopSession(session)
    }

    // ---- 2b. HTTP redirect chain to a foreign origin aborts the session ---
    {
      const session = await newSession()
      let code = ''
      try {
        await provider.navigate(session, `${allowedOrigin}/redir`)
      } catch (error) {
        code = error instanceof Error ? error.message : ''
      }
      assert(code === 'browser_navigation_blocked', 'redirect chain to foreign origin → browser_navigation_blocked')

      let observeThrew = false
      try {
        await provider.observeSafely(session)
      } catch {
        observeThrew = true
      }
      assert(observeThrew, 'poisoned session refuses further observation')

      let plaintextCalls = 0
      const receipt = await provider.injectSecret(session, mintLease({ browserSessionId: session.id }), async () => {
        plaintextCalls++
        return 'never-used'
      })
      assert(!receipt.success && receipt.safeErrorCode === 'session_unavailable', 'poisoned session refuses injection')
      assert(plaintextCalls === 0, 'poisoned session never fetches plaintext')
      await provider.stopSession(session)
    }
  } finally {
    foreign.close()
    allowed.close()
  }
}

async function liveScenarios(provider: LocalPlaywrightBrowserProvider): Promise<void> {
  console.log('\n=== 3. Live demo-provider scenarios (headless chromium) ===')

  const newSession = newSessionFactory(provider, [baseOrigin])

  const sessionLease = (session: BrowserSessionHandle, overrides: LeaseOverrides = {}): SecretInjectionLease =>
    mintLease({ browserSessionId: session.id, ...overrides })

  // ---- 3a. wrong-origin lease is rejected before any plaintext fetch ------
  {
    const session = await newSession()
    await provider.navigate(session, `${baseUrl}${LOGIN_PATH}`)
    let plaintextCalls = 0
    const foreign = sessionLease(session, { allowedOrigins: ['http://localhost:4321'] })
    const receipt = await provider.injectSecret(session, foreign, async () => {
      plaintextCalls++
      return 'never-used'
    })
    assert(!receipt.success, 'wrong-origin lease: injection fails')
    assert(receipt.safeErrorCode === 'lease_origin_not_allowed', 'wrong-origin lease: origin_not_allowed')
    assert(plaintextCalls === 0, 'wrong-origin lease: plaintext never fetched, lease never consumed')
    await provider.stopSession(session)
  }

  // ---- 3b. redirect_wrong_origin scenario never lands off-origin ----------
  // The login POST answers 303 → http://localhost:3999/evil, but the app's
  // global CSP (form-action 'self') makes Chromium cancel the cross-origin
  // redirect after form submission, so the page never leaves the allowlisted
  // origin. That outer layer fires before the provider's navigation lock;
  // the lock itself is exercised with a raw redirect chain in layer 2, where
  // no first-party CSP exists (the real third-party case).
  {
    const session = await newSession()
    await provider.navigate(session, `${baseUrl}${LOGIN_PATH}?scenario=redirect_wrong_origin`)
    const emailReceipt = await provider.injectSecret(
      session,
      sessionLease(session, { fieldSemantic: 'email' }),
      async () => 'demo-user@demo-provider.test'
    )
    const passwordReceipt = await provider.injectSecret(session, sessionLease(session), async () => 'demo-password-fixture')
    assert(emailReceipt.success && passwordReceipt.success, 'redirect scenario: on-allowlist fills succeed')

    const submitted = await provider.actSemantically(session, { kind: 'submit' })
    const landedOrigin = submitted.observation?.origin ?? null
    assert(
      landedOrigin === null || landedOrigin === baseOrigin,
      `redirect scenario: session never observes a foreign origin (got ${landedOrigin ?? submitted.safeErrorCode})`
    )
    if (submitted.success && submitted.observation) {
      assert(
        submitted.observation.url.startsWith(`${baseUrl}/demo-provider/`),
        'redirect scenario: cross-origin redirect was cancelled (CSP form-action), page stays on the demo site'
      )
    } else {
      // If the environment ever allows the redirect hop, the provider's own
      // lock must have poisoned the session instead.
      assert(
        submitted.safeErrorCode === 'origin_violation',
        `redirect scenario: provider lock poisons the session (got ${submitted.safeErrorCode})`
      )
    }
    await provider.stopSession(session)
  }

  // ---- 3c. duplicate_fields scenario aborts with ambiguous_field ----------
  {
    const session = await newSession()
    await provider.navigate(session, `${baseUrl}${LOGIN_PATH}?scenario=duplicate_fields`)
    let plaintextCalls = 0
    const receipt = await provider.injectSecret(session, sessionLease(session), async () => {
      plaintextCalls++
      return 'never-used'
    })
    assert(!receipt.success, 'duplicate fields: injection fails')
    assert(receipt.safeErrorCode === 'ambiguous_field', 'duplicate fields: ambiguous_field (never guesses)')
    assert(plaintextCalls === 0, 'duplicate fields: lease not consumed on abort')
    await provider.stopSession(session)
  }

  // ---- 3d. prompt_injection scenario: inert text, no canary leak ----------
  {
    const session = await newSession()
    const observation = await provider.navigate(session, `${baseUrl}${LOGIN_PATH}?scenario=prompt_injection`)
    assert(observation.safeTexts.length > 0, 'prompt injection: page yields safe texts')
    assert(observation.origin === baseOrigin, 'prompt injection: observation origin stays on the allowlist')
    assert(
      observation.semanticFields.map((f) => f.semantic).sort().join(',') === 'email,password',
      'prompt injection: only the declared semantic fields are observed'
    )

    const canary = `canary-${Date.now()}-${randomUUID().slice(0, 8)}`
    const receipt = await provider.injectSecret(session, sessionLease(session), async () => canary)
    assert(receipt.success, 'prompt injection: [data-semantic] password fill still succeeds')
    assert(receipt.fieldSemantic === 'password', 'prompt injection: receipt names the leased field only')

    const after = await provider.observeSafely(session)
    const hits = scanObjectForSecrets({ before: observation, after, receipt }, [canary])
    assert(hits.length === 0, 'prompt injection: canary never appears in any SafeObservation or receipt')
    assert(after.origin === baseOrigin, 'prompt injection: page never left the allowlisted origin')
    await provider.stopSession(session)
  }
}

async function main() {
  pureLeaseMatrix()

  const provider = new LocalPlaywrightBrowserProvider({ leaseSigningKeyHex: SIGNING_KEY })
  try {
    if (await chromiumAvailable(provider)) {
      await navigationLockScenarios(provider)

      if (await serverUp()) {
        await liveScenarios(provider)
      } else {
        console.log(`\nSKIP: ${baseUrl}${LOGIN_PATH} is not serving — live page scenarios not executed.`)
        console.log('      (Start the web app with `pnpm dev` in apps/web to run them.)')
      }
    }
  } finally {
    await provider.dispose().catch(() => {})
  }

  console.log('\n───────────────────────────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error('Browser-injection test crashed:', error)
  process.exit(1)
})
