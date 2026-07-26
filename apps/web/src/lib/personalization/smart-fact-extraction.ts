/**
 * LLM-based Smart Fact Extraction
 * 
 * Uses AI to extract facts from user messages with:
 * - Confidence scoring
 * - Contradiction detection
 * - Natural confirmation flow
 * 
 * Much better than regex - understands context and nuance.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { withCache, queueFactExtraction, getPendingExtractions } from '@/lib/ai/llm-cache'
import { createNonStreamingMessageWithFallback, DEFAULT_MODEL } from '@/lib/ai/ai-client'
import { extractResponseText } from '@/lib/ai/response-text'

export interface ExtractedFact {
  fact: string
  category: 'personal' | 'work' | 'preference' | 'goal' | 'challenge' | 'behavior'
  confidence: number // 0-1
  needsConfirmation: boolean
  relatedTo?: string // If this updates/contradicts an existing fact
}

export interface FactExtractionResult {
  facts: ExtractedFact[]
  tokensUsed: number
  costUsd: number
}

/**
 * Extract facts from a user message using LLM
 */
export async function extractFactsWithAI(
  userId: string,
  message: string,
  conversationContext?: string
): Promise<FactExtractionResult> {
  // Skip very short messages
  if (message.length < 20) {
    return { facts: [], tokensUsed: 0, costUsd: 0 }
  }
  
  // Get existing facts to detect contradictions
  const existingFacts = await getExistingFacts(userId)
  const existingFactsStr = existingFacts.length > 0
    ? `\nExisting facts about user:\n${existingFacts.map(f => `- ${f.fact} (${f.category})`).join('\n')}`
    : ''
  
  const prompt = `Analyze this user message and extract any facts we can learn about them.

User message: "${message}"
${conversationContext ? `\nConversation context: ${conversationContext}` : ''}
${existingFactsStr}

Extract facts in these categories:
- personal: name, location, family, hobbies
- work: job, company, industry, role
- preference: communication style, likes/dislikes
- goal: what they want to achieve
- challenge: problems they face
- behavior: how they work, patterns

For each fact:
- Assign confidence 0-1 (1 = explicitly stated, 0.5 = implied, lower = uncertain)
- Flag if it needs confirmation (low confidence or could be misunderstood)
- Note if it contradicts an existing fact

Respond in JSON format:
{
  "facts": [
    {
      "fact": "Works as a marketing manager",
      "category": "work",
      "confidence": 0.9,
      "needsConfirmation": false,
      "relatedTo": null
    }
  ]
}

If no facts can be extracted, return {"facts": []}.
Be conservative - only extract facts you're reasonably confident about.`

  try {
    // Use caching to avoid repeated extractions for similar messages
    const { response: cachedOrNew, cached, savedTokens } = await withCache(
      'fact_extraction',
      message,
      async () => {
        const { response } = await createNonStreamingMessageWithFallback({
          model: DEFAULT_MODEL,
          max_tokens: 500,
          messages: [{ role: 'user', content: prompt }],
        })
        
        const text = extractResponseText(response)
        if (!text) {
          return JSON.stringify({ facts: [], inputTokens: 0, outputTokens: 0 })
        }

        return JSON.stringify({
          text,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        })
      },
      { userId },
      { ttlHours: 48 } // Cache for 48 hours
    )
    
    if (cached) {
      console.log(`[FactExtraction] Cache hit! Saved ~${savedTokens} tokens`)
    }
    
    const parsedResponse = JSON.parse(cachedOrNew)
    
    if (!parsedResponse.text) {
      return { facts: [], tokensUsed: 0, costUsd: 0 }
    }
    
    // Parse JSON response
    const jsonMatch = parsedResponse.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { facts: [], tokensUsed: 0, costUsd: 0 }
    }
    
    const parsed = JSON.parse(jsonMatch[0])
    const facts = (parsed.facts || []) as ExtractedFact[]
    
    // Calculate cost (Haiku pricing) - 0 if cached
    const inputTokens = cached ? 0 : (parsedResponse.inputTokens || 0)
    const outputTokens = cached ? 0 : (parsedResponse.outputTokens || 0)
    const costUsd = (inputTokens * 0.001 + outputTokens * 0.005) / 1000
    
    // Log usage
    await logAIUsage(userId, null, DEFAULT_MODEL, inputTokens, outputTokens, 'fact_extraction')
    
    return {
      facts,
      tokensUsed: inputTokens + outputTokens,
      costUsd,
    }
  } catch (error) {
    console.error('[FactExtraction] Error:', error)
    return { facts: [], tokensUsed: 0, costUsd: 0 }
  }
}

/**
 * Store extracted facts in database
 */
export async function storeExtractedFacts(
  userId: string,
  facts: ExtractedFact[]
): Promise<void> {
  if (facts.length === 0) return
  
  const supabase = createAdminClient()
  
  for (const fact of facts) {
    // Check for contradictions
    if (fact.relatedTo) {
      await handleContradiction(userId, fact)
    }
    
    // Check for duplicates
    const isDuplicate = await checkDuplicateFact(userId, fact.fact)
    if (isDuplicate) continue
    
    // Insert new fact
    await supabase
      .from('learned_facts')
      .insert({
        user_id: userId,
        fact: fact.fact,
        category: fact.category,
        confidence: fact.confidence,
        source: 'ai_extraction',
        needs_confirmation: fact.needsConfirmation,
        created_at: new Date().toISOString(),
      } as never)
  }
}

