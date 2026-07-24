import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'
import {
  listRecurringTasks,
  createRecurringTask,
  updateRecurringTask,
  deleteRecurringTask,
  getTaskRuns,
  type RecurringTaskStatus,
  type TaskType,
  type OutputDestination,
} from '@/lib/scheduler/recurring-tasks'

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

    const statusFilter = request.nextUrl.searchParams.get('status') as RecurringTaskStatus | null
    const taskId = request.nextUrl.searchParams.get('runs_for')

    // If runs_for param, return execution history
    if (taskId) {
      const runs = await getTaskRuns(taskId, 30)
      return NextResponse.json({ runs })
    }

    const tasks = await listRecurringTasks(user.id, scope.workspaceId, statusFilter ?? undefined)
    return NextResponse.json({ tasks })
  } catch (err) {
    console.error('[/api/recurring-tasks GET]', err)
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
    if (!scope.workspaceId) return NextResponse.json({ error: 'Workspace not found' }, { status: 403 })

    const body = await request.json() as {
      title: string
      description?: string
      schedule_cron: string
      schedule_timezone?: string
      task_type?: TaskType
      output_destination?: OutputDestination
      board_column?: string
      mission_id?: string
      config?: Record<string, unknown>
    }

    if (!body.title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    if (!body.schedule_cron?.trim()) return NextResponse.json({ error: 'Schedule is required' }, { status: 400 })

    const task = await createRecurringTask(user.id, scope.workspaceId, {
      title: body.title.trim(),
      description: body.description,
      schedule_cron: body.schedule_cron.trim(),
      schedule_timezone: body.schedule_timezone,
      task_type: body.task_type,
      output_destination: body.output_destination,
      board_column: body.board_column,
      mission_id: body.mission_id,
      created_by: 'user',
      config: body.config,
    })

    if (!task) return NextResponse.json({ error: 'Failed to create task' }, { status: 400 })
    return NextResponse.json({ task }, { status: 201 })
  } catch (err) {
    console.error('[/api/recurring-tasks POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json() as {
      id: string
      title?: string
      description?: string
      schedule_cron?: string
      schedule_timezone?: string
      status?: RecurringTaskStatus
      task_type?: TaskType
      output_destination?: OutputDestination
      board_column?: string
      config?: Record<string, unknown>
    }
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { id, ...updates } = body
    const task = await updateRecurringTask(id, user.id, updates)
    if (!task) return NextResponse.json({ error: 'Failed to update task' }, { status: 400 })
    return NextResponse.json({ task })
  } catch (err) {
    console.error('[/api/recurring-tasks PATCH]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await request.json() as { id: string }
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const ok = await deleteRecurringTask(id, user.id)
    if (!ok) return NextResponse.json({ error: 'Failed to delete task' }, { status: 400 })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error('[/api/recurring-tasks DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
