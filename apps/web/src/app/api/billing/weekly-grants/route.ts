/**
 * Weekly credit grant cron. POST with `Authorization: Bearer ${CRON_SECRET}`
 * (same pattern as /api/agents/worker). Grants the plan's weekly credits to
 * every workspace that has a subscription row OR was active in the last 30
 * days. v3_grant_weekly_credits is idempotent per UTC ISO week, so re-runs
 * are safe.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { newRequestId } from '@2hands/core'
import { success, failure } from '@/lib/v3/route-helpers'
import { grantWeeklyCredits } from '@/lib/v3/billing'

export const maxDuration = 120

function verifyCronAuth(request: NextRequest): NextResponse | null {
  const authHeader = request.headers.get('authorization')
  const cronSecret = (process.env.CRON_SECRET || '').trim()
  if (!cronSecret) {
    console.error('SECURITY: CRON_SECRET not configured - rejecting weekly-grants request')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const requestId = newRequestId()
  const admin = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = (name: string) => (admin as any).from(name)

  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const [{ data: subRows, error: subError }, { data: activeRows, error: activeError }] =
      await Promise.all([
        t('subscriptions').select('workspace_id').limit(5000),
        t('workspaces').select('id').gte('updated_at', cutoff).limit(5000),
      ])
    if (subError) throw new Error(`subscriptions read failed: ${subError.message}`)
    if (activeError) throw new Error(`workspaces read failed: ${activeError.message}`)

    const workspaceIds = new Set<string>()
    for (const row of (subRows ?? []) as Array<{ workspace_id: string }>) {
      workspaceIds.add(row.workspace_id)
    }
    for (const row of (activeRows ?? []) as Array<{ id: string }>) {
      workspaceIds.add(row.id)
    }

    let granted = 0
    let skipped = 0
    let errors = 0
    for (const workspaceId of workspaceIds) {
      try {
        const result = await grantWeeklyCredits(workspaceId)
        if (result.granted) granted++
        else skipped++
      } catch (error) {
        errors++
        console.error(
          `[weekly-grants] grant failed for workspace ${workspaceId}:`,
          error instanceof Error ? error.message : error,
        )
      }
    }

    return success({ scanned: workspaceIds.size, granted, skipped, errors }, requestId)
  } catch (error) {
    console.error('[weekly-grants] run failed:', error instanceof Error ? error.message : error)
    return failure(500, 'internal_error', 'Weekly grant run failed', requestId, true)
  }
}
