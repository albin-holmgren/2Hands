import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()

    // Fetch all missions for the user
    const { data: missionsRaw } = await admin
      .from('missions')
      .select('id, goal, status, goal_tree, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    const missions = (missionsRaw ?? []) as Array<{
      id: string; goal: string; status: string; created_at: string
      goal_tree?: { projects?: Array<{ status?: string; tasks?: Array<{ status?: string }> }> } | null
    }>

    if (missions.length === 0) {
      return NextResponse.json({ stats: [], summary: { active: 0, completed: 0, total_ticks: 0, total_agents: 0, total_findings: 0 } })
    }

    // Fetch event counts per mission in a single query
    const { data: eventsRaw } = await admin
      .from('mission_events')
      .select('mission_id, kind')
      .eq('user_id', user.id)
      .in('mission_id', missions.map(m => m.id))

    const events = (eventsRaw ?? []) as Array<{ mission_id: string; kind: string }>
    const tickCounts: Record<string, number> = {}
    const agentCounts: Record<string, number> = {}
    const findingsCounts: Record<string, number> = {}

    for (const ev of events) {
      if (ev.kind === 'tick_completed') tickCounts[ev.mission_id] = (tickCounts[ev.mission_id] ?? 0) + 1
      if (ev.kind === 'agent_delegated') agentCounts[ev.mission_id] = (agentCounts[ev.mission_id] ?? 0) + 1
      if (ev.kind === 'agent_completed') findingsCounts[ev.mission_id] = (findingsCounts[ev.mission_id] ?? 0) + 1
    }

    const stats = missions.map(m => {
      const tree = m.goal_tree
      const totalTasks = tree?.projects?.reduce((s, p) => s + (p.tasks?.length ?? 0), 0) ?? 0
      const doneTasks = tree?.projects?.reduce((s, p) => s + (p.tasks?.filter(t => t.status === 'completed').length ?? 0), 0) ?? 0
      const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
      return {
        id: m.id,
        goal: m.goal,
        status: m.status,
        tick_count: tickCounts[m.id] ?? 0,
        agent_count: agentCounts[m.id] ?? 0,
        findings_count: findingsCounts[m.id] ?? 0,
        progress_pct: progressPct,
        created_at: m.created_at,
      }
    })

    const summary = {
      active: missions.filter(m => m.status === 'active').length,
      completed: missions.filter(m => m.status === 'completed').length,
      total_ticks: Object.values(tickCounts).reduce((s, v) => s + v, 0),
      total_agents: Object.values(agentCounts).reduce((s, v) => s + v, 0),
      total_findings: Object.values(findingsCounts).reduce((s, v) => s + v, 0),
    }

    // Fetch recent mission events for notification bell (last 10, past 24h)
    const { data: recentEventsRaw } = await admin
      .from('mission_events')
      .select('id, kind, summary, created_at')
      .eq('user_id', user.id)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10)

    const recent_events = (recentEventsRaw ?? []) as Array<{ id: string; kind: string; summary: string | null; created_at: string }>

    return NextResponse.json({ stats, summary, recent_events })
  } catch (error) {
    console.error('[Missions Stats API]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
