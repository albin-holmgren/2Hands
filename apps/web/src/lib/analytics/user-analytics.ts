/**
 * User Analytics — Success Metrics & ROI
 *
 * Computes the metrics that make users stay:
 * - Tasks completed, success rate
 * - Estimated hours saved
 * - Credits used & efficiency
 * - Agent performance rankings
 * - Weekly/monthly trends
 * - Mission mode stats (ticks, findings, agents spawned)
 *
 * Uses production tables: agents, agent_runs, mission_events, workspaces
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface UserAnalytics {
  overview: OverviewMetrics
  agents: AgentPerformance[]
  trends: TrendData
  roi: ROIMetrics
  missions: MissionAnalytics
}

export interface OverviewMetrics {
  totalAgentRuns: number
  successfulRuns: number
  failedRuns: number
  successRate: number
  totalCreditsUsed: number
  estimatedHoursSaved: number
  activeAgents: number
  totalAgents: number
}

export interface AgentPerformance {
  id: string
  name: string
  type: string
  status: string
  totalRuns: number
  successfulRuns: number
  failedRuns: number
  successRate: number
  creditsUsed: number
  avgDurationMinutes: number
  lastRunAt: string | null
  lastRunSummary: string | null
}

export interface TrendData {
  daily: DayMetric[]
  period: 'week' | 'month'
}

export interface DayMetric {
  date: string
  runs: number
  successes: number
  failures: number
  creditsUsed: number
  hoursSaved: number
  missionTicks: number
}

export interface ROIMetrics {
  monthlyCostUsd: number
  estimatedLaborSavedUsd: number
  roiMultiple: number
  costPerTask: number
  avgHumanCostPerTask: number
}

export interface MissionAnalytics {
  totalMissions: number
  activeMissions: number
  completedMissions: number
  totalTicks: number
  totalAgentsSpawned: number
  totalFindings: number
  missions: Array<{
    id: string
    goal: string
    status: string
    tickCount: number
    agentCount: number
    findingsCount: number
    progressPct: number
    createdAt: string
  }>
}

// Average minutes a human would spend on each task type
const HUMAN_TIME_ESTIMATES: Record<string, number> = {
  'web-research': 45,
  'email-assistant': 20,
  'data-analyst': 60,
  'file-organizer': 30,
  'custom': 35,
}

const AVG_HOURLY_RATE_USD = 30

/**
 * Get comprehensive analytics for a user, scoped to a workspace.
 */
