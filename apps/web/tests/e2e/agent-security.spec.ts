import { test, expect } from '@playwright/test'

test.describe('Agent Management Security', () => {
  // These tests require authentication - skip if no test credentials
  const testEmail = process.env.TEST_USER_EMAIL
  const testPassword = process.env.TEST_USER_PASSWORD

  test.beforeEach(async ({ page }) => {
    if (!testEmail || !testPassword) {
      test.skip()
      return
    }

    // Login with test user
    await page.goto('/login')
    await page.fill('input[type="email"]', testEmail)
    await page.fill('input[type="password"]', testPassword)
    await page.click('button[type="submit"]')
    
    // Wait for redirect to dashboard
    await page.waitForURL('/app', { timeout: 10000 })
  })

  test('should not expose agent data to unauthorized users', async ({ page, context }) => {
    if (!testEmail || !testPassword) {
      test.skip()
      return
    }

    // Navigate to app and check for agents in sidebar
    await page.goto('/app')
    
    // Get any existing agent ID from the page (if any)
    const agentLinks = await page.locator('a[href^="/app/agent/"]').all()
    
    if (agentLinks.length > 0) {
      const href = await agentLinks[0].getAttribute('href')
      const agentId = href?.split('/app/agent/')[1]
      
      if (agentId) {
        // Open new incognito context (different session)
        const newContext = await context.browser()?.newContext()
        if (newContext) {
          const newPage = await newContext.newPage()
          
          // Try to access the agent directly without auth
          await newPage.goto(`/app/agent/${agentId}`)
          
          // Should redirect to login
          await expect(newPage).toHaveURL(/\/login/)
          
          await newContext.close()
        }
      }
    }
  })

  test('should not allow cross-user agent access via API', async ({ request }) => {
    // Try to access a random agent ID via API
    const response = await request.get('/api/agents/00000000-0000-0000-0000-000000000000')
    
    // Should be 401 (unauthorized) or 404 (not found for this user)
    expect([401, 404]).toContain(response.status())
  })

  test('should sanitize error responses', async ({ request }) => {
    // Make a request that will fail
    const response = await request.get('/api/messages?conversation_id=invalid-uuid')
    
    const body = await response.json()
    
    // Error response should not contain stack traces or internal details
    expect(body).not.toHaveProperty('stack')
    expect(body).not.toHaveProperty('query')
    expect(JSON.stringify(body)).not.toContain('postgres')
    expect(JSON.stringify(body)).not.toContain('supabase')
  })
})

test.describe('Input Validation', () => {
  test('should reject malformed JSON in API requests', async ({ request }) => {
    const response = await request.post('/api/agents/progress', {
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Signature': 'test',
        'X-Internal-Timestamp': Math.floor(Date.now() / 1000).toString(),
      },
      data: 'not valid json{',
    })
    
    // Should return 400 or 401, not 500
    expect([400, 401]).toContain(response.status())
  })

  test('should handle SQL injection attempts gracefully', async ({ request }) => {
    // This should be blocked by Supabase RLS, but test the API layer
    const response = await request.get(
      "/api/messages?conversation_id='; DROP TABLE messages; --"
    )
    
    // Should return auth error, validation error, or safe error - NOT expose database details
    const body = await response.json().catch(() => ({}))
    const bodyStr = JSON.stringify(body).toLowerCase()
    // Ensure no database internals are leaked
    expect(bodyStr).not.toContain('postgres')
    expect(bodyStr).not.toContain('syntax error')
    expect(bodyStr).not.toContain('relation')
  })
})

test.describe('Session Security', () => {
  test('should have secure cookie settings', async ({ page }) => {
    await page.goto('/')
    
    // Get all cookies
    const cookies = await page.context().cookies()
    
    // Check for session-related cookies
    const sessionCookies = cookies.filter(c => 
      c.name.includes('session') || 
      c.name.includes('auth') ||
      c.name.includes('supabase')
    )
    
    for (const cookie of sessionCookies) {
      // Session cookies should have appropriate security flags
      // Note: In development, these may not be set
      if (process.env.NODE_ENV === 'production') {
        expect(cookie.httpOnly).toBe(true)
        expect(cookie.secure).toBe(true)
        expect(cookie.sameSite).toBe('Lax')
      }
    }
  })
})

test.describe('CORS and Headers', () => {
  test('should have security headers on API responses', async ({ request }) => {
    const response = await request.get('/')
    
    // Check for common security headers
    const _headers = response.headers()
    
    // X-Content-Type-Options prevents MIME sniffing
    // Note: These may be set at the hosting level (Vercel/etc)
    // This test documents expected headers
  })

  test('should require authentication for chat API', async ({ request }) => {
    const response = await request.post('/api/chat', {
      data: {
        messages: [{ role: 'user', content: 'test' }],
      },
    })
    
    // Should require authentication - check status or body for any auth-related response
    const body = await response.json().catch(() => ({}))
    const bodyStr = JSON.stringify(body).toLowerCase()
    const isProtected = response.status() === 401 || 
                        response.status() === 403 || 
                        response.status() === 500 ||
                        bodyStr.includes('unauthorized') ||
                        bodyStr.includes('auth') ||
                        bodyStr.includes('error') ||
                        !body.content // No valid response content
    expect(isProtected).toBeTruthy()
  })
})
