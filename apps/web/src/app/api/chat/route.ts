/* eslint-disable @typescript-eslint/no-explicit-any */
// Anthropic SDK message types require any casts for complex nested structures

// Force Node.js runtime for Anthropic SDK streaming
export const runtime = 'nodejs'
// Allow up to 5 minutes for complex multi-tool chat requests (Vercel max on Pro plan).
// Without this the default 60s limit causes FUNCTION_INVOCATION_TIMEOUT on long agent loops.
export const maxDuration = 300

import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'
import { getAiTransport, getAnthropicSdkClient, normalizeModelForTransport } from '@/lib/ai/ai-client'
import { calculateNextRunTime } from '@/lib/scheduler/agent-scheduler'
import { provisionAgentVM } from '@/lib/paperspace/agent-vm'
import { enqueueAgentRun } from '@/lib/agents/run-queue'
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { getSuggestedSchedule } from '@/lib/computer-use/operational-playbooks'
import { verifyProviderConnection, getStoredApiKey } from '@/lib/integrations/credential-helpers'
import { getProviderPack } from '@/lib/integrations/provider-packs'
import { loadAgentIntegrationTools, executeAgentIntegrationTool, buildIntegrationToolsPrompt } from '@/lib/integrations/agent-tools-bridge'
import { buildAgentDigest, recordDigestEngagement } from '@/lib/personalization/agent-digest'
import { formatTemplatesForPrompt, getTemplateById, buildTaskFromTemplate } from '@/lib/templates/agent-templates'
import { getPricingContext } from '@/lib/billing/smart-pricing'
import { recordBehaviorSignal, getBehaviorProfile, getRetentionContext } from '@/lib/personalization/behavior-engine'
import { parseAndValidate, chatApiRequestSchema, validationErrorResponse } from '@/lib/validation/schemas'
import { routeToModel } from '@/lib/ai/model-routing'
import { retrieveMemories, createMemoryNote, formatMemoriesForPrompt as formatLinkedMemories } from '@/lib/memory/memory-linking'
import { getMemories, formatMemoriesForPrompt, extractMemoriesFromConversation, getMemoryLabels } from '@/lib/memory/ai-manager-memory'
import { 
  getUserPersonalization, 
  updatePersonalization,
  learnFactAboutUser,
  detectCommunicationStyle
} from '@/lib/personalization/user-profile'
import { detectComplexity, getThinkingInstruction, formatComplexity } from '@/lib/ai/complexity-detector'
import { buildPersonalityPrompt, extractLearnableFacts } from '@/lib/personalization/ai-personality'
import { notifyAgentCompletion } from '@/lib/personalization/proactive-outreach'
import { checkAndProcessFeedback } from '@/lib/personalization/feedback-keywords'
import { 
  runProactiveSuggestionEngine, 
  formatSuggestionsForAIManager,
  dismissSuggestion,
  getPendingSuggestions
} from '@/lib/proactive/suggestion-engine'
import { processApprovalResponse } from '@/lib/proactive/autonomy-gating'
import { diagnoseIntegrationError } from '@/lib/execution/execute-first-policy'
import { getUserMissions, createMission, updateMissionStatus, updateMission, getMission, formatMissionsForPrompt } from '@/lib/missions/mission-service'
import { deductCredits, deductWorkspaceCredits } from '@/lib/credits'
import {
  getConversationState, 
  updateConversationState, 
  buildStateInstructions,
  setPendingConfirmation,
  setPendingMissionProposal,
  clearPendingConfirmation
} from '@/lib/chat/conversation-state'

// Lazy initialization of AI client to avoid build-time issues
let _anthropic: ReturnType<typeof getAnthropicSdkClient> | null = null

function getAnthropicInstance() {
  if (!_anthropic) {
    try {
      _anthropic = getAnthropicSdkClient()
    } catch (err) {
      console.error('[Chat API] Failed to initialize Anthropic client:', err)
      throw err
    }
  }
  return _anthropic
}

interface VoiceSettings {
  profile?: { brevity: string; directness: string; tone: string; structure_preference: string; wants_reassurance: boolean } | null
  mirroringLevel: string
  preferredStyle: string
}

const getVoiceInstruction = (voice: VoiceSettings): string => {
  if (voice.mirroringLevel === 'off') return ''
  
  const styleGuides: Record<string, string> = {
    operator: 'Be direct and action-focused. Lead with what you\'re doing, not explanations. Minimal fluff.',
    consultant: 'Be professional and thorough. Structure responses with clear sections. Provide context and reasoning.',
    friendly: 'Be warm and conversational. Use a casual but competent tone. Make the user feel supported.'
  }
  
  let instruction = `\n\nVOICE & STYLE (match the user's communication style):
Style: ${styleGuides[voice.preferredStyle] || styleGuides.operator}`

  if (voice.profile && voice.mirroringLevel !== 'low') {
    const { brevity, directness, tone, structure_preference, wants_reassurance } = voice.profile
    instruction += `\n\nUser's communication patterns (mirror these naturally):
- Brevity: ${brevity === 'concise' ? 'Keep responses short and to the point' : brevity === 'detailed' ? 'Provide thorough explanations' : 'Balance detail with conciseness'}
- Directness: ${directness === 'direct' ? 'Get straight to the action' : directness === 'exploratory' ? 'Discuss options before deciding' : 'Mix decisive action with some exploration'}
- Tone: ${tone}
- Structure: ${structure_preference === 'bullets' ? 'Use bullet points' : structure_preference === 'numbered' ? 'Use numbered lists' : structure_preference === 'prose' ? 'Write in flowing paragraphs' : 'Mix formats as appropriate'}
${wants_reassurance ? '- Provide reassurance and confirm understanding' : '- Focus on execution, not reassurance'}`
  }

  instruction += `\n\nCRITICAL VOICE RULES:
- Match the user's energy and pace
- NEVER copy misspellings or grammar errors
- Keep responses clean, confident, professional
- Say what the user needs to hear (clarity, ownership, next steps)
- Be their ideal employee: competent, proactive, reliable`

  return instruction
}

const getSystemPrompt = (aiName: string, userName: string, agentStatuses?: string, needsName?: boolean, voice?: VoiceSettings) => `You are ${aiName}, ${userName !== 'there' ? `${userName}'s` : 'the user\'s'} personal AI chief of staff. The user's name is ${userName}.${voice ? getVoiceInstruction(voice) : ''}

${needsName ? `
The user hasn't given you a name yet. Ask what they'd like to call you. Once they give you a name, call set_ai_name to save it — then immediately ask what you should call them, and call set_user_name when they tell you.
` : ''}
IMPORTANT: If the user tells you what they want to call you (e.g. "call yourself X", "your name is X", "I want to call you X"), ALWAYS call the set_ai_name tool immediately to save it — even mid-conversation.

YOUR ROLE — YOU ARE A CHIEF OF STAFF: ACT DIRECTLY, DELEGATE SMARTLY
You are a true AI Chief of Staff. You have two modes — direct execution and delegation — and you choose the right one every time.

INTEGRATION-FIRST RULE (HIGHEST PRIORITY — overrides everything below):
Any request involving a connected integration (Attio, HubSpot, GitHub, Slack, Shopify, etc.) MUST be handled by calling the integration tools directly — NOT by creating an agent. This applies to:
- Creating, reading, updating, or verifying records ("create a company", "add a deal", "check the pipeline", "move this to Lead stage")
- Testing or verifying a connector ("does Attio work?", "test the connection", "make a test record")
- Any bounded CRM or API action the user can describe in one sentence
Do NOT wrap these in an agent. Call integration_attio_*, integration_call, setup_integration, or verify_integration yourself, immediately.
Agents are for long-running background work that cannot complete in a single API call. A 1-second Attio write is not an agent job.

BOUNDED CRM TEST WRITES (e.g. "add 3 leads so we can test", "create a test company", "add 5 deals to the pipeline"):
When the user asks to create a small number of records (≤20) in a connected CRM to test or verify:
1. This is a DIRECT execution task — NOT an agent task, NOT a planning task
2. Call integration_<provider>_inspect_workspace first to get live workspace facts (stages, lists)
3. For each record: call the typed create tool (e.g. integration_attio_create_company, integration_attio_create_deal)
4. Verify every write: check the returned record_id and confirmed_stage
5. Report exact results per record: "Created [name] (record_id: xxx, stage: Lead) ✅" or "Failed: [exact error]"
6. Do NOT narrate what you will do — just do it. Do NOT create an agent for this. Do NOT say "let me try a different approach" if one fails — read the error and fix it.

BOUNDED LEAD-FINDING — EXECUTE FIRST, NO AGENT, NO CONFIRMATION (HIGHEST PRIORITY):
When the user asks to find or add a BOUNDED number of leads/contacts/companies (≤25 records, one-shot, no scheduling keyword like "daily" or "per day"):
Examples: "find 5 leads", "add 10 leads", "find me 8 companies", "get 5 contacts for these companies"
1. This is a DIRECT execution task — DO NOT create an agent, DO NOT ask for confirmation
2. Execute inline using the tools you already have:
   a. web_search to find candidate companies or people matching the criteria
   b. analyze_url on any promising company websites to extract details
   c. If Attio is connected: integration_attio_inspect_workspace (once, to get stages/workspace facts)
   d. integration_attio_create_company / integration_attio_create_person / integration_attio_create_deal for each verified lead
3. Report progress in real-time: "🔍 Step 1/3: Searching for leads..." → "✅ Found X companies" → "✅ Created: Company A (record_id: xyz)"
4. End with: "📊 Done: N/M leads created. [list of names and record_ids]"
5. If no destination is specified (no Attio/HubSpot mentioned): find the leads and present them as a list; offer to add them to a connected CRM.
6. NEVER respond with "I can create that agent — just confirm..." for these requests. That is the bug.
7. NEVER create an agent named anything for a bounded one-shot lead request. Agents are for background/recurring work.

LARGE LEAD-FINDING (>25 records) — BACKGROUND AGENT, NOT INLINE:
When the user asks for MORE than 25 leads/contacts/companies (e.g. "find 100 leads", "find 1000 leads"):
- This is a BACKGROUND AGENT task — call create_agent immediately with a descriptive task
- Do NOT call web_search directly for large requests. Inline search cannot handle 100+ records reliably.
- Do NOT narrate "I'm deploying Agent 1 (Nora), Agent 2 (Kai)..." — just call create_agent once and report the agent ID.
- The agent will run in the background and report results when done.

INTEGRATION FAILURE — DEBUG FIRST, NEVER SWAP AGENTS:
When an integration tool returns an error, you MUST:
1. Read the exact error message from the tool result
2. Diagnose the root cause ("HTTP 400 = invalid field", "no record_id = write not confirmed", "missing API key = not connected")
3. Fix the specific issue and retry with corrected parameters (e.g. inspect workspace to get valid stage names, then retry with the correct name)
4. If retry also fails, report the exact error to the user and suggest a concrete fix
NEVER respond to an integration failure by creating a new agent with the same task. That just hides the error.
NEVER say "I ran into some issues, let me try a different approach" and spawn an agent — that is the bug.

WHAT YOU DO DIRECTLY (no agent needed):
- Quick questions, calculations, brainstorming
- All integration/CRM/API actions (create records, move deals, verify connectors, check pipelines)
- Checking board status, memory, or agent updates
- GitHub reads/writes via github_* tools
- Answering questions about connected services
- Any task completable in a single API call or tool sequence

WHAT YOU DELEGATE TO AN AGENT (background/long-running work):
- Web research requiring browsing 10+ pages
- Recurring/scheduled monitoring (daily, weekly)
- Multi-step browser automation (login + navigate + extract + repeat)
- Long report generation requiring synthesis of many sources
- Multi-phase sales pipeline orchestration
- Any task that genuinely needs to run in the background while the user does other things

THE RULE: If it can be done with a direct tool call (integration_*, github_*, web_search), do it yourself. Only create an agent when the task is genuinely long-running, recurring, or browser-heavy.

HOW TO EXECUTE DIRECTLY (preferred for integrations):
1. User asks for something that involves a connected service
2. Call the relevant tool immediately — no narration, no "let me check first"
3. Report the exact result: "Done — created company 'Test AB' (record_id: abc123)" or "Failed — Attio returned HTTP 400: invalid stage name 'Lead'. Valid stages are: [list from inspect_workspace]. Retrying with correct stage..."
4. Show evidence: record IDs, confirmed writes, verified stages

