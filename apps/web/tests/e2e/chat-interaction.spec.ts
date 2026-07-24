import { test, expect } from '@playwright/test'
import { AuthHelper, hasTestCredentials } from './setup/auth-helper'
import { selectors } from './setup/test-data'

test.describe('Chat Interaction', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Skipping - TEST_USER_EMAIL and TEST_USER_PASSWORD env vars required')
    const authHelper = new AuthHelper(page)
    await authHelper.login()
    await authHelper.setupOnboarding()
  })

  test('should send and receive chat messages', async ({ page }) => {
    const testMessage = 'Create an agent that checks the weather'
    
    await page.fill(selectors.chat.messageInput, testMessage)
    await page.click(selectors.chat.sendButton)
    
    await expect(page.locator(selectors.chat.messageList)).toContainText(testMessage)
    
    await expect(page.locator(selectors.chat.messageList)).toContainText(/I'll help you create/i, { timeout: 15000 })
  })

  test('should handle message sending errors', async ({ page }) => {
    await page.fill(selectors.chat.messageInput, '')
    await page.click(selectors.chat.sendButton)
    
    await expect(page.locator(selectors.common.errorMessage)).not.toBeVisible()
    
    const longMessage = 'A'.repeat(5000)
    await page.fill(selectors.chat.messageInput, longMessage)
    await page.click(selectors.chat.sendButton)
    
    await page.waitForTimeout(2000)
  })

  test('should maintain chat history across sessions', async ({ page }) => {
    const testMessage = 'Remember this message for later'
    
    await page.fill(selectors.chat.messageInput, testMessage)
    await page.click(selectors.chat.sendButton)
    
    await expect(page.locator(selectors.chat.messageList)).toContainText(testMessage)
    
    await page.reload()
    
    await expect(page.locator(selectors.chat.messageList)).toContainText(testMessage)
  })

  test('should update AI name in settings', async ({ page }) => {
    const newAiName = 'CustomAssistant'
    
    await page.click(selectors.dashboard.settingsButton)
    await expect(page.locator(selectors.chat.settingsDialog)).toBeVisible()
    
    await page.fill(selectors.chat.aiNameInput, newAiName)
    await page.click(selectors.common.confirmButton)
    
    await expect(page.locator(selectors.chat.settingsDialog)).not.toBeVisible()
    
    await page.click(selectors.dashboard.settingsButton)
    await expect(page.locator(selectors.chat.aiNameInput)).toHaveValue(newAiName)
  })
})
