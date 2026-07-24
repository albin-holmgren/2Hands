import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'

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
    if (!scope.workspaceId) return NextResponse.json({ error: 'Workspace not found' }, { status: 403 })

    const type = request.nextUrl.searchParams.get('type') // 'board' | 'memories' | 'agents'

    if (type === 'board') {
      const { data: cards } = await supabase
        .from('mission_cards')
        .select('title, description, status, created_at, updated_at')
        .eq('workspace_id', scope.workspaceId)
        .order('status')
        .order('position')

      if (!cards || cards.length === 0) {
        return NextResponse.json({ error: 'No board cards to export' }, { status: 404 })
      }

      const csv = [
        'Title,Description,Status,Created,Updated',
        ...(cards as Array<{ title: string; description: string | null; status: string; created_at: string; updated_at: string }>).map(c =>
          `"${(c.title || '').replace(/"/g, '""')}","${(c.description || '').replace(/"/g, '""').replace(/\n/g, ' ')}","${c.status}","${c.created_at}","${c.updated_at}"`
        ),
      ].join('\n')

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="board-export-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      })
    }

    if (type === 'memories') {
      const { data: memories } = await supabase
        .from('ai_manager_memories')
        .select('content, memory_type, importance, created_at')
        .eq('user_id', user.id)
        .eq('workspace_id', scope.workspaceId)
        .order('created_at', { ascending: false })

      if (!memories || memories.length === 0) {
        return NextResponse.json({ error: 'No memories to export' }, { status: 404 })
      }

      const csv = [
        'Content,Type,Importance,Created',
        ...(memories as Array<{ content: string; memory_type: string; importance: number; created_at: string }>).map(m =>
          `"${(m.content || '').replace(/"/g, '""').replace(/\n/g, ' ')}","${m.memory_type}","${m.importance}","${m.created_at}"`
        ),
      ].join('\n')

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="memories-export-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      })
    }

    if (type === 'agents') {
      const { data: agents } = await supabase
        .from('agents')
        .select('name, status, config, created_at, updated_at')
        .eq('workspace_id', scope.workspaceId)
        .order('updated_at', { ascending: false })

      if (!agents || agents.length === 0) {
        return NextResponse.json({ error: 'No agents to export' }, { status: 404 })
      }

      const csv = [
        'Name,Status,Description,Last Summary,Created,Updated',
        ...(agents as Array<{ name: string; status: string; config: Record<string, unknown> | null; created_at: string; updated_at: string }>).map(a =>
          `"${(a.name || '').replace(/"/g, '""')}","${a.status}","${((a.config?.description as string) || '').replace(/"/g, '""').replace(/\n/g, ' ')}","${((a.config?.last_run_summary as string) || '').replace(/"/g, '""').replace(/\n/g, ' ')}","${a.created_at}","${a.updated_at}"`
        ),
      ].join('\n')

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="agents-export-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      })
    }

    return NextResponse.json({ error: 'Invalid type. Use: board, memories, or agents' }, { status: 400 })
  } catch (err) {
    console.error('[/api/export GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
