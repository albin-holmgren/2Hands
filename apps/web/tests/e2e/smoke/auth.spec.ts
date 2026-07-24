/**
 * Smoke Tests: Authentication Flows
 * 
 * Tests: Signup, Login, Protected Routes
 * Runtime target: < 30 seconds
 */

import { test, expect } from '@playwright/test'
import { AuthHelper, hasTestCredentials } from '../setup/auth-helper'

// UI Selectors (matching actual components - case-sensitive!)
const ui = {
  continueWithEmail: 'button:has-text("Continue with email")',
  continueWithGoogle: 'button:has-text("Continue with Google")',
  emailInput: 'input[type="email"]',
  passwordInput: 'input[type="password"]',
  signInButton: 'button[type="submit"]:has-text("Sign in")',
  createAccountButton: 'button[type="submit"]:has-text("Create account")',
  backToOptions: 'button:has-text("Back to options")',
}

test.describe('Auth Smoke Tests', () => {
  // -------------------------------------------------------------------------
  // Signup Flow
  // -------------------------------------------------------------------------
  test('signup page loads with OAuth options', async ({ page }) => {
    await page.goto('/signup')
    
    // OAuth buttons should be visible immediately
    await expect(page.locator(ui.continueWithGoogle)).toBeVisible()
    await expect(page.locator(ui.continueWithEmail)).toBeVisible()
  })

  test('signup email form appears on click', async ({ page }) => {
    await page.goto('/signup')
    
    await page.click(ui.continueWithEmail)
    
    // Form should now be visible
    await expect(page.locator(ui.emailInput)).toBeVisible()
    await expect(page.locator(ui.passwordInput)).toBeVisible()
    await expect(page.locator(ui.createAccountButton)).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // Login Flow
  // -------------------------------------------------------------------------
  test('login page loads with OAuth options', async ({ page }) => {
    await page.goto('/login')
    
    await expect(page.locator(ui.continueWithGoogle)).toBeVisible()
    await expect(page.locator(ui.continueWithEmail)).toBeVisible()
  })

  test('login email form appears on click', async ({ page }) => {
    await page.goto('/login')
    
    await page.click(ui.continueWithEmail)
    
    await expect(page.locator(ui.emailInput)).toBeVisible()
    await expect(page.locator(ui.passwordInput)).toBeVisible()
    await expect(page.locator(ui.signInButton)).toBeVisible()
  })

  test('login rejects invalid credentials', async ({ page }) => {
    await page.goto('/login')
    
    await page.click(ui.continueWithEmail)
    await page.fill(ui.emailInput, 'nonexistent@example.com')
    await page.fill(ui.passwordInput, 'WrongPassword123!')
    await page.click(ui.signInButton)
    
    // Should stay on login (error toast shown)
    await page.waitForTimeout(2000)
    expect(page.url()).toMatch(/\/login/)
  })

  // -------------------------------------------------------------------------
  // Protected Routes
  // -------------------------------------------------------------------------
  test('unauthenticated /app redirects to login', async ({ page }) => {
    await page.goto('/app')
    await page.waitForTimeout(2000)
    
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated /app/agent/* redirects to login', async ({ page }) => {
    await page.goto('/app/agent/some-id')
    await page.waitForTimeout(2000)
    
    await expect(page).toHaveURL(/\/login/)
  })

  // -------------------------------------------------------------------------
  // Authenticated Tests (skip if no credentials)
  // -------------------------------------------------------------------------
  test('login succeeds with valid credentials', async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL/PASSWORD')
    
    const auth = new AuthHelper(page)
    await auth.login()
    
    await expect(page).toHaveURL('/app')
    // Dashboard should have loaded (any main content)
    await expect(page.locator('main, [data-testid="sidebar"], nav')).toBeVisible()
  })

  test('logout redirects to login', async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Requires TEST_USER_EMAIL/PASSWORD')
    
    const auth = new AuthHelper(page)
    await auth.login()
    await auth.logout()
    
    await expect(page).toHaveURL(/\/login/)
  })
})