/**
 * Handle contradiction with existing fact
 */
async function handleContradiction(userId: string, newFact: ExtractedFact): Promise<void> {
  const supabase = createAdminClient()
  
  // Find the contradicted fact
  const { data: existingFact } = await supabase
    .from('learned_facts')
    .select('id, fact, confidence')
    .eq('user_id', userId)
    .ilike('fact', `%${newFact.relatedTo}%`)
    .limit(1)
    .single()
  
  if (!existingFact) return
  
  const existing = existingFact as { id: string; fact: string; confidence: number }
  
  // If new fact has higher confidence, mark old as contradicted
  if (newFact.confidence > existing.confidence) {
    await supabase
      .from('learned_facts')
      .update({ contradicted_by: newFact.relatedTo } as never)
      .eq('id', existing.id)
  }
}

/**
 * Check if a similar fact already exists
 */
async function checkDuplicateFact(userId: string, fact: string): Promise<boolean> {
  const supabase = createAdminClient()
  
  // Simple check - in production would use embedding similarity
  const { data } = await supabase
    .from('learned_facts')
    .select('id')
    .eq('user_id', userId)
    .ilike('fact', `%${fact.slice(0, 50)}%`)
    .limit(1)
  
  return (data?.length || 0) > 0
}

/**
 * Get existing facts for a user
 */
async function getExistingFacts(userId: string): Promise<Array<{ fact: string; category: string }>> {
  const supabase = createAdminClient()
  
  const { data } = await supabase
    .from('learned_facts')
    .select('fact, category')
    .eq('user_id', userId)
    .is('contradicted_by', null)
    .order('confidence', { ascending: false })
    .limit(20)
  
  return (data || []) as Array<{ fact: string; category: string }>
}

/**
 * Get facts that need confirmation
 */
export async function getFactsNeedingConfirmation(userId: string): Promise<Array<{
  id: string
  fact: string
  category: string
}>> {
  const supabase = createAdminClient()
  
  const { data } = await supabase
    .from('learned_facts')
    .select('id, fact, category')
    .eq('user_id', userId)
    .eq('needs_confirmation', true)
    .is('confirmed_at', null)
    .limit(3)
  
  return (data || []) as Array<{ id: string; fact: string; category: string }>
}

/**
 * Confirm a learned fact
 */
export async function confirmFact(factId: string, confirmed: boolean): Promise<void> {
  const supabase = createAdminClient()
  
  if (confirmed) {
    await supabase
      .from('learned_facts')
      .update({
        needs_confirmation: false,
        confirmed_at: new Date().toISOString(),
        confidence: 1.0, // Max confidence for confirmed facts
        source: 'user_confirmed',
      } as never)
      .eq('id', factId)
  } else {
    // Delete if user says it's wrong
    await supabase
      .from('learned_facts')
      .delete()
      .eq('id', factId)
  }
}

/**
 * Generate a natural confirmation question for a fact
 */
export function generateConfirmationQuestion(fact: { fact: string; category: string }): string {
  const questions: Record<string, (f: string) => string> = {
    personal: (f) => `Quick check: Is it correct that ${f.toLowerCase()}?`,
    work: (f) => `Just to make sure I have this right - ${f.toLowerCase()}?`,
    preference: (f) => `I noticed you might ${f.toLowerCase()} - did I get that right?`,
    goal: (f) => `I picked up that you're trying to ${f.toLowerCase()} - is that accurate?`,
    challenge: (f) => `I understand you're dealing with ${f.toLowerCase()} - correct?`,
    behavior: (f) => `It seems like you ${f.toLowerCase()} - am I reading that right?`,
  }
  
  const generator = questions[fact.category] || questions.personal
  return generator(fact.fact)
}

/**
 * Log AI usage for observability
 */
async function logAIUsage(
  userId: string,
  agentId: string | null,
  model: string,
  inputTokens: number,
  outputTokens: number,
  operationType: string
): Promise<void> {
  const supabase = createAdminClient()
  
  // Calculate cost
  const costUsd = model.includes('haiku')
    ? (inputTokens * 0.001 + outputTokens * 0.005) / 1000
    : (inputTokens * 0.003 + outputTokens * 0.015) / 1000
  
  await supabase
    .from('ai_usage_logs')
    .insert({
      user_id: userId,
      agent_id: agentId,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: costUsd,
      operation_type: operationType,
      created_at: new Date().toISOString(),
    } as never)
}

/**
 * Get high-confidence facts for AI Manager context
 */
export async function getConfirmedFacts(userId: string): Promise<string[]> {
  const supabase = createAdminClient()
  
  const { data } = await supabase
    .from('learned_facts')
    .select('fact')
    .eq('user_id', userId)
    .gte('confidence', 0.7)
    .is('contradicted_by', null)
    .order('confidence', { ascending: false })
    .limit(15)
  
  return (data || []).map((d: { fact: string }) => d.fact)
}
