/**
 * Smoke Tests: Mission Control — Health Tab (ConfidencePanel)
 *
 * Covers:
 *  - Loading the Health tab as a signed-in user shows runtime health
 *  - 401 from status endpoint shows session-expired error UI
 *  - 5xx from status endpoint shows transient error UI with Retry button
 *  - Stale runs triggers the Recover button
 *  - 429 from recover endpoint shows cooldown error banner
 *  - 24h stability bar renders when history data is available
 *  - Unauthenticated 401 from recover shows sign-in link
 *
 * All confidence API calls are mocked — no real server required.
 * Runtime target: < 30 seconds.
 */

import { test, expect, type Page } from '@playwright/test'
import { AuthHelper, hasTestCredentials } from '../setup/auth-helper'

// ── Mock helpers ─────────────────────────────────────────────────────────────

const HEALTHY_STATUS = {
  level: 'healthy',
  timestamp: new Date().toISOString(),
  indicators: {
    env: 'ok',
    database: 'ok',
    stale_runs: 0,
    stale_locks: 0,
    queue_backlog: 0,
    pending_approvals: 0,
    blocked_missions: 0,
    session_pool: 'ok',
    billing: 'ok',
  },
  actions_needed: [],
  scope: { user_id: 'test-user-id' },
}

const STALE_STATUS = {
  ...HEALTHY_STATUS,
  level: 'degraded',
  indicators: {
    ...HEALTHY_STATUS.indicators,
    stale_runs: 3,
    stale_locks: 1,
  },
  actions_needed: ['3 stale agent runs — call POST /api/confidence/recover'],
}

const HEALTHY_HISTORY = {
  timestamp: new Date().toISOString(),
  hours_requested: 24,
  stability: {
    total: 48,
    healthy: 46,
    degraded: 2,
    unhealthy: 0,
    healthyPercent: 96,
    latestLevel: 'healthy',
  },
  snapshots: [],
}

async function mockConfidenceAPIs(page: Page, opts: {
  statusCode?: number
  status?: object
  historyCode?: number
  history?: object
} = {}) {
  const { statusCode = 200, status = HEALTHY_STATUS, historyCode = 200, history = HEALTHY_HISTORY } = opts

  await page.route('**/api/confidence/status', async (route) => {
    await route.fulfill({
      status: statusCode,
      contentType: 'application/json',
      body: JSON.stringify(statusCode === 200 ? status : { error: 'Unauthorized' }),
    })
  })

  await page.route('**/api/confidence/history**', async (route) => {
    await route.fulfill({
      status: historyCode,
      contentType: 'application/json',
      body: JSON.stringify(historyCode === 200 ? history : { error: 'Unauthorized' }),
    })
  })

  await page.route('**/api/confidence/recover', async (route) => {
    await route.continue()
  })
}

async function mockRecoverAPI(page: Page, opts: { code: number; body: object }) {
  await page.route('**/api/confidence/recover', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: opts.code,
        contentType: 'application/json',
        body: JSON.stringify(opts.body),
      })
    } else {
      await route.continue()
    }
  })
}

