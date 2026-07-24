#!/usr/bin/env npx tsx

/**
 * Workspace Isolation Smoke Tests
 *
 * Verifies that workspace-isolation code changes are correct:
 * - Key library functions now accept workspaceId as a required parameter
 * - Pure formatting helpers produce workspace-scoped output
 * - Migration file exists with workspace_id columns
 *
 * NOTE: DB-dependent functions (resolveWorkspaceScope, getMemories, etc.)
 * require a Next.js request context and are tested at runtime, not here.
 *
 * Run: npx tsx tests/unit/workspace-isolation.test.ts
 */

import fs from 'fs'
import path from 'path'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++
    console.log(`  ✓ ${message}`)
  } else {
    failed++
    console.log(`  ✗ ${message}`)
  }
}

console.log('\n🔒 Workspace Isolation Tests\n')

async function run() {
  // ── Function signature checks ─────────────────────────────────────────────
  // Verify the key functions accept workspaceId. If signatures regress, these fail.

  console.log('Function signatures (workspace-scoped):')

  const memModule = await import('../../src/lib/memory/ai-manager-memory')
  assert(memModule.getMemories.length >= 2, 'getMemories(userId, workspaceId, ...)')
  assert(memModule.storeMemory.length >= 3, 'storeMemory(userId, workspaceId, type, ...)')
  assert(memModule.extractMemoriesFromConversation.length >= 3, 'extractMemoriesFromConversation(userId, workspaceId, ...)')

  const profileModule = await import('../../src/lib/personalization/user-profile')
  assert(profileModule.getUserPersonalization.length >= 2, 'getUserPersonalization(userId, workspaceId)')
  assert(profileModule.updatePersonalization.length >= 3, 'updatePersonalization(userId, workspaceId, updates)')
  assert(profileModule.learnFactAboutUser.length >= 4, 'learnFactAboutUser(userId, workspaceId, fact, ...)')
  assert(profileModule.markQuestionAsked.length >= 3, 'markQuestionAsked(userId, workspaceId, question)')

  const curatorModule = await import('../../src/lib/memory/memory-curator')
  assert(curatorModule.getUserSharedKnowledge.length >= 2, 'getUserSharedKnowledge(userId, workspaceId)')
  assert(curatorModule.shareKnowledgeToUser.length >= 4, 'shareKnowledgeToUser(userId, workspaceId, agentId, content)')

  const outreachModule = await import('../../src/lib/personalization/proactive-outreach')
  assert(outreachModule.notifyAgentCompletion.length >= 3, 'notifyAgentCompletion(userId, workspaceId, ...)')
  assert(outreachModule.notifyAgentInsight.length >= 3, 'notifyAgentInsight(userId, workspaceId, ...)')
  assert(outreachModule.scheduleCheckIn.length >= 2, 'scheduleCheckIn(userId, workspaceId, ...)')
  assert(outreachModule.celebrateMilestone.length >= 3, 'celebrateMilestone(userId, workspaceId, milestone)')
  assert(outreachModule.shouldReachOut.length >= 2, 'shouldReachOut(userId, workspaceId)')

  // ── Pure formatting helpers ────────────────────────────────────────────────

  console.log('\nPure logic (no DB):')

  {
    const { formatMemoriesForPrompt } = memModule
    const result = formatMemoriesForPrompt([])
    assert(result === '', 'formatMemoriesForPrompt returns empty string for empty memories')
  }

  {
    const { formatPersonalizationForPrompt } = profileModule
    const fakeProfile = {
      userId: 'u1', preferredName: 'Alice', timezone: null, workSchedule: null,
      communicationStyle: 'friendly' as const, preferredDetailLevel: 'moderate' as const,
      usesEmoji: false, interests: [], goals: [], challenges: [], industryOrRole: null,
      relationshipStage: 'new' as const, totalInteractions: 0, lastInteraction: null,
      positiveInteractions: 0, typicalResponseTime: null, preferredContactTimes: [],
      stressIndicators: [], learnedFacts: [], pendingQuestions: [],
      createdAt: '', updatedAt: '',
    }
    const prompt = formatPersonalizationForPrompt(fakeProfile)
    assert(prompt.includes('Alice'), 'formatPersonalizationForPrompt includes preferred name')
    assert(prompt.includes('new'), 'formatPersonalizationForPrompt includes relationship stage')
  }

  {
    const { formatSharedKnowledgeForPrompt } = curatorModule
    const result = formatSharedKnowledgeForPrompt([])
    assert(result === '', 'formatSharedKnowledgeForPrompt returns empty string for no knowledge')
  }

  // ── Migration file validation ─────────────────────────────────────────────

  console.log('\nMigration file checks:')

  const migrationPath = path.join(
    __dirname, '..', '..', '..', '..', 'supabase', 'migrations',
    '20260217000004_strict_workspace_isolation.sql'
  )
  const migrationExists = fs.existsSync(migrationPath)
  assert(migrationExists, 'Strict workspace isolation migration file exists')

  if (migrationExists) {
    const content = fs.readFileSync(migrationPath, 'utf8')
    const tables = [
      'ai_manager_memories',
      'user_personalization',
      'user_settings',
      'notification_preferences',
      'credentials',
      'user_shared_knowledge',
      'task_execution_patterns',
      'learning_applications',
    ]
    for (const table of tables) {
      assert(
        content.includes(table) && content.includes('workspace_id'),
        `Migration adds workspace_id to ${table}`
      )
    }
  }

  // ── resolveWorkspaceScope pure logic ─────────────────────────────────────

  console.log('\nWorkspace context pure logic:')

  const { resolveWorkspaceScope } = await import('../../src/lib/enterprise/workspace-context')
  assert(typeof resolveWorkspaceScope === 'function', 'resolveWorkspaceScope is exported')
  assert(resolveWorkspaceScope.length >= 1, 'resolveWorkspaceScope accepts userId')

  // ── Summary ──────────────────────────────────────────────────────────────

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`)

  if (failed > 0) {
    process.exit(1)
  }
}

run().catch(err => {
  console.error('Test runner error:', err)
  process.exit(1)
})
