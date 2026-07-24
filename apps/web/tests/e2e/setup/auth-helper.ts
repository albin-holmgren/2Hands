import { Page } from '@playwright/test'
import { testUsers, selectors } from './test-data'

// Check if real test credentials are configured
export const hasTestCredentials = () => {
  return !!process.env.TEST_USER_EMAIL && !!process.env.TEST_USER_PASSWORD
}

export class AuthHelper {
  constructor(private page: Page) {}

  async login(userType: 'validUser' | 'newUser' = 'validUser') {
    const user = testUsers[userType]
    
    await this.page.goto('/login')
    
    // Click "Continue with email" to reveal the email form
    await this.page.waitForSelector(selectors.auth.continueWithEmail, { timeout: 5000 })
    await this.page.click(selectors.auth.continueWithEmail)
    
    // Wait for form to appear and fill it
    await this.page.waitForSelector(selectors.auth.emailInput, { timeout: 5000 })
    await this.page.fill(selectors.auth.emailInput, user.email)
    await this.page.fill(selectors.auth.passwordInput, user.password)
    
    await this.page.click(selectors.auth.loginButton)
    
    // Wait for either redirect to app OR error message
    try {
      await this.page.waitForURL('/app', { timeout: 10000 })
    } catch {
      // Check if we got an error message instead
      const errorVisible = await this.page.locator(selectors.common.errorMessage).isVisible().catch(() => false)
      if (errorVisible) {
        throw new Error('Login failed - invalid credentials or user does not exist')
      }
      // Check if we're still on login page (auth error shown via toast)
      const currentUrl = this.page.url()
      if (currentUrl.includes('/login')) {
        throw new Error('Login failed - check TEST_USER_EMAIL and TEST_USER_PASSWORD env vars')
      }
      throw new Error('Login timeout - unexpected state')
    }
  }

  async signup() {
    const user = testUsers.newUser
    
    await this.page.goto('/signup')
    
    // Click "Continue with email" to reveal the email form
    await this.page.waitForSelector(selectors.auth.continueWithEmail, { timeout: 5000 })
    await this.page.click(selectors.auth.continueWithEmail)
    
    // Wait for form to appear and fill it
    await this.page.waitForSelector(selectors.auth.emailInput, { timeout: 5000 })
    await this.page.fill(selectors.auth.emailInput, user.email)
    await this.page.fill(selectors.auth.passwordInput, user.password)
    await this.page.click(selectors.auth.signupButton)
    
    // Signup may redirect to login (email confirmation) or app
    await Promise.race([
      this.page.waitForURL('/app', { timeout: 15000 }),
      this.page.waitForURL('/login', { timeout: 15000 }),
    ])
  }

  async logout() {
    await this.page.click(selectors.dashboard.userMenu)
    await this.page.click(selectors.auth.logoutButton)
    await this.page.waitForURL('/login')
  }

  async setupOnboarding() {
    try {
      await this.page.waitForSelector(selectors.chat.aiNameInput, { timeout: 3000 })
      await this.page.fill(selectors.chat.aiNameInput, testUsers.newUser.aiName)
      await this.page.click(selectors.common.confirmButton)
    } catch {
      // Onboarding not required or already completed
    }
  }

  // Check if currently logged in
  async isLoggedIn(): Promise<boolean> {
    try {
      await this.page.goto('/app')
      await this.page.waitForTimeout(1000)
      return !this.page.url().includes('/login')
    } catch {
      return false
    }
  }
}
