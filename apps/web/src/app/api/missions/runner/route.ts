/**
 * Mission Runner — cron-secured endpoint
 *
 * Called by Vercel cron (or manually) to process due mission ticks.
 * Each tick: load GoalTree → plan → delegate → save state → schedule next.
 *
 * Vercel cron config (vercel.json):
 *   { "path": "/api/missions/runner", "schedule": "* /15 * * * *" }
 *   (every 15 minutes)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getDueMissions, claimMissionTick, appendMissionEvent, scheduleMissionNextTick, computeNextTickAt, countMissionTicksToday } from '@/lib/missions/mission-service'
import { runMissionTick } from '@/lib/missions/mission-tick'
import { createAdminClient } from '@/lib/supabase/admin'
import { recoverStaleRuns } from '@/lib/confidence/stale-recovery'
import { classifyBlockedReason } from '@/lib/confidence/failure-taxonomy'

export const maxDuration = 300

const MAX_MISSIONS_PER_RUN = 15
const MAX_LOCK_DURATION_MINUTES = 20
const MAX_CONCURRENT_TICKS = 3

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = (process.env.CRON_SECRET || process.env.SCHEDULER_SECRET || '').trim()
  if (!cronSecret) {
    console.error('SECURITY: CRON_SECRET not configured - rejecting mission runner request')
    return false
  }
  return authHeader === `Bearer ${cronSecret}`
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    const cronSecret = (process.env.CRON_SECRET || process.env.SCHEDULER_SECRET || '').trim()
    console.warn(`[MissionRunner] Unauthorized POST — CRON_SECRET ${cronSecret ? 'is set (token mismatch)' : 'not set'}, authorization header: ${request.headers.get('authorization')?.slice(0, 20) ?? 'none'}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  console.log(`[MissionRunner] POST trigger (manual or direct call)`)
  return runMissions()
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    const isCron = request.headers.get('x-vercel-cron') === '1'
    const cronSecret = (process.env.CRON_SECRET || process.env.SCHEDULER_SECRET || '').trim()
    console.warn(`[MissionRunner] Unauthorized GET — x-vercel-cron: ${isCron}, CRON_SECRET ${cronSecret ? 'is set' : 'not set'}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const trigger = request.headers.get('x-vercel-cron') === '1' ? 'vercel-cron' : 'manual-get'
  console.log(`[MissionRunner] GET trigger: ${trigger}`)
  return runMissions()
}

async function runMissions(): Promise<ReturnType<typeof NextResponse.json>> {
  const runId = `runner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  console.log(`[MissionRunner] Starting run ${runId}`)

  try {
    const supabase = createAdminClient()

    // Cleanup expired tick locks so stalled missions can be retried
    await supabase
      .from('mission_tick_locks')
      .delete()
      .lte('expires_at', new Date().toISOString())
    console.log(`[MissionRunner] Cleaned up expired tick locks`)

    // Heal stale agent runs and abandoned tick locks before processing new ticks
    try {
      const staleResult = await recoverStaleRuns()
      if (staleResult.stale_runs_recovered > 0 || staleResult.stale_locks_released > 0) {
        console.log(`[MissionRunner] Stale recovery: ${staleResult.stale_runs_recovered} runs healed, ${staleResult.stale_locks_released} locks released`)
      }
    } catch (staleErr) {
      console.warn('[MissionRunner] Stale recovery failed (non-fatal):', staleErr)
    }

    const dueMissions = await getDueMissions(MAX_MISSIONS_PER_RUN)
    console.log(`[MissionRunner] Found ${dueMissions.length} due missions (timestamp: ${new Date().toISOString()})`)
    if (dueMissions.length > 0) {
      console.log(`[MissionRunner] Due mission IDs: ${dueMissions.map(m => m.id.slice(0, 8)).join(', ')}`)
    }

    if (dueMissions.length === 0) {
      return NextResponse.json({ run_id: runId, processed: 0, results: [] })
    }

    const { count: activeLocks } = await supabase
      .from('mission_tick_locks')
      .select('*', { count: 'exact', head: true })
      .gt('expires_at', new Date().toISOString()) as { count: number | null }

    const lockSlots = MAX_CONCURRENT_TICKS - (activeLocks ?? 0)
    if (lockSlots <= 0) {
      console.log(`[MissionRunner] Max concurrent ticks (${MAX_CONCURRENT_TICKS}) reached. Skipping.`)
      return NextResponse.json({ run_id: runId, processed: 0, skipped: 'concurrency_limit' })
    }

    const missionsToProcess = dueMissions.slice(0, lockSlots)
    const results = []
    const userTickCount: Record<string, number> = {}
    const MAX_TICKS_PER_USER = 2

    for (const mission of missionsToProcess) {
      // Per-user concurrency: don't run more than 2 ticks simultaneously for the same user
      const userTicks = userTickCount[mission.user_id] ?? 0
      if (userTicks >= MAX_TICKS_PER_USER) {
        console.log(`[MissionRunner] User ${mission.user_id} already has ${userTicks} ticks running — deferring mission ${mission.id}`)
        results.push({ mission_id: mission.id, status: 'deferred_user_limit' })
        continue
      }
      userTickCount[mission.user_id] = userTicks + 1
      // ── Credits gate ────────────────────────────────────────────────────────
      // Check workspace credits before claiming a lock (avoid wasting the slot)
      const { data: ws } = await supabase
        .from('workspaces')
        .select('credits_balance')
        .eq('id', mission.workspace_id)
        .single()
      const workspaceCredits = (ws as { credits_balance?: number } | null)?.credits_balance ?? 0
      console.log(`[MissionRunner] Mission ${mission.id.slice(0, 8)} workspace credits: ${workspaceCredits}`)
      if (workspaceCredits <= 0) {
        console.warn(`[MissionRunner] Mission ${mission.id} BLOCKED — workspace ${mission.workspace_id} has ${workspaceCredits} credits`)
        const nextTick = computeNextTickAt(mission, mission.max_ticks_per_day) // reschedule tomorrow
        await scheduleMissionNextTick(mission.id, nextTick)
        await appendMissionEvent(
          mission.id,
          mission.workspace_id,
          mission.user_id,
          'mission_blocked',
          'Mission tick skipped: workspace has no credits remaining. Top up credits to resume.',
          { credits_balance: workspaceCredits, rescheduled_to: nextTick.toISOString() }
        )
        // Post to AI Manager conversation
        if (mission.conversation_id) {
          await supabase.from('messages').insert({
            conversation_id: mission.conversation_id,
            user_id: mission.user_id,
            role: 'assistant',
            content: `⚠️ **Mission paused** — "${mission.goal.slice(0, 60)}"\n\nThis workspace has run out of credits. The mission will resume as soon as credits are topped up. Go to **Settings → Billing** to add credits.`,
            metadata: { mission_id: mission.id, type: 'mission_blocked' },
          } as never)
        }
        results.push({ mission_id: mission.id, status: 'blocked_no_credits' })
        continue
      }
      // ── End credits gate ─────────────────────────────────────────────────────

      // Daily tick quota check
      const ticksToday = await countMissionTicksToday(mission.id)
      if (ticksToday >= mission.max_ticks_per_day) {
        console.log(`[MissionRunner] Mission ${mission.id} hit daily quota (${ticksToday}/${mission.max_ticks_per_day}) — scheduling tomorrow`)
        const nextTick = computeNextTickAt(mission, ticksToday)
        await scheduleMissionNextTick(mission.id, nextTick)
        results.push({ mission_id: mission.id, status: 'daily_quota_reached' })
        continue
      }

      const claimed = await claimMissionTick(mission.id, runId, Math.min(mission.tick_timebox_minutes + 15, MAX_LOCK_DURATION_MINUTES))
      if (!claimed) {
        console.log(`[MissionRunner] Could not claim lock for mission ${mission.id}, skipping`)
        results.push({ mission_id: mission.id, status: 'lock_failed' })
        continue
      }

      console.log(`[MissionRunner] Running tick for mission ${mission.id}: "${mission.goal}"`)
      const tickResult = await runMissionTick(mission)
      const failureCategory = tickResult.error ? classifyBlockedReason(tickResult.error) : undefined
      results.push({
        mission_id: mission.id,
        status: tickResult.success ? 'ok' : 'error',
        summary: tickResult.summary,
        agents_created: tickResult.agentsCreated,
        error: tickResult.error,
        failure_category: failureCategory,
      })
    }

    const summary = results.map(r => `${r.mission_id.slice(0, 8)}:${r.status}`).join(', ')
    console.log(`[MissionRunner] Run ${runId} complete. Processed: ${results.length}. Results: [${summary || 'none'}]`)
    return NextResponse.json({ run_id: runId, processed: results.length, results })
  } catch (error) {
    console.error(`[MissionRunner] Run ${runId} failed:`, error)
    return NextResponse.json({ error: 'Mission runner failed' }, { status: 500 })
  }
}
