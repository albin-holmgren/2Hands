import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

interface RateLimitConfig {
  windowMs: number      // Time window in milliseconds
  maxRequests: number   // Max requests per window
  identifier?: (req: NextRequest) => string  // Custom identifier function
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

  const cacheKey = `${config.maxRequests}:${config.windowMs}`
  const cached = distributedLimiterCache.get(cacheKey)
  if (cached) return cached

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.maxRequests, `${Math.max(1, Math.ceil(config.windowMs / 1000))} s`),
    analytics: false,
    prefix: '2hands:security_rate_limit',
  })

  distributedLimiterCache.set(cacheKey, limiter)
  return limiter
}

interface RateLimitEntry {
  count: number
  resetTime: number
}

// In-memory store for rate limiting
// In production, consider using Redis for distributed rate limiting
const rateLimitStore = new Map<string, RateLimitEntry>()
let upstashRedisClient: Redis | null = null
const distributedLimiterCache = new Map<string, Ratelimit>()
let loggedDistributedLimiterFallback = false

// Clean up expired entries periodically
const CLEANUP_INTERVAL = 60000 // 1 minute
let lastCleanup = Date.now()

function cleanupExpiredEntries(): void {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  
  lastCleanup = now
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key)
    }
  }
}

/**
 * Get client identifier from request
 * Uses X-Forwarded-For header (for proxied requests) or falls back to a hash
 */
function getDefaultIdentifier(req: NextRequest): string {
  // Try to get real IP from common headers
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }
  
  const realIp = req.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }
  
  // Fallback to a combination of user-agent and accept-language
  // Not perfect but better than nothing for serverless environments
  const ua = req.headers.get('user-agent') || 'unknown'
  const lang = req.headers.get('accept-language') || 'unknown'
  return `${ua.slice(0, 50)}-${lang.slice(0, 20)}`
}

/**
 * Check rate limit for a request
 * Returns null if allowed, or a NextResponse if rate limited
 */
export async function checkRateLimit(
  req: NextRequest,
  endpoint: string,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  cleanupExpiredEntries()
  
  const identifier = config.identifier 
    ? config.identifier(req) 
    : getDefaultIdentifier(req)
  
  const key = `${endpoint}:${identifier}`
  const now = Date.now()

  const distributedLimiter = getDistributedLimiter(config)
  if (distributedLimiter) {
    try {
      const result = await distributedLimiter.limit(key)
      if (!result.success) {
        const retryAfter = Math.max(1, Math.ceil((result.reset - now) / 1000))
        return NextResponse.json(
          { error: 'Too many requests', retryAfter },
          {
            status: 429,
            headers: {
              'Retry-After': retryAfter.toString(),
              'X-RateLimit-Limit': config.maxRequests.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': Math.ceil(result.reset / 1000).toString(),
            },
          }
        )
      }
      return null
    } catch (error) {
      if (!loggedDistributedLimiterFallback) {
        loggedDistributedLimiterFallback = true
        console.warn('[SecurityRateLimit] Upstash limiter unavailable, falling back to in-memory limiter:', error)
      }
    }
  }
  
  const entry = rateLimitStore.get(key)
  
  if (!entry || now > entry.resetTime) {
    // New window
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    })
    return null
  }
  
  if (entry.count >= config.maxRequests) {
    // Rate limited
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000)
    return NextResponse.json(
      { error: 'Too many requests', retryAfter },
      { 
        status: 429,
        headers: {
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': config.maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Math.ceil(entry.resetTime / 1000).toString(),
        }
      }
    )
  }
  
  // Increment count
  entry.count++
  return null
}

/**
 * Rate limit configurations for different endpoints
 */
export const RATE_LIMITS = {
  // Webhook: 100 requests per minute (Stripe may send bursts)
  webhook: {
    windowMs: 60000,
    maxRequests: 100,
  },
  // Auth callback: 10 requests per minute per IP
  authCallback: {
    windowMs: 60000,
    maxRequests: 10,
  },
  // Login attempts: 5 per minute per IP
  login: {
    windowMs: 60000,
    maxRequests: 5,
  },
  // Checkout: 10 per minute per user
  checkout: {
    windowMs: 60000,
    maxRequests: 10,
  },
  // General API: 60 per minute
  api: {
    windowMs: 60000,
    maxRequests: 60,
  },
} as const
