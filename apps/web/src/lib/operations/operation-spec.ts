/**
 * Operation Spec — Durable operating contract for autonomous recurring work.
 *
 * Turns a single user instruction (e.g. "find me 10 leads per day and add to Attio")
 * into a structured, persisted specification that the system can execute repeatedly
 * without re-prompting.
 */

import { createAdminClient } from '@/lib/supabase/admin'

// ── Types ─────────────────────────────────────────────────────────────

export type OperationCategory =
  | 'lead_generation'
  | 'enrichment'
  | 'crm_sync'
  | 'outreach'
  | 'monitoring'
  | 'reporting'
  | 'content'
  | 'support'
  | 'custom'

export type OperationStatus = 'draft' | 'active' | 'paused' | 'completed' | 'failed'

export type ApprovalPolicy = 'auto' | 'approve_first_run' | 'approve_all_writes' | 'approve_exceptions'

export interface EnrichmentField {
  field: string
  source: 'web_search' | 'integration' | 'inference'
  required: boolean
}

export interface OperationSpec {
  id: string
  user_id: string
  workspace_id: string
  goal: string
  category: OperationCategory
  status: OperationStatus

  // Cadence
  cadence: string // cron expression or preset
  cadence_label: string // human-readable, e.g. "Daily at 9 AM"
  timezone: string

  // Output expectations
  target_output_count: number | null // e.g. 10 leads per run
  success_metric: string | null // e.g. "10 verified leads added to Attio"

  // Source
  source_channels: string[] // e.g. ["web_search", "linkedin"]
  filters: Record<string, unknown> // ICP / search criteria

  // Destination
  destination_system: string | null // e.g. "attio", "board", "memory"
  destination_config: Record<string, unknown> // e.g. { stage: "Lead", object: "deals" }

  // Required integrations
  required_integrations: string[] // e.g. ["attio"]

  // Enrichment
  enrichment_schema: EnrichmentField[]

  // Policies
  dedupe_policy: 'skip_existing' | 'update_existing' | 'allow_duplicates'
  write_policy: 'create_only' | 'create_or_update' | 'upsert'
  approval_policy: ApprovalPolicy
  verification_policy: 'verify_all_writes' | 'verify_sample' | 'no_verification'
  fallback_policy: string | null // what to do if main path fails

  // Workflow stages
  workflow_stages: WorkflowStage[]

  // Checkpoint state (persisted between runs)
  checkpoint: OperationCheckpoint

  // Metadata
  agent_id: string | null // linked agent if any
  mission_id: string | null // linked mission if any
  recurring_task_id: string | null // linked recurring task if any
  created_at: string
  updated_at: string
  last_run_at: string | null
  run_count: number
  last_run_summary: string | null
}

export interface WorkflowStage {
  name: string // e.g. "source", "score", "enrich", "dedupe", "write", "verify", "report"
  description: string
  required: boolean
  tools: string[] // tools the stage can use
}

export interface OperationCheckpoint {
  last_run_at: string | null
  processed_ids: string[]
  counters: Record<string, number>
  state: Record<string, unknown>
  last_run_output: unknown[] | null
  last_verification: VerificationResult | null
}

export interface VerificationResult {
  verified_at: string
  total_items: number
  verified_items: number
  failed_items: number
  details: Array<{
    item_id: string
    status: 'verified' | 'failed' | 'skipped'
    reason?: string
  }>
}

export interface OperationRunResult {
  operation_id: string
  run_at: string
  items_sourced: number
  items_enriched: number
  items_written: number
  items_verified: number
  items_failed: number
  summary: string
  verification: VerificationResult | null
  errors: string[]
}

// ── Default workflow stages ───────────────────────────────────────────

