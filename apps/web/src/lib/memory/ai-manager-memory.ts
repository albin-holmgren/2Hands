/**
 * AI Manager Memory System
 * 
 * Stores important facts/memories from conversations as "memory cards"
 * so the AI doesn't need to load full chat history.
 * 
 * Memory Types:
 * - user_fact: Facts about the user (name, job, location, etc.)
 * - preference: User preferences (communication style, interests)
 * - context: Current context (ongoing projects, focus areas)
 * - topic: Topics they've discussed or care about
 * - request: Past requests (NOT to re-suggest, but to remember)
 * - insight: Important insights or learnings
 */

import { createClient } from '@/lib/supabase/server'
import { createNonStreamingMessageWithFallback, DEFAULT_MODEL } from '@/lib/ai/ai-client'
import { extractResponseText } from '@/lib/ai/response-text'

type RpcFn = <T = unknown>(
  fn: string,
  params?: Record<string, unknown>
) => Promise<{ data: T | null; error: { message?: string; code?: string } | null }>

export type MemoryType = 'user_fact' | 'preference' | 'context' | 'topic' | 'request' | 'insight'
export type MemoryImportance = 'high' | 'medium' | 'low'

export interface AIManagerMemory {
  id: string
  memory_type: MemoryType
  content: string
  importance: MemoryImportance
  reference_count: number
}

/**
 * Store a memory for a user scoped to a workspace
 */
export async function storeMemory(
  userId: string,
  workspaceId: string,
  memoryType: MemoryType,
  content: string,
  importance: MemoryImportance = 'medium',
  source?: string
): Promise<string | null> {
  const supabase = await createClient()
  const rpc = supabase.rpc as unknown as RpcFn
  
  try {
    // Try using RPC function first
    const { data, error } = await rpc<string>('upsert_ai_memory', {
      p_user_id: userId,
      p_workspace_id: workspaceId,
      p_memory_type: memoryType,
      p_content: content,
      p_importance: importance,
      p_source: source || null
    })
    
    if (error) {
      // Fallback: direct insert if RPC doesn't exist yet
      if (error.code === '42883' || error.message?.includes('does not exist') || error.message?.includes('wrong number')) {
        const { data: insertData, error: insertError } = await supabase
          .from('ai_manager_memories')
          .upsert({
            user_id: userId,
            workspace_id: workspaceId,
            memory_type: memoryType,
            content,
            importance,
            source: source || null
          } as never, { onConflict: 'user_id,workspace_id,memory_type,content' })
          .select('id')
          .single()
        
        if (insertError) {
          return null
        }
        return (insertData as { id: string })?.id || null
      }
      return null
    }
    
    return data as string
  } catch (error) {
    return null
  }
}

/**
 * Get all active memories for a user scoped to a workspace
 */
export async function getMemories(
  userId: string,
  workspaceId: string,
  limit: number = 30
): Promise<AIManagerMemory[]> {
  const supabase = await createClient()
  const rpc = supabase.rpc as unknown as RpcFn
  
  try {
    // Try RPC first
    const { data, error } = await rpc<AIManagerMemory[]>('get_ai_memories', {
      p_user_id: userId,
      p_workspace_id: workspaceId,
      p_limit: limit
    })
    
    if (error) {
      // Fallback: direct query if RPC doesn't exist yet
      if (error.code === '42883' || error.message?.includes('does not exist') || error.message?.includes('wrong number')) {
        const { data: queryData, error: queryError } = await supabase
          .from('ai_manager_memories')
          .select('id, memory_type, content, importance, reference_count')
          .eq('user_id', userId)
          .eq('workspace_id', workspaceId)
          .eq('is_active', true)
          .order('importance', { ascending: true })
          .order('reference_count', { ascending: false })
          .limit(limit)
        
        if (queryError) {
          return []
        }
        return (queryData || []) as AIManagerMemory[]
      }
      return []
    }
    
    return (data || []) as AIManagerMemory[]
  } catch (error) {
    return []
  }
}

/**
 * Extract compact labels from memories for UI chips on assistant messages.
 * Returns a de-duped array like [{type: "user_fact", label: "Name: Alex"}, ...]
 */
export function getMemoryLabels(memories: AIManagerMemory[]): Array<{ type: MemoryType; label: string }> {
  if (memories.length === 0) return []
  const TYPE_LABEL: Record<MemoryType, string> = {
    user_fact: 'User',
    preference: 'Preference',
    context: 'Context',
    topic: 'Topic',
    request: 'Request',
    insight: 'Insight',
  }
  // One chip per type (use first memory of each type as representative)
  const seen = new Set<MemoryType>()
  const labels: Array<{ type: MemoryType; label: string }> = []
  for (const m of memories) {
    if (seen.has(m.memory_type)) continue
    seen.add(m.memory_type)
    // Truncate content to a short label
    const short = m.content.length > 40 ? m.content.slice(0, 37) + '…' : m.content
    labels.push({ type: m.memory_type, label: `${TYPE_LABEL[m.memory_type]}: ${short}` })
  }
  return labels
}

/**
 * Format memories for inclusion in system prompt
 */
