// Force Node.js runtime
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Daily credit reset for free-tier workspaces.
 * Called by Vercel cron every hour.
 * Resets workspace credits to 300 + paid_credits_balance for free workspaces
 * whose last reset was >24 hours ago.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = (process.env.CRON_SECRET || '').trim()

  if (!cronSecret) {
    console.error('SECURITY: CRON_SECRET not configured - rejecting credit reset request')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    // Use start of current UTC calendar day as threshold so each workspace
    // gets at most one reset per calendar day regardless of when it last reset.
    const now = new Date()
    const todayUTCMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()

    // Find free workspaces due for a daily refill
    const { data: workspaces, error: fetchError } = await supabase
      .from('workspaces')
      .select('id, paid_credits_balance')
      .eq('plan_type', 'free')
      .or(`credits_reset_at.lt.${todayUTCMidnight},credits_reset_at.is.null`) as {
        data: Array<{ id: string; paid_credits_balance: number }> | null
        error: unknown
      }

    if (fetchError) {
      console.error('[Credit Reset] Workspace fetch error:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch workspaces' }, { status: 500 })
    }

    if (!workspaces || workspaces.length === 0) {
      return NextResponse.json({ success: true, resetCount: 0, timestamp: new Date().toISOString() })
    }

    let resetCount = 0
    for (const ws of workspaces) {
      const newBalance = 300 + (ws.paid_credits_balance ?? 0)
      const { error: updateError } = await supabase
        .from('workspaces')
        .update({
          credits_balance: newBalance,
          credits_reset_at: new Date().toISOString(),
        } as never)
        .eq('id', ws.id)

      if (updateError) {
        console.error(`[Credit Reset] Failed to reset workspace ${ws.id}:`, updateError)
      } else {
        resetCount++
      }
    }

    console.log(`[Credit Reset] Reset ${resetCount}/${workspaces.length} free workspaces to 300+paid credits`)

    return NextResponse.json({
      success: true,
      resetCount,
      dailyFreeCredits: 300,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Credit reset error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
