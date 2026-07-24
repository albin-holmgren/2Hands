/**
 * Internal Testing API — OpenClaw service account access
 *
 * GET  /api/v1/internal/test               — liveness probe
 * POST /api/v1/internal/test               — run a test suite
 *
 * Required env vars:
 *   ENABLE_INTERNAL_TEST_API=true          — explicit opt-in (disabled by default)
 *   SERVICE_KEY_OPENCLAW=<secure-secret>   — static bearer token for the openclaw-tester account
 *
 * Supported testType values:
 *   'routing'            — classify a single message; optionally assert expectedMode
 *   'routing_suite'      — default 10-case suite or caller-supplied cases
 *   'routing_regression' — expanded 40+ case regression suite across all execution modes
 *   'health'             — full system health snapshot (env, db, stale runs, queue, pool, billing)
 *   'auth_walls'         — verify that all auth-protected endpoints return 401 for unauthenticated requests
 *   'endpoint_probe'     — caller supplies custom list of { path, method, expectedStatus } probes
 *   'full_audit'         — runs routing_regression + health + auth_walls in one call
 *
 * No real executions, no chat handler calls, no production user-data writes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { classifyExecution } from '@/lib/execution/execute-first-policy'
import { checkEnv } from '@/lib/confidence/env-check'
import { detectStaleRuns, detectStaleMissionLocks } from '@/lib/confidence/stale-recovery'
import { createAdminClient } from '@/lib/supabase/admin'

// ── Auth ─────────────────────────────────────────────────────────────────────

interface ServiceAuth { ok: true; name: string }
interface ServiceAuthFail { ok: false }
type AuthResult = ServiceAuth | ServiceAuthFail

function authenticate(request: NextRequest): AuthResult {
  // Read at request time (not module load) so Vercel env vars are always current
  const enabled = (process.env.ENABLE_INTERNAL_TEST_API ?? '').trim() === 'true'
  const serviceKey = (process.env.SERVICE_KEY_OPENCLAW ?? '').trim()
  if (!enabled || !serviceKey) return { ok: false }
  const raw = request.headers.get('authorization') ?? ''
  const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : ''
  return token.length > 0 && token === serviceKey
    ? { ok: true, name: 'openclaw-tester' }
    : { ok: false }
}

// ── Routing helpers ──────────────────────────────────────────────────────────

interface RoutingCase { message: string; expectedMode?: string }
interface RoutingResult {
  test: 'classification'
  input: string
  expected: string | null
  actual: string
  passed: boolean
  details: { mode: string; risk: string; reason: string; canProceedImmediately: boolean }
}

function classifyCase({ message, expectedMode }: RoutingCase): RoutingResult {
  const cls = classifyExecution({ taskDescription: message })
  const passed = expectedMode != null ? cls.mode === expectedMode : true
  return {
    test: 'classification',
    input: message,
    expected: expectedMode ?? null,
    actual: cls.mode,
    passed,
    details: { mode: cls.mode, risk: cls.risk, reason: cls.reason, canProceedImmediately: cls.canProceedImmediately },
  }
}

function parseCases(raw: unknown, fallback: RoutingCase[]): RoutingCase[] {
  if (!Array.isArray(raw)) return fallback
  const parsed: RoutingCase[] = (raw as unknown[]).flatMap((c) => {
    if (c !== null && typeof c === 'object' && 'message' in c && typeof (c as Record<string, unknown>).message === 'string') {
      const e = c as Record<string, unknown>
      return [{ message: String(e.message), expectedMode: typeof e.expectedMode === 'string' ? e.expectedMode : undefined }]
    }
    return []
  })
  return parsed.length > 0 ? parsed : fallback
}

const DEFAULT_ROUTING_SUITE: RoutingCase[] = [
  { message: 'Find 5 leads',                      expectedMode: 'direct_execute' },
  { message: 'Get me 10 contacts from LinkedIn',   expectedMode: 'direct_execute' },
  { message: 'Delete all deals',                   expectedMode: 'needs_confirmation' },
  { message: 'Remove every contact from the CRM',  expectedMode: 'needs_confirmation' },
  { message: 'Find 10 leads per day',              expectedMode: 'recurring_operation' },
  { message: 'Send a daily report every morning',  expectedMode: 'recurring_operation' },
  { message: 'Find 1000 leads',                    expectedMode: 'background_agent' },
  { message: 'Scrape 200 companies from G2',       expectedMode: 'background_agent' },
  { message: 'Check website health',               expectedMode: 'direct_execute' },
  { message: 'Create a new deal in Attio',         expectedMode: 'direct_execute' },
]

const REGRESSION_SUITE: RoutingCase[] = [
  // ── direct_execute ──────────────────────────────────────────────────
  { message: 'Find 5 leads',                            expectedMode: 'direct_execute' },
  { message: 'Get me 3 leads',                          expectedMode: 'direct_execute' },
  { message: 'Find 25 companies',                       expectedMode: 'direct_execute' },
  { message: 'Create a new deal in Attio',              expectedMode: 'direct_execute' },
  { message: 'Create a contact for John Smith',         expectedMode: 'direct_execute' },
  { message: 'Add a note to the lead',                  expectedMode: 'direct_execute' },
  { message: 'Send me 5 leads from LinkedIn',           expectedMode: 'direct_execute' },
  { message: 'Get 10 contacts from LinkedIn',           expectedMode: 'direct_execute' },
  { message: 'Search for 15 companies in SaaS',         expectedMode: 'direct_execute' },
  { message: 'Summarize the last 5 calls',              expectedMode: 'direct_execute' },
  { message: 'Check website health',                    expectedMode: 'direct_execute' },
  { message: 'Write a follow-up email to 3 prospects',  expectedMode: 'direct_execute' },
  { message: 'Fix 2 bugs in the repo',                  expectedMode: 'direct_execute' },
  { message: 'Review 5 pull requests',                  expectedMode: 'direct_execute' },
  { message: 'subscribe to the newsletter',             expectedMode: 'direct_execute' },
  // ── boundary: 26 is background, 25 is direct ────────────────────────
  { message: 'Find 25 leads',                           expectedMode: 'direct_execute' },
  { message: 'Find 26 leads',                           expectedMode: 'background_agent' },
  // ── needs_confirmation ──────────────────────────────────────────────
  { message: 'Delete all deals',                        expectedMode: 'needs_confirmation' },
  { message: 'Remove every contact from the CRM',       expectedMode: 'needs_confirmation' },
  { message: 'Wipe all records from the database',      expectedMode: 'needs_confirmation' },
  { message: 'Purge everything in the pipeline',        expectedMode: 'needs_confirmation' },
  { message: 'Delete all users',                        expectedMode: 'needs_confirmation' },
  { message: 'Nuke the entire leads table',             expectedMode: 'needs_confirmation' },
  { message: 'Send a mass email to all customers',      expectedMode: 'needs_confirmation' },
  { message: 'Transfer $500 to the account',            expectedMode: 'needs_confirmation' },
  // OpenClaw gap fixes — email safety
  { message: 'Send email to team',                                          expectedMode: 'needs_confirmation' },
  { message: 'Send an email to the team about the new release',             expectedMode: 'needs_confirmation' },
  { message: 'Send email to all staff about the meeting',                   expectedMode: 'needs_confirmation' },
  { message: 'Send email to all customers about the update',                expectedMode: 'needs_confirmation' },
  // OpenClaw gap fixes — subscription / recurring purchase safety
  { message: 'Subscribe to Pro plan for $99/month',                         expectedMode: 'needs_confirmation' },
  { message: 'Sign up for the Business plan',                               expectedMode: 'needs_confirmation' },
  { message: 'Upgrade to the $50/month subscription',                       expectedMode: 'needs_confirmation' },
  // ── recurring_operation ─────────────────────────────────────────────
  { message: 'Find 10 leads per day',                   expectedMode: 'recurring_operation' },
  { message: 'Send a daily report every morning',       expectedMode: 'recurring_operation' },
  { message: 'Check the pipeline every Monday',         expectedMode: 'recurring_operation' },
  { message: 'Run competitor research weekly',          expectedMode: 'recurring_operation' },
  { message: 'Monitor social media hourly',             expectedMode: 'recurring_operation' },
  { message: 'Sync leads every day at 9am',             expectedMode: 'recurring_operation' },
  // ── background_agent ────────────────────────────────────────────────
  { message: 'Find 1000 leads',                         expectedMode: 'background_agent' },
  { message: 'Scrape 200 companies from G2',            expectedMode: 'background_agent' },
  { message: 'Research 50 companies in depth',          expectedMode: 'background_agent' },
  { message: 'Collect 100 email addresses',             expectedMode: 'background_agent' },
  { message: 'Generate 30 blog posts',                  expectedMode: 'background_agent' },
  { message: 'Process 500 invoices',                    expectedMode: 'background_agent' },
  { message: 'Do deep research on the market',          expectedMode: 'background_agent' },
  { message: 'Build a full competitor analysis report', expectedMode: 'background_agent' },
  { message: 'Crawl the entire competitor website',     expectedMode: 'background_agent' },
  { message: 'Extract 300 leads from LinkedIn',         expectedMode: 'background_agent' },
  // OpenClaw gap fixes — research ambiguity
  { message: 'Research the market for our new product',                     expectedMode: 'background_agent' },
  { message: 'Analyze competition in the CRM space',                        expectedMode: 'background_agent' },
  { message: 'Research market deeply',                                      expectedMode: 'background_agent' },
  { message: 'Analyze the competition in depth',                            expectedMode: 'background_agent' },
  { message: 'Thoroughly investigate the SaaS sector',                      expectedMode: 'background_agent' },
  { message: 'Comprehensive research report on enterprise buyers',          expectedMode: 'background_agent' },
  // OpenClaw gap fixes — count + intensive verb
  { message: 'Investigate 30 competitors in our space',                     expectedMode: 'background_agent' },
  { message: 'Audit 100 records for compliance',                            expectedMode: 'background_agent' },
  // OpenClaw gap fixes — large simple batches
  { message: 'Archive 100 old emails',                                      expectedMode: 'background_agent' },
  { message: 'Migrate 200 records to the new system',                       expectedMode: 'background_agent' },
  { message: 'Export 500 contacts to CSV',                                  expectedMode: 'background_agent' },
  // Advanced routing — scheduling / follow-up
  { message: 'Schedule a follow-up',                                        expectedMode: 'recurring_operation' },
  { message: 'Schedule follow-up in 3 days',                                expectedMode: 'recurring_operation' },
  { message: 'Follow up in 2 weeks with the prospect',                      expectedMode: 'recurring_operation' },
  { message: 'Remind me in 3 days to check on this deal',                   expectedMode: 'recurring_operation' },
  // Advanced routing — public posting safety
  { message: 'Publish to blog',                                             expectedMode: 'needs_confirmation' },
  { message: 'Post on LinkedIn',                                            expectedMode: 'needs_confirmation' },
  { message: 'Share on Twitter',                                            expectedMode: 'needs_confirmation' },
  // Advanced routing — personalized outreach safety
  { message: 'Draft personalized outreach emails',                          expectedMode: 'needs_confirmation' },
  { message: 'Prepare outreach emails for the leads',                       expectedMode: 'needs_confirmation' },
  // Advanced routing — large content creation
  { message: 'Write 1500 word article about our product',                   expectedMode: 'background_agent' },
  { message: 'Write a 2000-word blog post about AI trends',                 expectedMode: 'background_agent' },
  { message: 'Write a comprehensive guide to our onboarding process',       expectedMode: 'background_agent' },
  { message: 'Create long-form content for the website',                    expectedMode: 'background_agent' },
  // Advanced routing — high-count lead qualifiers
  { message: 'Find enterprise leads (500+) in the US market',               expectedMode: 'background_agent' },
  { message: 'Find hundreds of leads in the European market',               expectedMode: 'background_agent' },
  // Intentional threshold: 10 leads is within ≤25 and stays direct_execute by design
  { message: 'Find 10 leads in Sweden',                                     expectedMode: 'direct_execute' },
  // Edge-case follow-up — relative-time schedule phrases
  { message: 'Remind me next week about this deal',                         expectedMode: 'recurring_operation' },
  { message: 'Follow up next week with the client',                         expectedMode: 'recurring_operation' },
  { message: 'Follow up tomorrow about the proposal',                       expectedMode: 'recurring_operation' },
  { message: 'Check again in 1 hour to see if it updated',                  expectedMode: 'recurring_operation' },
  { message: 'Check back in 2 days on this ticket',                         expectedMode: 'recurring_operation' },
  // Edge-case follow-up — generic publish-content safety
  { message: 'Publish article now',                                         expectedMode: 'needs_confirmation' },
  { message: 'Publish the blog post',                                       expectedMode: 'needs_confirmation' },
  { message: 'Publish this post',                                           expectedMode: 'needs_confirmation' },
  // Edge-case follow-up — group-targeted email draft safety
  { message: 'Draft email to team',                                         expectedMode: 'needs_confirmation' },
  { message: 'Draft email to all staff',                                    expectedMode: 'needs_confirmation' },
  { message: 'Write email to all customers about the outage',               expectedMode: 'needs_confirmation' },
  { message: 'Prepare email for leads in the pipeline',                     expectedMode: 'needs_confirmation' },
  // Negative: email draft without explicit group audience stays direct
  { message: 'Write email draft',                                           expectedMode: 'direct_execute' },
  { message: 'Create email template for the onboarding flow',               expectedMode: 'direct_execute' },
]

// Targeted suite for the 5 OpenClaw-identified routing gaps (used by testType "openclaw_gaps")
const OPENCLAW_GAP_SUITE: RoutingCase[] = [
  // Gap 1: Email to team/group → needs_confirmation
  { message: 'Send email to team',                                          expectedMode: 'needs_confirmation' },
  { message: 'Send an email to the team about the new release',             expectedMode: 'needs_confirmation' },
  { message: 'Send email to all staff about the meeting',                   expectedMode: 'needs_confirmation' },
  { message: 'Send email to all customers about the update',                expectedMode: 'needs_confirmation' },
  // Negative: personal targeted email should NOT require confirmation
  { message: 'Write a follow-up email to 3 prospects',                      expectedMode: 'direct_execute' },
  // Gap 2: Subscription / recurring purchase → needs_confirmation
  { message: 'Subscribe to Pro plan for $99/month',                         expectedMode: 'needs_confirmation' },
  { message: 'Sign up for the Business plan',                               expectedMode: 'needs_confirmation' },
  { message: 'Upgrade to the $50/month subscription',                       expectedMode: 'needs_confirmation' },
  // Negative: newsletter subscribe should NOT require confirmation
  { message: 'subscribe to the newsletter',                                 expectedMode: 'direct_execute' },
  // Gap 3: Research ambiguity → background_agent
  { message: 'Research the market for our new product',                     expectedMode: 'background_agent' },
  { message: 'Analyze competition in the CRM space',                        expectedMode: 'background_agent' },
  { message: 'Research market deeply',                                      expectedMode: 'background_agent' },
  { message: 'Analyze the competition in depth',                            expectedMode: 'background_agent' },
  { message: 'Thoroughly investigate the SaaS sector',                      expectedMode: 'background_agent' },
  { message: 'Comprehensive research report on enterprise buyers',          expectedMode: 'background_agent' },
  // Gap 4: Count + intensive verb → background_agent
  { message: 'Research 50 companies in depth',                              expectedMode: 'background_agent' },
  { message: 'Investigate 30 competitors in our space',                     expectedMode: 'background_agent' },
  { message: 'Audit 100 records for compliance',                            expectedMode: 'background_agent' },
  // Gap 5: Large simple batches → background_agent
  { message: 'Archive 100 old emails',                                      expectedMode: 'background_agent' },
  { message: 'Migrate 200 records to the new system',                       expectedMode: 'background_agent' },
  { message: 'Export 500 contacts to CSV',                                  expectedMode: 'background_agent' },
  // Advanced fixes — scheduling / follow-up
  { message: 'Schedule a follow-up',                                        expectedMode: 'recurring_operation' },
  { message: 'Schedule follow-up in 3 days',                                expectedMode: 'recurring_operation' },
  { message: 'Follow up in 2 weeks with the prospect',                      expectedMode: 'recurring_operation' },
  { message: 'Remind me in 3 days to check on this deal',                   expectedMode: 'recurring_operation' },
  // Advanced fixes — public posting / publishing safety
  { message: 'Publish to blog',                                             expectedMode: 'needs_confirmation' },
  { message: 'Post on LinkedIn',                                            expectedMode: 'needs_confirmation' },
  { message: 'Share on Twitter',                                            expectedMode: 'needs_confirmation' },
  // Advanced fixes — personalized outreach safety
  { message: 'Draft personalized outreach emails',                          expectedMode: 'needs_confirmation' },
  { message: 'Prepare outreach emails for the leads',                       expectedMode: 'needs_confirmation' },
  // Negative: single targeted draft is NOT confirmation-required
  { message: 'Write a follow-up email to John about his order',             expectedMode: 'direct_execute' },
  // Advanced fixes — large content creation
  { message: 'Write 1500 word article about our product',                   expectedMode: 'background_agent' },
  { message: 'Write a 2000-word blog post about AI trends',                 expectedMode: 'background_agent' },
  { message: 'Write a comprehensive guide to our onboarding process',       expectedMode: 'background_agent' },
  { message: 'Create long-form content for the website',                    expectedMode: 'background_agent' },
  // Advanced fixes — high-count lead qualifiers
  { message: 'Find enterprise leads (500+) in the US market',               expectedMode: 'background_agent' },
  { message: 'Find hundreds of leads in the European market',               expectedMode: 'background_agent' },
  // Intentional design: 10 leads is ≤25, stays direct_execute
  { message: 'Find 10 leads in Sweden',                                     expectedMode: 'direct_execute' },
  // Edge-case follow-up — relative-time schedule phrases
  { message: 'Remind me next week about this deal',                         expectedMode: 'recurring_operation' },
  { message: 'Follow up next week with the client',                         expectedMode: 'recurring_operation' },
  { message: 'Follow up tomorrow about the proposal',                       expectedMode: 'recurring_operation' },
  { message: 'Check again in 1 hour to see if it updated',                  expectedMode: 'recurring_operation' },
  { message: 'Check back in 2 days on this ticket',                         expectedMode: 'recurring_operation' },
  // Edge-case follow-up — generic publish-content safety
  { message: 'Publish article now',                                         expectedMode: 'needs_confirmation' },
  { message: 'Publish the blog post',                                       expectedMode: 'needs_confirmation' },
  { message: 'Publish this post',                                           expectedMode: 'needs_confirmation' },
  // Edge-case follow-up — group-targeted email draft safety
  { message: 'Draft email to team',                                         expectedMode: 'needs_confirmation' },
  { message: 'Draft email to all staff',                                    expectedMode: 'needs_confirmation' },
  { message: 'Write email to all customers about the outage',               expectedMode: 'needs_confirmation' },
  { message: 'Prepare email for leads in the pipeline',                     expectedMode: 'needs_confirmation' },
  // Negative: email draft without explicit group audience stays direct
  { message: 'Write email draft',                                           expectedMode: 'direct_execute' },
  { message: 'Create email template for the onboarding flow',               expectedMode: 'direct_execute' },
]

// ── Health check ─────────────────────────────────────────────────────────────

interface HealthFinding {
  id: string
  status: 'pass' | 'warn' | 'fail'
  title: string
  detail?: string
}

async function runHealthCheck(): Promise<{ level: string; findings: HealthFinding[]; actions: string[] }> {
  const findings: HealthFinding[] = []
  const actions: string[] = []
  const supabase = createAdminClient()

  // Env
  const envResult = checkEnv()
  findings.push({
    id: 'env',
    status: envResult.ok ? (envResult.warnings.length > 0 ? 'warn' : 'pass') : 'fail',
    title: envResult.ok ? 'Environment is fully configured' : `Env issues: ${envResult.missing.join(', ')}`,
  })
  if (!envResult.ok) actions.push(`Fix env: ${envResult.missing.join(', ')}`)

  // Database
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1)
    findings.push({ id: 'database', status: error ? 'fail' : 'pass', title: error ? `DB unreachable: ${error.message}` : 'Database reachable' })
    if (error) actions.push('Database unreachable — check SUPABASE credentials')
  } catch (e) {
    findings.push({ id: 'database', status: 'fail', title: `DB check threw: ${e instanceof Error ? e.message : String(e)}` })
    actions.push('Database connectivity exception')
  }

  // Stale runs
  try {
    const stale = await detectStaleRuns()
    const n = stale.length
    findings.push({ id: 'stale_runs', status: n > 5 ? 'fail' : n > 0 ? 'warn' : 'pass', title: n === 0 ? 'No stale agent runs' : `${n} stale agent run(s)` })
    if (n > 0) actions.push(`${n} stale runs — POST /api/confidence/recover to clean up`)
  } catch { findings.push({ id: 'stale_runs', status: 'warn', title: 'Could not check stale runs' }) }

  // Stale locks
  try {
    const locks = await detectStaleMissionLocks()
    const n = locks.length
    findings.push({ id: 'stale_locks', status: n > 3 ? 'fail' : n > 0 ? 'warn' : 'pass', title: n === 0 ? 'No stale mission locks' : `${n} stale mission lock(s)` })
    if (n > 0) actions.push(`${n} stale locks — will auto-clear on next cron`)
  } catch { findings.push({ id: 'stale_locks', status: 'warn', title: 'Could not check mission locks' }) }

  // Queue backlog
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any).from('agent_runs').select('run_id', { count: 'exact', head: true }).eq('status', 'queued')
    const n = count ?? 0
    findings.push({ id: 'queue_backlog', status: n > 20 ? 'fail' : n > 5 ? 'warn' : 'pass', title: `${n} queued run(s) in agent_runs` })
    if (n > 20) actions.push(`${n} runs queued — worker may be stalled`)
  } catch { findings.push({ id: 'queue_backlog', status: 'warn', title: 'Could not check queue backlog' }) }

  // Billing
  try {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any).from('agent_run_events').select('id', { count: 'exact', head: true }).eq('name', 'credit_commit_failed').gte('created_at', cutoff)
    const n = count ?? 0
    findings.push({ id: 'billing', status: n >= 10 ? 'fail' : n > 0 ? 'warn' : 'pass', title: n === 0 ? 'Billing healthy' : `${n} credit_commit_failed event(s) in last hour` })
    if (n > 0) actions.push(`${n} billing commit failures — check credits config`)
  } catch { findings.push({ id: 'billing', status: 'warn', title: 'Could not check billing events' }) }

  const hasFail = findings.some(f => f.status === 'fail')
  const hasWarn = findings.some(f => f.status === 'warn')
  return { level: hasFail ? 'unhealthy' : hasWarn ? 'degraded' : 'healthy', findings, actions }
}

// ── Endpoint probe ────────────────────────────────────────────────────────────

interface ProbeCase { path: string; method?: string; expectedStatus: number; description?: string }
interface ProbeResult { path: string; method: string; expected: number; actual: number; passed: boolean; description: string }

async function probeEndpoint(origin: string, { path, method = 'GET', expectedStatus, description }: ProbeCase): Promise<ProbeResult> {
  let actual = 0
  try {
    const res = await fetch(`${origin}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      // Short timeout so a cold-start doesn't stall the whole suite
      signal: AbortSignal.timeout(8000),
    })
    actual = res.status
  } catch {
    actual = 0
  }
  return { path, method, expected: expectedStatus, actual, passed: actual === expectedStatus, description: description ?? path }
}

// All endpoints that must return 401 when called without credentials
const AUTH_WALL_PROBES: ProbeCase[] = [
  { path: '/api/agents',             method: 'GET',  expectedStatus: 401, description: 'agents list — user auth required' },
  { path: '/api/approvals',          method: 'GET',  expectedStatus: 401, description: 'approvals — user auth required' },
  { path: '/api/conversations',      method: 'GET',  expectedStatus: 401, description: 'conversations — user auth required' },
  { path: '/api/boards',             method: 'GET',  expectedStatus: 401, description: 'boards — user auth required' },
  { path: '/api/skills',             method: 'GET',  expectedStatus: 401, description: 'skills — user auth required' },
  { path: '/api/memory/boxes',       method: 'GET',  expectedStatus: 401, description: 'memory boxes — user auth required' },
  { path: '/api/recurring-tasks',    method: 'GET',  expectedStatus: 401, description: 'recurring tasks — user auth required' },
  { path: '/api/export',             method: 'GET',  expectedStatus: 401, description: 'export — user auth required' },
  { path: '/api/confidence/status',  method: 'GET',  expectedStatus: 401, description: 'confidence status — user auth required' },
  { path: '/api/v1/agents',          method: 'GET',  expectedStatus: 401, description: 'public API agents — API key required' },
  { path: '/api/v1/keys',            method: 'GET',  expectedStatus: 401, description: 'API key management — user auth required' },
  { path: '/api/missions/runner',    method: 'GET',  expectedStatus: 401, description: 'mission runner — CRON_SECRET required' },
  { path: '/api/confidence/recover', method: 'GET',  expectedStatus: 401, description: 'confidence recover — secret required' },
  { path: '/api/chat',               method: 'POST', expectedStatus: 401, description: 'chat — user auth required' },
]

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = authenticate(request)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const testType = typeof body.testType === 'string' ? body.testType : 'routing'
  const timestamp = new Date().toISOString()
  const serviceName = (auth as ServiceAuth).name
  const origin = request.nextUrl.origin

  // ── routing ──────────────────────────────────────────────────────────────
  if (testType === 'routing') {
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    if (!message) return NextResponse.json({ error: '"message" is required for testType "routing"' }, { status: 400 })
    const expectedMode = typeof body.expectedMode === 'string' ? body.expectedMode : undefined
    const result = classifyCase({ message, expectedMode })
    return NextResponse.json({
      success: true, service: serviceName, timestamp,
      results: [result],
      summary: { passed: result.passed ? 1 : 0, failed: result.passed ? 0 : 1, total: 1 },
    })
  }

  // ── routing_suite ────────────────────────────────────────────────────────
  if (testType === 'routing_suite') {
    const cases = parseCases(body.cases, DEFAULT_ROUTING_SUITE)
    const results = cases.map(classifyCase)
    const passCount = results.filter(r => r.passed).length
    return NextResponse.json({
      success: true, service: serviceName, timestamp, results,
      summary: { passed: passCount, failed: results.length - passCount, total: results.length },
    })
  }

  // ── routing_regression ───────────────────────────────────────────────────
  if (testType === 'routing_regression') {
    const cases = parseCases(body.cases, REGRESSION_SUITE)
    const results = cases.map(classifyCase)
    const passCount = results.filter(r => r.passed).length
    const byMode: Record<string, { passed: number; failed: number }> = {}
    for (const r of results) {
      const key = r.expected ?? r.actual
      if (!byMode[key]) byMode[key] = { passed: 0, failed: 0 }
      if (r.passed) byMode[key].passed++; else byMode[key].failed++
    }
    return NextResponse.json({
      success: true, service: serviceName, timestamp, results,
      summary: { passed: passCount, failed: results.length - passCount, total: results.length, by_mode: byMode },
    })
  }

  // ── openclaw_gaps ─────────────────────────────────────────────────────────
  // Targeted suite for the 5 routing gaps OpenClaw identified.
  if (testType === 'openclaw_gaps') {
    const cases = parseCases(body.cases, OPENCLAW_GAP_SUITE)
    const results = cases.map(classifyCase)
    const passCount = results.filter(r => r.passed).length
    const failed = results.filter(r => !r.passed)
    return NextResponse.json({
      success: true, service: serviceName, timestamp, results,
      summary: {
        passed: passCount,
        failed: results.length - passCount,
        total: results.length,
        all_passed: failed.length === 0,
        failing_cases: failed.map(r => ({ input: r.input, expected: r.expected, actual: r.actual })),
      },
    })
  }

  // ── health ───────────────────────────────────────────────────────────────
  if (testType === 'health') {
    const health = await runHealthCheck()
    return NextResponse.json({ success: true, service: serviceName, timestamp, ...health })
  }

  // ── auth_walls ───────────────────────────────────────────────────────────
  if (testType === 'auth_walls') {
    const customProbes = Array.isArray(body.probes)
      ? (body.probes as unknown[]).flatMap((p): ProbeCase[] => {
          if (p && typeof p === 'object' && 'path' in p && typeof (p as Record<string, unknown>).path === 'string') {
            const e = p as Record<string, unknown>
            return [{ path: String(e.path), method: typeof e.method === 'string' ? e.method : 'GET', expectedStatus: typeof e.expectedStatus === 'number' ? e.expectedStatus : 401, description: typeof e.description === 'string' ? e.description : undefined }]
          }
          return []
        })
      : AUTH_WALL_PROBES

    const results = await Promise.all(customProbes.map(p => probeEndpoint(origin, p)))
    const passCount = results.filter(r => r.passed).length
    return NextResponse.json({
      success: true, service: serviceName, timestamp, results,
      summary: { passed: passCount, failed: results.length - passCount, total: results.length },
    })
  }

  // ── endpoint_probe ───────────────────────────────────────────────────────
  if (testType === 'endpoint_probe') {
    if (!Array.isArray(body.probes) || (body.probes as unknown[]).length === 0) {
      return NextResponse.json({ error: '"probes" array is required for testType "endpoint_probe"' }, { status: 400 })
    }
    const probes = (body.probes as unknown[]).flatMap((p): ProbeCase[] => {
      if (p && typeof p === 'object' && 'path' in p && typeof (p as Record<string, unknown>).path === 'string') {
        const e = p as Record<string, unknown>
        return [{ path: String(e.path), method: typeof e.method === 'string' ? e.method : 'GET', expectedStatus: typeof e.expectedStatus === 'number' ? e.expectedStatus : 200, description: typeof e.description === 'string' ? e.description : undefined }]
      }
      return []
    })
    const results = await Promise.all(probes.map(p => probeEndpoint(origin, p)))
    const passCount = results.filter(r => r.passed).length
    return NextResponse.json({
      success: true, service: serviceName, timestamp, results,
      summary: { passed: passCount, failed: results.length - passCount, total: results.length },
    })
  }

  // ── full_audit ───────────────────────────────────────────────────────────
  if (testType === 'full_audit') {
    const [routingResults, health, authResults] = await Promise.all([
      Promise.resolve(REGRESSION_SUITE.map(classifyCase)),
      runHealthCheck(),
      Promise.all(AUTH_WALL_PROBES.map(p => probeEndpoint(origin, p))),
    ])

    const routingPass = routingResults.filter(r => r.passed).length
    const authPass = authResults.filter(r => r.passed).length
    const totalPass = routingPass + authPass
    const totalFail = (routingResults.length - routingPass) + (authResults.length - authPass)
    const healthFail = health.findings.filter(f => f.status === 'fail').length
    const healthWarn = health.findings.filter(f => f.status === 'warn').length

    return NextResponse.json({
      success: true,
      service: serviceName,
      timestamp,
      routing: {
        results: routingResults,
        summary: { passed: routingPass, failed: routingResults.length - routingPass, total: routingResults.length },
      },
      health: {
        level: health.level,
        findings: health.findings,
        actions: health.actions,
        summary: { fail: healthFail, warn: healthWarn, pass: health.findings.length - healthFail - healthWarn },
      },
      auth_walls: {
        results: authResults,
        summary: { passed: authPass, failed: authResults.length - authPass, total: authResults.length },
      },
      overall_summary: {
        passed: totalPass,
        failed: totalFail,
        total: totalPass + totalFail,
        health_level: health.level,
        health_actions_needed: health.actions.length,
        all_passed: totalFail === 0 && health.level === 'healthy',
      },
    })
  }

  return NextResponse.json(
    { error: `Unknown testType "${testType}". Supported: routing, routing_suite, routing_regression, openclaw_gaps, health, auth_walls, endpoint_probe, full_audit` },
    { status: 400 },
  )
}

// ── GET — liveness probe ─────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = authenticate(request)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({
    ok: true,
    service: (auth as ServiceAuth).name,
    timestamp: new Date().toISOString(),
    supported_test_types: [
      'routing',
      'routing_suite',
      'routing_regression',
      'openclaw_gaps',
      'health',
      'auth_walls',
      'endpoint_probe',
      'full_audit',
    ],
  })
}
