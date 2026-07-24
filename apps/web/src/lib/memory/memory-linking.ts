/**
 * Memory Linking System (A-Mem style)
 * 
 * Implements Zettelkasten-inspired memory notes with:
 * - Automatic keyword/tag extraction
 * - Embedding-based similarity linking
 * - Memory evolution when new info arrives
 * - Dynamic retrieval k based on task complexity
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createNonStreamingMessageWithFallback, DEFAULT_MODEL, DEFAULT_FALLBACK_MODELS } from '@/lib/ai/ai-client'

// Keyword-based embedding: extract meaningful words and hash them into
// a fixed-size vector. This produces proper similarity via dot-product
// because texts sharing keywords will have overlapping non-zero dimensions.
const STOP_WORDS = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','shall','should','may','might','must','can','could','and','but','or','nor','not','no','so','if','then','than','that','this','these','those','it','its','of','in','to','for','with','on','at','by','from','as','into','about','after','before','between','through','during','without','within','i','you','he','she','we','they','me','him','her','us','them','my','your','his','our','their'])

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))
}

function simpleHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

async function generateEmbedding(text: string): Promise<number[]> {
  const DIM = 1536
  const embedding = new Float64Array(DIM)
  const keywords = extractKeywords(text)
  
  // Each keyword activates a set of dimensions based on its hash.
  // Longer (more specific) words get higher weight.
  for (const word of keywords) {
    const weight = Math.min(word.length / 10, 1.0) // longer words = more weight
    const base = simpleHash(word)
    // Activate 3 dimensions per keyword for robustness
    for (let j = 0; j < 3; j++) {
      const dim = (base + j * 7919) % DIM // 7919 is prime for spread
      embedding[dim] += weight
    }
  }
  
  // L2 normalize so cosine similarity works via dot product
  let norm = 0
  for (let i = 0; i < DIM; i++) norm += embedding[i] * embedding[i]
  norm = Math.sqrt(norm) || 1
  
  const result: number[] = new Array(DIM)
  for (let i = 0; i < DIM; i++) result[i] = embedding[i] / norm
  return result
}

// Types
interface MemoryNote {
  id: string
  agent_id: string | null
  user_id: string
  content: string
  keywords: string[]
  tags: string[]
  contextual_description: string | null
  embedding: number[] | null
  importance_score: number
  access_count: number
  last_accessed_at: string | null
  evolved_from: string | null
  evolution_reason: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

interface MemoryLink {
  id: string
  source_note_id: string
  target_note_id: string
  link_type: 'related' | 'contradicts' | 'supports' | 'elaborates' | 'supersedes'
  link_strength: number
  link_reason: string | null
}

interface RetrievalConfig {
  default_k: number
  max_k: number
  min_k: number
  recency_weight: number
  relevance_weight: number
  complexity_scaling: boolean
}

/**
 * Create a new memory note with enriched metadata
 */
export async function createMemoryNote(
  userId: string,
  content: string,
  agentId?: string
): Promise<MemoryNote> {
  const supabase = createAdminClient()
  
  // Extract keywords, tags, and contextual description using LLM
  const { response: enrichmentResponse } = await createNonStreamingMessageWithFallback({
    model: DEFAULT_MODEL,
    max_tokens: 512,
    system: `Extract metadata from the given memory content. Output JSON only.`,
    messages: [{
      role: 'user',
      content: `Extract keywords, tags, and a contextual description from this memory:

"${content}"

Output format (JSON only):
{
  "keywords": ["keyword1", "keyword2", ...],
  "tags": ["category1", "category2", ...],
  "contextual_description": "A rich description that captures the semantic meaning and context",
  "importance_score": 0.5
}

Keywords should be specific nouns/verbs. Tags should be broad categories.
Importance score: 0.0-1.0 based on how important this info seems.`
    }],
  })
  
  let keywords: string[] = []
  let tags: string[] = []
  let contextualDescription = ''
  let importanceScore = 0.5
  
  try {
    const responseText = enrichmentResponse.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')
    
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      keywords = parsed.keywords || []
      tags = parsed.tags || []
      contextualDescription = parsed.contextual_description || ''
      importanceScore = parsed.importance_score || 0.5
    }
  } catch {
    // Use defaults if parsing fails
  }
  
  // Generate embedding
  const embeddingText = `${content}\n${contextualDescription}\n${keywords.join(' ')}`
  const embedding = await generateEmbedding(embeddingText)
  
  // Insert the note
  const { data, error } = await supabase
    .from('memory_notes')
    .insert({
      user_id: userId,
      agent_id: agentId || null,
      content,
      keywords,
      tags,
      contextual_description: contextualDescription,
      embedding: JSON.stringify(embedding),
      importance_score: importanceScore,
    } as never)
    .select('*')
    .single()
  
  if (error) throw error
  
  const note = data as unknown as MemoryNote
  
  // Generate links to existing notes
  await generateLinks(note)
  
  return note
}

