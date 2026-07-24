/**
 * Memory Curator
 * 
 * AI Manager reviews agent learnings and decides what to keep long-term.
 * This ensures memory quality and prevents bloat.
 * 
 * Also handles cross-agent knowledge sharing - learnings that apply
 * to all agents for a user are shared.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createNonStreamingMessageWithFallback, DEFAULT_MODEL, DEFAULT_FALLBACK_MODELS } from '@/lib/ai/ai-client'
import { 
  getRecentDailyLogs,
  updateMemoryDocument,
  getMemoryDocument,
  appendToMemoryDocument
} from '@/lib/computer-use/structured-memory'

export interface CurationResult {
  agentId: string
  keptLearnings: string[]
  discardedLearnings: string[]
  sharedToUser: string[]
  updatedMemory: boolean
}

export interface SharedKnowledge {
  id: string
  userId: string
  category: 'user_fact' | 'preference' | 'business_context' | 'workflow_pattern'
  content: string
  confidence: number
  sourceAgentId: string
  createdAt: string
  updatedAt: string
}

/**
 * Curate an agent's recent learnings using AI
 * The AI Manager reviews what the agent learned and decides what to keep
 */
export async function curateAgentLearnings(
  agentId: string,
  agentName: string
): Promise<CurationResult> {
  const supabase = createAdminClient()
  
  // Get recent daily logs (last 3 days)
  const recentLogs = await getRecentDailyLogs(agentId, 3)
  
  if (recentLogs.length === 0) {
    return {
      agentId,
      keptLearnings: [],
      discardedLearnings: [],
      sharedToUser: [],
      updatedMemory: false,
    }
  }
  
  // Get current long-term memory
  const currentMemory = await getMemoryDocument(agentId, 'long_term_memory')
  
  // Combine recent logs into a summary
  const logsContent = recentLogs.map(log => 
    `### ${log.log_date}\n${log.content}`
  ).join('\n\n')
  
  // Use AI to curate
  const curationPrompt = `You are reviewing an AI agent's recent activity logs to decide what should be remembered long-term.

AGENT NAME: ${agentName}

CURRENT LONG-TERM MEMORY:
${currentMemory || '(empty)'}

RECENT ACTIVITY LOGS:
${logsContent}

Your task:
1. Identify learnings worth keeping long-term (important patterns, user preferences, key facts)
2. Identify learnings to discard (one-time events, redundant info, outdated data)
3. Identify learnings that should be shared with ALL agents for this user (general user preferences, business context)

Respond in this exact JSON format:
{
  "keep": ["learning 1", "learning 2"],
  "discard": ["reason 1", "reason 2"],
  "shareToUser": ["shared learning 1"],
  "summary": "Brief summary of what was curated"
}`

  try {
    const { response } = await createNonStreamingMessageWithFallback({
      model: DEFAULT_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: curationPrompt }],
    })
    
    const responseText = response.content[0].type === 'text' 
      ? response.content[0].text 
      : ''
    
    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[MemoryCurator] Failed to parse AI response')
      return {
        agentId,
        keptLearnings: [],
        discardedLearnings: [],
        sharedToUser: [],
        updatedMemory: false,
      }
    }
    
    const curation = JSON.parse(jsonMatch[0]) as {
      keep: string[]
      discard: string[]
      shareToUser: string[]
      summary: string
    }
    
    // Update long-term memory with kept learnings
    if (curation.keep.length > 0) {
      for (const learning of curation.keep) {
        await appendToMemoryDocument(agentId, 'long_term_memory', 'Key Learnings', learning)
      }
    }
    
    // Get agent's user_id and workspace_id for sharing
    const { data: agent } = await supabase
      .from('agents')
      .select('user_id, workspace_id')
      .eq('id', agentId)
      .single()
    
    const agentData = agent as { user_id: string; workspace_id: string } | null
    
    // Share learnings to workspace-level knowledge
    if (curation.shareToUser.length > 0 && agentData?.workspace_id) {
      for (const shared of curation.shareToUser) {
        await shareKnowledgeToUser(agentData.user_id, agentData.workspace_id, agentId, shared)
      }
    }
    
    return {
      agentId,
      keptLearnings: curation.keep,
      discardedLearnings: curation.discard,
      sharedToUser: curation.shareToUser,
      updatedMemory: curation.keep.length > 0,
    }
    
  } catch (error) {
    console.error('[MemoryCurator] Error during curation:', error)
    return {
      agentId,
      keptLearnings: [],
      discardedLearnings: [],
      sharedToUser: [],
      updatedMemory: false,
    }
  }
}

/**
 * Share knowledge from one agent to workspace-level (all agents in workspace can access)
 */
