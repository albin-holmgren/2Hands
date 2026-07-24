import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'
import type { SupabaseClient } from '@supabase/supabase-js'

type OfficeIntent = 'blocked' | 'approval' | 'working' | 'idle' | 'completed' | 'failed'

type AgentRow = {
  id: string
  name: string
  type: string
  status: 'initializing' | 'idle' | 'working' | 'completed' | 'failed' | 'terminated'
  last_active: string
  config: unknown
}

type PendingApproval = {
  id: string
  source: 'agent_approvals' | 'agent_pending_approvals'
  agent_id: string
  title: string
  description: string
  created_at: string
}

type MissionCard = {
  id: string
  title: string
  status: string
  agent_id: string | null
  mission_id: string | null
}

type MissionRow = {
  id: string
  goal: string
  status: string
  next_tick_at: string | null
  goal_tree: unknown
}

function untypedTable(sb: SupabaseClient, table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (sb as any).from(table)
}

function cardsTable(sb: SupabaseClient) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (sb as any).from('mission_cards')
}

function safeString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function extractConfig(cfg: unknown): Record<string, unknown> {
  if (!cfg || typeof cfg !== 'object') return {}
  return cfg as Record<string, unknown>
}

function extractLastProgress(cfg: Record<string, unknown>): {
  type: string
  message: string
  timestamp: string
  data?: Record<string, unknown>
} | null {
  const lp = cfg.last_progress
  if (!lp || typeof lp !== 'object') return null
  const obj = lp as Record<string, unknown>
  const type = safeString(obj.type)
  const message = safeString(obj.message)
  const timestamp = safeString(obj.timestamp)
  const data = obj.data && typeof obj.data === 'object' ? (obj.data as Record<string, unknown>) : undefined
  if (!type || !timestamp) return null
  return { type, message, timestamp, ...(data ? { data } : {}) }
}

function extractLastTool(cfg: Record<string, unknown>): {
  name: string | null
  action_type: string | null
  action_target: string | null
  timestamp: string | null
} | null {
  const events = Array.isArray(cfg.run_events) ? (cfg.run_events as Array<Record<string, unknown>>) : []
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    const kind = safeString(e.kind)
    const name = safeString(e.name)
    const timestamp = safeString(e.timestamp)

    const actionType = safeString(e.action_type) || safeString((e.data as Record<string, unknown> | undefined)?.action_type)
    const actionTarget = safeString(e.action_target) || safeString((e.data as Record<string, unknown> | undefined)?.action_target) || safeString((e.data as Record<string, unknown> | undefined)?.target)

    const looksLikeTool = kind === 'tool' || name.includes('computer_') || name.includes('browser_') || name.includes('navigate')

    if (looksLikeTool && (actionType || actionTarget || name)) {
      return {
        name: name || null,
        action_type: actionType || null,
        action_target: actionTarget || null,
        timestamp: timestamp || null,
      }
    }
  }
  return null
}

