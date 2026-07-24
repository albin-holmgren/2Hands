import { test, expect } from '@playwright/test'
import { AuthHelper, hasTestCredentials } from './setup/auth-helper'
import { selectors } from './setup/test-data'

test.describe('Authentication Flow', () => {
  let authHelper: AuthHelper

  test.beforeEach(async ({ page }) => {
    authHelper = new AuthHelper(page)
  })

  // Tests that require valid credentials
  test('should login with valid credentials', async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Skipping - TEST_USER_EMAIL and TEST_USER_PASSWORD env vars required')
    await authHelper.login()
    
    await expect(page).toHaveURL('/app')
    await expect(page.locator(selectors.dashboard.sidebar)).toBeVisible()
  })

  // Tests that work without real credentials
  test('should show login form elements', async ({ page }) => {
    await page.goto('/login')
    
    await expect(page.locator(selectors.auth.emailInput)).toBeVisible()
    await expect(page.locator(selectors.auth.passwordInput)).toBeVisible()
    await expect(page.locator(selectors.auth.loginButton)).toBeVisible()
  })

  test('should stay on login page with invalid credentials', async ({ page }) => {
    await page.goto('/login')
    await page.fill(selectors.auth.emailInput, 'invalid@example.com')
    await page.fill(selectors.auth.passwordInput, 'wrongpassword')
    await page.click(selectors.auth.loginButton)
    
    // Wait for response - should stay on login or show error
    await page.waitForTimeout(3000)
    await expect(page).toHaveURL(/\/login/)
  })

  test('should redirect to login when accessing protected routes', async ({ page }) => {
    await page.goto('/app')
    await page.waitForTimeout(2000)
    await expect(page).toHaveURL(/\/login/)
  })

  test('should show signup form elements', async ({ page }) => {
    await page.goto('/signup')
    
    await expect(page.locator(selectors.auth.emailInput)).toBeVisible()
    await expect(page.locator(selectors.auth.passwordInput)).toBeVisible()
    await expect(page.locator(selectors.auth.signupButton)).toBeVisible()
  })

  test('should logout successfully', async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Skipping - TEST_USER_EMAIL and TEST_USER_PASSWORD env vars required')
    await authHelper.login()
    await authHelper.logout()
    
    await expect(page).toHaveURL('/login')
  })
})
