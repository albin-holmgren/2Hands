/**
 * Shared Knowledge Layer - Cross-Agent & Cross-User Knowledge Sharing
 * 
 * Key principle: VM sessions are ISOLATED, but knowledge is SHARED.
 * 
 * Three levels of knowledge:
 * 1. Agent-specific memory (what this agent learned)
 * 2. User-level shared knowledge (all agents for this user)
 * 3. Global knowledge (all agents across all users)
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type KnowledgeCategory = 
  | 'ui_change'        // Website UI changed
  | 'rate_limit'       // Service rate limits discovered
  | 'best_practice'    // Effective strategies
  | 'error_solution'   // How to fix common errors
  | 'workflow_tip'     // Workflow optimizations
  | 'credential_hint'  // Login/auth patterns
  | 'timing_pattern'   // Best times to run tasks

export interface GlobalKnowledge {
  id: string
  category: KnowledgeCategory
  service: string | null
  title: string
  content: string
  confidence: number
  timesApplied: number
  timesHelped: number
}

export interface UserKnowledge {
  id: string
  category: string
  content: string
  confidence: number
  sourceAgentId: string | null
}

/**
 * Get global knowledge relevant to a task
 * This knowledge is shared across ALL users and agents
 */
export async function getGlobalKnowledge(
  service?: string,
  category?: KnowledgeCategory,
  limit: number = 15
): Promise<GlobalKnowledge[]> {
  const supabase = createAdminClient()
  
  // Build query with filters
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('global_agent_knowledge')
    .select('*')
    .eq('is_public', true)
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .order('confidence', { ascending: false })
    .order('times_helped', { ascending: false })
    .limit(limit)
  
  if (service) {
    query = query.eq('service', service)
  }
  
  if (category) {
    query = query.eq('category', category)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('[SharedKnowledge] Error fetching global knowledge:', error)
    return []
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((row: any) => ({
    id: row.id,
    category: row.category as KnowledgeCategory,
    service: row.service,
    title: row.title,
    content: row.content,
    confidence: row.confidence,
    timesApplied: row.times_applied,
    timesHelped: row.times_helped,
  }))
}

/**
 * Get user-level shared knowledge
 * This knowledge is shared across all agents for a specific user
 */
export async function getUserSharedKnowledge(
  userId: string,
  limit: number = 20
): Promise<UserKnowledge[]> {
  const supabase = createAdminClient()
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('user_shared_knowledge')
    .select('*')
    .eq('user_id', userId)
    .order('confidence', { ascending: false })
    .order('usage_count', { ascending: false })
    .limit(limit)
  
  if (error) {
    console.error('[SharedKnowledge] Error fetching user knowledge:', error)
    return []
  }
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((row: any) => ({
    id: row.id,
    category: row.category,
    content: row.content,
    confidence: row.confidence,
    sourceAgentId: row.source_agent_id,
  }))
}

/**
 * Contribute new knowledge to the global pool
 * This is called when an agent learns something useful
 */
export async function contributeGlobalKnowledge(
  userId: string,
  agentId: string,
  category: KnowledgeCategory,
  service: string | null,
  title: string,
  content: string
): Promise<string | null> {
  const supabase = createAdminClient()
  
  // Create content hash for deduplication
  const contentHash = await hashContent(category + (service || '') + content)
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('global_agent_knowledge')
    .upsert({
      contributed_by_user_id: userId,
      contributed_by_agent_id: agentId,
      category,
      service,
      title,
      content,
      content_hash: contentHash,
      confidence: 0.6,
    }, {
      onConflict: 'content_hash',
    })
    .select('id')
    .single()
  
  if (error) {
    console.error('[SharedKnowledge] Error contributing global knowledge:', error)
    return null
  }
  
  console.log('[SharedKnowledge] Contributed new global knowledge:', data?.id)
  return data?.id || null
}

/**
 * Record that knowledge was applied (for tracking effectiveness)
 */
export async function recordKnowledgeApplied(
  knowledgeId: string,
  isGlobal: boolean = true
): Promise<void> {
  const supabase = createAdminClient()
  const table = isGlobal ? 'global_agent_knowledge' : 'user_shared_knowledge'
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).rpc('increment_knowledge_applied', { p_id: knowledgeId, p_table: table })
}

/**
 * Record that knowledge helped complete a task
 */
