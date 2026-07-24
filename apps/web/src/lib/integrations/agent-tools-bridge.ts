/**
 * Agent Tools Bridge
 *
 * Bridges MCP integration tools into the agent executor.
 * Loads a user's active connections, discovers available MCP tools,
 * converts them to Anthropic tool format, and provides an execution handler.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { executeTool } from './mcp-executor'
import type { McpTool, McpToolResult } from './types'
import type Anthropic from '@anthropic-ai/sdk'
import { getStoredApiKey, resolveCustomManifest } from './credential-helpers'
import { fetchAndGenerateTools } from './openapi-to-mcp'
import { getProviderPack } from './provider-packs'

interface ActiveConnection {
  id: string
  provider: string
  status: string
  config?: Record<string, unknown> | null
}

/** Sentinel tool name for custom providers without an OpenAPI spec */
const GENERIC_API_CALL_TOOL = '__generic_api_call__'

interface AgentIntegrationTool {
  /** Anthropic-formatted tool definition */
  anthropicTool: Anthropic.Messages.Tool
  /** Connection ID to use when executing */
  connectionId: string
  /** Provider name */
  provider: string
  /** Original MCP tool name */
  mcpToolName: string
}

export interface AgentIntegrationToolset {
  /** Anthropic tool definitions to add to the tools array */
  tools: Anthropic.Messages.Tool[]
  /** Map from tool name → execution metadata */
  toolMap: Map<string, { connectionId: string; provider: string; mcpToolName: string }>
  /** Number of active connections found */
  connectionCount: number
  /** Providers with tools */
  providers: string[]
}

export interface IntegrationToolResult {
  success: boolean
  data: string
  operation_kind: 'read' | 'write'
  verified_write: boolean
}

/**
 * Load all active integration connections for a user (and optionally workspace) and build
 * Anthropic-compatible tool definitions for each available MCP tool.
 *
 * When workspaceId is provided, connections are scoped to that workspace only.
 * This prevents cross-workspace tool leakage in multi-workspace setups.
 */
