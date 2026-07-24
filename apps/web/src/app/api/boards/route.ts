import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'
import type { SupabaseClient } from '@supabase/supabase-js'

interface MissionCard {
  id: string
  workspace_id: string
  title: string
  description: string | null
  status: string
  position: number
  agent_id: string | null
  mission_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// Helper to bypass Supabase generated types for mission_cards (not yet in schema types)
function cardsTable(supabase: SupabaseClient) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as unknown as any).from('mission_cards')
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const requestedWorkspaceId = request.nextUrl.searchParams.get('workspaceId')
      || request.cookies.get('2hands_active_workspace_id')?.value
      || null

    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })

    if (!scope.workspaceId) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 403 })
    }

    const { data, error } = await cardsTable(supabase)
      .select('id, title, description, status, position, agent_id, mission_id, created_by, created_at, updated_at')
      .eq('workspace_id', scope.workspaceId)
      .order('status')
      .order('position') as { data: MissionCard[] | null; error: { message: string } | null }

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ cards: data ?? [] })
  } catch (err) {
    console.error('[/api/boards GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const requestedWorkspaceId = request.nextUrl.searchParams.get('workspaceId')
      || request.cookies.get('2hands_active_workspace_id')?.value
      || null

    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })

    if (!scope.workspaceId) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 403 })
    }

    const body = await request.json() as {
      title: string
      description?: string
      status?: string
      agent_id?: string
      mission_id?: string
    }

    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const { data: existing } = await cardsTable(supabase)
      .select('position')
      .eq('workspace_id', scope.workspaceId)
      .eq('status', body.status ?? 'inbox')
      .order('position', { ascending: false })
      .limit(1) as { data: { position: number }[] | null }

    const nextPosition = existing && existing.length > 0 ? existing[0].position + 1000 : 0

    const { data, error } = await cardsTable(supabase)
      .insert({
        workspace_id: scope.workspaceId,
        title: body.title.trim(),
        description: body.description?.trim() ?? null,
        status: body.status ?? 'inbox',
        position: nextPosition,
        agent_id: body.agent_id ?? null,
        mission_id: body.mission_id ?? null,
        created_by: user.id,
      })
      .select()
      .single() as { data: MissionCard | null; error: { message: string } | null }

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ card: data }, { status: 201 })
  } catch (err) {
    console.error('[/api/boards POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