export function formatMemoriesForPrompt(memories: AIManagerMemory[]): string {
  if (memories.length === 0) {
    return ''
  }
  
  // Group by type
  const grouped: Record<MemoryType, string[]> = {
    user_fact: [],
    preference: [],
    context: [],
    topic: [],
    request: [],
    insight: []
  }
  
  for (const memory of memories) {
    grouped[memory.memory_type].push(memory.content)
  }
  
  const parts: string[] = []
  
  if (grouped.user_fact.length > 0) {
    parts.push(`ABOUT THE USER:\n${grouped.user_fact.map(f => `- ${f}`).join('\n')}`)
  }
  
  if (grouped.preference.length > 0) {
    parts.push(`THEIR PREFERENCES:\n${grouped.preference.map(p => `- ${p}`).join('\n')}`)
  }
  
  if (grouped.context.length > 0) {
    parts.push(`CURRENT CONTEXT:\n${grouped.context.map(c => `- ${c}`).join('\n')}`)
  }
  
  if (grouped.topic.length > 0) {
    parts.push(`TOPICS THEY CARE ABOUT:\n${grouped.topic.map(t => `- ${t}`).join('\n')}`)
  }
  
  if (parts.length === 0) {
    return ''
  }
  
  return `\n=== WHAT YOU KNOW ABOUT THIS USER (use naturally — greet by name, reference their work/goals when relevant) ===\n${parts.join('\n\n')}\n`
}

/**
 * Extract memories from a conversation turn using AI
 * Call this after each assistant response to learn from the conversation
 */
export async function extractMemoriesFromConversation(
  userId: string,
  workspaceId: string,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  // Quick heuristics - skip extraction for very short/trivial messages
  // but always extract identity statements regardless of length
  const identityPattern = /\b(my name|i'?m a|i am a|call me|i work|i live|i'm from|i do|i run|my company|my role|my job|my business|i founded|i manage|i lead)\b/i
  if (userMessage.length < 8 && !identityPattern.test(userMessage)) {
    return
  }
  
  // Use AI to extract memories
  try {
    const { response } = await createNonStreamingMessageWithFallback({
      model: DEFAULT_MODEL,
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Extract important facts to remember from this conversation. Only extract CONCRETE, USEFUL facts - not vague observations.

USER MESSAGE: "${userMessage}"

ASSISTANT RESPONSE: "${assistantResponse.slice(0, 500)}"

Extract memories in this JSON format (empty array if nothing worth remembering):
{
  "memories": [
    {"type": "user_fact|preference|context|topic", "content": "concise fact", "importance": "high|medium|low"}
  ]
}

Rules:
- user_fact: Personal info (name, job, location, interests)
- preference: How they like things done (communication style, detail level)
- context: Current projects, focus, or situation
- topic: Topics they care about or discuss often
- Only include facts explicitly stated or strongly implied
- Keep content concise (under 100 chars)
- Don't extract greetings, small talk, or vague statements
- Max 3 memories per turn`
      }]
    })
    
    const text = extractResponseText(response)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        memories: Array<{ type: MemoryType; content: string; importance: MemoryImportance }>
      }
      
      for (const memory of parsed.memories) {
        if (memory.content && memory.type) {
          await storeMemory(
            userId,
            workspaceId,
            memory.type,
            memory.content,
            memory.importance || 'medium',
            'conversation'
          )
          console.log('[AIManagerMemory] Stored:', memory.type, '-', memory.content.slice(0, 50))
        }
      }
    }
  } catch (error) {
    // Retry once after 2s — memory extraction is non-critical but losing user facts is bad
    console.warn('[AIManagerMemory] Extraction failed, retrying in 2s:', error instanceof Error ? error.message : error)
    try {
      await new Promise(r => setTimeout(r, 2000))
      const { response: retryResponse } = await createNonStreamingMessageWithFallback({
        model: DEFAULT_MODEL,
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `Extract important facts to remember from this conversation. Only extract CONCRETE, USEFUL facts - not vague observations.

USER MESSAGE: "${userMessage}"

ASSISTANT RESPONSE: "${assistantResponse.slice(0, 500)}"

Extract memories in this JSON format (empty array if nothing worth remembering):
{
  "memories": [
    {"type": "user_fact|preference|context|topic", "content": "concise fact", "importance": "high|medium|low"}
  ]
}

Rules:
- user_fact: Personal info (name, job, location, interests)
- preference: How they like things done (communication style, detail level)
- context: Current projects, focus, or situation
- topic: Topics they care about or discuss often
- Only include facts explicitly stated or strongly implied
- Keep content concise (under 100 chars)
- Don't extract greetings, small talk, or vague statements
- Max 3 memories per turn`
        }]
      })
      const retryText = extractResponseText(retryResponse)
      const retryMatch = retryText.match(/\{[\s\S]*\}/)
      if (retryMatch) {
        const parsed = JSON.parse(retryMatch[0]) as {
          memories: Array<{ type: MemoryType; content: string; importance: MemoryImportance }>
        }
        for (const memory of parsed.memories) {
          if (memory.content && memory.type) {
            await storeMemory(userId, workspaceId, memory.type, memory.content, memory.importance || 'medium', 'conversation')
            console.log('[AIManagerMemory] Stored (retry):', memory.type, '-', memory.content.slice(0, 50))
          }
        }
      }
    } catch (retryError) {
      console.error('[AIManagerMemory] Extraction failed after retry:', retryError instanceof Error ? retryError.message : retryError)
    }
  }
}

/**
 * Clean up old/unused memories
 */
export async function cleanupStaleMemories(userId: string): Promise<number> {
  const supabase = await createClient()
  const rpc = supabase.rpc as unknown as RpcFn
  
  try {
    const { data, error } = await rpc<number>('cleanup_stale_ai_memories', {
      p_user_id: userId
    })
    
    if (error) {
      console.error('[AIManagerMemory] Cleanup error:', error)
      return 0
    }
    
    return data as number
  } catch (error) {
    return 0
  }
}
