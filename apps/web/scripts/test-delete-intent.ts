/**
 * Test script to verify the AI correctly handles delete/remove intent
 * Run with: npx tsx scripts/test-delete-intent.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Updated system prompt with stricter intent detection
const systemPrompt = `You are an AI Manager that helps users manage AI agents.

CRITICAL - READ THIS FIRST:
If the user's message contains "remove", "delete", "clean up", or "stop" agents:
→ ONLY use delete_agent tool. Do NOT call create_agent at all.
→ Delete each agent one by one.
→ Confirm deletions with a simple message like "Done! I've removed all agents."

If the user asks to CREATE something new, THEN use create_agent.

CURRENT AGENTS:
- Nova (id: agent-1): AI news research agent
- Scout (id: agent-2): Price monitoring agent
- Aria (id: agent-3): Email summary agent
`

const tools: Anthropic.Tool[] = [
  {
    name: 'create_agent',
    description: 'Create a new AI agent',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Name of the agent' },
        description: { type: 'string', description: 'What the agent does' },
      },
      required: ['name', 'description'],
    },
  },
  {
    name: 'delete_agent',
    description: 'Delete an existing agent',
    input_schema: {
      type: 'object' as const,
      properties: {
        agent_id: { type: 'string', description: 'ID of the agent to delete' },
        agent_name: { type: 'string', description: 'Name of the agent to delete' },
      },
      required: ['agent_id', 'agent_name'],
    },
  },
]

interface TestCase {
  name: string
  message: string
  expectedTool: 'delete_agent' | 'create_agent' | 'none'
  shouldNotCall?: 'create_agent' | 'delete_agent'
}

const testCases: TestCase[] = [
  {
    name: 'Remove all agents',
    message: 'Remove all agents',
    expectedTool: 'delete_agent',
    shouldNotCall: 'create_agent',
  },
  {
    name: 'Delete Nova',
    message: 'Delete Nova',
    expectedTool: 'delete_agent',
    shouldNotCall: 'create_agent',
  },
  {
    name: 'Clean up my agents',
    message: 'Clean up my agents',
    expectedTool: 'delete_agent',
    shouldNotCall: 'create_agent',
  },
  {
    name: 'Stop all agents',
    message: 'Stop all agents',
    expectedTool: 'delete_agent',
    shouldNotCall: 'create_agent',
  },
  {
    name: 'Create a news agent',
    message: 'Create an agent that monitors tech news',
    expectedTool: 'create_agent',
    shouldNotCall: 'delete_agent',
  },
]

async function runTest(testCase: TestCase): Promise<{ passed: boolean; details: string }> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: testCase.message }],
      tools,
    })

    const toolUse = response.content.find((block) => block.type === 'tool_use')
    const textBlock = response.content.find((block) => block.type === 'text')

    if (testCase.expectedTool === 'none') {
      if (toolUse) {
        return { passed: false, details: `Expected no tool, got: ${toolUse.name}` }
      }
      return { passed: true, details: 'No tool called (as expected)' }
    }

    if (!toolUse) {
      return { 
        passed: false, 
        details: `Expected ${testCase.expectedTool}, but no tool was called. Response: ${textBlock?.type === 'text' ? textBlock.text.slice(0, 100) : 'N/A'}` 
      }
    }

    if (toolUse.name === testCase.shouldNotCall) {
      return { 
        passed: false, 
        details: `WRONG TOOL! Called ${toolUse.name} instead of ${testCase.expectedTool}. Input: ${JSON.stringify(toolUse.input)}` 
      }
    }

    if (toolUse.name === testCase.expectedTool) {
      return { passed: true, details: `Correctly called ${toolUse.name}: ${JSON.stringify(toolUse.input)}` }
    }

    return { passed: false, details: `Called ${toolUse.name}, expected ${testCase.expectedTool}` }
  } catch (error) {
    return { passed: false, details: `Error: ${error}` }
  }
}

async function main() {
  console.log('🧪 Testing AI Intent Detection for Agent Management\n')
  console.log('=' .repeat(60))

  let passed = 0
  let failed = 0

  for (const testCase of testCases) {
    console.log(`\n📋 Test: "${testCase.name}"`)
    console.log(`   Message: "${testCase.message}"`)
    console.log(`   Expected: ${testCase.expectedTool}`)

    const result = await runTest(testCase)

    if (result.passed) {
      console.log(`   ✅ PASSED: ${result.details}`)
      passed++
    } else {
      console.log(`   ❌ FAILED: ${result.details}`)
      failed++
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`\n📊 Results: ${passed}/${testCases.length} passed, ${failed} failed`)

  if (failed > 0) {
    console.log('\n⚠️  Some tests failed! The AI may not correctly handle delete intent.')
    process.exit(1)
  } else {
    console.log('\n✅ All tests passed! AI correctly handles delete/create intent.')
  }
}

main()
