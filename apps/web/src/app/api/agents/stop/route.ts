import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    let supabase = await createClient()
    let user = null

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const { createClient: createBrowserClient } = await import('@supabase/supabase-js')
      const supabaseWithToken = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: { Authorization: `Bearer ${token}` },
          },
        }
      )
      const { data: { user: tokenUser }, error } = await supabaseWithToken.auth.getUser(token)
      if (!error && tokenUser) {
        user = tokenUser
        supabase = supabaseWithToken
      }
    } else {
      const { data: { user: cookieUser }, error } = await supabase.auth.getUser()
      if (!error) user = cookieUser
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const agentId = body?.agentId as string | undefined

    if (!agentId) {
      return NextResponse.json({ error: 'Agent ID required' }, { status: 400 })
    }

    const requestedWorkspaceId = (typeof body?.workspaceId === 'string' && body.workspaceId.trim())
      || request.cookies.get('2hands_active_workspace_id')?.value
      || null

    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })

    if (!scope.workspaceId || !scope.role) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 403 })
    }

    // Verify ownership and get current status
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, status, config')
      .eq('id', agentId)
      .eq('user_id', user.id)
      .eq('workspace_id', scope.workspaceId)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const agentData = agent as { id: string; status: string; config: Record<string, unknown> | null }

    if (agentData.status !== 'working' && agentData.status !== 'initializing') {
      return NextResponse.json({ success: true, message: 'Agent is not running', status: agentData.status })
    }

    // Set status to 'idle' — the executor main loop checks this and will stop
    const now = new Date().toISOString()
    await supabase
      .from('agents')
      .update({
        status: 'idle',
        config: {
          ...(agentData.config || {}),
          execution_started: false,
          active_run_id: null,
          active_run_ended_at: now,
          stopped_by_user: true,
          stopped_at: now,
        },
      } as never)
      .eq('id', agentId)

    console.log(`[AgentStop] Agent ${agentId} stopped by user ${user.id}`)

    return NextResponse.json({ success: true, message: 'Agent stop signal sent', agentId })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to stop agent' },
      { status: 500 }
    )
  }
}