/**
 * Generate links from a new note to existing related notes
 */
async function generateLinks(newNote: MemoryNote): Promise<void> {
  const supabase = createAdminClient()
  
  // Find similar notes using embedding similarity
  const { data: similarNotesData } = await supabase
    .rpc('match_memory_notes', {
      query_embedding: newNote.embedding,
      match_threshold: 0.7,
      match_count: 10,
      p_user_id: newNote.user_id,
    } as never)
  
  const similarNotes = similarNotesData as Array<{ id: string; content: string; similarity: number }> | null
  if (!similarNotes || similarNotes.length === 0) return
  
  const typedSimilarNotes = similarNotes
  
  // Use LLM to analyze relationships
  const { response: analysisResponse } = await createNonStreamingMessageWithFallback({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    system: `Analyze relationships between memories. Output JSON array.`,
    messages: [{
      role: 'user',
      content: `New memory: "${newNote.content}"

Potentially related memories:
${typedSimilarNotes.map((n, i) => `${i + 1}. [${n.id}] "${n.content}"`).join('\n')}

For each truly related memory, output a link. Skip if not meaningfully related.
Output format (JSON array):
[
  {
    "target_id": "uuid",
    "link_type": "related|contradicts|supports|elaborates|supersedes",
    "link_strength": 0.5,
    "link_reason": "brief explanation"
  }
]

Link types:
- related: general topical relationship
- contradicts: new info conflicts with old
- supports: new info reinforces old
- elaborates: new info adds detail to old
- supersedes: new info replaces outdated old`
    }],
  })
  
  try {
    const responseText = analysisResponse.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')
    
    const jsonMatch = responseText.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const links = JSON.parse(jsonMatch[0]) as Array<{
        target_id: string
        link_type: string
        link_strength: number
        link_reason: string
      }>
      
      for (const link of links) {
        // Validate target exists
        const targetExists = typedSimilarNotes.some(n => n.id === link.target_id)
        if (!targetExists) continue
        
        await supabase
          .from('memory_links')
          .insert({
            source_note_id: newNote.id,
            target_note_id: link.target_id,
            link_type: link.link_type,
            link_strength: link.link_strength,
            link_reason: link.link_reason,
          } as never)
        
        // If contradicts or supersedes, trigger evolution
        if (link.link_type === 'contradicts' || link.link_type === 'supersedes') {
          await evolveMemory(link.target_id, newNote, link.link_type)
        }
      }
    }
  } catch {
    // Skip link generation if parsing fails
  }
}

/**
 * Evolve an existing memory based on new information
 */
async function evolveMemory(
  targetNoteId: string,
  newNote: MemoryNote,
  relationship: string
): Promise<void> {
  const supabase = createAdminClient()
  
  // Get the target note
  const { data: targetData } = await supabase
    .from('memory_notes')
    .select('*')
    .eq('id', targetNoteId)
    .single()
  
  if (!targetData) return
  const targetNote = targetData as unknown as MemoryNote
  
  // Use LLM to determine evolution
  const { response: evolutionResponse } = await createNonStreamingMessageWithFallback({
    model: DEFAULT_MODEL,
    max_tokens: 512,
    system: `Determine how to evolve an existing memory based on new information.`,
    messages: [{
      role: 'user',
      content: `Existing memory: "${targetNote.content}"
Current keywords: ${JSON.stringify(targetNote.keywords)}
Current tags: ${JSON.stringify(targetNote.tags)}

New information (${relationship}): "${newNote.content}"

Should the existing memory be:
1. DEACTIVATED (new info completely replaces it)
2. UPDATED (merge new context into description)
3. KEPT (just link, don't change)

Output JSON:
{
  "action": "deactivate|update|keep",
  "new_contextual_description": "updated description if action=update",
  "new_keywords": ["updated", "keywords"] or null,
  "reason": "explanation"
}`
    }],
  })
  
  try {
    const responseText = evolutionResponse.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')
    
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const evolution = JSON.parse(jsonMatch[0])
      
      if (evolution.action === 'deactivate') {
        await supabase
          .from('memory_notes')
          .update({ is_active: false } as never)
          .eq('id', targetNoteId)
      } else if (evolution.action === 'update') {
        const updates: Record<string, unknown> = {
          contextual_description: evolution.new_contextual_description,
          updated_at: new Date().toISOString(),
        }
        if (evolution.new_keywords) {
          updates.keywords = evolution.new_keywords
        }
        await supabase
          .from('memory_notes')
          .update(updates as never)
          .eq('id', targetNoteId)
      }
    }
  } catch {
    // Skip evolution if parsing fails
  }
}

