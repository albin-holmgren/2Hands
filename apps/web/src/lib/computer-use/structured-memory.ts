/**
 * Structured Memory System
 * 
 * Inspired by Moltbot's memory architecture:
 * - SOUL: Agent personality and communication style
 * - USER_CONTEXT: Facts about the user/business
 * - LONG_TERM_MEMORY: Curated important memories
 * - WORKSPACE: Agent-specific working notes
 * - Daily logs: Run summaries by date
 * 
 * This makes agents smarter and more personalized over time.
 */

import { createAdminClient } from '@/lib/supabase/admin'

type RpcFn = <T = unknown>(
  fn: string,
  params?: Record<string, unknown>
) => Promise<{ data: T | null; error: { message?: string; code?: string } | null }>

export type MemoryDocumentType = 'soul' | 'user_context' | 'long_term_memory' | 'workspace'

export interface MemoryDocument {
  id: string
  agent_id: string
  document_type: MemoryDocumentType
  content: string
  version: number
  created_at: string
  updated_at: string
}

export interface DailyLog {
  id: string
  agent_id: string
  log_date: string
  content: string
  run_count: number
  insights_count: number
  created_at: string
  updated_at: string
}

export interface StructuredMemoryContext {
  soul: string
  userContext: string
  longTermMemory: string
  workspace: string
  recentDailyLogs: string[]
}

/**
 * Initialize memory documents for a new agent
 * Creates default SOUL, USER_CONTEXT, LONG_TERM_MEMORY, and WORKSPACE documents
 */
export async function initializeAgentMemory(agentId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const rpc = supabase.rpc.bind(supabase) as unknown as RpcFn
  
  try {
    const { error } = await rpc('initialize_agent_memory_documents', {
      p_agent_id: agentId
    })
    
    if (error) {
      console.error('[StructuredMemory] Failed to initialize:', error)
      return false
    }
    
    console.log('[StructuredMemory] Initialized memory documents for agent:', agentId)
    return true
  } catch (error) {
    console.error('[StructuredMemory] Error initializing memory:', error)
    return false
  }
}

/**
 * Get all memory documents for an agent
 */
export async function getAgentMemoryDocuments(
  agentId: string
): Promise<Map<MemoryDocumentType, MemoryDocument>> {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase
    .from('agent_memory_documents')
    .select('*')
    .eq('agent_id', agentId)
  
  if (error) {
    console.error('[StructuredMemory] Failed to get documents:', error)
    return new Map()
  }
  
  const documents = new Map<MemoryDocumentType, MemoryDocument>()
  for (const doc of (data || []) as MemoryDocument[]) {
    documents.set(doc.document_type as MemoryDocumentType, doc)
  }
  
  return documents
}

/**
 * Get a specific memory document
 */
export async function getMemoryDocument(
  agentId: string,
  documentType: MemoryDocumentType
): Promise<string> {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase
    .from('agent_memory_documents')
    .select('content')
    .eq('agent_id', agentId)
    .eq('document_type', documentType)
    .single()
  
  if (error || !data) {
    return ''
  }
  
  return (data as { content: string }).content
}

/**
 * Update a memory document
 */
export async function updateMemoryDocument(
  agentId: string,
  documentType: MemoryDocumentType,
  content: string
): Promise<boolean> {
  const supabase = createAdminClient()
  const rpc = supabase.rpc.bind(supabase) as unknown as RpcFn
  
  try {
    const { error } = await rpc('update_memory_document', {
      p_agent_id: agentId,
      p_document_type: documentType,
      p_content: content
    })
    
    if (error) {
      console.error('[StructuredMemory] Failed to update document:', error)
      return false
    }
    
    return true
  } catch (error) {
    console.error('[StructuredMemory] Error updating document:', error)
    return false
  }
}

/**
 * Append a section to a memory document
 */