function computeIntent(params: {
  status: AgentRow['status']
  lastProgress: ReturnType<typeof extractLastProgress>
  approval?: PendingApproval
  activeRunTask?: string
  description?: string | null
  name?: string
}): { intent: OfficeIntent; intent_text: string } {
  if (params.lastProgress?.type === 'blocker') {
    return { intent: 'blocked', intent_text: params.lastProgress.message || 'Needs input' }
  }

  if (params.approval) {
    return {
      intent: 'approval',
      intent_text: params.approval.title || 'Approval needed',
    }
  }

  if (params.status === 'working' || params.status === 'initializing') {
    return {
      intent: 'working',
      intent_text: params.activeRunTask || params.lastProgress?.message || 'Working',
    }
  }

  if (params.status === 'completed') {
    return { intent: 'completed', intent_text: params.lastProgress?.message || 'Completed' }
  }

  if (params.status === 'failed') {
    return { intent: 'failed', intent_text: params.lastProgress?.message || 'Failed' }
  }

  // Idle: prefer last progress message, then description for purpose context
  const idleText = params.lastProgress?.message
    || (params.description ? params.description.slice(0, 60) : null)
    || 'Resting'
  return { intent: 'idle', intent_text: idleText }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sb = supabase as unknown as SupabaseClient

    const requestedWorkspaceId = request.nextUrl.searchParams.get('workspaceId')
      || request.cookies.get('2hands_active_workspace_id')?.value
      || null

    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })

    if (!scope.workspaceId || !scope.role) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 403 })
    }

    const [agentsRes, approvalsRes, missionsRes, cardsRes] = await Promise.all([
      untypedTable(sb, 'agents')
        .select('id, name, type, status, last_active, config')
        .eq('user_id', user.id)
        .eq('workspace_id', scope.workspaceId)
        .neq('status', 'terminated')
        .order('last_active', { ascending: false })
        .limit(100) as unknown as Promise<{ data: AgentRow[] | null; error: { message: string } | null }>,

      (async () => {
        const status = request.nextUrl.searchParams.get('approvals') || 'pending'

        const [agentApprovals, pendingApprovals] = await Promise.all([
          untypedTable(sb, 'agent_approvals')
            .select('id, agent_id, action_details, status, created_at')
            .eq('user_id', user.id)
            .eq('status', status)
            .order('created_at', { ascending: false })
            .limit(50) as Promise<{ data: Array<{ id: string; agent_id: string; action_details: Record<string, unknown> | null; status: string; created_at: string }> | null }>,

          untypedTable(sb, 'agent_pending_approvals')
            .select('id, agent_id, details, status, created_at')
            .eq('user_id', user.id)
            .eq('status', status)
            .order('created_at', { ascending: false })
            .limit(50) as Promise<{ data: Array<{ id: string; agent_id: string; details: Record<string, unknown> | null; status: string; created_at: string }> | null }>,
        ])

        const normalized: PendingApproval[] = [
          ...((agentApprovals.data ?? []).map(a => ({
            id: a.id,
            source: 'agent_approvals' as const,
            agent_id: a.agent_id,
            title: safeString(a.action_details?.title) || 'Approval needed',
            description: safeString(a.action_details?.description),
            created_at: a.created_at,
          }))),
          ...((pendingApprovals.data ?? []).map(a => ({
            id: a.id,
            source: 'agent_pending_approvals' as const,
            agent_id: a.agent_id,
            title: safeString(a.details?.title) || 'Approval needed',
            description: safeString(a.details?.description),
            created_at: a.created_at,
          }))),
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

        return {
          pending_count: normalized.length,
          items: normalized.slice(0, 10),
        }
      })(),

      untypedTable(sb, 'missions')
        .select('id, goal, status, next_tick_at, goal_tree')
        .eq('user_id', user.id)
        .eq('workspace_id', scope.workspaceId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(20) as unknown as Promise<{ data: MissionRow[] | null; error: { message: string } | null }>,

      cardsTable(sb)
        .select('id, title, status, agent_id, mission_id')
        .eq('workspace_id', scope.workspaceId)
        .in('status', ['in_progress', 'in_review'])
        .order('updated_at', { ascending: false })
        .limit(50) as Promise<{ data: MissionCard[] | null; error: { message: string } | null }>,
    ])

    if (agentsRes.error) {
      console.error('[Office Feed] Agents query error:', agentsRes.error)
      return NextResponse.json({ error: 'Failed to fetch feed data' }, { status: 400 })
    }

    const approvals = approvalsRes
    const approvalsByAgent = new Map<string, PendingApproval>()
    approvals.items.forEach(a => {
      if (!approvalsByAgent.has(a.agent_id)) approvalsByAgent.set(a.agent_id, a)
    })

    const agents = (agentsRes.data ?? []).map(a => {
      const cfg = extractConfig(a.config)
      const lastProgress = extractLastProgress(cfg)
      const lastTool = extractLastTool(cfg)
      const activeRunTask = safeString(cfg.active_run_task)
      const missionId = safeString(cfg.mission_id) || null
      const description = safeString(cfg.description) || null
      const approval = approvalsByAgent.get(a.id)

      const { intent, intent_text } = computeIntent({
        status: a.status,
        lastProgress,
        approval,
        activeRunTask,
        description,
        name: a.name,
      })

      return {
        id: a.id,
        name: a.name,
        type: a.type,
        status: a.status,
        last_active: a.last_active,
        intent,
        intent_text,
        description,
        mission_id: missionId,
        active_run_task: activeRunTask || null,
        last_progress: lastProgress,
        last_tool: lastTool,
        approval: approval ?? null,
      }
    })

    const blocked = agents.filter(a => a.intent === 'blocked')
    const hasApprovals = approvals.pending_count > 0

    const manager = (() => {
      if (hasApprovals) {
        const top = approvals.items[0]
        return {
          intent: 'triage_approvals',
          intent_text: top ? `Reviewing approvals: ${top.title}` : `Reviewing approvals (${approvals.pending_count})`,
        }
      }
      if (blocked.length > 0) {
        return {
          intent: 'unblock',
          intent_text: `Unblocking: ${blocked[0].name}`,
        }
      }
      if ((missionsRes.data ?? []).length > 0) {
        return {
          intent: 'plan',
          intent_text: `Planning: ${(missionsRes.data ?? [])[0]?.goal ?? 'Active missions'}`,
        }
      }
      return { intent: 'idle', intent_text: 'Monitoring' }
    })()

    return NextResponse.json({
      workspace_id: scope.workspaceId,
      manager,
      agents,
      approvals,
      missions: missionsRes.data ?? [],
      cards: cardsRes.data ?? [],
      generated_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[/api/office/feed GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
