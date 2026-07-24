import { faker } from '@faker-js/faker'

// Use environment variables with fallbacks for local development
const TEST_EMAIL = process.env.TEST_USER_EMAIL || 'test@2hands-e2e.local'
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'TestPassword123!'

export const testUsers = {
  validUser: {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  },
  newUser: {
    email: faker.internet.email(),
    password: 'TestPassword123!',
    aiName: faker.person.firstName(),
  }
}

export const testAgents = {
  simpleTask: {
    name: 'Test Agent - Simple Task',
    description: 'Open Google and search for "Playwright testing"',
  },
  complexTask: {
    name: 'Test Agent - Complex Task', 
    description: 'Navigate to GitHub, find the trending repositories, and take a screenshot of the top 5',
  },
  scheduledTask: {
    name: 'Test Agent - Scheduled',
    description: 'Check weather forecast daily at 9 AM',
    cronExpression: '0 9 * * *',
  }
}

export const selectors = {
  auth: {
    // Actual UI selectors (no data-testid attributes in current components)
    continueWithEmail: 'button:has-text("Continue with email")',
    emailInput: 'input[type="email"]',
    passwordInput: 'input[type="password"]',
    loginButton: 'button[type="submit"]:has-text("Sign in")',
    signupButton: 'button[type="submit"]:has-text("Create account")',
    logoutButton: 'button:has-text("Log out"), button:has-text("Sign out")',
    googleLoginButton: 'button:has-text("Continue with Google")',
  },
  dashboard: {
    sidebar: '[data-testid="sidebar"]',
    agentList: '[data-testid="agent-list"]',
    createAgentButton: '[data-testid="create-agent-button"]',
    userMenu: '[data-testid="user-menu"]',
    settingsButton: '[data-testid="settings-button"]',
    pricingButton: '[data-testid="pricing-button"]',
  },
  pricing: {
    checkoutButton: '[data-testid="checkout-button"]',
    upgradeButton: '[data-testid="upgrade-button"]',
    planCard: '[data-testid="plan-card"]',
    starterPlan: '[data-testid="plan-starter"]',
    proPlan: '[data-testid="plan-pro"]',
    businessPlan: '[data-testid="plan-business"]',
  },
  agent: {
    nameInput: '[data-testid="agent-name-input"]',
    descriptionTextarea: '[data-testid="agent-description-textarea"]',
    createButton: '[data-testid="create-button"]',
    saveButton: '[data-testid="save-button"]',
    startButton: '[data-testid="start-agent-button"]',
    stopButton: '[data-testid="stop-agent-button"]',
    deleteButton: '[data-testid="delete-agent-button"]',
    confirmDeleteButton: '[data-testid="confirm-delete-button"]',
    statusBadge: '[data-testid="agent-status"]',
    progressLog: '[data-testid="progress-log"]',
    screenshot: '[data-testid="agent-screenshot"]',
  },
  chat: {
    messageInput: '[data-testid="chat-input"]',
    sendButton: '[data-testid="send-button"]',
    messageList: '[data-testid="message-list"]',
    settingsDialog: '[data-testid="settings-dialog"]',
    aiNameInput: '[data-testid="ai-name-input"]',
  },
  common: {
    errorMessage: '[data-testid="error-message"]',
    successMessage: '[data-testid="success-message"]',
    loadingSpinner: '[data-testid="loading-spinner"]',
    modal: '[data-testid="modal"]',
    confirmButton: '[data-testid="confirm-button"]',
    cancelButton: '[data-testid="cancel-button"]',
  }
}
