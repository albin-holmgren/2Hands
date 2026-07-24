/**
 * Chat-like + memory test suite.
 *
 * Goal: Ensure the AI behaves like a normal conversational assistant (text responses),
 * and only calls tools when the user clearly requests an action.
 *
 * Run:
 *   npx tsx scripts/test-chat-like.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import Anthropic from '@anthropic-ai/sdk'

type Expected =
  | { type: 'no_tool' }
  | { type: 'tool'; name: string }
  | { type: 'tool_any_of'; names: string[] }
  | { type: 'no_tool_or_tool_any_of'; names: string[] }
  | { type: 'must_not_call'; names: string[] }

interface Case {
  id: string
  category: 'chat' | 'knowledge' | 'coding' | 'math' | 'preference' | 'memory' | 'actions' | 'ambiguous'
  messages: Anthropic.MessageParam[]
  expected: Expected
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Simplified conversation-first prompt (like ChatGPT/Claude)
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

Current agents (for reference if user asks):
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
        schedule_type: { type: 'string' },
        schedule_cron: { type: 'string' },
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
    description: 'Search the web for real-time information. Only use when the user explicitly asks you to search, or when up-to-date facts are clearly required (prefer asking first). Do NOT use for general chat, brainstorming, or coding help.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string' },
      },
      required: ['query'],
    },
  },
]

function pickToolName(content: Anthropic.ContentBlock[]): string | null {
  const toolUse = content.find((b) => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined
  return toolUse?.name ?? null
}

function pickText(content: Anthropic.ContentBlock[]): string {
  const text = content.filter((b) => b.type === 'text').map((b) => (b as Anthropic.TextBlock).text).join('\n')
  return text
}

function assertExpectation(toolName: string | null, expected: Expected): { ok: boolean; reason: string } {
  if (expected.type === 'no_tool') {
    return toolName === null
      ? { ok: true, reason: 'No tool called' }
      : { ok: false, reason: `Expected no tool, got ${toolName}` }
  }

  if (expected.type === 'tool') {
    return toolName === expected.name
      ? { ok: true, reason: `Called expected tool: ${toolName}` }
      : { ok: false, reason: `Expected tool ${expected.name}, got ${toolName ?? 'none'}` }
  }

  if (expected.type === 'tool_any_of') {
    return toolName && expected.names.includes(toolName)
      ? { ok: true, reason: `Called acceptable tool: ${toolName}` }
      : { ok: false, reason: `Expected one of ${expected.names.join(', ')}, got ${toolName ?? 'none'}` }
  }

  if (expected.type === 'no_tool_or_tool_any_of') {
    if (toolName === null) return { ok: true, reason: 'No tool called (acceptable)' }
    return expected.names.includes(toolName)
      ? { ok: true, reason: `Called acceptable tool: ${toolName}` }
      : { ok: false, reason: `Expected no tool OR one of ${expected.names.join(', ')}, got ${toolName}` }
  }

  if (expected.type === 'must_not_call') {
    return toolName && expected.names.includes(toolName)
      ? { ok: false, reason: `Must not call ${toolName}` }
      : { ok: true, reason: toolName ? `Called ${toolName} (allowed)` : 'No tool called (allowed)' }
  }

  // Exhaustive
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _never: any = expected
  return { ok: false, reason: `Unknown expectation: ${String(_never)}` }
}

const cases: Case[] = [
  // Chat / small talk
  {
    id: 'chat_hello',
    category: 'chat',
    messages: [{ role: 'user', content: 'hi' }],
    expected: { type: 'no_tool' },
  },
  {
    id: 'chat_smalltalk',
    category: 'chat',
    messages: [{ role: 'user', content: 'How are you today?' }],
    expected: { type: 'no_tool' },
  },
  {
    id: 'chat_opinion',
    category: 'chat',
    messages: [{ role: 'user', content: 'What do you think about AI taking jobs?' }],
    expected: { type: 'no_tool' },
  },

  // Knowledge / reasoning
  {
    id: 'knowledge_explain',
    category: 'knowledge',
    messages: [{ role: 'user', content: 'Explain the difference between OAuth and API keys.' }],
    expected: { type: 'no_tool' },
  },
  {
    id: 'knowledge_brainstorm',
    category: 'knowledge',
    messages: [{ role: 'user', content: 'Give me 10 startup ideas for a small team.' }],
    expected: { type: 'no_tool' },
  },

  // Coding help
  {
    id: 'coding_react',
    category: 'coding',
    messages: [{ role: 'user', content: 'In React, what is a stale closure and how do I avoid it?' }],
    expected: { type: 'no_tool' },
  },
  {
    id: 'coding_typescript',
    category: 'coding',
    messages: [{ role: 'user', content: 'Write a TypeScript function that groups objects by a key.' }],
    expected: { type: 'no_tool' },
  },

  // Math
  {
    id: 'math',
    category: 'math',
    messages: [{ role: 'user', content: 'What is 17% of 349?' }],
    expected: { type: 'no_tool_or_tool_any_of', names: [] },
  },

  // Preferences / personalization
  {
    id: 'pref',
    category: 'preference',
    messages: [{ role: 'user', content: 'Keep answers short and direct. Got it?' }],
    expected: { type: 'no_tool' },
  },

  // Memory (within prompt-provided conversation context)
  {
    id: 'memory_recall_name',
    category: 'memory',
    messages: [
      { role: 'user', content: 'My name is Josefine.' },
      { role: 'assistant', content: 'Nice to meet you, Josefine. How can I help?' },
      { role: 'user', content: 'What is my name?' },
    ],
    expected: { type: 'no_tool' },
  },
  {
    id: 'memory_recall_fact',
    category: 'memory',
    messages: [
      { role: 'user', content: 'Remember this: my favorite color is blue.' },
      { role: 'assistant', content: 'Got it.' },
      { role: 'user', content: 'What color did I say I like?' },
    ],
    expected: { type: 'no_tool' },
  },

  // Actions - all important decisions require confirmation first
  {
    id: 'action_create',
    category: 'actions',
    // Should ask for confirmation first (text), not immediately create
    messages: [{ role: 'user', content: 'Create an agent that checks AI news daily at 9am.' }],
    expected: { type: 'no_tool' },
  },
  {
    id: 'action_create_confirmed',
    category: 'actions',
    // After user confirms, should call create_agent
    messages: [
      { role: 'user', content: 'Create an agent that checks AI news daily at 9am.' },
      { role: 'assistant', content: 'I\'ll create an agent called Nova that monitors AI news daily at 9am. Should I go ahead?' },
      { role: 'user', content: 'Yes, go ahead.' },
    ],
    expected: { type: 'tool', name: 'create_agent' },
  },
  {
    id: 'action_delete_all',
    category: 'actions',
    // Should ask for confirmation first (text), not immediately delete
    messages: [{ role: 'user', content: 'Remove all agents.' }],
    expected: { type: 'no_tool' },
  },
  {
    id: 'action_delete_confirmed',
    category: 'actions',
    // After user confirms, should call delete_agent
    messages: [
      { role: 'user', content: 'Remove all agents.' },
      { role: 'assistant', content: 'Just to confirm — you want me to delete Nova, Scout, and Aria? This can\'t be undone.' },
      { role: 'user', content: 'Yes, delete them all.' },
    ],
    expected: { type: 'tool', name: 'delete_agent' },
  },
  {
    id: 'action_search',
    category: 'actions',
    messages: [{ role: 'user', content: 'Search the web for the latest news about Anthropic.' }],
    expected: { type: 'tool', name: 'web_search' },
  },

  // Ambiguous actions (should not create; may ask a question or do safe tool)
  {
    id: 'ambiguous_cleanup',
    category: 'ambiguous',
    messages: [{ role: 'user', content: 'Can you clean up my agents?' }],
    expected: { type: 'must_not_call', names: ['create_agent'] },
  },
  {
    id: 'ambiguous_general',
    category: 'ambiguous',
    messages: [{ role: 'user', content: 'Help me improve my workflow.' }],
    expected: { type: 'must_not_call', names: ['create_agent', 'delete_agent'] },
  },
]

async function runOne(testCase: Case) {
  const res = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 800,
    system: systemPrompt,
    messages: testCase.messages,
    tools,
  })

  const toolName = pickToolName(res.content)
  const text = pickText(res.content)
  const verdict = assertExpectation(toolName, testCase.expected)

  return {
    id: testCase.id,
    category: testCase.category,
    ok: verdict.ok,
    toolName,
    reason: verdict.reason,
    textPreview: text.replace(/\s+/g, ' ').slice(0, 140),
  }
}

async function main() {
  console.log('🧪 Chat-like + memory test suite')
  console.log('='.repeat(70))

  let passed = 0
  let failed = 0

  for (const c of cases) {
    const r = await runOne(c)
    const status = r.ok ? '✅' : '❌'
    console.log(`\n${status} ${r.id} [${r.category}]`)
    console.log(`  tool: ${r.toolName ?? 'none'}`)
    console.log(`  check: ${r.reason}`)
    console.log(`  text: ${r.textPreview}${r.textPreview.length >= 140 ? '…' : ''}`)

    if (r.ok) passed++
    else failed++
  }

  console.log('\n' + '='.repeat(70))
  console.log(`Results: ${passed}/${cases.length} passed, ${failed} failed`)

  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error('Fatal error:', e)
  process.exit(1)
})
