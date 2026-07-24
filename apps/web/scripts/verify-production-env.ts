#!/usr/bin/env npx tsx
/**
 * Production environment verification script.
 *
 * Checks that all required secrets and configuration are present before
 * a production rollout. Run this against the live environment to confirm
 * it is ready for customers.
 *
 * Usage:
 *   npx tsx scripts/verify-production-env.ts
 *   # or against a deployed environment:
 *   READINESS_CHECK_URL=https://your-app.vercel.app npx tsx scripts/verify-production-env.ts
 *
 * Exits 0 if all checks pass, 1 if any are missing/failed.
 */

export {}

// ── Colours ───────────────────────────────────────────────────────────────────

const GREEN  = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED    = '\x1b[31m'
const BOLD   = '\x1b[1m'
const RESET  = '\x1b[0m'

function ok(msg: string)   { console.log(`  ${GREEN}✓${RESET}  ${msg}`) }
function warn(msg: string) { console.log(`  ${YELLOW}⚠${RESET}  ${msg}`) }
function fail(msg: string) { console.log(`  ${RED}✗${RESET}  ${msg}`) }
function h(title: string)  { console.log(`\n${BOLD}${title}${RESET}`) }

// ── Checks ────────────────────────────────────────────────────────────────────

interface CheckResult { passed: boolean; required: boolean; name: string; message: string }

function checkEnvVar(opts: {
  name: string
  required: boolean
  minLength?: number
  hint?: string
}): CheckResult {
  const { name, required, minLength, hint } = opts
  const value = (process.env[name] || '').trim()

  if (!value) {
    const msg = `${name} is not set${hint ? ` — ${hint}` : ''}`
    return { passed: false, required, name, message: msg }
  }

  if (minLength && value.length < minLength) {
    const msg = `${name} is set but too short (got ${value.length}, need ≥${minLength})`
    return { passed: false, required, name, message: msg }
  }

  return { passed: true, required, name, message: `${name} is present` }
}

function printResult(r: CheckResult): void {
  if (r.passed)          ok(r.message)
  else if (r.required)   fail(r.message)
  else                   warn(r.message)
}

const results: CheckResult[] = []

// ── 1. Supabase ───────────────────────────────────────────────────────────────

h('1. Supabase credentials')

const supabaseChecks: CheckResult[] = [
  checkEnvVar({ name: 'NEXT_PUBLIC_SUPABASE_URL', required: true, hint: 'e.g. https://xyz.supabase.co' }),
  checkEnvVar({ name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true }),
  checkEnvVar({ name: 'SUPABASE_SERVICE_ROLE_KEY', required: true, hint: 'Service role key for admin operations' }),
]
supabaseChecks.forEach(r => { printResult(r); results.push(r) })

// ── 2. Security secrets ───────────────────────────────────────────────────────

h('2. Security secrets')

const securityChecks: CheckResult[] = [
  checkEnvVar({ name: 'CREDENTIAL_ENCRYPTION_KEY', required: true, minLength: 64, hint: '32-byte hex key (64 hex chars)' }),
  checkEnvVar({ name: 'VM_SECRET', required: true, minLength: 8, hint: 'Used to sign VM operations' }),
  checkEnvVar({ name: 'CRON_SECRET', required: true, minLength: 16, hint: 'Used to authenticate Vercel cron requests' }),
  checkEnvVar({ name: 'INTERNAL_API_SECRET', required: true, minLength: 16, hint: 'Used for internal health/readiness calls' }),
]
securityChecks.forEach(r => { printResult(r); results.push(r) })

// ── 3. AI transport ───────────────────────────────────────────────────────────

h('3. AI transport credentials')

const aiGateway = (process.env.AI_GATEWAY_API_KEY || '').trim()
const vercelOidc = (process.env.VERCEL_OIDC_TOKEN || '').trim()
const anthropic  = (process.env.ANTHROPIC_API_KEY || '').trim()

if (aiGateway || vercelOidc || anthropic) {
  ok('At least one AI transport credential is configured')
  results.push({ passed: true, required: true, name: 'AI_TRANSPORT', message: 'AI transport OK' })
} else {
  fail('No AI transport credential configured — set AI_GATEWAY_API_KEY (recommended) or ANTHROPIC_API_KEY')
  results.push({ passed: false, required: true, name: 'AI_TRANSPORT', message: 'No AI transport configured' })
}

// ── 4. Observability ─────────────────────────────────────────────────────────

h('4. Observability')

const obsChecks: CheckResult[] = [
  checkEnvVar({ name: 'NEXT_PUBLIC_SENTRY_DSN', required: false, hint: 'Sentry DSN for error reporting and confidence alerts' }),
  checkEnvVar({ name: 'SENTRY_AUTH_TOKEN', required: false, hint: 'Required for source map uploads' }),
]
obsChecks.forEach(r => { printResult(r); results.push(r) })

// ── 5. Confidence-specific env ────────────────────────────────────────────────

h('5. Confidence hardening env')

const confChecks: CheckResult[] = [
  checkEnvVar({ name: 'CRON_SECRET', required: true, hint: 'Authorises /api/confidence/recover and /api/confidence/snapshot crons' }),
  checkEnvVar({ name: 'INTERNAL_API_SECRET', required: true, hint: 'Authorises /api/health, /api/security/readiness, /api/confidence/history' }),
]
confChecks.forEach(r => { printResult(r); results.push(r) })

// ── 6. Vercel cron checklist ──────────────────────────────────────────────────

h('6. Vercel cron registration (manual check required)')

const crons = [
  { path: '/api/confidence/recover',  schedule: '*/10 * * * *', required: true },
  { path: '/api/confidence/snapshot', schedule: '*/30 * * * *', required: true },
]

for (const c of crons) {
  warn(`${c.path} — schedule: ${c.schedule} — verify in Vercel dashboard`)
}
console.log(`\n  ${YELLOW}→${RESET}  Check https://vercel.com/[your-team]/[project]/crons`)

// ── Summary ───────────────────────────────────────────────────────────────────

const totalRequired = results.filter(r => r.required)
const failedRequired = totalRequired.filter(r => !r.passed)
const failedOptional = results.filter(r => !r.required && !r.passed)

console.log(`\n${'─'.repeat(60)}`)
console.log(`${BOLD}Summary${RESET}`)
console.log(`  Required checks : ${totalRequired.length - failedRequired.length}/${totalRequired.length} passed`)
console.log(`  Optional checks : ${results.filter(r => !r.required).length - failedOptional.length}/${results.filter(r => !r.required).length} passed`)

if (failedRequired.length > 0) {
  console.log(`\n${RED}${BOLD}BLOCKED — ${failedRequired.length} required check(s) failed:${RESET}`)
  for (const r of failedRequired) {
    console.log(`  ${RED}✗${RESET}  ${r.message}`)
  }
  console.log('\nFix the above before going live.\n')
  process.exit(1)
}

if (failedOptional.length > 0) {
  console.log(`\n${YELLOW}${BOLD}READY WITH WARNINGS — ${failedOptional.length} optional check(s) missing:${RESET}`)
  for (const r of failedOptional) {
    console.log(`  ${YELLOW}⚠${RESET}  ${r.message}`)
  }
}

console.log(`\n${GREEN}${BOLD}✓ All required production checks passed — ready to go live${RESET}\n`)
process.exit(0)