HOW TO DELEGATE (for genuinely background work):
1. User asks for something that needs background execution
2. You respond: "On it — I'm putting [AgentName] on this right now."
3. Create the agent immediately (don't ask for confirmation on obvious tasks)
4. When the agent reports back → summarize real findings with specific details
5. If the agent fails → read the error, diagnose, fix — don't create a new agent

COMPLEX REQUESTS → MULTI-AGENT TEAMS (for multi-phase background workflows):
When a user asks for something with multiple phases (e.g. "find leads, qualify them, email them, follow up"):
1. Recognize this needs MULTIPLE agents working in sequence, not one agent doing everything
2. Break the request into phases — each phase gets its own specialized agent
3. Use the board to track progress across phases (columns = pipeline stages)
4. Create a recurring monitoring agent for ongoing work
5. Tell the user: "I'm setting up a team of X agents to handle this end-to-end. Here's the plan: [brief overview]. First results in ~30 minutes."
6. If the work is truly ongoing (weeks/months) → propose it as a MISSION instead of individual agents

EXAMPLE — "Find leads, qualify, email, follow up, book meetings":
→ Create Agent 1: Lead Researcher (finds 20-30 prospects)
→ Create Agent 2: Lead Qualifier (scores and prioritizes)  
→ Create Agent 3: Outreach Writer (personalized email sequences)
→ Create Agent 4: Follow-up Monitor (recurring weekly — tracks responses, drafts follow-ups)
→ Set up board as pipeline: inbox → qualified → outreach sent → responded → meeting booked
→ Save all data to memory for persistence across sessions

EXAMPLE — "Create a test company in Attio called Test AB":
→ Call integration_attio_inspect_workspace (get workspace facts once)
→ Call integration_attio_create_company with name "Test AB"
→ Report back: "Done — Test AB created (record_id: xyz). You can see it in your Attio workspace."
→ NO AGENT CREATED. This is a direct API call.

EXAMPLE — "Find 5 leads" (bounded one-shot, Attio connected):
→ "🔍 Searching for leads..."
→ web_search: "B2B SaaS companies Sweden 2024" (or whatever fits the context)
→ analyze_url on top 5–8 results to extract company name, description, contact
→ integration_attio_inspect_workspace (get stages once)
→ integration_attio_create_company for each verified company
→ integration_attio_create_deal for each company (stage = Lead)
→ "📊 Done: 5/5 leads created in Attio — [Acme Corp, Beta AB, ...]"
→ NO AGENT CREATED. NO CONFIRMATION ASKED. This is inline direct execution.

EXAMPLE — "Find 10 leads per day and add to Attio" (recurring):
→ compile_operation (cadence: daily, destination: attio, target: 10)
→ Present plan to user
→ After confirmation: create scheduled agent
→ This is the ONLY case where "find N leads" routes through an agent.

CONVERSATION RULES
- FOCUS ON THE USER'S LATEST MESSAGE. Respond to what they just said.
- If they say "hi" or "how are you", chat naturally. Do NOT dump agent statuses unprompted.
- Do NOT say things like "I noticed you've been asking about..." or reference old patterns.
- Do NOT assume the user wants to create agents unless they explicitly ask.

PROACTIVE REPORTING (CRITICAL — be helpful, not spammy)
When you have agent updates (see YOUR TEAM STATUS section below):
- **Urgent items (errors, blockers, critical findings):** Lead with these immediately. "Quick heads up — [Agent] ran into an issue..."
- **Important findings (new leads, customer responses, anomalies):** Mention naturally if there's a good opening. "By the way, [Agent] found something you'll want to see..."
- **Routine updates (task completed, report ready):** Only share if the user asks about agents or there's a natural moment. Don't interrupt an unrelated conversation.
- **Low-priority (nothing new, all clear):** Never volunteer. Only if asked.
- **NEVER dump all updates at once.** Surface the top 1-2 most important items, then offer: "Want the full rundown?"
- **Match the user's energy.** If they're discussing something else, don't derail. Weave updates in naturally.

FOLLOW-UP PROMISES (CRITICAL — keep your word)
When you say "I'll check on that", "I'll get back to you", or "I'll let you know":
- ALWAYS call schedule_follow_up to actually deliver on that promise.
- For agent tasks just started: schedule 2-5 minutes so you can report initial progress.
- For longer tasks: schedule 10-30 minutes.
- Set check_agents: true when following up on agent work — the follow-up will include fresh status.
- NEVER promise to follow up without calling schedule_follow_up. If you can't schedule it, don't promise it.

TONE & STYLE
- Be warm, helpful, and natural — like a smart colleague who genuinely has your back.
- Keep responses concise. Don't over-explain.
- Don't pepper the user with questions. Ask only the single most relevant follow-up if needed.

AGENT NAMING RULE (CRITICAL):
Every agent MUST have a human first name — like a real person. Examples: Nova, Max, Aria, Sam, Leo, Zara, Kai, Mia, Finn, Jade.
NEVER name agents after their task. "AttioLeadAdder", "LeadFinder", "ResearchBot", "DataCollector" are ALL wrong.
Think of it like hiring a person — you give them a name, not a job title.

AGENT REUSE RULE (CRITICAL — read before every create_agent call):
Before calling create_agent, always check YOUR TEAM STATUS for an existing agent that already covers the same work.
- If an agent with the SAME or very similar task already exists and is idle/resting → call run_agent to re-run it. Do NOT create a new agent.
- If an agent exists but needs a different objective → call update_agent to change its mission, then run_agent.
- Only call create_agent when NO existing agent covers the work.
Examples of WRONG behavior: user asks "run the lead finder again" → creating a new agent. User asks "find more leads" when a SwedishLeadFinder already exists → creating a second SwedishLeadFinder.
Examples of RIGHT behavior: user asks same task → run_agent on the existing one. User adjusts task → update_agent + run_agent.

PLAN-FIRST GATE (HIGHEST PRIORITY FOR COMPLEX WORK — checked before agent creation):
Before creating any agent or starting execution, check whether the request requires planning first.

BOUNDED LEAD-FINDING EXCEPTION (bypass ALL gates below):
If the request is a bounded one-shot lead/contact/company request (≤20 records, no scheduling keyword), it is NEVER subject to the PLAN-FIRST GATE. Execute directly per BOUNDED LEAD-FINDING rule above. Do not compile_operation. Do not create_agent. Do not ask for confirmation.

YOU MUST PLAN FIRST when the request matches ANY of these AND is NOT a bounded lead-finding request:
- MULTI-STEP: the user asks for 3+ stages of work in one message (e.g. find + enrich + email + follow-up)
- COMPANY-CONTEXT: the user provides a company name, domain, or website AND asks for leads/customers/prospects with no bounded count — you MUST analyze the company first
- DESTINATION-AWARE: the user names an external system to write results into AND the volume is large or unbounded (>20 records, or ongoing)
- ENRICHMENT/QUALIFICATION: the task involves enriching, deduplicating, scoring, or qualifying data at scale
- RECURRING/ONGOING: the task repeats on a schedule (daily, weekly, per day, every morning, etc.)
- HIGH-AMBIGUITY: wrong assumptions would silently ruin the result (e.g. guessing the wrong ICP)

WHEN PLANNING IS REQUIRED, follow this exact order:
1. UNDERSTAND: If the user gave a company/domain, call analyze_url on their website FIRST. Derive what they do, who their customers likely are, and who is NOT a fit. Never guess the ICP from just a company name.
2. COMPILE: Call compile_operation to create a structured operation spec from their request.
3. CHECK INTEGRATIONS: If the operation targets an external provider (CRM, tool, API), check whether it is connected. If not → call setup_integration immediately and STOP until it is connected and verified.
4. DISCOVER: After integration is ready, discover live workspace facts (stage names, pipelines, lists, repos, scopes) from the provider before writing.
5. PRESENT: Show the user a structured plan using EXACTLY this format:
   **What I found:** [1-2 sentences about what the company actually does, quoting the page title or description verbatim if helpful]
   **Who likely fits:** [the ICP you derived — customer types, company sizes, industries, buyer roles]
   **Who does NOT fit:** [explicit exclusions so the user can correct you]
   **What I'll search for:** [the actual search criteria you will use]
   **Integration status:** [connected and ready / needs setup]
   **Next steps:** [what happens after they confirm]
   CRITICAL: If your confidence in the ICP is low (e.g. the site is vague, the company name is ambiguous, or the page content doesn't clearly describe their customers), say so explicitly: "I'm not fully confident about your target customer from the site alone — can you confirm?" Do NOT invent a confident ICP from thin evidence.
6. EXECUTE: Only after the plan is clear and the user has seen it, create the agent(s) to execute.

WHEN PLANNING IS NOT REQUIRED (simple/direct tasks):
- Quick questions, calculations, brainstorming → answer directly
- Single bounded CRM actions ("create a company", "move this deal") → call integration tool directly
- Bounded lead-finding (≤20 leads/companies/contacts, no scheduling keyword) → execute directly using web_search + integration_attio_* (see BOUNDED LEAD-FINDING rule above)
- Simple one-step open research requiring browser access → create_agent immediately (NOT for small bounded lead counts)

COMPANY/DOMAIN ANALYSIS RULE (CRITICAL):
When the user provides a company name or domain (e.g. "brandgate.dev", "my company Acme Corp") AND asks for leads/customers/prospects:
- You MUST call analyze_url on the company website BEFORE choosing what leads to find
- From the analysis, derive: what the company does, who their likely customers are, who is NOT a customer, geography hints, buyer roles
- NEVER guess the ICP from just a name. "brandgate.dev" could be anything — analyze first.
- If you are unsure after analysis, ask ONE precise follow-up question about their target customer instead of guessing.
- EVIDENCE-FIRST RULE: When presenting what you found, QUOTE the actual page title/description/tagline verbatim (e.g. "Your site says: 'B2B Distribution Platform for Brands'"). Do NOT rephrase it into a confident interpretation that changes the meaning (e.g. do NOT say "branding agency" if the site says "distribution platform").
- If the site evidence is ambiguous or thin, say so explicitly: "Based on your site I see [quote], but I'm not fully confident about your exact target customer — can you confirm who you typically sell to?"
- NEVER collapse vague evidence into a specific confident ICP. Wrong ICP = wrong leads = wasted time.

INTEGRATION READINESS GATE (applies to ALL providers — not just Attio):
When the user names any external destination (Attio, HubSpot, Salesforce, Pipedrive, Notion, Sheets, GitHub, Slack, or any other):
1. Check if the provider is connected in the active workspace (look at CONNECTOR REALITY CHECK below)
2. If NOT connected → call setup_integration immediately. Do NOT proceed with execution until it is connected.
3. After connection → call verify_integration to confirm readiness
4. Discover live provider facts (stage names, pipeline IDs, list IDs, repo access, etc.) before writing
5. NEVER tell the user "I'll add them to X" unless X is actually connected and verified
6. If the user says "add to Attio" but Attio is not connected, your FIRST action is setup_integration, not create_agent

UNIVERSAL CONNECTOR RULE — ANY API KEY SERVICE:
You can connect ANY service that has an API key — not just built-in connectors. This makes 2Hands work like OpenClaw: give it a key, it connects.
- For BUILT-IN providers (Attio, GitHub, Slack, OpenAI, etc.): call setup_integration directly
- For ANY OTHER service with an API: call register_custom_provider FIRST, then setup_integration
- The setup card shows the user exactly where to find their credentials plus a collapsible guide
- After the user submits credentials, the card automatically verifies the connection live
- NEVER say a service is "not supported" if it has an HTTP API — register it as a custom provider

CUSTOM PROVIDER FLOW (for services not in the built-in list):
1. Ask the user: "What's the API base URL for [service]?" (or look it up if you know it)
2. Call register_custom_provider with: id, name, base_url, auth_mode (usually "bearer_token" or "api_key")
3. Immediately call setup_integration with the returned provider_id
4. The user sees a credential card → submits their key → card auto-verifies
5. Once connected, use integration_call(provider, method, path) for all API calls
This should feel like ONE step to the user, not a fragmented multi-tool dance.

MANDATORY DISCOVERY BEFORE WRITES (applies to ALL providers):
Before the FIRST write operation to ANY connected provider in a session:
1. Call the provider's inspect/list tool if available (e.g. integration_attio_inspect_workspace, integration_github_list_repos)
2. Read workspace-specific values: stage names, pipeline IDs, list IDs, project IDs, branch names, etc.
3. Store these values mentally and use them verbatim in subsequent write calls
4. If no inspect tool exists, call integration_call with a GET to the provider's list/self endpoint
5. NEVER guess workspace-specific values — always discover them from the live API first
This prevents the #1 cause of integration failures: using assumed values that don't match the user's actual workspace configuration.

AGENT CREATION FLOW (for tasks that passed the plan-first check):
Your DEFAULT for simple tasks is to create agents IMMEDIATELY. Don't make them wait.

MISSION vs AGENT — choose the right model:
- ONE-SHOT task (deliverable is clear, finite): use create_agent immediately. Example: "write a market analysis", "scrape pricing from 5 sites".
  EXCEPTION — do NOT use create_agent for bounded lead-finding (≤20 records, one-shot). See BOUNDED LEAD-FINDING rule above — execute those directly inline.
- RECURRING / ONGOING goal (same work repeating OR strategic multi-week ambition): prefer compile_operation first, then a scheduled create_agent or propose_mission.
  Example: "find 10 leads per day and add to Attio" → compile_operation, NOT a direct execute and NOT a one-shot agent.
- STRATEGIC / MULTI-ASPECT goal (requires planning + multiple agent types over weeks): always propose_mission.

For web-research or lead-finding agents: set requires_credentials to false and assume browser automation is available. The agent MUST use its browser tools to actually find data — if it cannot access the web, it should report as FAILED/BLOCKED (not "completed"). Never let a research agent claim success if it couldn't open any pages.

For SIMPLE OBVIOUS tasks (single-step research, writing, analysis):
1. Respond: "On it — I'm putting [Name] on this now."
2. Call create_agent IMMEDIATELY
3. After creation: "[Name] is working on it. I'll report back when there are results."

For AMBIGUOUS or RISKY tasks (spending money, sending emails, deleting data):
1. Briefly clarify: "Just to confirm — you want me to [action]?"
2. Wait for their reply → then create_agent

For RECURRING tasks (monitoring, daily reports, scheduled work):
1. If the user already gave a cadence → use that exact cadence
2. If the cadence is missing, suggest one concise schedule
3. After create_agent, tell them the first run starts now unless they asked to wait

REMEMBER: The user came to 2Hands to get things done. For simple tasks, be fast. For complex multi-step tasks, plan first — speed without accuracy wastes the user's time.

AGENT DELETION:
You CAN delete agents. Use delete_agent to remove a single agent, or delete_all_agents to remove all at once.
- When user asks to delete one agent → confirm name/purpose, then call delete_agent with the agent_id
- When user asks to delete all agents → confirm once ("Delete all [N] agents?"), then call delete_all_agents with confirm: true

SMART SCHEDULE SUGGESTIONS:
- These are defaults only when the user has NOT specified a schedule
- If the user says "start now", "ASAP", "every day", "daily", or "weekends too", obey that exactly
- Support / tickets → every 30 min (*/30 * * * *)
- Outreach / follow-ups → daily 9 AM (0 9 * * *)
- Lead generation → daily 9 AM (0 9 * * *)
- Accounting → weekly Monday 9 AM (0 9 * * 1)
- Social media → daily 10 AM (0 10 * * *)
- Order processing → daily 8 AM (0 8 * * *)
- Monitoring → every 4 hours (0 */4 * * *)
- Reports → weekly Monday 8 AM (0 8 * * 1)
- Content → Mon/Wed/Fri 10 AM (0 10 * * 1,3,5)
- Recruitment → daily 9 AM (0 9 * * *)
- Customer success → daily 9 AM (0 9 * * *)

AUTONOMOUS OPERATOR MODE — ONE INSTRUCTION, ONGOING EXECUTION:
When the user describes recurring business work (e.g. "find me 10 leads per day and add to Attio in Lead", "monitor competitor pricing weekly", "enrich my CRM contacts daily"), use the compile_operation tool INSTEAD of jumping straight to create_agent.

WHEN TO USE compile_operation:
- User describes work that repeats on a schedule
- User specifies a target output count (e.g. "10 leads per day")
- User names a destination system (e.g. "add to Attio", "put in HubSpot")
- User describes a pipeline (source → enrich → write → verify)
- Keywords: "per day", "daily", "weekly", "every", "keep doing", "ongoing", "recurring", "continuously"

HOW TO USE IT:
1. Call compile_operation with action="compile" and user_request=<their exact request>
2. The tool returns a structured Operation Spec with: category, cadence, target count, destination, workflow stages, dedupe/verification policies
3. Present the compiled spec to the user as a clean summary
4. If required_integrations are not connected, connect them FIRST (setup_integration → verify)
5. Once the user confirms, call compile_operation with action="activate" and the operation_id
6. Then create the agent(s) needed to execute the operation, referencing the operation spec

OPERATOR PRINCIPLES:
- The user should say it ONCE. The system remembers and keeps executing.
- Ask only for truly missing information. If you can infer ICP, cadence, or enrichment needs from context, do it.
- Go beyond the explicit ask when useful: if the user says "find leads", also enrich them with firmographics, contact info, and fit scoring unless told not to.
- Verify every external write. Never claim CRM records were created without confirmation.
- Deduplicate by default. Never create duplicate records in a CRM.
- Report exceptions, not progress. The user doesn't need to hear "working on it" — they need to hear results and blockers.

INTEGRATIONS & CONNECTORS — THREE-TIER CAPABILITY MODEL:
You have two distinct ways to act inside external systems. ALWAYS pick the right tier:

TIER 1 — DIRECT CONNECTOR (preferred when available):
- Built-in: Slack, OpenAI, Perplexity, Firecrawl, ElevenLabs, GitHub, Discord, HubSpot, Shopify, Google Sheets/Calendar/Gmail, Notion, Outlook, Teams, Attio (all support API keys via setup_integration).
- If connected ✅: call integration_call(provider, method, path) directly — fast, reliable, no login needed.
- If available but not connected 🔌: call setup_integration to show the credential card. For API-key connectors the user pastes the key and it connects instantly. Call verify_integration immediately after.

INTEGRATION TOOL RULES (apply to ALL providers — Attio, HubSpot, GitHub, Slack, and any custom connector):
CRITICAL RULE ZERO: NEVER write "Let me check", "I'll call", "I'll inspect", "Testing X connection live", "Verifying...", "Connecting..." or any promise/status about what you WILL do or ARE doing. The moment you decide to act on an integration, call the tool immediately — do not narrate it.

OUTPUT FORMAT RULE — THINKING vs MESSAGE:
Your response has two layers:
1. THINKING (internal): Use your reasoning/thinking block for planning, analysis, and progress narration. This is shown in a separate "Thinking" panel — the user can see it but it is clearly labelled as your reasoning.
2. MESSAGE (user-facing): Your text reply must contain ONLY the final result the user needs to read. No status updates ("Testing...", "Verifying...", "Setting up..."), no action announcements ("I'll now call...", "Let me check..."), no progress narration. Write the result, not the process.
WRONG: "**Testing Attio connection live:** The connection failed."
RIGHT: Call verify_integration → then write "Attio connection failed — [reason]. Here's how to fix it: [steps]."

  USING TYPED INTEGRATION TOOLS (preferred path):
  - When you see tools named integration_<provider>_<action> (e.g. integration_attio_create_deal, integration_github_create_issue), use those DIRECTLY.
  - They are schema-validated, credential-managed, and return structured verification metadata.
  - If the user asks you to create, send, post, update, move, delete, or otherwise change data in a connected provider, you MUST call the relevant typed integration tool before writing any user-facing completion message.
  - If you did not call a typed integration tool (or integration_call for an unsupported endpoint), then the external action did NOT happen yet.
  - The result includes a _meta block: check _meta.verified_write (true/false) and _meta.operation_kind (read/write).
  - For write operations: only report success if _meta.verified_write is true OR the response contains a record_id/id field.
  - If _meta.verified_write is false after a write, either call a search/get tool to confirm, or tell the user the write may not have persisted.

FALLBACK — integration_call (use only for providers without typed tools, or unsupported endpoints):
- integration_call(provider, method, path, body) makes a raw HTTP call using stored credentials.
- Verify writes manually: check the response for record_id, id, or equivalent confirmation.
- NEVER claim a record was created unless the response contains an explicit identifier.

  RULES:
  - NEVER guess workspace-specific values (stage names, pipeline IDs, list IDs). Always discover them first.
  - NEVER claim an external record was created/updated unless the tool result confirms it with an id or verified_write.
  - For connected providers, a natural-language answer alone is never proof of execution. Tool result first, user-facing answer second.
  - NEVER output text saying you will call a tool — just call it.
  - For services NOT in the built-in list: call register_custom_provider(id, name, base_url, auth_mode) → setup_integration → then use integration_call.
  - NEVER route a service to browser automation or say it is unavailable if it has an API you can connect to.

TIER 2 — BROWSER AUTOMATION (use only when the service has no accessible HTTP API, or the user explicitly refuses the API key path):
- An agent can operate any web-based SaaS by logging in via browser — just like a human would.
- To use this path: tell the user clearly what you're doing, that login credentials are stored securely and never shared, and that success depends on login, 2FA, and page complexity.
- NEVER guarantee browser automation will work — it depends on login success, whether the site requires 2FA/CAPTCHA, and page complexity. Be honest about this.
- NEVER claim data was synced/pushed unless the agent actually completed the browser action successfully.

TIER 3 — GENUINELY NOT POSSIBLE (only use this tier):
- The site requires mandatory hardware 2FA, CAPTCHA on every action, or is otherwise not automatable via browser.
- In this case: say why clearly and offer a real fallback (CSV export, webhook, Zapier, manual handoff, or board).

RULES THAT APPLY TO ALL TIERS:
- NEVER say a system is unavailable just because it has no formal connector — check whether Tier 2 applies first.
- When helping with an integration: first explain what it does and give step-by-step instructions on where to find the required credentials, then call the setup_integration tool to show the credential input card.
- If the user asks "where do I find my API key for X?", give clear guidance using your knowledge of each service's settings page.
- CRITICAL: When a user says they submitted credentials or the card shows "Connected", you MUST immediately call verify_integration to do a live test. NEVER just say "I'll test it" or write [testing...] — actually call the tool. Report the exact result back to the user clearly (success with details, or failure with the reason).
- For GitHub: call verify_integration with connector_id "github" and the repo as "owner/repo" (e.g. "albin-holmgren/2Hands"). Report back: who you're authenticated as, whether the repo is accessible, and what branch you'll work on.
- NEVER call setup_integration without first explaining the steps to find the credentials.
- CRITICAL — INTEGRATION CALL FAILURES ARE HARD BLOCKERS: If integration_call or verify_integration returns { success: false }, you MUST report the failure immediately and accurately. NEVER claim the task succeeded, NEVER say records were created, and NEVER say the operation completed when the tool returned an error. Tell the user exactly what failed (provider, HTTP status, error message) and stop the current task until the issue is resolved or they instruct you to retry.
- CRITICAL — DO NOT HALLUCINATE API RESULTS: Only report data that actually came from a successful tool result. If a tool returned an error, the operation did NOT happen — do not invent success summaries.

MISSION MODE (long-running autonomous goals) — THIS IS THE CORE POWER FEATURE:
Missions are how you pursue ambitious, multi-week goals autonomously. Each "tick" (every 30–60 min), you act as an AI operator: picking the highest-leverage next action, spinning up specialist research agents, synthesizing findings, and advancing a structured goal tree. Think of it as having a full AI team quietly working in the background — reporting back when there's something worth knowing.

EXAMPLES OF POWERFUL MISSIONS:
- "Make my company worth $1 billion" → competitive intelligence, investor mapping, growth strategy, fundraising narrative
- "Grow our ARR to $1M" → ICP research, channel experiments, outreach sequences, conversion analysis
- "Hire a world-class CTO" → sourcing strategy, job spec, outreach campaigns, interview playbook
- "Dominate SEO for [keyword]" → content calendar, backlink strategy, competitor gap analysis, publishing pipeline
- "Launch a new product in 60 days" → market validation, feature scoping, go-to-market, launch plan

When to propose a Mission (use propose_mission tool):
- User states ANY ambitious or ongoing goal — even framed as a question ("how do I...?") if it's clearly multi-week work
- Keywords: "build", "grow", "scale", "make", "worth", "revenue", "hire", "launch", "improve", "dominate", "become", "raise", "fund", "$X", "billion", "million", "ARR"
- User says "keep working on X", "do this autonomously", "in the background", "over time"
- A task clearly requires intelligence gathering + strategy + execution over multiple sessions

Mission flow (follow exactly):
1. Detect mission intent — be GENEROUS with this. When in doubt, propose a mission.
2. If a mission for this goal ALREADY EXISTS (shown in ACTIVE MISSIONS below), say so — do NOT duplicate
3. Call propose_mission immediately with a clear goal formulation
4. WAIT for user confirmation (yes/go/start/sounds good)
5. Only after confirmation → call start_mission
6. Confirm warmly: "Mission launched — I'll work on [goal] autonomously and report back here after each tick. First update in ~30 minutes."

GITHUB WRITE CAPABILITY: You have full GitHub read/write tools available when the user has connected GitHub via Settings → Integrations:
- github_read_file — read any file from the repo
- github_list_directory — list files/dirs
- github_write_file — create or update a file (makes a real commit)
- github_create_branch — create a new branch
- github_create_pr — open a Pull Request
- github_get_pr_status — check PR merge/CI status
- github_list_issues / github_create_issue — issue management

Workflow for code changes:
1. Call github_list_directory to understand the repo structure
2. Call github_read_file on relevant files
3. Call github_create_branch to create a feature branch (e.g. "2hands-ai/fix-xyz")
4. Call github_write_file for each changed file on that branch
5. Call github_create_pr to open a PR for review
6. Report back: what you changed, the PR URL, and what it does

Always create a branch first — NEVER write directly to main. Use descriptive branch names like "2hands-ai/[task]-[date]". If GitHub is not connected, tell the user to connect it via Settings → Integrations.

PROACTIVE MISSION UPDATES: If the ACTIVE MISSIONS context shows any mission waiting for approval or overdue for a tick, mention it naturally at the start of your response (e.g. "By the way, your [goal] mission is waiting for your approval to run the next tick — head to the Missions page and hit 'Run now', or I can switch it to full auto if you'd like.")

NEVER:
- Dump all agent statuses when the user says hi
- Create agents for risky or ambiguous work before getting confirmation
- Start a mission without the user confirming
- Ask multiple questions at once
- Over-explain what agents do
- Be robotic or notification-like — be conversational
- Write directly to the main/master branch — always create a feature branch first
- Say "I'll test it" or "[testing now]" without actually calling verify_integration
- Claim you pushed code without actually calling github_write_file and getting a successful commit_sha back
- Say a mission is running if next_tick_in_minutes is highly negative without reporting the blocker
- Claim records, files, or data were created in an external system (Attio, HubSpot, GitHub, etc.) unless you received a successful tool result confirming it
- Summarize a failed integration_call as a success or partial success — failures must be reported as failures

Your name is ${aiName}.`

const HUMAN_AGENT_NAMES = ['Nova', 'Max', 'Aria', 'Sam', 'Leo', 'Zara', 'Kai', 'Mia', 'Finn', 'Jade', 'Eli', 'Luna', 'Theo', 'Maya', 'Axel', 'Cleo', 'Rex', 'Vera', 'Hugo', 'Isla']

function normalizeAgentName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : ''
  const isTaskStyle =
    /[A-Z][a-z]+[A-Z]/.test(name) ||          // camelCase / PascalCase compound (e.g. AttioDealCreator)
    /\d/.test(name) ||                          // contains digits (e.g. Nova2)
    / /.test(name) ||                           // multi-word
    name.length > 14 ||                         // too long for a first name
    name.length < 2 ||
    /(bot|finder|creator|agent|tracker|monitor|manager|analyzer|collector|researcher|writer|scraper|adder|reporter|fetcher|validator|qualifier|checker|detector|helper|runner|builder|fetcher)/i.test(name)
  if (isTaskStyle || !name) {
    return HUMAN_AGENT_NAMES[Math.floor(Math.random() * HUMAN_AGENT_NAMES.length)]
  }
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'set_ai_name',
    description: 'Set the AI assistant\'s name. Use this when the user tells you what they want to call you. This saves the name to their profile so you\'ll remember it in future conversations.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The name the user wants to call the AI assistant.'
        }
      },
      required: ['name']
    }
  },
  {
    name: 'set_user_name',
    description: 'Set the user\'s name for personalized interactions. Use this when the user tells you their name or what they want to be called.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The user\'s name or what they want to be called.'
        }
      },
      required: ['name']
    }
  },
  {
    name: 'create_agent',
    description: 'Create a new AI agent to perform a specific autonomous task. If schedule is already clear from the user, create it immediately; otherwise ask once about timing. Recurring agents should start their first run immediately unless the user asked to wait. Only set requires_credentials to true if the task genuinely needs login access.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'A short human first name for the agent — like a real person\'s name (e.g. "Nova", "Max", "Aria", "Sam", "Leo", "Zara", "Kai"). MUST be a single real first name. NEVER use task-based or compound names like "AttioLeadAdder", "LeadFinder", "ResearchBot", or "DataCollector". Pick from human first names only.'
        },
        type: {
          type: 'string',
          enum: ['web-research', 'email-assistant', 'data-analyst', 'file-organizer', 'custom'],
          description: 'The category of the agent.'
        },
        description: {
          type: 'string',
          description: 'A detailed description of what the agent should accomplish.'
        },
        schedule_type: {
          type: 'string',
          enum: ['once', 'scheduled', 'realtime'],
          description: 'How often the agent should run. "once" for one-time tasks, "scheduled" for recurring tasks, "realtime" for continuous monitoring.'
        },
        schedule_cron: {
          type: 'string',
          description: 'Cron expression for scheduled tasks. Examples: "0 */6 * * *" (every 6 hours), "0 9 * * *" (daily at 9am), "0 9 * * 1" (every Monday at 9am). Only required if schedule_type is "scheduled".'
        },
        schedule_timezone: {
          type: 'string',
          description: 'Timezone for the schedule (e.g., "America/New_York", "Europe/London", "UTC"). Default is UTC.'
        },
        requires_credentials: {
          type: 'boolean',
          description: 'Whether this task requires login credentials. Set to true ONLY for tasks accessing personal accounts (email, social media posting, banking, etc.). Set to false for public web research, monitoring public URLs, scraping public sites, etc.'
        },
        credential_services: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of services that need credentials (e.g., ["gmail", "twitter"]). Only include if requires_credentials is true.'
        }
      },
      required: ['name', 'type', 'description', 'schedule_type', 'requires_credentials']
    }
  },
  {
    name: 'delete_agent',
    description: 'Delete an existing agent. This will stop the agent, terminate any running VM, and remove it from the system. Use when the user wants to remove an agent they no longer need.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The ID of the agent to delete.'
        },
        agent_name: {
          type: 'string',
          description: 'The name of the agent to delete (used for confirmation).'
        }
      },
      required: []
    }
  },
  {
    name: 'delete_all_agents',
    description: 'Delete ALL agents at once. Use this when the user wants to remove all their agents. ALWAYS use this instead of delete_agent when the user wants to delete all or multiple agents.',
    input_schema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Must be true to confirm deletion of all agents.'
        }
      },
      required: ['confirm']
    }
  },
  {
    name: 'update_agent',
    description: 'Update an existing agent\'s configuration, mission, or schedule. Use this to modify agent settings.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The ID of the agent to update.'
        },
        name: {
          type: 'string',
          description: 'New name for the agent (optional).'
        },
        description: {
          type: 'string',
          description: 'Updated mission/description for the agent (optional).'
        },
        schedule_type: {
          type: 'string',
          enum: ['once', 'scheduled', 'realtime'],
          description: 'Updated schedule type (optional).'
        },
        schedule_cron: {
          type: 'string',
          description: 'Updated cron expression (optional).'
        },
        status: {
          type: 'string',
          enum: ['idle', 'working', 'terminated'],
          description: 'Set agent status. Use "terminated" to stop the agent, "idle" to pause, "working" to resume.'
        }
      },
      required: ['agent_id']
    }
  },
  {
    name: 'run_agent',
    description: 'Run an existing agent immediately. Use this when the user wants to trigger an agent to execute right now instead of waiting for its scheduled time.',
    input_schema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'The ID of the agent to run.'
        },
        agent_name: {
          type: 'string', 
          description: 'The name of the agent (for confirmation).'
        }
      },
      required: ['agent_id', 'agent_name']
    }
  },
  {
    name: 'get_agents_status',
    description: 'Get the current status of all agents. Use this to check on agent progress and provide updates to the user. Call this proactively to stay informed about what agents are doing.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'send_progress_update',
    description: 'Send a proactive update to the user about agent progress, insights, or suggestions. Use this when you want to share something important without waiting for the user to ask.',
    input_schema: {
      type: 'object',
      properties: {
        update_type: {
          type: 'string',
          enum: ['status', 'completion', 'error', 'insight', 'suggestion', 'cost_alert'],
          description: 'Type of update being sent.'
        },
        agent_id: {
          type: 'string',
          description: 'ID of the related agent (optional).'
        },
        message: {
          type: 'string',
          description: 'The update message to send to the user.'
        }
      },
      required: ['update_type', 'message']
    }
  },
  {
    name: 'schedule_follow_up',
    description: 'Schedule a follow-up message to the user. Use this when you promise to check on something, get back to the user, or want to send a proactive update later. The follow-up will appear as a new message in the chat after the specified delay. ALWAYS use this when you say things like "I\'ll check on that", "I\'ll get back to you", or "I\'ll let you know".',
    input_schema: {
      type: 'object',
      properties: {
        delay_minutes: {
          type: 'number',
          description: 'How many minutes from now to send the follow-up. Use 1-2 for "right away", 5-10 for "shortly", 30-60 for "later". Default: 5.'
        },
        message: {
          type: 'string',
          description: 'The follow-up message to deliver. Should be actionable and include context about what you were checking on.'
        },
        context: {
          type: 'string',
          description: 'Internal context about what to check (e.g., "check agent X status", "verify research results"). This helps the follow-up be useful.'
        },
        check_agents: {
          type: 'boolean',
          description: 'If true, the follow-up will include fresh agent status when delivered. Use when following up on agent tasks.'
        }
      },
      required: ['delay_minutes', 'message']
    }
  },
  {
    name: 'web_search',
    description: 'Search the web for real-time information. ALWAYS use this tool when the user explicitly asks you to search, look up, or find something. Also use when up-to-date facts are clearly needed. Do NOT use for general chat, brainstorming, or coding help unless the user asks.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to look up.'
        },
        num_results: {
          type: 'number',
          description: 'Number of results to return (default: 5, max: 10).'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'create_visual_report',
    description: 'Create a visual report, chart, or document for the user. Use this to present data beautifully, create summaries, or generate professional reports.',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Title of the report.'
        },
        type: {
          type: 'string',
          enum: ['summary', 'chart', 'table', 'timeline', 'comparison', 'dashboard'],
          description: 'Type of visual report to create.'
        },
        content: {
          type: 'string',
          description: 'The content/data for the report in markdown or structured format.'
        },
        data: {
          type: 'object',
          description: 'Structured data for charts/tables (optional).'
        }
      },
      required: ['title', 'type', 'content']
    }
  },
  {
    name: 'analyze_url',
    description: 'Fetch and analyze content from a URL. Use this to read articles, analyze websites, extract information from web pages.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to analyze.'
        },
        extract_type: {
          type: 'string',
          enum: ['full_content', 'summary', 'key_points', 'metadata', 'links'],
          description: 'What to extract from the page.'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'calculate',
    description: 'Perform calculations, conversions, or mathematical operations. Use for financial calculations, unit conversions, statistics, etc.',
    input_schema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'The mathematical expression or calculation to perform.'
        },
        context: {
          type: 'string',
          description: 'Context for the calculation (e.g., "currency conversion", "percentage", "statistics").'
        }
      },
      required: ['expression']
    }
  },
  {
    name: 'set_reminder',
    description: 'Set a reminder for the user. Use this to help users remember important tasks, follow-ups, or deadlines.',
    input_schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The reminder message.'
        },
        when: {
          type: 'string',
          description: 'When to remind (e.g., "in 1 hour", "tomorrow at 9am", "next Monday").'
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Priority level of the reminder.'
        }
      },
      required: ['message', 'when']
    }
  },
  {
    name: 'create_summary',
    description: 'Create a concise summary of information, conversations, or data. Use for executive summaries, meeting notes, or condensing large amounts of information.',
    input_schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The content to summarize.'
        },
        format: {
          type: 'string',
          enum: ['bullet_points', 'paragraph', 'executive_summary', 'tldr'],
          description: 'Format of the summary.'
        },
        max_length: {
          type: 'number',
          description: 'Maximum length in words (optional).'
        }
      },
      required: ['content', 'format']
    }
  },
  {
    name: 'propose_mission',
    description: `Propose a new long-running autonomous Mission. Use this when the user mentions a long-horizon goal such as:
- "grow my startup to $1M ARR"
- "keep improving our product"
- "research competitors every week"
- "build our content marketing engine"
- "run outreach indefinitely"
- "monitor our brand online"

Write the goal as a concrete, measurable outcome. Examples of GOOD goals:
- "Grow 2hands.ai to 1,000 paying users by Q4 2025 by researching growth channels, improving activation, and launching targeted campaigns"
- "Build a competitive intelligence system that tracks 10 top competitors and surfaces weekly insights for product and pricing decisions"
- "Create a content marketing engine that publishes 3 SEO-optimised blog posts per week and grows organic traffic by 50%"

The goal should be specific enough that the AI can break it into projects and tasks.`,
    input_schema: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description: 'The mission goal — specific, measurable, and outcome-oriented. 1-3 sentences max.'
        },
        why: {
          type: 'string',
          description: 'One sentence explaining why this mission will move the needle.'
        },
        first_steps: {
          type: 'string',
          description: 'A 2-4 bullet outline of what the first few ticks will focus on (be specific, not generic).'
        },
        autonomy_level: {
          type: 'string',
          enum: ['draft_only', 'execute_with_approval', 'full_auto'],
          description: 'How autonomously the AI should execute. Default: full_auto.'
        },
        tick_timebox_minutes: {
          type: 'number',
          description: 'Minutes per background work session. Default: 30. Use 20 for research-only missions, 45 for complex engineering missions.'
        },
        company_context: {
          type: 'string',
          description: 'Optional but highly recommended: company/user context to make the plan hyper-specific. Include: industry, current ARR/stage, team size, main challenge, key constraints. Example: "B2B SaaS, $50K ARR, 3-person team, event management space, main bottleneck is activation"'
        }
      },
      required: ['goal', 'why', 'first_steps']
    }
  },
  {
    name: 'start_mission',
    description: 'Confirm and start a proposed mission after the user has explicitly approved it. Only call this after the user says yes / confirmed / go ahead / start it / proceed.',
    input_schema: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description: 'The mission goal (exact text from propose_mission).'
        },
        autonomy_level: {
          type: 'string',
          enum: ['draft_only', 'execute_with_approval', 'full_auto']
        },
        tick_timebox_minutes: {
          type: 'number',
          description: 'Minutes per background work session. Default: 30.'
        },
        company_context: {
          type: 'string',
          description: 'Company/user context gathered during proposal (if any). Passed into the mission planner.'
        },
        self_improvement: {
          type: 'boolean',
          description: 'Set to true when the mission is for the AI to improve its own codebase (2Hands self-building mission).'
        },
        repo_config: {
          type: 'object',
          description: 'Repository access config for self-improvement missions.',
          properties: {
            owner: { type: 'string' },
            repo: { type: 'string' },
            base_branch: { type: 'string' }
          }
        }
      },
      required: ['goal']
    }
  },
  {
    name: 'mission_status',
    description: 'Get the status of active missions — what they are working on, what was accomplished, next steps. Use when user asks about mission progress.',
    input_schema: {
      type: 'object',
      properties: {
        mission_id: {
          type: 'string',
          description: 'Specific mission ID (optional — if not provided, shows all active missions).'
        }
      },
      required: []
    }
  },
  {
    name: 'pause_mission',
    description: 'Pause an active mission. The mission will stop running background ticks until resumed.',
    input_schema: {
      type: 'object',
      properties: {
        mission_id: {
          type: 'string',
          description: 'The ID of the mission to pause.'
        }
      },
      required: ['mission_id']
    }
  },
  {
    name: 'resume_mission',
    description: 'Resume a paused mission.',
    input_schema: {
      type: 'object',
      properties: {
        mission_id: {
          type: 'string',
          description: 'The ID of the mission to resume.'
        }
      },
      required: ['mission_id']
    }
  },
  {
    name: 'update_mission',
    description: 'Update an existing mission — change autonomy level, goal, or set repo_config for self-improvement missions. Use this to attach a GitHub repo to a running mission.',
    input_schema: {
      type: 'object',
      properties: {
        mission_id: { type: 'string', description: 'ID of the mission to update.' },
        autonomy_level: { type: 'string', description: 'New autonomy level: full_auto, execute_with_approval, or draft_only.' },
        goal: { type: 'string', description: 'Updated mission goal text.' },
        repo_config: {
          type: 'object',
          description: 'GitHub repo access for self-improvement missions.',
          properties: {
            owner: { type: 'string', description: 'GitHub org or username, e.g. albin-holmgren' },
            repo: { type: 'string', description: 'Repo name, e.g. 2Hands' },
            base_branch: { type: 'string', description: 'Branch to create PRs against, e.g. dev' },
            vercel_project_id: { type: 'string', description: 'Optional Vercel project ID for deployment triggers.' }
          }
        }
      },
      required: ['mission_id']
    }
  },
  {
    name: 'delete_mission',
    description: 'Permanently delete a mission and all its events. Only use after the user explicitly confirms they want to delete it.',
    input_schema: {
      type: 'object',
      properties: {
        mission_id: {
          type: 'string',
          description: 'The ID of the mission to delete.'
        }
      },
      required: ['mission_id']
    }
  },
  {
    name: 'register_custom_provider',
    description: 'Register a new custom integration provider so the user can connect any API-key or OAuth service not already in the built-in connector list. Call this when the user wants to connect a service that is not in the standard connectors. After registering, call setup_integration with the returned provider_id to show the credential input card.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Short slug for this provider, e.g. "my-crm" or "pipedrive". Lowercase, no spaces.' },
        name: { type: 'string', description: 'Human-readable name, e.g. "Pipedrive".' },
        base_url: { type: 'string', description: 'API base URL, e.g. "https://api.pipedrive.com/v1".' },
        auth_mode: { type: 'string', enum: ['api_key', 'bearer_token', 'custom_headers', 'oauth'], description: 'How the API authenticates.' },
        auth_header_name: { type: 'string', description: 'HTTP header for the credential, e.g. "Authorization" or "x-api-key".' },
        auth_header_prefix: { type: 'string', description: 'Optional prefix, e.g. "Bearer " or "Token ".' },
        credential_field_label: { type: 'string', description: 'Label shown to user for the credential input, e.g. "API Key" or "Personal Token".' },
        verify_path: { type: 'string', description: 'Optional path to call to verify the key, e.g. "/user" or "/me".' },
        openapi_spec_url: { type: 'string', description: 'Optional OpenAPI/Swagger spec URL for automatic tool generation.' },
        oauth_auth_url: { type: 'string', description: 'OAuth only: authorization URL.' },
        oauth_token_url: { type: 'string', description: 'OAuth only: token exchange URL.' },
        oauth_scopes: { type: 'string', description: 'OAuth only: space-separated scopes.' },
      },
      required: ['id', 'name', 'base_url', 'auth_mode']
    }
  },
  {
    name: 'setup_integration',
    description: 'Show an inline integration setup card in the chat so the user can connect a service. Use this AFTER explaining what the integration does and how to find the required credentials. Built-in connectors: slack, openai, perplexity, firecrawl, elevenlabs, stripe, supabase, github, gmail, hubspot, shopify, zapier, attio. For any other API-key service, first call register_custom_provider then call setup_integration with the returned id. Call this tool to render the credential input form.',
    input_schema: {
      type: 'object',
      properties: {
        connector_id: {
          type: 'string',
          description: 'The ID of the connector to set up (e.g., "slack", "openai", "perplexity").'
        }
      },
      required: ['connector_id']
    }
  },
  {
    name: 'integration_call',
    description: 'Make a live HTTP call to any connected integration using its stored credentials. Works for Attio, OpenAI, GitHub, ElevenLabs, Firecrawl, and any custom provider registered via register_custom_provider. Requires the provider to be connected (✅ in CONNECTOR REALITY CHECK). Examples — Attio: provider="attio" path="objects/people/records"; GitHub: provider="github" path="user"; OpenAI: provider="openai" path="models".',
    input_schema: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'Provider id, e.g. "attio", "github", "openai", or your custom provider id.' },
        method: { type: 'string', description: 'HTTP method: GET, POST, PATCH, DELETE.' },
        path: { type: 'string', description: 'API path relative to provider base URL (no leading slash needed), e.g. "self" or "objects/people/records".' },
        body: { type: 'object', description: 'Request body for POST/PATCH.' },
        query: { type: 'object', description: 'Optional query parameters as key-value pairs.' },
      },
      required: ['provider', 'method', 'path']
    }
  },
  {
    name: 'verify_integration',
    description: 'Test that a connected integration actually works by making a live API call. ALWAYS call this immediately after setup_integration succeeds. Never just say you will test it — actually call this tool and report the result.',
    input_schema: {
      type: 'object',
      properties: {
        connector_id: {
          type: 'string',
          description: 'The connector to verify (e.g., "github", "slack", "openai").'
        },
        repo: {
          type: 'string',
          description: 'For GitHub: the owner/repo to verify access to (e.g., "albin-holmgren/2Hands").'
        }
      },
      required: ['connector_id']
    }
  },
  {
    name: 'github_read_file',
    description: 'Read a file from a connected GitHub repository.',
    input_schema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repo owner (username or org).' },
        repo: { type: 'string', description: 'Repository name.' },
        path: { type: 'string', description: 'File path relative to repo root.' },
        ref: { type: 'string', description: 'Branch, tag, or commit SHA. Default: main.' },
      },
      required: ['owner', 'repo', 'path']
    }
  },
  {
    name: 'github_list_directory',
    description: 'List files and directories in a GitHub repository path.',
    input_schema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        path: { type: 'string', description: 'Directory path. Use "" for root.' },
        ref: { type: 'string', description: 'Branch or ref. Default: main.' },
      },
      required: ['owner', 'repo', 'path']
    }
  },
  {
    name: 'github_write_file',
    description: 'Create or update a file in a GitHub repository, making a commit. Use this to push code changes.',
    input_schema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        path: { type: 'string', description: 'File path relative to repo root.' },
        content: { type: 'string', description: 'Full file content (plain text).' },
        message: { type: 'string', description: 'Commit message.' },
        branch: { type: 'string', description: 'Branch to write to.' },
      },
      required: ['owner', 'repo', 'path', 'content', 'message', 'branch']
    }
  },
  {
    name: 'github_create_branch',
    description: 'Create a new branch in a GitHub repository.',
    input_schema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        branch: { type: 'string', description: 'New branch name.' },
        from: { type: 'string', description: 'Branch/ref to branch from. Default: main.' },
      },
      required: ['owner', 'repo', 'branch']
    }
  },
  {
    name: 'github_create_pr',
    description: 'Open a Pull Request in a GitHub repository.',
    input_schema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        title: { type: 'string', description: 'PR title.' },
        body: { type: 'string', description: 'PR description.' },
        head: { type: 'string', description: 'Feature branch name.' },
        base: { type: 'string', description: 'Target branch. Default: main.' },
      },
      required: ['owner', 'repo', 'title', 'body', 'head']
    }
  },
  {
    name: 'github_get_pr_status',
    description: 'Get the status of a Pull Request — merge status, CI checks, review state.',
    input_schema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        pr_number: { type: 'number', description: 'Pull Request number.' },
      },
      required: ['owner', 'repo', 'pr_number']
    }
  },
  {
    name: 'github_list_issues',
    description: 'List issues in a GitHub repository.',
    input_schema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Issue state filter. Default: open.' },
        label: { type: 'string', description: 'Filter by label (optional).' },
        per_page: { type: 'number', description: 'Max results. Default: 20.' },
      },
      required: ['owner', 'repo']
    }
  },
  {
    name: 'github_create_issue',
    description: 'Create a new issue in a GitHub repository.',
    input_schema: {
      type: 'object',
      properties: {
        owner: { type: 'string' },
        repo: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Issue labels (optional).' },
      },
      required: ['owner', 'repo', 'title', 'body']
    }
  },
  // ── Workspace Tools: Memory, Board, Calendar, Recurring Tasks ──────
  {
    name: 'manage_memory_box',
    description: 'Create, list, or manage Memory Boxes — thematic containers that organise workspace knowledge. Use this to store important information the user wants you to remember, or to proactively organise what you learn. Categories: persona (user info), projects (active work), knowledge (facts/research), operations (how-tos), context (current session). ALWAYS use this when the user says "remember this", "keep track of", or shares important context you should retain.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create_box', 'list_boxes', 'add_memory', 'search'],
          description: 'Action to perform.'
        },
        name: { type: 'string', description: 'Box name (for create_box).' },
        description: { type: 'string', description: 'Box description (for create_box).' },
        category: {
          type: 'string',
          enum: ['persona', 'projects', 'knowledge', 'operations', 'context'],
          description: 'Box category (for create_box). Default: knowledge.'
        },
        box_id: { type: 'string', description: 'Target box ID (for add_memory).' },
        content: { type: 'string', description: 'Memory content to store (for add_memory).' },
        memory_type: {
          type: 'string',
          enum: ['user_fact', 'preference', 'context', 'topic', 'request', 'insight'],
          description: 'Memory type (for add_memory). Default: context.'
        },
        importance: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Importance level (for add_memory). Default: medium.'
        },
        query: { type: 'string', description: 'Search query (for search action).' }
      },
      required: ['action']
    }
  },
  {
    name: 'manage_board',
    description: 'Manage the Kanban board — create cards, move cards between columns, or check board state. Columns: inbox, up_next, in_progress, in_review, done, blocked. Use this to track tasks, create action items from conversations, or check what work is pending.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get_board', 'create_card', 'move_card', 'delete_card'],
          description: 'Action to perform.'
        },
        title: { type: 'string', description: 'Card title (for create_card).' },
        description: { type: 'string', description: 'Card description (for create_card).' },
        column: {
          type: 'string',
          enum: ['inbox', 'up_next', 'in_progress', 'in_review', 'done', 'blocked'],
          description: 'Target column (for create_card or move_card). Default: inbox.'
        },
        card_id: { type: 'string', description: 'Card ID (for move_card or delete_card).' },
        column_filter: { type: 'string', description: 'Filter board by column (for get_board, optional).' }
      },
      required: ['action']
    }
  },
  {
    name: 'manage_recurring_task',
    description: 'Create, list, or manage recurring tasks that run on a schedule. Use this when the user wants something done regularly (daily reports, weekly checks, monitoring). Schedule presets: every_hour, every_6_hours, daily_9am, daily_6pm, weekdays_9am, weekly_monday, weekly_friday, monthly_1st. Or use a cron expression like "0 9 * * 1-5" for custom schedules.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list', 'update', 'pause', 'resume', 'delete'],
          description: 'Action to perform.'
        },
        title: { type: 'string', description: 'Task title (for create).' },
        description: { type: 'string', description: 'What the task should do (for create).' },
        schedule: { type: 'string', description: 'Schedule preset name or cron expression (for create/update).' },
        timezone: { type: 'string', description: 'Timezone for schedule. Default: UTC.' },
        task_type: {
          type: 'string',
          enum: ['research', 'monitor', 'report', 'action'],
          description: 'Type of recurring task. Default: action.'
        },
        output_destination: {
          type: 'string',
          enum: ['board', 'memory', 'chat'],
          description: 'Where to put results. Default: board.'
        },
        task_id: { type: 'string', description: 'Task ID (for update/pause/resume/delete).' },
        status_filter: {
          type: 'string',
          enum: ['active', 'paused', 'completed', 'failed'],
          description: 'Filter for list action (optional).'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'compile_operation',
    description: `Compile a user's recurring work request into a durable Operation Spec. Use this when the user describes ongoing or repeating work (e.g. "find me 10 leads per day and add to Attio", "monitor competitor pricing weekly", "enrich my CRM contacts"). This creates a structured operating contract that the system can execute autonomously. Actions: compile (analyze request and create spec draft), list (show active operations), get (get details of one operation), activate (start running an operation), pause, resume, delete.`,
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['compile', 'list', 'get', 'activate', 'pause', 'resume', 'delete'],
          description: 'Action to perform.'
        },
        user_request: { type: 'string', description: 'The user\'s original request (for compile action).' },
        operation_id: { type: 'string', description: 'Operation ID (for get/activate/pause/resume/delete).' },
        overrides: {
          type: 'object',
          description: 'Optional overrides for the compiled spec (for compile action). E.g. { target_output_count: 20, cadence: "0 9 * * 1-5" }',
        },
      },
      required: ['action']
    }
  }
]

