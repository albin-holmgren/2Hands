/**
 * Meta-Mission Orchestrator
 *
 * Runs daily to evaluate all active missions across all workspaces:
 * - Scores each mission by productivity (findings / failures)
 * - Adjusts tick cadence up for productive missions, down for stalled ones
 * - Cross-pollinates intelligence between missions in the same workspace
 * - Posts a weekly "Mission Intelligence Brief" to the AI Manager conversation
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createNonStreamingMessageWithFallback, normalizeModelForTransport } from '@/lib/ai/ai-client'
import { extractAndStoreFacts } from './mission-intelligence'

const ORCHESTRATOR_MODEL = normalizeModelForTransport('google/gemini-2.5-flash')

interface MissionSummary {
  id: string
  workspace_id: string
  user_id: string
  goal: string
  status: string
  conversation_id: string | null
  min_tick_interval_minutes: number
  tick_count: number
  agent_count: number
  failure_count: number
  last_tick_at: string | null
  handoff_note: string | null
}

/**
 * Run the daily orchestration pass for all workspaces.
 * Returns a summary of actions taken.
 */
export async function runDailyOrchestration(): Promise<{
  missionsEvaluated: number
  cadenceAdjustments: number
  intelligenceExtracted: number
  briefsPosted: number
}> {
  const supabase = createAdminClient()
  const stats = { missionsEvaluated: 0, cadenceAdjustments: 0, intelligenceExtracted: 0, briefsPosted: 0 }

  // Fetch all active missions with event counts
  const { data: missions, error } = await supabase
    .from('missions')
    .select('id, workspace_id, user_id, goal, status, conversation_id, min_tick_interval_minutes, last_tick_at, handoff_note')
    .eq('status', 'active')

  if (error || !missions || missions.length === 0) {
    console.log('[Orchestrator] No active missions found')
    return stats
  }

  // Fetch event counts per mission in one query
  const missionIds = missions.map(m => (m as { id: string }).id)
  const { data: eventCounts } = await supabase
    .from('mission_events')
    .select('mission_id, kind')
    .in('mission_id', missionIds)
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

  const tickCounts: Record<string, number> = {}
  const agentCounts: Record<string, number> = {}
  const failureCounts: Record<string, number> = {}

  for (const evt of (eventCounts ?? []) as { mission_id: string; kind: string }[]) {
    if (evt.kind === 'tick_completed') tickCounts[evt.mission_id] = (tickCounts[evt.mission_id] ?? 0) + 1
    if (evt.kind === 'agent_delegated') agentCounts[evt.mission_id] = (agentCounts[evt.mission_id] ?? 0) + 1
    if (evt.kind === 'agent_failed' || evt.kind === 'tick_failed') failureCounts[evt.mission_id] = (failureCounts[evt.mission_id] ?? 0) + 1
  }

  const enrichedMissions: MissionSummary[] = missions.map(m => {
    const raw = m as Record<string, unknown>
    return {
      id: raw.id as string,
      workspace_id: raw.workspace_id as string,
      user_id: raw.user_id as string,
      goal: raw.goal as string,
      status: raw.status as string,
      conversation_id: raw.conversation_id as string | null,
      min_tick_interval_minutes: raw.min_tick_interval_minutes as number ?? 60,
      tick_count: tickCounts[raw.id as string] ?? 0,
      agent_count: agentCounts[raw.id as string] ?? 0,
      failure_count: failureCounts[raw.id as string] ?? 0,
      last_tick_at: raw.last_tick_at as string | null,
      handoff_note: raw.handoff_note as string | null,
    }
  })

  // Process each mission
  for (const mission of enrichedMissions) {
    stats.missionsEvaluated++

    // 1. Adjust tick cadence based on productivity score
    const cadenceChanged = await adjustTickCadence(mission)
    if (cadenceChanged) stats.cadenceAdjustments++

    // 2. Extract intelligence from recent handoff notes (cross-pollination)
    if (mission.handoff_note && mission.handoff_note.length > 100) {
      const stored = await extractAndStoreFacts(
        mission.workspace_id,
        mission.id,
        mission.goal,
        mission.handoff_note
      ).catch(() => 0)
      stats.intelligenceExtracted += stored
    }
  }

  // 3. Post weekly briefs — group by workspace, post once per workspace on Mondays
  const isMonday = new Date().getDay() === 1
  if (isMonday) {
    const workspaces = [...new Set(enrichedMissions.map(m => m.workspace_id))]
    for (const workspaceId of workspaces) {
      const workspaceMissions = enrichedMissions.filter(m => m.workspace_id === workspaceId)
      const posted = await postWeeklyBrief(workspaceMissions)
      if (posted) stats.briefsPosted++
    }
  }

  console.log(`[Orchestrator] Done — missions: ${stats.missionsEvaluated}, cadence changes: ${stats.cadenceAdjustments}, intel stored: ${stats.intelligenceExtracted}, briefs: ${stats.briefsPosted}`)
  return stats
}

