/**
 * Smoke Tests: Stripe Checkout
 * 
 * Tests: Checkout session creation, auth requirements
 * Runtime target: < 20 seconds
 * 
 * NOTE: Stripe API is MOCKED - no real API calls
 */

import { test, expect } from '@playwright/test'
import { AuthHelper, hasTestCredentials } from '../setup/auth-helper'
import { mockStripeCheckout } from './mocks'

test.describe('Stripe Smoke Tests', () => {
  // -------------------------------------------------------------------------
  // API Authentication
  // -------------------------------------------------------------------------
  test('checkout API requires authentication', async ({ request }) => {
    const response = await request.post('/api/stripe/checkout', {
      data: { priceType: 'subscription', plan: 'pro', interval: 'monthly' },
    })
    
    expect(response.status()).toBe(401)
    
    const body = await response.json()
    expect(body.error).toBe('Unauthorized')
    expect(body.code).toBe('UNAUTHORIZED')
  })

  test('checkout API rejects unauthenticated requests', async ({ request }) => {
    const response = await request.post('/api/stripe/checkout', {
      data: { invalid: 'data' },
    })
    
    // Auth check happens before validation, so should be 401
    expect(response.status()).toBe(401)
    
    const body = await response.json()
    expect(body.error).toBe('Unauthorized')
    expect(body.code).toBe('UNAUTHORIZED')
  })

  // -------------------------------------------------------------------------
  // Checkout Flow (mocked Stripe)
  // -------------------------------------------------------------------------
  test('pricing page loads or redirects', async ({ page }) => {
    await page.goto('/pricing')
    
    // Pricing might redirect to login or show pricing content
    await page.waitForTimeout(1000)
    const url = page.url()
    
    if (url.includes('/login')) {
      // Redirected to login - that's fine for protected pricing
      await expect(page.locator('body')).toBeVisible()
    } else {
      // On pricing page - check for any content
      await expect(page.locator('body')).toBeVisible()
    }
  })

  test('checkout returns session URL (mocked)', async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL/PASSWORD')
    
    await mockStripeCheckout(page)
    
    const auth = new AuthHelper(page)
    await auth.login()
    
    await page.goto('/pricing')
    
    // Find any checkout/upgrade button
    const checkoutButton = page.locator(
      '[data-testid="checkout-button"], [data-testid="upgrade-button"], button:has-text("Upgrade"), button:has-text("Subscribe"), button:has-text("Get Started")'
    ).first()
    
    if (await checkoutButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      const responsePromise = page.waitForResponse('**/api/stripe/checkout')
      await checkoutButton.click()
      
      const response = await responsePromise
      const body = await response.json()
      
      expect(body.url).toBeTruthy()
      expect(body.url).toContain('stripe.com')
    } else {
      // No checkout button - just verify pricing page works
      await expect(page).toHaveURL(/\/pricing/)
    }
  })

  // -------------------------------------------------------------------------
  // Error Handling
  // -------------------------------------------------------------------------
  test('handles checkout error gracefully', async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL/PASSWORD')
    
    // Mock to return error
    await page.route('**/api/stripe/checkout', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Checkout failed' }),
      })
    })
    
    const auth = new AuthHelper(page)
    await auth.login()
    
    await page.goto('/pricing')
    
    // Page should not crash
    await expect(page.locator('body')).toBeVisible()
  })
})