export async function getUserAnalytics(
  userId: string,
  workspaceId: string,
  period: 'week' | 'month' = 'month'
): Promise<UserAnalytics> {
  const supabase = createAdminClient()
  const now = new Date()
  const periodStart = new Date(now)
  if (period === 'week') {
    periodStart.setDate(periodStart.getDate() - 7)
  } else {
    periodStart.setDate(periodStart.getDate() - 30)
  }
  const periodStartIso = periodStart.toISOString()

  // Parallel fetch all needed data from production tables
  const [
    agentsResult,
    runsResult,
    workspaceResult,
    missionsResult,
    missionEventsResult,
  ] = await Promise.all([
    // Agents — workspace scoped
    supabase
      .from('agents')
      .select('id, name, type, status, total_credits_used, last_run_at, config, created_at')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId),
    // Agent runs — the real run tracking table
    supabase
      .from('agent_runs')
      .select('run_id, agent_id, status, credits_used, created_at, completed_at, task_description')
      .eq('user_id', userId)
      .gte('created_at', periodStartIso)
      .order('created_at', { ascending: true }),
    // Workspace — credits and plan
    supabase
      .from('workspaces')
      .select('credits, plan')
      .eq('id', workspaceId)
      .single(),
    // Missions — workspace scoped
    supabase
      .from('missions')
      .select('id, goal, status, goal_tree, created_at')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false }),
    // Mission events — for tick/agent/finding counts
    supabase
      .from('mission_events')
      .select('mission_id, kind, created_at')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .gte('created_at', periodStartIso),
  ])

  const agentList = (agentsResult.data || []) as Array<{
    id: string; name: string; type: string; status: string;
    total_credits_used: number; last_run_at: string | null;
    config: { description?: string } | null; created_at: string
  }>

  const runList = (runsResult.data || []) as Array<{
    run_id: string; agent_id: string; status: string; credits_used: number;
    created_at: string; completed_at: string | null; task_description: string
  }>

  const workspaceData = workspaceResult.data as { credits: number; plan: string } | null

  const missionList = (missionsResult.data || []) as Array<{
    id: string; goal: string; status: string; created_at: string
    goal_tree?: { projects?: Array<{ status?: string; tasks?: Array<{ status?: string }> }> } | null
  }>

  const missionEventList = (missionEventsResult.data || []) as Array<{
    mission_id: string; kind: string; created_at: string
  }>

  // --- Compute agent performance ---
  const agentPerformance: AgentPerformance[] = agentList.map(agent => {
    const agentRuns = runList.filter(r => r.agent_id === agent.id)
    const completions = agentRuns.filter(r => r.status === 'completed')
    const failures = agentRuns.filter(r => r.status === 'failed')
    const total = completions.length + failures.length
    const creditsFromRuns = agentRuns.reduce((s, r) => s + (r.credits_used || 0), 0)

    // Avg duration from completed runs
    let totalDurationMs = 0
    let durationCount = 0
    for (const run of completions) {
      if (run.completed_at) {
        const dur = new Date(run.completed_at).getTime() - new Date(run.created_at).getTime()
        if (dur > 0 && dur < 24 * 60 * 60 * 1000) { // sanity: < 24h
          totalDurationMs += dur
          durationCount++
        }
      }
    }

    const lastCompletion = completions[completions.length - 1]

    return {
      id: agent.id,
      name: agent.name,
      type: agent.type,
      status: agent.status,
      totalRuns: total,
      successfulRuns: completions.length,
      failedRuns: failures.length,
      successRate: total > 0 ? Math.round((completions.length / total) * 100) : 0,
      creditsUsed: creditsFromRuns || agent.total_credits_used || 0,
      avgDurationMinutes: durationCount > 0 ? Math.round(totalDurationMs / durationCount / 60000) : 0,
      lastRunAt: agent.last_run_at,
      lastRunSummary: lastCompletion?.task_description?.slice(0, 150) || null,
    }
  })

  // --- Compute overview ---
  const totalRuns = agentPerformance.reduce((s, a) => s + a.totalRuns, 0)
  const successfulRuns = agentPerformance.reduce((s, a) => s + a.successfulRuns, 0)
  const failedRuns = agentPerformance.reduce((s, a) => s + a.failedRuns, 0)
  const totalCredits = agentPerformance.reduce((s, a) => s + a.creditsUsed, 0)
  const activeAgents = agentList.filter(a => ['idle', 'working', 'initializing'].includes(a.status)).length

  // Estimate hours saved
  let estimatedMinutesSaved = 0
  for (const agent of agentPerformance) {
    const minutesPerTask = HUMAN_TIME_ESTIMATES[agent.type] || 35
    estimatedMinutesSaved += agent.successfulRuns * minutesPerTask
  }
  // Also count mission ticks as work done (~15 min of human analysis per tick)
  const totalMissionTicks = missionEventList.filter(e => e.kind === 'tick_completed').length
  estimatedMinutesSaved += totalMissionTicks * 15

  const overview: OverviewMetrics = {
    totalAgentRuns: totalRuns,
    successfulRuns,
    failedRuns,
    successRate: totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0,
    totalCreditsUsed: totalCredits,
    estimatedHoursSaved: Math.round((estimatedMinutesSaved / 60) * 10) / 10,
    activeAgents,
    totalAgents: agentList.length,
  }

  // --- Compute daily trends (agent runs + mission ticks) ---
  const dailyMap = new Map<string, DayMetric>()
  const daysInPeriod = period === 'week' ? 7 : 30
  for (let i = 0; i < daysInPeriod; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateKey = d.toISOString().split('T')[0]
    dailyMap.set(dateKey, {
      date: dateKey,
      runs: 0,
      successes: 0,
      failures: 0,
      creditsUsed: 0,
      hoursSaved: 0,
      missionTicks: 0,
    })
  }

  for (const run of runList) {
    const dateKey = run.created_at.split('T')[0]
    const day = dailyMap.get(dateKey)
    if (day) {
      if (run.status === 'completed') {
        day.runs++
        day.successes++
        day.creditsUsed += run.credits_used || 0
        day.hoursSaved += 0.5
      } else if (run.status === 'failed') {
        day.runs++
        day.failures++
      }
    }
  }

  // Add mission ticks to daily trends
  for (const evt of missionEventList) {
    if (evt.kind === 'tick_completed') {
      const dateKey = evt.created_at.split('T')[0]
      const day = dailyMap.get(dateKey)
      if (day) {
        day.missionTicks++
        day.hoursSaved += 0.25 // ~15 min of human analysis per tick
      }
    }
  }

  const daily = Array.from(dailyMap.values()).reverse()

  // --- Compute missions analytics ---
  const missionTickCounts: Record<string, number> = {}
  const missionAgentCounts: Record<string, number> = {}
  const missionFindingsCounts: Record<string, number> = {}

  for (const evt of missionEventList) {
    if (evt.kind === 'tick_completed') missionTickCounts[evt.mission_id] = (missionTickCounts[evt.mission_id] ?? 0) + 1
    if (evt.kind === 'agent_delegated') missionAgentCounts[evt.mission_id] = (missionAgentCounts[evt.mission_id] ?? 0) + 1
    if (evt.kind === 'agent_completed') missionFindingsCounts[evt.mission_id] = (missionFindingsCounts[evt.mission_id] ?? 0) + 1
  }

  const missionAnalytics: MissionAnalytics = {
    totalMissions: missionList.length,
    activeMissions: missionList.filter(m => m.status === 'active').length,
    completedMissions: missionList.filter(m => m.status === 'completed').length,
    totalTicks: Object.values(missionTickCounts).reduce((s, v) => s + v, 0),
    totalAgentsSpawned: Object.values(missionAgentCounts).reduce((s, v) => s + v, 0),
    totalFindings: Object.values(missionFindingsCounts).reduce((s, v) => s + v, 0),
    missions: missionList.map(m => {
      const tree = m.goal_tree
      const totalTasks = tree?.projects?.reduce((s, p) => s + (p.tasks?.length ?? 0), 0) ?? 0
      const doneTasks = tree?.projects?.reduce((s, p) => s + (p.tasks?.filter(t => t.status === 'completed').length ?? 0), 0) ?? 0
      return {
        id: m.id,
        goal: m.goal,
        status: m.status,
        tickCount: missionTickCounts[m.id] ?? 0,
        agentCount: missionAgentCounts[m.id] ?? 0,
        findingsCount: missionFindingsCounts[m.id] ?? 0,
        progressPct: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
        createdAt: m.created_at,
      }
    }),
  }

  // --- Compute ROI ---
  const laborSavedUsd = (estimatedMinutesSaved / 60) * AVG_HOURLY_RATE_USD
  const planCosts: Record<string, number> = {
    free: 0, starter: 25, pro: 40, business: 100, team: 0,
  }
  const monthlyCost = planCosts[workspaceData?.plan || 'free'] || 0

  const roi: ROIMetrics = {
    monthlyCostUsd: monthlyCost,
    estimatedLaborSavedUsd: Math.round(laborSavedUsd),
    roiMultiple: monthlyCost > 0 ? Math.round((laborSavedUsd / monthlyCost) * 10) / 10 : 0,
    costPerTask: totalRuns > 0 ? Math.round((monthlyCost / totalRuns) * 100) / 100 : 0,
    avgHumanCostPerTask: Math.round((35 / 60) * AVG_HOURLY_RATE_USD * 100) / 100,
  }

  return {
    overview,
    agents: agentPerformance.sort((a, b) => b.totalRuns - a.totalRuns),
    trends: { daily, period },
    roi,
    missions: missionAnalytics,
  }
}
