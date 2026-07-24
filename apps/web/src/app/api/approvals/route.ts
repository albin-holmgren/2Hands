import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Helper: access tables not yet in generated types without TS errors
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untypedTable = (sb: Awaited<ReturnType<typeof createClient>>, table: string) => (sb as any).from(table)

interface AgentApprovalRow {
  id: string; agent_id: string; action_type: string
  action_details: Record<string, unknown> | null
  status: string; created_at: string; expires_at: string | null; decided_at: string | null
}
interface PendingApprovalRow {
  id: string; agent_id: string; action_type: string | null
  details: Record<string, unknown> | null; action_description: string | null
  status: string; created_at: string; expires_at: string | null; responded_at: string | null
  risk_level: string | null
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const status = request.nextUrl.searchParams.get('status') || 'pending'

    // Resilient queries — each wrapped in try/catch so missing tables don't crash the page
    let agentApprovalsData: AgentApprovalRow[] = []
    let pendingApprovalsData: PendingApprovalRow[] = []

    try {
      const { data } = await untypedTable(supabase, 'agent_approvals')
        .select('id, agent_id, action_type, action_details, status, created_at, expires_at, decided_at')
        .eq('user_id', user.id)
        .eq('status', status)
        .order('created_at', { ascending: false })
        .limit(100) as { data: AgentApprovalRow[] | null }
      agentApprovalsData = data ?? []
    } catch { /* table may not exist */ }

    try {
      const { data } = await untypedTable(supabase, 'agent_pending_approvals')
        .select('id, agent_id, action_type, details, action_description, status, created_at, expires_at, responded_at, risk_level')
        .eq('user_id', user.id)
        .eq('status', status)
        .order('created_at', { ascending: false })
        .limit(100) as { data: PendingApprovalRow[] | null }
      pendingApprovalsData = data ?? []
    } catch { /* table may not exist */ }

    // Collect unique agent IDs to resolve names
    const agentIds = new Set<string>()
    for (const a of agentApprovalsData) agentIds.add(a.agent_id)
    for (const a of pendingApprovalsData) agentIds.add(a.agent_id)

    const agentNames: Record<string, string> = {}
    if (agentIds.size > 0) {
      try {
        const { data: agents } = await supabase
          .from('agents')
          .select('id, name')
          .in('id', Array.from(agentIds))
        for (const a of (agents ?? []) as Array<{ id: string; name: string }>) {
          agentNames[a.id] = a.name
        }
      } catch { /* non-critical */ }
    }

    const nowIso = new Date().toISOString()

    const normalized = [
      ...agentApprovalsData.map((a) => ({
        id: a.id,
        source: 'agent_approvals' as const,
        agent_id: a.agent_id,
        agent_name: agentNames[a.agent_id] || null,
        action_type: a.action_type,
        title: (a.action_details?.title as string) ?? a.action_type,
        description: (a.action_details?.description as string) ?? '',
        preview: (a.action_details?.preview as string) ?? null,
        status: (status === 'pending' && a.expires_at && a.expires_at < nowIso) ? 'expired' : a.status,
        created_at: a.created_at,
        expires_at: a.expires_at,
        decided_at: a.decided_at ?? null,
      })),
      ...pendingApprovalsData.map((a) => ({
        id: a.id,
        source: 'agent_pending_approvals' as const,
        agent_id: a.agent_id,
        agent_name: agentNames[a.agent_id] || null,
        action_type: a.action_type ?? 'agent_action',
        title: (a.details?.title as string) ?? a.action_description ?? 'Agent Action',
        description: (a.details?.description as string) ?? a.action_description ?? '',
        preview: (a.details?.preview as string) ?? null,
        risk_level: a.risk_level ?? null,
        status: (status === 'pending' && a.expires_at && a.expires_at < nowIso) ? 'expired' : a.status,
        created_at: a.created_at,
        expires_at: a.expires_at,
        decided_at: a.responded_at ?? null,
      })),
    ]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    // Always include pending count so the badge can show regardless of active tab
    let pendingCount = 0
    if (status !== 'pending') {
      // Quick count query for pending items
      try {
        const { data: pc1 } = await untypedTable(supabase, 'agent_approvals')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'pending') as { data: unknown; count: number | null }
        void pc1
      } catch { /* ignore */ }
      try {
        const { count: c1 } = await untypedTable(supabase, 'agent_approvals')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'pending') as { count: number | null }
        pendingCount += c1 ?? 0
      } catch { /* ignore */ }
      try {
        const { count: c2 } = await untypedTable(supabase, 'agent_pending_approvals')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'pending') as { count: number | null }
        pendingCount += c2 ?? 0
      } catch { /* ignore */ }
    } else {
      pendingCount = normalized.filter(a => a.status === 'pending').length
    }

    return NextResponse.json({ approvals: normalized, total: normalized.length, pending_count: pendingCount })
  } catch (err) {
    console.error('[/api/approvals GET]', err)
    // Return empty instead of 500 so the page still renders
    return NextResponse.json({ approvals: [], total: 0, pending_count: 0 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json() as { id: string; source: string; action: 'approved' | 'rejected' }
    const { id, source, action } = body

    if (!id || !source || !action) {
      return NextResponse.json({ error: 'Missing required fields: id, source, action' }, { status: 400 })
    }

    if (source === 'agent_approvals') {
      const { error } = await untypedTable(supabase, 'agent_approvals')
        .update({ status: action, decided_at: new Date().toISOString(), decided_by: user.id })
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) return NextResponse.json({ error: (error as { message: string }).message }, { status: 400 })
    } else if (source === 'agent_pending_approvals') {
      const { error } = await untypedTable(supabase, 'agent_pending_approvals')
        .update({ status: action, responded_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user.id)

      if (error) return NextResponse.json({ error: (error as { message: string }).message }, { status: 400 })
    } else {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[/api/approvals POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
