import crypto from 'crypto'

const INTERNAL_API_SECRET = (process.env.INTERNAL_API_SECRET || '').trim() || undefined

/**
 * Generate HMAC signature for internal API authentication
 * Used to secure server-to-server communication (e.g., agent executor -> progress API)
 */
export function generateSignature(payload: string, timestamp: number): string {
  if (!INTERNAL_API_SECRET) {
    throw new Error('INTERNAL_API_SECRET is not configured')
  }
  
  const message = `${timestamp}.${payload}`
  return crypto
    .createHmac('sha256', INTERNAL_API_SECRET)
    .update(message)
    .digest('hex')
}

/**
 * Verify HMAC signature for internal API requests
 * Returns true if signature is valid and timestamp is within tolerance
 */
export function verifySignature(
  payload: string,
  signature: string,
  timestamp: number,
  toleranceSeconds: number = 300 // 5 minutes
): { valid: boolean; error?: string } {
  if (!INTERNAL_API_SECRET) {
    return { valid: false, error: 'INTERNAL_API_SECRET is not configured' }
  }

  // Check timestamp is within tolerance (prevent replay attacks)
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return { valid: false, error: 'Request timestamp expired' }
  }

  // Generate expected signature
  const expectedSignature = generateSignature(payload, timestamp)
  
  // Constant-time comparison to prevent timing attacks
  const sigBuffer = Buffer.from(signature, 'hex')
  const expectedBuffer = Buffer.from(expectedSignature, 'hex')
  
  if (sigBuffer.length !== expectedBuffer.length) {
    return { valid: false, error: 'Invalid signature' }
  }
  
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, error: 'Invalid signature' }
  }

  return { valid: true }
}

/**
 * Create signed headers for internal API requests
 */
export function createSignedHeaders(payload: string): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = generateSignature(payload, timestamp)
  
  return {
    'X-Internal-Signature': signature,
    'X-Internal-Timestamp': timestamp.toString(),
  }
}