export async function recordKnowledgeHelped(
  knowledgeId: string,
  isGlobal: boolean = true
): Promise<void> {
  const supabase = createAdminClient()
  const table = isGlobal ? 'global_agent_knowledge' : 'user_shared_knowledge'
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).rpc('increment_knowledge_helped', { p_id: knowledgeId, p_table: table })
}

/**
 * Record that knowledge failed to help (or caused issues)
 */
export async function recordKnowledgeFailed(
  knowledgeId: string,
  isGlobal: boolean = true
): Promise<void> {
  if (!isGlobal) return
  
  const supabase = createAdminClient()
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).rpc('increment_knowledge_failed', { p_id: knowledgeId })
}

/**
 * Format global knowledge for injection into agent prompt
 */
export function formatGlobalKnowledgeForPrompt(knowledge: GlobalKnowledge[]): string {
  if (knowledge.length === 0) return ''
  
  const lines = ['## Shared Knowledge from Other Agents', '']
  
  for (const k of knowledge) {
    const serviceTag = k.service ? ` [${k.service}]` : ''
    const confidenceTag = k.confidence >= 0.8 ? '✓ Verified' : k.confidence >= 0.6 ? 'Likely' : 'Tentative'
    lines.push(`### ${k.title}${serviceTag} (${confidenceTag})`)
    lines.push(k.content)
    lines.push('')
  }
  
  return lines.join('\n')
}

/**
 * Format user knowledge for injection into agent prompt
 */
export function formatUserKnowledgeForPrompt(knowledge: UserKnowledge[]): string {
  if (knowledge.length === 0) return ''
  
  const lines = ['## Knowledge Shared by Your Other Agents', '']
  
  const byCategory = new Map<string, UserKnowledge[]>()
  for (const k of knowledge) {
    const list = byCategory.get(k.category) || []
    list.push(k)
    byCategory.set(k.category, list)
  }
  
  for (const [category, items] of byCategory) {
    lines.push(`### ${formatCategory(category)}`)
    for (const item of items) {
      lines.push(`- ${item.content}`)
    }
    lines.push('')
  }
  
  return lines.join('\n')
}

/**
 * Get all relevant knowledge for an agent task
 */
export async function getRelevantKnowledge(
  userId: string,
  taskDescription: string,
  detectedServices: string[] = []
): Promise<{
  global: GlobalKnowledge[]
  user: UserKnowledge[]
}> {
  // Fetch global knowledge for detected services
  const globalKnowledge: GlobalKnowledge[] = []
  
  // Always get general best practices
  const generalKnowledge = await getGlobalKnowledge(undefined, 'best_practice', 5)
  globalKnowledge.push(...generalKnowledge)
  
  // Get service-specific knowledge
  for (const service of detectedServices) {
    const serviceKnowledge = await getGlobalKnowledge(service, undefined, 5)
    globalKnowledge.push(...serviceKnowledge)
  }
  
  // Dedupe by ID
  const uniqueGlobal = Array.from(new Map(globalKnowledge.map(k => [k.id, k])).values())
  
  // Get user-level knowledge
  const userKnowledge = await getUserSharedKnowledge(userId, 15)
  
  return {
    global: uniqueGlobal.slice(0, 15),
    user: userKnowledge,
  }
}

/**
 * Detect services mentioned in a task
 */
export function detectServicesInTask(taskDescription: string): string[] {
  const services: string[] = []
  const lowerTask = taskDescription.toLowerCase()
  
  const servicePatterns: [string, RegExp][] = [
    ['amazon', /amazon|amzn/i],
    ['google', /google|gmail|gdrive|docs|sheets/i],
    ['linkedin', /linkedin/i],
    ['twitter', /twitter|x\.com/i],
    ['facebook', /facebook|fb|meta/i],
    ['instagram', /instagram|ig/i],
    ['shopify', /shopify/i],
    ['salesforce', /salesforce|sfdc/i],
    ['hubspot', /hubspot/i],
    ['slack', /slack/i],
    ['notion', /notion/i],
    ['github', /github/i],
    ['stripe', /stripe/i],
    ['quickbooks', /quickbooks|qb/i],
    ['zoom', /zoom/i],
  ]
  
  for (const [service, pattern] of servicePatterns) {
    if (pattern.test(lowerTask)) {
      services.push(service)
    }
  }
  
  return services
}

// Helper functions
function formatCategory(category: string): string {
  return category
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}
