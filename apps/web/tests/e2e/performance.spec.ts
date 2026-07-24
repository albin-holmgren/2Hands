import { test, expect } from '@playwright/test'
import { AuthHelper, hasTestCredentials } from './setup/auth-helper'

test.describe('Performance Tests', () => {
  test('should load dashboard within acceptable time', async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Skipping - TEST_USER_EMAIL and TEST_USER_PASSWORD env vars required')
    const authHelper = new AuthHelper(page)
    
    const startTime = Date.now()
    await authHelper.login()
    const loadTime = Date.now() - startTime
    
    expect(loadTime).toBeLessThan(5000)
    
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible()
    await expect(page.locator('[data-testid="create-agent-button"]')).toBeVisible()
  })

  test('should handle large message history efficiently', async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Skipping - TEST_USER_EMAIL and TEST_USER_PASSWORD env vars required')
    const authHelper = new AuthHelper(page)
    await authHelper.login()
    
    for (let i = 0; i < 20; i++) {
      await page.fill('[data-testid="chat-input"]', `Message ${i}`)
      await page.click('[data-testid="send-button"]')
      await page.waitForTimeout(100)
    }
    
    await expect(page.locator('[data-testid="message-list"]')).toBeVisible()
  })
})
