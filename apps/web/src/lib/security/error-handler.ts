import { NextResponse } from 'next/server'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

/**
 * Generic error messages that don't leak implementation details
 */
const SAFE_ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Authentication required',
  FORBIDDEN: 'Access denied',
  NOT_FOUND: 'Resource not found',
  BAD_REQUEST: 'Invalid request',
  RATE_LIMITED: 'Too many requests',
  INTERNAL_ERROR: 'An unexpected error occurred',
  DATABASE_ERROR: 'Service temporarily unavailable',
  VALIDATION_ERROR: 'Invalid input provided',
}

interface SafeErrorOptions {
  status: number
  code?: string
  details?: string  // Only included in non-production
}

/**
 * Create a safe error response that doesn't leak sensitive information
 * In production, generic messages are returned
 * In development, more details are included for debugging
 */
export function safeErrorResponse(
  errorType: keyof typeof SAFE_ERROR_MESSAGES,
  options: SafeErrorOptions,
  internalError?: unknown
): NextResponse {
  const { status, code, details } = options
  
  // Log full error details server-side (but not to response)
  if (internalError) {
    if (IS_PRODUCTION) {
      // In production, log minimal info
      console.error(`[${errorType}]`, code || 'no-code')
    } else {
      // In development, log full details
      console.error(`[${errorType}]`, {
        code,
        details,
        error: internalError instanceof Error ? internalError.message : internalError,
        stack: internalError instanceof Error ? internalError.stack : undefined,
      })
    }
  }

  const response: Record<string, unknown> = {
    error: SAFE_ERROR_MESSAGES[errorType] || SAFE_ERROR_MESSAGES.INTERNAL_ERROR,
  }

  // Include error code for client-side handling
  if (code) {
    response.code = code
  }

  // Only include details in non-production environments
  if (!IS_PRODUCTION && details) {
    response.details = details
  }

  return NextResponse.json(response, { status })
}

/**
 * Handle database errors safely
 */
export function handleDatabaseError(error: unknown): NextResponse {
  // Check for common Supabase/PostgreSQL error codes
  const pgError = error as { code?: string; message?: string }
  
  if (pgError.code === 'PGRST116') {
    // Row not found
    return safeErrorResponse('NOT_FOUND', { status: 404 }, error)
  }
  
  if (pgError.code === '23505') {
    // Unique constraint violation
    return safeErrorResponse('BAD_REQUEST', { 
      status: 400, 
      code: 'DUPLICATE_ENTRY',
      details: 'A record with this value already exists'
    }, error)
  }
  
  if (pgError.code === '23503') {
    // Foreign key violation
    return safeErrorResponse('BAD_REQUEST', { 
      status: 400, 
      code: 'INVALID_REFERENCE',
      details: 'Referenced record does not exist'
    }, error)
  }

  // Generic database error
  return safeErrorResponse('DATABASE_ERROR', { status: 500 }, error)
}

/**
 * Conditional logging that respects production environment
 * Prevents sensitive data from being logged in production
 */
export function secureLog(
  level: 'info' | 'warn' | 'error',
  message: string,
  data?: Record<string, unknown>
): void {
  if (IS_PRODUCTION) {
    // In production, log only the message without potentially sensitive data
    console[level](`[${new Date().toISOString()}] ${message}`)
  } else {
    // In development, log everything for debugging
    console[level](`[${new Date().toISOString()}] ${message}`, data || '')
  }
}

/**
 * Sanitize user input for logging (remove potential secrets)
 */
export function sanitizeForLogging(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'credential', 'authorization']
  const sanitized: Record<string, unknown> = {}
  
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase()
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]'
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLogging(value as Record<string, unknown>)
    } else {
      sanitized[key] = value
    }
  }
  
  return sanitized
}
