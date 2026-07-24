export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getRuntimeReadinessReport } from '@/lib/proactive/runtime-readiness-report'
import { evaluateBroadRolloutReadiness } from '@/lib/readiness/gate'
import type { HealthLevel } from '@/lib/confidence/types'

function hasValidHeaderAuth(request: NextRequest): boolean {
  const configuredSecret = (process.env.INTERNAL_API_SECRET || '').trim()
  const providedSecret = (request.headers.get('x-security-audit-secret') || '').trim()
  return Boolean(configuredSecret) && Boolean(providedSecret) && configuredSecret === providedSecret
}

async function isAuthenticatedRequest(): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    return !error && Boolean(user)
  } catch {
    return false
  }
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  const value = raw ? Number.parseInt(raw, 10) : Number.NaN
  return Number.isFinite(value) ? value : fallback
}

function hasCriticalSecurityFailures(): number {
  const credentialKey = (process.env.CREDENTIAL_ENCRYPTION_KEY || '').trim()
  const vmSecret = (process.env.VM_SECRET || '').trim()

  let failures = 0
  if (Buffer.from(credentialKey || '', 'hex').length !== 32) failures++
  if (!vmSecret) failures++
  return failures
}

function hasHighSecurityFailures(): number {
  const cronSecret = (process.env.CRON_SECRET || '').trim()
  return cronSecret ? 0 : 1
}

export async function GET(request: NextRequest) {
  const allowed = hasValidHeaderAuth(request) || await isAuthenticatedRequest()
  if (!allowed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const daysRaw = request.nextUrl.searchParams.get('days')
  const days = daysRaw ? Number.parseInt(daysRaw, 10) : 7
  const windowDays = Number.isFinite(days) && days > 0 ? days : 7

  const runtime = await getRuntimeReadinessReport(undefined, windowDays)
  const minimumRunSample = parseIntEnv('READINESS_MIN_RUN_SAMPLE', 20)

  const evaluation = evaluateBroadRolloutReadiness({
    pilotWindowDays: windowDays,
    runSuccessRate: runtime.successRate,
    retryRunawayCount: runtime.retryExhaustedCount,
    p0Incidents: parseIntEnv('READINESS_P0_INCIDENTS', 0),
    p1Incidents: parseIntEnv('READINESS_P1_INCIDENTS', 0),
    securityCriticalFailures: hasCriticalSecurityFailures(),
    securityHighFailures: hasHighSecurityFailures(),
    minimumRunSampleReached: runtime.totalRuns >= minimumRunSample,
    ciGreen: String(process.env.READINESS_CI_GREEN || 'false').trim().toLowerCase() === 'true',
    opsRunbookApproved: String(process.env.READINESS_OPS_RUNBOOK_APPROVED || 'false').trim().toLowerCase() === 'true',
  })

  // level uses the shared HealthLevel vocabulary so all confidence endpoints
  // return the same structure: level + timestamp + payload
  const level: HealthLevel = evaluation.readyForBroadRollout
    ? 'healthy'
    : evaluation.failedCriteria.length > 2 ? 'unhealthy' : 'degraded'

  return NextResponse.json({
    level,
    status: evaluation.readyForBroadRollout ? 'ready' : 'not_ready',
    runtime,
    minimum_run_sample: minimumRunSample,
    evaluation,
    timestamp: new Date().toISOString(),
  }, {
    status: evaluation.readyForBroadRollout ? 200 : 503,
  })
}
