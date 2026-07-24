/**
 * Agent Memory System
 * 
 * Enables agents to remember context across runs,
 * making them smarter and more personalized over time.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface AgentMemory {
  id: string
  agent_id: string
  memory_type: 'fact' | 'preference' | 'context' | 'interaction' | 'learning'
  content: string
  metadata?: {
    source?: string
    confidence?: number
    created_from_run?: string
    expires_at?: string
  }
  created_at: string
  updated_at: string
}

/**
 * Store a memory for an agent
 */
export async function storeMemory(
  agentId: string,
  memoryType: AgentMemory['memory_type'],
  content: string,
  metadata?: AgentMemory['metadata']
): Promise<{ success: boolean; memoryId?: string }> {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase
    .from('agent_memories')
    .insert({
      agent_id: agentId,
      memory_type: memoryType,
      content,
      metadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .select()
    .single()
  
  if (error) {
    console.error('Failed to store memory:', error)
    return { success: false }
  }
  
  return { success: true, memoryId: (data as { id: string }).id }
}

/**
 * Retrieve relevant memories for an agent
 */
export async function getAgentMemories(
  agentId: string,
  options?: {
    memoryTypes?: AgentMemory['memory_type'][]
    limit?: number
    search?: string
  }
): Promise<AgentMemory[]> {
  const supabase = createAdminClient()
  
  let query = supabase
    .from('agent_memories')
    .select('*')
    .eq('agent_id', agentId)
    .order('updated_at', { ascending: false })
    .limit(options?.limit || 20)
  
  if (options?.memoryTypes && options.memoryTypes.length > 0) {
    query = query.in('memory_type', options.memoryTypes)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('Failed to retrieve memories:', error)
    return []
  }
  
  return (data || []) as AgentMemory[]
}

/**
 * Format memories for inclusion in agent prompt
 */
export function formatMemoriesForPrompt(memories: AgentMemory[]): string {
  if (memories.length === 0) {
    return ''
  }
  
  const grouped = memories.reduce((acc, mem) => {
    if (!acc[mem.memory_type]) {
      acc[mem.memory_type] = []
    }
    acc[mem.memory_type].push(mem.content)
    return acc
  }, {} as Record<string, string[]>)
  
  let prompt = '\n=== YOUR MEMORY ===\n'
  
  if (grouped.fact) {
    prompt += '\nKNOWN FACTS:\n' + grouped.fact.map(f => `- ${f}`).join('\n')
  }
  
  if (grouped.preference) {
    prompt += '\n\nUSER PREFERENCES:\n' + grouped.preference.map(p => `- ${p}`).join('\n')
  }
  
  if (grouped.context) {
    prompt += '\n\nCONTEXT:\n' + grouped.context.map(c => `- ${c}`).join('\n')
  }
  
  if (grouped.learning) {
    prompt += '\n\nLEARNINGS:\n' + grouped.learning.map(l => `- ${l}`).join('\n')
  }
  
  if (grouped.interaction) {
    prompt += '\n\nRECENT INTERACTIONS:\n' + grouped.interaction.slice(0, 5).map(i => `- ${i}`).join('\n')
  }
  
  prompt += '\n\nUse this memory to be more helpful and personalized.\n'
  
  return prompt
}

/**
 * Extract and store learnings from agent run
 */
export async function extractLearnings(
  agentId: string,
  runSummary: string,
  insights: string[]
): Promise<void> {
  // Store key insights as memories
  for (const insight of insights.slice(0, 5)) { // Limit to 5 per run
    await storeMemory(agentId, 'learning', insight, {
      source: 'agent_run',
      created_from_run: new Date().toISOString(),
    })
  }
  
  // Store interaction summary
  if (runSummary) {
    await storeMemory(agentId, 'interaction', runSummary, {
      source: 'run_summary',
      created_from_run: new Date().toISOString(),
    })
  }
}

/**
 * Clean up old memories to manage storage
 */
export async function cleanupOldMemories(
  agentId: string,
  keepCount: number = 50
): Promise<number> {
  const supabase = createAdminClient()
  
  // Get memory count
  const { count } = await supabase
    .from('agent_memories')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', agentId)
  
  if (!count || count <= keepCount) {
    return 0
  }
  
  // Get IDs to delete (oldest memories beyond keepCount)
  const { data: toDelete } = await supabase
    .from('agent_memories')
    .select('id')
    .eq('agent_id', agentId)
    .order('updated_at', { ascending: true })
    .limit(count - keepCount)
  
  if (!toDelete || toDelete.length === 0) {
    return 0
  }
  
  const ids = (toDelete as { id: string }[]).map(m => m.id)
  
  const { error } = await supabase
    .from('agent_memories')
    .delete()
    .in('id', ids)
  
  if (error) {
    console.error('Failed to cleanup memories:', error)
    return 0
  }
  
  return ids.length
}

/**
 * Store a user preference learned from interaction
 */
export async function learnPreference(
  agentId: string,
  preference: string
): Promise<void> {
  await storeMemory(agentId, 'preference', preference, {
    source: 'user_interaction',
    confidence: 0.8,
  })
}

/**
 * Store a fact about the user's business/context
 */
export async function storeFact(
  agentId: string,
  fact: string,
  source?: string
): Promise<void> {
  await storeMemory(agentId, 'fact', fact, {
    source: source || 'learned',
    confidence: 0.9,
  })
}