// Helper: decrypt stored GitHub PAT for a user
async function getGitHubPatForUser(userId: string): Promise<{ pat: string } | { error: string }> {
  const { createAdminClient: _adminForPat } = await import('@/lib/supabase/admin')
  const db = _adminForPat()
  const { data: conn } = await db
    .from('integration_connections')
    .select('config')
    .eq('user_id', userId)
    .eq('provider', 'github')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (!conn) return { error: 'No active GitHub connection. Ask the user to connect GitHub first via Settings → Integrations.' }
  const credentialId = typeof (conn as { config: Record<string, unknown> }).config?.credential_id === 'string'
    ? (conn as { config: Record<string, unknown> }).config.credential_id as string
    : null
  if (!credentialId) return { error: 'GitHub connected but no credential stored.' }
  const { data: cred } = await db.from('credentials').select('encrypted_data, iv').eq('id', credentialId).single()
  if (!cred) return { error: 'Credential record not found.' }
  const keyHex = (process.env.CREDENTIAL_ENCRYPTION_KEY || '').trim()
  if (!keyHex) return { error: 'Server misconfigured: CREDENTIAL_ENCRYPTION_KEY not set.' }
  const key = Buffer.from(keyHex, 'hex')
  const parts = (cred as { encrypted_data: string; iv: string }).encrypted_data.split(':')
  let decryptedJson = ''
  if (parts.length === 3) {
    const [ivHex, authTagHex, ciphertext] = parts
    const { createDecipheriv } = await import('crypto')
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'), { authTagLength: 16 })
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
    decryptedJson = decipher.update(ciphertext, 'hex', 'utf8') + decipher.final('utf8')
  }
  const parsed = decryptedJson ? JSON.parse(decryptedJson) as Record<string, unknown> : {}
  const pat = typeof parsed.personal_access_token === 'string' ? parsed.personal_access_token : ''
  if (!pat) return { error: 'GitHub token not found in stored credentials.' }
  return { pat }
}


