import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'
import type { SupabaseClient } from '@supabase/supabase-js'

interface MissionCard { id: string; agent_id: string | null; status: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cardsTable(supabase: SupabaseClient): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as unknown as any).from('mission_cards')
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const requestedWorkspaceId = request.cookies.get('2hands_active_workspace_id')?.value ?? null
    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })
    if (!scope.workspaceId) return NextResponse.json({ error: 'Workspace not found' }, { status: 403 })

    const body = await request.json() as {
      title?: string
      description?: string
      status?: string
      position?: number
      agent_id?: string | null
      mission_id?: string | null
    }

    // Build update payload
    const update: Record<string, unknown> = {}
    if (body.title !== undefined) update.title = body.title
    if (body.description !== undefined) update.description = body.description
    if (body.status !== undefined) update.status = body.status
    if (body.position !== undefined) update.position = body.position
    if ('agent_id' in body) update.agent_id = body.agent_id
    if ('mission_id' in body) update.mission_id = body.mission_id

    // Fetch current status before updating (for auto-run comparison)
    const prevStatus = body.status ? (await cardsTable(supabase).select('status').eq('id', id).single())?.data?.status : undefined
    const newStatus = body.status

    const { data, error } = await cardsTable(supabase)
      .update(update)
      .eq('id', id)
      .eq('workspace_id', scope.workspaceId)
      .select()
      .single() as { data: MissionCard | null; error: { message: string } | null }

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Auto-run: if moved to in_progress and has an associated agent, trigger agent run
    if (newStatus === 'in_progress' && prevStatus !== 'in_progress' && data?.agent_id) {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
        await fetch(`${baseUrl}/api/agents/run`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: request.headers.get('cookie') ?? '',
          },
          body: JSON.stringify({ agentId: data.agent_id, taskDescription: `Kanban card moved to In Progress (card_id: ${id})` }),
        })
      } catch (runErr) {
        console.warn('[Kanban] auto-run failed for agent', data.agent_id, runErr)
      }
    }

    // Board → Goal Tree sync: when a card with a mission_id is moved to "done",
    // mark the corresponding goal tree task as completed
    if (newStatus === 'done' && prevStatus !== 'done') {
      // Fetch full card data to get mission_id and title
      const { data: fullCard } = await cardsTable(supabase)
        .select('mission_id, title')
        .eq('id', id)
        .single() as { data: { mission_id: string | null; title: string } | null }

      if (fullCard?.mission_id && fullCard.title) {
        try {
          const { markGoalTreeTaskFromBoard } = await import('@/lib/missions/board-sync')
          await markGoalTreeTaskFromBoard(fullCard.mission_id, fullCard.title)
        } catch (syncErr) {
          console.warn('[Kanban] Goal tree sync failed (non-critical):', syncErr)
        }
      }
    }

    return NextResponse.json({ card: data })
  } catch (err) {
    console.error('[/api/boards/[id] PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const requestedWorkspaceId = request.cookies.get('2hands_active_workspace_id')?.value ?? null
    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })
    if (!scope.workspaceId) return NextResponse.json({ error: 'Workspace not found' }, { status: 403 })

    const { error } = await cardsTable(supabase)
      .delete()
      .eq('id', id)
      .eq('workspace_id', scope.workspaceId) as { error: { message: string } | null }

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[/api/boards/[id] DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