export async function loadAgentIntegrationTools(userId: string, workspaceId?: string): Promise<AgentIntegrationToolset> {
  const supabase = createAdminClient()

  let query = supabase
    .from('integration_connections')
    .select('id, provider, status, config')
    .eq('user_id', userId)
    .eq('status', 'active')

  if (workspaceId) {
    query = query.eq('workspace_id', workspaceId)
  }

  const { data: connections, error } = await query

  if (error || !connections || connections.length === 0) {
    return { tools: [], toolMap: new Map(), connectionCount: 0, providers: [] }
  }

  const activeConnections = (connections as ActiveConnection[])
  const allTools: AgentIntegrationTool[] = []
  const providers: string[] = []

  const { slackTools } = await import('./provider-packs/slack-tools')
  const { gmailTools } = await import('./provider-packs/gmail-tools')
  const { googleSheetsTools } = await import('./provider-packs/google-sheets-tools')
  const { googleCalendarTools } = await import('./provider-packs/google-calendar-tools')
  const { openaiTools } = await import('./provider-packs/openai-tools')
  const { perplexityTools } = await import('./provider-packs/perplexity-tools')
  const { firecrawlTools } = await import('./provider-packs/firecrawl-tools')
  const { elevenlabsTools } = await import('./provider-packs/elevenlabs-tools')
  const { attioTools } = await import('./provider-packs/attio-tools')

  for (const conn of activeConnections) {
    try {
      let mcpTools: McpTool[] = []

      // Get hardcoded tools per provider
      if (conn.provider === 'slack') {
        mcpTools = [...slackTools]
      } else if (conn.provider === 'gmail') {
        mcpTools = [...gmailTools]
      } else if (conn.provider === 'google_sheets') {
        mcpTools = [...googleSheetsTools]
      } else if (conn.provider === 'google_calendar') {
        mcpTools = [...googleCalendarTools]
      } else if (conn.provider === 'openai') {
        mcpTools = [...openaiTools]
      } else if (conn.provider === 'perplexity') {
        mcpTools = [...perplexityTools]
      } else if (conn.provider === 'firecrawl') {
        mcpTools = [...firecrawlTools]
      } else if (conn.provider === 'elevenlabs') {
        mcpTools = [...elevenlabsTools]
      } else if (conn.provider === 'attio') {
        mcpTools = [...attioTools]
      }

      // Get OpenAPI-generated tools from built-in or custom manifest pack
      const pack = getProviderPack(conn.provider)
      if (pack) {
        try {
          const openApiTools = await fetchAndGenerateTools(pack)
          const hardcodedNames = new Set(mcpTools.map(t => t.name))
          mcpTools = [...mcpTools, ...openApiTools.filter(t => !hardcodedNames.has(t.name))]
        } catch (e) {
          console.error(`[AgentToolsBridge] Failed to fetch OpenAPI tools for ${conn.provider}:`, e)
        }
      }

      // For custom providers: load manifest and generate tools or provide generic api_call
      if (mcpTools.length === 0 && !pack) {
        const customManifest = resolveCustomManifest(conn.config || {})
        if (customManifest) {
          if (customManifest.openApiSpecUrl) {
            try {
              const customPack = {
                id: customManifest.id,
                name: customManifest.name,
                description: '',
                baseUrl: customManifest.baseUrl,
                apiKeyAuth: customManifest.apiKeyAuth,
                credentialKeyField: customManifest.credentialKeyField,
                openApiSpecUrl: customManifest.openApiSpecUrl,
              }
              const generatedTools = await fetchAndGenerateTools(customPack)
              mcpTools = [...generatedTools]
            } catch (e) {
              console.error(`[AgentToolsBridge] Failed to generate OpenAPI tools for custom provider ${conn.provider}:`, e)
            }
          }

          // If still no tools (no OpenAPI spec or fetch failed), provide a generic api_call tool
          if (mcpTools.length === 0) {
            const genericTool: McpTool = {
              name: GENERIC_API_CALL_TOOL,
              description: `Make a direct HTTP call to the ${customManifest.name} API using stored credentials.`,
              inputSchema: {
                type: 'object',
                properties: {
                  method: { type: 'string', description: 'HTTP method: GET, POST, PUT, PATCH, DELETE' },
                  path: { type: 'string', description: 'API path relative to base URL (no leading slash)' },
                  body: { type: 'object', description: 'Request body for POST/PUT/PATCH (optional)' },
                  query: { type: 'object', description: 'Query string key-value pairs (optional)' },
                },
                required: ['method', 'path'],
              },
              execute: async () => ({ success: false, error: 'Generic api_call is executed directly by the bridge, not via MCP' }),
            }
            mcpTools = [genericTool]
          }
        }
      }

      if (mcpTools.length === 0) continue
      providers.push(conn.provider)

      for (const tool of mcpTools) {
        // Prefix tool name to avoid collisions with built-in tools
        // Avoid double-prefix: if tool.name already starts with provider, just add "integration_"
        const providerPrefix = conn.provider.replace(/_/g, '') // google_sheets → googlesheets
        const alreadyPrefixed = tool.name.startsWith(conn.provider + '_') || tool.name.startsWith(providerPrefix + '_')
        const agentToolName = alreadyPrefixed
          ? `integration_${tool.name}`
          : `integration_${conn.provider}_${tool.name}`

        allTools.push({
          anthropicTool: {
            name: agentToolName,
            type: 'custom',
            description: `[${conn.provider.toUpperCase()} API] ${tool.description}`,
            input_schema: tool.inputSchema as Anthropic.Messages.Tool.InputSchema,
          } as Anthropic.Messages.Tool,
          connectionId: conn.id,
          provider: conn.provider,
          mcpToolName: tool.name,
        })
      }
    } catch (e) {
      console.error(`[AgentToolsBridge] Error loading tools for connection ${conn.id}:`, e)
    }
  }

  const toolMap = new Map<string, { connectionId: string; provider: string; mcpToolName: string }>()
  for (const t of allTools) {
    toolMap.set(t.anthropicTool.name, {
      connectionId: t.connectionId,
      provider: t.provider,
      mcpToolName: t.mcpToolName,
    })
  }

  return {
    tools: allTools.map(t => t.anthropicTool),
    toolMap,
    connectionCount: activeConnections.length,
    providers: [...new Set(providers)],
  }
}

/**
 * Classify a tool name as a mutating (write) operation or a read.
 * Write tools include create/update/delete/add/send and any HTTP method that mutates state.
 */
