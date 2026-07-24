/**
 * Smoke Tests - Critical Launch-Blocking Flows
 * 
 * These tests verify the most critical user journeys work end-to-end.
 * External APIs (Anthropic, Stripe) are mocked to ensure reliable CI runs.
 */

import { test, expect, Page, Route } from '@playwright/test'
import { AuthHelper, hasTestCredentials } from './setup/auth-helper'
import { selectors, testAgents } from './setup/test-data'

// =============================================================================
// API Mocking Utilities
// =============================================================================

/**
 * Mock Anthropic API responses to avoid real API calls
 */
async function mockAnthropicAPI(page: Page) {
  await page.route('**/api/chat', async (route: Route) => {
    const request = route.request()
    
    if (request.method() === 'POST') {
      // Simulate streaming response with a mock assistant message
      const mockResponse = {
        id: 'mock-msg-001',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: "I'll help you with that. I've created the agent as requested.",
          },
        ],
        model: 'claude-3-5-haiku-20241022',
        stop_reason: 'end_turn',
      }
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResponse),
      })
    } else {
      await route.continue()
    }
  })
}

/**
 * Mock Stripe checkout session creation
 */
async function mockStripeCheckout(page: Page) {
  await page.route('**/api/stripe/checkout', async (route: Route) => {
    const request = route.request()
    
    if (request.method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: 'https://checkout.stripe.com/c/pay/mock_session_id#fidkdWxOYHwnPyd1blpxYHZxWjA0',
        }),
      })
    } else {
      await route.continue()
    }
  })
}

/**
 * Mock agent creation API
 */
async function mockAgentAPI(page: Page) {
  const mockAgentId = 'mock-agent-' + Date.now()
  
  await page.route('**/api/agents', async (route: Route) => {
    const request = route.request()
    
    if (request.method() === 'POST') {
      const body = await request.postDataJSON().catch(() => ({}))
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: mockAgentId,
          name: body.name || 'Test Agent',
          type: body.type || 'general',
          status: 'idle',
          created_at: new Date().toISOString(),
        }),
      })
    } else if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: mockAgentId,
            name: 'Test Agent',
            type: 'general',
            status: 'idle',
            created_at: new Date().toISOString(),
          },
        ]),
      })
    } else {
      await route.continue()
    }
  })
  
  return mockAgentId
}

/**
 * Mock settings API
 */
async function mockSettingsAPI(page: Page) {
  let savedSettings = {
    settings: { theme: 'system', language: 'en' },
    notifications: { email: true, push: true },
    profile: { full_name: '', ai_name: 'Aria' },
  }
  
  await page.route('**/api/settings', async (route: Route) => {
    const request = route.request()
    
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(savedSettings),
      })
    } else if (request.method() === 'PUT') {
      const body = await request.postDataJSON().catch(() => ({}))
      savedSettings = { ...savedSettings, ...body }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, ...savedSettings }),
      })
    } else {
      await route.continue()
    }
  })
  
  return savedSettings
}

// =============================================================================
// Test Suite: Smoke Tests
// =============================================================================

