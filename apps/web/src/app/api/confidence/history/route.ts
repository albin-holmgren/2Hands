/**
 * GET /api/confidence/history
 *
 * Returns the last 24h of confidence snapshots plus a stability summary.
 * Used by the Health tab to show a "recent stability" signal.
 *
 * Auth: authenticated dashboard user OR internal secret.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readRecentSnapshots, summarizeRecentHealth } from '@/lib/confidence/snapshot'

export const runtime = 'nodejs'
export const maxDuration = 10

function hasSecretAuth(request: NextRequest): boolean {
  const auth = request.headers.get('authorization')
  const cronSecret = (process.env.CRON_SECRET || '').trim()
  const internalSecret = (process.env.INTERNAL_API_SECRET || '').trim()
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true
  if (internalSecret && auth === `Bearer ${internalSecret}`) return true
  return false
}

async function isAuthenticated(): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    return !error && Boolean(user)
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  const allowed = hasSecretAuth(request) || await isAuthenticated()
  if (!allowed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const hoursParam = request.nextUrl.searchParams.get('hours')
  const hours = Math.min(Math.max(parseInt(hoursParam ?? '24', 10), 1), 168) // 1h–7d

  const snapshots = await readRecentSnapshots(hours)
  const stability = summarizeRecentHealth(snapshots)

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    hours_requested: hours,
    stability,
    snapshots,
  })
}
