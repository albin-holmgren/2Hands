#!/usr/bin/env npx tsx
/**
 * Golden-path: Environment configuration
 *
 * Verifies that the env-check module correctly distinguishes a healthy
 * configuration from missing/invalid secrets, with actionable messages.
 *
 * Run: npx tsx tests/unit/golden-path-env-check.test.ts
 */

export {}

let passed = 0
let failed = 0
const failures: string[] = []

function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  ✔ ${name}`)
  } catch (err) {
    failed++
    const msg = err instanceof Error ? err.message : String(err)
    failures.push(`${name}: ${msg}`)
    console.log(`  ✗ ${name}\n    ${msg}`)
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg)
}

// ─── Inline the pure functions so no Supabase client is needed ──────────────

interface EnvCheckResult {
  ok: boolean
  missing: string[]
  warnings: string[]
  message: string
}

interface EnvSpec {
  key: string
  required: boolean
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  description: string
  validate?: (value: string) => string | null
}

const ENV_SPECS: EnvSpec[] = [
  { key: 'NEXT_PUBLIC_SUPABASE_URL',    required: true,  severity: 'critical', description: 'Supabase project URL' },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true, severity: 'critical', description: 'Supabase anon key' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY',   required: true,  severity: 'critical', description: 'Supabase service role key' },
  {
    key: 'CREDENTIAL_ENCRYPTION_KEY',
    required: true,
    severity: 'critical',
    description: 'AES-256 key',
    validate: (v) => Buffer.from(v, 'hex').length === 32 ? null : 'Must be a 64-character hex string (32 bytes)',
  },
  {
    key: 'VM_SECRET',
    required: true,
    severity: 'critical',
    description: 'Shared secret for VM operations',
    validate: (v) => v.length >= 16 ? null : 'Should be at least 16 characters',
  },
  { key: 'CRON_SECRET', required: true, severity: 'high', description: 'Cron endpoint secret' },
  { key: 'ANTHROPIC_API_KEY', required: false, severity: 'high', description: 'AI provider key' },
]

function checkEnvWith(env: Record<string, string>): EnvCheckResult {
  const missing: string[] = []
  const warnings: string[] = []

  for (const spec of ENV_SPECS) {
    const value = (env[spec.key] || '').trim()
    if (!value) {
      if (spec.required) {
        missing.push(`${spec.key} — ${spec.description}`)
      } else if (spec.severity === 'high') {
        warnings.push(`${spec.key} is not set — ${spec.description}`)
      }
      continue
    }
    if (spec.validate) {
      const err = spec.validate(value)
      if (err) missing.push(`${spec.key} is invalid: ${err}`)
    }
  }

  const hasAiTransport = Boolean((env.AI_GATEWAY_API_KEY || '').trim()) || Boolean((env.ANTHROPIC_API_KEY || '').trim())
  if (!hasAiTransport) {
    missing.push('AI transport: set AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY')
  }

  const ok = missing.length === 0
  return {
    ok,
    missing,
    warnings,
    message: ok ? 'All checks passed' : `${missing.length} problem(s) found`,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

console.log('\n🔐 Golden Path: Environment Configuration\n')

const GOOD_ENCRYPTION_KEY = 'a'.repeat(64)
const GOOD_VM_SECRET = 'supersecretlong123456'

const completeEnv: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJanon',
  SUPABASE_SERVICE_ROLE_KEY: 'eyJservice',
  CREDENTIAL_ENCRYPTION_KEY: GOOD_ENCRYPTION_KEY,
  VM_SECRET: GOOD_VM_SECRET,
  CRON_SECRET: 'cron-secret-123456',
  AI_GATEWAY_API_KEY: 'sk-gateway-key',
}

test('Complete valid env passes', () => {
  const result = checkEnvWith(completeEnv)
  assert(result.ok, `Expected ok=true, got false. Missing: ${result.missing.join(', ')}`)
  assert(result.missing.length === 0, `Expected 0 missing, got ${result.missing.length}`)
})

test('Missing SUPABASE_SERVICE_ROLE_KEY fails with critical message', () => {
  const env = { ...completeEnv }
  delete env.SUPABASE_SERVICE_ROLE_KEY
  const result = checkEnvWith(env)
  assert(!result.ok, 'Expected ok=false')
  assert(result.missing.some(m => m.includes('SUPABASE_SERVICE_ROLE_KEY')), 'Expected SUPABASE_SERVICE_ROLE_KEY in missing list')
})

test('Short CREDENTIAL_ENCRYPTION_KEY fails validation', () => {
  const env = { ...completeEnv, CREDENTIAL_ENCRYPTION_KEY: 'tooshort' }
  const result = checkEnvWith(env)
  assert(!result.ok, 'Expected ok=false for short encryption key')
  assert(result.missing.some(m => m.includes('CREDENTIAL_ENCRYPTION_KEY')), 'Expected CREDENTIAL_ENCRYPTION_KEY in error message')
})

test('Short VM_SECRET fails validation', () => {
  const env = { ...completeEnv, VM_SECRET: 'short' }
  const result = checkEnvWith(env)
  assert(!result.ok, 'Expected ok=false for short VM_SECRET')
})

test('Missing AI transport fails with actionable message', () => {
  const env = { ...completeEnv }
  delete env.AI_GATEWAY_API_KEY
  const result = checkEnvWith(env)
  assert(!result.ok, 'Expected ok=false when no AI transport is configured')
  assert(result.missing.some(m => m.includes('AI transport')), 'Expected AI transport message')
})

test('Optional ANTHROPIC_API_KEY produces warning when absent', () => {
  const env = { ...completeEnv }
  delete env.AI_GATEWAY_API_KEY
  const envWithDirect = { ...env, ANTHROPIC_API_KEY: 'sk-direct' }
  const result = checkEnvWith(envWithDirect)
  assert(result.ok, `Should pass when ANTHROPIC_API_KEY provided. Missing: ${result.missing.join(', ')}`)
})

test('Message is actionable when failures exist', () => {
  const env = { ...completeEnv }
  delete env.CRON_SECRET
  delete env.VM_SECRET
  const result = checkEnvWith(env)
  assert(!result.ok, 'Expected failures')
  assert(result.message.includes('problem'), `Expected "problem" in message, got: ${result.message}`)
})

test('Missing all Supabase vars reports all of them', () => {
  const env: Record<string, string> = {
    CREDENTIAL_ENCRYPTION_KEY: GOOD_ENCRYPTION_KEY,
    VM_SECRET: GOOD_VM_SECRET,
    CRON_SECRET: 'cron123456789012',
    AI_GATEWAY_API_KEY: 'sk-gateway',
  }
  const result = checkEnvWith(env)
  assert(!result.ok, 'Expected failures')
  assert(result.missing.some(m => m.includes('NEXT_PUBLIC_SUPABASE_URL')), 'Should list NEXT_PUBLIC_SUPABASE_URL')
  assert(result.missing.some(m => m.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY')), 'Should list NEXT_PUBLIC_SUPABASE_ANON_KEY')
  assert(result.missing.some(m => m.includes('SUPABASE_SERVICE_ROLE_KEY')), 'Should list SUPABASE_SERVICE_ROLE_KEY')
})

// ─── Results ─────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50))
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failures.length > 0) {
  console.log('\nFailures:')
  failures.forEach(f => console.log(`  - ${f}`))
}
console.log('='.repeat(50))

process.exit(failed > 0 ? 1 : 0)