/**
 * Retrieve relevant memories with dynamic k
 */
export async function retrieveMemories(
  userId: string,
  query: string,
  options?: {
    agentId?: string
    taskComplexity?: 'low' | 'medium' | 'high'
    includeLinked?: boolean
  }
): Promise<MemoryNote[]> {
  const supabase = createAdminClient()
  
  // Get retrieval config
  const { data: configData } = await supabase
    .from('memory_retrieval_config')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  
  const config: RetrievalConfig = (configData as unknown as RetrievalConfig) || {
    default_k: 15,
    max_k: 50,
    min_k: 5,
    recency_weight: 0.3,
    relevance_weight: 0.7,
    complexity_scaling: true,
  }
  
  // Calculate dynamic k based on complexity
  let k = config.default_k
  if (config.complexity_scaling && options?.taskComplexity) {
    switch (options.taskComplexity) {
      case 'low':
        k = config.min_k
        break
      case 'high':
        k = Math.min(config.max_k, config.default_k * 2)
        break
    }
  }
  
  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query)
  
  // Retrieve similar memories
  const { data: memoriesData } = await supabase
    .rpc('match_memory_notes', {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: k,
      p_user_id: userId,
    } as never)
  
  const memories = memoriesData as unknown as MemoryNote[] | null
  if (!memories || memories.length === 0) return []
  
  let results = memories as unknown as MemoryNote[]
  
  // Update access counts
  const memoryIds = results.map(m => m.id)
  await supabase
    .from('memory_notes')
    .update({
      access_count: supabase.rpc('increment_access_count'),
      last_accessed_at: new Date().toISOString(),
    } as never)
    .in('id', memoryIds)
  
  // Optionally include linked memories
  if (options?.includeLinked) {
    const { data: links } = await supabase
      .from('memory_links')
      .select('target_note_id, link_type, link_strength')
      .in('source_note_id', memoryIds)
      .gte('link_strength', 0.6)
    
    if (links && links.length > 0) {
      const typedLinks = links as Array<{ target_note_id: string; link_type: string; link_strength: number }>
      const linkedIds = typedLinks
        .map(l => l.target_note_id)
        .filter(id => !memoryIds.includes(id))
      
      if (linkedIds.length > 0) {
        const { data: linkedMemories } = await supabase
          .from('memory_notes')
          .select('*')
          .in('id', linkedIds)
          .eq('is_active', true)
        
        if (linkedMemories) {
          results = [...results, ...(linkedMemories as unknown as MemoryNote[])]
        }
      }
    }
  }
  
  return results
}

/**
 * Format memories for injection into prompt
 */
export function formatMemoriesForPrompt(memories: MemoryNote[]): string {
  if (memories.length === 0) return ''
  
  const formatted = memories.map(m => {
    const parts = [`• ${m.content}`]
    if (m.contextual_description) {
      parts.push(`  Context: ${m.contextual_description}`)
    }
    if (m.tags.length > 0) {
      parts.push(`  Tags: ${m.tags.join(', ')}`)
    }
    return parts.join('\n')
  })
  
  return `## Relevant Memories\n${formatted.join('\n\n')}`
}

/**
 * Get or create retrieval config for user
 */
export async function getOrCreateRetrievalConfig(
  userId: string,
  agentId?: string
): Promise<RetrievalConfig> {
  const supabase = createAdminClient()
  
  const { data } = await supabase
    .from('memory_retrieval_config')
    .select('*')
    .eq('user_id', userId)
    .eq('agent_id', agentId as string)
    .maybeSingle()
  
  if (data) {
    return data as unknown as RetrievalConfig
  }
  
  // Create default config
  const defaultConfig: RetrievalConfig = {
    default_k: 15,
    max_k: 50,
    min_k: 5,
    recency_weight: 0.3,
    relevance_weight: 0.7,
    complexity_scaling: true,
  }
  
  await supabase
    .from('memory_retrieval_config')
    .insert({
      user_id: userId,
      agent_id: agentId || null,
      ...defaultConfig,
    } as never)
  
  return defaultConfig
}

/**
 * Estimate task complexity for dynamic k calculation
 */
export async function estimateTaskComplexity(
  taskDescription: string
): Promise<'low' | 'medium' | 'high'> {
  const { response } = await createNonStreamingMessageWithFallback({
    model: DEFAULT_MODEL,
    max_tokens: 64,
    system: 'Rate task complexity. Output only: low, medium, or high',
    messages: [{
      role: 'user',
      content: `Rate complexity (low/medium/high):
"${taskDescription}"

Consider: number of steps, ambiguity, domain knowledge needed, time horizon.`,
    }],
  })

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')
    .toLowerCase()
  
  if (text.includes('high')) return 'high'
  if (text.includes('low')) return 'low'
  return 'medium'
}
