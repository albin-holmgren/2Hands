import { test, expect } from '@playwright/test'
import { AuthHelper, hasTestCredentials } from './setup/auth-helper'
import { selectors } from './setup/test-data'

test.describe('Navigation Flow', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Skipping - TEST_USER_EMAIL and TEST_USER_PASSWORD env vars required')
    const authHelper = new AuthHelper(page)
    await authHelper.login()
  })

  test('should navigate through main UI sections', async ({ page }) => {
    await expect(page).toHaveURL('/app')
    
    await page.click(selectors.dashboard.pricingButton)
    await expect(page).toHaveURL('/pricing')
    await expect(page.locator('h1')).toContainText(/pricing/i)
    
    await page.click(selectors.dashboard.sidebar)
    await expect(page).toHaveURL('/app')
    
    await page.click(selectors.dashboard.settingsButton)
    await expect(page.locator(selectors.chat.settingsDialog)).toBeVisible()
    
    await page.click(selectors.common.cancelButton)
    await expect(page.locator(selectors.chat.settingsDialog)).not.toBeVisible()
  })

  test('should handle browser back/forward navigation', async ({ page }) => {
    await page.click(selectors.dashboard.pricingButton)
    await expect(page).toHaveURL('/pricing')
    
    await page.goBack()
    await expect(page).toHaveURL('/app')
    
    await page.goForward()
    await expect(page).toHaveURL('/pricing')
  })

  test('should maintain responsive design on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    
    const sidebar = page.locator(selectors.dashboard.sidebar)
    
    await expect(sidebar).toBeVisible()
    
    const createButton = page.locator(selectors.dashboard.createAgentButton)
    await expect(createButton).toBeVisible()
  })

  test('should handle deep links correctly', async ({ page }) => {
    const mockAgentId = 'test-agent-123'
    
    await page.goto(`/app/agent/${mockAgentId}`)
    
    const url = page.url()
    expect(url).toMatch(/\/app/)
  })
})
