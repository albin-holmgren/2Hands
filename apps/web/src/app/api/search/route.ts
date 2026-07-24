import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const query = request.nextUrl.searchParams.get('q')
    if (!query || query.trim().length < 2) {
      return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 })
    }

    const requestedWorkspaceId = request.nextUrl.searchParams.get('workspaceId')
      || request.cookies.get('2hands_active_workspace_id')?.value
      || null
    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })
    if (!scope.workspaceId) return NextResponse.json({ error: 'Workspace not found' }, { status: 403 })

    const searchTerm = `%${query.trim()}%`

    // Search messages
    const { data: messages } = await supabase
      .from('messages')
      .select('id, content, role, created_at, conversation_id')
      .eq('role', 'assistant')
      .ilike('content', searchTerm)
      .order('created_at', { ascending: false })
      .limit(20)

    // Search board cards
    const { data: cards } = await supabase
      .from('mission_cards')
      .select('id, title, description, status, created_at')
      .eq('workspace_id', scope.workspaceId)
      .or(`title.ilike.${searchTerm},description.ilike.${searchTerm}`)
      .order('created_at', { ascending: false })
      .limit(10)

    // Search memories
    const { data: memories } = await supabase
      .from('ai_manager_memories')
      .select('id, content, memory_type, created_at')
      .eq('user_id', user.id)
      .eq('workspace_id', scope.workspaceId)
      .ilike('content', searchTerm)
      .order('created_at', { ascending: false })
      .limit(10)

    return NextResponse.json({
      results: {
        messages: (messages ?? []).map((m: any) => ({
          id: m.id,
          type: 'message',
          content: m.content?.slice(0, 200),
          timestamp: m.created_at,
        })),
        cards: (cards ?? []).map((c: any) => ({
          id: c.id,
          type: 'card',
          title: c.title,
          content: c.description?.slice(0, 150),
          status: c.status,
          timestamp: c.created_at,
        })),
        memories: (memories ?? []).map((m: any) => ({
          id: m.id,
          type: 'memory',
          content: m.content?.slice(0, 200),
          memory_type: m.memory_type,
          timestamp: m.created_at,
        })),
      },
      total: (messages?.length ?? 0) + (cards?.length ?? 0) + (memories?.length ?? 0),
    })
  } catch (err) {
    console.error('[/api/search GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
