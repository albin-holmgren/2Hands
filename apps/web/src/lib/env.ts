/**
 * Environment Variable Validation
 * Validates required environment variables at startup to prevent runtime failures
 */

// Server-side required environment variables
const SERVER_REQUIRED_ENV_VARS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'INTERNAL_API_SECRET',
  'GATEWAY_SECRET',
  'AI_GATEWAY_API_KEY', // Required - no direct Anthropic fallback
] as const

// Server-side optional but recommended
const SERVER_OPTIONAL_ENV_VARS = [
  'VERCEL_OIDC_TOKEN', // Alternative to AI_GATEWAY_API_KEY
  'DIGITALOCEAN_API_TOKEN',
  'CRON_SECRET',
  'UPSTASH_REDIS_URL',
  'UPSTASH_REDIS_TOKEN',
] as const

// Client-side required (NEXT_PUBLIC_)
const CLIENT_REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_APP_URL',
] as const

interface EnvValidationResult {
  valid: boolean
  missing: string[]
  warnings: string[]
}

/**
 * Validate all required environment variables
 * Call this at application startup
 */
export function validateEnv(): EnvValidationResult {
  const missing: string[] = []
  const warnings: string[] = []

  // Check server-side required vars
  for (const envVar of SERVER_REQUIRED_ENV_VARS) {
    if (!((process.env[envVar] || '').trim())) {
      missing.push(envVar)
    }
  }

  // Validate AI auth: AI Gateway is required - no direct Anthropic fallback
  const hasGatewayKey = Boolean((process.env.AI_GATEWAY_API_KEY || '').trim())
  const hasOidcToken = Boolean((process.env.VERCEL_OIDC_TOKEN || '').trim())
  if (!hasGatewayKey && !hasOidcToken) {
    missing.push('AI_GATEWAY_API_KEY (or VERCEL_OIDC_TOKEN) - AI Gateway is required, direct Anthropic is not supported')
  }

  // Check client-side required vars
  for (const envVar of CLIENT_REQUIRED_ENV_VARS) {
    if (!((process.env[envVar] || '').trim())) {
      missing.push(envVar)
    }
  }

  // Check optional vars and warn if missing
  for (const envVar of SERVER_OPTIONAL_ENV_VARS) {
    if (!((process.env[envVar] || '').trim())) {
      warnings.push(`Optional env var ${envVar} is not set`)
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings,
  }
}

/**
 * Validate environment and throw if critical vars are missing
 * Use this in server components/API routes
 */
export function assertEnv(): void {
  const result = validateEnv()
  
  if (!result.valid) {
    const errorMessage = `Missing required environment variables:\n${result.missing.map(v => `  - ${v}`).join('\n')}`
    console.error('❌ Environment validation failed!')
    console.error(errorMessage)
    throw new Error(errorMessage)
  }

  // Log warnings in development
  if (process.env.NODE_ENV === 'development' && result.warnings.length > 0) {
    console.warn('⚠️ Environment warnings:')
    result.warnings.forEach(w => console.warn(`  - ${w}`))
  }
}

/**
 * Get a required server environment variable with runtime validation
 */
export function getServerEnv(key: typeof SERVER_REQUIRED_ENV_VARS[number]): string {
  const value = (process.env[key] || '').replace(/\\n/g, '').replace(/\n/g, '').trim()
  if (!value) {
    throw new Error(`Missing required server environment variable: ${key}`)
  }
  return value
}

/**
 * Get an optional server environment variable
 */
export function getOptionalServerEnv(key: typeof SERVER_OPTIONAL_ENV_VARS[number]): string | undefined {
  const value = (process.env[key] || '').trim()
  return value || undefined
}

/**
 * Type-safe environment variable access
 */
export const env = {
  // Server-side
  supabaseServiceRoleKey: () => getServerEnv('SUPABASE_SERVICE_ROLE_KEY'),
  aiGatewayApiKey: () => getServerEnv('AI_GATEWAY_API_KEY'),
  stripeSecretKey: () => getServerEnv('STRIPE_SECRET_KEY'),
  stripeWebhookSecret: () => getServerEnv('STRIPE_WEBHOOK_SECRET'),
  internalApiSecret: () => getServerEnv('INTERNAL_API_SECRET'),
  
  // Optional server-side
  digitalOceanToken: () => getOptionalServerEnv('DIGITALOCEAN_API_TOKEN'),
  cronSecret: () => getOptionalServerEnv('CRON_SECRET'),
  
  // Client-side (safe to access)
  supabaseUrl: (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
  supabaseAnonKey: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim(),
  appUrl: (process.env.NEXT_PUBLIC_APP_URL || '').trim() || 'http://localhost:3000',
  stripePublishableKey: (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '').replace(/\\n/g, '').replace(/\n/g, '').trim(),
  
  // Feature flags
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV === 'development',
} as const


/**
 * Auto-validate on module load in production
 * Ensures the app fails fast if misconfigured
 */
if (process.env.NODE_ENV === 'production' && typeof window === 'undefined') {
  const result = validateEnv()
  if (!result.valid) {
    console.error('❌ FATAL: Missing required environment variables in production:')
    result.missing.forEach(v => console.error(`  - ${v}`))
    throw new Error(`Production cannot start: missing ${result.missing.length} required env vars`)
  }
}
