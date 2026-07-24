#!/usr/bin/env npx tsx
/**
 * CI/deploy readiness gate.
 *
 * Calls the running application's /api/security/readiness endpoint and
 * exits with code 1 if the system is not ready for broad rollout.
 *
 * Usage:
 *   npx tsx scripts/check-readiness.ts [--url https://your-app.vercel.app]
 *
 * Environment variables:
 *   READINESS_CHECK_URL   – base URL to check (overrides --url)
 *   INTERNAL_API_SECRET   – forwarded as x-health-check-secret header
 *
 * Exits 0 on ready, 1 on not_ready or error.
 */

const args = process.argv.slice(2)
const urlArg = args.find((a, i) => args[i - 1] === '--url')
const baseUrl = (
  process.env.READINESS_CHECK_URL ||
  urlArg ||
  process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}` ||
  'http://localhost:3000'
).replace(/\/$/, '')

const secret = (process.env.INTERNAL_API_SECRET || '').trim()

interface ReadinessResponse {
  status?: string
  level?: string
  ready_for_broad_rollout?: boolean
  failed_criteria?: string[]
  criteria?: Record<string, boolean>
  timestamp?: string
}

async function checkReadiness(): Promise<void> {
  const url = `${baseUrl}/api/security/readiness`
  console.log(`\n🔍 Checking readiness at ${url}\n`)

  let response: Response
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    }
    if (secret) headers['x-health-check-secret'] = secret

    response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
  } catch (err) {
    console.error(`❌ Failed to reach readiness endpoint: ${err instanceof Error ? err.message : String(err)}`)
    console.error(`   Verify the app is running at ${baseUrl}`)
    process.exit(1)
  }

  let body: ReadinessResponse
  try {
    body = await response.json() as ReadinessResponse
  } catch {
    console.error(`❌ Readiness endpoint returned non-JSON response (HTTP ${response.status})`)
    process.exit(1)
  }

  const level = body.level ?? body.status ?? 'unknown'
  const isReady = body.ready_for_broad_rollout === true || body.status === 'ready' || level === 'healthy'
  const failedCriteria = body.failed_criteria ?? []

  console.log(`Readiness level : ${level}`)
  console.log(`Ready           : ${isReady ? '✅ yes' : '❌ no'}`)
  if (body.timestamp) console.log(`Timestamp       : ${body.timestamp}`)

  if (body.criteria) {
    console.log('\nCriteria:')
    for (const [key, pass] of Object.entries(body.criteria)) {
      console.log(`  ${pass ? '✅' : '❌'} ${key}`)
    }
  }

  if (failedCriteria.length > 0) {
    console.log('\nFailed criteria:')
    for (const c of failedCriteria) {
      console.log(`  ✗ ${c}`)
    }
  }

  if (!isReady) {
    console.log('\n❌ Readiness gate FAILED — deployment blocked\n')
    process.exit(1)
  }

  console.log('\n✅ Readiness gate PASSED — deployment can proceed\n')
  process.exit(0)
}

checkReadiness().catch(err => {
  console.error(`Unhandled error: ${err}`)
  process.exit(1)
})
