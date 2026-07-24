/**
 * Mission Tick Engine
 *
 * Runs one "tick" of a mission: loads GoalTree, asks AI to pick next
 * project/task, delegates to agents/workflows, saves updated state.
 */

import {
  Mission,
  MissionEvent,
  appendMissionEvent,
  getMissionEvents,
  updateMissionGoalTree,
  updateMissionStatus,
  scheduleMissionNextTick,
  countMissionTicksToday,
  computeNextTickAt,
  releaseMissionTick,
} from './mission-service'
import {
  GoalTree,
  generateGoalTree,
  needsGoalTree,
  getCurrentProject,
  startProject,
  advanceToNextProject,
  deserializeGoalTree,
  generateSessionHandoff,
} from '@/lib/computer-use/subgoal-planner'
import { createNonStreamingMessageWithFallback, normalizeModelForTransport, DEFAULT_MODEL } from '@/lib/ai/ai-client'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueAgentRun } from '@/lib/agents/run-queue'
import { notifyMissionProgress, notifyMissionCompleted, notifyMissionMilestone } from '@/lib/push-notifications'
import { dispatchWebhookEvent } from '@/lib/api-platform/webhooks'
import { randomUUID } from 'crypto'
import { extractAndStoreFacts, getRelevantIntelligence, formatIntelligenceForPrompt } from './mission-intelligence'
import { syncGoalTreeToBoard } from './board-sync'
import { routeByPhase } from '@/lib/ai/model-routing'
import { checkExecutionPolicy, inferActionClass, formatPolicyBlockReason } from './execution-policy'

// ============================================================
// Constants — Phase-aware model selection
// ============================================================

// First-run mission setup / goal-tree generation → premium planner (short burst)
const MISSION_SETUP_MODEL = routeByPhase('plan', 'mission').model
// Normal mission ticks → default workhorse (runs every 15–60 min)
const MISSION_TICK_MODEL = DEFAULT_MODEL
// Periodic audits / strategic re-evaluation → premium judge (short burst)
const MISSION_AUDIT_MODEL = routeByPhase('judge', 'mission').model

// ============================================================
// Main tick function
// ============================================================

export interface MissionTickResult {
  missionId: string
  success: boolean
  summary: string
  agentsCreated: number
  actionsPlanned: string[]
  error?: string
}