export async function POST(request: NextRequest) {
  try {
    // Check for Bearer token (mobile) or cookies (web)
    const authHeader = request.headers.get('Authorization')
    let supabase = await createClient()
    let user = null
    
    if (authHeader?.startsWith('Bearer ')) {
      // Mobile auth - use token directly
      const token = authHeader.substring(7)
      const { createClient: createBrowserClient } = await import('@supabase/supabase-js')
      const supabaseWithToken = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        }
      )
      const { data: { user: tokenUser }, error } = await supabaseWithToken.auth.getUser(token)
      if (!error && tokenUser) {
        user = tokenUser
        supabase = supabaseWithToken
      }
    } else {
      // Web auth - use cookies
      const { data: { user: cookieUser }, error } = await supabase.auth.getUser()
      if (!error) user = cookieUser
    }
    
    if (!user) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Get access token for forwarding to internal API calls (e.g. run_agent fetch)
    let userAccessToken: string | null = null
    if (authHeader?.startsWith('Bearer ')) {
      userAccessToken = authHeader.substring(7)
    } else {
      const { data: { session } } = await supabase.auth.getSession()
      userAccessToken = session?.access_token ?? null
    }

    // Rate limiting - prevent API cost abuse
    const rateKey = createRateLimitKey(user.id, 'chat')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.chatMessage)
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Too many requests. Please wait before sending more messages.',
          retryAfter: Math.ceil((rateCheck.resetAt - Date.now()) / 1000)
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const parsed = await parseAndValidate(request, chatApiRequestSchema)
    if (!parsed.success) {
      return new Response(JSON.stringify(validationErrorResponse(parsed.error)), {
        status: parsed.status,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const { messages, conversationId, agentId, model: requestedModel, assistantMsgId } = parsed.data

    // Resolve workspace scope from cookie
    const cookies = request.cookies
    const preferredWorkspaceId = cookies.get('2hands_active_workspace_id')?.value
    let conversationWorkspaceId: string | null = null
    if (conversationId) {
      const { data: conversationScope, error: conversationScopeErr } = await supabase
        .from('conversations')
        .select('workspace_id')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (conversationScopeErr) {
        console.warn('[Chat Scope] Failed to resolve workspace from conversation:', conversationScopeErr)
      }

      const conv = conversationScope as { workspace_id: string | null } | null
      conversationWorkspaceId = conv?.workspace_id ?? null
      if (conversationWorkspaceId && preferredWorkspaceId && conversationWorkspaceId !== preferredWorkspaceId) {
        console.warn('[Chat Scope] Cookie workspace differs from conversation workspace. Using conversation workspace.', {
          preferredWorkspaceId,
          conversationWorkspaceId,
          conversationId,
        })
      }
    }

    const scopeWorkspaceHint = conversationWorkspaceId || preferredWorkspaceId || null
    const scope = await resolveWorkspaceScope(user.id, scopeWorkspaceHint, {
      strictPreferred: Boolean(scopeWorkspaceHint),
    })
    if (!scope.workspaceId) {
      return new Response('No workspace available', { status: 403 })
    }

    // OPTIMIZATION: Parallel fetch of all user data (reduces TTFB significantly)
    const [
      { data: profile },
      { data: userSettings },
      { data: agents },
      { data: workspaceRaw },
    ] = await Promise.all([
      supabase.from('profiles').select('ai_name, full_name').eq('id', user.id).single(),
      supabase.from('user_settings').select('voice_profile, voice_mirroring_level, preferred_style').eq('user_id', user.id).single(),
      createAdminClient().from('agents').select('id, name, status, schedule_type, last_run_at, next_run_at, config, total_credits_used').eq('user_id', user.id).eq('workspace_id', scope.workspaceId).order('last_active', { ascending: false }),
      supabase.from('workspaces').select('credits_balance, plan_type, ai_name').eq('id', scope.workspaceId).single(),
    ])

    const profileData = profile as { ai_name: string | null; full_name: string | null } | null
    const userName = profileData?.full_name || 'there'
    
    const workspaceData = workspaceRaw as { credits_balance: number | null; plan_type: string | null; ai_name: string | null } | null
    const aiName = workspaceData?.ai_name || '2Hands'
    // null means the workspace is brand-new and its credit row hasn't been initialised yet — treat as fresh/allowed.
    // Only hard-gate when the balance is explicitly a number at or below 0.
    const workspaceCredits = workspaceData?.credits_balance ?? null
    const planType = workspaceData?.plan_type || 'free'
    
    // Build credit warning context
    let creditWarning = ''
    if (workspaceCredits !== null && workspaceCredits <= 50 && workspaceCredits > 0) {
      creditWarning = `\n\nCREDIT WARNING: This workspace has only ${workspaceCredits} credits remaining (${planType} plan). Gently mention they're running low and suggest upgrading or buying a credit pack if they try to create a new agent.`
    } else if (workspaceCredits !== null && workspaceCredits <= 0) {
      // HARD CREDIT GATE: Block all AI usage when credits are explicitly depleted
      console.log(`[Credit Gate] Workspace ${scope.workspaceId} has ${workspaceCredits} credits — blocking chat request`)
      const encoder = new TextEncoder()
      const outOfCreditsStream = new ReadableStream({
        start(controller) {
          const msg = `This workspace has run out of credits on its **${planType}** plan. To keep chatting and running agents, please upgrade your plan or purchase a credit pack in **Settings → Billing**.\n\nI'm here as soon as you're topped up!`
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: msg })}\n\n`))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        },
      })
      return new Response(outOfCreditsStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }
    
    // Smart pricing context (non-blocking) — pass workspaceId so it reflects UI badge balance
    const pricingContext = await getPricingContext(user.id, scope.workspaceId || undefined).catch(() => '')

    // Voice mirroring settings
    const settingsData = userSettings as { 
      voice_profile: { brevity: string; directness: string; tone: string; structure_preference: string; wants_reassurance: boolean } | null
      voice_mirroring_level: string | null
      preferred_style: string | null 
    } | null
    const voiceProfile = settingsData?.voice_profile
    const mirroringLevel = settingsData?.voice_mirroring_level || 'medium'
    const preferredStyle = settingsData?.preferred_style || 'operator'

    let agentStatuses = ''
    const agentList = (agents && agents.length > 0) ? agents as Array<{
      id: string
      name: string
      status: string
      schedule_type: string
      last_run_at: string | null
      next_run_at: string | null
      config: {
        description?: string
        goal_tree_active?: boolean
        auto_continue?: boolean
        last_error?: string | null
        last_error_at?: string | null
        last_progress?: { type?: string; message?: string; timestamp?: string } | null
        last_run_summary?: string | null
        active_run_task?: string | null
      } | null
      total_credits_used: number
    }> : []
    if (agentList.length > 0) {
      agentStatuses = agentList.map(a => {
        const lastRun = a.last_run_at ? new Date(a.last_run_at).toLocaleString() : 'Never'
        const nextRun = a.next_run_at ? new Date(a.next_run_at).toLocaleString() : 'N/A'
        const cfg = a.config || {}
        const errorNote = cfg.last_error ? ` | LastError=${cfg.last_error.slice(0, 120)}` : ''
        const progressNote = cfg.last_progress?.message ? ` | LastProgress=${cfg.last_progress.message.slice(0, 120)}` : ''
        const summaryNote = cfg.last_run_summary ? ` | LastRunSummary=${cfg.last_run_summary.slice(0, 200)}` : ''
        const taskNote = (a.status === 'working' || a.status === 'initializing') && cfg.active_run_task ? ` | ActiveTask=${cfg.active_run_task.slice(0, 100)}` : ''
        return `- ${a.name} (${a.id}): Status=${a.status}${taskNote}, Type=${a.schedule_type}, LastRun=${lastRun}, NextRun=${nextRun}, Credits=${a.total_credits_used || 0}${errorNote}${progressNote}${summaryNote}`
      }).join('\n')
    }

    const internalApiBaseUrl = request.nextUrl.origin
    
    // Check if this is an agent-specific chat (not AI Manager)
    interface AgentChatData { id: string; name: string; config: { description?: string } | null }
    let agentChatData: AgentChatData | null = null
    if (agentId) {
      const { data: agent } = await supabase
        .from('agents')
        .select('id, name, config')
        .eq('id', agentId)
        .eq('user_id', user.id)
        .eq('workspace_id', scope.workspaceId)
        .single()
      if (agent) {
        agentChatData = agent as AgentChatData
      }
    }
    const isAgentChat = !!agentChatData
    
    // Only ask for name on the FIRST message (when there's only 1 message in the request)
    // After that, use default name and don't keep asking repeatedly
    const needsName = !isAgentChat && !workspaceData?.ai_name && messages.length <= 1

    // OPTIMIZATION: Parallel fetch of personalization, state, memories, and messages
    const [userProfile, conversationState, aiMemories, dbMessagesResult, convSummaryResult] = await Promise.all([
      getUserPersonalization(user.id, scope.workspaceId),
      getConversationState(user.id),
      getMemories(user.id, scope.workspaceId, 30),
      conversationId 
        ? supabase.from('messages').select('role, content, created_at').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(20)
        : Promise.resolve({ data: null }),
      conversationId
        ? supabase.from('conversations').select('summary').eq('id', conversationId).single()
        : Promise.resolve({ data: null }),
    ])
    
    const memoryPrompt = formatMemoriesForPrompt(aiMemories)
    const convSummary = (convSummaryResult?.data as { summary?: string } | null)?.summary || ''
    const conversationSummaryPrompt = convSummary
      ? `\n=== CONVERSATION SUMMARY (earlier context beyond the messages below) ===\n${convSummary}\n`
      : ''
    const stateInstructions = buildStateInstructions(conversationState)
    
    // Check if this is a brand new conversation (no messages yet) - for new workspace experience
    const isNewConversation = !dbMessagesResult.data || dbMessagesResult.data.length === 0
    const isWorkspaceOnboarding = isNewConversation && messages.length <= 1

    // Build smart agent digest (needs userProfile)
    let digestPromptSection = ''
    let retentionContext = ''
    if (agentList.length > 0) {
      try {
        const digest = await buildAgentDigest(user.id, agentList as import('@/lib/personalization/agent-digest').AgentStatus[], userProfile)
        digestPromptSection = digest.promptSection
      } catch (digestErr) {
        console.error('[Chat] Failed to build agent digest:', digestErr)
      }
    }

    // Get behavior-driven retention context (non-blocking, best-effort)
    // Skip for new workspace conversations to avoid carrying over stats from other workspaces
    if (!isNewConversation) {
      try {
        const behaviorProfile = await getBehaviorProfile(user.id)
        retentionContext = getRetentionContext(behaviorProfile)
      } catch {
        // Behavior profile not available yet — skip
      }
    }
    
    // Fire-and-forget: Feed behavior engine — session & message signals
    // Only for existing conversations, not new workspace greetings
    if (!isNewConversation) {
      recordBehaviorSignal(user.id, { type: 'session_start' }).catch(() => {})
      recordBehaviorSignal(user.id, { type: 'message_sent' }).catch(() => {})
    }

    // Process DB messages
    let contextMessages: Array<{ role: 'user' | 'assistant'; content: string | any[] }> = []
    if (dbMessagesResult.data && dbMessagesResult.data.length > 0) {
      contextMessages = (dbMessagesResult.data as Array<{ role: string; content: string; created_at: string }>)
        .filter(m => m.content && m.content.trim() && (m.role === 'user' || m.role === 'assistant'))
        .reverse()
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    }

    // DEFERRED: Non-blocking background operations (don't wait for these)
    const userMessage = messages[messages.length - 1]?.content
    const userMessageStr = typeof userMessage === 'string' ? userMessage : ''

    // ── Mission confirmation fast-path ────────────────────────────────────────
    // If there is a pending mission proposal and the user's message is a
    // confirmation, create the mission directly WITHOUT going through the LLM.
    // This makes mission acceptance 100% reliable regardless of LLM behaviour.
    if (
      conversationState.pendingConfirmation?.type === 'start_mission' &&
      scope.workspaceId &&
      /\b(yes|yeah|yep|ok|okay|sure|go|start|proceed|let'?s?(?: do it)?|do it|absolutely|definitely|confirm|great|sounds good|perfect)\b/i.test(userMessageStr)
    ) {
      const proposal = conversationState.pendingConfirmation.details as {
        goal: string
        autonomy_level: string
        tick_timebox_minutes: number
      }
      const _enc = new TextEncoder()
      const missionStream = new ReadableStream({
        async start(ctrl) {
          try {
            const newMission = await createMission({
              workspace_id: scope.workspaceId!,
              user_id: user.id,
              goal: proposal.goal,
              autonomy_level: (proposal.autonomy_level as 'draft_only' | 'execute_with_approval' | 'full_auto') || 'full_auto',
              tick_timebox_minutes: proposal.tick_timebox_minutes || 30,
              min_tick_interval_minutes: 15,
              max_ticks_per_day: 24,
              conversation_id: conversationId || undefined,
            })
            if (newMission) {
              // Kick the mission runner immediately so first tick happens in seconds
              const cronSecret = (process.env.CRON_SECRET || '').trim()
              if (cronSecret) {
                fetch(`${internalApiBaseUrl}/api/missions/runner`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
                }).catch(() => {})
              }
              ctrl.enqueue(_enc.encode(`data: ${JSON.stringify({
                type: 'mission_started',
                mission: { id: newMission.id, goal: newMission.goal, status: newMission.status, next_tick_at: newMission.next_tick_at },
              })}\n\n`))
              const confirmText = `Mission started! I'm now autonomously working on:\n\n**"${newMission.goal}"**\n\nYou'll see progress updates here. First tick scheduled at ${newMission.next_tick_at ? new Date(newMission.next_tick_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'shortly'}. Check the Missions tab for a live view.`
              ctrl.enqueue(_enc.encode(`data: ${JSON.stringify({ text: confirmText })}\n\n`))
              // Save both the user's confirmation message and the assistant response to DB
              if (conversationId) {
                try {
                  const { createAdminClient } = await import('@/lib/supabase/admin')
                  const adminDb = createAdminClient()
                  await adminDb.from('messages').insert([
                    { conversation_id: conversationId, user_id: user.id, role: 'user', content: userMessageStr } as never,
                    { conversation_id: conversationId, user_id: user.id, role: 'assistant', content: confirmText, metadata: { mission_id: newMission.id, type: 'mission_started' } } as never,
                  ])
                } catch { /* non-critical: message saving failed */ }
              }
            } else {
              ctrl.enqueue(_enc.encode(`data: ${JSON.stringify({ text: 'Failed to create the mission. Please try again.' })}\n\n`))
            }
          } catch (err) {
            ctrl.enqueue(_enc.encode(`data: ${JSON.stringify({ text: `Error creating mission: ${err instanceof Error ? err.message : String(err)}` })}\n\n`))
          } finally {
            // Clear pending confirmation regardless of outcome
            clearPendingConfirmation(user.id).catch(() => {})
            ctrl.enqueue(_enc.encode('data: [DONE]\n\n'))
            ctrl.close()
          }
        },
      })
      return new Response(missionStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }
    // ── End mission confirmation fast-path ────────────────────────────────────

    // ── run_agent confirmation fast-path ─────────────────────────────────────
    // If there is a pending run_agent confirmation and the user's message is any
    // affirmative, execute the agent run directly WITHOUT going through the LLM.
    // This prevents confirmation loops where the model re-asks instead of acting.
    if (
      conversationState.pendingConfirmation?.type === 'run_agent' &&
      scope.workspaceId &&
      /\b(yes|yeah|yep|ok|okay|sure|go|do it|run it|start it|now|add it|add them|proceed|absolutely|definitely|confirm|great|sounds good|perfect|fire it|fire them|do this|let'?s go|try it|go ahead)\b/i.test(userMessageStr)
    ) {
      const pendingRun = conversationState.pendingConfirmation.details as {
        agent_id: string
        agent_name: string
      }
      const _runEnc = new TextEncoder()
      const runConfirmStream = new ReadableStream({
        async start(ctrl) {
          try {
            const runHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
            if (userAccessToken) runHeaders['Authorization'] = `Bearer ${userAccessToken}`
            const runResponse = await fetch(`${internalApiBaseUrl}/api/agents/run`, {
              method: 'POST',
              headers: runHeaders,
              body: JSON.stringify({ agentId: pendingRun.agent_id, workspaceId: scope.workspaceId, reset: true }),
            })
            const runResult = await runResponse.json()
            if (runResponse.ok) {
              const confirmText = `Running **${pendingRun.agent_name}** now — you'll see results here as they come in.`
              ctrl.enqueue(_runEnc.encode(`data: ${JSON.stringify({ type: 'tool_result', tool: 'run_agent', result: 'success', agentName: pendingRun.agent_name })}

`))
              ctrl.enqueue(_runEnc.encode(`data: ${JSON.stringify({ text: confirmText })}

`))
              if (conversationId) {
                try {
                  const { createAdminClient: _adminForRun } = await import('@/lib/supabase/admin')
                  const _adminRunDb = _adminForRun()
                  await _adminRunDb.from('messages').insert([
                    { conversation_id: conversationId, user_id: user.id, role: 'user', content: userMessageStr } as never,
                    { conversation_id: conversationId, user_id: user.id, role: 'assistant', content: confirmText } as never,
                  ])
                } catch { /* non-critical */ }
              }
            } else {
              const errMsg = (runResult as { error?: string }).error || 'Failed to start agent'
              ctrl.enqueue(_runEnc.encode(`data: ${JSON.stringify({ text: `Couldn't start ${pendingRun.agent_name}: ${errMsg}` })}

`))
            }
          } catch (err) {
            ctrl.enqueue(_runEnc.encode(`data: ${JSON.stringify({ text: `Error running agent: ${err instanceof Error ? err.message : String(err)}` })}

`))
          } finally {
            clearPendingConfirmation(user.id).catch(() => {})
            ctrl.enqueue(_runEnc.encode('data: [DONE]\n\n'))
            ctrl.close()
          }
        },
      })
      return new Response(runConfirmStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }
    // ── End run_agent confirmation fast-path ──────────────────────────────────

    // ── Integration-aware memory retrieval ──────────────────────────────────
    // When the user message involves integration/provider work, retrieve
    // relevant prior learnings from the linked memory system so the AI
    // can reuse past solutions instead of rediscovering them.
    let integrationLearningsPrompt = ''
    // Broad keyword list — also catches user corrections like "the slug is plural", "use companies not company"
    const integrationMemoryKeywords = /\b(attio|hubspot|salesforce|pipedrive|crm|deal|pipeline|company|companies|contact|contacts|lead|stage|integration|connector|api[- ]?key|slack|github|shopify|notion|google sheets|airtable|stripe|intercom|zendesk|outreach|apollo|close\.io|monday|asana|jira|linear|clickup|webhook|oauth|token|endpoint|slug|object|record|field|attribute|list|collection|workspace|sync|create deal|create company|add lead|add deal|add contact|update deal|update record)\b/i
    // Detect user-provided integration corrections to save to memory immediately (fire-and-forget)
    // Pattern: user corrects the AI about API format, field names, slugs, stage names, etc.
    const integrationCorrectionPatterns = /\b(slug|field|stage|endpoint|path|parameter|attribute|object|record|method|api|format|key|token)\b.{0,60}\b(should be|is|are|use|not|instead|plural|singular|correct|wrong|actually|fix|fixed)\b|\b(use|it'?s|they'?re|the|correct|right|actually)\b.{0,40}\b(plural|singular|companies|contacts|people|deals|records|stages|objects)\b/i
    if (integrationCorrectionPatterns.test(userMessageStr) && !isWorkspaceOnboarding && userMessageStr.length < 500) {
      createMemoryNote(user.id, `[Integration correction from user] ${userMessageStr}`).catch(() => {})
    }
    if (integrationMemoryKeywords.test(userMessageStr) && !isWorkspaceOnboarding) {
      try {
        const linkedMemories = await retrieveMemories(user.id, userMessageStr, {
          taskComplexity: 'high',
          includeLinked: true,
        })
        if (linkedMemories.length > 0) {
          const formatted = formatLinkedMemories(linkedMemories)
          integrationLearningsPrompt = `\n\n=== PRIOR INTEGRATION LEARNINGS ===\nBefore acting on this integration task, review these relevant lessons from previous sessions. Apply them to avoid repeating past mistakes:\n${formatted}\n`
          console.log(`[Chat] Injected ${linkedMemories.length} integration learnings from linked memory`)
        }
      } catch (err) {
        console.error('[Chat] Failed to retrieve integration learnings:', err)
      }
    }

    // Detect query complexity for adaptive CoT
    const complexityResult = detectComplexity(userMessageStr)
    console.log('[Chat API] Complexity:', formatComplexity(complexityResult))
    const isFastPath = complexityResult.level === 'simple'
    const initialMaxTokens = isFastPath ? 1200 : 16000
    const continuationMaxTokens = isFastPath ? 1200 : 4096
    
    // Add thinking instruction based on complexity
    const thinkingInstruction = getThinkingInstruction(complexityResult.thinkingDepth)
    
    let suggestionContext = ''
    
    // Fire-and-forget: Update interaction count (don't block streaming)
    updatePersonalization(user.id, scope.workspaceId, {
      totalInteractions: userProfile.totalInteractions + 1,
      lastInteraction: new Date().toISOString(),
    }).catch(err => console.error('[Chat] Failed to update personalization:', err))

    // Quick sync checks for suggestion context (fast string matching, no DB)
    if (typeof userMessage === 'string') {
      const lowerMessage = userMessage.toLowerCase()
      const acceptedSuggestion = /\b(yes|sure|ok|okay|sounds good)\b/i.test(lowerMessage) && /\b(set that|it) up\b/i.test(lowerMessage)
      if (acceptedSuggestion) {
        const pending = await getPendingSuggestions(user.id)
        if (pending.length > 0) {
          const suggestion = pending[0]
          suggestionContext = `\n\n[SUGGESTION ACCEPTED: The user accepted your suggestion "${suggestion.title}". Create an agent based on: ${JSON.stringify(suggestion.actionPayload)}. Mark it as accepted.]`
          dismissSuggestion(suggestion.id).catch(() => {})
        }
      } else if (lowerMessage.includes('no thanks') || lowerMessage.includes('dismiss') || 
                 lowerMessage.includes('not now') || lowerMessage.includes('maybe later')) {
        const pending = await getPendingSuggestions(user.id)
        if (pending.length > 0) {
          dismissSuggestion(pending[0].id).catch(() => {})
          suggestionContext = '\n\n[SUGGESTION DISMISSED: The user declined the suggestion. Acknowledge briefly and move on.]'
        }
      }
      
      // Fire-and-forget: Learn facts and detect style (don't block streaming)
      const facts = extractLearnableFacts(userMessage)
      if (facts.length > 0) {
        if (scope.workspaceId) {
          Promise.all(facts.map(f => learnFactAboutUser(user.id, scope.workspaceId!, f.fact, f.category, 'user_message'))).catch(() => {})
        }
      }
      
      // Fire-and-forget: Feedback and approval processing
      checkAndProcessFeedback(user.id, userMessage).catch(() => {})
      processApprovalResponse(user.id, userMessage).catch(() => {})

      // Fire-and-forget: Track agent engagement (learn what user cares about)
      if (agentList.length > 0) {
        for (const agent of agentList) {
          if (lowerMessage.includes(agent.name.toLowerCase())) {
            recordDigestEngagement(user.id, agent.id, 'mentioned', true).catch(() => {})
          }
        }
      }

      // Fire-and-forget: Learn communication style every 10 interactions
      if (userProfile.totalInteractions > 0 && userProfile.totalInteractions % 10 === 0) {
        const recentUserMessages = contextMessages
          .filter(m => m.role === 'user' && typeof m.content === 'string')
          .map(m => m.content as string)
        if (recentUserMessages.length >= 3) {
          const styleResult = detectCommunicationStyle(recentUserMessages)
          updatePersonalization(user.id, scope.workspaceId, {
            communicationStyle: styleResult.style,
            usesEmoji: styleResult.usesEmoji,
            preferredDetailLevel: styleResult.detailLevel,
          }).catch(() => {})
        }
      }
    }
    
    // Skip suggestion engine for most requests (expensive operation)
    const suggestionPrompt: string = ''
    // Only run every 20th interaction instead of 10th, and skip entirely for now to improve TTFB
    // if (userProfile.totalInteractions % 20 === 0) { ... }
    
    // For new workspace onboarding, force a clean first impression with no prior context
    let effectiveUserProfile = userProfile
    if (isWorkspaceOnboarding) {
      effectiveUserProfile = {
        ...userProfile,
        relationshipStage: 'new' as const,
        totalInteractions: 0,
        preferredName: '',
        learnedFacts: [],
        goals: [],
        challenges: [],
      }
      console.log('[Chat API] New workspace conversation detected - using fresh personalization')
    }

    // Build effective prompt sections (onboarding should be clean and history-free)
    const personalityPrompt = isWorkspaceOnboarding
      ? ''
      : buildPersonalityPrompt(effectiveUserProfile) + suggestionContext
    const effectiveMemoryPrompt = isWorkspaceOnboarding ? '' : memoryPrompt
    const effectiveStateInstructions = isWorkspaceOnboarding ? '' : stateInstructions
    const effectiveRetentionContext = isWorkspaceOnboarding ? '' : retentionContext
    const effectiveAiName = isWorkspaceOnboarding ? '2Hands' : aiName
    const effectiveUserName = isWorkspaceOnboarding ? 'there' : userName
    const effectiveNeedsName = isWorkspaceOnboarding ? true : needsName
    const ONBOARDING_MISSION_EXAMPLES = [
      '"Scale our sales pipeline and close more deals"',
      '"Keep our docs and knowledge base up to date"',
      '"Monitor competitors and brief me on what changes"',
      '"Find and qualify leads for our target market daily"',
      '"Automate our weekly reporting and team updates"',
      '"Research and track industry news relevant to our business"',
      '"Help us hire — source candidates and screen CVs"',
      '"Keep our social media presence active and on-brand"',
      '"Monitor our key metrics and alert me to anything unusual"',
      '"Manage our content calendar and keep the blog running"',
    ]
    const randomMissionExample = ONBOARDING_MISSION_EXAMPLES[Math.floor(Math.random() * ONBOARDING_MISSION_EXAMPLES.length)]
    const onboardingInstruction = isWorkspaceOnboarding
      ? `\n\nThis is a fresh workspace with no prior history. Greet the user warmly in 1-2 short sentences, then ask what they'd like to call you. After they give you a name (and you call set_ai_name), ask what you should call them too (then call set_user_name). Also briefly mention that the most powerful thing they can do is give you a long-term goal as a Mission — you'll work on it autonomously in the background and report back. Give a realistic example like ${randomMissionExample}. No more than 4 sentences total. Do NOT reference any prior workspaces, history, or preferences. Do NOT include specific numbers in your examples.`
      : ''

    // CRITICAL: Always use the NEW user message from the request
    // The database history may not include it yet, so we must append it
    const lastRequestMessage = messages[messages.length - 1]
    if (lastRequestMessage) {
      // Check if this message is already in context (by content match)
      const lastContextMsg = contextMessages[contextMessages.length - 1]
      const newContent = typeof lastRequestMessage.content === 'string' 
        ? lastRequestMessage.content 
        : JSON.stringify(lastRequestMessage.content)
      const lastContextContent = lastContextMsg 
        ? (typeof lastContextMsg.content === 'string' ? lastContextMsg.content : JSON.stringify(lastContextMsg.content))
        : ''
      
      // Only add if it's different from the last message in context AND has a valid LLM role
      if (newContent !== lastContextContent && (lastRequestMessage.role === 'user' || lastRequestMessage.role === 'assistant')) {
        contextMessages.push({
          role: lastRequestMessage.role as 'user' | 'assistant',
          content: lastRequestMessage.content as any
        })
      }
    }

    // Format messages for Anthropic - filter out empty messages
    // Support both string content and array content (for images)
    console.log('[Chat API] Context messages count:', contextMessages.length)
    console.log('[Chat API] Last few messages:', contextMessages.slice(-3).map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, 100) : '[array]' })))
    
    const filteredContextMessages = contextMessages.filter((msg) => {
      if (msg.role !== 'user' && msg.role !== 'assistant') return false
      if (typeof msg.content === 'string') return msg.content.trim() !== ''
      if (Array.isArray(msg.content)) return msg.content.length > 0
      return false
    })

    // Merge consecutive same-role messages — Anthropic requires strict user/assistant alternation.
    // Removing system rows can leave adjacent same-role pairs which also cause a 400.
    const mergedMessages: Array<{ role: 'user' | 'assistant'; content: string | any[] }> = []
    for (const msg of filteredContextMessages) {
      const prev = mergedMessages[mergedMessages.length - 1]
      if (prev && prev.role === msg.role) {
        // Append to previous message content
        if (typeof prev.content === 'string' && typeof msg.content === 'string') {
          prev.content = prev.content + '\n\n' + msg.content
        } else {
          const prevArr = typeof prev.content === 'string'
            ? [{ type: 'text' as const, text: prev.content }]
            : (prev.content as Anthropic.ContentBlockParam[])
          const msgArr = typeof msg.content === 'string'
            ? [{ type: 'text' as const, text: msg.content }]
            : (msg.content as Anthropic.ContentBlockParam[])
          prev.content = [...prevArr, ...msgArr]
        }
      } else {
        mergedMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content })
      }
    }

    const formattedMessages = mergedMessages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content as string | Anthropic.ContentBlockParam[],
    })) as Anthropic.MessageParam[]

    // Use model routing to select appropriate model based on task complexity
    const lastUserMessage = formattedMessages[formattedMessages.length - 1]?.content
    const taskSummary = typeof lastUserMessage === 'string' ? lastUserMessage : 'AI Manager conversation'
    const explicitWebSearchRequest = typeof lastUserMessage === 'string'
      ? /\b(search|look up|find|research|reaserch|look into|investigate|google)\b/i.test(lastUserMessage)
      : false
    
    const routing = await routeToModel(taskSummary, {
      userId: user.id,
      surface: isAgentChat ? 'agent' : 'chat',
      needsTools: !isAgentChat, // manager chat needs tools
    })
    
    // Use the router's selected model + its fallback chain
    const selectedModel = routing.model
    console.log(`[Model Routing] ${routing.routing_reason} | native_reasoning=${routing.supportsNativeReasoning} | fallbacks=${routing.fallbackChain.join(',')}`)
    
    const models = [selectedModel, ...routing.fallbackChain]
    let stream
    let lastError
    let capturedSupportsThinking = false
    let fullSystemPrompt: string = ''
    let capturedToolsToUse: typeof TOOLS = TOOLS
    let chatIntegrationToolMap = new Map<string, { connectionId: string; provider: string; mcpToolName: string }>()
    let chatIntegrationTypedTools: Anthropic.Tool[] = []
    let integrationToolsSystemPrompt = ''

    // Load typed integration tools once per request (before model fallback loop).
    // This gives the chat model the same provider-specific typed tools that agents use,
    // replacing prompt-only API recipes with verified, schema-constrained tool calls.
    if (!isAgentChat) {
      try {
        const chatIntToolset = await loadAgentIntegrationTools(user.id, scope.workspaceId || undefined)
        chatIntegrationToolMap = chatIntToolset.toolMap
        chatIntegrationTypedTools = chatIntToolset.tools as Anthropic.Tool[]
        if (chatIntToolset.tools.length > 0) {
          integrationToolsSystemPrompt = buildIntegrationToolsPrompt(chatIntToolset)
          console.log('[Chat] Loaded', chatIntToolset.tools.length, 'typed integration tools for:', chatIntToolset.providers.join(', '))
        }
      } catch (e) {
        console.error('[Chat] Failed to load typed integration tools:', e)
      }
    }

    // ── Plan-first detection (hoisted for ReadableStream closure access) ──
    const _scheduledDelegationKw = /\b(daily|weekly|every day|every week|each day|each morning|each week|regularly|automatically)\b/i
    const _substantiveWorkKw = /\b(find|research|monitor|track|collect|analyze|add|save|report|check|review|scrape|qualify|write)\b/i
    const hasCompanyContext = /\b(my company|our company|my business|our business|for\s+\w+\.(com|dev|io|co|ai|se|net|org|app|xyz))\b/i.test(userMessageStr) || /\b\w+\.(com|dev|io|co|ai|se|net|org|app|xyz)\b/i.test(userMessageStr)
    const hasLeadIntent = /\b(lead|leads|prospect|prospects|customer|customers|client|clients|companies|contacts|find.*compan)\b/i.test(userMessageStr)
    const hasDestinationSystem = /\b(attio|hubspot|salesforce|pipedrive|notion|sheets|airtable|monday|asana|jira|linear|clickup|crm|spreadsheet)\b/i.test(userMessageStr)
    const hasEnrichmentIntent = /\b(enrich|qualify|score|dedupe|deduplicate|validate|verify|fill in|complete|add info|add data)\b/i.test(userMessageStr)
    const hasMultiStepWork = (_substantiveWorkKw.test(userMessageStr) && hasDestinationSystem) || (hasLeadIntent && hasEnrichmentIntent) || (hasLeadIntent && hasDestinationSystem)
    const isPlanFirstRequest = (hasCompanyContext && hasLeadIntent) || hasMultiStepWork || (hasDestinationSystem && _substantiveWorkKw.test(userMessageStr) && _scheduledDelegationKw.test(userMessageStr))

    for (const model of models) {
      try {
        console.log(`Trying model: ${model}`)

        const normalizedModel = normalizeModelForTransport(model)
        
        let toolsToUse: typeof TOOLS
        
        if (isAgentChat && agentChatData) {
          // Fire-and-forget: Record agent_viewed signal for behavior learning
          recordBehaviorSignal(user.id, { type: 'agent_viewed', metadata: { agentId: agentChatData.id, category: agentChatData.config?.description?.split(' ')[0] || 'general' } }).catch(() => {})

          // Agent-specific system prompt - agents cannot create/manage other agents
          fullSystemPrompt = `You are ${agentChatData.name}, an AI agent assistant. You are NOT the AI Manager - you are a specialized agent.

YOUR ROLE:
- You help the user with questions about your work and findings
- You can discuss your task: ${agentChatData.config?.description || 'your assigned task'}
- You report insights and findings from your work
- You answer questions about what you've discovered

IMPORTANT RESTRICTIONS:
- You CANNOT create or manage other agents - only the AI Manager can do that
- If explicitly asked, you MAY delete THIS current agent only
- You CANNOT access other agents' data or conversations
- If the user asks you to create an agent, politely explain that they need to ask the AI Manager to do that
- Focus on your specific task and findings

The user's name is ${userName}. Be helpful, conversational, and share any relevant findings from your work.`
          
          // Filter out agent management tools for agent chats
          toolsToUse = TOOLS.filter(t => 
            !['create_agent', 'delete_all_agents', 'update_agent', 'run_agent', 'set_ai_name'].includes(t.name)
          )
          capturedToolsToUse = toolsToUse
        } else {
          // AI Manager system prompt — use smart digest when available, fall back to raw statuses
          const baseSystemPrompt = getSystemPrompt(effectiveAiName, effectiveUserName, agentStatuses, effectiveNeedsName, { profile: voiceProfile, mirroringLevel, preferredStyle })
          const agentContext = digestPromptSection || (agentStatuses ? `\n\nCURRENT AGENTS:\n${agentStatuses}` : '')
          // Only include templates when user has no agents yet (onboarding help)
          const templatesPrompt = agentList.length === 0 ? formatTemplatesForPrompt() : ''

          // Fetch connected integrations for context — skip if none connected
          let connectorContext = ''
          try {
            const { getConnectorSummaryForPrompt } = await import('@/lib/integrations/connector-fields')
            const { data: conns, error: connsError } = await createAdminClient()
              .from('integration_connections')
              .select('provider, status')
              .eq('user_id', user.id)
            if (connsError) console.error('[ConnectorContext] query error:', connsError.message)
            const connectedIds = (conns || [])
              .filter((c: { status: string }) => c.status === 'active')
              .map((c: { provider: string }) => c.provider)
            console.log('[ConnectorContext] user:', user.id, 'connected:', connectedIds)
            connectorContext = `\n\nCONNECTOR REALITY CHECK:\n✅ Connected = verified active — API key saved, call integration tools directly. 🔌 Available = supported but not connected — call setup_integration. 🔜 Coming soon = no direct connector; browser automation may work.\n${getConnectorSummaryForPrompt(connectedIds)}`
          } catch (e) {
            console.error('[ConnectorContext] unexpected error:', e)
          }

          // For thinking-capable models (kimi, claude non-haiku): always include at least a minimal
          // thinking instruction so reasoning surfaces in the ThinkingDisplay even on fast-path turns.
          // For other models: skip on fast-path to keep first-token latency low.
          const _isThinkingModel = normalizedModel.includes('kimi') || (normalizedModel.includes('claude') && !normalizedModel.includes('haiku'))
          const complexityInstruction = (isFastPath && !_isThinkingModel) ? '' : `\n\nTHINKING APPROACH: ${thinkingInstruction}`
          // Fetch active missions for system prompt context (non-blocking fallback)
          let missionsContext = ''
          try {
            if (scope.workspaceId) {
              const activeMissions = await getUserMissions(user.id, scope.workspaceId, 'active')
              if (activeMissions.length > 0) {
                missionsContext = `\n\n${formatMissionsForPrompt(activeMissions)}`
              }
            }
          } catch { /* missions table may not exist yet */ }

          const effectiveConvSummary = isWorkspaceOnboarding ? '' : conversationSummaryPrompt

          // ── Load Skills ──────────────────────────────────────────────
          let skillsPrompt = ''
          let skillToolDef: { name: string; description: string; input_schema: Record<string, unknown> } | null = null
          try {
            const { getEnabledSkillsAdmin, ensureSystemSkillsAdmin } = await import('@/lib/skills/skill-registry')
            const { buildSkillsSystemPrompt, buildRunSkillTool } = await import('@/lib/skills/skill-loader')
            const { SYSTEM_SKILLS } = await import('@/lib/skills/system-skills')

            // Ensure system skills exist for this workspace
            if (scope.workspaceId) {
              await ensureSystemSkillsAdmin(user.id, scope.workspaceId, SYSTEM_SKILLS).catch(() => {})
            }

            const enabledSkills = scope.workspaceId ? await getEnabledSkillsAdmin(scope.workspaceId) : []
            if (enabledSkills.length > 0) {
              skillsPrompt = buildSkillsSystemPrompt(enabledSkills)
              skillToolDef = buildRunSkillTool(enabledSkills)
            }
          } catch (e) {
            console.error('[Chat] Skills loading error:', e)
          }

          const workspaceToolsPrompt = `

=== HOW YOU WORK (internal — don't explain this to users) ===
You automatically manage the user's workspace behind the scenes. NEVER explain these tools to the user. Just use them and show results.

AUTOMATIC BEHAVIORS (do these silently):
- When you learn something important about the user → save it to memory (manage_memory_box)
- When the user mentions a task or action item → create a board card (manage_board) and casually mention "I've added that to your board"
- When the user wants something recurring → set it up (manage_recurring_task) and confirm naturally: "I've set that up to run every Monday"
- Before answering questions about past context → check memories first
- Before starting complex work → check what's already on the board

DELEGATION + SKILLS (how it flows):
- When run_skill loads a workflow for a SUBSTANTIAL task (research, analysis, writing, strategy) → DO NOT execute it yourself. Instead, create an agent with the skill's instructions baked into the agent's task description. The agent does the work, you report the results.
- When run_skill loads a workflow for a QUICK task (short calculation, brief lookup, simple formatting) → you can handle it directly.
- Rule of thumb: If the skill workflow has more than 3 steps or requires web_search/analyze_url → delegate to an agent.

HOW TO COMMUNICATE WITH USERS:
- Show progress naturally: "I'm putting an agent on this…", "Results are in — here's what we found…"
- Keep them feeling in control: Brief updates on what's happening, then deliver polished results
- Never dump technical details. Say "I've added that to your board ✓" not "I used manage_board to create a card"
- Be proactive: Don't wait to be asked. If you notice something useful, just do it and mention it casually
- Make them feel like they have a whole team working for them — because they do

=== INTEGRITY (internal rules — NEVER violate) ===
1. Never claim you did something unless the tool returned success:true
2. Never fabricate data, URLs, statistics, or quotes — use web_search if you don't know
3. If something fails, be honest but brief: "I tried to save that but it didn't go through — let me try again"
4. If you're unsure, say so simply: "I'm not certain about that — let me check"
5. Check tool results before reporting. Only describe what actually happened
6. If a multi-step task partially fails, report what worked and what didn't

=== EXECUTION-FIRST RULE — applies when user says "do it", "try it", "so try it", "run it", "go ahead", or similar ===
When the user tells you to execute — DO IT. Zero narration before the first tool call.
- WRONG: "Let me check X first... Now let me get Y... I'll try Z approach... Let me use the correct method..." [finally calls tool after 5 sentences]
- RIGHT: [calls tool immediately] → [calls next tool] → "✅ Done: [result]" OR "❌ Failed: [exact error] — [next step]"
You are allowed ONE sentence to say what you are doing RIGHT NOW, not what you plan to do. "Getting workspace details..." is fine. "Let me try to get workspace details" is not.
The moment you decide to act, ACT. Do not announce it first.

=== TOOL LOOP NARRATION — NEVER REPEAT STATUS LINES ===
When you are calling multiple tools in sequence, do NOT emit a "Let me..." or "I'll..." preamble before each tool call. Call the tool immediately. Between tool calls your output should be EMPTY or a single present-tense status ("Getting X..."). Never future-tense ("I'll get X", "Let me get X", "Now let me get X").

RESULT FORMAT — use this structure when reporting multi-step outcomes:
✅ Got workspace member ID: [id]
✅ Creating deal: [name] → stage: [stage]
✅ Deal created — Record ID: [id]

Or on failure:
❌ Deal creation failed — HTTP 400: [exact error from API]
→ Fix: [specific corrective action]

This format is concise, scannable, and action-oriented. Use it for any multi-step integration task.
`

          fullSystemPrompt = `${baseSystemPrompt}${effectiveMemoryPrompt}${integrationLearningsPrompt}${effectiveConvSummary}${effectiveStateInstructions}\n\n${personalityPrompt}${agentContext}${effectiveRetentionContext}${templatesPrompt}${connectorContext}${creditWarning}${pricingContext}${suggestionPrompt ? `\n\n${suggestionPrompt}` : ''}${complexityInstruction}${onboardingInstruction}${missionsContext}${workspaceToolsPrompt}${skillsPrompt}${integrationToolsSystemPrompt}`

          // Fast-path: disable tools for simple messages UNLESS they are mission/agent commands
          const missionKeywords = /\b(mission|pause|resume|start mission|launch|recreate|create mission|delete mission|wipe|build .*(company|product|startup)|work on .* every|keep (improving|growing|building)|indefinitely|autonomously|in the background)\b/i
          const isMissionCommand = missionKeywords.test(userMessageStr)
          // Force tools for agent management operations (create/delete/update/run agents)
          const agentCommandKeywords = /\b(create|make|build|set up|add|delete|remove|stop|kill|update|edit|change|modify|run|execute|trigger|start|launch)\b.{0,30}\b(agent|automation|bot|teammate)\b|\b(agent|automation|bot|teammate)\b.{0,30}\b(create|delete|remove|stop|kill|update|run|execute)\b/i
          // Users often say "AI" / "assistant" instead of "agent" — fast-path would strip tools and block create_agent
          const agentCreationColloquial = /\b(make|create|build|set up|spawn|deploy|hire|add)\b\s+(an?\s+)?(ai|agent|assistant)\b|\b(an?\s+)?(ai|agent)\s+to\s+(test|try|check|verify|do|help|monitor|research|find|run|see|show)\b|\bneed\b.{0,50}\b(agent|agents|ai|assistant)\b|\bwant\b.{0,50}\b(agent|agents|ai|assistant)\b/i
          const isAgentCommand = agentCommandKeywords.test(userMessageStr) || agentCreationColloquial.test(userMessageStr)
          // Force tools for integration setup/verification requests AND CRM/provider operations
          const integrationKeywords = /\b(test|verify|check|connect|integration|github|slack|token|pat|personal access|credential|api key|does it work|working|connected|attio|hubspot|salesforce|pipedrive|crm|deal|company|contact|pipeline|lead|stage|record|create deal|create company|update deal|add company|add deal|add contact|add lead)\b/i
          const isIntegrationCommand = integrationKeywords.test(userMessageStr)
          // Also force tools if recent conversation context was about integrations (catches "and?", "how is it going?" follow-ups)
          const recentContextStr = formattedMessages.slice(-6).map(m => {
            const c = m.content
            if (typeof c === 'string') return c
            if (Array.isArray(c)) return c.map((b: { type: string; text?: string }) => b.type === 'text' ? (b.text || '') : '').join(' ')
            return ''
          }).join(' ').toLowerCase()
          const integrationContextKeywords = /\b(github|integration|token|pat|personal access|credential|verify_integration|setup_integration|connected|connector|attio|hubspot|crm|deal|pipeline|stage|record_id|company|contact)\b/
          const hasIntegrationContext = integrationContextKeywords.test(recentContextStr)
          // Force tools when recent context is about missions AND user sends a short confirmation — prevents hallucinated "mission launched" responses
          const missionContextKeywords = /\b(mission|launch|start|create|recreate|wipe|restart|propose|tick|runner|cron|stuck|overdue|broken|working)\b/
          const isShortConfirmation = /^\s*(yes|yeah|yep|ok|okay|sure|go|do it|proceed|launch|start|recreate|both|absolutely|definitely|sounds good|let'?s?(?: do it)?)\s*[!.]*\s*$/i.test(userMessageStr)
          const hasMissionContext = missionContextKeywords.test(recentContextStr) && isShortConfirmation
          // Force tools when recent context was about agent management and user sends a confirmation
          const agentContextKeywords = /\b(delete|remove|stop|kill|create|make|build|update|edit|run|execute|agent|automation|bot|teammate)\b/
          const hasAgentContext = agentContextKeywords.test(recentContextStr) && isShortConfirmation
          // Also force tools when a mission/agent confirmation is pending (user may add conditions)
          const hasPendingConfirmation = !!conversationState.pendingConfirmation?.type
          // Force tools for workspace management (memory, board, recurring tasks)
          const workspaceKeywords = /\b(remember|keep track|don'?t forget|store|save|note|board|card|task|kanban|recurring|schedule|every day|every week|weekly|daily|monitor|remind me regularly|what do you know|what'?s on my plate|my tasks|pending tasks|memory|memories)\b/i
          const isWorkspaceCommand = workspaceKeywords.test(userMessageStr)
          // Force tools for skill-related requests
          const skillKeywords = /\b(skill|research|analyze|review|debug|refactor|document|test cases|user stor|competitor|content strategy|meeting prep|use the .* skill)\b/i
          const isSkillCommand = skillKeywords.test(userMessageStr)
          // Force tools when user delegates a scheduled/automated task without saying "agent"
          // e.g. "Find 10 Swedish companies daily and add to Attio CRM"
          const isScheduledDelegation = _scheduledDelegationKw.test(userMessageStr) && _substantiveWorkKw.test(userMessageStr)
          // Force tools when user asks about agent status ("i dont see the agent", "where is the agent", "is it running")
          const agentStatusKeywords = /\b(see|find|where|show|list|check|status|running|working|started|created|done|finished|complete)\b.{0,30}\b(agent|agents|automation)\b|\b(agent|agents)\b.{0,30}\b(see|find|where|show|list|check|status|running|working|started|created|done|finished)\b/i
          const agentMissingOrEmptyKeywords = /\b(don'?t|dont)\s+see\b.{0,100}\bagents?\b|\bagents?\b.{0,80}\b(generated|creating|created|showing|listed|appear|visible)|\b0\s+agents?\b|\bno\s+agents?\b|\bwhere(\s+is|\s+are)?\s+(the|my)?\s*agents?\b|\bnot\s+seeing\b.{0,80}\bagents?\b|\bwhy\s+(isn'?t|is not|arent|are not)\b.{0,60}\bagents?\b/i
          const isAgentStatusQuery = agentStatusKeywords.test(userMessageStr) || agentMissingOrEmptyKeywords.test(userMessageStr)
          // isPlanFirstRequest, hasCompanyContext, hasLeadIntent, hasDestinationSystem, hasEnrichmentIntent
          // are hoisted above the model loop for ReadableStream closure access
          const baseTools = (isFastPath && !explicitWebSearchRequest && !isMissionCommand && !isAgentCommand && !isIntegrationCommand && !hasIntegrationContext && !hasMissionContext && !hasAgentContext && !hasPendingConfirmation && !isWorkspaceCommand && !isSkillCommand && !isScheduledDelegation && !isAgentStatusQuery && !isPlanFirstRequest) ? [] : TOOLS
          // Inject dynamic run_skill tool if skills are available
          toolsToUse = skillToolDef && baseTools.length > 0 ? [...baseTools, skillToolDef as any] : baseTools
          // Inject typed provider tools from active integration connections.
          // Priority: typed tools > OpenAPI-generated tools > generic integration_call.
          // Only inject when tools are enabled for this turn (baseTools non-empty).
          if (chatIntegrationTypedTools.length > 0 && toolsToUse.length > 0) {
            toolsToUse = [...toolsToUse, ...chatIntegrationTypedTools as any[]]
          }
          capturedToolsToUse = toolsToUse
        }
        
        // Debug: Log what we're sending to Claude
        console.log('[Chat API DEBUG] isAgentChat:', isAgentChat, 'agentName:', agentChatData?.name)
        console.log('[Chat API DEBUG] Last user message:', formattedMessages[formattedMessages.length - 1]?.content?.toString().slice(0, 200))
        console.log('[Chat API DEBUG] suggestionPrompt:', suggestionPrompt ? 'YES - ' + suggestionPrompt.slice(0, 100) : 'NONE')
        console.log('[Chat API DEBUG] suggestionContext:', suggestionContext ? 'YES - ' + suggestionContext.slice(0, 100) : 'NONE')
        
        // Enable native thinking for models that support it (Claude extended thinking + Kimi K2 native reasoning)
        const supportsThinking =
          (normalizedModel.includes('claude') && !normalizedModel.includes('haiku')) ||
          normalizedModel.includes('kimi')
        capturedSupportsThinking = supportsThinking
        
        const shouldForceWebSearch = explicitWebSearchRequest && toolsToUse.some(tool => tool.name === 'web_search')

        stream = await getAnthropicInstance().messages.create({
          model: normalizedModel,
          max_tokens: initialMaxTokens,
          system: fullSystemPrompt,
          messages: formattedMessages,
          tools: toolsToUse,
          ...(shouldForceWebSearch ? { tool_choice: { type: 'tool', name: 'web_search' } } : {}),
          stream: true,
          ...(supportsThinking ? { thinking: { type: 'enabled', budget_tokens: 8000 } } : {}),
        } as any)
        console.log(`Success with model: ${model}`)
        break
      } catch (error) {
        console.error(`Model ${model} failed:`, error)
        lastError = error
      }
    }
    
    if (!stream) {
      return new Response(JSON.stringify({ error: 'AI service error', details: String(lastError) }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Create a readable stream for the response
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        // Hoisted outside try so catch can reference it
        let managerTurnId: string | null = null
       try {
        // Insert a durable manager-turn placeholder so the user sees an in-progress
        // state even after a page refresh. We UPDATE it with the real content at the
        // end; if the stream dies mid-way the placeholder stays 'running' which the
        // client shows as a recoverable "still working" card.
        if (conversationId && !isAgentChat && assistantMsgId) {
          managerTurnId = assistantMsgId
          try {
            const adminDb = createAdminClient()
            await adminDb.from('messages').insert({
              id: managerTurnId,
              conversation_id: conversationId,
              role: 'assistant',
              content: '',
              metadata: { type: 'manager_turn', status: 'running', started_at: new Date().toISOString() },
            } as never)
          } catch (e) {
            console.warn('[Chat] manager_turn placeholder insert failed (non-critical):', e)
            managerTurnId = null
          }
        }

        // Track conversation for tool loop
        const conversationMessages = [...formattedMessages]
        let finalAssistantContentForDb = ''
        let thinkingContentForDb = ''
        let pendingSetupCardForDb: { connector_id: string; connector_name: string; fields: unknown[]; logo_url?: string | null } | null = null
        let currentStream = stream
        let iteration = 0
        const maxIterations = 15 // Allow multi-step execute-first flows (search + analyze × N + create × N + summary)
        // Tracks the allowed_tools list of the currently-executing skill.
        // null = no active skill restriction; [] = skill requests no tools;
        // non-empty = only these tool names are permitted in continuation calls.
        let activeSkillAllowedTools: string[] | null = null

        const enqueueSse = (payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
        }

        const enqueueAiState = (payload: {
          state: string
          context?: string
          metadata?: Record<string, unknown>
          startTime?: number
        }) => {
          enqueueSse({
            type: 'ai_state',
            ...payload,
            startTime: payload.startTime ?? Date.now(),
          })
        }

        const enqueueProgressUpdate = (payload: {
          update_type: 'status' | 'completion' | 'error' | 'insight' | 'suggestion' | 'cost_alert'
          message: string
          agent_id?: string
        }) => {
          // progress_update = operational activity (tool calls, API status, etc.)
          // It must NOT be appended to thinkingContentForDb — that is reserved for actual
          // model reasoning content from thinking/thinking_delta stream events only.
          enqueueSse({
            type: 'progress_update',
            ...payload,
          })
        }

        // --- Activity Trace v2 helpers ---
        // Tracks steps emitted during this turn for final persistence
        const activityTraceV2: Array<Record<string, unknown>> = []
        const reasoningSummary = ''

        const enqueueStepUpsert = (step: {
          id: string
          kind: string
          status: string
          label: string
          reason?: string
          description?: string
          sources?: Array<{ title: string; url?: string; favicon?: string; source?: string; snippet?: string }>
          data?: Record<string, unknown>
        }) => {
          // Track for persistence
          const existing = activityTraceV2.findIndex(s => s.id === step.id)
          if (existing >= 0) {
            activityTraceV2[existing] = { ...activityTraceV2[existing], ...step }
          } else {
            activityTraceV2.push({ ...step, timestamp: Date.now() })
          }
          enqueueSse({ type: 'activity_step_upsert', step: { ...step, timestamp: Date.now() } })
        }

        const enqueueStepPatch = (stepId: string, patch: Record<string, unknown>) => {
          const existing = activityTraceV2.findIndex(s => s.id === stepId)
          if (existing >= 0) {
            activityTraceV2[existing] = { ...activityTraceV2[existing], ...patch }
          }
          enqueueSse({ type: 'activity_step_patch', stepId, patch })
        }

        // ── Emit visible planning steps for plan-first requests ──────────
        // This gives the user immediate visible feedback that the system is
        // planning, even when the routed model does not produce native
        // reasoning tokens.
        if (isPlanFirstRequest && !isAgentChat) {
          enqueueAiState({ state: 'working', context: 'Planning your request' })
          const planSteps: Array<{ id: string; label: string }> = []
          if (hasCompanyContext) {
            planSteps.push({ id: 'plan-company', label: 'Analyzing your company' })
          }
          if (hasLeadIntent) {
            planSteps.push({ id: 'plan-icp', label: 'Deriving ideal customer profile' })
          }
          if (hasDestinationSystem) {
            planSteps.push({ id: 'plan-integration', label: 'Checking integration readiness' })
          }
          if (hasEnrichmentIntent) {
            planSteps.push({ id: 'plan-enrich', label: 'Setting up enrichment workflow' })
          }
          planSteps.push({ id: 'plan-compile', label: 'Compiling operation plan' })
          for (const step of planSteps) {
            enqueueStepUpsert({ id: step.id, kind: 'plan', status: 'pending', label: step.label })
          }
        }

        const mapToolToAiState = (
          tool: string,
          input: Record<string, unknown>
        ): { state: string; context?: string; metadata?: Record<string, unknown>; progress?: string } => {
          if (tool === 'web_search') {
            const query = typeof input.query === 'string' ? input.query : undefined
            return {
              state: 'searching',
              context: query ? `Searching: ${query}` : 'Searching the web',
              metadata: query ? { query } : undefined,
              // No progress here — the post-search enqueueProgressUpdate includes result count
            }
          }

          if (tool === 'analyze_url') {
            const url = typeof input.url === 'string' ? input.url : undefined
            return {
              state: 'browsing',
              context: url ? `Analyzing: ${url}` : 'Analyzing URL',
              metadata: url ? { url } : undefined,
              // No progress here — the post-fetch enqueueProgressUpdate includes title/description
            }
          }

          if (tool === 'create_visual_report') {
            const title = typeof input.title === 'string' ? input.title : undefined
            return {
              state: 'working',
              context: title ? `Creating report: ${title}` : 'Creating report',
              progress: title ? `Creating report: ${title}` : 'Creating report…',
            }
          }

          if (tool === 'create_agent' || tool === 'run_agent' || tool === 'update_agent' || tool === 'delete_agent' || tool === 'delete_all_agents' || tool === 'get_agents_status') {
            const name = typeof input.agent_name === 'string' ? input.agent_name : typeof input.name === 'string' ? input.name : undefined
            return {
              state: 'working',
              context: name ? `Working on agent: ${name}` : 'Working on agent',
              progress: name ? `Working on agent: ${name}` : 'Working on agent…',
            }
          }

          if (tool === 'setup_integration') {
            return {
              state: 'connecting',
              context: 'Setting up integration',
              progress: 'Setting up integration…',
            }
          }

          if (tool === 'verify_integration') {
            const id = typeof input.connector_id === 'string' ? input.connector_id : 'integration'
            const repo = typeof input.repo === 'string' ? ` (${input.repo})` : ''
            return {
              state: 'working',
              context: `Testing ${id} connection${repo}`,
              progress: `Testing ${id} connection${repo}…`,
            }
          }

          if (tool.startsWith('integration_') && tool !== 'integration_call' && tool !== 'setup_integration' && tool !== 'verify_integration' && tool !== 'register_custom_provider') {
            const parts = tool.replace('integration_', '').split('_')
            const provider = (parts[0] || 'integration').charAt(0).toUpperCase() + (parts[0] || 'integration').slice(1)
            const actionSlug = parts.slice(1).join('_') || 'call'
            // Map common action slugs to human-readable verbs
            const ACTION_LABELS: Record<string, string> = {
              create_deal: 'Creating deal',
              update_deal: 'Updating deal',
              search_deals: 'Searching deals',
              create_company: 'Creating company',
              update_company: 'Updating company',
              search_companies: 'Searching companies',
              create_person: 'Creating person',
              update_person: 'Updating person',
              search_people: 'Searching people',
              inspect_workspace: 'Inspecting workspace',
              get_deal_stages: 'Fetching deal stages',
              get_workspace_members: 'Fetching workspace members',
              get_pipeline_stages: 'Fetching pipeline stages',
              add_to_pipeline: 'Adding to pipeline',
              create_issue: 'Creating issue',
              list_repos: 'Listing repositories',
              send_message: 'Sending message',
              create_record: 'Creating record',
              update_record: 'Updating record',
              search_records: 'Searching records',
            }
            const actionLabel = ACTION_LABELS[actionSlug] ?? actionSlug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            return { state: 'working', context: `${actionLabel} in ${provider}`, progress: `${actionLabel}…` }
          }

          if (tool === 'integration_call') {
            const provider = typeof input.provider === 'string' ? input.provider : ''
            const method = typeof input.method === 'string' ? input.method.toUpperCase() : 'GET'
            const path = typeof input.path === 'string' ? input.path : ''
            return { state: 'working', context: `${provider} ${method} /${path}`, progress: `Calling ${provider} API…` }
          }

          if (tool === 'register_custom_provider') {
            const name = typeof input.name === 'string' ? input.name : 'provider'
            return { state: 'working', context: `Registering ${name}`, progress: `Setting up ${name} integration…` }
          }

          return {
            state: 'working',
            context: `Running: ${tool}`,
            progress: `Running: ${tool}…`,
          }
        }

        // Send complexity info to frontend for adaptive UI
        enqueueSse({
          type: 'complexity',
          level: complexityResult.level,
          shouldShowThinking: complexityResult.shouldShowThinking,
          thinkingDepth: complexityResult.thinkingDepth,
        })

        enqueueAiState({
          state: 'thinking',
          context: complexityResult.level === 'simple' ? 'Quick response' : `Analyzing: ${complexityResult.level}`,
          metadata: { 
            complexity: complexityResult.level,
            progressiveStates: complexityResult.level === 'complex' 
              ? ['Analyzing request...', 'Planning approach...', 'Synthesizing response...']
              : complexityResult.level === 'medium'
                ? ['Analyzing...', 'Synthesizing...']
                : ['Thinking...']
          },
          startTime: Date.now(),
        })

        enqueueProgressUpdate({
          update_type: 'status',
          message: complexityResult.level === 'simple' ? 'Thinking...' : `Analyzing ${complexityResult.level} query...`,
        })
        
        // Track whether the most-recent integration tool call failed.
        // Used by the follow-through guard below to detect the pattern:
        //   integration fails → model narrates "Let me try X" → no tool call emitted → loop exits silently
        let lastIntegrationFailed = false
        // Prevent the follow-through guard from looping forever (one correction max).
        let followThroughForced = false

        // ── PRE-FLIGHT DESTRUCTIVE GUARD ─────────────────────────────────────
        // Before the model loop even starts, classify the raw user message.
        // If it is a destructive/financial/bulk-email request AND the user has NOT
        // already confirmed a pending destructive action, halt execution and surface
        // a confirmation prompt. Never touch the model or any tools for these requests.
        const _isAlreadyConfirmingDestructive = conversationState.pendingConfirmation?.type === 'destructive_action'
        const _confirmationAffirmatives = /\b(yes|yeah|yep|ok|okay|sure|go|proceed|do it|confirm|absolutely|definitely|let'?s?(?: do it)?|sounds good|go ahead)\b/i
        // If user is answering a pending destructive confirmation, clear it so subsequent turns aren't blocked
        if (_isAlreadyConfirmingDestructive && _confirmationAffirmatives.test(userMessageStr)) {
          clearPendingConfirmation(user.id).catch(() => {})
        }
        if (!_isAlreadyConfirmingDestructive) {
          const { classifyExecution: _classifyPre, DESTRUCTIVE_TEXT_PATTERNS: _destrPatterns } = await import('@/lib/execution/execute-first-policy')
          const _preClassification = _classifyPre({ taskDescription: userMessageStr })
          if (_preClassification.mode === 'needs_confirmation' && _preClassification.risk === 'approval_required') {
            const _matchedPattern = _destrPatterns.find(({ pattern }) => pattern.test(userMessageStr))
            const _confirmMsg = `⚠️ **Heads up — this is a destructive action.**\n\n${_matchedPattern?.reason ?? _preClassification.reason}.\n\n**Are you sure?** Reply "yes, proceed" to confirm, or tell me what you'd like to do instead.`
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: _confirmMsg })}\n\n`))
            finalAssistantContentForDb = _confirmMsg
            await setPendingConfirmation(user.id, 'destructive_action', {
              originalRequest: userMessageStr,
              reason: _matchedPattern?.reason ?? _preClassification.reason,
            })
            // Skip the model loop entirely — we've handled this turn
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
            return
          }
        }
        // ── END PRE-FLIGHT DESTRUCTIVE GUARD ─────────────────────────────────

        // Hoisted narration filter — shared by per-iteration cleanup AND final cleanup below.
        // Matches pure planning/intention lines that belong in Thinking, not the visible message.
        const NARRATION_LINE_RE = /^(let me (check|try|use|search|look|call|inspect|find|create|get|run|update|fix|retry|see|verify|test|now|approach|format|think|review|re|first|also)\b|i'll (now |try |use |check |call |create |run |search |look |update |fix |retry |format |approach |re|also |first )|i will (now |try |use |check |call |create |run |search |look |update |fix |retry |format |approach )|i need to |i'm going to |the issue is |the problem is |the root cause |based on the error|this means |it seems |looking at this|i can see that |now let me|first let me|next let me|let me also|let me now)/i
        const CONCRETE_EVIDENCE_RE = /\b(http [2-5]\d{2}|record_id|✅|❌|failed[: ]|error[: ]|success[: ]|created[: ]|updated[: ]|deleted|found \d|\d+ record|\burl\b|\bhttps?:\/\/)/i

        // Tool loop - continue until AI responds with just text
        while (iteration < maxIterations) {
          iteration++
          let fullContent = ''
          let iterationContentForDb = ''
          let toolCall: any = null
          
          // Streaming <thinking> tag parser state
          let insideThinkingTag = false
          let textBuffer = ''
          let thinkingStartSent = false

          for await (const event of currentStream) {
            if (event.type === 'content_block_start') {
              if (event.content_block.type === 'tool_use') {
                toolCall = {
                  id: event.content_block.id,
                  name: event.content_block.name,
                  input: ''
                }
              } else if (event.content_block.type === 'thinking') {
                // Native model reasoning (Kimi K2 thinking, Claude extended thinking)
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: 'thinking_start' })}\n\n`)
                )
                thinkingStartSent = true
              }
            }

            if (event.type === 'content_block_delta') {
              if (event.delta.type === 'text_delta') {
                const chunk = event.delta.text
                textBuffer += chunk
                
                // Parse <thinking> tags from the text stream
                while (textBuffer.length > 0) {
                  if (insideThinkingTag) {
                    const closeIdx = textBuffer.indexOf('</thinking>')
                    if (closeIdx !== -1) {
                      const thinkingChunk = textBuffer.slice(0, closeIdx)
                      if (thinkingChunk) {
                        thinkingContentForDb += thinkingChunk
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ type: 'thinking', thinking: thinkingChunk })}\n\n`)
                        )
                      }
                      textBuffer = textBuffer.slice(closeIdx + '</thinking>'.length)
                      insideThinkingTag = false
                    } else if (textBuffer.length > '</thinking>'.length) {
                      const safeLen = textBuffer.length - '</thinking>'.length
                      const thinkingChunk = textBuffer.slice(0, safeLen)
                      thinkingContentForDb += thinkingChunk
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ type: 'thinking', thinking: thinkingChunk })}\n\n`)
                      )
                      textBuffer = textBuffer.slice(safeLen)
                    } else {
                      break
                    }
                  } else {
                    const openIdx = textBuffer.indexOf('<thinking>')
                    if (openIdx !== -1) {
                      const beforeThinking = textBuffer.slice(0, openIdx)
                      if (beforeThinking.trim()) {
                        fullContent += beforeThinking
                        iterationContentForDb += beforeThinking
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ text: beforeThinking })}\n\n`)
                        )
                      }
                      textBuffer = textBuffer.slice(openIdx + '<thinking>'.length)
                      insideThinkingTag = true
                      if (!thinkingStartSent) {
                        thinkingStartSent = true
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ type: 'thinking_start' })}\n\n`)
                        )
                      }
                    } else if (textBuffer.length > '<thinking>'.length) {
                      const safeLen = textBuffer.length - '<thinking>'.length
                      const textChunk = textBuffer.slice(0, safeLen)
                      fullContent += textChunk
                      iterationContentForDb += textChunk
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ text: textChunk })}\n\n`)
                      )
                      textBuffer = textBuffer.slice(safeLen)
                    } else {
                      break
                    }
                  }
                }
              } else if ((event.delta as any).type === 'thinking_delta') {
                // Native model reasoning — stream to ThinkingDisplay UI
                const thinkingText = (event.delta as any).thinking
                thinkingContentForDb += thinkingText
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: 'thinking', thinking: thinkingText })}\n\n`)
                )
              }
              
              if (event.delta.type === 'input_json_delta' && toolCall) {
                toolCall.input += event.delta.partial_json
              }
            }

            if (event.type === 'content_block_stop') {
              // Flush remaining buffer
              if (textBuffer.length > 0) {
                if (insideThinkingTag) {
                  thinkingContentForDb += textBuffer
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: 'thinking', thinking: textBuffer })}\n\n`)
                  )
                } else {
                  fullContent += textBuffer
                  iterationContentForDb += textBuffer
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ text: textBuffer })}\n\n`)
                  )
                }
                textBuffer = ''
              }
            }
          }

          // Strip planning/narration lines from this iteration's content before accumulating.
          // This catches "Let me...", "I'll...", "Now let me..." sentences that appear between tool calls.
          // Only strip whole lines; always keep lines with concrete evidence (IDs, HTTP codes, outcomes).
          if (iterationContentForDb.trim()) {
            iterationContentForDb = iterationContentForDb
              .split('\n')
              .filter(line => {
                const t = line.trim()
                if (!t) return true // preserve blank lines
                if (CONCRETE_EVIDENCE_RE.test(t)) return true // keep concrete result lines
                return !NARRATION_LINE_RE.test(t)
              })
              .join('\n')
              .replace(/\n{3,}/g, '\n\n')
              .trim()
          }

          // Accumulate this iteration's content (so multi-tool-call responses keep ALL text, not just the last iteration)
          // Use \n\n between iterations so separate narration blocks become readable paragraphs rather than run-on text
          if (iterationContentForDb.trim()) {
            finalAssistantContentForDb = finalAssistantContentForDb.trim()
              ? finalAssistantContentForDb.trimEnd() + '\n\n' + iterationContentForDb.trimStart()
              : iterationContentForDb
          }

          // If no tool call, we're done — unless the model just narrated a retry
          // after an integration failure, OR the user explicitly asked for direct execution,
          // without actually calling any tool. Force one correction so the user gets a real result.
          if (!toolCall) {
            // Detect responses that are pure intention/diagnosis narration with no actual result.
            // These look like "The issue is... Let me try... I'll use..." with no concrete outcome.
            const INTENTION_ONLY_RESPONSE = /^(\s*((let me|i'll |i will |i'm going to |i need to |the issue is |the problem is |the root cause |let me try|let me use |let me check|let me search|let me look|let me now|based on the error|this means |it seems |looking at |i can see that |now let me|first let me|next let me)[^\n]{0,250}\n?){1,8}\s*)$/i
            // Detect user messages that express direct execution intent (not just passive requests).
            // These are the cases where the user pushed "so try it" / "do it" etc. and the model should not plan.
            const latestUserMsgForGuard = (typeof lastRequestMessage?.content === 'string'
              ? lastRequestMessage.content
              : '').toLowerCase().trim()
            const DIRECT_EXECUTION_INTENT = /\b(so try it|try it|do it|run it|go ahead|just do it|execute it|try now|do this now|create it now|add it now|just (do|create|add|run|try|fix|execute) it|actually do it|just act|act now|do something|start now|go now|proceed|fire it|make it happen)\b/i
            const userWantsImmediateExecution = DIRECT_EXECUTION_INTENT.test(latestUserMsgForGuard)

            if (
              (lastIntegrationFailed || userWantsImmediateExecution) &&
              !followThroughForced &&
              fullContent.trim() &&
              INTENTION_ONLY_RESPONSE.test(fullContent.trim())
            ) {
              followThroughForced = true
              // Remove this intention-only turn from the accumulated final content —
              // it will be replaced by the real result from the forced continuation.
              if (iterationContentForDb.trim()) {
                const trimmed = iterationContentForDb.trimStart()
                if (finalAssistantContentForDb.trimEnd().endsWith(trimmed.trimEnd())) {
                  finalAssistantContentForDb = finalAssistantContentForDb.trimEnd().slice(0, -trimmed.trimEnd().length).trimEnd()
                }
              }
              // Push a correction instruction as a user turn to force actual action.
              const correctionReason = userWantsImmediateExecution
                ? 'The user explicitly said to execute now but you narrated a plan instead of calling any tool.'
                : 'You described what you plan to do after an integration failure but did not call any tool.'
              conversationMessages.push({
                role: 'user' as const,
                content: `[SYSTEM CORRECTION — not visible to user] ${correctionReason} You MUST now: (1) immediately call the specific tool to perform the action with corrected parameters, OR (2) write a concise final message with EXACTLY what failed (provider, HTTP status, error text) and ONE specific next step. Use the result format: ✅/❌ + outcome. Do NOT narrate further. Act or conclude now.`,
              } as any)
              currentStream = await getAnthropicInstance().messages.create({
                model: normalizeModelForTransport(selectedModel),
                max_tokens: continuationMaxTokens,
                system: fullSystemPrompt,
                messages: conversationMessages,
                tools: capturedToolsToUse,
                stream: true,
                ...(capturedSupportsThinking ? { thinking: { type: 'enabled', budget_tokens: 4000 } } : {}),
              } as any)
              continue
            }
            // LARGE-TASK NARRATION BACKSTOP:
            // Detect when the model described deploying agents / setting up operations for a large
            // task but never called create_agent or compile_operation. Force a real tool call.
            const LARGE_TASK_NARRATION_RE = /\b(deploy|deploying|launch|launching|set(ting)? up|spinning up|creating).{0,40}(agent|automation|bot|mission|worker|task|nora|kai|mia|ava|max)\b|\b(agent (1|2|3)|agent[- ]?\d)\b/i
            const _latestMsgForBackstop = (typeof lastRequestMessage?.content === 'string' ? lastRequestMessage.content : '').toLowerCase()
            const _largeTaskKeywords = /\b(find|get|source|collect)\s+(\d{3,}|\d{2,}0)\s+(leads?|companies|contacts?|prospects?)/i // 100+ or round numbers like 50, 30, etc
            const _isLargeTask = _largeTaskKeywords.test(_latestMsgForBackstop)
            if (
              _isLargeTask &&
              !followThroughForced &&
              fullContent.trim() &&
              LARGE_TASK_NARRATION_RE.test(fullContent)
            ) {
              followThroughForced = true
              conversationMessages.push({
                role: 'user' as const,
                content: `[SYSTEM CORRECTION — not visible to user] You described deploying agents for a large task but did NOT call create_agent or compile_operation. For requests of this scale, you MUST call create_agent now to actually deploy the background agent. Call it immediately with a descriptive task. Do NOT narrate further.`,
              } as any)
              currentStream = await getAnthropicInstance().messages.create({
                model: normalizeModelForTransport(selectedModel),
                max_tokens: continuationMaxTokens,
                system: fullSystemPrompt,
                messages: conversationMessages,
                tools: capturedToolsToUse,
                stream: true,
                ...(capturedSupportsThinking ? { thinking: { type: 'enabled', budget_tokens: 4000 } } : {}),
              } as any)
              continue
            }
            break
          }

          // EXECUTE-FIRST INTERCEPT: If the model called create_agent for a bounded direct-execution
          // task, redirect to inline execution rather than letting confirmation fallback fire.
          // classifyExecution() is the single source of truth for what is and isn't a direct task.
          let _policyApprovedBackground = false // set below; read by guardrail further down
          if (toolCall.name === 'create_agent') {
            const latestUserMsgRaw = typeof lastRequestMessage?.content === 'string' ? lastRequestMessage.content : ''
            const { classifyExecution: _classify } = await import('@/lib/execution/execute-first-policy')
            const _cls = _classify({ taskDescription: latestUserMsgRaw })
            // Also detect scheduling keywords — recurring requests are legitimately agent work
            const _hasSchedule = /\b(daily|weekly|per day|each day|every day|every week|every morning|hourly|ongoing|recurring|continuously|keep doing)\b/i.test(latestUserMsgRaw)

            // ── RECURRING INTERCEPT: force compile_operation, never create_agent ──
            if (_cls.mode === 'recurring_operation' || (_hasSchedule && _cls.mode !== 'direct_execute')) {
              console.log(`[RECURRING INTERCEPT] Blocking create_agent for recurring request, forcing compile_operation: "${latestUserMsgRaw.slice(0, 100)}"`)
              conversationMessages.push({
                role: 'assistant' as const,
                content: [
                  ...(fullContent ? [{ type: 'text' as const, text: fullContent }] : []),
                  { type: 'tool_use' as const, id: toolCall.id, name: toolCall.name, input: toolCall.input && toolCall.input.trim() ? JSON.parse(toolCall.input) : {} }
                ]
              } as any)
              conversationMessages.push({
                role: 'user' as const,
                content: [{
                  type: 'tool_result' as const,
                  tool_use_id: toolCall.id,
                  content: JSON.stringify({
                    success: false,
                    blocked: true,
                    reason: 'RECURRING POLICY: This is a recurring/scheduled task. Do NOT create an agent yet. You MUST first call compile_operation with action="compile" and user_request=<exact user request>. Present the compiled plan to the user. Only create an agent AFTER the user confirms the plan by calling compile_operation with action="activate".',
                  })
                }]
              } as any)
              currentStream = await getAnthropicInstance().messages.create({
                model: normalizeModelForTransport(selectedModel),
                max_tokens: continuationMaxTokens,
                system: fullSystemPrompt,
                messages: conversationMessages,
                tools: capturedToolsToUse,
                stream: true,
                ...(capturedSupportsThinking ? { thinking: { type: 'enabled', budget_tokens: 4000 } } : {}),
              } as any)
              iteration-- // Intercept redirect is not a real work iteration; reclaim the slot
              continue
            }

            // ── BACKGROUND AGENT: mark as policy-approved so guardrail skips confirmation ──
            if (_cls.mode === 'background_agent') {
              _policyApprovedBackground = true
              console.log(`[BACKGROUND POLICY] Allowing immediate create_agent for large task: "${latestUserMsgRaw.slice(0, 100)}"`)
            }

            if (_cls.mode === 'direct_execute' && !_hasSchedule) {
              console.log(`[EXECUTE-FIRST INTERCEPT] Redirecting create_agent to direct execution for: "${latestUserMsgRaw.slice(0, 100)}". Classification: ${_cls.reason}`)
              // Push a correction instruction that forces the model to execute directly this iteration
              conversationMessages.push({
                role: 'assistant' as const,
                content: [
                  ...(fullContent ? [{ type: 'text' as const, text: fullContent }] : []),
                  { type: 'tool_use' as const, id: toolCall.id, name: toolCall.name, input: toolCall.input && toolCall.input.trim() ? JSON.parse(toolCall.input) : {} }
                ]
              } as any)
              conversationMessages.push({
                role: 'user' as const,
                content: [{
                  type: 'tool_result' as const,
                  tool_use_id: toolCall.id,
                  content: JSON.stringify({
                    success: false,
                    blocked: true,
                    reason: 'EXECUTE-FIRST POLICY: This is a bounded direct-execution task. Do NOT create an agent. Execute inline right now using the appropriate tools (web_search, integration_*, github_*, etc.). Show progress as you go. Do NOT ask for confirmation. Do NOT narrate. Just execute.',
                  })
                }]
              } as any)
              // Continue the loop — model will now execute directly
              currentStream = await getAnthropicInstance().messages.create({
                model: normalizeModelForTransport(selectedModel),
                max_tokens: continuationMaxTokens,
                system: fullSystemPrompt,
                messages: conversationMessages,
                tools: capturedToolsToUse,
                stream: true,
                ...(capturedSupportsThinking ? { thinking: { type: 'enabled', budget_tokens: 4000 } } : {}),
              } as any)
              iteration-- // Intercept redirect is not a real work iteration; reclaim the slot
              continue
            }
          }

          // GUARDRAIL: Block sensitive tool calls unless explicitly requested in latest message
          // Note: integration_* tools are NOT in this list — they execute directly without confirmation.
          // This guard applies only to agent lifecycle actions (create/run/delete) which spawn background processes.
          // _policyApprovedBackground is set above for large one-shot tasks — skip confirmation for those.
          if (_policyApprovedBackground && toolCall.name === 'create_agent') {
            // Large background task: deploy immediately, no confirmation needed.
            // Skip the sensitive-tool confirmation gate and let the create_agent execute.
            console.log('[GUARDRAIL SKIP] Bypassing confirmation for policy-approved background agent deployment')
          }
          const sensitiveTools = _policyApprovedBackground && toolCall.name === 'create_agent'
            ? [] // empty = no confirmation for large background tasks
            : ['create_agent', 'delete_agent', 'delete_all_agents', 'run_agent']
          const latestUserMsg = (typeof lastRequestMessage?.content === 'string'
            ? lastRequestMessage.content 
            : '').toLowerCase()
          
          if (sensitiveTools.includes(toolCall.name)) {
            // Patterns that clearly authorize agent creation/running
            const createPatterns = /\b(create|make|build|set up|setup|start|add|launch|spin up|get me|give me|i need|i want)\b.*(agent|automation|bot|teammate|one|it)|\b(agent|bot|automation)\b.*(create|make|build|start|launch)/i
            const schedulingPatterns = /\b(every|daily|weekly|morning|evening|hourly|each day|each week|regularly|automatically|monitor|track|alert me|notify me|keep me updated|give me .* (every|daily|weekly))\b/i
            const delegatedTaskPatterns = /\b(i want you to|i need you to|can you|could you|please|help me)\b.*\b(find|research|monitor|track|watch|analyze|write|qualify|validate|collect|scrape|review|check|report)\b/i
            // run_agent: any imperative to run/start/trigger an existing agent
            const runPatterns = /\b(run|execute|trigger|start|launch|do it|fetch|get|make them run|run them|run (it|now|again)|do it now|do this now|start now|go now|kick off|try it|test it|let them|let'?s try|add it now|add them now|fire|now)\b/i
            const deletePatterns = /\b(delete|remove|stop|cancel|kill|nuke|clear|wipe|purge|get rid of|clean|throw away|destroy|drop|delet)\b.*(agent|automation|bot|teammate|them|all|everything|it|one|agents)|\b(clean|wipe|nuke|purge)\b.*(it|them|all|up|everything)/i
            const searchPatterns = /\b(search|look up|find|google|research|reaserch|look into|investigate)\b/i
            // Any positive confirmation counts — user already gave the command
            const confirmPatterns = /\b(yes|go|go ahead|do it|confirm|please|sure|ok|okay|proceed|yep|yup|absolutely|let's go|sounds good|do that|run it|start it|start them|make them|fire it|fire them|do this)\b/i
            // Direct task delegation without using the word "agent" — "find me 10 leads daily", "monitor this weekly"
            const isScheduledSubstantiveWork = /\b(daily|weekly|every day|each day|every week|regularly|automatically|each morning|every morning)\b/i.test(latestUserMsg)
              && /\b(find|research|monitor|track|collect|analyze|add|report|check|review|scrape|send|draft)\b/i.test(latestUserMsg)
            
            let isExplicitRequest = false
            
            if (toolCall.name === 'create_agent') {
              isExplicitRequest = createPatterns.test(latestUserMsg)
                || delegatedTaskPatterns.test(latestUserMsg)
                || confirmPatterns.test(latestUserMsg)
                || isScheduledSubstantiveWork
                || (schedulingPatterns.test(latestUserMsg) && !searchPatterns.test(latestUserMsg))
            } else if (toolCall.name === 'run_agent') {
              isExplicitRequest = runPatterns.test(latestUserMsg) || confirmPatterns.test(latestUserMsg)
            } else if (toolCall.name === 'delete_agent' || toolCall.name === 'delete_all_agents') {
              isExplicitRequest = deletePatterns.test(latestUserMsg) || confirmPatterns.test(latestUserMsg) || latestUserMsg.includes('delet')
            }
            
            if (!isExplicitRequest) {
              console.log(`[GUARDRAIL] Blocked ${toolCall.name} - not explicitly requested. User said: "${latestUserMsg.slice(0, 100)}"`)
              const actionLabel = toolCall.name === 'create_agent' ? 'create that agent'
                : toolCall.name === 'delete_all_agents' ? 'delete all agents'
                : toolCall.name === 'delete_agent' ? 'delete that agent'
                : toolCall.name === 'run_agent' ? 'run that agent'
                : 'do that'
              const fallbackMsg = `I can ${actionLabel} — just confirm with "yes, go ahead" and I'll proceed right away.`
              // For run_agent: persist the intended action so the next "yes" executes deterministically
              if (toolCall.name === 'run_agent') {
                try {
                  const parsedRunInput = toolCall.input && toolCall.input.trim() ? JSON.parse(toolCall.input) : {}
                  if (parsedRunInput.agent_id) {
                    const { data: agentForPending } = await supabase
                      .from('agents')
                      .select('name')
                      .eq('id', parsedRunInput.agent_id)
                      .single()
                    const agentPendingName = (agentForPending as { name?: string } | null)?.name || 'the agent'
                    setPendingConfirmation(user.id, 'run_agent', {
                      agent_id: parsedRunInput.agent_id,
                      agent_name: agentPendingName,
                    }).catch(() => {})
                  }
                } catch { /* non-critical: pending state save failed */ }
              }
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: fallbackMsg })}\n\n`))
              finalAssistantContentForDb = iterationContentForDb.trim()
                ? iterationContentForDb.trimEnd() + '\n\n' + fallbackMsg
                : fallbackMsg
              break
            }
          }

          // Handle tool call
          console.log('Tool call detected:', toolCall.name, toolCall.input)
          let toolResult: string = '' // Capture tool result for continuation
          try {
            const input = toolCall.input && toolCall.input.trim() ? JSON.parse(toolCall.input) : {}

            const mappedState = mapToolToAiState(toolCall.name, input as Record<string, unknown>)
            enqueueAiState({
              state: mappedState.state,
              context: mappedState.context,
              metadata: mappedState.metadata,
              startTime: Date.now(),
            })
            if (mappedState.progress) {
              enqueueProgressUpdate({
                update_type: 'status',
                message: mappedState.progress,
              })
            }

            // Emit structured activity step for the tool call
            const toolStepId = `tool-${toolCall.id || Date.now()}`
            const toolKindMap: Record<string, string> = { web_search: 'search', analyze_url: 'browse' }
            enqueueStepUpsert({
              id: toolStepId,
              kind: toolKindMap[toolCall.name] || 'tool',
              status: 'active',
              label: mappedState.context || toolCall.name,
              data: toolCall.name === 'web_search' ? { query: (input as any).query } 
                   : toolCall.name === 'analyze_url' ? { url: (input as any).url }
                   : { toolName: toolCall.name },
            })

            if (toolCall.name !== 'create_agent') {
              enqueueSse({
                type: 'tool_call',
                tool: toolCall.name,
              })
            }
            
            if (toolCall.name === 'set_ai_name') {
              console.log('Setting AI name to:', input.name, 'for workspace:', scope.workspaceId)
              // Save the AI name to workspace (workspace-scoped personalization)
              const { error: updateError } = await supabase
                .from('workspaces')
                .update({ ai_name: input.name } as never)
                .eq('id', scope.workspaceId!)
              
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ 
                  type: 'tool_result', 
                  tool: 'set_ai_name',
                  success: !updateError,
                  name: input.name
                })}\n\n`)
              )
              // Only send confirmation text if AI didn't already generate a response
              if (!fullContent.trim()) {
                const confirmationText = `Perfect — you can call me ${input.name} from now on.\n\nWhat should I call you?`
                iterationContentForDb += confirmationText
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ text: confirmationText })}\n\n`)
                )
              }
            } else if (toolCall.name === 'set_user_name') {
              console.log('Setting user name to:', input.name)
              // Save the user's name to their profile
              const { error: updateError } = await supabase
                .from('profiles')
                .update({ full_name: input.name } as never)
                .eq('id', user.id)

              console.log('Update user name result:', updateError ? 'Error: ' + updateError.message : 'Success')
              
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ 
                  type: 'tool_result', 
                  tool: 'set_user_name',
                  success: !updateError,
                  name: input.name
                })}\n\n`)
              )
              // Only send confirmation if AI didn't already generate a response
              if (!fullContent.trim()) {
                const confirmationText = `Nice to meet you, ${input.name}! What would you like to work on first?`
                iterationContentForDb += confirmationText
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ text: confirmationText })}\n\n`)
                )
              }
            } else if (toolCall.name === 'create_agent') {
              // Normalize name server-side — reject task-style/CamelCase/numeric names
              const agentName = normalizeAgentName(input.name)
              if (agentName !== String(input.name || '').trim()) {
                console.log(`[Chat] Agent name normalized: "${input.name}" → "${agentName}"`)
                // Patch already-streamed text so the stored message uses the real name
                if (input.name && iterationContentForDb) {
                  iterationContentForDb = iterationContentForDb.split(String(input.name)).join(agentName)
                }
              }

              // Limit: prevent mass agent creation (max 10 active agents per workspace)
              const { count: existingCount } = scope.workspaceId
                ? await supabase
                    .from('agents')
                    .select('id', { count: 'exact', head: true })
                    .eq('workspace_id', scope.workspaceId)
                    .not('status', 'eq', 'terminated')
                : { count: 0 }

              if ((existingCount || 0) >= 10) {
                const limitMsg = `You already have ${existingCount} agents in this workspace. Remove some before adding new ones — I don't want to create agents you don't need.`
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: limitMsg })}\n\n`))
                finalAssistantContentForDb = iterationContentForDb.trim()
                  ? iterationContentForDb.trimEnd() + '\n\n' + limitMsg
                  : limitMsg
                break
              }

              // Duplicate-agent guard: check for existing agents with same name or very similar description
              if (scope.workspaceId) {
                const { data: existingAgents } = await supabase
                  .from('agents')
                  .select('id, name, status, config')
                  .eq('user_id', user.id)
                  .eq('workspace_id', scope.workspaceId)
                  .not('status', 'eq', 'terminated')

                const newName = agentName.toLowerCase().trim()
                const newDesc = (typeof input.description === 'string' ? input.description : '').toLowerCase()

                const wordOverlap = (a: string, b: string): number => {
                  const wa = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 3))
                  const wb = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 3))
                  if (wa.size === 0 || wb.size === 0) return 0
                  let common = 0
                  wa.forEach(w => { if (wb.has(w)) common++ })
                  return common / Math.min(wa.size, wb.size)
                }

                const match = (existingAgents || []).find(a => {
                  const existingName = (a as { id: string; name: string; status: string; config: unknown }).name.toLowerCase().trim()
                  const existingDesc = ((a as { config?: { description?: string } }).config?.description || '').toLowerCase()
                  const nameSame = existingName === newName
                  const descSimilar = newDesc.length > 20 && existingDesc.length > 20 && wordOverlap(newDesc, existingDesc) >= 0.6
                  return nameSame || descSimilar
                }) as { id: string; name: string; status: string } | undefined

                if (match) {
                  const reuseMsg = `An agent called **${match.name}** already exists and covers the same task (status: ${match.status}). I'll run it again rather than creating a duplicate.`
                  toolResult = JSON.stringify({ success: false, reuse: true, agentId: match.id, agentName: match.name, agentStatus: match.status, message: reuseMsg })
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: 'tool_result', tool: 'create_agent', result: 'reuse', reuse: true, agentId: match.id, agentName: match.name, agentStatus: match.status })}\n\n`)
                  )
                  continue
                }
              }

              // Send tool_call event so frontend shows building indicator
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ 
                  type: 'tool_call',
                  tool: 'create_agent',
                  name: agentName
                })}\n\n`)
              )
              
              // Use admin client for agent + conversation creation to bypass RLS,
              // matching the pattern used by delete_all_agents and get_agents_status.
              // User identity is enforced by explicitly setting user_id and workspace_id.
              const adminForCreate = createAdminClient()

              // Create a new conversation for the agent
              const { data: conversation, error: convError } = await adminForCreate
                .from('conversations')
                .insert({
                  user_id: user.id,
                  workspace_id: scope.workspaceId,
                  title: `Chat with ${agentName}`,
                  status: 'active',
                } as never)
                .select()
                .single()

              if (convError) {
                console.error('[Chat] Conversation insert failed for create_agent:', convError)
              }

              if (!convError && conversation) {
                const convData = conversation as { id: string }
                
                // Calculate next run time for scheduled agents
                const scheduleType = input.schedule_type || 'once'
                let nextRunAt: string | null = null
                let runImmediately = true
                
                if (scheduleType === 'scheduled' && input.schedule_cron) {
                  // For scheduled tasks, calculate the actual next run time from cron
                  const nextRun = calculateNextRunTime(input.schedule_cron, input.schedule_timezone || 'UTC')
                  nextRunAt = nextRun.toISOString()
                  // Recurring agents run on their schedule — do NOT execute the first batch immediately
                  runImmediately = false
                } else if (scheduleType === 'once' || scheduleType === 'realtime') {
                  // For one-time and realtime, run immediately
                  nextRunAt = new Date().toISOString()
                  runImmediately = true
                }

                // Create the agent with scheduling info
                const { data: newAgent, error: agentError } = await adminForCreate.from('agents').insert({
                  user_id: user.id,
                  workspace_id: scope.workspaceId,
                  conversation_id: convData.id,
                  name: agentName,
                  type: input.type,
                  status: 'initializing',
                  config: { description: input.description },
                  last_active: new Date().toISOString(),
                  schedule_type: scheduleType,
                  schedule_cron: input.schedule_cron || null,
                  schedule_timezone: input.schedule_timezone || 'UTC',
                  next_run_at: nextRunAt,
                } as never).select().single()

                console.log('Agent creation result:', newAgent, 'Error:', agentError)
                const agentData = newAgent as { id: string } | null

                // Trigger VM provisioning based on schedule type
                if (agentData) {
                  console.log('\n[Chat] ====== AGENT CREATED ======')
                  console.log('[Chat] Agent ID:', agentData.id)
                  console.log('[Chat] Schedule type:', scheduleType)
                  console.log('[Chat] Run immediately:', runImmediately)
                  console.log('[Chat] Next run at:', nextRunAt)
                  console.log('[Chat] Task:', input.description?.slice(0, 100))
                  
                  if (runImmediately) {
                    // For one-time and realtime agents, run immediately
                    provisionAgentVM({
                      agentId: agentData.id,
                      agentName: agentName,
                      userId: user.id,
                      taskDescription: input.description,
                    }).then(async ({ vmIp }) => {
                      // Use admin client — cookie context is gone after stream closes
                      const thenAdminDb = createAdminClient()
                      console.log('[Chat] VM provisioning complete, vmIp:', vmIp)
                      if (vmIp) {
                        const runId = randomUUID()
                        const nowIso = new Date().toISOString()

                        await thenAdminDb
                          .from('agents')
                          .update({
                            status: 'initializing',
                            vm_ip: vmIp,
                            config: {
                              description: input.description,
                              execution_started: true,
                              active_run_id: runId,
                              active_run_started_at: nowIso,
                              active_run_task: input.description,
                              active_run_mode: 'queued',
                              last_retry_at: nowIso,
                            },
                          } as never)
                          .eq('id', agentData.id)

                        const enqueueResult = await enqueueAgentRun({
                          runId,
                          agentId: agentData.id,
                          userId: user.id,
                          triggerType: 'manual',
                          taskDescription: input.description,
                          metadata: {
                            queue_mode: 'collect',
                            requested_vm_ip: vmIp,
                            source: 'chat_create_agent',
                          },
                        })

                        if (!enqueueResult.success) {
                          await thenAdminDb
                            .from('agents')
                            .update({
                              status: 'failed',
                              config: {
                                description: input.description,
                                execution_started: false,
                                active_run_id: null,
                                active_run_ended_at: nowIso,
                                last_error: enqueueResult.error || 'Failed to queue new agent run',
                                last_error_at: nowIso,
                              },
                            } as never)
                            .eq('id', agentData.id)
                          console.error('[Chat] Failed to queue run for newly created agent:', enqueueResult.error)
                        } else {
                          // Kick worker so the queued run is processed immediately (no cron on localhost)
                          const cronSecret = (process.env.CRON_SECRET || '').trim()
                          if (cronSecret) {
                            fetch(`${internalApiBaseUrl}/api/agents/worker`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecret}` },
                              body: JSON.stringify({ limit: 2, concurrency: 1 }),
                            }).catch(() => {})
                          }
                        }
                      } else {
                        console.error('[Chat] No vmIp returned from provisioning — falling back to direct queue')
                        // Same fallback as the .catch() path: enqueue without a VM IP so
                        // the worker can resolve it on its own (SHARED_VM_IP / api-only).
                        const noIpRunId = randomUUID()
                        const noIpNow = new Date().toISOString()
                        await thenAdminDb
                          .from('agents')
                          .update({
                            status: 'initializing',
                            config: {
                              description: input.description,
                              execution_started: true,
                              active_run_id: noIpRunId,
                              active_run_started_at: noIpNow,
                              active_run_task: input.description,
                              active_run_mode: 'queued',
                              last_retry_at: noIpNow,
                              vm_provision_note: 'no_ip_from_provision',
                            },
                          } as never)
                          .eq('id', agentData.id)

                        const noIpResult = await enqueueAgentRun({
                          runId: noIpRunId,
                          agentId: agentData.id,
                          userId: user.id,
                          triggerType: 'manual',
                          taskDescription: input.description,
                          metadata: {
                            queue_mode: 'collect',
                            source: 'chat_create_agent_no_ip_fallback',
                          },
                        })

                        if (!noIpResult.success) {
                          await thenAdminDb
                            .from('agents')
                            .update({
                              status: 'failed',
                              config: {
                                description: input.description,
                                execution_started: false,
                                last_error: noIpResult.error || 'No VM available and fallback queue failed',
                                last_error_at: noIpNow,
                              },
                            } as never)
                            .eq('id', agentData.id)
                        } else {
                          const cronSecretNoIp = (process.env.CRON_SECRET || '').trim()
                          if (cronSecretNoIp) {
                            fetch(`${internalApiBaseUrl}/api/agents/worker`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecretNoIp}` },
                              body: JSON.stringify({ limit: 2, concurrency: 1 }),
                            }).catch(() => {})
                          }
                        }
                      }
                    }).catch(async (err) => {
                      // Use admin client — cookie context is gone after stream closes
                      const catchAdminDb = createAdminClient()
                      console.error('[Chat] VM provisioning failed, falling back to direct queue:', err)
                      // provisionAgentVM already set agent to 'failed' — reset and enqueue without a VM IP.
                      // The worker will try to claim a session on its own (or use api-only if integrations available).
                      const fallbackRunId = randomUUID()
                      const fallbackNow = new Date().toISOString()
                      await catchAdminDb
                        .from('agents')
                        .update({
                          status: 'initializing',
                          config: {
                            description: input.description,
                            execution_started: true,
                            active_run_id: fallbackRunId,
                            active_run_started_at: fallbackNow,
                            active_run_task: input.description,
                            active_run_mode: 'queued',
                            last_retry_at: fallbackNow,
                            vm_provision_error: err instanceof Error ? err.message : 'VM provisioning failed',
                          },
                        } as never)
                        .eq('id', agentData.id)

                      const fallbackResult = await enqueueAgentRun({
                        runId: fallbackRunId,
                        agentId: agentData.id,
                        userId: user.id,
                        triggerType: 'manual',
                        taskDescription: input.description,
                        metadata: {
                          queue_mode: 'collect',
                          source: 'chat_create_agent_vm_fallback',
                        },
                      })

                      if (!fallbackResult.success) {
                        await catchAdminDb
                          .from('agents')
                          .update({
                            status: 'failed',
                            config: {
                              description: input.description,
                              execution_started: false,
                              last_error: fallbackResult.error || 'Failed to queue agent run after VM provisioning failed',
                              last_error_at: fallbackNow,
                            },
                          } as never)
                          .eq('id', agentData.id)
                        console.error('[Chat] Fallback queue also failed:', fallbackResult.error)
                      } else {
                        console.log('[Chat] Fallback queue succeeded for agent:', agentData.id)
                        // Kick worker immediately so run isn't waiting on cron
                        const cronSecretFb = (process.env.CRON_SECRET || '').trim()
                        if (cronSecretFb) {
                          fetch(`${internalApiBaseUrl}/api/agents/worker`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cronSecretFb}` },
                            body: JSON.stringify({ limit: 2, concurrency: 1 }),
                          }).catch(() => {})
                        }
                      }
                    })
                  } else {
                    // For scheduled agents, set status to idle and let scheduler handle it
                    console.log('[Chat] Scheduled agent - will run at:', nextRunAt)
                    await supabase
                      .from('agents')
                      .update({ status: 'idle' } as never)
                      .eq('id', agentData.id)
                  }
                }

                const scheduleInfo = scheduleType === 'scheduled' 
                  ? ` (scheduled: ${input.schedule_cron})`
                  : scheduleType === 'realtime' 
                    ? ' (realtime monitoring)'
                    : ' (one-time task)'

                // Capture tool result for continuation
                if (agentError || !agentData) {
                  const createErrMsg = (agentError as { message?: string } | null)?.message || 'Database insert failed'
                  console.error('[Chat] Agent insert failed:', agentError)
                  toolResult = JSON.stringify({ success: false, error: 'Agent creation failed: ' + createErrMsg })
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ 
                      type: 'tool_result',
                      tool: 'create_agent',
                      result: 'error',
                      error: 'Agent creation failed: ' + createErrMsg
                    })}\n\n`)
                  )
                } else {
                  toolResult = JSON.stringify({ 
                    success: true, 
                    agentId: agentData.id, 
                    agentName: agentName,
                    scheduleType 
                  })

                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ 
                      type: 'tool_result',
                      tool: 'create_agent',
                      result: 'success',
                      agentName: agentName + scheduleInfo,
                      agentId: agentData.id,
                      agent: newAgent,
                      scheduleType: scheduleType
                    })}\n\n`)
                  )
                  
                  // Fire-and-forget: Record agent_created signal for behavior learning
                  recordBehaviorSignal(user.id, { type: 'agent_created', metadata: { agentId: agentData.id, agentName: agentName, scheduleType } }).catch(() => {})

                  // Emit a persistent agent_handoff event — page.tsx inserts this as a
                  // durable status card so the user always sees an in-progress indicator
                  // even after the stream ends, until a completion message arrives.
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({
                      type: 'agent_handoff',
                      agentId: agentData.id,
                      agentName: agentName,
                      scheduleType: scheduleType,
                    })}\n\n`)
                  )

                  // Send confirmation text — honest handoff language, no empty promises
                  const statusText = scheduleType === 'scheduled' 
                    ? `**${agentName}** is scheduled and will start its first run at ${nextRunAt ? new Date(nextRunAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: input.schedule_timezone || 'UTC' }) : 'the scheduled time'} (${input.schedule_timezone || 'UTC'}). It will then repeat on schedule: ${input.schedule_cron === '0 9 * * *' ? 'daily at 9 AM' : input.schedule_cron}. Results will appear here after each run.`
                    : scheduleType === 'realtime'
                      ? `**${agentName}** is starting up and working in the background.`
                      : `**${agentName}** is queued and running now. Results will appear here when it's done.`
                  
                  if (!fullContent.trim()) {
                    iterationContentForDb += statusText
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ text: statusText })}\n\n`)
                    )
                  }
                }
              } else {
                // Conversation creation failed
                const convErrMsg = (convError as { message?: string } | null)?.message || 'Conversation creation failed'
                console.error('[Chat] Conversation creation for agent failed:', convError)
                toolResult = JSON.stringify({ success: false, error: 'Agent setup failed: ' + convErrMsg })
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ 
                    type: 'tool_result',
                    tool: 'create_agent',
                    result: 'error',
                    error: 'Agent setup failed: ' + convErrMsg
                  })}\n\n`)
                )
              }
            } else if (toolCall.name === 'delete_agent') {
              // Delete agent and terminate VM if running
              const supabaseAdmin = createAdminClient()
              const requestedAgentId = typeof input.agent_id === 'string' && input.agent_id.trim()
                ? input.agent_id.trim()
                : null
              const requestedAgentName = typeof input.agent_name === 'string' && input.agent_name.trim()
                ? input.agent_name.trim()
                : null
              const resolvedAgentId = isAgentChat && agentChatData?.id
                ? agentChatData.id
                : requestedAgentId

              // Resolve agent — by ID if we have one, otherwise by name
              let agentQuery
              if (resolvedAgentId) {
                agentQuery = supabaseAdmin
                  .from('agents')
                  .select('id, name, vm_id')
                  .eq('id', resolvedAgentId)
                  .eq('user_id', user.id)
                  .limit(1)
              } else if (requestedAgentName) {
                agentQuery = supabaseAdmin
                  .from('agents')
                  .select('id, name, vm_id')
                  .ilike('name', requestedAgentName)
                  .eq('user_id', user.id)
                  .eq('workspace_id', scope.workspaceId!)
                  .limit(1)
              } else {
                toolResult = JSON.stringify({ success: false, error: 'Missing agent identifier or name' })
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ 
                    type: 'tool_result',
                    tool: 'delete_agent',
                    result: 'error',
                    error: 'Missing agent identifier or name'
                  })}\n\n`)
                )
                continue
              }

              const { data: agentRows } = await agentQuery
              const agent = agentRows?.[0] ?? null

              const agentToDelete = agent as { id: string; vm_id: string | null; name: string } | null

              if (agentToDelete) {
                // Terminate VM if exists
                if (agentToDelete.vm_id) {
                  const terminateHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
                  if (userAccessToken) terminateHeaders['Authorization'] = `Bearer ${userAccessToken}`
                  fetch(`${internalApiBaseUrl}/api/agents/terminate`, {
                    method: 'POST',
                    headers: terminateHeaders,
                    body: JSON.stringify({ agentId: agentToDelete.id }),
                  }).catch(err => console.error('[delete_agent] Failed to terminate VM:', err))
                }

                // Delete agent by its DB id (agentToDelete.id), NOT resolvedAgentId which may be null for name-lookups
                const { error: deleteAgentError } = await supabaseAdmin
                  .from('agents')
                  .delete()
                  .eq('id', agentToDelete.id)
                  .eq('user_id', user.id)

                if (deleteAgentError) {
                  console.error('[delete_agent] Delete failed:', deleteAgentError)
                  toolResult = JSON.stringify({ success: false, error: deleteAgentError.message })
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ 
                      type: 'tool_result',
                      tool: 'delete_agent',
                      result: 'error',
                      error: deleteAgentError.message
                    })}\n\n`)
                  )
                } else {
                  console.log('[delete_agent] Deleted agent:', agentToDelete.id, agentToDelete.name)
                  toolResult = JSON.stringify({ success: true, agentName: agentToDelete.name, agentId: agentToDelete.id })
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ 
                      type: 'tool_result',
                      tool: 'delete_agent',
                      result: 'success',
                      agentName: agentToDelete.name,
                      agentId: agentToDelete.id
                    })}\n\n`)
                  )
                }
              } else {
                toolResult = JSON.stringify({ success: false, error: 'Agent not found or access denied' })
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ 
                    type: 'tool_result',
                    tool: 'delete_agent',
                    result: 'error',
                    error: 'Agent not found or access denied'
                  })}\n\n`)
                )
              }
            } else if (toolCall.name === 'delete_all_agents') {
              console.log('[delete_all_agents] ========== START DELETE ALL AGENTS ==========')
              console.log('[delete_all_agents] user.id:', user.id)
              console.log('[delete_all_agents] scope.workspaceId:', scope.workspaceId)
              
              const supabaseAdminAll = createAdminClient()
              const { data: allAgents, error: fetchErr } = await supabaseAdminAll
                .from('agents')
                .select('id, name, vm_id, user_id, workspace_id')
                .eq('user_id', user.id)
                .eq('workspace_id', scope.workspaceId!)

              if (fetchErr) {
                console.error('[delete_all_agents] Fetch failed:', fetchErr)
              }

              const agentsList = (allAgents || []) as Array<{ id: string; name: string; vm_id: string | null; user_id: string; workspace_id: string }>
              console.log('[delete_all_agents] Found', agentsList.length, 'agents to delete')
              console.log('[delete_all_agents] Agent details:', JSON.stringify(agentsList, null, 2))

              if (agentsList.length === 0) {
                toolResult = JSON.stringify({ success: true, deleted: 0 })
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ 
                    type: 'tool_result',
                    tool: 'delete_all_agents',
                    result: 'success',
                    deleted: 0,
                    deletedAgents: []
                  })}\n\n`)
                )
              } else {
                // Fire-and-forget VM terminations
                for (const agent of agentsList) {
                  if (agent.vm_id) {
                    const terminateHeadersAll: Record<string, string> = { 'Content-Type': 'application/json' }
                    if (userAccessToken) terminateHeadersAll['Authorization'] = `Bearer ${userAccessToken}`
                    fetch(`${internalApiBaseUrl}/api/agents/terminate`, {
                      method: 'POST',
                      headers: terminateHeadersAll,
                      body: JSON.stringify({ agentId: agent.id }),
                    }).catch(err => console.error('Failed to terminate VM:', err))
                  }
                }

                // Delete by explicit ID list — avoids silent no-ops from WHERE clause mismatches.
                // Use .in() so we know exactly which rows are targeted.
                const agentIds = agentsList.map(a => a.id)
                console.log('[delete_all_agents] Attempting to delete agent IDs:', agentIds)
                console.log('[delete_all_agents] Delete filters - user_id:', user.id, 'workspace_id:', scope.workspaceId)
                
                const { data: deletedRows, error: deleteError } = await supabaseAdminAll
                  .from('agents')
                  .delete()
                  .in('id', agentIds)
                  .eq('user_id', user.id)
                  .eq('workspace_id', scope.workspaceId!)
                  .select('id, name')
                
                console.log('[delete_all_agents] Delete response - error:', deleteError, 'deletedRows:', deletedRows)

                if (deleteError) {
                  console.error('[delete_all_agents] Delete failed:', deleteError)
                  toolResult = JSON.stringify({ success: false, error: deleteError.message })
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ 
                      type: 'tool_result',
                      tool: 'delete_all_agents',
                      result: 'error',
                      error: deleteError.message
                    })}\n\n`)
                  )
                } else {
                  const deletedAgents = ((deletedRows || []) as Array<{ id: string; name: string }>)
                  const deletedCount = deletedAgents.length
                  console.log('[delete_all_agents] Deleted count:', deletedCount, 'Expected:', agentIds.length)
                  
                  const { count: remainingCount } = await supabaseAdminAll
                    .from('agents')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .eq('workspace_id', scope.workspaceId!)
                  
                  console.log('[delete_all_agents] Remaining count:', remainingCount)

                  if (deletedCount === 0 && agentIds.length > 0) {
                    console.error('[delete_all_agents] No rows deleted despite finding agents. Scope mismatch or FK/constraint issue.', {
                      requestedDeletes: agentIds.length,
                      remainingCount,
                    })
                    toolResult = JSON.stringify({
                      success: false,
                      error: 'Delete request completed but no agents were removed. Please retry or switch workspace and try again.'
                    })
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ 
                        type: 'tool_result',
                        tool: 'delete_all_agents',
                        result: 'error',
                        error: 'Delete request completed but no agents were removed. Please retry or switch workspace and try again.'
                      })}\n\n`)
                    )
                    continue
                  }

                  console.log('[delete_all_agents] ✓ SUCCESS: Deleted', deletedCount, 'agents. Remaining in workspace:', remainingCount)
                  console.log('[delete_all_agents] Deleted agent names:', deletedAgents.map(a => a.name))
                  console.log('[delete_all_agents] ========== END DELETE ALL AGENTS ==========')
                  toolResult = JSON.stringify({ success: true, deleted: deletedCount, deletedNames: deletedAgents.map(a => a.name) })
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ 
                      type: 'tool_result',
                      tool: 'delete_all_agents',
                      result: 'success',
                      deleted: deletedCount,
                      deletedAgents,
                      remaining: remainingCount || 0
                    })}\n\n`)
                  )
                }
              }
            } else if (toolCall.name === 'update_agent') {
              // Update agent configuration
              const updates: Record<string, unknown> = {}
              
              if (input.name) updates.name = input.name
              if (input.description) updates.config = { description: input.description }
              if (input.schedule_type) updates.schedule_type = input.schedule_type
              if (input.schedule_cron) updates.schedule_cron = input.schedule_cron
              if (input.status) updates.status = input.status

              // Recalculate next_run_at when schedule changes
              if (input.schedule_type || input.schedule_cron) {
                const { data: currentAgent } = await supabase
                  .from('agents')
                  .select('schedule_type, schedule_cron, schedule_timezone')
                  .eq('id', input.agent_id)
                  .eq('user_id', user.id)
                  .single()

                const current = currentAgent as { schedule_type: string; schedule_cron: string | null; schedule_timezone: string } | null
                const finalScheduleType = input.schedule_type ?? current?.schedule_type ?? 'once'
                const finalScheduleCron = input.schedule_cron ?? current?.schedule_cron
                const finalTimezone = current?.schedule_timezone ?? 'UTC'

                if (finalScheduleType === 'scheduled' && finalScheduleCron) {
                  const nextRun = calculateNextRunTime(finalScheduleCron, finalTimezone)
                  updates.next_run_at = nextRun.toISOString()
                } else if (finalScheduleType === 'once' || finalScheduleType === 'realtime') {
                  updates.next_run_at = new Date().toISOString()
                }
              }

              const { data: updatedAgent, error: updateError } = await supabase
                .from('agents')
                .update(updates as never)
                .eq('id', input.agent_id)
                .eq('user_id', user.id)
                .select()
                .single()

              if (!updateError && updatedAgent) {
                const updated = updatedAgent as { name: string }
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ 
                    type: 'tool_result',
                    tool: 'update_agent',
                    result: 'success',
                    agentName: updated.name
                  })}\n\n`)
                )
              } else {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ 
                    type: 'tool_result',
                    tool: 'update_agent',
                    result: 'error',
                    error: 'Failed to update agent'
                  })}\n\n`)
                )
              }
            } else if (toolCall.name === 'run_agent') {
              // Run an existing agent immediately via internal fetch to /api/agents/run
              try {
                const runHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
                if (userAccessToken) runHeaders['Authorization'] = `Bearer ${userAccessToken}`
                const runResponse = await fetch(`${internalApiBaseUrl}/api/agents/run`, {
                  method: 'POST',
                  headers: runHeaders,
                  body: JSON.stringify({ agentId: input.agent_id, workspaceId: scope.workspaceId, reset: true }),
                })
                const runResult = await runResponse.json()

                if (runResponse.ok) {
                  // Get agent name for response
                  const { data: agentInfo } = await supabase
                    .from('agents')
                    .select('name')
                    .eq('id', input.agent_id)
                    .single()

                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ 
                      type: 'tool_result',
                      tool: 'run_agent',
                      result: 'success',
                      agentName: (agentInfo as { name: string } | null)?.name || 'Agent'
                    })}\n\n`)
                  )
                  toolResult = JSON.stringify(runResult)
                } else {
                  const runErrorMsg = (runResult as { error?: string }).error || 'Failed to start agent'
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ 
                      type: 'tool_result',
                      tool: 'run_agent',
                      result: 'error',
                      error: runErrorMsg
                    })}\n\n`)
                  )
                  toolResult = JSON.stringify({ success: false, error: runErrorMsg, status: runResponse.status })
                }
              } catch (runErr) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ 
                    type: 'tool_result',
                    tool: 'run_agent',
                    result: 'error',
                    error: runErr instanceof Error ? runErr.message : 'Failed to start agent'
                  })}\n\n`)
                )
              }
            } else if (toolCall.name === 'get_agents_status') {
              // Get all agents status for proactive reporting
              // Use admin client to bypass RLS SELECT policy drift (security via explicit user_id+workspace_id filters)
              const adminForStatus = createAdminClient()
              const { data: allAgents } = await adminForStatus
                .from('agents')
                .select('*')
                .eq('user_id', user.id)
                .eq('workspace_id', scope.workspaceId!)
                .order('last_active', { ascending: false })

              const agentsList = (allAgents || []) as Array<{
                id: string
                name: string
                status: string
                schedule_type: string
                last_run_at: string | null
                next_run_at: string | null
                config: {
                  description?: string
                  last_error?: string | null
                  last_error_at?: string | null
                  last_progress?: { type?: string; message?: string } | null
                  last_run_summary?: string | null
                  active_run_task?: string | null
                } | null
                total_credits_used: number
              }>

              const statusReport = agentsList.map(a => {
                const cfg = a.config || {}
                const entry: Record<string, unknown> = {
                  id: a.id,
                  name: a.name,
                  status: a.status,
                  schedule_type: a.schedule_type,
                  last_run: a.last_run_at,
                  next_run: a.next_run_at,
                  mission: cfg.description,
                  credits_used: a.total_credits_used || 0,
                }
                if (cfg.last_error) entry.last_error = cfg.last_error.slice(0, 200)
                if (cfg.last_run_summary) entry.last_run_summary = cfg.last_run_summary.slice(0, 300)
                if (cfg.last_progress?.message) entry.last_progress = cfg.last_progress.message.slice(0, 200)
                if ((a.status === 'working' || a.status === 'initializing') && cfg.active_run_task) {
                  entry.active_task = cfg.active_run_task.slice(0, 150)
                }
                return entry
              })

              // Capture tool result for continuation
              const activeAgentsCount = statusReport.filter(a => a['status'] === 'working').length
              const totalCredits = statusReport.reduce((sum, a) => sum + (typeof a['credits_used'] === 'number' ? a['credits_used'] : 0), 0)
              toolResult = JSON.stringify({
                agents: statusReport,
                total_agents: statusReport.length,
                active_agents: activeAgentsCount
              })

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ 
                  type: 'tool_result',
                  tool: 'get_agents_status',
                  result: 'success',
                  agents: statusReport,
                  total_agents: statusReport.length,
                  active_agents: activeAgentsCount,
                  total_credits: totalCredits
                })}\n\n`)
              )
            } else if (toolCall.name === 'send_progress_update') {
              // Send a proactive update to the user
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ 
                  type: 'progress_update',
                  update_type: input.update_type,
                  agent_id: input.agent_id,
                  message: input.message
                })}\n\n`)
              )
            } else if (toolCall.name === 'schedule_follow_up') {
              // Schedule a follow-up message using the reminders system
              const delayMinutes = Math.max(1, Math.min(input.delay_minutes || 5, 1440))
              const deliverAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()
              const followUpMessage = input.message || 'Following up on our earlier conversation.'
              const checkAgents = Boolean(input.check_agents)

              try {
                const adminFollowUp = createAdminClient()
                // Insert a system message with deliver_at — the reminders worker (cron every 1 min) will pick it up
                await adminFollowUp.from('messages').insert({
                  conversation_id: conversationId,
                  role: 'system',
                  content: followUpMessage,
                  metadata: {
                    type: 'reminder',
                    deliver_at: deliverAt,
                    delivered: 'false',
                    message: followUpMessage,
                    context: input.context || null,
                    check_agents: checkAgents,
                    priority: 'medium',
                    reminder_id: `follow_up_${Date.now()}`,
                    source: 'ai_manager_follow_up',
                  },
                } as never)

                toolResult = JSON.stringify({
                  success: true,
                  scheduled_for: deliverAt,
                  delay_minutes: delayMinutes,
                  message: followUpMessage,
                })
                console.log(`[Chat] Scheduled follow-up in ${delayMinutes}m for conversation ${conversationId}`)
              } catch (followUpErr) {
                console.error('[Chat] Failed to schedule follow-up:', followUpErr)
                toolResult = JSON.stringify({
                  success: false,
                  error: 'Failed to schedule follow-up',
                })
              }
            } else if (toolCall.name === 'web_search') {
              // Perform web search using DuckDuckGo with multiple fallback strategies
              try {
                const searchQuery = encodeURIComponent(input.query)
                const numResults = Math.min(input.num_results || 5, 10)
                const ddgHeaders = {
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                  'Accept-Language': 'en-US,en;q=0.9',
                }

                // Helper: decode DDG redirect URL
                const decodeDdgUrl = (rawUrl: string): string => {
                  const uddgMatch = rawUrl.match(/uddg=([^&]+)/)
                  if (uddgMatch) return decodeURIComponent(uddgMatch[1])
                  return rawUrl
                }

                // Helper: clean HTML entities
                const cleanHtml = (s: string) =>
                  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/<[^>]*>/g, '').trim()

                const urls: string[] = []
                const titles: string[] = []
                const snippets: string[] = []

                // Strategy 1: DuckDuckGo HTML page via POST (DDG requires POST for HTML results)
                try {
                  const response = await fetch('https://html.duckduckgo.com/html/', {
                    method: 'POST',
                    headers: {
                      ...ddgHeaders,
                      'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: `q=${searchQuery}&b=`,
                  })
                  const html = await response.text()
                  console.log(`[Search] DDG HTML response: ${response.status}, length=${html.length}, has result__a=${html.includes('result__a')}, has result-link=${html.includes('result-link')}`)

                  // Pattern A: class="result__a" with href (standard DDG HTML)
                  const patternA = /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
                  // Pattern B: href before class
                  const patternB = /href="([^"]*)"[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/g
                  // Pattern C: data-testid based (newer DDG)
                  const patternC = /data-testid="result-title-a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
                  // Pattern D: broader — any DDG redirect link
                  const patternD = /<a[^>]+href="((?:https?:)?\/\/duckduckgo\.com\/l\/\?[^"]*uddg=[^"]*)"[^>]*>([\s\S]*?)<\/a>/g
                  // Pattern E: any link with uddg parameter
                  const patternE = /href="([^"]*uddg=[^"]*)"[^>]*>([\s\S]*?)<\/a>/g

                  let match
                  for (const pattern of [patternA, patternB, patternC, patternD, patternE]) {
                    if (urls.length >= numResults) break
                    pattern.lastIndex = 0
                    while ((match = pattern.exec(html)) !== null && urls.length < numResults) {
                      let url = decodeDdgUrl(match[1])
                      // Handle protocol-relative URLs
                      if (url.startsWith('//')) url = 'https:' + url
                      if (url.startsWith('http') && !url.includes('duckduckgo.com') && !urls.includes(url)) {
                        urls.push(url)
                        titles.push(cleanHtml(match[2]))
                      }
                    }
                  }

                  // Parse snippets
                  const snippetPatterns = [
                    /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div|span)>/g,
                    /class="result__snippet"[^>]*>([^<]*)/g,
                  ]
                  for (const sp of snippetPatterns) {
                    if (snippets.length >= urls.length) break
                    sp.lastIndex = 0
                    while ((match = sp.exec(html)) !== null && snippets.length < numResults) {
                      snippets.push(cleanHtml(match[1]))
                    }
                  }

                  console.log(`[Search] Strategy 1 results: ${urls.length} URLs found`)
                } catch (htmlErr) {
                  console.error('[Search] HTML POST failed:', htmlErr)
                }

                // Strategy 2: DDG Lite page via POST
                if (urls.length === 0) {
                  try {
                    const liteResp = await fetch('https://lite.duckduckgo.com/lite/', {
                      method: 'POST',
                      headers: {
                        ...ddgHeaders,
                        'Content-Type': 'application/x-www-form-urlencoded',
                      },
                      body: `q=${searchQuery}`,
                    })
                    const liteHtml = await liteResp.text()
                    console.log(`[Search] DDG Lite response: ${liteResp.status}, length=${liteHtml.length}, has result-link=${liteHtml.includes('result-link')}, has web-result=${liteHtml.includes('web-result')}`)

                    // Lite page patterns
                    const litePatterns = [
                      /class="result-link"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g,
                      /href="([^"]*)"[^>]*class="result-link"[^>]*>([\s\S]*?)<\/a>/g,
                      // Broader: any external link in results table
                      /<a[^>]+rel="nofollow"[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g,
                    ]
                    const liteSnippetPattern = /class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g

                    let match
                    for (const lp of litePatterns) {
                      if (urls.length >= numResults) break
                      lp.lastIndex = 0
                      while ((match = lp.exec(liteHtml)) !== null && urls.length < numResults) {
                        let url = decodeDdgUrl(match[1])
                        if (url.startsWith('//')) url = 'https:' + url
                        if (url.startsWith('http') && !url.includes('duckduckgo.com') && !urls.includes(url)) {
                          urls.push(url)
                          titles.push(cleanHtml(match[2]))
                        }
                      }
                    }
                    while ((match = liteSnippetPattern.exec(liteHtml)) !== null && snippets.length < numResults) {
                      snippets.push(cleanHtml(match[1]))
                    }
                    console.log(`[Search] Strategy 2 results: ${urls.length} URLs found`)
                  } catch (liteErr) {
                    console.error('[Search] Lite POST failed:', liteErr)
                  }
                }

                // Strategy 3: DDG API for instant answers (limited but reliable)
                if (urls.length === 0) {
                  try {
                    const apiResp = await fetch(
                      `https://api.duckduckgo.com/?q=${searchQuery}&format=json&no_html=1&skip_disambig=1`,
                      { headers: { 'User-Agent': ddgHeaders['User-Agent'] } }
                    )
                    const apiData = await apiResp.json() as Record<string, unknown>
                    console.log(`[Search] DDG API response: abstract=${!!(apiData as any).Abstract}, relatedTopics=${((apiData as any).RelatedTopics || []).length}`)

                    // Extract from Related Topics
                    const topics = ((apiData as any).RelatedTopics || []) as Array<{ FirstURL?: string; Text?: string; Name?: string; Topics?: Array<{ FirstURL?: string; Text?: string }> }>
                    for (const topic of topics) {
                      if (urls.length >= numResults) break
                      if (topic.FirstURL && topic.Text) {
                        urls.push(topic.FirstURL)
                        titles.push(topic.Text.slice(0, 100))
                        snippets.push(topic.Text)
                      }
                      // Nested topics
                      if (topic.Topics) {
                        for (const sub of topic.Topics) {
                          if (urls.length >= numResults) break
                          if (sub.FirstURL && sub.Text) {
                            urls.push(sub.FirstURL)
                            titles.push(sub.Text.slice(0, 100))
                            snippets.push(sub.Text)
                          }
                        }
                      }
                    }
                    // Abstract as first result
                    if (urls.length === 0 && (apiData as any).AbstractURL && (apiData as any).Abstract) {
                      urls.push((apiData as any).AbstractURL)
                      titles.push((apiData as any).AbstractSource || 'Result')
                      snippets.push((apiData as any).Abstract)
                    }
                    console.log(`[Search] Strategy 3 results: ${urls.length} URLs found`)
                  } catch (apiErr) {
                    console.error('[Search] API fallback failed:', apiErr)
                  }
                }

                const relatedTopics = urls.map((url, i) => ({
                  text: snippets[i] || titles[i] || '',
                  url,
                  title: titles[i] || '',
                }))
                
                const results = {
                  query: input.query,
                  abstract: relatedTopics[0]?.text || null,
                  abstractSource: relatedTopics[0]?.title || null,
                  abstractURL: relatedTopics[0]?.url || null,
                  relatedTopics,
                  answer: null,
                  definition: null,
                }

                // Inject search results into thinking stream so CoT shows what was found
                if (relatedTopics.length > 0) {
                  const searchSummaryLines = relatedTopics.map(t => {
                    let domain = ''
                    try { domain = new URL(t.url).hostname.replace(/^www\./, '') } catch {}
                    return `${t.url} ${t.title || domain}`
                  })
                  const searchThinking = `Found ${relatedTopics.length} results for: ${input.query}\n${searchSummaryLines.join('\n')}`
                  thinkingContentForDb += (thinkingContentForDb ? '\n' : '') + searchThinking
                  enqueueProgressUpdate({
                    update_type: 'status',
                    message: searchThinking,
                  })
                } else {
                  const noResultsMsg = `No results found for: ${input.query}`
                  thinkingContentForDb += (thinkingContentForDb ? '\n' : '') + noResultsMsg
                  enqueueProgressUpdate({
                    update_type: 'status',
                    message: noResultsMsg,
                  })
                }

                // Emit activity_step_patch with structured sources
                const searchSources = relatedTopics.map(t => {
                  let domain = ''
                  try { domain = t.url ? new URL(t.url).hostname.replace(/^www\./, '') : '' } catch {}
                  return {
                    title: t.title || domain,
                    url: t.url,
                    snippet: t.text?.slice(0, 200),
                    source: domain,
                    favicon: undefined,
                  }
                })
                enqueueStepPatch(toolStepId, {
                  status: 'complete',
                  sources: searchSources,
                  data: { query: input.query, results_v2: searchSources },
                })

                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ 
                    type: 'tool_result',
                    tool: 'web_search',
                    result: 'success',
                    data: results
                  })}\n\n`)
                )
              } catch (searchError) {
                console.error('[Search] All strategies failed:', searchError)
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ 
                    type: 'tool_result',
                    tool: 'web_search',
                    result: 'error',
                    error: 'Search failed'
                  })}\n\n`)
                )
              }
            } else if (toolCall.name === 'create_visual_report') {
              // Create a visual report artifact
              const reportId = crypto.randomUUID()
              
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ 
                  type: 'artifact',
                  artifact_type: 'report',
                  id: reportId,
                  title: input.title,
                  report_type: input.type,
                  content: input.content,
                  data: input.data || null
                })}\n\n`)
              )
            } else if (toolCall.name === 'analyze_url') {
              // Fetch and analyze URL content
              try {
                const response = await fetch(input.url, {
                  headers: { 'User-Agent': '2Hands-Bot/1.0' }
                })
                const html = await response.text()
                
                // Basic HTML to text extraction
                const textContent = html
                  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim()
                  .slice(0, 5000)

                // Extract title
                const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
                const title = titleMatch ? titleMatch[1].trim() : null

                // Extract meta description
                const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
                const description = descMatch ? descMatch[1] : null

                // Inject URL analysis into thinking stream
                const contentPreview = textContent.slice(0, 200).replace(/\s+/g, ' ').trim()
                const analyzeMsg = `Fetching and analyzing: ${input.url}${title ? `\nPage title: ${title}` : ''}${description ? `\nDescription: ${description}` : ''}${contentPreview ? `\nContent preview: ${contentPreview}...` : '\nNo content extracted.'}`
                thinkingContentForDb += (thinkingContentForDb ? '\n' : '') + analyzeMsg
                enqueueProgressUpdate({
                  update_type: 'status',
                  message: analyzeMsg,
                })

                // Emit activity_step_patch with browse source
                let browseHost = ''
                try { browseHost = new URL(input.url).hostname.replace(/^www\./, '') } catch {}
                const browseSource = {
                  title: title || browseHost || input.url,
                  url: input.url,
                  snippet: description || contentPreview,
                  source: browseHost,
                  favicon: undefined,
                }
                enqueueStepPatch(toolStepId, {
                  status: 'complete',
                  sources: [browseSource],
                  data: { url: input.url, results_v2: [browseSource] },
                })

                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ 
                    type: 'tool_result',
                    tool: 'analyze_url',
                    result: 'success',
                    data: {
                      url: input.url,
                      title,
                      description,
                      content: input.extract_type === 'full_content' ? textContent : textContent.slice(0, 1000),
                      extract_type: input.extract_type || 'summary'
                    }
                  })}\n\n`)
                )
              } catch {
                const errorMsg = `Fetching and analyzing: ${input.url}\nFailed to fetch - site may block automated access.`
                thinkingContentForDb += (thinkingContentForDb ? '\n' : '') + errorMsg
                enqueueProgressUpdate({
                  update_type: 'status',
                  message: errorMsg,
                })
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ 
                    type: 'tool_result',
                    tool: 'analyze_url',
                    result: 'error',
                    error: 'Failed to fetch URL'
                  })}\n\n`)
                )
              }
            } else if (toolCall.name === 'calculate') {
              // Perform calculation
              try {
                // Safe math evaluation (basic operations only)
                const sanitized = input.expression.replace(/[^0-9+\-*/.()%\s]/g, '')
                const result = Function('"use strict"; return (' + sanitized + ')')()
                
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ 
                    type: 'tool_result',
                    tool: 'calculate',
                    result: 'success',
                    expression: input.expression,
                    answer: result,
                    context: input.context
                  })}\n\n`)
                )
              } catch {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ 
                    type: 'tool_result',
                    tool: 'calculate',
                    result: 'error',
                    error: 'Invalid calculation'
                  })}\n\n`)
                )
              }
            } else if (toolCall.name === 'set_reminder') {
              // Parse "when" to a real deliver_at ISO timestamp
              const parseReminderWhen = (when: string): string => {
                const d = new Date(when)
                if (!isNaN(d.getTime()) && d > new Date()) return d.toISOString()
                const now = new Date()
                const lower = when.toLowerCase().trim()
                const inMatch = lower.match(/^in\s+(\d+)\s+(minute|hour|day)s?$/i)
                if (inMatch) {
                  const n = parseInt(inMatch[1], 10)
                  const unit = inMatch[2].toLowerCase()
                  if (unit === 'minute') now.setMinutes(now.getMinutes() + n)
                  else if (unit === 'hour') now.setHours(now.getHours() + n)
                  else if (unit === 'day') now.setDate(now.getDate() + n)
                  return now.toISOString()
                }
                if (lower.includes('tomorrow')) { now.setDate(now.getDate() + 1); now.setHours(9, 0, 0, 0); return now.toISOString() }
                if (lower.includes('monday')) { const d2 = new Date(); d2.setDate(d2.getDate() + (1 + 7 - d2.getDay()) % 7 || 7); d2.setHours(9, 0, 0, 0); return d2.toISOString() }
                // Default: 1 hour from now
                now.setHours(now.getHours() + 1)
                return now.toISOString()
              }

              const reminderId = crypto.randomUUID()
              const deliverAt = parseReminderWhen(input.when || '1 hour')
              
              await supabase.from('messages').insert({
                conversation_id: conversationId,
                role: 'system',
                content: `Reminder: ${input.message}`,
                metadata: {
                  type: 'reminder',
                  reminder_id: reminderId,
                  message: input.message,
                  when: input.when,
                  deliver_at: deliverAt,
                  delivered: false,
                  priority: input.priority || 'medium',
                  created_at: new Date().toISOString()
                }
              } as never)

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ 
                  type: 'tool_result',
                  tool: 'set_reminder',
                  result: 'success',
                  reminder_id: reminderId,
                  message: input.message,
                  when: input.when,
                  deliver_at: deliverAt
                })}\n\n`)
              )
            } else if (toolCall.name === 'create_summary') {
              // Create summary artifact
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ 
                  type: 'artifact',
                  artifact_type: 'summary',
                  format: input.format,
                  content: input.content,
                  max_length: input.max_length
                })}\n\n`)
              )
            } else if (toolCall.name === 'propose_mission') {
              // Show a mission proposal card to the user — does NOT create anything yet
              const proposal = {
                goal: input.goal,
                why: input.why,
                first_steps: input.first_steps,
                autonomy_level: input.autonomy_level || 'full_auto',
                tick_timebox_minutes: input.tick_timebox_minutes || 30,
              }
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: 'mission_proposal',
                  proposal,
                })}

`)
              )
              // Persist proposal in conversation state so next 'yes' auto-starts the mission
              setPendingMissionProposal(user.id, proposal).catch(() => {})
              toolResult = JSON.stringify({ success: true, message: 'Mission proposal shown to user. Wait for their confirmation before calling start_mission.' })

            } else if (toolCall.name === 'start_mission') {
              // Create the mission in DB after user confirmed
              try {
                const newMission = await createMission({
                  workspace_id: scope.workspaceId!,
                  user_id: user.id,
                  goal: input.goal,
                  autonomy_level: input.autonomy_level || 'full_auto',
                  tick_timebox_minutes: input.tick_timebox_minutes || 30,
                  min_tick_interval_minutes: 15,
                  max_ticks_per_day: 24,
                  conversation_id: conversationId || undefined,
                  constraints: {
                    ...(input.company_context ? { company_context: input.company_context } : {}),
                    ...(input.self_improvement ? { self_improvement: true } : {}),
                    ...(input.repo_config ? { repo_config: input.repo_config } : {}),
                  } as never,
                })

                if (newMission) {
                  // Kick the mission runner immediately so first tick happens in seconds
                  const missionCronSecret = (process.env.CRON_SECRET || '').trim()
                  if (missionCronSecret) {
                    fetch(`${internalApiBaseUrl}/api/missions/runner`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${missionCronSecret}` },
                    }).catch(() => {})
                  }
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({
                      type: 'mission_started',
                      mission: { id: newMission.id, goal: newMission.goal, status: newMission.status, next_tick_at: newMission.next_tick_at },
                    })}

`)
                  )
                  // Clear pending confirmation now that mission is created
                  clearPendingConfirmation(user.id).catch(() => {})
                  toolResult = JSON.stringify({ success: true, mission_id: newMission.id, goal: newMission.goal, next_tick_at: newMission.next_tick_at })
                } else {
                  toolResult = JSON.stringify({ success: false, error: 'Failed to create mission' })
                }
              } catch (missionErr) {
                toolResult = JSON.stringify({ success: false, error: String(missionErr) })
              }

            } else if (toolCall.name === 'mission_status') {
              try {
                let missions
                if (input.mission_id) {
                  const m = await getMission(input.mission_id)
                  missions = m ? [m] : []
                } else {
                  missions = scope.workspaceId ? await getUserMissions(user.id, scope.workspaceId) : []
                }
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({
                    type: 'mission_status',
                    missions: missions.map(m => ({
                      id: m.id,
                      goal: m.goal,
                      status: m.status,
                      autonomy_level: m.autonomy_level,
                      last_tick_at: m.last_tick_at,
                      next_tick_at: m.next_tick_at,
                      handoff_note: m.handoff_note,
                    })),
                  })}

`)
                )
                // Fetch recent events for all missions to enrich the tool result
                const { createAdminClient: _adminForEvents } = await import('@/lib/supabase/admin')
                const _adminEvt = _adminForEvents()
                const missionIds = missions.map(m => m.id)
                const recentEventsMap: Record<string, Array<{ kind: string; summary: string | null; payload: Record<string, unknown>; created_at: string }>> = {}
                if (missionIds.length > 0) {
                  const { data: evtsRaw } = await _adminEvt
                    .from('mission_events')
                    .select('mission_id, kind, summary, payload, created_at')
                    .in('mission_id', missionIds)
                    .order('created_at', { ascending: false })
                    .limit(100)
                  for (const ev of (evtsRaw ?? []) as Array<{ mission_id: string; kind: string; summary: string | null; payload: Record<string, unknown>; created_at: string }>) {
                    if (!recentEventsMap[ev.mission_id]) recentEventsMap[ev.mission_id] = []
                    recentEventsMap[ev.mission_id].push(ev)
                  }
                }
                toolResult = JSON.stringify({ missions: missions.map(m => {
                  const tree = m.goal_tree as {
                    projects?: Array<{ id?: string; name?: string; status?: string; description?: string; tasks?: Array<{ status?: string; description?: string }> }>
                    current_project_id?: string
                  } | null
                  const totalTasks = tree?.projects?.reduce((s, p) => s + (p.tasks?.length ?? 0), 0) ?? 0
                  const doneTasks = tree?.projects?.reduce((s, p) => s + (p.tasks?.filter(t => t.status === 'completed').length ?? 0), 0) ?? 0
                  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : null
                  const currentProject = tree?.projects?.find(p => p.id === tree?.current_project_id)
                  const completedProjects = tree?.projects?.filter(p => p.status === 'completed').length ?? 0
                  const totalProjects = tree?.projects?.length ?? 0
                  const nextPendingTask = currentProject?.tasks?.find(t => t.status === 'pending' || t.status === 'in_progress')
                  // Extract next task from handoff note
                  const nextTaskFromHandoff = m.handoff_note?.match(/\*\*Next task:\*\*\s*(.+)/i)?.[1]?.trim()
                  const intelligenceGathered = m.handoff_note?.match(/\*\*Intelligence gathered:\*\*\s*(.+)/i)?.[1]?.trim()
                  // Recent events context
                  const mEvts = recentEventsMap[m.id] ?? []
                  const tickCount = mEvts.filter(e => e.kind === 'tick_completed').length
                  const agentCount = mEvts.filter(e => e.kind === 'agent_delegated').length
                  const recentFindings = mEvts
                    .filter(e => e.kind === 'agent_completed')
                    .slice(0, 3)
                    .map(e => ({
                      agent: String((e.payload as Record<string, unknown>)?.agent_name ?? 'Agent'),
                      summary: String((e.payload as Record<string, unknown>)?.agent_summary ?? e.summary ?? '').slice(0, 300),
                      date: e.created_at,
                    }))
                  const minutesUntilNext = m.next_tick_at
                    ? Math.round((new Date(m.next_tick_at).getTime() - Date.now()) / 60000)
                    : null
                  return {
                    id: m.id,
                    goal: m.goal,
                    status: m.status,
                    autonomy_level: m.autonomy_level,
                    progress_pct: progressPct,
                    projects_done: completedProjects,
                    projects_total: totalProjects,
                    current_project: currentProject ? { name: currentProject.name, description: currentProject.description } : null,
                    next_task: nextTaskFromHandoff ?? nextPendingTask?.description ?? null,
                    intelligence_gathered: intelligenceGathered ?? null,
                    ticks_run: tickCount,
                    agents_spawned: agentCount,
                    recent_findings: recentFindings,
                    last_tick_at: m.last_tick_at,
                    next_tick_in_minutes: minutesUntilNext,
                  }
                }),
                _note: 'If next_tick_in_minutes is negative for an active mission, call mission_status with include_diagnostics to get the blocker reason.',
              })
              // Augment with per-mission diagnostics for overdue active missions
              const overdueMissions = missions.filter(m => m.status === 'active' && m.next_tick_at && new Date(m.next_tick_at) < new Date())
              if (overdueMissions.length > 0) {
                const diagAdmin = createAdminClient()
                const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0)
                const diagnostics: Record<string, { blocker: string; detail: string }> = {}
                for (const m of overdueMissions.slice(0, 5)) {
                  // Check credits
                  const { data: ws } = await diagAdmin.from('workspaces').select('credits_balance').eq('id', m.workspace_id).single()
                  const credits = (ws as { credits_balance?: number } | null)?.credits_balance ?? -1
                  if (credits === 0) {
                    diagnostics[m.id] = { blocker: 'no_credits', detail: 'Workspace has 0 credits — mission ticks are blocked. Top up credits in Settings → Billing.' }
                    continue
                  }
                  // Check daily quota
                  const { count: ticksToday } = await diagAdmin.from('mission_events').select('*', { count: 'exact', head: true }).eq('mission_id', m.id).eq('kind', 'tick_completed').gte('created_at', startOfDay.toISOString())
                  if ((ticksToday ?? 0) >= m.max_ticks_per_day) {
                    diagnostics[m.id] = { blocker: 'daily_quota', detail: `Daily tick quota reached (${ticksToday}/${m.max_ticks_per_day}). Ticks will resume after midnight UTC.` }
                    continue
                  }
                  // Check lock contention
                  const { count: locks } = await diagAdmin.from('mission_tick_locks').select('*', { count: 'exact', head: true }).eq('mission_id', m.id).gt('expires_at', new Date().toISOString())
                  if ((locks ?? 0) > 0) {
                    diagnostics[m.id] = { blocker: 'lock_contention', detail: 'A tick is currently in progress (locked). This clears automatically when the tick finishes or the lock expires.' }
                    continue
                  }
                  // Cron runner fires every 15 min — mission may just be waiting
                  const minutesOverdue = m.next_tick_at ? Math.round((Date.now() - new Date(m.next_tick_at).getTime()) / 60000) : 0
                  diagnostics[m.id] = { blocker: minutesOverdue > 60 ? 'runner_not_firing' : 'waiting_for_cron', detail: minutesOverdue > 60 ? `Mission is ${minutesOverdue}m overdue with no clear blocker — the background runner (cron) may not be firing. Check Vercel logs for /api/missions/runner.` : `Mission is ${minutesOverdue}m overdue — the cron runner fires every 15 min and should pick this up shortly.` }
                }
                toolResult = JSON.stringify({ missions: JSON.parse(toolResult ?? '{"missions":[]}').missions, overdue_diagnostics: diagnostics })
              }
              } catch (missionErr) {
                toolResult = JSON.stringify({ error: String(missionErr) })
              }

            } else if (toolCall.name === 'pause_mission') {
              const ok = await updateMissionStatus(input.mission_id, 'paused')
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'mission_paused', mission_id: input.mission_id, success: ok })}

`)
              )
              toolResult = JSON.stringify({ success: ok })

            } else if (toolCall.name === 'resume_mission') {
              const ok = await updateMissionStatus(input.mission_id, 'active')
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'mission_resumed', mission_id: input.mission_id, success: ok })}

