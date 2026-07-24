import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export interface ProductMetrics {
  active_users_7d: number
  new_signups_7d: number
  active_missions: number
  completed_missions_7d: number
  agents_run_7d: number
  credits_consumed_7d: number
  total_users: number
  snapshot_at: string
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const metrics = await getProductMetrics()
    return NextResponse.json({ metrics })
  } catch (err) {
    console.error('[Metrics] Failed to fetch product metrics:', err)
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 })
  }
}

export async function getProductMetrics(): Promise<ProductMetrics> {
  const admin = createAdminClient()
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [
    activeUsersResult,
    newSignupsResult,
    activeMissionsResult,
    completedMissionsResult,
    agentsRunResult,
    creditsResult,
    totalUsersResult,
  ] = await Promise.allSettled([
    admin.from('messages')
      .select('user_id', { count: 'exact', head: false })
      .gte('created_at', since7d)
      .eq('role', 'user'),
    admin.from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since7d),
    admin.from('missions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
    admin.from('missions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('updated_at', since7d),
    admin.from('agent_runs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since7d),
    admin.from('agent_runs')
      .select('credits_used')
      .gte('created_at', since7d),
    admin.from('profiles')
      .select('id', { count: 'exact', head: true }),
  ])

  // Distinct active users by de-duping message user_ids
  let activeUsers7d = 0
  if (activeUsersResult.status === 'fulfilled' && activeUsersResult.value.data) {
    const userIds = new Set((activeUsersResult.value.data as { user_id: string }[]).map(r => r.user_id))
    activeUsers7d = userIds.size
  }

  const newSignups7d = newSignupsResult.status === 'fulfilled'
    ? (newSignupsResult.value.count ?? 0)
    : 0

  const activeMissions = activeMissionsResult.status === 'fulfilled'
    ? (activeMissionsResult.value.count ?? 0)
    : 0

  const completedMissions7d = completedMissionsResult.status === 'fulfilled'
    ? (completedMissionsResult.value.count ?? 0)
    : 0

  const agentsRun7d = agentsRunResult.status === 'fulfilled'
    ? (agentsRunResult.value.count ?? 0)
    : 0

  let creditsConsumed7d = 0
  if (creditsResult.status === 'fulfilled' && creditsResult.value.data) {
    creditsConsumed7d = (creditsResult.value.data as { credits_used: number | null }[])
      .reduce((sum, r) => sum + (r.credits_used ?? 0), 0)
  }

  const totalUsers = totalUsersResult.status === 'fulfilled'
    ? (totalUsersResult.value.count ?? 0)
    : 0

  return {
    active_users_7d: activeUsers7d,
    new_signups_7d: newSignups7d,
    active_missions: activeMissions,
    completed_missions_7d: completedMissions7d,
    agents_run_7d: agentsRun7d,
    credits_consumed_7d: creditsConsumed7d,
    total_users: totalUsers,
    snapshot_at: new Date().toISOString(),
  }
}