export async function shareKnowledgeToUser(
  userId: string,
  workspaceId: string,
  sourceAgentId: string,
  content: string,
  category: SharedKnowledge['category'] = 'user_fact'
): Promise<boolean> {
  const supabase = createAdminClient()
  
  // Check if similar knowledge already exists within the same workspace
  const { data: existing } = await supabase
    .from('user_shared_knowledge')
    .select('id, content')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .ilike('content', `%${content.slice(0, 50)}%`)
    .limit(1)
  
  if (existing && existing.length > 0) {
    // Update confidence if already exists
    await supabase
      .from('user_shared_knowledge')
      .update({
        confidence: 1.0,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', (existing[0] as { id: string }).id)
    return true
  }
  
  // Insert new shared knowledge scoped to workspace
  const { error } = await supabase
    .from('user_shared_knowledge')
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      source_agent_id: sourceAgentId,
      category,
      content,
      confidence: 0.8,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
  
  if (error) {
    console.error('[MemoryCurator] Failed to share knowledge:', error)
    return false
  }
  
  console.log('[MemoryCurator] Shared knowledge to workspace:', content.slice(0, 50))
  return true
}

/**
 * Get all shared knowledge for a user (accessible by all their agents)
 */
interface SharedKnowledgeRow {
  id: string
  user_id: string
  category: string
  content: string
  confidence: number
  source_agent_id: string | null
  created_at: string
  updated_at: string
}

export async function getUserSharedKnowledge(userId: string, workspaceId: string): Promise<SharedKnowledge[]> {
  const supabase = createAdminClient()
  
  const { data, error } = await supabase
    .from('user_shared_knowledge')
    .select('*')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .order('confidence', { ascending: false })
    .limit(20)
  
  if (error) {
    console.error('[MemoryCurator] Failed to get shared knowledge:', error)
    return []
  }
  
  return ((data || []) as SharedKnowledgeRow[]).map(k => ({
    id: k.id,
    userId: k.user_id,
    category: k.category as SharedKnowledge['category'],
    content: k.content,
    confidence: k.confidence,
    sourceAgentId: k.source_agent_id || '',
    createdAt: k.created_at,
    updatedAt: k.updated_at,
  }))
}

/**
 * Format shared knowledge for injection into agent prompt
 */
export function formatSharedKnowledgeForPrompt(knowledge: SharedKnowledge[]): string {
  if (knowledge.length === 0) return ''
  
  const grouped = knowledge.reduce((acc, k) => {
    if (!acc[k.category]) acc[k.category] = []
    acc[k.category].push(k.content)
    return acc
  }, {} as Record<string, string[]>)
  
  let prompt = '\n=== SHARED KNOWLEDGE (from other agents) ===\n'
  
  if (grouped.user_fact) {
    prompt += '\n### About the User\n' + grouped.user_fact.map(f => `- ${f}`).join('\n')
  }
  
  if (grouped.preference) {
    prompt += '\n\n### User Preferences\n' + grouped.preference.map(p => `- ${p}`).join('\n')
  }
  
  if (grouped.business_context) {
    prompt += '\n\n### Business Context\n' + grouped.business_context.map(b => `- ${b}`).join('\n')
  }
  
  if (grouped.workflow_pattern) {
    prompt += '\n\n### Known Patterns\n' + grouped.workflow_pattern.map(w => `- ${w}`).join('\n')
  }
  
  prompt += '\n\nThis knowledge was learned by other agents. Use it to be more helpful.\n'
  
  return prompt
}

/**
 * Run curation for all agents that had activity today
 * Called periodically (e.g., daily) to maintain memory quality
 */
export async function curateAllRecentActivity(): Promise<CurationResult[]> {
  const supabase = createAdminClient()
  
  // Get agents with activity in last 24 hours
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  
  const { data: activeAgents, error } = await supabase
    .from('agent_daily_logs')
    .select('agent_id, agents(name)')
    .gte('log_date', yesterday.toISOString().split('T')[0])
  
  if (error || !activeAgents) {
    console.error('[MemoryCurator] Failed to get active agents:', error)
    return []
  }
  
  const results: CurationResult[] = []
  
  for (const entry of activeAgents) {
    const agentId = (entry as { agent_id: string }).agent_id
    const agentData = (entry as { agents: { name: string } | null }).agents
    const agentName = agentData?.name || 'Unknown Agent'
    
    try {
      const result = await curateAgentLearnings(agentId, agentName)
      results.push(result)
    } catch (error) {
      console.error('[MemoryCurator] Error curating agent:', agentId, error)
    }
  }
  
  return results
}

/**
 * Calculate relevance score for a memory item
 * Used for smarter memory retrieval
 */
export function calculateRelevanceScore(
  memoryContent: string,
  taskDescription: string,
  recency: number // days since last update
): number {
  let score = 0.5 // Base score
  
  // Keyword matching
  const taskWords = taskDescription.toLowerCase().split(/\s+/)
  const memoryWords = memoryContent.toLowerCase().split(/\s+/)
  
  const matchingWords = taskWords.filter(w => 
    memoryWords.some(m => m.includes(w) || w.includes(m))
  )
  
  // Add points for keyword matches
  score += Math.min(matchingWords.length * 0.1, 0.3)
  
  // Recency bonus (newer = more relevant)
  if (recency < 1) score += 0.2
  else if (recency < 7) score += 0.1
  else if (recency > 30) score -= 0.1
  
  // Cap at 0-1
  return Math.max(0, Math.min(1, score))
}

/**
 * Get relevant memories for a task, sorted by relevance
 */
export async function getRelevantMemories(
  agentId: string,
  taskDescription: string,
  limit: number = 10
): Promise<{ content: string; relevance: number }[]> {
  const supabase = createAdminClient()
  
  // Get all memories for this agent
  const { data: memories } = await supabase
    .from('agent_memories')
    .select('content, updated_at')
    .eq('agent_id', agentId)
    .order('updated_at', { ascending: false })
    .limit(50)
  
  if (!memories || memories.length === 0) {
    return []
  }
  
  // Calculate relevance for each memory
  const now = new Date()
  const scored = (memories as { content: string; updated_at: string }[]).map(m => {
    const updatedAt = new Date(m.updated_at)
    const daysSinceUpdate = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24)
    
    return {
      content: m.content,
      relevance: calculateRelevanceScore(m.content, taskDescription, daysSinceUpdate),
    }
  })
  
  // Sort by relevance and return top N
  return scored
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit)
}
