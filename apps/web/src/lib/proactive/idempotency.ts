/**
 * Idempotency System
 * 
 * Ensures cron jobs and background tasks are safe to retry:
 * - Prevents duplicate outreach messages
 * - Prevents duplicate suggestions
 * - Handles concurrent execution
 */

import { createAdminClient } from '@/lib/supabase/server'

export interface IdempotencyKey {
  operation: string
  userId: string
  scope: string // e.g., 'daily', 'hourly', 'per_run'
  date?: string // For daily operations
}

/**
 * Generate idempotency key string
 */
export function generateIdempotencyKey(key: IdempotencyKey): string {
  const date = key.date || new Date().toISOString().split('T')[0]
  return `${key.operation}:${key.userId}:${key.scope}:${date}`
}

/**
 * Check if operation was already performed
 */
export async function checkIdempotency(key: string): Promise<boolean> {
  const supabase = createAdminClient()
  
  const { data } = await supabase
    .from('idempotency_keys')
    .select('id')
    .eq('key', key)
    .single()
  
  return !!data
}

/**
 * Mark operation as performed
 */
export async function markOperationComplete(
  key: string,
  result?: Record<string, unknown>
): Promise<void> {
  const supabase = createAdminClient()
  
  await supabase
    .from('idempotency_keys')
    .upsert({
      key,
      result: result || {},
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    } as never, { onConflict: 'key' })
}

/**
 * Execute operation with idempotency check
 */
export async function withIdempotency<T>(
  key: IdempotencyKey,
  operation: () => Promise<T>
): Promise<{ executed: boolean; result: T | null }> {
  const keyStr = generateIdempotencyKey(key)
  
  // Check if already executed
  const alreadyExecuted = await checkIdempotency(keyStr)
  if (alreadyExecuted) {
    return { executed: false, result: null }
  }
  
  // Execute operation
  const result = await operation()
  
  // Mark as complete
  await markOperationComplete(keyStr, { success: true })
  
  return { executed: true, result }
}

/**
 * Idempotent outreach - max one per user per type per day
 */
export async function canSendOutreach(
  userId: string,
  type: string
): Promise<boolean> {
  const key = generateIdempotencyKey({
    operation: `outreach:${type}`,
    userId,
    scope: 'daily',
  })
  
  return !(await checkIdempotency(key))
}

/**
 * Mark outreach as sent
 */
export async function markOutreachSent(
  userId: string,
  type: string,
  outreachId: string
): Promise<void> {
  const key = generateIdempotencyKey({
    operation: `outreach:${type}`,
    userId,
    scope: 'daily',
  })
  
  await markOperationComplete(key, { outreachId })
}

/**
 * Idempotent suggestion - max one per type per week
 */
export async function canSendSuggestion(
  userId: string,
  suggestionType: string
): Promise<boolean> {
  // Get start of week
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  const weekKey = startOfWeek.toISOString().split('T')[0]
  
  const key = generateIdempotencyKey({
    operation: `suggestion:${suggestionType}`,
    userId,
    scope: 'weekly',
    date: weekKey,
  })
  
  return !(await checkIdempotency(key))
}

/**
 * Mark suggestion as sent
 */
export async function markSuggestionSent(
  userId: string,
  suggestionType: string,
  suggestionId: string
): Promise<void> {
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  const weekKey = startOfWeek.toISOString().split('T')[0]
  
  const key = generateIdempotencyKey({
    operation: `suggestion:${suggestionType}`,
    userId,
    scope: 'weekly',
    date: weekKey,
  })
  
  await markOperationComplete(key, { suggestionId })
}

/**
 * Clean up expired idempotency keys (called by cron)
 */
export async function cleanupExpiredKeys(): Promise<number> {
  const supabase = createAdminClient()
  
  const { data } = await supabase
    .from('idempotency_keys')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id')
  
  return data?.length || 0
}

/**
 * Distributed lock for cron jobs
 */
export async function acquireCronLock(
  cronName: string,
  maxDurationMs: number = 60000
): Promise<{ acquired: boolean; lockId?: string }> {
  const supabase = createAdminClient()
  const lockId = `${cronName}_${Date.now()}`
  const expiresAt = new Date(Date.now() + maxDurationMs).toISOString()
  
  // Try to acquire lock (insert will fail if lock exists and not expired)
  const { data, error } = await supabase
    .from('cron_locks')
    .insert({
      name: cronName,
      lock_id: lockId,
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    } as never)
    .select()
    .single()
  
  if (error) {
    // Check if existing lock is expired
    const { data: existingLock } = await supabase
      .from('cron_locks')
      .select('lock_id, expires_at')
      .eq('name', cronName)
      .single()
    
    if (existingLock) {
      const lock = existingLock as { lock_id: string; expires_at: string }
      if (new Date(lock.expires_at) < new Date()) {
        // Lock expired, try to take over
        const { data: updated } = await supabase
          .from('cron_locks')
          .update({
            lock_id: lockId,
            expires_at: expiresAt,
          } as never)
          .eq('name', cronName)
          .eq('lock_id', lock.lock_id) // Only if still same lock
          .select()
          .single()
        
        if (updated) {
          return { acquired: true, lockId }
        }
      }
    }
    
    return { acquired: false }
  }
  
  return { acquired: true, lockId }
}

/**
 * Release cron lock
 */
export async function releaseCronLock(cronName: string, lockId: string): Promise<void> {
  const supabase = createAdminClient()
  
  await supabase
    .from('cron_locks')
    .delete()
    .eq('name', cronName)
    .eq('lock_id', lockId)
}
