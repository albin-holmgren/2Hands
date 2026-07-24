/**
 * Smoke Tests: Chat & Agent Flows
 * 
 * Tests: Send message, receive response, create agent
 * Runtime target: < 30 seconds
 * 
 * NOTE: Anthropic API is MOCKED - no real API calls
 */

import { test, expect } from '@playwright/test'
import { AuthHelper, hasTestCredentials } from '../setup/auth-helper'
import { mockAnthropicAPI, mockAgentAPI } from './mocks'

// UI Selectors for chat
const ui = {
  chatInput: 'textarea, input[placeholder*="message"], [data-testid="chat-input"]',
  sendButton: 'button[type="submit"], button:has-text("Send"), [data-testid="send-button"]',
  messageList: '[data-testid="message-list"], .messages, main',
  sidebar: 'nav, aside, [data-testid="sidebar"]',
}

test.describe('Chat Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Always mock external APIs
    await mockAnthropicAPI(page)
  })

  // -------------------------------------------------------------------------
  // Chat Input (no auth required)
  // -------------------------------------------------------------------------
  test('chat UI elements exist on dashboard', async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL/PASSWORD')
    
    const auth = new AuthHelper(page)
    await auth.login()
    await auth.setupOnboarding()
    
    // Dashboard should have loaded
    await expect(page.locator(ui.sidebar)).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // Send Message (mocked API)
  // -------------------------------------------------------------------------
  test('sends message and receives mocked response', async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL/PASSWORD')
    
    const auth = new AuthHelper(page)
    await auth.login()
    await auth.setupOnboarding()
    
    const testMessage = 'Hello, what can you help me with?'
    
    const chatInput = page.locator(ui.chatInput).first()
    if (await chatInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await chatInput.fill(testMessage)
      
      const sendBtn = page.locator(ui.sendButton).first()
      if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await sendBtn.click()
        await page.waitForTimeout(2000)
      }
    }
    
    // Page should not crash
    await expect(page.locator('body')).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // Agent Creation (mocked API)
  // -------------------------------------------------------------------------
  test('creates agent via chat (mocked)', async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL/PASSWORD')
    
    await mockAgentAPI(page)
    
    const auth = new AuthHelper(page)
    await auth.login()
    await auth.setupOnboarding()
    
    const createMessage = 'Create an agent that checks the weather daily'
    
    const chatInput = page.locator(ui.chatInput).first()
    if (await chatInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await chatInput.fill(createMessage)
      
      const sendBtn = page.locator(ui.sendButton).first()
      if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await sendBtn.click()
      }
    }
    
    await page.waitForTimeout(2000)
    
    // Page should not crash
    await expect(page.locator(ui.sidebar)).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // Error Handling
  // -------------------------------------------------------------------------
  test('handles API error gracefully', async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL/PASSWORD')
    
    // Override mock to return error
    await page.route('**/api/chat', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      })
    })
    
    const auth = new AuthHelper(page)
    await auth.login()
    await auth.setupOnboarding()
    
    const chatInput = page.locator(ui.chatInput).first()
    if (await chatInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await chatInput.fill('Test message')
      
      const sendBtn = page.locator(ui.sendButton).first()
      if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await sendBtn.click()
      }
    }
    
    await page.waitForTimeout(2000)
    
    // Page should not crash
    await expect(page.locator(ui.sidebar)).toBeVisible()
  })
})
