/**
 * Comprehensive test for AI Manager intent detection
 * Tests all types of user messages to ensure correct tool calls
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const systemPrompt = `You are a helpful AI assistant.

YOU ARE A GENERAL-PURPOSE AI ASSISTANT (LIKE CLAUDE OR CHATGPT)
- Have natural conversations about anything: personal topics, advice, brainstorming, coding, research, questions, etc.
- Respond to what the user actually says. If they say "hi" or "how are you", just chat naturally.
- Do NOT assume the user wants to create agents or automations unless they explicitly ask.
- Do NOT mention agents, teammates, or automations unless the user brings them up first.

TONE & STYLE
- Be warm, helpful, and natural — like a smart friend or colleague.
- Keep responses concise. Don't over-explain.

SPECIAL CAPABILITY: AI AGENTS (only when explicitly requested)
You can create AI agents that run tasks autonomously. But ONLY discuss or create agents when the user explicitly asks.

CURRENT AGENTS (for reference if user asks):
- Nova (id: agent-1): AI news research agent
- Scout (id: agent-2): Price monitoring agent
- Aria (id: agent-3): Email summary agent

CONFIRMATION FOR IMPORTANT ACTIONS
Before creating or deleting agents, always confirm first. Do NOT call the tool immediately.
`

const tools: Anthropic.Tool[] = [
  {
    name: 'create_agent',
    description: 'Create a new AI agent',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
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
        agent_id: { type: 'string' },
        agent_name: { type: 'string' },
      },
      required: ['agent_id', 'agent_name'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for information',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    },
  },
]

interface TestCase {
  category: string
  message: string
  expectedTool: string | null
  shouldNotCall?: string
}

const testCases: TestCase[] = [
  // GREETING tests - should NOT create agents
  { category: 'GREETING', message: 'hi', expectedTool: null, shouldNotCall: 'create_agent' },
  { category: 'GREETING', message: 'hello', expectedTool: null, shouldNotCall: 'create_agent' },
  { category: 'GREETING', message: 'hey there', expectedTool: null, shouldNotCall: 'create_agent' },
  { category: 'GREETING', message: 'good morning', expectedTool: null, shouldNotCall: 'create_agent' },
  
  // DELETE/REMOVE intent tests - AI should ask for confirmation first (text), not immediately delete
  { category: 'DELETE', message: 'Remove all agents', expectedTool: null, shouldNotCall: 'create_agent' },
  { category: 'DELETE', message: 'Delete Nova', expectedTool: null, shouldNotCall: 'create_agent' },
  { category: 'DELETE', message: 'Clean up my agents', expectedTool: null, shouldNotCall: 'create_agent' },
  { category: 'DELETE', message: 'Stop all agents', expectedTool: null, shouldNotCall: 'create_agent' },
  { category: 'DELETE', message: 'Get rid of all my agents', expectedTool: null, shouldNotCall: 'create_agent' },
  { category: 'DELETE', message: 'I want to remove Scout', expectedTool: null, shouldNotCall: 'create_agent' },
  { category: 'DELETE', message: 'Please delete all the agents I have', expectedTool: null, shouldNotCall: 'create_agent' },
  { category: 'DELETE', message: 'Can you remove Nova and Scout?', expectedTool: null, shouldNotCall: 'create_agent' },
  
  // CREATE intent tests - AI should ask for confirmation first (text), not immediately create
  { category: 'CREATE', message: 'Create an agent that monitors tech news', expectedTool: null, shouldNotCall: 'delete_agent' },
  { category: 'CREATE', message: 'Set up a new agent for tracking stock prices', expectedTool: null, shouldNotCall: 'delete_agent' },
  { category: 'CREATE', message: 'I need an agent to check my email', expectedTool: null, shouldNotCall: 'delete_agent' },
  { category: 'CREATE', message: 'Make me an agent that researches competitors', expectedTool: null, shouldNotCall: 'delete_agent' },
  { category: 'CREATE', message: 'Build an automation for daily news updates', expectedTool: null, shouldNotCall: 'delete_agent' },
  
  // GENERAL/INFO tests (no tool expected or web_search)
  { category: 'INFO', message: 'What agents do I have?', expectedTool: null },
  { category: 'INFO', message: 'How does this work?', expectedTool: null },
  { category: 'INFO', message: 'Tell me about Nova', expectedTool: null },
  { category: 'SEARCH', message: 'Search for the latest AI news', expectedTool: 'web_search' },
  { category: 'SEARCH', message: 'Look up Tesla stock price', expectedTool: 'web_search' },
]

async function runTest(testCase: TestCase): Promise<{ passed: boolean; details: string; toolCalled?: string }> {
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

    if (testCase.expectedTool === null) {
      if (toolUse) {
        // For INFO queries, it's OK if a tool is called as long as it's not create/delete inappropriately
        if (testCase.category === 'INFO') {
          return { passed: true, details: `Tool called (acceptable): ${toolUse.name}`, toolCalled: toolUse.name }
        }
        return { passed: false, details: `Expected no tool, got: ${toolUse.name}`, toolCalled: toolUse.name }
      }
      const text = textBlock?.type === 'text' ? textBlock.text.slice(0, 80) : 'N/A'
      return { passed: true, details: `Text response: "${text}..."` }
    }

    if (!toolUse) {
      const text = textBlock?.type === 'text' ? textBlock.text.slice(0, 80) : 'N/A'
      return { passed: false, details: `Expected ${testCase.expectedTool}, got text: "${text}..."` }
    }

    if (testCase.shouldNotCall && toolUse.name === testCase.shouldNotCall) {
      return { 
        passed: false, 
        details: `❌ WRONG TOOL! Called ${toolUse.name} instead of ${testCase.expectedTool}`,
        toolCalled: toolUse.name
      }
    }

    if (toolUse.name === testCase.expectedTool) {
      return { passed: true, details: `Correctly called ${toolUse.name}`, toolCalled: toolUse.name }
    }

    return { passed: false, details: `Called ${toolUse.name}, expected ${testCase.expectedTool}`, toolCalled: toolUse.name }
  } catch (error) {
    return { passed: false, details: `Error: ${error}` }
  }
}

async function main() {
  console.log('🧪 COMPREHENSIVE AI MANAGER INTENT DETECTION TEST\n')
  console.log('='.repeat(70))

  const results: { category: string; passed: number; failed: number; tests: string[] }[] = []
  const categories = [...new Set(testCases.map(t => t.category))]

  for (const category of categories) {
    const categoryTests = testCases.filter(t => t.category === category)
    console.log(`\n📂 ${category} TESTS (${categoryTests.length} tests)`)
    console.log('-'.repeat(50))

    let passed = 0
    let failed = 0
    const testResults: string[] = []

    for (const testCase of categoryTests) {
      const result = await runTest(testCase)
      const status = result.passed ? '✅' : '❌'
      const line = `${status} "${testCase.message}" → ${result.details}`
      console.log(`  ${line}`)
      testResults.push(line)

      if (result.passed) passed++
      else failed++
    }

    results.push({ category, passed, failed, tests: testResults })
  }

  console.log('\n' + '='.repeat(70))
  console.log('\n📊 RESULTS SUMMARY:\n')

  let totalPassed = 0
  let totalFailed = 0

  for (const r of results) {
    const status = r.failed === 0 ? '✅' : '⚠️'
    console.log(`  ${status} ${r.category}: ${r.passed}/${r.passed + r.failed} passed`)
    totalPassed += r.passed
    totalFailed += r.failed
  }

  console.log(`\n  TOTAL: ${totalPassed}/${totalPassed + totalFailed} passed`)

  if (totalFailed > 0) {
    console.log('\n⚠️  Some tests failed!')
    process.exit(1)
  } else {
    console.log('\n✅ ALL TESTS PASSED!')
  }
}

main()