export function classifyToolOperation(
  mcpToolName: string,
  inputMethod?: string
): 'read' | 'write' {
  const lc = mcpToolName.toLowerCase()
  if (/(?:^|_)(create|update|add|delete|send|post|insert|upsert|patch|put|modify|archive|move|reply)(?:_|$)/.test(lc)) return 'write'
  // Generic api_call — derive from HTTP method
  if (mcpToolName === '__generic_api_call__') {
    const method = (inputMethod || 'GET').toUpperCase()
    return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? 'write' : 'read'
  }
  return 'read'
}

/**
 * Detect whether a tool result contains explicit write verification.
 * Checks top-level hoisted fields (_confirmed_record_id, _confirmed_entry_id),
 * the _verification block from verifyDealWrite, and the nested Attio id paths.
 */
export function detectVerifiedWrite(data: string): boolean {
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>
    const inner = (parsed?.data ?? parsed) as Record<string, unknown>
    // Top-level hoisted fields (added by validateRecordResponse / validateEntryResponse)
    if (inner?._confirmed_record_id || inner?._confirmed_entry_id) return true
    // _verification block from verifyDealWrite
    if (inner?._verification) return true
    if (typeof inner?.id === 'string' && inner.id.length > 0) return true
    if (typeof inner?.record_id === 'string' && inner.record_id.length > 0) return true
    if (typeof inner?.entry_id === 'string' && inner.entry_id.length > 0) return true
    if (typeof inner?.note_id === 'string' && inner.note_id.length > 0) return true
    if (typeof inner?.threadId === 'string' && inner.threadId.length > 0) return true
    if (typeof inner?.ts === 'string' && inner.ts.length > 0) return true
    if (typeof inner?.channel === 'string' && inner.channel.length > 0 && typeof inner?.ts === 'string' && inner.ts.length > 0) return true
    // Standard nested Attio id paths
    const id = (inner?.id ?? inner?.data) as Record<string, unknown> | undefined
    if (id?.record_id || id?.entry_id || id?.note_id) return true
    const channel = inner?.channel as Record<string, unknown> | undefined
    if (typeof channel?.id === 'string' && channel.id.length > 0) return true
    const message = inner?.message as Record<string, unknown> | undefined
    if (typeof message?.ts === 'string' && message.ts.length > 0) return true
    return false
  } catch {
    return false
  }
}

/**
 * Execute an integration tool call from the agent.
 * Returns structured result including operation kind and write verification status.
 */