export async function appendToMemoryDocument(
  agentId: string,
  documentType: MemoryDocumentType,
  section: string,
  content: string
): Promise<boolean> {
  const currentContent = await getMemoryDocument(agentId, documentType)
  
  // Find the section and append to it, or add at the end
  const sectionHeader = `## ${section}`
  let newContent: string
  
  if (currentContent.includes(sectionHeader)) {
    // Find the next section header or end of document
    const sectionStart = currentContent.indexOf(sectionHeader)
    const afterSection = currentContent.slice(sectionStart + sectionHeader.length)
    const nextSectionMatch = afterSection.match(/\n## /)
    
    if (nextSectionMatch && nextSectionMatch.index !== undefined) {
      // Insert before the next section
      const insertPoint = sectionStart + sectionHeader.length + nextSectionMatch.index
      newContent = 
        currentContent.slice(0, insertPoint) + 
        `\n- ${content}` + 
        currentContent.slice(insertPoint)
    } else {
      // Append at the end of the section (end of document)
      newContent = currentContent + `\n- ${content}`
    }
  } else {
    // Section doesn't exist, add it
    newContent = currentContent + `\n\n## ${section}\n- ${content}`
  }
  
  return updateMemoryDocument(agentId, documentType, newContent)
}

/**
 * Get recent daily logs for an agent
 */
export async function getRecentDailyLogs(
  agentId: string,
  days: number = 3
): Promise<DailyLog[]> {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase
    .from('agent_daily_logs')
    .select('*')
    .eq('agent_id', agentId)
    .order('log_date', { ascending: false })
    .limit(days)
  
  if (error) {
    console.error('[StructuredMemory] Failed to get daily logs:', error)
    return []
  }
  
  return (data || []) as DailyLog[]
}

/**
 * Append an entry to today's daily log
 */
export async function appendToDailyLog(
  agentId: string,
  entry: string,
  isInsight: boolean = false
): Promise<boolean> {
  const supabase = createAdminClient()
  const rpc = supabase.rpc.bind(supabase) as unknown as RpcFn
  
  try {
    const { error } = await rpc('append_agent_daily_log', {
      p_agent_id: agentId,
      p_entry: entry,
      p_is_insight: isInsight
    })
    
    if (error) {
      console.error('[StructuredMemory] Failed to append to daily log:', error)
      return false
    }
    
    return true
  } catch (error) {
    console.error('[StructuredMemory] Error appending to daily log:', error)
    return false
  }
}

/**
 * Build the complete memory context for an agent run
 * This is injected into the agent's system prompt
 */
export async function buildMemoryContext(agentId: string): Promise<StructuredMemoryContext> {
  const [documents, dailyLogs] = await Promise.all([
    getAgentMemoryDocuments(agentId),
    getRecentDailyLogs(agentId, 3)
  ])
  
  return {
    soul: documents.get('soul')?.content || '',
    userContext: documents.get('user_context')?.content || '',
    longTermMemory: documents.get('long_term_memory')?.content || '',
    workspace: documents.get('workspace')?.content || '',
    recentDailyLogs: dailyLogs.map(log => `### ${log.log_date}\n${log.content}`)
  }
}

/**
 * Format memory context for injection into agent prompt
 */
export function formatMemoryContextForPrompt(context: StructuredMemoryContext): string {
  const parts: string[] = []
  
  // Who you are (personality/communication style)
  if (context.soul.trim()) {
    parts.push(`=== WHO YOU ARE ===\n${context.soul}`)
  }
  
  // Who you're helping (user/business context)
  if (context.userContext.trim()) {
    parts.push(`=== WHO YOU'RE HELPING ===\n${context.userContext}`)
  }
  
  // Important memories
  if (context.longTermMemory.trim()) {
    parts.push(`=== IMPORTANT MEMORIES ===\n${context.longTermMemory}`)
  }
  
  // Recent activity
  if (context.recentDailyLogs.length > 0) {
    parts.push(`=== RECENT ACTIVITY ===\n${context.recentDailyLogs.join('\n\n')}`)
  }
  
  // Current workspace
  if (context.workspace.trim()) {
    parts.push(`=== WORKSPACE ===\n${context.workspace}`)
  }
  
  if (parts.length === 0) {
    return ''
  }
  
  return '\n\n' + parts.join('\n\n') + '\n\nUse this context to be more helpful and personalized. Update your memories when you learn something new.\n'
}

/**
 * Learn something new - decide where to store it
 */
export async function learnFromInteraction(
  agentId: string,
  learning: string,
  category: 'user_fact' | 'preference' | 'important' | 'pattern'
): Promise<boolean> {
  switch (category) {
    case 'user_fact':
      return appendToMemoryDocument(agentId, 'user_context', 'About the User', learning)
    case 'preference':
      return appendToMemoryDocument(agentId, 'user_context', 'Preferences', learning)
    case 'important':
      return appendToMemoryDocument(agentId, 'long_term_memory', 'Important Facts', learning)
    case 'pattern':
      return appendToMemoryDocument(agentId, 'long_term_memory', 'Recurring Patterns', learning)
    default:
      return appendToMemoryDocument(agentId, 'long_term_memory', 'Key Learnings', learning)
  }
}

/**
 * Store a run summary with key learnings
 * Called after each agent run to curate memories
 */
export async function storeRunSummary(
  agentId: string,
  summary: string,
  learnings: string[],
  insights: string[]
): Promise<void> {
  // Append to daily log
  const logEntry = [
    `**Run Summary:** ${summary}`,
    learnings.length > 0 ? `**Learnings:**\n${learnings.map(l => `- ${l}`).join('\n')}` : '',
    insights.length > 0 ? `**Insights reported:** ${insights.length}` : ''
  ].filter(Boolean).join('\n')
  
  await appendToDailyLog(agentId, logEntry, insights.length > 0)
  
  // Store significant learnings in long-term memory
  for (const learning of learnings.slice(0, 3)) { // Max 3 per run to avoid bloat
    await appendToMemoryDocument(agentId, 'long_term_memory', 'Key Learnings', learning)
  }
}

/**
 * Update workspace with current focus
 */
export async function updateWorkspaceFocus(
  agentId: string,
  currentFocus: string,
  pendingItems?: string[]
): Promise<boolean> {
  const workspace = await getMemoryDocument(agentId, 'workspace')
  
  // Update Current Focus section
  let newContent = workspace.replace(
    /## Current Focus\n[\s\S]*?(?=\n## |$)/,
    `## Current Focus\n${currentFocus}\n\n`
  )
  
  // Update Pending Items if provided
  if (pendingItems && pendingItems.length > 0) {
    const pendingSection = `## Pending Items\n${pendingItems.map(i => `- [ ] ${i}`).join('\n')}\n\n`
    newContent = newContent.replace(
      /## Pending Items\n[\s\S]*?(?=\n## |$)/,
      pendingSection
    )
  }
  
  return updateMemoryDocument(agentId, 'workspace', newContent)
}