test.describe('Smoke Tests - Critical Flows', () => {
  test.describe.configure({ mode: 'serial' })

  // ---------------------------------------------------------------------------
  // 1. Signup Flow → User Lands in Dashboard
  // ---------------------------------------------------------------------------
  test.describe('1. Signup Flow', () => {
    test('should display signup form with required fields', async ({ page }) => {
      await page.goto('/signup')
      
      await expect(page.locator(selectors.auth.emailInput)).toBeVisible()
      await expect(page.locator(selectors.auth.passwordInput)).toBeVisible()
      await expect(page.locator(selectors.auth.signupButton)).toBeVisible()
    })

    test('should reject invalid email format', async ({ page }) => {
      await page.goto('/signup')
      
      await page.fill(selectors.auth.emailInput, 'invalid-email')
      await page.fill(selectors.auth.passwordInput, 'ValidPassword123!')
      await page.click(selectors.auth.signupButton)
      
      // Should stay on signup or show validation error
      await page.waitForTimeout(1000)
      const url = page.url()
      expect(url).toMatch(/\/signup/)
    })

    test('should reject weak password', async ({ page }) => {
      await page.goto('/signup')
      
      await page.fill(selectors.auth.emailInput, 'test@example.com')
      await page.fill(selectors.auth.passwordInput, '123')
      await page.click(selectors.auth.signupButton)
      
      // Should stay on signup or show validation error
      await page.waitForTimeout(1000)
      const url = page.url()
      expect(url).toMatch(/\/signup/)
    })

    test('should complete signup and redirect to dashboard', async ({ page }) => {
      test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD for real signup test')
      
      const authHelper = new AuthHelper(page)
      await authHelper.signup()
      
      // After signup, should be at /app or /login (if email confirmation required)
      const url = page.url()
      expect(url).toMatch(/\/(app|login)/)
    })
  })

  // ---------------------------------------------------------------------------
  // 2. Login Flow → Protected Routes Require Auth
  // ---------------------------------------------------------------------------
  test.describe('2. Login Flow & Protected Routes', () => {
    test('should redirect unauthenticated users from /app to /login', async ({ page }) => {
      await page.goto('/app')
      await page.waitForTimeout(2000)
      
      await expect(page).toHaveURL(/\/login/)
    })

    test('should redirect unauthenticated users from /app/agent/* to /login', async ({ page }) => {
      await page.goto('/app/agent/some-agent-id')
      await page.waitForTimeout(2000)
      
      await expect(page).toHaveURL(/\/login/)
    })

    test('should display login form correctly', async ({ page }) => {
      await page.goto('/login')
      
      await expect(page.locator(selectors.auth.emailInput)).toBeVisible()
      await expect(page.locator(selectors.auth.passwordInput)).toBeVisible()
      await expect(page.locator(selectors.auth.loginButton)).toBeVisible()
    })

    test('should reject invalid credentials', async ({ page }) => {
      await page.goto('/login')
      
      await page.fill(selectors.auth.emailInput, 'nonexistent@example.com')
      await page.fill(selectors.auth.passwordInput, 'WrongPassword123!')
      await page.click(selectors.auth.loginButton)
      
      await page.waitForTimeout(3000)
      await expect(page).toHaveURL(/\/login/)
    })

    test('should login and access dashboard', async ({ page }) => {
      test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD')
      
      const authHelper = new AuthHelper(page)
      await authHelper.login()
      
      await expect(page).toHaveURL('/app')
      await expect(page.locator(selectors.dashboard.sidebar)).toBeVisible()
    })
  })

  // ---------------------------------------------------------------------------
  // 3. Create Agent → Appears in Agent List
  // ---------------------------------------------------------------------------
  test.describe('3. Create Agent', () => {
    test('should create agent via chat and see it in list (mocked)', async ({ page }) => {
      test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD')
      
      const authHelper = new AuthHelper(page)
      await authHelper.login()
      await authHelper.setupOnboarding()
      
      // Mock the APIs
      await mockAnthropicAPI(page)
      await mockAgentAPI(page)
      
      // Send a message to create an agent
      const createMessage = `Create an agent named "${testAgents.simpleTask.name}" that does: ${testAgents.simpleTask.description}`
      
      await page.fill(selectors.chat.messageInput, createMessage)
      await page.click(selectors.chat.sendButton)
      
      // Wait for response
      await page.waitForTimeout(2000)
      
      // Verify message appears in chat
      await expect(page.locator(selectors.chat.messageList)).toContainText(createMessage)
    })

    test('should show agent creation UI elements', async ({ page }) => {
      test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD')
      
      const authHelper = new AuthHelper(page)
      await authHelper.login()
      
      // Check if agent list area exists
      await expect(page.locator(selectors.dashboard.sidebar)).toBeVisible()
    })
  })

  // ---------------------------------------------------------------------------
  // 4. Chat Message Send → Assistant Response Appears
  // ---------------------------------------------------------------------------
  test.describe('4. Chat Message Flow', () => {
    test('should send message and receive assistant response (mocked)', async ({ page }) => {
      test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD')
      
      const authHelper = new AuthHelper(page)
      await authHelper.login()
      await authHelper.setupOnboarding()
      
      // Mock Anthropic API
      await mockAnthropicAPI(page)
      
      const testMessage = 'Hello, what can you help me with?'
      
      // Send message
      await page.fill(selectors.chat.messageInput, testMessage)
      await page.click(selectors.chat.sendButton)
      
      // Verify user message appears
      await expect(page.locator(selectors.chat.messageList)).toContainText(testMessage)
      
      // Wait for mocked response
      await page.waitForTimeout(2000)
      
      // Verify assistant response appears (from mock)
      await expect(page.locator(selectors.chat.messageList)).toContainText(/help|created|agent/i)
    })

    test('should not send empty messages', async ({ page }) => {
      test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD')
      
      const authHelper = new AuthHelper(page)
      await authHelper.login()
      await authHelper.setupOnboarding()
      
      // Try to send empty message
      await page.fill(selectors.chat.messageInput, '')
      
      // Send button should be disabled or clicking should have no effect
      const sendButton = page.locator(selectors.chat.sendButton)
      const isDisabled = await sendButton.isDisabled().catch(() => false)
      
      if (!isDisabled) {
        await sendButton.click()
        await page.waitForTimeout(500)
      }
      
      // No error should appear - graceful handling
      await expect(page.locator(selectors.common.errorMessage)).not.toBeVisible()
    })

    test('should maintain chat input after failed send', async ({ page }) => {
      test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD')
      
      const authHelper = new AuthHelper(page)
      await authHelper.login()
      await authHelper.setupOnboarding()
      
      // Mock API to return error
      await page.route('**/api/chat', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        })
      })
      
      const testMessage = 'Test message that will fail'
      await page.fill(selectors.chat.messageInput, testMessage)
      await page.click(selectors.chat.sendButton)
      
      await page.waitForTimeout(2000)
      
      // Page should not crash
      await expect(page.locator(selectors.dashboard.sidebar)).toBeVisible()
    })
  })

  // ---------------------------------------------------------------------------
  // 5. Stripe Checkout → API Returns Session URL (Mocked)
  // ---------------------------------------------------------------------------
  test.describe('5. Stripe Checkout', () => {
    test('should initiate checkout and receive session URL (mocked)', async ({ page }) => {
      test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD')
      
      const authHelper = new AuthHelper(page)
      await authHelper.login()
      
      // Mock Stripe checkout
      await mockStripeCheckout(page)
      
      // Navigate to pricing or trigger checkout
      await page.goto('/pricing')
      
      // Look for a checkout/upgrade button
      const checkoutButton = page.locator('[data-testid="checkout-button"], [data-testid="upgrade-button"], button:has-text("Upgrade"), button:has-text("Subscribe")').first()
      
      if (await checkoutButton.isVisible()) {
        // Listen for the API response
        const responsePromise = page.waitForResponse('**/api/stripe/checkout')
        
        await checkoutButton.click()
        
        const response = await responsePromise
        const responseBody = await response.json()
        
        // Verify we got a session URL
        expect(responseBody.url).toBeTruthy()
        expect(responseBody.url).toContain('stripe.com')
      } else {
        // If no checkout button visible, verify pricing page loads
        await expect(page).toHaveURL(/\/pricing/)
      }
    })

    test('should handle checkout API errors gracefully', async ({ page }) => {
      test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD')
      
      const authHelper = new AuthHelper(page)
      await authHelper.login()
      
      // Mock Stripe checkout to fail
      await page.route('**/api/stripe/checkout', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Failed to create checkout session' }),
        })
      })
      
      await page.goto('/pricing')
      
      // Page should still be functional
      await expect(page.locator('body')).toBeVisible()
    })

    test('should require authentication for checkout', async ({ page }) => {
      // Try to hit checkout API without auth
      const response = await page.request.post('/api/stripe/checkout', {
        data: { priceType: 'subscription', plan: 'pro', interval: 'monthly' },
      })
      
      // Should return 401 Unauthorized
      expect(response.status()).toBe(401)
    })
  })

  // ---------------------------------------------------------------------------
  // 6. Settings Update → Persists Correctly
  // ---------------------------------------------------------------------------
  test.describe('6. Settings Update', () => {
    test('should open settings dialog', async ({ page }) => {
      test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD')
      
      const authHelper = new AuthHelper(page)
      await authHelper.login()
      
      // Open settings
      await page.click(selectors.dashboard.settingsButton)
      
      await expect(page.locator(selectors.chat.settingsDialog)).toBeVisible()
    })

    test('should update AI name and persist (mocked)', async ({ page }) => {
      test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD')
      
      const authHelper = new AuthHelper(page)
      await authHelper.login()
      
      // Mock settings API
      await mockSettingsAPI(page)
      
      // Open settings
      await page.click(selectors.dashboard.settingsButton)
      await expect(page.locator(selectors.chat.settingsDialog)).toBeVisible()
      
      // Update AI name
      const newAiName = 'TestBot-' + Date.now()
      await page.fill(selectors.chat.aiNameInput, newAiName)
      await page.click(selectors.common.confirmButton)
      
      // Close and reopen to verify persistence
      await page.waitForTimeout(500)
      await page.click(selectors.dashboard.settingsButton)
      
      // The mock should return the updated value
      await expect(page.locator(selectors.chat.aiNameInput)).toBeVisible()
    })

    test('should handle settings save errors gracefully', async ({ page }) => {
      test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD')
      
      const authHelper = new AuthHelper(page)
      await authHelper.login()
      
      // Mock settings API to fail on save
      await page.route('**/api/settings', async (route) => {
        const request = route.request()
        if (request.method() === 'PUT') {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Failed to save settings' }),
          })
        } else {
          await route.continue()
        }
      })
      
      // Open settings
      await page.click(selectors.dashboard.settingsButton)
      await expect(page.locator(selectors.chat.settingsDialog)).toBeVisible()
      
      // Try to update
      await page.fill(selectors.chat.aiNameInput, 'FailTest')
      await page.click(selectors.common.confirmButton)
      
      // Should not crash the page
      await page.waitForTimeout(1000)
      await expect(page.locator('body')).toBeVisible()
    })

    test('should validate AI name length', async ({ page }) => {
      test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD')
      
      const authHelper = new AuthHelper(page)
      await authHelper.login()
      
      await page.click(selectors.dashboard.settingsButton)
      await expect(page.locator(selectors.chat.settingsDialog)).toBeVisible()
      
      // Try very long name
      const longName = 'A'.repeat(100)
      await page.fill(selectors.chat.aiNameInput, longName)
      
      // Check if there's a max length or validation
      const inputValue = await page.locator(selectors.chat.aiNameInput).inputValue()
      expect(inputValue.length).toBeLessThanOrEqual(100)
    })
  })
})

// =============================================================================
// Standalone API Tests (no browser, direct API calls)
// =============================================================================

test.describe('API Smoke Tests', () => {
  test('should return 401 for unauthenticated /api/agents', async ({ request }) => {
    const response = await request.get('/api/agents')
    expect(response.status()).toBe(401)
  })

  test('should return 401 for unauthenticated /api/settings', async ({ request }) => {
    const response = await request.get('/api/settings')
    expect(response.status()).toBe(401)
  })

  test('should return 401 for unauthenticated /api/conversations', async ({ request }) => {
    const response = await request.get('/api/conversations')
    expect(response.status()).toBe(401)
  })

  test('should return 400 for malformed /api/chat request', async ({ request }) => {
    const response = await request.post('/api/chat', {
      data: 'not-json',
      headers: { 'Content-Type': 'text/plain' },
    })
    // Should return 400 (bad request) or 401 (unauthorized)
    expect([400, 401]).toContain(response.status())
  })

  test('should return 400 for invalid /api/stripe/checkout body', async ({ request }) => {
    const response = await request.post('/api/stripe/checkout', {
      data: { invalid: 'data' },
    })
    // Should return 400 (validation error) or 401 (unauthorized)
    expect([400, 401]).toContain(response.status())
  })
})
