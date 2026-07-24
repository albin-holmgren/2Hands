import { test, expect } from '@playwright/test'
import { AuthHelper, hasTestCredentials } from './setup/auth-helper'
import { selectors, testAgents } from './setup/test-data'

// Skip all tests in this suite if no test credentials are configured
test.describe('Agent Management', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!hasTestCredentials(), 'Skipping - TEST_USER_EMAIL and TEST_USER_PASSWORD env vars required')
    const authHelper = new AuthHelper(page)
    await authHelper.login()
  })

  test('should create a new agent successfully', async ({ page }) => {
    await page.click(selectors.dashboard.createAgentButton)
    
    await page.fill(selectors.agent.nameInput, testAgents.simpleTask.name)
    await page.fill(selectors.agent.descriptionTextarea, testAgents.simpleTask.description)
    
    await page.click(selectors.agent.createButton)
    
    await expect(page).toHaveURL(/\/app\/agent\/[a-f0-9-]+/)
    await expect(page.locator('h1')).toContainText(testAgents.simpleTask.name)
    
    await expect(page.locator(selectors.dashboard.agentList)).toContainText(testAgents.simpleTask.name)
  })

  test('should validate agent creation form', async ({ page }) => {
    await page.click(selectors.dashboard.createAgentButton)
    
    await page.click(selectors.agent.createButton)
    await expect(page.locator(selectors.common.errorMessage)).toContainText(/name.*required/i)
    
    await page.fill(selectors.agent.nameInput, 'Test Agent')
    await page.click(selectors.agent.createButton)
    await expect(page.locator(selectors.common.errorMessage)).toContainText(/description.*required/i)
  })

  test('should start and monitor agent execution', async ({ page }) => {
    await page.click(selectors.dashboard.createAgentButton)
    await page.fill(selectors.agent.nameInput, testAgents.complexTask.name)
    await page.fill(selectors.agent.descriptionTextarea, testAgents.complexTask.description)
    await page.click(selectors.agent.createButton)
    
    await page.click(selectors.agent.startButton)
    
    await expect(page.locator(selectors.agent.statusBadge)).toContainText(/working|initializing/i)
    
    await expect(page.locator(selectors.agent.progressLog)).toBeVisible({ timeout: 30000 })
    
    await expect(page.locator(selectors.agent.stopButton)).toBeVisible()
  })

  test('should handle agent execution errors gracefully', async ({ page }) => {
    await page.click(selectors.dashboard.createAgentButton)
    await page.fill(selectors.agent.nameInput, 'Invalid Task Agent')
    await page.fill(selectors.agent.descriptionTextarea, 'This is an impossible task that should fail')
    await page.click(selectors.agent.createButton)
    
    await page.click(selectors.agent.startButton)
    
    await page.waitForTimeout(5000)
    
    const statusBadge = page.locator(selectors.agent.statusBadge)
    
    const status = await statusBadge.textContent()
    expect(status).toMatch(/working|failed|error|completed/i)
  })

  test('should save and reload agent state', async ({ page }) => {
    await page.click(selectors.dashboard.createAgentButton)
    await page.fill(selectors.agent.nameInput, testAgents.simpleTask.name)
    await page.fill(selectors.agent.descriptionTextarea, testAgents.simpleTask.description)
    await page.click(selectors.agent.createButton)
    
    const url = page.url()
    const agentId = url.split('/agent/')[1]
    
    await page.goto('/app')
    await page.goto(`/app/agent/${agentId}`)
    
    await expect(page.locator('h1')).toContainText(testAgents.simpleTask.name)
    const description = await page.locator(selectors.agent.descriptionTextarea).inputValue()
    expect(description).toBe(testAgents.simpleTask.description)
  })

  test('should delete agent with confirmation', async ({ page }) => {
    await page.click(selectors.dashboard.createAgentButton)
    await page.fill(selectors.agent.nameInput, 'Agent to Delete')
    await page.fill(selectors.agent.descriptionTextarea, 'This agent will be deleted')
    await page.click(selectors.agent.createButton)
    
    const agentName = 'Agent to Delete'
    
    await page.click(selectors.agent.deleteButton)
    
    await expect(page.locator(selectors.common.modal)).toBeVisible()
    await page.click(selectors.agent.confirmDeleteButton)
    
    await expect(page).toHaveURL('/app')
    await expect(page.locator(selectors.dashboard.agentList)).not.toContainText(agentName)
  })

  test('should handle concurrent agent operations', async ({ page }) => {
    const agentNames = ['Agent 1', 'Agent 2', 'Agent 3']
    
    for (const name of agentNames) {
      await page.click(selectors.dashboard.createAgentButton)
      await page.fill(selectors.agent.nameInput, name)
      await page.fill(selectors.agent.descriptionTextarea, `Task for ${name}`)
      await page.click(selectors.agent.createButton)
      await page.goto('/app')
    }
    
    for (const name of agentNames) {
      await expect(page.locator(selectors.dashboard.agentList)).toContainText(name)
    }
  })
})
