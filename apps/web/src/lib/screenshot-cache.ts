/**
 * Server-side screenshot cache for VM screenshots
 * Reduces VM load by caching screenshots per agent
 * All clients read from cache instead of hitting VM directly
 */

import crypto from 'crypto'

interface CachedScreenshot {
  data: Buffer          // JPEG binary data
  etag: string          // MD5 hash for change detection
  capturedAt: number    // Timestamp when captured
  vmIp: string          // Which VM this came from
}

// In-memory cache (use Redis in production for multi-instance)
const screenshotCache = new Map<string, CachedScreenshot>()

// Cache TTL - how long a screenshot is valid before refresh
const CACHE_TTL_MS = 2000 // 2 seconds

/**
 * Get cached screenshot for an agent
 * Returns null if cache miss or expired
 */
export function getCachedScreenshot(agentId: string): CachedScreenshot | null {
  const cached = screenshotCache.get(agentId)
  if (!cached) return null
  
  // Check if expired
  if (Date.now() - cached.capturedAt > CACHE_TTL_MS) {
    return null // Expired, need refresh
  }
  
  return cached
}

/**
 * Get just the etag (for meta endpoint)
 */
export function getCachedEtag(agentId: string): string | null {
  const cached = screenshotCache.get(agentId)
  if (!cached) return null
  return cached.etag
}

/**
 * Store screenshot in cache
 */
export function cacheScreenshot(
  agentId: string, 
  jpegBuffer: Buffer, 
  vmIp: string
): CachedScreenshot {
  // Generate etag from first 1KB of image (fast hash)
  const hashData = jpegBuffer.subarray(0, 1024)
  const etag = crypto.createHash('md5').update(hashData).digest('hex').substring(0, 8)
  
  const cached: CachedScreenshot = {
    data: jpegBuffer,
    etag,
    capturedAt: Date.now(),
    vmIp,
  }
  
  screenshotCache.set(agentId, cached)
  return cached
}

/**
 * Clear cache for an agent (e.g., when agent stops)
 */
export function clearScreenshotCache(agentId: string): void {
  screenshotCache.delete(agentId)
}

/**
 * Convert base64 PNG to JPEG buffer (compressed)
 * Uses sharp if available, falls back to raw base64 decode
 */
export async function pngBase64ToJpegBuffer(base64Png: string): Promise<Buffer> {
  const pngBuffer = Buffer.from(base64Png, 'base64')
  
  try {
    // Try to use sharp for compression (much smaller files)
    const sharp = (await import('sharp')).default
    const jpegBuffer = await sharp(pngBuffer)
      .resize(1280, null, { withoutEnlargement: true }) // Max width 1280px
      .jpeg({ quality: 70 }) // Good quality, smaller size
      .toBuffer()
    return jpegBuffer
  } catch {
    // Sharp not available, return PNG as-is
    // (will be larger but still works)
    return pngBuffer
  }
}

/**
 * Generate HMAC signature for VM requests
 */
function signVmBody(body: string): string {
  const secret = (process.env.VM_SECRET || '').trim()
  if (!secret) return ''
  return crypto.createHmac('sha256', secret).update(body).digest('hex')
}

/**
 * Fetch screenshot from VM, compress, and cache
 */
export async function fetchAndCacheScreenshot(
  agentId: string,
  vmIp: string
): Promise<CachedScreenshot | null> {
  try {
    const ip = vmIp.trim()
    const body = JSON.stringify({ action: 'screenshot' })
    const signature = signVmBody(body)
    const response = await fetch(`http://${ip}:8080/computer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(signature ? { 'X-Signature': signature } : {}),
      },
      body,
    })
    
    if (!response.ok) return null
    
    const result = await response.json()
    const screenshotData = result.data || result.screenshot
    if (!screenshotData) return null
    
    // Convert to compressed JPEG
    const jpegBuffer = await pngBase64ToJpegBuffer(screenshotData)
    
    // Cache and return
    return cacheScreenshot(agentId, jpegBuffer, vmIp)
  } catch (error) {
    console.error('[ScreenshotCache] Failed to fetch from VM:', error)
    return null
  }
}
