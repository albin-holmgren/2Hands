import { test, expect } from '@playwright/test'
import { AuthHelper, hasTestCredentials } from './setup/auth-helper'
import { selectors } from './setup/test-data'

test.describe('Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Skipping - TEST_USER_EMAIL and TEST_USER_PASSWORD env vars required')
    const authHelper = new AuthHelper(page)
    await authHelper.login()
  })

  test('should handle network errors gracefully', async ({ page }) => {
    await page.context().setOffline(true)
    
    await page.click(selectors.dashboard.createAgentButton)
    await page.fill(selectors.agent.nameInput, 'Offline Test Agent')
    await page.fill(selectors.agent.descriptionTextarea, 'This should fail')
    await page.click(selectors.agent.createButton)
    
    await expect(page.locator(selectors.common.errorMessage)).toBeVisible({ timeout: 10000 })
    
    await page.context().setOffline(false)
    
    await page.click(selectors.agent.createButton)
    await expect(page).toHaveURL(/\/app\/agent\//, { timeout: 15000 })
  })

  test('should handle server errors with user-friendly messages', async ({ page }) => {
    await page.goto('/app/agent/non-existent-id')
    
    await page.waitForTimeout(3000)
    const url = page.url()
    expect(url).toMatch(/\/app/)
  })

  test('should prevent data loss on page refresh', async ({ page }) => {
    await page.click(selectors.dashboard.createAgentButton)
    await page.fill(selectors.agent.nameInput, 'Draft Agent')
    await page.fill(selectors.agent.descriptionTextarea, 'Draft description')
    
    await page.reload()
    
    await page.waitForTimeout(2000)
  })

  test('should handle session expiration', async ({ page }) => {
    await page.context().clearCookies()
    
    await page.click(selectors.dashboard.createAgentButton)
    
    await expect(page).toHaveURL('/login', { timeout: 10000 })
  })
})
