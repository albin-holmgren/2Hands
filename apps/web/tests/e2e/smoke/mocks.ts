/**
 * API Mock Utilities for E2E Smoke Tests
 * 
 * Mocks external APIs (Anthropic, Stripe) to ensure:
 * - No real API calls in CI
 * - Fast, reliable test execution
 * - Predictable responses
 */

import { Page, Route } from '@playwright/test'

// =============================================================================
// Anthropic API Mock
// =============================================================================

export async function mockAnthropicAPI(page: Page) {
  await page.route('**/api/chat', async (route: Route) => {
    const request = route.request()
    
    if (request.method() === 'POST') {
      // Return mock streaming-like response
      const mockResponse = {
        id: 'mock-msg-' + Date.now(),
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: "I'll help you with that. I've processed your request successfully.",
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

// =============================================================================
// Stripe API Mock
// =============================================================================

export async function mockStripeCheckout(page: Page) {
  await page.route('**/api/stripe/checkout', async (route: Route) => {
    const request = route.request()
    
    if (request.method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: 'https://checkout.stripe.com/c/pay/cs_test_mock_session_' + Date.now(),
        }),
      })
    } else {
      await route.continue()
    }
  })
}

export async function mockStripeWebhook(page: Page) {
  await page.route('**/api/stripe/webhook', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ received: true }),
    })
  })
}

// =============================================================================
// Agent API Mock
// =============================================================================

export async function mockAgentAPI(page: Page) {
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
          name: body.name || 'Mock Agent',
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
            name: 'Mock Agent',
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

// =============================================================================
// Settings API Mock
// =============================================================================

export async function mockSettingsAPI(page: Page) {
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
// Messages API Mock
// =============================================================================

export async function mockMessagesAPI(page: Page) {
  const messages: Array<{ id: string; role: string; content: string; created_at: string }> = []
  
  await page.route('**/api/messages*', async (route: Route) => {
    const request = route.request()
    
    if (request.method() === 'POST') {
      const body = await request.postDataJSON().catch(() => ({}))
      const newMessage = {
        id: 'msg-' + Date.now(),
        role: body.role || 'user',
        content: body.content || '',
        created_at: new Date().toISOString(),
      }
      messages.push(newMessage)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newMessage),
      })
    } else if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(messages),
      })
    } else {
      await route.continue()
    }
  })
}

// =============================================================================
// Conversations API Mock
// =============================================================================

export async function mockConversationsAPI(page: Page) {
  const mockConversationId = 'conv-' + Date.now()
  
  await page.route('**/api/conversations*', async (route: Route) => {
    const request = route.request()
    
    if (request.method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: mockConversationId,
          title: 'AI Manager',
          created_at: new Date().toISOString(),
        }),
      })
    } else if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: mockConversationId,
            title: 'AI Manager',
            created_at: new Date().toISOString(),
          },
        ]),
      })
    } else {
      await route.continue()
    }
  })
  
  return mockConversationId
}

// =============================================================================
// Mock All External APIs (convenience function)
// =============================================================================

export async function mockAllExternalAPIs(page: Page) {
  await mockAnthropicAPI(page)
  await mockStripeCheckout(page)
  await mockStripeWebhook(page)
}