export const DEFAULT_WORKFLOW_STAGES: Record<OperationCategory, WorkflowStage[]> = {
  lead_generation: [
    { name: 'source', description: 'Find candidates matching ICP', required: true, tools: ['web_search', 'analyze_url'] },
    { name: 'score', description: 'Score and rank by fit', required: true, tools: [] },
    { name: 'enrich', description: 'Gather additional data', required: false, tools: ['web_search', 'analyze_url'] },
    { name: 'dedupe', description: 'Remove duplicates against existing records', required: true, tools: [] },
    { name: 'write', description: 'Write to destination system', required: true, tools: [] },
    { name: 'verify', description: 'Confirm writes succeeded', required: true, tools: [] },
    { name: 'report', description: 'Summarize results', required: true, tools: [] },
  ],
  enrichment: [
    { name: 'load', description: 'Load records to enrich', required: true, tools: [] },
    { name: 'enrich', description: 'Gather enrichment data', required: true, tools: ['web_search', 'analyze_url'] },
    { name: 'write', description: 'Update records with enrichment', required: true, tools: [] },
    { name: 'verify', description: 'Confirm updates succeeded', required: true, tools: [] },
    { name: 'report', description: 'Summarize enrichment results', required: true, tools: [] },
  ],
  crm_sync: [
    { name: 'source', description: 'Load source data', required: true, tools: [] },
    { name: 'map', description: 'Map fields to destination schema', required: true, tools: [] },
    { name: 'dedupe', description: 'Check for existing records', required: true, tools: [] },
    { name: 'write', description: 'Create or update records', required: true, tools: [] },
    { name: 'verify', description: 'Confirm sync succeeded', required: true, tools: [] },
    { name: 'report', description: 'Summarize sync results', required: true, tools: [] },
  ],
  outreach: [
    { name: 'load', description: 'Load qualified leads', required: true, tools: [] },
    { name: 'personalize', description: 'Write personalized messages', required: true, tools: ['web_search'] },
    { name: 'review', description: 'Present for approval if needed', required: false, tools: [] },
    { name: 'send', description: 'Send outreach', required: true, tools: [] },
    { name: 'track', description: 'Log sends and update pipeline', required: true, tools: [] },
    { name: 'report', description: 'Summarize outreach results', required: true, tools: [] },
  ],
  monitoring: [
    { name: 'check', description: 'Check monitored sources', required: true, tools: ['web_search', 'analyze_url'] },
    { name: 'detect', description: 'Detect changes or alerts', required: true, tools: [] },
    { name: 'report', description: 'Report findings', required: true, tools: [] },
  ],
  reporting: [
    { name: 'gather', description: 'Collect data from sources', required: true, tools: ['web_search'] },
    { name: 'analyze', description: 'Analyze and synthesize', required: true, tools: ['calculate'] },
    { name: 'report', description: 'Produce report', required: true, tools: [] },
  ],
  content: [
    { name: 'research', description: 'Research topic', required: true, tools: ['web_search', 'analyze_url'] },
    { name: 'create', description: 'Create content', required: true, tools: [] },
    { name: 'review', description: 'Present for approval', required: false, tools: [] },
    { name: 'publish', description: 'Publish or schedule', required: true, tools: [] },
    { name: 'report', description: 'Summarize production', required: true, tools: [] },
  ],
  support: [
    { name: 'monitor', description: 'Check for new tickets/emails', required: true, tools: [] },
    { name: 'triage', description: 'Classify and prioritize', required: true, tools: [] },
    { name: 'respond', description: 'Draft responses', required: true, tools: ['web_search'] },
    { name: 'escalate', description: 'Escalate if needed', required: false, tools: [] },
    { name: 'report', description: 'Summarize support activity', required: true, tools: [] },
  ],
  custom: [
    { name: 'execute', description: 'Execute custom workflow', required: true, tools: [] },
    { name: 'verify', description: 'Verify results', required: false, tools: [] },
    { name: 'report', description: 'Summarize results', required: true, tools: [] },
  ],
}

// ── CRUD helpers ──────────────────────────────────────────────────────

export function createEmptyCheckpoint(): OperationCheckpoint {
  return {
    last_run_at: null,
    processed_ids: [],
    counters: {},
    state: {},
    last_run_output: null,
    last_verification: null,
  }
}