/**
 * Adjust a mission's tick interval based on recent productivity.
 * Productive missions run more frequently; stalled ones slow down to save credits.
 */
async function adjustTickCadence(mission: MissionSummary): Promise<boolean> {
  const supabase = createAdminClient()
  const { tick_count, agent_count, failure_count, min_tick_interval_minutes } = mission

  // Score: agents created per tick — high = productive, low = stalled
  const productivityScore = tick_count > 0 ? agent_count / tick_count : 0
  const failureRate = tick_count > 0 ? failure_count / tick_count : 0

  let newInterval = min_tick_interval_minutes
  const MIN_INTERVAL = 20
  const MAX_INTERVAL = 240

  if (productivityScore >= 1.5 && failureRate < 0.3) {
    // Highly productive — speed up
    newInterval = Math.max(MIN_INTERVAL, Math.floor(min_tick_interval_minutes * 0.8))
  } else if (productivityScore < 0.5 || failureRate >= 0.5) {
    // Stalled or failing — slow down
    newInterval = Math.min(MAX_INTERVAL, Math.floor(min_tick_interval_minutes * 1.5))
  } else {
    // Normal — no change
    return false
  }

  if (newInterval === min_tick_interval_minutes) return false

  const { error } = await supabase
    .from('missions')
    .update({ min_tick_interval_minutes: newInterval } as never)
    .eq('id', mission.id)

  if (error) {
    console.error(`[Orchestrator] Failed to update cadence for mission ${mission.id}:`, error.message)
    return false
  }

  console.log(`[Orchestrator] Mission ${mission.id}: interval ${min_tick_interval_minutes}→${newInterval}min (score=${productivityScore.toFixed(2)}, failRate=${failureRate.toFixed(2)})`)
  return true
}

/**
 * Post a weekly intelligence brief to the AI Manager conversation of the most active user
 * in the workspace.
 */
async function postWeeklyBrief(missions: MissionSummary[]): Promise<boolean> {
  if (missions.length === 0) return false

  // Pick the mission with a conversation_id that has the most ticks
  const withConv = missions
    .filter(m => !!m.conversation_id)
    .sort((a, b) => b.tick_count - a.tick_count)
  if (withConv.length === 0) return false

  const target = withConv[0]
  const totalTicks = missions.reduce((s, m) => s + m.tick_count, 0)
  const totalAgents = missions.reduce((s, m) => s + m.agent_count, 0)
  const totalFailures = missions.reduce((s, m) => s + m.failure_count, 0)

  // Build the mission list summary
  const missionLines = missions.map(m => {
    const score = m.tick_count > 0 ? (m.agent_count / m.tick_count).toFixed(1) : '0'
    return `- **${m.goal.slice(0, 60)}**: ${m.tick_count} ticks, ${m.agent_count} agents spawned (productivity: ${score} agents/tick)`
  }).join('\n')

  // Use AI to write a natural brief
  let brief = ''
  try {
    const { response } = await createNonStreamingMessageWithFallback({
      model: ORCHESTRATOR_MODEL,
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Write a concise weekly mission intelligence brief (4-6 sentences, markdown) for a CEO/founder.

ACTIVE MISSIONS THIS WEEK:
${missionLines}

TOTAL ACTIVITY: ${totalTicks} ticks, ${totalAgents} agents spawned, ${totalFailures} failures, across ${missions.length} mission(s).

Tone: warm, executive, forward-looking. Highlight what's working, what's stalled, and what the top priority for next week should be. Start with "📊 **Weekly Mission Brief**" on its own line.`,
      }],
    })
    brief = (response.content as Array<{ type: string; text?: string }>)
      .filter(b => b.type === 'text' && b.text)
      .map(b => b.text as string)
      .join('')
  } catch {
    brief = `📊 **Weekly Mission Brief**\n\n${missions.length} active mission(s) ran ${totalTicks} ticks this week, spawning ${totalAgents} agents. ${totalFailures > 0 ? `${totalFailures} failures were encountered.` : 'All missions ran without failures.'}\n\n**Active missions:**\n${missionLines}`
  }

  const supabase = createAdminClient()
  const { error } = await supabase.from('messages').insert({
    conversation_id: target.conversation_id!,
    user_id: target.user_id,
    role: 'assistant',
    content: brief,
    metadata: {
      type: 'weekly_mission_brief',
      missions_count: missions.length,
      total_ticks: totalTicks,
      total_agents: totalAgents,
    },
  } as never)

  if (error) {
    console.error('[Orchestrator] Failed to post weekly brief:', error.message)
    return false
  }

  console.log(`[Orchestrator] Posted weekly brief to conversation ${target.conversation_id}`)
  return true
}