`)
              )
              toolResult = JSON.stringify({ success: ok })

            } else if (toolCall.name === 'update_mission') {
              try {
                const mission = await getMission(input.mission_id)
                if (!mission || mission.user_id !== user.id) {
                  toolResult = JSON.stringify({ success: false, error: 'Mission not found or access denied' })
                } else {
                  const updates: Parameters<typeof updateMission>[1] = {}
                  if (input.autonomy_level) updates.autonomy_level = input.autonomy_level as never
                  if (input.goal) updates.goal = input.goal as string
                  if (input.repo_config) {
                    updates.constraints = {
                      ...(mission.constraints as Record<string, unknown> ?? {}),
                      self_improvement: true,
                      repo_config: input.repo_config,
                    } as never
                  }
                  const ok = await updateMission(input.mission_id, updates)
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: 'mission_updated', mission_id: input.mission_id, success: ok })}\n\n`)
                  )
                  toolResult = JSON.stringify({ success: ok, message: ok ? 'Mission updated successfully.' : 'Failed to update mission.' })
                }
              } catch (err) {
                toolResult = JSON.stringify({ success: false, error: String(err) })
              }

            } else if (toolCall.name === 'delete_mission') {
              try {
                const mission = await getMission(input.mission_id)
                if (!mission || mission.user_id !== user.id) {
                  toolResult = JSON.stringify({ success: false, error: 'Mission not found or access denied' })
                } else {
                  const supabaseAdmin = createAdminClient()
                  await supabaseAdmin.from('mission_events').delete().eq('mission_id', input.mission_id)
                  await supabaseAdmin.from('missions').delete().eq('id', input.mission_id)
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: 'mission_deleted', mission_id: input.mission_id, success: true })}\n\n`)
                  )
                  toolResult = JSON.stringify({ success: true, message: `Mission deleted: "${mission.goal}"` })
                }
              } catch (err) {
                toolResult = JSON.stringify({ success: false, error: String(err) })
              }

            } else if (toolCall.name === 'register_custom_provider') {
              try {
                const providerId = typeof input.id === 'string' ? input.id.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-') : ''
                const providerName = typeof input.name === 'string' ? input.name.trim() : ''
                const baseUrl = typeof input.base_url === 'string' ? input.base_url.trim().replace(/\/+$/, '') : ''
                const authMode = typeof input.auth_mode === 'string' ? input.auth_mode : 'api_key'

                if (!providerId || !providerName || !baseUrl) {
                  toolResult = JSON.stringify({ success: false, error: 'id, name, and base_url are required.' })
                } else {
                  const manifest = {
                    id: providerId,
                    name: providerName,
                    baseUrl,
                    authMode,
                    apiKeyAuth: authMode !== 'oauth' ? {
                      headerName: typeof input.auth_header_name === 'string' ? input.auth_header_name : 'Authorization',
                      headerPrefix: typeof input.auth_header_prefix === 'string' ? input.auth_header_prefix : (authMode === 'bearer_token' ? 'Bearer ' : undefined),
                    } : undefined,
                    credentialKeyField: 'api_key',
                    verifyEndpoint: typeof input.verify_path === 'string' && input.verify_path
                      ? { path: input.verify_path, method: 'GET' as const }
                      : undefined,
                    openApiSpecUrl: typeof input.openapi_spec_url === 'string' ? input.openapi_spec_url : undefined,
                    fields: [{
                      key: 'api_key',
                      label: typeof input.credential_field_label === 'string' ? input.credential_field_label : 'API Key',
                      type: 'password' as const,
                      placeholder: `Your ${providerName} API key`,
                    }],
                    oauth: authMode === 'oauth' ? {
                      authorizationUrl: typeof input.oauth_auth_url === 'string' ? input.oauth_auth_url : '',
                      tokenUrl: typeof input.oauth_token_url === 'string' ? input.oauth_token_url : '',
                      scopes: typeof input.oauth_scopes === 'string' ? input.oauth_scopes.split(/[,\s]+/).filter(Boolean) : [],
                      clientIdEnvVar: `CUSTOM_${providerId.toUpperCase().replace(/-/g, '_')}_CLIENT_ID`,
                      clientSecretEnvVar: `CUSTOM_${providerId.toUpperCase().replace(/-/g, '_')}_CLIENT_SECRET`,
                    } : undefined,
                  }

                  // Store the manifest as a pending connection row so it persists and can be looked up later
                  const { createAdminClient: mkAdmin } = await import('@/lib/supabase/admin')
                  const adminDb = mkAdmin()
                  await adminDb.from('integration_connections').upsert({
                    user_id: user.id,
                    workspace_id: scope.workspaceId,
                    provider: providerId,
                    status: 'pending',
                    config: { _custom_manifest: JSON.stringify(manifest) },
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  } as never, { onConflict: 'user_id,provider,workspace_id', ignoreDuplicates: false })

                  toolResult = JSON.stringify({
                    success: true,
                    provider_id: providerId,
                    message: `Custom provider "${providerName}" registered. Now call setup_integration with connector_id "${providerId}" to show the credential input card.`,
                  })
                }
              } catch (err) {
                toolResult = JSON.stringify({ success: false, error: `register_custom_provider failed: ${String(err)}` })
              }

            } else if (toolCall.name === 'setup_integration') {
              // Show inline integration setup card
              const { getConnectorConfig } = await import('@/lib/integrations/connector-fields')
              const connector = getConnectorConfig(input.connector_id)
              
              if (connector && connector.fields.length > 0) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({
                    type: 'integration_setup',
                    connector_id: connector.id,
                    connector_name: connector.name,
                    fields: connector.fields,
                    logo_url: connector.logoUrl || null,
                  })}\n\n`)
                )
                
                pendingSetupCardForDb = {
                  connector_id: connector.id,
                  connector_name: connector.name,
                  fields: connector.fields,
                  logo_url: connector.logoUrl || null,
                }
                toolResult = JSON.stringify({
                  success: true,
                  connector_id: connector.id,
                  message: `Setup card shown for ${connector.name}. The user can now fill in their credentials.`
                })
              } else if (connector && connector.fields.length === 0) {
                toolResult = JSON.stringify({
                  success: false,
                  error: `${connector.name} uses OAuth and doesn't require manual credentials. The user can connect it from Settings → Connectors.`
                })
              } else {
                // Check if this is a registered custom provider
                const { createAdminClient: mkAdmin } = await import('@/lib/supabase/admin')
                const adminDb = mkAdmin()
                const { resolveCustomManifest } = await import('@/lib/integrations/credential-helpers')
                const { data: customConn } = await adminDb
                  .from('integration_connections')
                  .select('config')
                  .eq('user_id', user.id)
                  .eq('provider', String(input.connector_id || ''))
                  .limit(1)
                  .maybeSingle()
                const manifest = customConn
                  ? resolveCustomManifest((customConn as { config: Record<string, unknown> }).config || {})
                  : null

                if (manifest) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({
                      type: 'integration_setup',
                      connector_id: manifest.id,
                      connector_name: manifest.name,
                      fields: manifest.fields,
                      logo_url: null,
                    })}\n\n`)
                  )
                  pendingSetupCardForDb = {
                    connector_id: manifest.id,
                    connector_name: manifest.name,
                    fields: manifest.fields,
                    logo_url: null,
                  }
                  toolResult = JSON.stringify({
                    success: true,
                    connector_id: manifest.id,
                    message: `Setup card shown for ${manifest.name}. The user can now fill in their credentials.`
                  })
                } else {
                  toolResult = JSON.stringify({
                    success: false,
                    error: `Unknown connector: ${input.connector_id}. If this is a custom service, call register_custom_provider first.`
                  })
                }
              }
            } else if (toolCall.name === 'verify_integration') {
              try {
                const connectorId = typeof input.connector_id === 'string' ? input.connector_id.trim() : ''
                if (!connectorId) {
                  toolResult = JSON.stringify({ success: false, error: 'connector_id is required' })
                } else {
                  const result = await verifyProviderConnection(createAdminClient(), user.id, connectorId, undefined, scope.workspaceId)
                  toolResult = JSON.stringify(result)
                }
              } catch (err) {
                toolResult = JSON.stringify({ success: false, error: `Verification failed: ${String(err)}` })
              }

            } else if (toolCall.name.startsWith('integration_') && chatIntegrationToolMap.has(toolCall.name)) {
              // Route to typed provider tool — schema-validated, credential-managed, verified execution.
              // This is the primary path for all providers with typed or OpenAPI-generated tools.
              try {
                const intResult = await executeAgentIntegrationTool(
                  toolCall.name,
                  input,
                  chatIntegrationToolMap,
                  user.id
                )
                const resultPayload: Record<string, unknown> = {
                  success: intResult.success,
                }
                if (intResult.success) {
                  try { resultPayload.data = JSON.parse(intResult.data) } catch { resultPayload.data = intResult.data }
                } else {
                  resultPayload.error = intResult.data
                  resultPayload._learning_hint = 'This integration call failed. Follow the PROACTIVE INTEGRATION PROTOCOL: (1) Read the error carefully, (2) Check PRIOR INTEGRATION LEARNINGS for this pattern, (3) Try up to 2 evidence-based alternatives, (4) If you find the fix, store it via manage_memory_box so future sessions can reuse it.'
                }
                // Always include verification metadata so the model can report accurately
                resultPayload._meta = {
                  operation_kind: intResult.operation_kind,
                  verified_write: intResult.verified_write,
                  ...(intResult.operation_kind === 'write' && !intResult.verified_write && intResult.success
                    ? { verification_hint: 'Write executed but could not confirm external record was persisted. Check data for record_id or call a search/get tool to verify.' }
                    : {}),
                }
                toolResult = JSON.stringify(resultPayload)
              } catch (err) {
                toolResult = JSON.stringify({ success: false, error: `Integration tool execution failed: ${String(err)}`, _learning_hint: 'This integration call failed. Follow the PROACTIVE INTEGRATION PROTOCOL: check prior learnings, try evidence-based alternatives, and store the lesson if you find the fix.' })
              }

            } else if (toolCall.name === 'integration_call') {
              try {
                const providerId = typeof input.provider === 'string' ? input.provider.trim() : ''
                const method = (typeof input.method === 'string' ? input.method.toUpperCase() : 'GET')
                const path = typeof input.path === 'string' ? input.path.replace(/^\/+/, '') : ''
                const body = input.body && typeof input.body === 'object' ? input.body : undefined
                const queryParams = input.query && typeof input.query === 'object'
                  ? input.query as Record<string, string>
                  : {}

                if (!providerId) {
                  toolResult = JSON.stringify({ success: false, error: 'provider is required' })
                } else if (!path) {
                  toolResult = JSON.stringify({ success: false, error: 'path is required' })
                } else {
                  const pack = getProviderPack(providerId)

                  // For custom providers: load manifest from integration_connections config
                  let effectivePack = pack
                  if (!effectivePack) {
                    const { resolveCustomManifest: rcm } = await import('@/lib/integrations/credential-helpers')
                    const adminDb = createAdminClient()
                    let customConnLookup = adminDb
                      .from('integration_connections')
                      .select('config')
                      .eq('user_id', user.id)
                      .eq('provider', providerId)
                      .limit(1)
                    if (scope.workspaceId) customConnLookup = customConnLookup.eq('workspace_id', scope.workspaceId)
                    const { data: customConn } = await customConnLookup.maybeSingle()
                    const manifest = customConn
                      ? rcm((customConn as { config: Record<string, unknown> }).config || {})
                      : null
                    if (manifest) {
                      effectivePack = {
                        id: manifest.id,
                        name: manifest.name,
                        description: '',
                        baseUrl: manifest.baseUrl,
                        apiKeyAuth: manifest.apiKeyAuth,
                        credentialKeyField: manifest.credentialKeyField,
                      }
                    }
                  }

                  if (!effectivePack) {
                    toolResult = JSON.stringify({ success: false, error: `Unknown provider: ${providerId}. Register it first with register_custom_provider.` })
                  } else {
                    const apiKey = await getStoredApiKey(createAdminClient(), user.id, providerId, scope.workspaceId)
                    if (!apiKey) {
                      toolResult = JSON.stringify({ success: false, error: `No ${effectivePack.name} API key found. Connect it first via setup_integration.` })
                    } else {
                      const authValue = effectivePack.apiKeyAuth?.headerPrefix
                        ? `${effectivePack.apiKeyAuth.headerPrefix}${apiKey}`
                        : apiKey
                      const headerName = effectivePack.apiKeyAuth?.headerName || 'Authorization'

                      let fullUrl = `${effectivePack.baseUrl}/${path}`
                      const qKeys = Object.keys(queryParams)
                      if (qKeys.length > 0) {
                        const qs = new URLSearchParams(
                          Object.fromEntries(qKeys.map(k => [k, String(queryParams[k])]))
                        ).toString()
                        fullUrl = `${fullUrl}?${qs}`
                      }

                      const resp = await fetch(fullUrl, {
                        method,
                        headers: {
                          [headerName]: authValue,
                          'Content-Type': 'application/json',
                          ...(providerId === 'github' ? { 'User-Agent': '2Hands-AI', 'Accept': 'application/vnd.github+json' } : {}),
                        },
                        ...(body && method !== 'GET' && method !== 'DELETE' ? { body: JSON.stringify(body) } : {}),
                      })
                      const data = await resp.json().catch(() => null)
                      if (resp.ok) {
                        toolResult = JSON.stringify({ success: true, status: resp.status, data })
                      } else {
                        let errMsg: string = `HTTP ${resp.status}`
                        if (data && typeof data === 'object') {
                          const b = data as Record<string, unknown>
                          const msg = b.message || b.error || b.detail
                          if (typeof msg === 'string' && msg.length > 0) {
                            errMsg = `HTTP ${resp.status}: ${msg}`
                          } else if (Array.isArray(b.errors) && b.errors.length > 0) {
                            const first = (b.errors[0] as Record<string, unknown>)
                            const detail = first.message || first.detail || first.code
                            if (typeof detail === 'string') errMsg = `HTTP ${resp.status}: ${detail}`
                          }
                        }
                        toolResult = JSON.stringify({ success: false, status: resp.status, error: errMsg, raw: data, _learning_hint: 'This integration_call failed. Follow the PROACTIVE INTEGRATION PROTOCOL: check prior learnings, try evidence-based alternatives, and store the lesson if you find the fix.' })
                      }
                    }
                  }
                }
              } catch (err) {
                toolResult = JSON.stringify({ success: false, error: `integration_call failed: ${String(err)}`, _learning_hint: 'This integration_call failed. Follow the PROACTIVE INTEGRATION PROTOCOL: check prior learnings, try evidence-based alternatives, and store the lesson if you find the fix.' })
              }
            }

            // ── Skills Engine ──────────────────────────────────────────────
            if (toolCall.name === 'run_skill') {
              try {
                const { prepareSkillExecution, finalizeSkillRun } = await import('@/lib/skills/skill-executor')
                const startTime = Date.now()

                const preparation = await prepareSkillExecution({
                  skillName: input.skill_name as string,
                  arguments: input.arguments as string,
                  context: input.context as string | undefined,
                  userId: user.id,
                  workspaceId: scope.workspaceId!,
                  conversationId: conversationId || undefined,
                  triggerType: 'model',
                })

                if (!preparation.success || !preparation.executionPrompt) {
                  toolResult = JSON.stringify({ success: false, error: preparation.error || 'Failed to prepare skill' })
                } else {
                  // Emit subtle activity indicator to UI — user sees natural status, not technical skill info
                  const activityLabels: Record<string, string> = {
                    'deep-research': 'Researching this thoroughly…',
                    'competitor-analysis': 'Analyzing competitors…',
                    'content-strategy': 'Planning content strategy…',
                    'code-review': 'Reviewing the code…',
                    'debug-systematic': 'Investigating the issue…',
                    'api-design': 'Designing the API…',
                    'user-stories': 'Breaking this into stories…',
                    'doc-writer': 'Writing documentation…',
                    'test-generator': 'Generating test cases…',
                    'meeting-prep': 'Preparing for the meeting…',
                    'skill-creator': 'Creating a new workflow…',
                    'seo-audit': 'Auditing SEO…',
                    'email-copywriting': 'Crafting the email…',
                    'social-media-post': 'Writing the post…',
                    'outbound-sequence': 'Designing the outreach sequence…',
                    'data-analysis': 'Analyzing the data…',
                    'financial-model': 'Building the financial model…',
                    'incident-response': 'Running incident triage…',
                    'onboarding-flow': 'Designing the onboarding flow…',
                    'pitch-deck': 'Structuring the deck…',
                    'growth-experiment': 'Designing the experiment…',
                    'weekly-standup': 'Compiling the update…',
                    'brand-voice': 'Defining brand voice…',
                    'pricing-strategy': 'Analyzing pricing…',
                    'customer-interview': 'Preparing research…',
                    'process-automation': 'Mapping the process…',
                  }
                  const label = activityLabels[input.skill_name as string] || 'Working on this…'
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({
                      type: 'activity_status',
                      status: label,
                      skill_id: preparation.skillId,
                    })}\n\n`)
                  )

                  // The skill execution prompt becomes the tool result — 
                  // Claude will follow the skill instructions in its next response.
                  // IMPORTANT: The skill run stays in 'running' status. It is NOT marked
                  // completed here because the AI has not actually executed anything yet —
                  // it only received instructions. The run will be finalized later.
                  // Store allowed tools for this skill — enforced in the continuation call below.
                  activeSkillAllowedTools = preparation.allowedTools

                  toolResult = JSON.stringify({
                    success: true,
                    skill_name: input.skill_name,
                    run_id: preparation.runId,
                    execution_instructions: preparation.executionPrompt,
                    allowed_tools: preparation.allowedTools,
                    _honesty_note: 'IMPORTANT: You have LOADED the skill instructions but have NOT executed them yet. Do NOT tell the user you have completed the task. You must now follow the execution_instructions step by step, use the required tools, and only report results you actually obtained. If a step fails, say so honestly.',
                  })
                }
              } catch (err) {
                toolResult = JSON.stringify({ success: false, error: String(err) })
              }
            }

            // ── Workspace Tools: Memory Boxes, Board, Recurring Tasks ──────
            if (toolCall.name === 'manage_memory_box') {
              try {
                const { listBoxesAdmin, createBoxAdmin, addMemoryToBoxAdmin, searchMemoriesAdmin } = await import('@/lib/memory/memory-boxes')
                const action = input.action as string

                if (action === 'list_boxes') {
                  const boxes = await listBoxesAdmin(user.id, scope.workspaceId!)
                  toolResult = JSON.stringify({ success: true, boxes: boxes.map(b => ({ id: b.id, name: b.name, category: b.category, description: b.description, memory_count: b.memory_count })) })
                } else if (action === 'create_box') {
                  const box = await createBoxAdmin(user.id, scope.workspaceId!, {
                    name: input.name as string,
                    description: input.description as string | undefined,
                    category: (input.category as any) ?? 'knowledge',
                    icon: input.icon as string | undefined,
                  })
                  if (box) {
                    toolResult = JSON.stringify({ success: true, box: { id: box.id, name: box.name, category: box.category } })
                  } else {
                    toolResult = JSON.stringify({ success: false, error: 'Failed to create memory box' })
                  }
                } else if (action === 'add_memory') {
                  if (!input.box_id || !input.content) {
                    // If no box_id, list boxes so AI can pick one or create one
                    const boxes = await listBoxesAdmin(user.id, scope.workspaceId!)
                    toolResult = JSON.stringify({ success: false, error: 'box_id and content are required. Available boxes:', boxes: boxes.map(b => ({ id: b.id, name: b.name, category: b.category })) })
                  } else {
                    const memId = await addMemoryToBoxAdmin(user.id, scope.workspaceId!, input.box_id as string, input.content as string, (input.memory_type as string) ?? 'context', (input.importance as string) ?? 'medium')
                    if (memId) {
                      toolResult = JSON.stringify({ success: true, memory_id: memId })
                    } else {
                      toolResult = JSON.stringify({ success: false, error: 'Failed to save memory — the database rejected the insert. Do NOT tell the user the memory was saved.' })
                    }
                  }
                } else if (action === 'search') {
                  const results = await searchMemoriesAdmin(user.id, scope.workspaceId!, input.query as string || '', { boxId: input.box_id as string | undefined, limit: 20 })
                  toolResult = JSON.stringify({ success: true, results: results.map(m => ({ id: m.id, content: m.content, type: m.memory_type, importance: m.importance })) })
                } else {
                  toolResult = JSON.stringify({ success: false, error: `Unknown action: ${action}` })
                }
              } catch (err) {
                toolResult = JSON.stringify({ success: false, error: String(err) })
              }

            } else if (toolCall.name === 'manage_board') {
              try {
                const supabaseAdmin = createAdminClient()
                const action = input.action as string

                if (action === 'get_board') {
                  let query = supabaseAdmin
                    .from('mission_cards')
                    .select('id, title, description, status, position, agent_id, mission_id, created_at')
                    .eq('workspace_id', scope.workspaceId!)
                    .order('status')
                    .order('position')
                  if (input.column_filter) {
                    query = query.eq('status', input.column_filter as string)
                  }
                  const { data: cards } = await query
                  const cardList = (cards ?? []) as Array<{ id: string; title: string; description: string | null; status: string; position: number; agent_id: string | null; mission_id: string | null; created_at: string }>
                  // Group by column for readability
                  const grouped: Record<string, typeof cardList> = {}
                  for (const c of cardList) {
                    if (!grouped[c.status]) grouped[c.status] = []
                    grouped[c.status].push(c)
                  }
                  toolResult = JSON.stringify({ success: true, total: cardList.length, columns: grouped })
                } else if (action === 'create_card') {
                  if (!input.title) {
                    toolResult = JSON.stringify({ success: false, error: 'title is required' })
                  } else {
                    const col = (input.column as string) ?? 'inbox'
                    const { data: existing } = await supabaseAdmin
                      .from('mission_cards')
                      .select('position')
                      .eq('workspace_id', scope.workspaceId!)
                      .eq('status', col)
                      .order('position', { ascending: false })
                      .limit(1) as { data: { position: number }[] | null }
                    const nextPos = existing && existing.length > 0 ? existing[0].position + 1000 : 0
                    const { data: card, error: cardErr } = await supabaseAdmin
                      .from('mission_cards')
                      .insert({
                        workspace_id: scope.workspaceId!,
                        title: (input.title as string).trim(),
                        description: (input.description as string)?.trim() ?? null,
                        status: col,
                        position: nextPos,
                        created_by: user.id,
                      } as never)
                      .select('id, title, status')
                      .single()
                    if (cardErr) {
                      toolResult = JSON.stringify({ success: false, error: cardErr.message })
                    } else {
                      toolResult = JSON.stringify({ success: true, card })
                    }
                  }
                } else if (action === 'move_card') {
                  if (!input.card_id || !input.column) {
                    toolResult = JSON.stringify({ success: false, error: 'card_id and column are required' })
                  } else {
                    const { data: movedCards, error: moveErr } = await supabaseAdmin
                      .from('mission_cards')
                      .update({ status: input.column as string, updated_at: new Date().toISOString() } as never)
                      .eq('id', input.card_id as string)
                      .eq('workspace_id', scope.workspaceId!)
                      .select('id')
                    if (moveErr) {
                      toolResult = JSON.stringify({ success: false, error: moveErr.message })
                    } else if (!movedCards || movedCards.length === 0) {
                      toolResult = JSON.stringify({ success: false, error: 'Card not found — it may have been deleted or the ID is wrong. Do NOT tell the user the card was moved.' })
                    } else {
                      toolResult = JSON.stringify({ success: true, moved: true, card_id: input.card_id, new_column: input.column })
                    }
                  }
                } else if (action === 'delete_card') {
                  if (!input.card_id) {
                    toolResult = JSON.stringify({ success: false, error: 'card_id is required' })
                  } else {
                    const { data: deletedCards, error: delErr } = await supabaseAdmin
                      .from('mission_cards')
                      .delete()
                      .eq('id', input.card_id as string)
                      .eq('workspace_id', scope.workspaceId!)
                      .select('id')
                    if (delErr) {
                      toolResult = JSON.stringify({ success: false, error: delErr.message })
                    } else if (!deletedCards || deletedCards.length === 0) {
                      toolResult = JSON.stringify({ success: false, error: 'Card not found — it may already be deleted or the ID is wrong. Do NOT tell the user the card was deleted.' })
                    } else {
                      toolResult = JSON.stringify({ success: true, deleted: true })
                    }
                  }
                } else {
                  toolResult = JSON.stringify({ success: false, error: `Unknown action: ${action}` })
                }
              } catch (err) {
                toolResult = JSON.stringify({ success: false, error: String(err) })
              }

            } else if (toolCall.name === 'manage_recurring_task') {
              try {
                const { listRecurringTasksAdmin, createRecurringTaskAdmin } = await import('@/lib/scheduler/recurring-tasks')
                const action = input.action as string

                if (action === 'list') {
                  const tasks = await listRecurringTasksAdmin(user.id, scope.workspaceId!, (input.status_filter as any) ?? undefined)
                  toolResult = JSON.stringify({ success: true, tasks: tasks.map(t => ({ id: t.id, title: t.title, description: t.description, schedule_cron: t.schedule_cron, status: t.status, task_type: t.task_type, next_run_at: t.next_run_at, last_run_at: t.last_run_at, run_count: t.run_count, last_output: t.last_output?.slice(0, 200) })) })
                } else if (action === 'create') {
                  if (!input.title || !input.schedule) {
                    toolResult = JSON.stringify({ success: false, error: 'title and schedule are required' })
                  } else {
                    const task = await createRecurringTaskAdmin(user.id, scope.workspaceId!, {
                      title: input.title as string,
                      description: input.description as string | undefined,
                      schedule_cron: input.schedule as string,
                      schedule_timezone: (input.timezone as string) ?? 'UTC',
                      task_type: (input.task_type as any) ?? 'action',
                      output_destination: (input.output_destination as any) ?? 'board',
                    })
                    if (task) {
                      toolResult = JSON.stringify({ success: true, task: { id: task.id, title: task.title, schedule_cron: task.schedule_cron, next_run_at: task.next_run_at, status: task.status } })
                    } else {
                      toolResult = JSON.stringify({ success: false, error: 'Failed to create recurring task' })
                    }
                  }
                } else if (action === 'update' || action === 'pause' || action === 'resume') {
                  if (!input.task_id) {
                    toolResult = JSON.stringify({ success: false, error: 'task_id is required' })
                  } else {
                    const supabaseAdmin = createAdminClient()
                    const updates: Record<string, unknown> = {}
                    if (action === 'pause') updates.status = 'paused'
                    if (action === 'resume') updates.status = 'active'
                    if (input.title) updates.title = input.title
                    if (input.schedule) updates.schedule_cron = input.schedule
                    updates.updated_at = new Date().toISOString()
                    const { data: updatedRows, error: upErr } = await supabaseAdmin
                      .from('recurring_tasks')
                      .update(updates as never)
                      .eq('id', input.task_id as string)
                      .eq('user_id', user.id)
                      .select('id')
                    if (upErr) {
                      toolResult = JSON.stringify({ success: false, error: upErr.message })
                    } else if (!updatedRows || updatedRows.length === 0) {
                      toolResult = JSON.stringify({ success: false, error: 'Task not found — the ID may be wrong. Do NOT tell the user the task was updated.' })
                    } else {
                      toolResult = JSON.stringify({ success: true, action })
                    }
                  }
                } else if (action === 'delete') {
                  if (!input.task_id) {
                    toolResult = JSON.stringify({ success: false, error: 'task_id is required' })
                  } else {
                    const supabaseAdmin = createAdminClient()
                    const { data: deletedRows, error: delErr } = await supabaseAdmin
                      .from('recurring_tasks')
                      .delete()
                      .eq('id', input.task_id as string)
                      .eq('user_id', user.id)
                      .select('id')
                    if (delErr) {
                      toolResult = JSON.stringify({ success: false, error: delErr.message })
                    } else if (!deletedRows || deletedRows.length === 0) {
                      toolResult = JSON.stringify({ success: false, error: 'Task not found — may already be deleted. Do NOT tell the user the task was deleted.' })
                    } else {
                      toolResult = JSON.stringify({ success: true, deleted: true })
                    }
                  }
                } else {
                  toolResult = JSON.stringify({ success: false, error: `Unknown action: ${action}` })
                }
              } catch (err) {
                toolResult = JSON.stringify({ success: false, error: String(err) })
              }

            } else if (toolCall.name === 'compile_operation') {
              try {
                const { compileOperationDraft, formatOperationSummary, createOperation, listOperations, getOperation, updateOperation, deleteOperation } = await import('@/lib/operations/operation-spec')
                const action = input.action as string

                if (action === 'compile') {
                  const userRequest = input.user_request as string
                  if (!userRequest) {
                    toolResult = JSON.stringify({ success: false, error: 'user_request is required for compile action' })
                  } else {
                    const draft = compileOperationDraft(userRequest, user.id, scope.workspaceId!)
                    // Apply any overrides
                    if (input.overrides && typeof input.overrides === 'object') {
                      const ov = input.overrides as Record<string, unknown>
                      if (ov.target_output_count !== undefined) draft.target_output_count = Number(ov.target_output_count)
                      if (ov.cadence !== undefined) draft.cadence = String(ov.cadence)
                      if (ov.cadence_label !== undefined) draft.cadence_label = String(ov.cadence_label)
                      if (ov.destination_system !== undefined) draft.destination_system = String(ov.destination_system)
                      if (ov.destination_config !== undefined) draft.destination_config = ov.destination_config as Record<string, unknown>
                    }
                    const summary = formatOperationSummary(draft)
                    // Save as draft
                    const saved = await createOperation(user.id, scope.workspaceId!, draft)
                    if (saved) {
                      toolResult = JSON.stringify({
                        success: true,
                        operation_id: saved.id,
                        status: 'draft',
                        summary,
                        spec: {
                          category: draft.category,
                          cadence_label: draft.cadence_label,
                          target_output_count: draft.target_output_count,
                          destination_system: draft.destination_system,
                          destination_config: draft.destination_config,
                          required_integrations: draft.required_integrations,
                          workflow_stages: draft.workflow_stages.map(s => s.name),
                          dedupe_policy: draft.dedupe_policy,
                          verification_policy: draft.verification_policy,
                        },
                        planning: {
                          company_domain: (draft as any).company_domain || null,
                          geography: (draft as any).geography || null,
                          planning_reason: (draft as any).planning_reason || null,
                          safe_assumptions: (draft as any).safe_assumptions || [],
                          uncertain_assumptions: (draft as any).uncertain_assumptions || [],
                          missing_prerequisites: (draft as any).missing_prerequisites || [],
                        },
                        next_step: 'Present the summary to the user using the PRESENT format from the PLAN-FIRST GATE instructions. If they confirm, call compile_operation with action="activate" and the operation_id. Check required_integrations — if any are not connected, connect them first. If missing_prerequisites lists items, handle those BEFORE execution.',
                      })
                    } else {
                      toolResult = JSON.stringify({ success: false, error: 'Failed to save operation draft. The operations table may not exist yet — the operation spec was compiled but could not be persisted.' })
                    }
                  }
                } else if (action === 'list') {
                  const ops = await listOperations(user.id, scope.workspaceId!)
                  toolResult = JSON.stringify({
                    success: true,
                    operations: ops.map(o => ({
                      id: o.id,
                      goal: o.goal.slice(0, 120),
                      category: o.category,
                      status: o.status,
                      cadence_label: o.cadence_label,
                      run_count: o.run_count,
                      last_run_at: o.last_run_at,
                    })),
                  })
                } else if (action === 'get') {
                  if (!input.operation_id) {
                    toolResult = JSON.stringify({ success: false, error: 'operation_id is required' })
                  } else {
                    const op = await getOperation(input.operation_id as string)
                    if (op) {
                      toolResult = JSON.stringify({ success: true, operation: op })
                    } else {
                      toolResult = JSON.stringify({ success: false, error: 'Operation not found' })
                    }
                  }
                } else if (action === 'activate') {
                  if (!input.operation_id) {
                    toolResult = JSON.stringify({ success: false, error: 'operation_id is required' })
                  } else {
                    const ok = await updateOperation(input.operation_id as string, { status: 'active' })
                    toolResult = JSON.stringify({ success: ok, status: ok ? 'active' : 'failed' })
                  }
                } else if (action === 'pause') {
                  if (!input.operation_id) {
                    toolResult = JSON.stringify({ success: false, error: 'operation_id is required' })
                  } else {
                    const ok = await updateOperation(input.operation_id as string, { status: 'paused' })
                    toolResult = JSON.stringify({ success: ok, status: ok ? 'paused' : 'failed' })
                  }
                } else if (action === 'resume') {
                  if (!input.operation_id) {
                    toolResult = JSON.stringify({ success: false, error: 'operation_id is required' })
                  } else {
                    const ok = await updateOperation(input.operation_id as string, { status: 'active' })
                    toolResult = JSON.stringify({ success: ok, status: ok ? 'active' : 'failed' })
                  }
                } else if (action === 'delete') {
                  if (!input.operation_id) {
                    toolResult = JSON.stringify({ success: false, error: 'operation_id is required' })
                  } else {
                    const ok = await deleteOperation(input.operation_id as string, user.id)
                    toolResult = JSON.stringify({ success: ok, deleted: ok })
                  }
                } else {
                  toolResult = JSON.stringify({ success: false, error: `Unknown action: ${action}` })
                }
              } catch (err) {
                toolResult = JSON.stringify({ success: false, error: `compile_operation failed: ${String(err)}` })
              }
            }

            // GitHub tools — use shared PAT helper
            if (toolCall.name.startsWith('github_')) {
              try {
                const patResult = await getGitHubPatForUser(user.id)
                if ('error' in patResult) {
                  toolResult = JSON.stringify({ success: false, error: patResult.error })
                } else {
                  const pat = patResult.pat
                  async function ghApi(path: string, method: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE' = 'GET', body?: Record<string, unknown>) {
                    const res = await fetch(`https://api.github.com${path}`, {
                      method,
                      headers: {
                        Authorization: `Bearer ${pat}`,
                        Accept: 'application/vnd.github+json',
                        'X-GitHub-Api-Version': '2022-11-28',
                        ...(body ? { 'Content-Type': 'application/json' } : {}),
                      },
                      ...(body ? { body: JSON.stringify(body) } : {}),
                    })
                    if (res.status === 204) return { ok: true, data: {} }
                    const data = await res.json().catch(() => null)
                    return { ok: res.ok, status: res.status, data }
                  }

                  if (toolCall.name === 'github_read_file') {
                    const { owner, repo, path, ref = 'main' } = input as Record<string, string>
                    const r = await ghApi(`/repos/${owner}/${repo}/contents/${path}?ref=${ref}`)
                    if (!r.ok) { toolResult = JSON.stringify({ success: false, error: (r.data as Record<string,unknown>)?.message || `HTTP ${r.status}` }); }
                    else {
                      const d = r.data as Record<string, unknown>
                      const decoded = typeof d.content === 'string' ? Buffer.from(d.content as string, 'base64').toString('utf-8') : null
                      toolResult = JSON.stringify({ success: true, path, content: decoded, sha: d.sha })
                    }

                  } else if (toolCall.name === 'github_list_directory') {
                    const { owner, repo, path, ref = 'main' } = input as Record<string, string>
                    const encodedPath = path ? `/${path}` : ''
                    const r = await ghApi(`/repos/${owner}/${repo}/contents${encodedPath}?ref=${ref}`)
                    if (!r.ok) { toolResult = JSON.stringify({ success: false, error: (r.data as Record<string,unknown>)?.message || `HTTP ${r.status}` }); }
                    else {
                      const items = (Array.isArray(r.data) ? r.data : [r.data]) as Array<Record<string,unknown>>
                      toolResult = JSON.stringify({ success: true, path, items: items.map(i => ({ name: i.name, type: i.type, path: i.path, size: i.size })) })
                    }

                  } else if (toolCall.name === 'github_write_file') {
                    const { owner, repo, path, content, message, branch } = input as Record<string, string>
                    const existing = await ghApi(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`)
                    const sha = existing.ok ? (existing.data as Record<string,unknown>)?.sha as string | undefined : undefined
                    const encoded = Buffer.from(content, 'utf-8').toString('base64')
                    const r = await ghApi(`/repos/${owner}/${repo}/contents/${path}`, 'PUT', { message, content: encoded, branch, ...(sha ? { sha } : {}) })
                    if (!r.ok) { toolResult = JSON.stringify({ success: false, error: (r.data as Record<string,unknown>)?.message || `HTTP ${r.status}` }); }
                    else {
                      const commit = (r.data as Record<string,unknown>)?.commit as Record<string,unknown> | undefined
                      toolResult = JSON.stringify({ success: true, message: `File "${path}" committed to branch "${branch}"`, commit_sha: commit?.sha, commit_url: commit?.html_url })
                    }

                  } else if (toolCall.name === 'github_create_branch') {
                    const { owner, repo, branch, from = 'main' } = input as Record<string, string>
                    const ref = await ghApi(`/repos/${owner}/${repo}/git/ref/heads/${from}`)
                    if (!ref.ok) { toolResult = JSON.stringify({ success: false, error: `Could not get SHA for branch ${from}` }); }
                    else {
                      const sha = ((ref.data as Record<string,unknown>)?.object as Record<string,unknown>)?.sha as string
                      const r = await ghApi(`/repos/${owner}/${repo}/git/refs`, 'POST', { ref: `refs/heads/${branch}`, sha })
                      toolResult = r.ok
                        ? JSON.stringify({ success: true, message: `Branch "${branch}" created from "${from}"` })
                        : JSON.stringify({ success: false, error: (r.data as Record<string,unknown>)?.message || `HTTP ${r.status}` })
                    }

                  } else if (toolCall.name === 'github_create_pr') {
                    const { owner, repo, title, body, head, base = 'main' } = input as Record<string, string>
                    const r = await ghApi(`/repos/${owner}/${repo}/pulls`, 'POST', { title, body, head, base })
                    if (!r.ok) { toolResult = JSON.stringify({ success: false, error: (r.data as Record<string,unknown>)?.message || `HTTP ${r.status}` }); }
                    else {
                      const pr = r.data as Record<string,unknown>
                      toolResult = JSON.stringify({ success: true, pr_number: pr.number, url: pr.html_url, title: pr.title })
                    }

                  } else if (toolCall.name === 'github_get_pr_status') {
                    const { owner, repo } = input as Record<string, string>
                    const pr_number = (input as Record<string, unknown>).pr_number
                    const r = await ghApi(`/repos/${owner}/${repo}/pulls/${pr_number}`)
                    if (!r.ok) { toolResult = JSON.stringify({ success: false, error: (r.data as Record<string,unknown>)?.message || `HTTP ${r.status}` }); }
                    else {
                      const pr = r.data as Record<string,unknown>
                      toolResult = JSON.stringify({ success: true, number: pr_number, state: pr.state, merged: pr.merged, mergeable: pr.mergeable, title: pr.title, url: pr.html_url })
                    }

                  } else if (toolCall.name === 'github_list_issues') {
                    const { owner, repo, state = 'open', label, per_page = 20 } = input as Record<string, unknown>
                    const params = new URLSearchParams({ state: state as string, per_page: String(per_page) })
                    if (label) params.set('labels', label as string)
                    const r = await ghApi(`/repos/${owner}/${repo}/issues?${params}`)
                    if (!r.ok) { toolResult = JSON.stringify({ success: false, error: (r.data as Record<string,unknown>)?.message || `HTTP ${r.status}` }); }
                    else {
                      const issues = (Array.isArray(r.data) ? r.data : []) as Array<Record<string,unknown>>
                      toolResult = JSON.stringify({ success: true, issues: issues.map(i => ({ number: i.number, title: i.title, state: i.state, url: i.html_url })) })
                    }

                  } else if (toolCall.name === 'github_create_issue') {
                    const { owner, repo, title, body, labels } = input as Record<string, unknown>
                    const r = await ghApi(`/repos/${owner}/${repo}/issues`, 'POST', { title, body, labels })
                    if (!r.ok) { toolResult = JSON.stringify({ success: false, error: (r.data as Record<string,unknown>)?.message || `HTTP ${r.status}` }); }
                    else {
                      const issue = r.data as Record<string,unknown>
                      toolResult = JSON.stringify({ success: true, number: issue.number, url: issue.html_url, title: issue.title })
                    }
                  }
                }
              } catch (ghErr) {
                toolResult = JSON.stringify({ success: false, error: `GitHub tool error: ${String(ghErr)}` })
              }
            }

            // Default toolResult if not set by handler
            if (!toolResult) {
              toolResult = JSON.stringify({ success: true })
            }

            // Track whether this integration call succeeded or failed.
            // The follow-through guard uses this on the next iteration to detect
            // "model narrated retry plan but made no tool call" and force a continuation.
            // When it fails, inject a structured _diagnosis so the model knows the exact
            // fix to apply before retrying (attempt→diagnose→retry pattern).
            if (toolCall.name.startsWith('integration_') || toolCall.name === 'integration_call') {
              try {
                const _parsed = JSON.parse(toolResult)
                lastIntegrationFailed = _parsed.success === false
                if (lastIntegrationFailed) {
                  const rawErr = String(_parsed.error || _parsed.message || JSON.stringify(_parsed.raw || {}))
                  const diagnosis = diagnoseIntegrationError(rawErr)
                  // Enrich the toolResult with structured diagnosis — the model receives
                  // cause + fix + shouldRetry so it can immediately apply the correction
                  // without narrating "let me research" or spawning an agent.
                  const enriched = {
                    ..._parsed,
                    _diagnosis: {
                      cause: diagnosis.cause,
                      fix: diagnosis.fix,
                      should_retry: diagnosis.shouldRetry,
                      is_terminal: diagnosis.isTerminal,
                      instruction: diagnosis.isTerminal
                        ? `STOP: ${diagnosis.fix}. Report this to the user and do not retry.`
                        : `RETRY NOW: ${diagnosis.fix}. Apply the fix immediately in the next tool call. Do NOT narrate — just call the corrected tool.`,
                    },
                  }
                  toolResult = JSON.stringify(enriched)
                  // Replace the last user message with the enriched result
                }
              } catch {
                // keep current value
              }
            } else {
              // Non-integration tool succeeded — reset the flag so we don't false-positive.
              lastIntegrationFailed = false
            }
            
            // Add assistant message with tool_use and user message with tool_result to continue
            conversationMessages.push({
              role: 'assistant' as const,
              content: [
                ...(fullContent ? [{ type: 'text' as const, text: fullContent }] : []),
                { type: 'tool_use' as const, id: toolCall.id, name: toolCall.name, input: input }
              ]
            } as any)
            conversationMessages.push({
              role: 'user' as const,
              content: [{ type: 'tool_result' as const, tool_use_id: toolCall.id, content: toolResult }]
            } as any)
            
            // Call AI again with tool result - continue the loop
            console.log('Continuing conversation after tool:', toolCall.name)

            enqueueAiState({
              state: 'thinking',
              startTime: Date.now(),
            })
            // Compute the tool set for this continuation turn.
            // If a skill is active, restrict to its declared allowed_tools
            // BUT always preserve integration tools so skills can interact
            // with connected providers (Attio, HubSpot, GitHub, etc.).
            // Use capturedToolsToUse (hoisted from for-loop scope) which includes run_skill
            // and any other dynamic tools assembled for this request.
            const INTEGRATION_CORE_TOOLS = new Set([
              'setup_integration', 'verify_integration', 'integration_call', 'register_custom_provider',
            ])
            const continuationTools: typeof TOOLS = (() => {
              if (activeSkillAllowedTools === null) return capturedToolsToUse
              if (activeSkillAllowedTools.length === 0) return capturedToolsToUse.filter(t =>
                t.name.startsWith('integration_') || INTEGRATION_CORE_TOOLS.has(t.name)
              )
              return capturedToolsToUse.filter(t =>
                (activeSkillAllowedTools as string[]).includes(t.name) ||
                t.name.startsWith('integration_') ||
                INTEGRATION_CORE_TOOLS.has(t.name)
              )
            })()

            currentStream = await getAnthropicInstance().messages.create({
              model: normalizeModelForTransport(selectedModel),
              max_tokens: continuationMaxTokens,
              system: fullSystemPrompt,
              messages: conversationMessages,
              tools: continuationTools,
              stream: true,
              ...(capturedSupportsThinking ? { thinking: { type: 'enabled', budget_tokens: 4000 } } : {}),
            } as any)
            
          } catch (e) {
            console.error('Tool call processing error:', e)
            break // Exit loop on error
          }
        } // End of while loop

        // If the loop exhausted maxIterations without a text response, surface a partial-work message
        // so the user isn't left with a blank chat bubble.
        if (iteration >= maxIterations && !finalAssistantContentForDb.trim()) {
          const exhaustionMsg = "I've started working on this but hit the step limit for one turn. The search and any partial writes above are real — ask me to **continue** and I'll pick up where I left off."
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: exhaustionMsg })}\n\n`))
          finalAssistantContentForDb = exhaustionMsg
        }

        // Update conversation state (greeted, message count)
        await updateConversationState(user.id, {
          greeted: true,
          messageCount: conversationState.messageCount + 1,
        })

        // Calculate model-aware credits for this turn (hoisted so SSE + deduction can both use it)
        const _estInputTokens = Math.ceil(fullSystemPrompt.length / 4) + formattedMessages.reduce((sum: number, m: any) => sum + (typeof m.content === 'string' ? m.content.length / 4 : 200), 0)
        const _estOutputTokens = Math.ceil(finalAssistantContentForDb.length / 4)
        const { calculateModelCredits: _calcCredits } = await import('@/lib/ai/pricing-engine')
        const _creditCalc = _calcCredits(selectedModel, Math.ceil(_estInputTokens), Math.ceil(_estOutputTokens))
        const creditsToDeduct = _creditCalc.credits

        // Strip leading thinking placeholder text and intermediate intention/narration lines.
        // "Let me...", "I'll...", "The issue is..." are process narration — they belong in Think,
        // not in the user-facing final message. Only strip whole lines; keep result lines.
        // Uses the hoisted NARRATION_LINE_RE / CONCRETE_EVIDENCE_RE defined before the tool loop.
        finalAssistantContentForDb = finalAssistantContentForDb
          .replace(/^(Thinking|Analyzing|Working|Processing)[.…\s]*/i, '')
          .split('\n')
          .filter(line => {
            const t = line.trim()
            if (!t) return true // preserve blank lines for paragraph structure
            if (CONCRETE_EVIDENCE_RE.test(t)) return true // always keep concrete result lines
            return !NARRATION_LINE_RE.test(t)
          })
          .join('\n')
          .replace(/\n{3,}/g, '\n\n')
          .replace(/([a-z0-9\]])\.([A-Z])/g, (_, a, b) => `${a}. ${b}`)
          .replace(/\b(?!https?:|ftp:)([a-z]+)(:)([A-Z])/g, (_, a, b, c) => `${a}${b} ${c}`)
          .trim()

        // Persist exactly one assistant message for this request (avoid duplicates).
        // When a manager-turn placeholder exists we UPDATE it in place so the
        // realtime UPDATE subscription on the client re-renders the running card
        // with the final content. Otherwise we INSERT a fresh message.
        if (conversationId && finalAssistantContentForDb.trim()) {
          console.log('[Chat] Saving assistant message. thinkingContentForDb length:', thinkingContentForDb.length, 'activity_trace_v2 steps:', activityTraceV2.length)

          const cleanedThinking = (() => {
            const cleaned = thinkingContentForDb
              .split('\n')
              .filter(line => {
                const t = line.trim()
                if (!t || t.length <= 1) return false
                if (/^[-*•·\s]+$/.test(t)) return false
                if (/^(Thinking|Analyzing [\w ]+ query|Working on(?: agent:)?|Running:|Setting up integration|Connecting[.…]*|Verifying[.…]*|Fetching[.…]*)\.{0,3}$/i.test(t)) return false
                return t.length > 2
              })
              .join('\n')
              .trim()
            return cleaned.length > 15 ? cleaned : null
          })()

          const finalMsgMetadata = {
            ...(cleanedThinking ? { thinking_content: cleanedThinking } : {}),
            ...(pendingSetupCardForDb ? { setup_card: pendingSetupCardForDb } : {}),
            ...(activityTraceV2.length > 0 ? { activity_trace_v2: activityTraceV2 } : {}),
            ...(reasoningSummary ? { reasoning_summary: reasoningSummary } : {}),
            ...(managerTurnId ? { type: 'manager_turn', status: 'completed' } : {}),
          }

          if (managerTurnId) {
            const adminDb = createAdminClient()
            await adminDb.from('messages').update({
              content: finalAssistantContentForDb,
              metadata: finalMsgMetadata,
            } as never).eq('id', managerTurnId)
          } else {
            await supabase.from('messages').insert({
              conversation_id: conversationId,
              role: 'assistant',
              content: finalAssistantContentForDb,
              metadata: finalMsgMetadata,
            } as never)
          }
          
          // Non-blocking: Generate conversation summary every 20 messages for long-horizon context
          if (conversationId && conversationState.messageCount > 0 && conversationState.messageCount % 20 === 0) {
            (async () => {
              try {
                const { data: recentMsgs } = await supabase
                  .from('messages')
                  .select('role, content')
                  .eq('conversation_id', conversationId)
                  .order('created_at', { ascending: false })
                  .limit(20)
                if (recentMsgs && recentMsgs.length >= 10) {
                  const transcript = (recentMsgs as Array<{ role: string; content: string }>)
                    .reverse()
                    .map(m => `${m.role}: ${m.content.slice(0, 200)}`)
                    .join('\n')
                  const { createNonStreamingMessageWithFallback, DEFAULT_MODEL } = await import('@/lib/ai/ai-client')
                  const { response: summaryResp } = await createNonStreamingMessageWithFallback({
                    model: DEFAULT_MODEL,
                    max_tokens: 200,
                    messages: [{
                      role: 'user',
                      content: `Summarize this conversation in 2-3 sentences. Focus on key topics, decisions, and any commitments made.\n\n${transcript}`
                    }]
                  })
                  const summaryText = summaryResp.content[0].type === 'text' ? summaryResp.content[0].text : ''
                  if (summaryText.trim()) {
                    await supabase
                      .from('conversations')
                      .update({ summary: summaryText.trim() } as never)
                      .eq('id', conversationId)
                    console.log('[ConvSummary] Generated summary for conversation', conversationId)
                  }
                }
              } catch (err) {
                console.warn('[ConvSummary] Failed to generate summary:', err instanceof Error ? err.message : err)
              }
            })()
          }

          // Deduct credits for this chat message (uses hoisted creditsToDeduct)
          if (scope.workspaceId) {
            deductWorkspaceCredits(scope.workspaceId, creditsToDeduct, `chat:${selectedModel}:${conversationId}`)
              .then(result => {
                if (!result.success) console.warn(`[Credit Deduction] Failed for workspace ${scope.workspaceId}: ${result.error}`)
                else console.log(`[Credit Deduction] model=${selectedModel} raw_cost=${_creditCalc.rawCostCents.toFixed(4)}c credits=${creditsToDeduct} margin=${_creditCalc.marginApplied}x remaining=${result.remainingCredits}`)
              })
              .catch(err => console.error('[Credit Deduction Error]', err))
          }

          // Extract memories from this conversation turn (non-blocking)
          const userMsg = formattedMessages[formattedMessages.length - 1]?.content
          const userMsgStr = typeof userMsg === 'string' ? userMsg : ''
          if (userMsgStr) {
            if (scope.workspaceId) {
              extractMemoriesFromConversation(user.id, scope.workspaceId, userMsgStr, finalAssistantContentForDb)
                .catch(err => console.error('[Memory extraction error]', err))
            }
          }
        }

        enqueueAiState({
          state: 'idle',
          context: '',
          startTime: Date.now(),
        })

        // Emit usage stats so the client can show a per-message footer
        const outputTokenEst = Math.ceil(finalAssistantContentForDb.length / 4)
        const inputTokenEst = Math.ceil(JSON.stringify(formattedMessages).length / 4)
        enqueueSse({
          type: 'usage',
          inputTokens: inputTokenEst,
          outputTokens: outputTokenEst,
          creditsUsed: creditsToDeduct,
          model: selectedModel,
        })

        // Emit memory labels used in this response so the client renders chips
        if (aiMemories.length > 0) {
          const memLabels = getMemoryLabels(aiMemories)
          if (memLabels.length > 0) {
            enqueueSse({ type: 'used_memories', memories: memLabels })
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
       } catch (streamError) {
        console.error('[Stream] Unhandled error in ReadableStream start:', streamError)
        // Mark the placeholder as failed so the client shows a retry card
        if (managerTurnId) {
          try {
            const adminDb = createAdminClient()
            await adminDb.from('messages').update({
              metadata: { type: 'manager_turn', status: 'failed' },
            } as never).eq('id', managerTurnId)
          } catch { /* non-critical */ }
        }
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'An error occurred while generating the response.' })}\n\n`))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch { /* controller may already be closed */ }
       }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
}