export async function createOperation(
  userId: string,
  workspaceId: string,
  spec: Omit<OperationSpec, 'id' | 'user_id' | 'workspace_id' | 'created_at' | 'updated_at' | 'last_run_at' | 'run_count' | 'last_run_summary' | 'checkpoint'>
): Promise<OperationSpec | null> {
  const supabase = createAdminClient()
  const now = new Date().toISOString()

  const row = {
    user_id: userId,
    workspace_id: workspaceId,
    goal: spec.goal,
    category: spec.category,
    status: spec.status || 'draft',
    cadence: spec.cadence,
    cadence_label: spec.cadence_label,
    timezone: spec.timezone || 'UTC',
    target_output_count: spec.target_output_count,
    success_metric: spec.success_metric,
    source_channels: spec.source_channels,
    filters: spec.filters,
    destination_system: spec.destination_system,
    destination_config: spec.destination_config,
    required_integrations: spec.required_integrations,
    enrichment_schema: spec.enrichment_schema,
    dedupe_policy: spec.dedupe_policy,
    write_policy: spec.write_policy,
    approval_policy: spec.approval_policy,
    verification_policy: spec.verification_policy,
    fallback_policy: spec.fallback_policy,
    workflow_stages: spec.workflow_stages,
    checkpoint: createEmptyCheckpoint(),
    agent_id: spec.agent_id,
    mission_id: spec.mission_id,
    recurring_task_id: spec.recurring_task_id,
    created_at: now,
    updated_at: now,
    last_run_at: null,
    run_count: 0,
    last_run_summary: null,
  }

  const { data, error } = await supabase
    .from('operations')
    .insert(row as never)
    .select()
    .single()

  if (error) {
    console.error('[Operations] create error:', error)
    return null
  }

  return data as OperationSpec
}

export async function getOperation(operationId: string): Promise<OperationSpec | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('operations')
    .select('*')
    .eq('id', operationId)
    .single()

  if (error || !data) return null
  return data as OperationSpec
}

export async function listOperations(
  userId: string,
  workspaceId: string,
  statusFilter?: OperationStatus
): Promise<OperationSpec[]> {
  const supabase = createAdminClient()
  let query = supabase
    .from('operations')
    .select('*')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  const { data, error } = await query
  if (error) {
    console.error('[Operations] list error:', error)
    return []
  }
  return (data ?? []) as OperationSpec[]
}

export async function updateOperation(
  operationId: string,
  updates: Partial<Pick<OperationSpec, 'status' | 'checkpoint' | 'last_run_at' | 'run_count' | 'last_run_summary' | 'filters' | 'target_output_count' | 'enrichment_schema' | 'cadence' | 'cadence_label'>>
): Promise<boolean> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('operations')
    .update({ ...updates, updated_at: new Date().toISOString() } as never)
    .eq('id', operationId)

  if (error) {
    console.error('[Operations] update error:', error)
    return false
  }
  return true
}

export async function deleteOperation(operationId: string, userId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('operations')
    .delete()
    .eq('id', operationId)
    .eq('user_id', userId)

  if (error) {
    console.error('[Operations] delete error:', error)
    return false
  }
  return true
}

// ── Compiler helpers ──────────────────────────────────────────────────

/**
 * Detect the most likely operation category from a user message.
 */
export function detectCategory(message: string): OperationCategory {
  const lower = message.toLowerCase()

  const patterns: Array<{ category: OperationCategory; keywords: string[] }> = [
    { category: 'lead_generation', keywords: ['lead', 'prospect', 'find customer', 'find client', 'find compan', 'source lead', 'build list', 'generate lead'] },
    { category: 'enrichment', keywords: ['enrich', 'add info', 'add data', 'fill in', 'complete profile', 'research contact'] },
    { category: 'crm_sync', keywords: ['sync', 'import', 'export', 'transfer', 'migrate', 'push to crm', 'update crm'] },
    { category: 'outreach', keywords: ['outreach', 'email', 'reach out', 'contact', 'cold email', 'follow up', 'drip', 'nurture'] },
    { category: 'monitoring', keywords: ['monitor', 'watch', 'alert', 'track', 'check for', 'notify'] },
    { category: 'reporting', keywords: ['report', 'analyz', 'dashboard', 'metric', 'kpi', 'summary'] },
    { category: 'content', keywords: ['content', 'blog', 'article', 'post', 'newsletter', 'write', 'publish'] },
    { category: 'support', keywords: ['support', 'ticket', 'customer service', 'help desk', 'inbox', 'respond to'] },
  ]

  let best: OperationCategory = 'custom'
  let bestCount = 0

  for (const { category, keywords } of patterns) {
    const count = keywords.filter(k => lower.includes(k)).length
    if (count > bestCount) {
      bestCount = count
      best = category
    }
  }

  return best
}

