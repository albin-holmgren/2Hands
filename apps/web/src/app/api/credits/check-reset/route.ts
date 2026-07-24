export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * On-demand daily credit reset check for the caller's active workspace.
 * Called client-side when the user loads the app.
 * If the workspace is on the free plan and credits_reset_at is >24h ago,
 * resets credits_balance = 300 + paid_credits_balance.
 * Accepts optional ?workspaceId= query param; falls back to the user's personal workspace.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const clientTimezone = typeof body?.timezone === 'string' && body.timezone ? body.timezone : 'UTC'

    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId')

    // Resolve the workspace to check — prefer explicit param, fall back to personal workspace
    let wsQuery = supabase
      .from('workspaces')
      .select('id, plan_type, credits_balance, paid_credits_balance, credits_reset_at')
      .eq('owner_id', user.id)

    if (workspaceId) {
      wsQuery = wsQuery.eq('id', workspaceId)
    } else {
      wsQuery = wsQuery.eq('is_personal', true)
    }

    const { data: workspace, error: wsError } = await wsQuery.single() as {
      data: {
        id: string
        plan_type: string | null
        credits_balance: number
        paid_credits_balance: number
        credits_reset_at: string | null
      } | null
      error: unknown
    }

    if (wsError || !workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    // Only reset free-tier workspaces
    if (workspace.plan_type && workspace.plan_type !== 'free') {
      return NextResponse.json({ reset: false, reason: 'not_free_tier', credits: workspace.credits_balance })
    }

    // Timezone-aware calendar day comparison
    // Determine today's date string in the user's local timezone
    const nowDate = new Date()
    const localToday = nowDate.toLocaleDateString('en-CA', { timeZone: clientTimezone }) // YYYY-MM-DD

    // Determine the calendar day of the last reset in the user's local timezone
    const lastResetLocal = workspace.credits_reset_at
      ? new Date(workspace.credits_reset_at).toLocaleDateString('en-CA', { timeZone: clientTimezone })
      : null

    const alreadyResetToday = lastResetLocal !== null && lastResetLocal >= localToday

    if (alreadyResetToday) {
      // Calculate hours until next local midnight for informational purposes
      const hoursUntilMidnight = (() => {
        try {
          const tz = clientTimezone
          const tomorrowLocal = new Date(nowDate.toLocaleDateString('en-CA', { timeZone: tz }) + 'T23:59:59')
          return Math.max(0, Math.ceil((tomorrowLocal.getTime() - nowDate.getTime()) / (1000 * 60 * 60)))
        } catch { return 24 }
      })()
      return NextResponse.json({
        reset: false,
        reason: 'already_reset_today',
        credits: workspace.credits_balance,
        hoursUntilReset: hoursUntilMidnight,
        timezone: clientTimezone,
        localToday,
      })
    }

    const newBalance = 300 + (workspace.paid_credits_balance ?? 0)

    const adminSupabase = createAdminClient()
    const { error: updateError } = await adminSupabase
      .from('workspaces')
      .update({
        credits_balance: newBalance,
        credits_reset_at: new Date().toISOString(),
      } as never)
      .eq('id', workspace.id)
      .eq('plan_type', 'free')

    if (updateError) {
      console.error('[Credit Check-Reset] Update error:', updateError)
      return NextResponse.json({ error: 'Failed to reset credits' }, { status: 500 })
    }

    console.log(`[Credit Check-Reset] Reset workspace ${workspace.id} to ${newBalance} credits (was ${workspace.credits_balance}, local date ${localToday}, tz ${clientTimezone})`)

    return NextResponse.json({
      reset: true,
      credits: newBalance,
      previousCredits: workspace.credits_balance,
      timezone: clientTimezone,
      localToday,
    })
  } catch (error) {
    console.error('[Credit Check-Reset] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