export async function runMissionTick(mission: Mission): Promise<MissionTickResult> {
  const tickStart = Date.now()
  const timeboxMs = mission.tick_timebox_minutes * 60 * 1000

  console.log(`[MissionTick] Starting tick for mission ${mission.id}: "${mission.goal}"`)

  try {
    // 1. Load / initialise GoalTree
    let goalTree: GoalTree | null = mission.goal_tree
      ? deserializeGoalTree(JSON.stringify(mission.goal_tree))
      : null

    const isNew = !goalTree
    if (isNew) {
      console.log('[MissionTick] Generating GoalTree for mission:', mission.id)
      await appendMissionEvent(mission.id, mission.workspace_id, mission.user_id, 'tick_started', `Starting mission tick for: "${mission.goal}"`)
      goalTree = await generateMissionGoalTree(mission)
    } else {
      const currentProjName = goalTree!.projects.find(p => p.id === goalTree!.current_project_id)?.name
      await appendMissionEvent(mission.id, mission.workspace_id, mission.user_id, 'tick_started',
        currentProjName ? `Tick started — working on "${currentProjName}"` : `Continuing mission tick`,
        { current_project: goalTree!.current_project_id, current_project_name: currentProjName }
      )
    }

    // Narrow type — generateGoalTree always returns a GoalTree (never null)
    let tree = goalTree as GoalTree

    // 2. Get current project
    let currentProject = getCurrentProject(tree)

    if (!currentProject) {
      if (tree.overall_status === 'completed') {
        await appendMissionEvent(mission.id, mission.workspace_id, mission.user_id, 'mission_completed', 'All projects completed. Mission achieved!', { goal: mission.goal })
        // Mark mission as completed in DB
        await updateMissionStatus(mission.id, 'completed')
        // Dispatch mission.completed webhook
        dispatchWebhookEvent(mission.user_id, 'mission.completed', {
          mission_id: mission.id,
          goal: mission.goal,
          completed_at: new Date().toISOString(),
        }).catch(() => {})
        // Post completion message to AI Manager conversation
        const allCompletionEvents = await getMissionEvents(mission.id).catch(() => [] as MissionEvent[])
        const totalTicks = allCompletionEvents.filter(e => e.kind === 'tick_completed').length
        const totalAgents = allCompletionEvents.filter(e => e.kind === 'agent_delegated').length
        if (mission.conversation_id) {
          const supabaseComplete = createAdminClient()
          const totalProjects = tree.projects.length
          const projectSummary = tree.projects.map(p => `  • ${p.name}`).join('\n')
          void supabaseComplete.from('messages').insert({
            conversation_id: mission.conversation_id,
            role: 'assistant',
            content: `🏆 **Mission accomplished!**\n\n**"${mission.goal}"**\n\nAll ${totalProjects} goal tree projects have been completed after **${totalTicks} ticks** and **${totalAgents} agents spawned**.\n\n**Completed phases:**\n${projectSummary}\n\nThis mission is now marked as **done**. The findings are available in the Missions page → Findings tab. Start a new mission anytime by describing a long-term goal!`,
            metadata: { type: 'mission_completed', mission_id: mission.id },
          } as never)
        }
        notifyMissionCompleted(mission.user_id, mission.id, mission.goal, totalTicks, totalAgents).catch(() => {})
        return {
          missionId: mission.id,
          success: true,
          summary: 'Mission completed! All projects have been finished.',
          agentsCreated: 0,
          actionsPlanned: [],
        }
      }
      // Find first pending project and start it
      const firstPending = tree.projects.find(p => p.status === 'pending')
      if (firstPending) {
        startProject(tree, firstPending.id)
        currentProject = firstPending
        await appendMissionEvent(mission.id, mission.workspace_id, mission.user_id, 'project_started',
          `Starting project: "${firstPending.name}"`, { project_id: firstPending.id, project_name: firstPending.name })
      }
    }

    // 3. Build the tick prompt
    const elapsed = () => Math.floor((Date.now() - tickStart) / 1000)
    const timeboxSeconds = mission.tick_timebox_minutes * 60

    // Fetch recent agent completions to feed back into this tick
    const recentEvents = await getMissionEvents(mission.id, 20).catch(() => [] as MissionEvent[])
    const agentCompletions = recentEvents
      .filter(e => e.kind === 'agent_completed')
      .slice(0, 5)

    // Advance in_progress tasks → completed when agents have finished since last tick
    if (agentCompletions.length > 0) {
      const currentProj = tree.projects.find(p => p.id === tree.current_project_id)
      if (currentProj) {
        const lastTickAt = mission.last_tick_at ? new Date(mission.last_tick_at).getTime() : 0
        const freshCompletions = agentCompletions.filter(e => new Date(e.created_at).getTime() > lastTickAt)
        const toComplete = Math.min(freshCompletions.length, currentProj.tasks.filter(t => t.status === 'in_progress').length)
        let marked = 0
        const completedTaskDescs: string[] = []
        for (const task of currentProj.tasks) {
          if (task.status === 'in_progress' && marked < toComplete) {
            task.status = 'completed'
            completedTaskDescs.push(task.description)
            marked++
          }
        }
        if (marked > 0) {
          console.log(`[MissionTick] Marked ${marked} task(s) completed based on agent completions`)
          // Update board cards for completed tasks (non-blocking)
          const { updateBoardCardStatus } = await import('./board-sync')
          for (const desc of completedTaskDescs) {
            updateBoardCardStatus(mission.workspace_id, mission.id, desc, 'completed').catch(() => {})
          }
        }
      }
    }

    // Extract intelligence from fresh agent completions into the shared bank (fire-and-forget)
    if (agentCompletions.length > 0) {
      const lastTickAt = mission.last_tick_at ? new Date(mission.last_tick_at).getTime() : 0
      const freshCompletionsForIntel = agentCompletions.filter(
        e => new Date(e.created_at).getTime() > lastTickAt
      )
      for (const evt of freshCompletionsForIntel.slice(0, 3)) {
        const summary = String(
          (evt.payload as Record<string, unknown>)?.agent_summary
          || (evt.payload as Record<string, unknown>)?.task
          || evt.summary || ''
        )
        if (summary.length > 50) {
          extractAndStoreFacts(mission.workspace_id, mission.id, mission.goal, summary).catch(() => {})
        }
      }
    }

    // After advancing tasks, check if current project is now fully complete
    const projAfterAdvance = tree.projects.find(p => p.id === tree.current_project_id)
    if (projAfterAdvance && projAfterAdvance.status !== 'completed') {
      const allDone = projAfterAdvance.tasks.every(t => t.status === 'completed')
      if (allDone && projAfterAdvance.tasks.length > 0) {
        console.log(`[MissionTick] Project "${projAfterAdvance.name}" fully done — advancing to next`)
        projAfterAdvance.status = 'completed'
        tree = advanceToNextProject(tree)
        currentProject = getCurrentProject(tree)
        if (currentProject && currentProject.status === 'pending') {
          tree = startProject(tree, currentProject.id)
          currentProject = getCurrentProject(tree)
          if (currentProject) {
            await appendMissionEvent(mission.id, mission.workspace_id, mission.user_id, 'project_started',
              `Starting project: "${currentProject.name}"`, { project_id: currentProject.id, project_name: currentProject.name })
            dispatchWebhookEvent(mission.user_id, 'mission.project_started', {
              mission_id: mission.id,
              project_id: currentProject.id,
              project_name: currentProject.name,
              started_at: new Date().toISOString(),
            }).catch(() => {})
          }
        }
        await appendMissionEvent(mission.id, mission.workspace_id, mission.user_id, 'milestone_reached',
          `Project complete: "${projAfterAdvance.name}"`, { project_id: projAfterAdvance.id, project_name: projAfterAdvance.name })

        // Push notification for milestone
        const completedProjCount = tree.projects.filter(p => p.status === 'completed').length
        notifyMissionMilestone(mission.user_id, mission.id, projAfterAdvance.name, completedProjCount, tree.projects.length).catch(() => {})

        // Post milestone to AI Manager conversation
        if (mission.conversation_id) {
          const nextProjName = getCurrentProject(tree)?.name
          ;(async () => { try { await createAdminClient().from('messages').insert({
            conversation_id: mission.conversation_id!,
            user_id: mission.user_id,
            role: 'assistant',
            content: `🏅 **Milestone reached!**\n\nProject **"${projAfterAdvance.name}"** is complete for mission: *"${mission.goal.slice(0, 80)}${mission.goal.length > 80 ? '…' : ''}"*\n\n${nextProjName ? `Now moving on to: **"${nextProjName}"**` : 'All projects are done — mission completion coming up!'}`,
            metadata: { type: 'milestone_reached', mission_id: mission.id, project_name: projAfterAdvance.name },
          } as never) } catch { /* non-critical */ } })()
        }
      }
    }

    // Fetch connected integrations to include in system prompt
    const supabaseForIntegrations = createAdminClient()
    const { data: connectionsData } = await supabaseForIntegrations
      .from('integration_connections')
      .select('integration_type, is_active')
      .eq('workspace_id', mission.workspace_id)
      .eq('is_active', true)
    const activeIntegrations = (connectionsData as Array<{ integration_type: string }> | null)
      ?.map(c => c.integration_type) ?? []

    // Fetch product metrics for growth/product/self-improvement missions (non-blocking)
    let metricsSnapshot: Record<string, unknown> | null = null
    const isGrowthOrProductMission = /grow|revenue|arr|mrr|users|signups|billion|million|product|improve|self.improv/i.test(mission.goal)
    if (isGrowthOrProductMission) {
      try {
        const { getProductMetrics } = await import('@/app/api/missions/metrics/route')
        metricsSnapshot = await getProductMetrics() as unknown as Record<string, unknown>
      } catch { /* metrics unavailable — proceed without */ }
    }

    // Fetch cross-mission intelligence bank (non-blocking)
    let intelligencePrompt = ''
    try {
      const facts = await getRelevantIntelligence(mission.workspace_id, mission.goal, 12)
      if (facts.length > 0) intelligencePrompt = formatIntelligenceForPrompt(facts)
    } catch { /* intelligence bank unavailable — proceed without */ }

    // Fetch workspace skills to inform mission planning
    let skillsContext = ''
    try {
      const { getEnabledSkillsAdmin } = await import('@/lib/skills/skill-registry')
      const enabledSkills = await getEnabledSkillsAdmin(mission.workspace_id)
      if (enabledSkills.length > 0) {
        const skillLines = enabledSkills.slice(0, 8).map(s => `- ${s.name} (${s.category}): ${s.description.slice(0, 120)}`).join('\n')
        skillsContext = `\n\nAvailable workspace skills that agents can leverage:\n${skillLines}`
      }
    } catch { /* skills unavailable — proceed without */ }

    const systemPrompt = buildMissionTickPrompt(mission, activeIntegrations)
    const userMessage = buildMissionTickUserMessage(mission, tree, elapsed, timeboxSeconds, agentCompletions, recentEvents, metricsSnapshot, intelligencePrompt + skillsContext)

    // 4. Call AI to plan the next action(s)
    console.log('[MissionTick] Calling AI for mission planning...')
    const { response } = await createNonStreamingMessageWithFallback({
      model: MISSION_TICK_MODEL,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    const planText = (response.content as Array<{ type: string; text?: string }>)
      .filter(b => b.type === 'text' && typeof b.text === 'string')
      .map(b => b.text as string)
      .join('')

    if (!planText) {
      throw new Error('No planning response from AI')
    }

    // 5. Execute delegations extracted from the plan
    // Attach recent failure count so executeMissionPlan can throttle agent spawning
    const recentFailureCount = recentEvents.filter(e => e.kind === 'agent_failed').length
    ;(tree as unknown as Record<string, unknown>)._recentFailureCount = recentFailureCount

    const { agentsCreated, actionsPlanned } = await executeMissionPlan(
      mission,
      planText,
      tree,
      timeboxMs - (Date.now() - tickStart)
    )

    // 6. Generate handoff note — parse structured JSON from planText
    const handoffSection = planText.match(/##\s*Handoff Note\s*\n([\s\S]*?)(?=\n##|$)/i)?.[1]?.trim() ?? ''
    let handoffNote: string
    let handoffStructured: Record<string, unknown> | null = null
    try {
      const jsonMatch = handoffSection.match(/```json\s*([\s\S]*?)```/i)?.[1]?.trim()
        ?? handoffSection.match(/\{[\s\S]*"next_priorities"[\s\S]*\}/)?.[0]
      if (jsonMatch) {
        handoffStructured = JSON.parse(jsonMatch) as Record<string, unknown>
        const summary = handoffStructured.progress_summary as string | undefined
        const nextPriority = (handoffStructured.next_priorities as string[] | undefined)?.[0]
        const findings = (handoffStructured.key_findings as string[] | undefined) ?? []
        handoffNote = [
          summary ?? '',
          findings.length > 0 ? `Key findings: ${findings.slice(0, 2).join('; ')}` : '',
          nextPriority ? `Next: ${nextPriority}` : '',
        ].filter(Boolean).join('\n')
      } else {
        handoffNote = handoffSection.length > 30
          ? handoffSection
          : (await generateSessionHandoff(tree, actionsPlanned.slice(0, 5), []))
      }
    } catch {
      handoffNote = handoffSection.length > 30
        ? handoffSection
        : (await generateSessionHandoff(tree, actionsPlanned.slice(0, 5), []))
    }

    // 7. Save updated GoalTree + handoff
    await updateMissionGoalTree(mission.id, tree, handoffNote)

    // 7b. Sync goal tree tasks to Kanban board (non-blocking)
    syncGoalTreeToBoard(mission.workspace_id, mission.id, tree).catch(err =>
      console.warn('[MissionTick] Board sync failed (non-critical):', err instanceof Error ? err.message : err)
    )

    // 8. Schedule next tick
    const ticksToday = await countMissionTicksToday(mission.id)
    const nextTickAt = computeNextTickAt(mission, ticksToday + 1)
    await scheduleMissionNextTick(mission.id, nextTickAt)

    // 9. Post progress to AI Manager conversation + push notification
    const summary = buildProgressSummary(mission, planText, agentsCreated, actionsPlanned, handoffNote, tree)
    await postProgressToConversation(mission, summary, agentsCreated, actionsPlanned, nextTickAt)
    const totalTasks = tree.projects.reduce((s, p) => s + p.tasks.length, 0)
    const doneTasks = tree.projects.reduce((s, p) => s + p.tasks.filter(t => t.status === 'completed').length, 0)
    const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : undefined
    notifyMissionProgress(mission.user_id, mission.id, mission.goal, summary, agentsCreated, progressPct).catch(() => {})
    dispatchWebhookEvent(mission.user_id, 'mission.tick_completed', {
      mission_id: mission.id,
      goal: mission.goal,
      summary,
      agents_created: agentsCreated,
      actions: actionsPlanned,
      next_tick_at: nextTickAt.toISOString(),
    }).catch(() => {})

    // 10. Log completion
    await appendMissionEvent(
      mission.id,
      mission.workspace_id,
      mission.user_id,
      'tick_completed',
      summary,
      {
        agents_created: agentsCreated,
        actions: actionsPlanned,
        next_tick_at: nextTickAt.toISOString(),
        progress_pct: progressPct ?? null,
        handoff_structured: handoffStructured ?? null,
      }
    )

    // 10b. Milestone celebration messages
    const totalTicksCompleted = await countMissionTicksToday(mission.id) // reuse — total context
    const allTickEvents = await getMissionEvents(mission.id)
    const allTickCount = allTickEvents.filter(e => e.kind === 'tick_completed').length
    const MILESTONES = [10, 25, 50, 100]
    if (MILESTONES.includes(allTickCount) && mission.conversation_id) {
      const emojis: Record<number, string> = { 10: '🎉', 25: '🚀', 50: '⚡', 100: '🏆' }
      const labels: Record<number, string> = { 10: 'first 10 ticks', 25: '25 ticks', 50: '50 ticks', 100: '100 ticks' }
      const milestoneMsg = `${emojis[allTickCount]} **Mission milestone — ${labels[allTickCount]} completed!**\n\n` +
        `Your mission **"${mission.goal.slice(0, 80)}"** has now run ${allTickCount} autonomous ticks. ` +
        `The AI workforce is making steady progress. Keep the mission running to see compounding results.`
      const supabaseMilestone = createAdminClient()
      void supabaseMilestone.from('messages').insert({
        conversation_id: mission.conversation_id,
        role: 'assistant',
        content: milestoneMsg,
        metadata: { type: 'mission_milestone', tick_count: allTickCount, mission_id: mission.id },
      } as never)
    }
    void totalTicksCompleted // suppress unused warning

    console.log(`[MissionTick] Tick completed for mission ${mission.id}. Next tick at ${nextTickAt.toISOString()}`)

    return {
      missionId: mission.id,
      success: true,
      summary,
      agentsCreated,
      actionsPlanned,
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[MissionTick] Tick failed for mission ${mission.id}:`, errorMsg)

    await appendMissionEvent(
      mission.id,
      mission.workspace_id,
      mission.user_id,
      'tick_failed',
      `Tick failed: ${errorMsg}`,
      { error: errorMsg }
    )

    // On failure: retry sooner (10 min) rather than waiting the full cadence interval
    const retryAt = new Date(Date.now() + 10 * 60 * 1000)
    await scheduleMissionNextTick(mission.id, retryAt)
    console.log(`[MissionTick] Scheduled retry for mission ${mission.id} at ${retryAt.toISOString()}`)

    return {
      missionId: mission.id,
      success: false,
      summary: `Tick failed: ${errorMsg}`,
      agentsCreated: 0,
      actionsPlanned: [],
      error: errorMsg,
    }
  } finally {
    await releaseMissionTick(mission.id)
  }
}

// ============================================================
// Mission-specific GoalTree generation
// ============================================================

async function generateMissionGoalTree(mission: Mission): Promise<GoalTree> {
  const autonomyNote = {
    draft_only: '\nAUTONOMY: Draft and research only — no irreversible actions like sending emails or making purchases.',
    execute_with_approval: '\nAUTONOMY: Can plan and research; execution tasks that are irreversible require flagging.',
    full_auto: '\nAUTONOMY: Full autonomous execution — agents can research, draft, outreach, and execute tasks.',
  }[mission.autonomy_level] ?? ''

  const companyContext = (mission.constraints as Record<string, unknown>)?.company_context as string | undefined
  const otherConstraints = mission.constraints
    ? Object.fromEntries(Object.entries(mission.constraints as Record<string, unknown>).filter(([k]) => k !== 'company_context'))
    : {}
  const companyContextBlock = companyContext
    ? `\n\nCOMPANY CONTEXT (use this to make every project and task hyper-specific):\n${companyContext}`
    : ''
  const constraintsNote = Object.keys(otherConstraints).length > 0
    ? `\n\nHARD CONSTRAINTS (never violate): ${JSON.stringify(otherConstraints)}`
    : ''

  const prompt = `You are a world-class strategic operator and McKinsey-level business planner. Your job is to take an ambitious mission goal and decompose it into the most high-leverage sequence of concrete projects that a team of AI agents can execute RIGHT NOW using web research, content creation, data analysis, and outreach.

MISSION GOAL: "${mission.goal}"${companyContextBlock}${constraintsNote}${autonomyNote}

THINK LIKE THIS:
1. What does "done" look like? What is the end state the user wants?
2. What are the critical unknowns that must be resolved first? (market, competitors, customers, budget, tech stack)
3. What foundational work unlocks everything else? Start there.
4. What are the highest-leverage execution levers? (distribution, partnerships, product differentiation, pricing, talent)
5. Sequence projects so each one builds on the previous — never work in parallel on things that depend on each other.

PROJECT DESIGN RULES:
- 4-7 projects ordered by dependency: intelligence → strategy → infrastructure → execution → scale
- Every project MUST produce a SPECIFIC TANGIBLE DELIVERABLE (a doc, spreadsheet, list, analysis, drafted content, or live artifact)
- Never create vague projects like "Research the market" — name the EXACT output: "50-row competitive intelligence spreadsheet with pricing, ICP, and moat analysis"
- Tasks must name SPECIFIC tools, sources, or platforms — never generic instructions
- Think about what a brilliant human analyst, growth hacker, or strategist would actually DO in 20 minutes
- For research: cite exact platforms (Crunchbase, SimilarWeb, G2, LinkedIn Sales Navigator, SEMrush, Apollo.io, PitchBook, Glassdoor)
- For content: define format + word count + audience + distribution channel + SEO keyword target
- For outreach: define persona + channel + message type + personalization hook + goal (reply? call? demo?)
- For product/tech: define acceptance criteria, feature scope, or architecture decision being made
- For financial: define the metric being calculated, data source, and decision it informs

AMBITIOUS GOAL PATTERNS (adapt to the actual mission):
- Valuation/funding goals → investor mapping, financial modeling, narrative building, comparable analysis, warm intro strategy
- Revenue growth goals → ICP definition, channel testing, sales motion, conversion optimization, partnership pipeline
- Product/market goals → customer discovery, competitive positioning, feature prioritization, pricing research, launch strategy
- Hiring/team goals → role scoping, sourcing strategy, interview playbook, comp benchmarking, employer brand
- Brand/awareness goals → content calendar, SEO strategy, PR outreach list, social playbook, community building

EXAMPLE HIGH-QUALITY TASKS (adapt to the ACTUAL MISSION — do NOT copy these verbatim):
- "Search Crunchbase + PitchBook for 20 recent Series A/B raises in [sector] 2023-2025. Extract: company name, ARR at raise, revenue multiple, lead investor, and 3-word value prop. Output: spreadsheet with Funding Round | ARR | Multiple | Investor | Why They Funded columns."
- "Find the 10 largest distribution partners in [industry] — define each as: partner type, audience size, typical deal structure, and one real company using this channel. Output: ranked table with Channel | Partner | Audience | Deal Type | Example."
- "Draft a cold outreach sequence for [target persona] (e.g. VP of Sales at 50-200 person B2B SaaS): 3 emails (Day 1, Day 4, Day 10), each under 90 words. Include subject line, opener personalization hook, value prop, and CTA. Output: full copy for all 3 emails."
- "Build a financial model for reaching [revenue target]: define 3 scenarios (conservative/base/optimistic), key drivers (CAC, LTV, churn, sales cycle), and monthly milestones for Year 1. Output: markdown table with Scenario | Key Assumption | Month 6 ARR | Month 12 ARR."

Respond ONLY with this JSON (no markdown, no comments, no explanation):
{
  "projects": [
    {
      "id": "p1",
      "name": "3-5 word project name that names the deliverable",
      "description": "One sentence: what SPECIFIC artifact or outcome this project produces and why it matters to the mission",
      "dependencies": [],
      "tasks": [
        {
          "id": "p1-t1",
          "description": "Precise task: [WHO does WHAT using WHICH TOOL/SOURCE, producing WHAT OUTPUT FORMAT]",
          "success_criteria": "Specific measurable signal that this task is complete (e.g. '50-row spreadsheet saved with all required columns filled')"
        }
      ]
    }
  ]
}`

  try {
    const { response } = await createNonStreamingMessageWithFallback({
      model: MISSION_SETUP_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    let text = (response.content as Array<{ type: string; text?: string }>)
      .filter(b => b.type === 'text' && b.text)
      .map(b => b.text as string)
      .join('')

    text = text.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '')
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const parsed = JSON.parse(jsonMatch[0]) as {
      projects?: Array<{
        id?: string; name?: string; description?: string; dependencies?: string[]
        tasks?: Array<{ id?: string; description?: string; success_criteria?: string }>
      }>
    }

    const projects = (parsed.projects ?? []).map((p, pi) => ({
      id: p.id ?? `p${pi + 1}`,
      name: p.name ?? `Phase ${pi + 1}`,
      description: p.description ?? '',
      dependencies: p.dependencies ?? [],
      status: 'pending' as const,
      tasks: (p.tasks ?? []).map((t, ti) => ({
        id: t.id ?? `p${pi + 1}-t${ti + 1}`,
        description: t.description ?? '',
        success_criteria: t.success_criteria ?? 'Task completed',
        status: 'pending' as const,
        tools_needed: [],
      })),
    }))

    if (projects.length === 0) throw new Error('No projects parsed')

    return {
      id: mission.id,
      original_goal: mission.goal,
      projects,
      current_project_id: projects[0]?.id ?? null,
      overall_status: 'executing' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      tool_discoveries: {},
    }
  } catch (err) {
    console.error('[MissionTick] generateMissionGoalTree failed, using fallback:', err)
    return generateGoalTree(mission.goal, { handoff_note: mission.handoff_note ?? undefined })
  }
}

// ============================================================
// Prompt builders
// ============================================================

const PRODUCT_CONTEXT = `
## PRODUCT CONTEXT: 2hands.ai

2hands.ai is an autonomous AI agent orchestration platform. Users create AI agents that run tasks
in the background, delegate long-term goals via "Mission Mode", and integrate with tools (GitHub,
Slack, Webhooks, APIs). The AI Manager is a persistent conversational AI that orchestrates agents,
runs scheduled tasks, and reports results.

CURRENT CAPABILITIES:
- AI Manager chat (Claude-powered, tool-use, web search, memory)
- Autonomous AI agents (run on demand, cron-scheduled, or mission-spawned)
- Mission Mode: long-running goals that tick every 15-60 min, spawn agents, report progress
- Workspace & team management (multi-workspace, RBAC, invites)
- Credentials vault (encrypted storage for API keys, OAuth tokens)
- Integrations: Slack, Discord, webhooks, custom connectors
- GitHub & Vercel tool packs for engineering agents
- Credits/billing system (workspace credits, Stripe)
- Usage analytics, audit logs, API keys

TARGET CUSTOMERS: Startups, indie hackers, SMBs, and enterprise teams who want AI doing real work
autonomously — not just chatting.

KEY GROWTH LEVERS:
1. Agent reliability & useful results → retention
2. Mission mode as the "set & forget" killer feature → differentiation  
3. Template library → lower activation barrier
4. Enterprise features (SSO, audit, compliance) → higher ACV
5. Integrations depth → stickiness

EXIT THESIS: Position as the "AI workforce management platform" — acquirable by OpenAI, Microsoft,
Salesforce, or HubSpot who need enterprise agent orchestration.
`

function buildMissionTickPrompt(mission: Mission, activeIntegrations: string[] = []): string {
  const autonomyDesc = {
    draft_only: 'You may plan and draft, but do NOT execute irreversible actions. Create GitHub issues, write plans, draft content.',
    execute_with_approval: 'You may create agents and schedule tasks, but flag irreversible actions (sending emails, merging PRs, spending money) as needing approval.',
    full_auto: 'You may delegate and execute autonomously within the configured constraints. Still avoid unauthorized spend and destructive data operations.',
  }[mission.autonomy_level]

  const ctxCompany = (mission.constraints as Record<string, unknown>)?.company_context as string | undefined
  const ctxOther = mission.constraints
    ? Object.fromEntries(Object.entries(mission.constraints as Record<string, unknown>).filter(([k]) => k !== 'company_context'))
    : {}
  const companyCtxBlock = ctxCompany
    ? `\nCOMPANY CONTEXT (ground every decision in this — name specific companies, metrics, people, products):\n${ctxCompany}`
    : ''
  const constraintsBlock = Object.keys(ctxOther).length > 0
    ? `\nHARD CONSTRAINTS (never violate):\n${JSON.stringify(ctxOther, null, 2)}`
    : ''

  return `You are an elite AI Mission Commander — a combination of McKinsey strategist, growth hacker, and seasoned operator. You are running a background mission tick to make real, measurable progress toward an ambitious goal.

MISSION GOAL: "${mission.goal}"${companyCtxBlock}
AUTONOMY: ${mission.autonomy_level} — ${autonomyDesc}${constraintsBlock}
CONNECTED INTEGRATIONS: ${activeIntegrations.length > 0 ? activeIntegrations.join(', ') : 'none'}
${activeIntegrations.length > 0 ? `INTEGRATION INSTRUCTION: Actively use these integrations — post updates to Slack, read GitHub issues, trigger webhooks to report findings.` : ''}

YOUR OPERATING PRINCIPLES:
1. THINK LIKE AN OPERATOR: Every tick should move the needle. Ask "what is the single action that most directly advances the mission goal right now?"
2. BUILD ON PRIOR WORK: Never repeat what's been done. Read prior agent findings carefully and synthesize — if research is done, move to strategy; if strategy exists, move to execution.
3. BE RELENTLESSLY SPECIFIC: Vague tasks produce vague results. Every agent gets: exact data sources, exact output format, exact success criteria. Name companies, tools, URLs, numbers.
4. THINK IN LEVERAGE: 1 great piece of analysis beats 5 shallow ones. 1 strong outreach sequence beats 50 cold emails. Choose depth over breadth.
5. ESCALATE INTELLIGENTLY: If a task repeatedly fails, change the approach entirely — new angle, new tool, new strategy. Never repeat a failed tactic.
6. CONNECT THE DOTS: Each tick's output should feed directly into the next tick's input. You are building a cumulative intelligence advantage.
7. RADICAL HONESTY: Never claim progress that hasn't been verified. If an agent failed or returned no results, say so. If a task wasn't completed, mark it as incomplete — not done. The user trusts this system to give ground truth, not optimistic fiction.

FOR AMBITIOUS GOALS (e.g. 10x growth, $1B valuation, market leadership):
- Start with intelligence: who has done this before? What were their key moves? What data do we need to make the best decisions?
- Then strategy: given the intelligence, what's the highest-probability path? What must be true for this to work?
- Then infrastructure: what assets, systems, or relationships need to exist before execution?
- Then execution: now actually move — build, outreach, ship, publish, pitch
- Then scale: what's working? Double down. Cut what isn't.

OUTPUT FORMAT (follow EXACTLY — these exact headers are parsed programmatically):

## Chosen Next Task
[2-3 sentences: WHAT you're doing this tick, WHY it's the highest-leverage move RIGHT NOW, and HOW it connects to prior work and the overall mission]

## Agent Delegations
[1-3 agents. Each MUST use this EXACT format on its own line:]
- [AgentName] agent: [Task: what to research/build/draft, using which specific tools/sources, producing exactly what output format with what level of detail]

STRONG DELEGATION EXAMPLES (adapt to the actual mission — do NOT copy verbatim):
- Valuation Benchmarks agent: Research 10 comparable companies in [sector] that raised Series B/C between 2022-2025. For each find: last known ARR, valuation at raise, revenue multiple, and key growth metric that justified the multiple. Source: Crunchbase, PitchBook, TechCrunch funding announcements. Output: table with Company | ARR | Valuation | Multiple | Key Metric | Source URL.
- Growth Channel Audit agent: Analyze the top 5 fastest-growing companies in [space] — for each identify their primary acquisition channel (SEO/paid/partnerships/PLG/outbound), estimated CAC, and 1 specific tactic they used. Use SimilarWeb traffic data, LinkedIn posts, and founder interviews. Output: ranked table with Company | Channel | CAC Est | Key Tactic | Evidence.
- Investor Mapping agent: Find 15 active investors who have funded [type of company] in the last 18 months. For each: name, firm, check size, portfolio companies in adjacent space, and best warm intro path. Source: Crunchbase, LinkedIn, PitchBook. Output: prioritized list with Investor | Firm | Check Size | Relevant Portfolio | Intro Strategy.
- Customer Discovery agent: Find 10 public case studies or interviews from customers of [competitor/adjacent product] who describe their pain points switching or choosing. Source: G2 reviews, Reddit threads, LinkedIn comments, podcast transcripts. Output: synthesized list of top 5 pain points with verbatim quote evidence and frequency count.

## Actions Taken This Tick
[4-6 specific bullets of concrete planned actions — name the actual agents, tasks, and expected outputs]

## Handoff Note
Return a JSON block (parsed programmatically — no extra text, just the JSON):
\`\`\`json
{
  "progress_summary": "2-3 sentences on what was accomplished this tick — specific, measurable",
  "key_findings": [
    "specific fact or insight with data point and source",
    "another specific finding"
  ],
  "decisions_made": [
    "decision taken with brief rationale"
  ],
  "metrics_snapshot": {
    "note": "any quantitative signals observed this tick (e.g. '5 competitors found, avg ARR $2M')"
  },
  "next_priorities": [
    "highest-leverage next action for the next tick — specific enough to execute immediately",
    "second priority",
    "third priority"
  ],
  "blockers": []
}
\`\`\``
}

function buildMissionTickUserMessage(
  mission: Mission,
  goalTree: GoalTree,
  elapsed: () => number,
  timeboxSeconds: number,
  agentCompletions: MissionEvent[] = [],
  recentAllEvents: MissionEvent[] = [],
  metricsSnapshot: Record<string, unknown> | null = null,
  intelligencePrompt = ''
): string {
  const completedCount = goalTree.projects.filter(p => p.status === 'completed').length
  const totalCount = goalTree.projects.length
  const currentProject = goalTree.projects.find(p => p.id === goalTree.current_project_id)

  const goalTreeSummary = [
    `**Goal:** ${goalTree.original_goal}`,
    `**Progress:** ${completedCount}/${totalCount} projects completed`,
    currentProject ? `**Current project:** ${currentProject.name} — ${currentProject.description}` : '**Status:** Planning next project',
    currentProject ? `**Tasks:**\n${currentProject.tasks.map(t => `  [${t.status}] ${t.description}`).join('\n')}` : '',
  ].filter(Boolean).join('\n')

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })

  const timeSinceLastTick = mission.last_tick_at
    ? (() => {
        const diffMs = Date.now() - new Date(mission.last_tick_at).getTime()
        const mins = Math.floor(diffMs / 60000)
        if (mins < 60) return `${mins} minutes ago`
        const hrs = Math.floor(mins / 60)
        if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`
        return `${Math.floor(hrs / 24)} day${Math.floor(hrs / 24) > 1 ? 's' : ''} ago`
      })()
    : 'first tick ever'

  // Try to parse structured handoff from last tick_completed event
  let handoff = ''
  if (mission.handoff_note) {
    let structuredHandoff: Record<string, unknown> | null = null
    try {
      const jsonMatch = mission.handoff_note.match(/```json\s*([\s\S]*?)```/i)?.[1]?.trim()
        ?? mission.handoff_note.match(/\{[\s\S]*"next_priorities"[\s\S]*\}/)?.[0]
      if (jsonMatch) structuredHandoff = JSON.parse(jsonMatch) as Record<string, unknown>
    } catch { /* plain text handoff */ }

    if (structuredHandoff) {
      const findings = (structuredHandoff.key_findings as string[] | undefined) ?? []
      const priorities = (structuredHandoff.next_priorities as string[] | undefined) ?? []
      const blockers = (structuredHandoff.blockers as string[] | undefined) ?? []
      const summary = structuredHandoff.progress_summary as string | undefined
      handoff = `\n\n## INTELLIGENCE FROM LAST TICK`
      if (summary) handoff += `\n**What was accomplished:** ${summary}`
      if (findings.length > 0) handoff += `\n**Key findings:**\n${findings.map(f => `  • ${f}`).join('\n')}`
      if (priorities.length > 0) handoff += `\n**Recommended next priorities:**\n${priorities.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}`
      if (blockers.length > 0) handoff += `\n**⚠️ Blockers:** ${blockers.join('; ')}`
    } else {
      handoff = `\n\nLAST TICK HANDOFF NOTE:\n${mission.handoff_note}`
    }
  }

  const agentContext = agentCompletions.length > 0
    ? `\n\nRECENT AGENT COMPLETIONS — Read these carefully and build on these findings:\n${agentCompletions.map((e, i) => {
        const summary = String(
          (e.payload as Record<string, unknown>)?.agent_summary
          || (e.payload as Record<string, unknown>)?.task
          || e.summary
          || e.kind
        )
        const agentName = (e.payload as Record<string, unknown>)?.agent_name || 'Agent'
        const date = new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        return `[${i + 1}] ${agentName} (${date}):\n${summary.slice(0, 500)}`
      }).join('\n\n')}

INSTRUCTION: Build on these findings. Do NOT repeat research already done by these agents. Pick up where they left off or address the gaps they identified.`
    : ''

  // Detect blocker patterns: tasks that have had multiple agent_failed events without completing
  const failedEvents = recentAllEvents.filter(e => e.kind === 'agent_failed').slice(-5)
  const blockerContext = failedEvents.length >= 2
    ? `\n\n⚠️ BLOCKER DETECTED: ${failedEvents.length} recent agent failures on this mission. The last failure was on task: "${String((failedEvents[failedEvents.length - 1].payload as Record<string, unknown>)?.task || 'unknown').slice(0, 120)}". IMPORTANT: Do NOT retry the same approach. Choose a completely different strategy, tool, or task this tick.`
    : ''

  const metricsBlock = metricsSnapshot
    ? `\n\n## LIVE PRODUCT METRICS (use these to measure if the mission is working)
- Active users (7d): ${metricsSnapshot.active_users_7d ?? 'N/A'}
- New signups (7d): ${metricsSnapshot.new_signups_7d ?? 'N/A'}
- Total users: ${metricsSnapshot.total_users ?? 'N/A'}
- Active missions: ${metricsSnapshot.active_missions ?? 'N/A'}
- Agents run (7d): ${metricsSnapshot.agents_run_7d ?? 'N/A'}
- Credits consumed (7d): ${metricsSnapshot.credits_consumed_7d ?? 'N/A'}
These metrics are your north star. Every action should either directly improve them or build the foundation to improve them.`
    : ''

  const intelBlock = intelligencePrompt ? `\n\n${intelligencePrompt}` : ''

  return `CURRENT DATE/TIME: ${dateStr} at ${timeStr}
LAST TICK: ${timeSinceLastTick}

${goalTreeSummary}${handoff}${agentContext}${metricsBlock}${intelBlock}${blockerContext}

TIMEBOX: You have approximately ${Math.floor((timeboxSeconds - elapsed()) / 60)} minutes remaining in this tick.

Given the above context, what is the single most valuable thing to do next for the mission "${mission.goal}"? Output your full ACTION PLAN.`
}

// ============================================================
// Action execution
// ============================================================

interface ExecutionResult {
  agentsCreated: number
  actionsPlanned: string[]
}

interface MissionSpawnGuardrails {
  maxAgentsPerTick: number
  maxActiveAgents: number
  maxAgentsPerDay: number
  queueBackpressureThreshold: number
  spawnFreeze: boolean
}

interface DelegationCandidate extends AgentDelegation {
  matchedTaskId: string | null
}

const DEFAULT_MISSION_SPAWN_GUARDRAILS: MissionSpawnGuardrails = {
  maxAgentsPerTick: 2,
  maxActiveAgents: 4,
  maxAgentsPerDay: 12,
  queueBackpressureThreshold: 15,
  spawnFreeze: false,
}

function parseIntConstraint(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const rounded = Math.round(value)
  return Math.max(min, Math.min(max, rounded))
}

function getMissionSpawnGuardrails(mission: Mission): MissionSpawnGuardrails {
  const constraints = (mission.constraints || {}) as Record<string, unknown>
  return {
    maxAgentsPerTick: parseIntConstraint(
      constraints.max_agents_per_tick,
      DEFAULT_MISSION_SPAWN_GUARDRAILS.maxAgentsPerTick,
      1,
      5
    ),
    maxActiveAgents: parseIntConstraint(
      constraints.max_active_agents,
      DEFAULT_MISSION_SPAWN_GUARDRAILS.maxActiveAgents,
      1,
      20
    ),
    maxAgentsPerDay: parseIntConstraint(
      constraints.max_agents_per_day,
      DEFAULT_MISSION_SPAWN_GUARDRAILS.maxAgentsPerDay,
      1,
      200
    ),
    queueBackpressureThreshold: parseIntConstraint(
      constraints.queue_backpressure_threshold,
      DEFAULT_MISSION_SPAWN_GUARDRAILS.queueBackpressureThreshold,
      1,
      200
    ),
    spawnFreeze: constraints.spawn_freeze === true,
  }
}

function normalizeForMatching(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasMeaningfulTaskOverlap(a: string, b: string): boolean {
  const aNorm = normalizeForMatching(a)
  const bNorm = normalizeForMatching(b)
  if (!aNorm || !bNorm) return false

  if (aNorm.includes(bNorm.slice(0, Math.min(40, bNorm.length)))) return true
  if (bNorm.includes(aNorm.slice(0, Math.min(40, aNorm.length)))) return true

  const stopwords = new Set(['with', 'from', 'that', 'this', 'into', 'using', 'agent', 'task', 'build', 'create', 'research'])
  const aTokens = new Set(aNorm.split(' ').filter(t => t.length > 3 && !stopwords.has(t)))
  const bTokens = new Set(bNorm.split(' ').filter(t => t.length > 3 && !stopwords.has(t)))
  if (aTokens.size === 0 || bTokens.size === 0) return false

  let overlap = 0
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      overlap += 1
      if (overlap >= 2) return true
    }
  }
  return false
}

async function executeMissionPlan(
  mission: Mission,
  planText: string,
  goalTree: GoalTree,
  remainingMs: number
): Promise<ExecutionResult> {
  const actionsPlanned: string[] = []
  let agentsCreated = 0

  if (remainingMs < 5000) {
    return { agentsCreated, actionsPlanned: ['Tick timebox reached before execution'] }
  }

  const guardrails = getMissionSpawnGuardrails(mission)

  if (guardrails.spawnFreeze) {
    actionsPlanned.push('Spawn freeze enabled by mission constraints; no new agents delegated this tick.')
    return { agentsCreated, actionsPlanned }
  }

  // If recent failures detected, be conservative and only spawn 1 agent.
  const recentFailures = (goalTree as unknown as { _recentFailureCount?: number })._recentFailureCount ?? 0
  const baseMaxAgentsPerTick = recentFailures >= 2 ? 1 : guardrails.maxAgentsPerTick

  const supabase = createAdminClient()
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  const [
    activeMissionAgentsRes,
    delegatedTodayRes,
    globalQueuedRunsRes,
    recentDelegationsRes,
  ] = await Promise.all([
    supabase
      .from('agents')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', mission.workspace_id)
      .contains('config', { mission_id: mission.id, mission_spawned: true })
      .in('status', ['idle', 'initializing', 'working']),
    supabase
      .from('mission_events')
      .select('id', { count: 'exact', head: true })
      .eq('mission_id', mission.id)
      .eq('kind', 'agent_delegated')
      .gte('created_at', startOfDay.toISOString()),
    supabase
      .from('agent_runs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'queued'),
    supabase
      .from('mission_events')
      .select('payload')
      .eq('mission_id', mission.id)
      .eq('kind', 'agent_delegated')
      .order('created_at', { ascending: false })
      .limit(25),
  ])

  const activeMissionAgents = activeMissionAgentsRes.count || 0
  const delegatedToday = delegatedTodayRes.count || 0
  const globalQueuedRuns = globalQueuedRunsRes.count || 0

  if (globalQueuedRuns >= guardrails.queueBackpressureThreshold) {
    actionsPlanned.push(
      `Queue backpressure active (${globalQueuedRuns} queued >= ${guardrails.queueBackpressureThreshold}); deferring new mission agents this tick.`
    )
    return { agentsCreated, actionsPlanned }
  }

  const remainingDailyBudget = Math.max(0, guardrails.maxAgentsPerDay - delegatedToday)
  const remainingActiveCapacity = Math.max(0, guardrails.maxActiveAgents - activeMissionAgents)
  const maxAgentsThisTick = Math.max(0, Math.min(baseMaxAgentsPerTick, remainingDailyBudget, remainingActiveCapacity))

  if (maxAgentsThisTick <= 0) {
    actionsPlanned.push(
      `Spawn guardrail reached (daily remaining: ${remainingDailyBudget}, active capacity: ${remainingActiveCapacity}); no new agents created this tick.`
    )
    return { agentsCreated, actionsPlanned }
  }

  const agentLines = extractAgentDelegations(planText).slice(0, maxAgentsThisTick)

  // Build set of completed task descriptions for dedup check
  const currentProj = goalTree.projects.find(p => p.id === goalTree.current_project_id)
  const completedTaskDescriptions = (currentProj?.tasks ?? [])
    .filter(t => t.status === 'completed')
    .map(t => t.description.toLowerCase().slice(0, 80))
  const pendingTasks = (currentProj?.tasks ?? [])
    .filter(t => t.status === 'pending')
  const recentDelegatedTaskDescriptions = ((recentDelegationsRes.data || []) as Array<{ payload?: Record<string, unknown> | null }>)
    .map(row => String((row.payload || {}).task || '').trim())
    .filter(Boolean)

  const reservedPendingTaskIds = new Set<string>()

  // Pre-filter: remove duplicates and out-of-scope delegations before spawning.
  const eligibleDelegations: DelegationCandidate[] = []
  for (const delegation of agentLines) {
    const delegLower = delegation.taskDescription.toLowerCase().slice(0, 80)
    const alreadyDone = completedTaskDescriptions.some(cd =>
      cd.includes(delegLower.slice(0, 40)) || delegLower.includes(cd.slice(0, 40))
    )
    if (alreadyDone) {
      console.log(`[MissionTick] Skipping agent "${delegation.agentName}" — task already completed: ${delegLower.slice(0, 60)}`)
      actionsPlanned.push(`Skipped (already done): ${delegation.agentName}`)
      continue
    }

    const recentlyDelegated = recentDelegatedTaskDescriptions.some(prev =>
      hasMeaningfulTaskOverlap(prev, delegation.taskDescription)
    )
    if (recentlyDelegated) {
      console.log(`[MissionTick] Skipping agent "${delegation.agentName}" — near-duplicate of recent delegation`)
      actionsPlanned.push(`Skipped (duplicate): ${delegation.agentName}`)
      continue
    }

    let matchedTaskId: string | null = null
    if (pendingTasks.length > 0) {
      const matchedTask = pendingTasks.find(task =>
        !reservedPendingTaskIds.has(task.id)
        && hasMeaningfulTaskOverlap(delegation.taskDescription, task.description)
      )
      if (!matchedTask) {
        console.log(`[MissionTick] Skipping agent "${delegation.agentName}" — delegation not relevant to pending GoalTree tasks`)
        actionsPlanned.push(`Skipped (out-of-scope): ${delegation.agentName}`)
        continue
      }
      matchedTaskId = matchedTask.id
      reservedPendingTaskIds.add(matchedTask.id)
    }

    // Execution policy gate: check whether the mission's autonomy level permits
    // the inferred action class of this delegation before spawning the agent.
    const inferredClass = inferActionClass(delegation.taskDescription)
    const policyResult = checkExecutionPolicy(mission.autonomy_level, inferredClass, mission.constraints)
    if (!policyResult.allowed) {
      console.log(`[MissionTick] Policy blocked agent "${delegation.agentName}" — ${policyResult.reason}`)
      actionsPlanned.push(`Blocked (policy): ${delegation.agentName} — ${formatPolicyBlockReason(policyResult)}`)
      appendMissionEvent(
        mission.id, mission.workspace_id, mission.user_id,
        'policy_blocked',
        `Agent "${delegation.agentName}" blocked by execution policy: ${policyResult.reason}`,
        { agent_name: delegation.agentName, action_class: inferredClass, autonomy_level: mission.autonomy_level }
      ).catch(() => {})
      continue
    }

    eligibleDelegations.push({
      ...delegation,
      matchedTaskId,
      _policyNeedsApproval: policyResult.needs_approval,
    } as DelegationCandidate & { _policyNeedsApproval?: boolean })
  }

  if (eligibleDelegations.length === 0) {
    actionsPlanned.push('No eligible, non-duplicate delegations matched pending mission tasks this tick.')
    return { agentsCreated, actionsPlanned }
  }

  // Spawn all eligible agents in PARALLEL (fire all DB inserts + enqueue calls concurrently)
  const spawnResults = await Promise.allSettled(
    eligibleDelegations.map(async (delegation): Promise<string | null> => {
    if (remainingMs < 5000) return null

    try {
      const { data: conversation } = await supabase
        .from('conversations')
        .insert({
          user_id: mission.user_id,
          workspace_id: mission.workspace_id,
          title: `${delegation.agentName} — Mission: ${mission.goal.slice(0, 40)}`,
        } as never)
        .select()
        .single()

      // Enrich the task description with mission context and output format requirements
      const currentProj = goalTree.projects.find(p => p.id === goalTree.current_project_id)
      const projectCtx = currentProj
        ? `\nCURRENT PROJECT: "${currentProj.name}" — ${currentProj.description}\nProject tasks:\n${currentProj.tasks.map(t => `  [${t.status}] ${t.description}`).join('\n')}`
        : ''
      const companyCtx = (mission.constraints as Record<string, unknown>)?.company_context as string | undefined
      const companyCtxBlock = companyCtx
        ? `\n\nCOMPANY CONTEXT:\n${companyCtx}`
        : ''

      // Self-improvement missions: inject repo context + engineering standards
      const isSelfImprovement = !!(mission.constraints as Record<string, unknown>)?.self_improvement
      const repoConfig = (mission.constraints as Record<string, unknown>)?.repo_config as {
        owner?: string; repo?: string; base_branch?: string; vercel_project_id?: string
      } | undefined
      const repoCtxBlock = isSelfImprovement && repoConfig
        ? `\n\nREPO ACCESS: You have full read/write access to the codebase at github.com/${repoConfig.owner}/${repoConfig.repo} (base branch: ${repoConfig.base_branch ?? 'dev'}).${repoConfig.vercel_project_id ? ` The Vercel project ID is "${repoConfig.vercel_project_id}" — you can trigger and monitor deployments.` : ''}

ENGINEERING STANDARDS (follow strictly):
- Always READ the relevant file(s) with github_read_file BEFORE writing any code
- Create a new branch for each change: use github_create_branch (branch off "${repoConfig.base_branch ?? 'dev'}")
- Write idiomatic TypeScript/React — match existing code style exactly
- After writing, create a PR with github_create_pr with a clear title and description of what changed and why
- NEVER push to main or dev directly — always use a feature branch + PR
- Branch naming: "ai/[short-description]-[timestamp-last4]" e.g. "ai/fix-mission-tick-1234"`
        : ''
      const isCodeAgent = delegation.agentType === 'code-engineer'
      const agentPersona = isCodeAgent
        ? 'You are an elite senior software engineer with deep expertise in TypeScript, Next.js, React, and Supabase.'
        : 'You are an elite research and execution specialist.'
      const agentStandards = isCodeAgent
        ? `ENGINEERING EXECUTION STANDARDS:
- Read code before writing it — use github_read_file to understand existing patterns
- Write minimal, focused changes — prefer single-file fixes over rewrites
- Every change must be testable and not break existing functionality
- Commit messages: "feat:", "fix:", "perf:", or "chore:" prefix + concise description`
        : `EXECUTION STANDARDS:
- Use web search aggressively — find real data, real companies, real numbers, real URLs
- Never write vague summaries. Every finding must have: a specific fact, a source, and an implication
- If you find contradictory data, note it and explain which source you trust more and why
- Think like a McKinsey analyst preparing a board-level briefing — precise, evidence-backed, actionable
- Prioritize recency: prefer data from the last 12 months where possible`

      const enrichedTask = `${agentPersona} Your work will directly advance an autonomous AI mission. Be specific and produce immediately actionable output.

MISSION GOAL: "${mission.goal}"${companyCtxBlock}${repoCtxBlock}${projectCtx}

YOUR TASK:
${delegation.taskDescription}

${agentStandards}

When complete, call task_complete with a summary in this EXACT format:

## Summary
[2-3 sentences: what you researched/built, the most important outcome, and why it matters for the mission]

## Key Findings
1. **[Finding/Change title]**: [Specific fact/code change with details] — Implication: [what this means for the mission]
2. **[Finding/Change title]**: [Specific fact/code change with details] — Implication: [what this means for the mission]
3. **[Finding/Change title]**: [Specific fact/code change with details] — Implication: [what this means for the mission]
(continue for all major findings — depth beats breadth)

## Data & Sources
- [Source name + URL or file path]: [what data/code was found here]

## Recommended Next Actions
1. [Specific concrete action for the next mission tick to take, based on these findings]
2. [Another specific action]
3. [Another specific action]

Do NOT produce generic output. If you cannot find specific data or complete code changes, explain exactly what you tried and what was missing.`

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const agentResult: any = await supabase
        .from('agents')
        .insert({
          user_id: mission.user_id,
          workspace_id: mission.workspace_id,
          name: delegation.agentName,
          type: delegation.agentType,
          status: 'idle',
          config: {
            description: enrichedTask,
            mission_id: mission.id,
            mission_spawned: true,
            agent_name: delegation.agentName,
            schedule_type: 'once',
            workspace_id: mission.workspace_id,
          },
          conversation_id: (conversation as { id?: string } | null)?.id ?? null,
        } as never)
        .select('id')
        .single()
      const agent = agentResult?.data as { id: string } | null
      const agentError = agentResult?.error

      if (agentError || !agent) return null

      // Mark the matched pending task as in_progress.
      const currentProjForTask = goalTree.projects.find(p => p.id === goalTree.current_project_id)
      if (currentProjForTask && delegation.matchedTaskId) {
        const taskStarted = currentProjForTask.tasks.find(t => t.id === delegation.matchedTaskId)
        if (taskStarted && taskStarted.status === 'pending') {
          taskStarted.status = 'in_progress'
          appendMissionEvent(mission.id, mission.workspace_id, mission.user_id, 'task_started',
            `Task started: "${taskStarted.description.slice(0, 100)}"`,
            { task_id: taskStarted.id, task_description: taskStarted.description, agent_name: delegation.agentName }
          ).catch(() => {})
        }
      }

      // Queue an actual run so the worker picks it up
      const runId = randomUUID()
      const nowIso = new Date().toISOString()

      await supabase
        .from('agents')
        .update({
          status: 'initializing',
          config: {
            description: enrichedTask,
            mission_id: mission.id,
            mission_spawned: true,
            schedule_type: 'once',
            execution_started: true,
            active_run_id: runId,
            active_run_started_at: nowIso,
            active_run_task: enrichedTask,
            active_run_mode: 'queued',
            workspace_id: mission.workspace_id,
          },
        } as never)
        .eq('id', agent.id)

      const enqueueResult = await enqueueAgentRun({
        runId,
        agentId: agent.id,
        userId: mission.user_id,
        triggerType: 'system',
        taskDescription: enrichedTask,
        metadata: {
          mission_id: mission.id,
          queue_mode: 'collect',
          mission_spawned: true,
          requested_at: nowIso,
        },
      })

      if (!enqueueResult.success) {
        console.error('[MissionTick] Failed to enqueue run for agent:', (agent as Record<string, unknown>).id, enqueueResult.error)
        await supabase
          .from('agents')
          .update({ status: 'idle', config: { description: delegation.taskDescription, mission_id: mission.id, mission_spawned: true, schedule_type: 'once', last_error: enqueueResult.error, last_error_at: nowIso, workspace_id: mission.workspace_id } } as never)
          .eq('id', agent.id)
      }

      await appendMissionEvent(
        mission.id,
        mission.workspace_id,
        mission.user_id,
        'agent_delegated',
        `Delegated task to agent "${delegation.agentName}"`,
        {
          agent_id: agent.id,
          agent_name: delegation.agentName,
          run_id: runId,
          task: delegation.taskDescription,
          run_queued: enqueueResult.success,
          conversation_id: (conversation as { id?: string } | null)?.id ?? null,
          matched_task_id: delegation.matchedTaskId,
          max_agents_this_tick: maxAgentsThisTick,
          delegated_today_before_create: delegatedToday,
          active_agents_before_create: activeMissionAgents,
          queue_depth_before_create: globalQueuedRuns,
          needs_approval: (delegation as DelegationCandidate & { _policyNeedsApproval?: boolean })._policyNeedsApproval ?? false,
          action_class: inferActionClass(delegation.taskDescription),
        }
      )

      return `Created agent "${delegation.agentName}": ${delegation.taskDescription.slice(0, 100)}`
    } catch (err) {
      console.error('[MissionTick] Failed to create agent:', err)
      return null
    }
    })
  )

  // Collect results from parallel spawning
  for (const result of spawnResults) {
    if (result.status === 'fulfilled') {
      if (result.value) {
        agentsCreated++
        actionsPlanned.push(result.value)
      }
    } else {
      console.error('[MissionTick] Failed to create agent (parallel):', result.reason)
    }
  }

  // Extract generic planned actions from bullet points
  const bulletActions = planText
    .split('\n')
    .filter(l => l.trim().startsWith('-') || l.trim().startsWith('•'))
    .map(l => l.replace(/^[-•]\s*/, '').trim())
    .filter(l => l.length > 10)
    .slice(0, 10)

  actionsPlanned.push(...bulletActions.filter(a => !actionsPlanned.some(e => e.includes(a.slice(0, 20)))))

  return { agentsCreated, actionsPlanned }
}

// ============================================================
// Plan parsing helpers
// ============================================================

interface AgentDelegation {
  agentName: string
  agentType: string
  taskDescription: string
}

function extractAgentDelegations(planText: string): AgentDelegation[] {
  const delegations: AgentDelegation[] = []

  const typeKeywords: Record<string, string> = {
    research: 'web-research',
    analys: 'data-analyst',
    email: 'email-assistant',
    outreach: 'email-assistant',
    code: 'code-engineer',
    engineer: 'code-engineer',
    develop: 'code-engineer',
    implement: 'code-engineer',
    refactor: 'code-engineer',
    bugfix: 'code-engineer',
    'pull request': 'code-engineer',
    ' pr ': 'code-engineer',
    github: 'code-engineer',
    typescript: 'code-engineer',
    nextjs: 'code-engineer',
    migration: 'code-engineer',
    market: 'custom',
    content: 'custom',
    growth: 'custom',
    seo: 'web-research',
    competitor: 'web-research',
    monitor: 'web-research',
    scrape: 'web-research',
  }

  const agentSection = planText.split(/##\s*Agent Delegations/i)[1] ?? ''
  const lines = agentSection.split('\n').filter(l => l.trim())

  for (const line of lines.slice(0, 6)) {
    if (!line.trim() || line.startsWith('#')) break

    // Try "- AgentName agent: task description" format first
    const structuredMatch = line.match(/^[-*•]\s*([A-Za-z][a-zA-Z0-9 ]{1,30}?)\s+(?:agent\s*)?[:—–]\s*(.+)/i)
    if (structuredMatch) {
      const name = structuredMatch[1].trim().replace(/\s+agent$/i, '')
      const task = structuredMatch[2].trim()
      const lower = (name + ' ' + task).toLowerCase()
      let agentType = 'custom'
      for (const [kw, type] of Object.entries(typeKeywords)) {
        if (lower.includes(kw)) { agentType = type; break }
      }
      delegations.push({ agentName: name, agentType, taskDescription: task })
      continue
    }

    // Fallback: extract name from line
    const nameMatch = line.match(/[*-]\s*["']?([A-Za-z][a-zA-Z0-9 ]{1,20}?)["']?\s*(?:[-:]|agent)/i)
    const name = nameMatch?.[1]?.trim() ?? deriveAgentName(line)
    if (!name) continue

    const lower = line.toLowerCase()
    let agentType = 'custom'
    for (const [kw, type] of Object.entries(typeKeywords)) {
      if (lower.includes(kw)) { agentType = type; break }
    }

    delegations.push({
      agentName: name,
      agentType,
      taskDescription: line.replace(/^[-*•]\s*/, '').trim(),
    })
  }

  return delegations
}

function deriveAgentName(line: string): string {
  const lower = line.toLowerCase()
  // Map task keywords to descriptive agent names
  if (lower.includes('market') && lower.includes('research')) return 'Market Research'
  if (lower.includes('competitor') || lower.includes('competition')) return 'Competitor Analysis'
  if (lower.includes('seo') || lower.includes('keyword')) return 'SEO Research'
  if (lower.includes('content') && lower.includes('strateg')) return 'Content Strategy'
  if (lower.includes('outreach') || lower.includes('email')) return 'Outreach'
  if (lower.includes('github') || lower.includes('code review')) return 'Code Review'
  if (lower.includes('scrape') || lower.includes('crawl')) return 'Web Scraper'
  if (lower.includes('analys') || lower.includes('data')) return 'Data Analyst'
  if (lower.includes('monitor') || lower.includes('track')) return 'Monitor'
  if (lower.includes('research') || lower.includes('find')) return 'Research'
  if (lower.includes('report') || lower.includes('summariz')) return 'Reporter'
  // Fallback: pick first capitalized word
  const words = line.replace(/[^a-zA-Z ]/g, ' ').trim().split(/\s+/)
  const candidate = words.find(w => w.length > 3 && /^[A-Z]/.test(w))
  return candidate ?? 'Scout'
}

// ============================================================
// Post progress to AI Manager conversation
// ============================================================

async function postProgressToConversation(
  mission: Mission,
  summary: string,
  agentsCreated: number,
  actionsPlanned: string[],
  nextTickAt: Date
): Promise<void> {
  if (!mission.conversation_id) return

  try {
    const supabase = createAdminClient()
    // Compute progress % for chat message
    const missionWithTree = (await supabase.from('missions').select('goal_tree').eq('id', mission.id).single()).data as { goal_tree?: unknown } | null
    const gt = missionWithTree?.goal_tree as {
      projects?: Array<{ id?: string; name?: string; status?: string; tasks?: Array<{ status?: string }> }>
      current_project_id?: string
    } | null
    const ttotal = gt?.projects?.reduce((s, p) => s + (p.tasks?.length ?? 0), 0) ?? 0
    const tdone = gt?.projects?.reduce((s, p) => s + (p.tasks?.filter(t => t.status === 'completed').length ?? 0), 0) ?? 0
    const pct = ttotal > 0 ? Math.round((tdone / ttotal) * 100) : null
    const pctStr = pct !== null ? ` · **${pct}% overall**` : ''
    const currentProjName = gt?.projects?.find(p => p.id === gt.current_project_id)?.name
    const projStr = currentProjName ? ` — *${currentProjName}*` : ''

    const minutesUntilNext = Math.round((nextTickAt.getTime() - Date.now()) / 60000)
    const nextStr = minutesUntilNext < 60 ? `in ${minutesUntilNext}m` : `in ${Math.round(minutesUntilNext / 60)}h`

    await supabase.from('messages').insert({
      conversation_id: mission.conversation_id,
      user_id: mission.user_id,
      role: 'assistant',
      content: `🎯 **Mission tick complete**${pctStr}${projStr}\n\n${summary}\n\n*Next tick ${nextStr}.*`,
      metadata: {
        type: 'mission_progress',
        mission_id: mission.id,
        goal: mission.goal,
        agents_created: agentsCreated,
        actions: actionsPlanned.slice(0, 5),
        next_tick_at: nextTickAt.toISOString(),
      },
    } as never)
  } catch (err) {
    console.error('[MissionTick] Failed to post progress to conversation:', err)
  }
}

function buildProgressSummary(
  mission: Mission,
  planText: string,
  agentsCreated: number,
  actionsPlanned: string[],
  handoffNote: string | undefined,
  goalTree?: GoalTree
): string {
  const parts: string[] = []

  // Task progress line
  if (goalTree) {
    const total = goalTree.projects.reduce((s, p) => s + p.tasks.length, 0)
    const done = goalTree.projects.reduce((s, p) => s + p.tasks.filter(t => t.status === 'completed').length, 0)
    const currentProj = goalTree.projects.find(p => p.id === goalTree.current_project_id)
    if (total > 0) {
      const pct = Math.round((done / total) * 100)
      parts.push(`**Progress:** ${done}/${total} tasks complete (${pct}%)${currentProj ? ` — on *${currentProj.name}*` : ''}`)
    }
  }

  // Extract chosen task rationale
  const chosenTask = planText.split(/##\s*Chosen Next Task/i)[1]?.split(/##/)[0]?.trim().slice(0, 250)
  if (chosenTask) parts.push(`**Focus this tick:** ${chosenTask}`)

  // Agent delegations
  if (agentsCreated > 0) {
    const agentList = actionsPlanned.slice(0, agentsCreated).map(a => `  • ${a.replace(/^Created agent ["']?[^"':]+["']?:\s*/i, '')}`)
    parts.push(`**Delegated to ${agentsCreated} agent${agentsCreated > 1 ? 's' : ''}:**\n${agentList.join('\n')}`)
  }

  // Next focus from handoff
  const handoffNext = handoffNote?.match(/\*\*Next task:\*\*\s*(.+)/)?.[1]?.trim()
  if (handoffNext) parts.push(`**Next task:** ${handoffNext.slice(0, 150)}`)

  return parts.join('\n\n') || 'Mission tick completed — planning next steps.'
}
