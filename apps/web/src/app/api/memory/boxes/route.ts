import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'
import {
  listBoxes,
  createBox,
  updateBox,
  deleteBox,
  getMemoriesInBox,
  assignMemoryToBox,
  addMemoryToBox,
  type BoxCategory,
} from '@/lib/memory/memory-boxes'

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

    const boxId = request.nextUrl.searchParams.get('box_id')

    // If box_id is provided, return memories in that box
    if (boxId !== null) {
      const memories = await getMemoriesInBox(
        boxId === 'unboxed' ? null : boxId,
        user.id,
        scope.workspaceId
      )
      return NextResponse.json({ memories })
    }

    // Otherwise return all boxes
    const boxes = await listBoxes(user.id, scope.workspaceId)
    return NextResponse.json({ boxes })
  } catch (err) {
    console.error('[/api/memory/boxes GET]', err)
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
      action?: string
      name?: string
      description?: string
      category?: BoxCategory
      icon?: string
      color?: string
      // For add_memory action
      box_id?: string
      content?: string
      memory_type?: string
      importance?: string
      // For assign action
      memory_id?: string
    }

    const action = body.action ?? 'create'

    if (action === 'create') {
      if (!body.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
      const box = await createBox(user.id, scope.workspaceId, {
        name: body.name.trim(),
        description: body.description,
        category: body.category,
        icon: body.icon,
        color: body.color,
      })
      if (!box) return NextResponse.json({ error: 'Failed to create box' }, { status: 400 })
      return NextResponse.json({ box }, { status: 201 })
    }

    if (action === 'add_memory') {
      if (!body.box_id || !body.content?.trim()) {
        return NextResponse.json({ error: 'box_id and content are required' }, { status: 400 })
      }
      const memoryId = await addMemoryToBox(
        user.id,
        scope.workspaceId,
        body.box_id,
        body.content.trim(),
        body.memory_type,
        body.importance
      )
      if (!memoryId) return NextResponse.json({ error: 'Failed to add memory' }, { status: 400 })
      return NextResponse.json({ memory_id: memoryId }, { status: 201 })
    }

    if (action === 'assign') {
      if (!body.memory_id) return NextResponse.json({ error: 'memory_id is required' }, { status: 400 })
      const ok = await assignMemoryToBox(body.memory_id, body.box_id ?? null, user.id)
      if (!ok) return NextResponse.json({ error: 'Failed to assign memory' }, { status: 400 })
      return NextResponse.json({ assigned: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[/api/memory/boxes POST]', err)
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
      name?: string
      description?: string
      category?: BoxCategory
      icon?: string
      color?: string
      is_pinned?: boolean
    }
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const updates: Record<string, unknown> = {}
    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.category !== undefined) updates.category = body.category
    if (body.icon !== undefined) updates.icon = body.icon
    if (body.color !== undefined) updates.color = body.color
    if (body.is_pinned !== undefined) updates.is_pinned = body.is_pinned

    const box = await updateBox(body.id, user.id, updates as any)
    if (!box) return NextResponse.json({ error: 'Failed to update box' }, { status: 400 })
    return NextResponse.json({ box })
  } catch (err) {
    console.error('[/api/memory/boxes PATCH]', err)
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

    const ok = await deleteBox(id, user.id)
    if (!ok) return NextResponse.json({ error: 'Failed to delete box' }, { status: 400 })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error('[/api/memory/boxes DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
