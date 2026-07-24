/**
 * v3 golden-path acceptance E2E (IMPLEMENTATION_MAP Slice 9).
 *
 * Journey: fresh user → /app/v3 (orb + prompt, no sidebar) → marketplace
 * (Demo rows labeled) → golden goal typed into the composer → demo pipeline
 * (fixture computer, Demo Codex fix → Demo Claude review → verification) →
 * exact publication ApprovalCard (repo + branch) → Deny → ZERO receipts →
 * re-request (send the goal again) → Approve → receipt chip + completed
 * state. Mid-flow the page is reloaded once to prove reconnect-from-cursor
 * rendering (event replay + pending ApprovalCard restore).
 *
 * Local-only: skips when the local Supabase stack (127.0.0.1:54321) is not
 * reachable or no service-role key is available. Run via:
 *   pnpm --filter @2hands/web test:e2e:golden
 * (the Playwright webServer starts `pnpm dev` on :3000 when nothing is
 * already listening there).
 */

import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

/**
 * The strained local stack (docker + next dev) can take >15s per API call, so
 * every UI assertion gets a generous ceiling — passing assertions still
 * resolve immediately.
 */
const eventually = expect.configure({ timeout: 60_000 })

const SUPABASE_URL = process.env.TEST_SUPABASE_URL || 'http://127.0.0.1:54321'
const SERVICE_KEY =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const GOLDEN_GOAL =
  'Use Codex to fix the failing onboarding test and ask Claude to review it. ' +
  'Prepare a pull request but do not publish without asking me.'

const DEMO_REPOSITORY = 'demo/onboarding'
const DEMO_BRANCH = '2hands/fix-onboarding'

async function localSupabaseUp(): Promise<boolean> {
  if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(SUPABASE_URL)) return false
  // A busy local docker stack can drop a single probe — retry before skipping.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) return true
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  return false
}

interface TestUser {
  email: string
  password: string
  userId: string
  workspaceId: string
}

async function createFreshUser(admin: SupabaseClient): Promise<TestUser> {
  const stamp = Date.now()
  const email = `v3-golden-${stamp}@example.test`
  const password = `Pw-${randomUUID()}`
  // Local GoTrue can transiently 5xx while the docker stack is under load —
  // retry a couple of times before giving up.
  let created: { user: { id: string } | null } | null = null
  let lastError: string | undefined
  for (let attempt = 0; attempt < 3 && !created?.user; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2000))
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    lastError = error?.message
    if (!error && data.user) created = data
  }
  const data = created
  if (!data?.user) throw new Error(`user create failed: ${lastError ?? 'unknown'}`)
  const workspaceId = randomUUID()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = (name: string) => (admin as any).from(name)
  const { error: wsError } = await t('workspaces').insert({
    id: workspaceId,
    name: 'v3 golden',
    slug: `v3-golden-${stamp}`,
    owner_id: data.user.id,
  })
  if (wsError) throw new Error(`workspace create failed: ${wsError.message}`)
  const { error: memberError } = await t('workspace_members').insert({
    workspace_id: workspaceId,
    user_id: data.user.id,
    role: 'owner',
  })
  if (memberError) throw new Error(`member create failed: ${memberError.message}`)
  return { email, password, userId: data.user.id, workspaceId }
}

async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto('/sign-in', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.fill('input[type="email"]', user.email)
  await page.click('button[type="submit"]')
  await page.waitForSelector('input[type="password"]', { timeout: 10_000 })
  await page.fill('input[type="password"]', user.password)
  await page.click('button[type="submit"]:has-text("Sign in")')
  // First compile of /app in dev can take a while — wait for the URL commit
  // only; the test navigates straight on to /app/v3 afterwards.
  await page.waitForURL(/\/app/, { timeout: 60_000, waitUntil: 'commit' })
}

async function sendGoal(page: Page, goal: string): Promise<void> {
  const composer = page.getByLabel('Message 2Hands')
  await composer.click()
  await composer.fill(goal)
  await composer.press('Enter')
}

function approvalCard(page: Page) {
  return page.locator('section[data-slot="approval-card"]')
}

async function activeTaskId(page: Page): Promise<string | null> {
  return page.evaluate(() => window.sessionStorage.getItem('2hands_v3_active_task'))
}

async function receiptsFor(page: Page, taskId: string): Promise<unknown[]> {
  const res = await page.request.get(`/api/receipts?taskId=${taskId}`)
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.ok) throw new Error(`receipts fetch failed (${res.status})`)
  return body.data.receipts ?? []
}

