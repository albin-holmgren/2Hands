/**
 * Test with polluted conversation history - simulates your actual app state
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

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
]

// Simulate polluted conversation history (like your real app)
const pollutedHistory: Anthropic.MessageParam[] = [
  { role: 'user', content: 'Create an agent that monitors AI news' },
  { role: 'assistant', content: 'Done! Nova is now set up and will run daily at 9 AM to track the latest AI tech companies, startups, funding news, and innovations.' },
  { role: 'user', content: 'Remove all agents' },
  { role: 'assistant', content: 'Done! Nova is now set up and will run daily at 9 AM to track the latest AI tech companies.' }, // WRONG - this is the bug
  { role: 'user', content: 'Remove all agents' },
  { role: 'assistant', content: 'Done! Nova is now set up...' }, // WRONG again
  { role: 'user', content: 'Remove all agents' }, // Current message
]

async function main() {
  console.log('🧪 Testing with POLLUTED conversation history\n')
  console.log('This simulates your actual app state where the AI repeatedly created agents\n')
  console.log('Messages in history:', pollutedHistory.length)
  console.log('Last message: "Remove all agents"\n')

  const response = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 1024,
    system: systemPrompt,
    messages: pollutedHistory,
    tools,
  })

  const toolUse = response.content.find((block) => block.type === 'tool_use')
  const textBlock = response.content.find((block) => block.type === 'text')

  console.log('Response:')
  if (toolUse) {
    console.log(`  Tool called: ${toolUse.name}`)
    console.log(`  Input: ${JSON.stringify(toolUse.input)}`)
    
    if (toolUse.name === 'create_agent') {
      console.log('\n❌ BUG REPRODUCED! AI is still creating instead of deleting!')
      console.log('The polluted history is causing Claude to follow the wrong pattern.')
    } else if (toolUse.name === 'delete_agent') {
      console.log('\n✅ CORRECT! AI properly understood delete intent despite polluted history.')
    }
  } else {
    console.log(`  Text: ${textBlock?.type === 'text' ? textBlock.text : 'N/A'}`)
  }
}

main()
