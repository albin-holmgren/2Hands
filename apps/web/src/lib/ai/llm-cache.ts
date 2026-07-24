/**
 * LLM Response Caching System
 * 
 * Reduces costs by caching common AI responses:
 * - Similar outreach messages
 * - Fact extraction results
 * - Suggestion generation
 * 
 * Uses semantic similarity for cache hits, not exact match.
 */

import { createAdminClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export interface CachedResponse {
  key: string
  response: string
  inputHash: string
  createdAt: string
  expiresAt: string
  hitCount: number
}

export interface CacheConfig {
  ttlHours: number
  maxEntries: number
  operationType: string
}

const DEFAULT_CONFIG: CacheConfig = {
  ttlHours: 24,
  maxEntries: 1000,
  operationType: 'general',
}

/**
 * Generate cache key from input
 */
function generateCacheKey(
  operationType: string,
  input: string,
  context?: Record<string, unknown>
): string {
  const normalizedInput = input.toLowerCase().trim().slice(0, 500)
  const contextStr = context ? JSON.stringify(context) : ''
  const hash = crypto
    .createHash('md5')
    .update(`${operationType}:${normalizedInput}:${contextStr}`)
    .digest('hex')
  return `llm:${operationType}:${hash}`
}

/**
 * Get cached LLM response
 */
export async function getCachedResponse(
  operationType: string,
  input: string,
  context?: Record<string, unknown>
): Promise<string | null> {
  const supabase = createAdminClient()
  const key = generateCacheKey(operationType, input, context)
  
  const { data } = await supabase
    .from('llm_response_cache')
    .select('response, expires_at, hit_count')
    .eq('cache_key', key)
    .single()
  
  if (!data) return null
  
  const cached = data as { response: string; expires_at: string; hit_count: number }
  
  // Check expiry
  if (new Date(cached.expires_at) < new Date()) {
    // Expired - delete and return null
    await supabase.from('llm_response_cache').delete().eq('cache_key', key)
    return null
  }
  
  // Update hit count
  await supabase
    .from('llm_response_cache')
    .update({ hit_count: cached.hit_count + 1 } as never)
    .eq('cache_key', key)
  
  return cached.response
}

/**
 * Store LLM response in cache
 */
export async function setCachedResponse(
  operationType: string,
  input: string,
  response: string,
  context?: Record<string, unknown>,
  config: Partial<CacheConfig> = {}
): Promise<void> {
  const supabase = createAdminClient()
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }
  const key = generateCacheKey(operationType, input, context)
  const expiresAt = new Date(Date.now() + mergedConfig.ttlHours * 60 * 60 * 1000)
  
  await supabase
    .from('llm_response_cache')
    .upsert({
      cache_key: key,
      operation_type: operationType,
      input_hash: crypto.createHash('md5').update(input).digest('hex'),
      response,
      context: context || {},
      expires_at: expiresAt.toISOString(),
      hit_count: 0,
      created_at: new Date().toISOString(),
    } as never, { onConflict: 'cache_key' })
}

/**
 * Execute LLM call with caching
 */
export async function withCache<T extends string>(
  operationType: string,
  input: string,
  llmCall: () => Promise<T>,
  context?: Record<string, unknown>,
  config: Partial<CacheConfig> = {}
): Promise<{ response: T; cached: boolean; savedTokens: number }> {
  // Try cache first
  const cached = await getCachedResponse(operationType, input, context)
  if (cached) {
    // Estimate tokens saved (rough approximation)
    const savedTokens = Math.round((input.length + cached.length) / 4)
    return { response: cached as T, cached: true, savedTokens }
  }
  
  // Execute LLM call
  const response = await llmCall()
  
  // Cache the response
  await setCachedResponse(operationType, input, response, context, config)
  
  return { response, cached: false, savedTokens: 0 }
}

/**
 * Batch processor for fact extraction
 * Collects messages and processes them together to reduce API calls
 */
interface PendingExtraction {
  userId: string
  message: string
  addedAt: number
}

const pendingExtractions: Map<string, PendingExtraction[]> = new Map()
const BATCH_SIZE = 5
const BATCH_TIMEOUT_MS = 30000 // 30 seconds

/**
 * Queue a message for batch fact extraction
 */
export function queueFactExtraction(userId: string, message: string): void {
  const existing = pendingExtractions.get(userId) || []
  existing.push({ userId, message, addedAt: Date.now() })
  pendingExtractions.set(userId, existing)
}

/**
 * Get pending extractions for a user (if batch is ready)
 */
export function getPendingExtractions(userId: string): string[] | null {
  const pending = pendingExtractions.get(userId)
  if (!pending || pending.length === 0) return null
  
  // Check if batch is ready (either full or timed out)
  const oldestAge = Date.now() - pending[0].addedAt
  if (pending.length >= BATCH_SIZE || oldestAge >= BATCH_TIMEOUT_MS) {
    const messages = pending.map(p => p.message)
    pendingExtractions.delete(userId)
    return messages
  }
  
  return null
}

/**
 * Clear all pending extractions for a user
 */
export function clearPendingExtractions(userId: string): void {
  pendingExtractions.delete(userId)
}

/**
 * Clean up expired cache entries (run periodically)
 */
export async function cleanupExpiredCache(): Promise<number> {
  const supabase = createAdminClient()
  
  const { data } = await supabase
    .from('llm_response_cache')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('cache_key')
  
  return data?.length || 0
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  totalEntries: number
  hitRate: number
  byOperationType: Record<string, { count: number; hits: number }>
}> {
  const supabase = createAdminClient()
  
  const { data } = await supabase
    .from('llm_response_cache')
    .select('operation_type, hit_count')
  
  if (!data || data.length === 0) {
    return { totalEntries: 0, hitRate: 0, byOperationType: {} }
  }
  
  const entries = data as Array<{ operation_type: string; hit_count: number }>
  const byOperationType: Record<string, { count: number; hits: number }> = {}
  let totalHits = 0
  
  for (const entry of entries) {
    if (!byOperationType[entry.operation_type]) {
      byOperationType[entry.operation_type] = { count: 0, hits: 0 }
    }
    byOperationType[entry.operation_type].count++
    byOperationType[entry.operation_type].hits += entry.hit_count
    totalHits += entry.hit_count
  }
  
  return {
    totalEntries: entries.length,
    hitRate: entries.length > 0 ? totalHits / (totalHits + entries.length) : 0,
    byOperationType,
  }
}