export async function executeAgentIntegrationTool(
  toolName: string,
  input: Record<string, unknown>,
  toolMap: Map<string, { connectionId: string; provider: string; mcpToolName: string }>,
  userId: string
): Promise<IntegrationToolResult> {
  const meta = toolMap.get(toolName)
  if (!meta) {
    return { success: false, data: `Unknown integration tool: ${toolName}`, operation_kind: 'read', verified_write: false }
  }

  try {
    // Generic api_call for custom providers without an OpenAPI spec
    if (meta.mcpToolName === GENERIC_API_CALL_TOOL) {
      const genericResult = await executeGenericApiCall(meta.connectionId, meta.provider, input, userId)
      const opKindGeneric = classifyToolOperation(GENERIC_API_CALL_TOOL, input.method as string | undefined)
      return {
        ...genericResult,
        operation_kind: opKindGeneric,
        verified_write: opKindGeneric === 'write' && genericResult.success && detectVerifiedWrite(genericResult.data),
      }
    }

    const opKind = classifyToolOperation(meta.mcpToolName, input.method as string | undefined)

    const result: McpToolResult = await executeTool({
      connectionId: meta.connectionId,
      toolName: meta.mcpToolName,
      input,
      userId,
    })

    if (result.success) {
      const dataStr = result.data
        ? (typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2))
        : 'Success'
      const truncated = dataStr.slice(0, 4000)
      return {
        success: true,
        data: truncated,
        operation_kind: opKind,
        verified_write: opKind === 'write' && detectVerifiedWrite(truncated),
      }
    } else {
      return {
        success: false,
        data: `API error: ${result.error || 'Unknown error'}${result.statusCode ? ` (HTTP ${result.statusCode})` : ''}`,
        operation_kind: opKind,
        verified_write: false,
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { success: false, data: `Tool execution failed: ${message}`, operation_kind: 'read', verified_write: false }
  }
}

/**
 * Execute a raw HTTP call for custom providers that have no OpenAPI spec.
 * Uses the stored API key and provider manifest auth config.
 */
async function executeGenericApiCall(
  connectionId: string,
  provider: string,
  input: Record<string, unknown>,
  userId: string
): Promise<{ success: boolean; data: string }> {
  try {
    const supabase = createAdminClient()
    const { data: conn } = await supabase
      .from('integration_connections')
      .select('config')
      .eq('id', connectionId)
      .single()

    if (!conn) return { success: false, data: `Connection not found: ${connectionId}` }

    const manifest = resolveCustomManifest((conn as { config: Record<string, unknown> }).config || {})
    if (!manifest) return { success: false, data: `No manifest found for provider: ${provider}` }

    const apiKey = await getStoredApiKey(supabase, userId, provider)
    if (!apiKey) return { success: false, data: `No API key found for ${manifest.name}. Connect it first via setup_integration.` }

    const method = typeof input.method === 'string' ? input.method.toUpperCase() : 'GET'
    const path = typeof input.path === 'string' ? input.path.replace(/^\/+/, '') : ''
    const body = input.body && typeof input.body === 'object' ? input.body : undefined
    const queryParams = input.query && typeof input.query === 'object' ? input.query as Record<string, string> : {}

    const headerName = manifest.apiKeyAuth?.headerName || 'Authorization'
    const prefix = manifest.apiKeyAuth?.headerPrefix !== undefined
      ? manifest.apiKeyAuth.headerPrefix
      : (headerName === 'Authorization' ? 'Bearer ' : '')

    let fullUrl = `${manifest.baseUrl}/${path}`
    const qKeys = Object.keys(queryParams)
    if (qKeys.length > 0) {
      fullUrl += '?' + new URLSearchParams(Object.fromEntries(qKeys.map(k => [k, String(queryParams[k])]))).toString()
    }

    const resp = await fetch(fullUrl, {
      method,
      headers: {
        [headerName]: `${prefix}${apiKey}`,
        'Content-Type': 'application/json',
      },
      ...(body && method !== 'GET' && method !== 'DELETE' ? { body: JSON.stringify(body) } : {}),
    })

    const data = await resp.json().catch(() => null)

    if (resp.ok) {
      const dataStr = data ? JSON.stringify(data, null, 2) : 'Success'
      return { success: true, data: dataStr.slice(0, 4000) }
    } else {
      const errMsg = extractApiError(resp.status, data)
      return { success: false, data: `${manifest.name} API error: ${errMsg}` }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { success: false, data: `Generic API call failed: ${message}` }
  }
}

/** Extract a human-readable error from any API response body */
function extractApiError(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    const msg = b.message || b.error || b.detail
    if (typeof msg === 'string' && msg.length > 0) return `HTTP ${status}: ${msg}`
    const errors = b.errors
    if (Array.isArray(errors) && errors.length > 0) {
      const first = errors[0] as Record<string, unknown>
      const detail = first.message || first.detail || first.code
      if (typeof detail === 'string') return `HTTP ${status}: ${detail}`
    }
  }
  return `HTTP ${status}`
}

/**
 * Build a system prompt section describing available API integrations.
 */
export function buildIntegrationToolsPrompt(toolset: AgentIntegrationToolset): string {
  if (toolset.tools.length === 0) return ''

  const providerList = toolset.providers.map(p => p.toUpperCase()).join(', ')
  const toolNames = toolset.tools.map(t => `- ${t.name}: ${(t as { description?: string }).description || ''}`).join('\n')

  const attioPlaybook = toolset.providers.includes('attio') ? `

### ATTIO OPERATIONAL RULES — mandatory reading before ANY Attio action

#### STEP 0 — ALWAYS RESEARCH FIRST (no exceptions)
Before your first write to Attio in any session:
1. Call \`integration_attio_inspect_workspace\` — returns workspace name, deal count, exact stage titles, all lists, AND workspace members (needed for deal owner).
2. Read \`available_deal_stages\` — these are the ONLY valid stage values. Never guess stage names.
3. Read \`workspace_members\` — use \`workspace_members[0].actor_id\` as \`owner_actor_id\` when creating deals.

#### OBJECT SLUG RULE (critical — breaks deal creation silently if wrong)
Attio API object slugs are ALWAYS PLURAL:
- Companies → \`"companies"\` (NOT "company")
- People → \`"people"\` (NOT "person")
- Deals → \`"deals"\` (NOT "deal")
This affects \`target_object\` in association fields. Wrong slug = silent failure or HTTP 400.

#### CREATING A DEAL — exact required fields
Call \`integration_attio_create_deal\` with:
- \`name\` — deal name (required)
- \`stage\` — exact stage title from Step 0 (e.g. "Lead")
- \`owner_actor_id\` — actor ID from \`workspace_members[0].actor_id\` (strongly recommended; some workspaces require it)
- \`associated_company_id\` — company record_id from \`attio_create_company\` or \`attio_search_companies\` (uses plural slug "companies" internally)

The tool returns a \`_verification\` block — check \`confirmed_stage\` matches what you sent.
If \`confirmed_stage\` differs or is null: the stage name was wrong — call \`attio_get_deal_stages\`, pick correct title, retry once.

#### MOVING / UPDATING A DEAL
1. Call \`integration_attio_search_deals\` to get \`record_id\`.
2. Call \`integration_attio_update_deal\` with \`record_id\` + \`stage\` (exact title from Step 0).
3. Verify \`_verification.confirmed_stage\` in the response.

#### RECOVERY — when a deal write returns HTTP 400
1. Read the EXACT error message from the tool result.
2. If error mentions "slug" or "object" → you used a singular slug somewhere. Fix: use "companies", "people", "deals".
3. If error mentions "owner" or "actor" → call \`attio_inspect_workspace\`, get \`workspace_members[0].actor_id\`, retry with \`owner_actor_id\`.
4. If error mentions "stage" → call \`attio_get_deal_stages\`, use exact title, retry.
5. Only after 2 failed retries: report the exact error + blocker to the user.

#### RULES
- **Never guess stage names.** Always use the titles returned by \`attio_inspect_workspace\` or \`attio_get_deal_stages\`.
- **Never use \`attio_add_to_pipeline\` for deals.** That tool is for list-entry objects (people/companies in list views), not deals.
- **Never claim success** without seeing \`confirmed_stage\` in the tool response.
- **Object slugs are always plural.** "companies", "people", "deals" — never singular.
` : ''

  return `

## Available API Integrations
You have authenticated API access to: ${providerList}

Use these integration tools **only when the task involves those services** (e.g., sending email, posting to Slack, reading an inbox, managing calendar events, updating a CRM). For research, information gathering, or general browsing tasks, use web_search or the browser instead.

### PROACTIVE INTEGRATION PROTOCOL — applies to ALL providers

Follow this sequence for every integration task. Do not skip steps.

**1. DISCOVER** — Before acting, check what you already know:
- Review any "PRIOR INTEGRATION LEARNINGS" in this prompt for relevant lessons from past sessions.
- Search memory boxes (manage_memory_box action="search") for provider-specific notes if the task is complex.

**2. VERIFY** — Confirm the live integration state:
- Use typed inspection/list tools (e.g. \`integration_attio_inspect_workspace\`, \`integration_github_list_repos\`) to discover workspace-specific values (stage names, list IDs, repo branches, etc.).
- Never guess workspace-specific values — always discover them from the live API first.

**3. ACT** — Execute using the safest available tools:
- Prefer typed provider tools (e.g. \`integration_attio_create_deal\`) over generic \`integration_call\` whenever typed tools exist.
- Search before creating when duplicates are possible (search for existing records before inserting new ones).
- Verify every write: check the tool response for \`record_id\`, \`id\`, \`_verification\`, or equivalent confirmation before reporting success.

**4. LEARN** — After completing the task (or if it fails):
- If you discovered something new about the provider (naming conventions, required fields, valid values, error patterns), store it as a memory using manage_memory_box with category "knowledge" so future sessions can reuse it.
- If a write failed and you found the fix, document both the error pattern and the solution.

**ON FAILURE** — bounded recovery, not blind retries:
- Read the error message carefully. Check if PRIOR INTEGRATION LEARNINGS already covers this error.
- Try up to 2 evidence-based alternative approaches (e.g., different field names, re-discover valid values, check API docs via web_search).
- If still failing after 2 retries, tell the user clearly: what you tried, what failed, and what the likely root cause is. Do NOT silently retry the same failing call.
- Store the new failure pattern as a memory for next time.
${attioPlaybook}
Available integration tools:
${toolNames}
`
}