/**
 * Detect cadence from a user message.
 */
export function detectCadence(message: string): { cron: string; label: string } {
  const lower = message.toLowerCase()

  if (/every\s*hour|hourly/i.test(lower)) return { cron: '0 * * * *', label: 'Every hour' }
  if (/every\s*(4|four)\s*hours?/i.test(lower)) return { cron: '0 */4 * * *', label: 'Every 4 hours' }
  if (/every\s*(6|six)\s*hours?/i.test(lower)) return { cron: '0 */6 * * *', label: 'Every 6 hours' }
  if (/daily|every\s*day|per\s*day|each\s*day/i.test(lower)) return { cron: '0 9 * * *', label: 'Daily at 9 AM' }
  if (/weekday|monday.?friday|business\s*day/i.test(lower)) return { cron: '0 9 * * 1-5', label: 'Weekdays at 9 AM' }
  if (/weekly|every\s*week|per\s*week/i.test(lower)) return { cron: '0 9 * * 1', label: 'Weekly on Monday' }
  if (/monthly|every\s*month|per\s*month/i.test(lower)) return { cron: '0 9 1 * *', label: 'Monthly on the 1st' }

  return { cron: '0 9 * * *', label: 'Daily at 9 AM' }
}

/**
 * Detect target output count from a user message.
 */
export function detectTargetCount(message: string): number | null {
  const match = message.match(/(\d+)\s*(leads?|contacts?|companies?|records?|items?|results?|prospects?)/i)
  if (match) return parseInt(match[1], 10)
  return null
}

/**
 * Detect destination system from a user message.
 */
