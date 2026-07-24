/**
 * Distributed-first rate limiter for API routes.
 * Uses Upstash Redis when configured, falls back to in-memory limiter in local/dev.
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

interface RateLimitEntry {
  count: number
  resetAt: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()
let upstashRedisClient: Redis | null = null
const distributedLimiterCache = new Map<string, Ratelimit>()
let loggedDistributedLimiterFallback = false

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key)
    }
  }
}, 60000) // Clean every minute

interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  limit: number
  /** Window duration in seconds */
  windowSeconds: number
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

function getUpstashRedisClient(): Redis | null {
  const redisUrl = (process.env.UPSTASH_REDIS_URL || '').trim()
  const redisToken = (process.env.UPSTASH_REDIS_TOKEN || '').trim()

  if (!redisUrl || !redisToken) {
    return null
  }

  if (!upstashRedisClient) {
    upstashRedisClient = Redis.fromEnv()
  }

  return upstashRedisClient
}

function getDistributedLimiter(config: RateLimitConfig): Ratelimit | null {
  const redis = getUpstashRedisClient()
  if (!redis) return null

  const cacheKey = `${config.limit}:${config.windowSeconds}`
  const cached = distributedLimiterCache.get(cacheKey)
  if (cached) return cached

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.limit, `${config.windowSeconds} s`),
    analytics: false,
    prefix: '2hands:rate_limit',
  })

  distributedLimiterCache.set(cacheKey, limiter)
  return limiter
}

function checkRateLimitInMemory(identifier: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  const windowMs = config.windowSeconds * 1000
  const key = identifier

  const entry = rateLimitStore.get(key)

  // No existing entry or expired
  if (!entry || entry.resetAt < now) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + windowMs,
    }
    rateLimitStore.set(key, newEntry)
    return {
      allowed: true,
      remaining: config.limit - 1,
      resetAt: newEntry.resetAt,
    }
  }

  // Entry exists and not expired
  if (entry.count >= config.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    }
  }

  // Increment count
  entry.count++
  return {
    allowed: true,
    remaining: config.limit - entry.count,
    resetAt: entry.resetAt,
  }
}

/**
 * Check if a request is allowed based on rate limits
 */
export async function checkRateLimit(
  identifier: string, 
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const distributedLimiter = getDistributedLimiter(config)

  if (!distributedLimiter) {
    return checkRateLimitInMemory(identifier, config)
  }

  try {
    const result = await distributedLimiter.limit(identifier)
    return {
      allowed: result.success,
      remaining: Math.max(0, result.remaining),
      resetAt: typeof result.reset === 'number'
        ? result.reset
        : Date.now() + config.windowSeconds * 1000,
    }
  } catch (error) {
    if (!loggedDistributedLimiterFallback) {
      loggedDistributedLimiterFallback = true
      console.warn('[RateLimit] Upstash limiter unavailable, falling back to in-memory limiter:', error)
    }
    return checkRateLimitInMemory(identifier, config)
  }
}

/**
 * Rate limit configurations for different API endpoints
 */
export const RATE_LIMITS = {
  // Stripe checkout - prevent abuse
  checkout: { limit: 10, windowSeconds: 60 },
  
  // Agent creation - moderate limit
  createAgent: { limit: 20, windowSeconds: 60 },
  
  // Agent provisioning - stricter limit (expensive operation)
  provisionAgent: { limit: 5, windowSeconds: 60 },

  // Agent run trigger - strict enough to prevent burst abuse
  runAgent: { limit: 10, windowSeconds: 60 },
  
  // Chat messages - generous limit for normal usage
  chatMessage: { limit: 60, windowSeconds: 60 },

  // Integrations: tool execution can be expensive
  integrationsToolExecute: { limit: 30, windowSeconds: 60 },

  // OAuth connect endpoints
  oauthConnect: { limit: 10, windowSeconds: 60 },
  
  // General API - default fallback
  general: { limit: 100, windowSeconds: 60 },
} as const

/**
 * Create a rate limit key for a user + endpoint combination
 */
export function createRateLimitKey(userId: string, endpoint: string): string {
  return `${userId}:${endpoint}`
}
