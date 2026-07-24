import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'
import { syncGoalTreeToBoard } from '@/lib/missions/board-sync'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const requestedWorkspaceId = request.cookies.get('2hands_active_workspace_id')?.value ?? null
    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })
    if (!scope.workspaceId) return NextResponse.json({ error: 'Workspace not found' }, { status: 403 })

    // Fetch active missions with goal trees
    const { data: missions } = await supabase
      .from('missions')
      .select('id, goal_tree, status')
      .eq('user_id', user.id)
      .eq('workspace_id', scope.workspaceId)
      .in('status', ['active', 'paused'])

    if (!missions || missions.length === 0) {
      return NextResponse.json({ created: 0, message: 'No active missions with goal trees' })
    }

    let totalCreated = 0
    for (const mission of missions) {
      const raw = mission as { id: string; goal_tree: unknown }
      if (!raw.goal_tree || typeof raw.goal_tree !== 'object') continue

      const goalTree = raw.goal_tree as {
        original_goal: string
        current_project_id: string | null
        projects: Array<{
          id: string; name: string; description: string
          status: string
          tasks: Array<{ id: string; description: string; status: string }>
        }>
      }

      if (!goalTree.projects || goalTree.projects.length === 0) continue

      const created = await syncGoalTreeToBoard(
        scope.workspaceId,
        raw.id,
        goalTree as Parameters<typeof syncGoalTreeToBoard>[2]
      )
      totalCreated += created
    }

    return NextResponse.json({ created: totalCreated })
  } catch (err) {
    console.error('[/api/boards/sync POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