export function detectDestination(message: string): { system: string | null; config: Record<string, unknown> } {
  const lower = message.toLowerCase()

  if (/attio/i.test(lower)) {
    const stageMatch = lower.match(/(?:in|to|stage|pipeline)\s+(?:the\s+)?["']?(\w[\w\s]*?)["']?\s*(?:stage|pipeline|$|,|\.|\band\b)/i)
    return {
      system: 'attio',
      config: stageMatch ? { stage: stageMatch[1].trim() } : {},
    }
  }
  if (/hubspot/i.test(lower)) return { system: 'hubspot', config: {} }
  if (/salesforce/i.test(lower)) return { system: 'salesforce', config: {} }
  if (/pipedrive/i.test(lower)) return { system: 'pipedrive', config: {} }
  if (/board/i.test(lower)) return { system: 'board', config: {} }
  if (/spreadsheet|sheet|csv/i.test(lower)) return { system: 'sheets', config: {} }

  return { system: null, config: {} }
}

/**
 * Detect company domain from a user message.
 */
export function detectCompanyDomain(message: string): string | null {
  // Match explicit "my company X.com" or "for X.dev" patterns
  const explicitMatch = message.match(/(?:my|our)\s+(?:company|business|startup|brand|site|website)\s+(?:is\s+)?([a-zA-Z0-9-]+\.[a-z]{2,10})/i)
  if (explicitMatch) return explicitMatch[1].toLowerCase()

  // Match "for X.com" pattern
  const forMatch = message.match(/\bfor\s+([a-zA-Z0-9-]+\.[a-z]{2,10})\b/i)
  if (forMatch) return forMatch[1].toLowerCase()

  // Match standalone domain-like patterns (but not common words like "lead.s")
  const domainMatch = message.match(/\b([a-zA-Z0-9-]{2,}\.(com|dev|io|co|ai|se|net|org|app|xyz|tech|agency|studio))\b/i)
  if (domainMatch) return domainMatch[1].toLowerCase()

  return null
}

/**
 * Detect geography hints from a user message.
 */
export function detectGeography(message: string): string | null {
  const geoPatterns: Array<{ pattern: RegExp; geo: string }> = [
    { pattern: /\bswed(ish|en)\b/i, geo: 'Sweden' },
    { pattern: /\bnorw(egian|ay)\b/i, geo: 'Norway' },
    { pattern: /\bdanish|denmark\b/i, geo: 'Denmark' },
    { pattern: /\bfinn?ish|finland\b/i, geo: 'Finland' },
    { pattern: /\bnordic\b/i, geo: 'Nordics' },
    { pattern: /\beuropean?\b/i, geo: 'Europe' },
    { pattern: /\b(us|usa|united states|american)\b/i, geo: 'United States' },
    { pattern: /\b(uk|united kingdom|british)\b/i, geo: 'United Kingdom' },
    { pattern: /\bgerman(y)?\b/i, geo: 'Germany' },
    { pattern: /\bfrench|france\b/i, geo: 'France' },
    { pattern: /\bcanad(ian|a)\b/i, geo: 'Canada' },
    { pattern: /\baustral(ian|ia)\b/i, geo: 'Australia' },
    { pattern: /\bglobal|worldwide|international\b/i, geo: 'Global' },
  ]
  for (const { pattern, geo } of geoPatterns) {
    if (pattern.test(message)) return geo
  }
  return null
}

/**
 * Build planning metadata: reasons, safe assumptions, uncertain assumptions, missing prerequisites.
 */
export function buildPlanningMeta(message: string, category: OperationCategory, destination: { system: string | null }, companyDomain: string | null, geography: string | null): {
  planning_reason: string
  safe_assumptions: string[]
  uncertain_assumptions: string[]
  missing_prerequisites: string[]
} {
  const planningReasons: string[] = []
  const safe: string[] = []
  const uncertain: string[] = []
  const missing: string[] = []

  if (companyDomain) {
    planningReasons.push('User provided company domain — must analyze before choosing lead criteria')
    missing.push(`Analyze ${companyDomain} to understand what the company does and who their real customers are`)
  }
  if (category === 'lead_generation') {
    planningReasons.push('Lead generation requires ICP understanding before searching')
    if (!companyDomain) {
      uncertain.push('No company context provided — ICP will be generic unless user clarifies')
    }
  }
  if (destination.system) {
    planningReasons.push(`Destination system (${destination.system}) must be connected and verified before writes`)
    missing.push(`Check ${destination.system} connection and discover valid workspace facts`)
  }
  if (geography) {
    safe.push(`Geography: ${geography}`)
  }
  if (/enrich/i.test(message)) {
    safe.push('Enrichment requested — will add firmographics, contacts, and fit scoring')
  }

  return {
    planning_reason: planningReasons.join('; ') || 'Standard operation',
    safe_assumptions: safe,
    uncertain_assumptions: uncertain,
    missing_prerequisites: missing,
  }
}

/**
 * Compile a user message into an Operation Spec draft.
 * This is the core "one instruction → structured contract" compiler.
 */
export function compileOperationDraft(
  userMessage: string,
  userId: string,
  workspaceId: string
): Omit<OperationSpec, 'id' | 'created_at' | 'updated_at' | 'last_run_at' | 'run_count' | 'last_run_summary' | 'checkpoint'> & {
  planning_reason: string
  safe_assumptions: string[]
  uncertain_assumptions: string[]
  missing_prerequisites: string[]
  company_domain: string | null
  geography: string | null
} {
  const category = detectCategory(userMessage)
  const cadence = detectCadence(userMessage)
  const targetCount = detectTargetCount(userMessage)
  const destination = detectDestination(userMessage)
  const stages = DEFAULT_WORKFLOW_STAGES[category] || DEFAULT_WORKFLOW_STAGES.custom
  const companyDomain = detectCompanyDomain(userMessage)
  const geography = detectGeography(userMessage)
  const planningMeta = buildPlanningMeta(userMessage, category, destination, companyDomain, geography)

  const requiredIntegrations: string[] = []
  if (destination.system && destination.system !== 'board' && destination.system !== 'sheets') {
    requiredIntegrations.push(destination.system)
  }

  const filters: Record<string, unknown> = {}
  if (geography) filters.geography = geography
  if (companyDomain) filters.company_domain = companyDomain

  return {
    user_id: userId,
    workspace_id: workspaceId,
    goal: userMessage,
    category,
    status: 'draft',
    cadence: cadence.cron,
    cadence_label: cadence.label,
    timezone: 'UTC',
    target_output_count: targetCount,
    success_metric: targetCount
      ? `${targetCount} verified ${category === 'lead_generation' ? 'leads' : 'items'} per run`
      : null,
    source_channels: category === 'lead_generation' ? ['web_search'] : [],
    filters,
    destination_system: destination.system,
    destination_config: destination.config,
    required_integrations: requiredIntegrations,
    enrichment_schema: [],
    dedupe_policy: 'skip_existing',
    write_policy: 'create_only',
    approval_policy: 'approve_first_run',
    verification_policy: 'verify_all_writes',
    fallback_policy: null,
    workflow_stages: stages,
    agent_id: null,
    mission_id: null,
    recurring_task_id: null,
    // Planning metadata
    company_domain: companyDomain,
    geography,
    ...planningMeta,
  }
}

/**
 * Format an operation spec as a human-readable summary for the AI to present.
 */
export function formatOperationSummary(spec: Record<string, unknown>): string {
  const s = spec as Omit<OperationSpec, 'id' | 'created_at' | 'updated_at' | 'last_run_at' | 'run_count' | 'last_run_summary' | 'checkpoint'> & {
    company_domain?: string | null
    geography?: string | null
    planning_reason?: string
    safe_assumptions?: string[]
    uncertain_assumptions?: string[]
    missing_prerequisites?: string[]
  }
  const lines: string[] = [
    `**Operation:** ${s.goal}`,
    `**Category:** ${s.category.replace(/_/g, ' ')}`,
    `**Schedule:** ${s.cadence_label}`,
  ]

  if (s.target_output_count) {
    lines.push(`**Target:** ${s.target_output_count} items per run`)
  }

  if (s.company_domain) {
    lines.push(`**Company:** ${s.company_domain}`)
  }

  if (s.geography) {
    lines.push(`**Geography:** ${s.geography}`)
  }

  if (s.destination_system) {
    const dest = s.destination_system.charAt(0).toUpperCase() + s.destination_system.slice(1)
    const stageInfo = s.destination_config?.stage ? ` → ${s.destination_config.stage}` : ''
    lines.push(`**Destination:** ${dest}${stageInfo}`)
  }

  if (s.required_integrations && s.required_integrations.length > 0) {
    lines.push(`**Required integrations:** ${s.required_integrations.join(', ')}`)
  }

  lines.push(`**Dedupe:** ${s.dedupe_policy.replace(/_/g, ' ')}`)
  lines.push(`**Verification:** ${s.verification_policy.replace(/_/g, ' ')}`)

  const stageNames = s.workflow_stages.map((st: WorkflowStage) => st.name).join(' → ')
  lines.push(`**Workflow:** ${stageNames}`)

  if (s.missing_prerequisites && s.missing_prerequisites.length > 0) {
    lines.push(`\n**Before execution:**`)
    for (const prereq of s.missing_prerequisites) {
      lines.push(`- ${prereq}`)
    }
  }

  if (s.uncertain_assumptions && s.uncertain_assumptions.length > 0) {
    lines.push(`\n**Needs confirmation:**`)
    for (const ua of s.uncertain_assumptions) {
      lines.push(`- ${ua}`)
    }
  }

  return lines.join('\n')
}