async function navigateToHealthTab(page: Page) {
  await page.goto('/app/mission')
  // Click the "Health" tab button
  await page.click('button:has-text("Health")')
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Health Tab Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL/PASSWORD')
  })

  // ---------------------------------------------------------------------------
  // Happy path: healthy system
  // ---------------------------------------------------------------------------
  test('shows runtime health panel when status loads successfully', async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL/PASSWORD')

    await mockConfidenceAPIs(page)

    const auth = new AuthHelper(page)
    await auth.login()

    await navigateToHealthTab(page)

    // The panel header should be visible
    await expect(page.locator('text=Runtime Health')).toBeVisible({ timeout: 8000 })

    // Should show a health level badge (Healthy / Degraded / Unhealthy)
    const badge = page.locator('text=Healthy, text=Degraded, text=Unhealthy').first()
    await expect(badge).toBeVisible({ timeout: 5000 })

    // System status section should be present
    await expect(page.locator('text=System status')).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // 24h stability bar
  // ---------------------------------------------------------------------------
  test('shows 24h stability bar when history data is available', async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL/PASSWORD')

    await mockConfidenceAPIs(page, { history: HEALTHY_HISTORY })

    const auth = new AuthHelper(page)
    await auth.login()

    await navigateToHealthTab(page)

    // Wait for status to load
    await expect(page.locator('text=Runtime Health')).toBeVisible({ timeout: 8000 })

    // The stability bar section label
    await expect(page.locator('text=24h stability')).toBeVisible({ timeout: 6000 })

    // Should show the healthy percentage
    await expect(page.locator('text=96% healthy')).toBeVisible({ timeout: 5000 })
  })

  // ---------------------------------------------------------------------------
  // Recover CTA when stale runs present
  // ---------------------------------------------------------------------------
  test('shows Recover button when stale runs are detected', async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL/PASSWORD')

    await mockConfidenceAPIs(page, { status: STALE_STATUS })
    await mockRecoverAPI(page, {
      code: 200,
      body: {
        run_id: 'test-recover-run',
        timestamp: new Date().toISOString(),
        actor: { type: 'user', id: 'test-user-id' },
        total_issues_fixed: 3,
        summary: ['3 stale runs recovered'],
        stale_recovery: { stale_runs_detected: 3, stale_runs_fixed: 3 },
        agent_health: {},
      },
    })

    const auth = new AuthHelper(page)
    await auth.login()

    await navigateToHealthTab(page)

    await expect(page.locator('text=Runtime Health')).toBeVisible({ timeout: 8000 })

    // Recover button should appear
    const recoverBtn = page.locator('button:has-text("Recover")')
    await expect(recoverBtn).toBeVisible({ timeout: 6000 })
  })

  // ---------------------------------------------------------------------------
  // Recover success banner
  // ---------------------------------------------------------------------------
  test('shows success banner after recover completes', async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL/PASSWORD')

    await mockConfidenceAPIs(page, { status: STALE_STATUS })
    await mockRecoverAPI(page, {
      code: 200,
      body: {
        run_id: 'test-recover-run',
        timestamp: new Date().toISOString(),
        actor: { type: 'user', id: 'test-user-id' },
        total_issues_fixed: 3,
        summary: ['3 stale runs recovered'],
        stale_recovery: { stale_runs_detected: 3, stale_runs_fixed: 3 },
        agent_health: {},
      },
    })

    const auth = new AuthHelper(page)
    await auth.login()

    await navigateToHealthTab(page)

    await expect(page.locator('text=Runtime Health')).toBeVisible({ timeout: 8000 })

    // Click Recover
    const recoverBtn = page.locator('button:has-text("Recover")').first()
    await recoverBtn.click()

    // Success banner should appear
    await expect(page.locator('text=Fixed 3 issues')).toBeVisible({ timeout: 8000 })
  })

  // ---------------------------------------------------------------------------
  // Session expired (401) — shows sign-in link, no retry button
  // ---------------------------------------------------------------------------
  test('shows session-expired UI and sign-in link on 401', async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL/PASSWORD')

    await mockConfidenceAPIs(page, { statusCode: 401 })

    const auth = new AuthHelper(page)
    await auth.login()

    await navigateToHealthTab(page)

    // Error screen should show session expired messaging
    await expect(page.locator('text=Session expired')).toBeVisible({ timeout: 8000 })

    // Sign in link should be present
    await expect(page.locator('a:has-text("Sign in")')).toBeVisible({ timeout: 3000 })

    // Retry button should NOT be present (401 should not offer retry)
    await expect(page.locator('button:has-text("Retry")')).not.toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // Transient 5xx — shows retry button, no sign-in link
  // ---------------------------------------------------------------------------
  test('shows transient error UI and Retry button on 503', async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL/PASSWORD')

    await mockConfidenceAPIs(page, { statusCode: 503 })

    const auth = new AuthHelper(page)
    await auth.login()

    await navigateToHealthTab(page)

    // Error screen should show transient messaging
    await expect(page.locator('text=Service temporarily unavailable')).toBeVisible({ timeout: 8000 })

    // Retry button should be present
    await expect(page.locator('button:has-text("Retry")')).toBeVisible({ timeout: 3000 })

    // Sign in link should NOT be present
    await expect(page.locator('a:has-text("Sign in")')).not.toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // Recover 429 — cooldown error banner
  // ---------------------------------------------------------------------------
  test('shows cooldown error banner when recover returns 429', async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL/PASSWORD')

    await mockConfidenceAPIs(page, { status: STALE_STATUS })
    await mockRecoverAPI(page, {
      code: 429,
      body: { error: 'Recovery on cooldown. Wait 28 seconds before retrying.' },
    })

    const auth = new AuthHelper(page)
    await auth.login()

    await navigateToHealthTab(page)

    await expect(page.locator('text=Runtime Health')).toBeVisible({ timeout: 8000 })

    const recoverBtn = page.locator('button:has-text("Recover")').first()
    await recoverBtn.click()

    // Cooldown error hint should appear in the error banner
    await expect(page.locator('text=cooldown').or(page.locator('text=Wait'))).toBeVisible({ timeout: 8000 })
  })

  // ---------------------------------------------------------------------------
  // All-clear state — no recover CTA when everything is healthy
  // ---------------------------------------------------------------------------
  test('shows all-clear when system is fully healthy', async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL/PASSWORD')

    await mockConfidenceAPIs(page, { status: HEALTHY_STATUS })

    const auth = new AuthHelper(page)
    await auth.login()

    await navigateToHealthTab(page)

    await expect(page.locator('text=Runtime Health')).toBeVisible({ timeout: 8000 })

    // All-clear message
    await expect(page.locator('text=Everything looks healthy')).toBeVisible({ timeout: 6000 })

    // Recover button should not be visible
    await expect(page.locator('button:has-text("Recover")')).not.toBeVisible()
  })
})