test.describe('v3 golden path', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(240_000)

  let user: TestUser

  test.beforeAll(async () => {
    test.setTimeout(120_000) // local docker stack can be slow under load
    test.skip(!(await localSupabaseUp()), 'local Supabase (127.0.0.1:54321) is not running')
    test.skip(!SERVICE_KEY, 'no SUPABASE_SERVICE_ROLE_KEY / TEST_SUPABASE_SERVICE_ROLE_KEY set')
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    user = await createFreshUser(admin)
  })

  test('deny publishes nothing; approve publishes exactly once with a receipt', async ({
    page,
  }) => {
    await test.step('sign in as a fresh user and open /app/v3', async () => {
      await signIn(page, user)
      await page.goto('/app/v3', { waitUntil: 'domcontentloaded', timeout: 60_000 })
      const shell = page.locator('[data-slot="v3-shell"]')
      await eventually(shell).toBeVisible()

      // Hero orb + prompt, and NO sidebar inside the v3 surface.
      await eventually(shell.locator('[data-orb-state]').first()).toBeVisible()
      await eventually(shell.getByText('What should we get done?')).toBeVisible()
      await eventually(shell.locator('[data-testid="sidebar"]')).toHaveCount(0)
      await eventually(shell.locator('aside')).toHaveCount(0)
    })

    await test.step('marketplace shows Demo-labeled rows', async () => {
      await page.getByLabel('Open marketplace').click()
      await eventually(page.getByText('Demo Gmail')).toBeVisible()
      await eventually(page.getByText('Demo GitHub')).toBeVisible()
      const demoPills = page.locator('[data-slot="provider-status-pill"]', { hasText: 'Demo' })
      expect(await demoPills.count()).toBeGreaterThanOrEqual(3)
      await page.keyboard.press('Escape')
      await eventually(page.getByText('Demo Gmail')).toBeHidden()
    })

    let firstTaskId: string | null = null

    await test.step('golden goal runs the demo pipeline to an exact publication approval', async () => {
      await sendGoal(page, GOLDEN_GOAL)
      await eventually(page.locator('[data-slot="task-stream"]')).toBeVisible()

      // Publication ApprovalCard with the exact repository + branch.
      const card = approvalCard(page)
      await eventually(card).toBeVisible({ timeout: 60_000 })
      await eventually(card.getByText('Needs your approval')).toBeVisible()
      await eventually(card.getByText(DEMO_REPOSITORY, { exact: true })).toBeVisible()
      await eventually(card.getByText(DEMO_BRANCH, { exact: true })).toBeVisible()

      firstTaskId = await activeTaskId(page)
      expect(firstTaskId).toBeTruthy()
    })

    await test.step('reload mid-flow: reconnect-from-cursor re-renders the stream and approval', async () => {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
      // A slow local-token refresh can bounce the reload through the auth
      // redirect and land on /app — steer back to the v3 surface; the active
      // task id lives in sessionStorage, which survives same-tab navigation.
      await page.waitForTimeout(1500)
      if (!page.url().includes('/app/v3')) {
        await page.goto('/app/v3', { waitUntil: 'domcontentloaded', timeout: 60_000 })
      }
      // Event replay from cursor 0 re-renders the stream…
      await eventually(page.locator('[data-slot="task-stream"]')).toBeVisible()
      // …and the still-pending exact approval is restored from the
      // approval.requested event via GET /api/approvals/:id.
      const card = approvalCard(page)
      await eventually(card).toBeVisible()
      await eventually(card.getByText(DEMO_REPOSITORY, { exact: true })).toBeVisible()
      await eventually(card.getByText(DEMO_BRANCH, { exact: true })).toBeVisible()
    })

    await test.step('deny → zero publications, zero receipts', async () => {
      await approvalCard(page).locator('[data-slot="approval-deny"]').click()
      await eventually(approvalCard(page).getByText('Denied. Nothing was sent.')).toBeVisible({
        timeout: 45_000, // local stack under load can take >15s per API call
      })

      // No receipt chips in the UI…
      await eventually(page.locator('[data-slot="receipt-chip"]')).toHaveCount(0)
      // …and the receipts API confirms nothing was recorded for the task.
      expect(firstTaskId).toBeTruthy()
      expect(await receiptsFor(page, firstTaskId!)).toHaveLength(0)
    })

    let secondTaskId: string | null = null

    await test.step('re-request: run the golden goal again → fresh exact approval', async () => {
      await sendGoal(page, GOLDEN_GOAL)
      const card = approvalCard(page)
      await eventually(card).toBeVisible({ timeout: 60_000 })
      await eventually(card.getByText(DEMO_REPOSITORY, { exact: true })).toBeVisible()
      await eventually(card.locator('[data-slot="approval-approve"]')).toBeEnabled()

      secondTaskId = await activeTaskId(page)
      expect(secondTaskId).toBeTruthy()
      expect(secondTaskId).not.toBe(firstTaskId)
    })

    await test.step('approve → exactly-once publication, receipt chip, completed state', async () => {
      await approvalCard(page).locator('[data-slot="approval-approve"]').click()

      // Receipt chip renders from the receipt.created event…
      await eventually(page.locator('[data-slot="receipt-chip"]').first()).toBeVisible({
        timeout: 60_000,
      })
      // …and the stream reaches its completed closing state.
      await eventually(
        page.getByText('Done. The receipt below is the record of what happened.')
      ).toBeVisible()

      // Exactly one receipt for the approved task; still none for the denied one.
      expect(await receiptsFor(page, secondTaskId!)).toHaveLength(1)
      expect(await receiptsFor(page, firstTaskId!)).toHaveLength(0)
    })
  })
})
