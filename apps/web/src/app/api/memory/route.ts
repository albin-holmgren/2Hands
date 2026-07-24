import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const search = request.nextUrl.searchParams.get('q') ?? ''
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? '100'), 200)

    let query = supabase
      .from('ai_manager_memories')
      .select('id, content, memory_type, importance, created_at, updated_at')
      .eq('user_id', user.id)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (search) {
      query = query.ilike('content', `%${search}%`)
    }

    const { data, error } = await query
    if (error) {
      console.error('[/api/memory GET] Query error:', error)
      return NextResponse.json({ error: 'Failed to fetch memories' }, { status: 400 })
    }

    return NextResponse.json({ memories: data ?? [], total: (data ?? []).length })
  } catch (err) {
    console.error('[/api/memory GET]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { id, content, importance, is_active } = body as {
      id: string
      content?: string
      importance?: string
      is_active?: boolean
    }
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (content !== undefined) updates.content = content
    if (importance !== undefined) updates.importance = importance
    if (is_active !== undefined) updates.is_active = is_active

    const { data, error } = await supabase
      .from('ai_manager_memories')
      .update(updates as never)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, content, memory_type, importance, created_at, updated_at')
      .single()

    if (error) {
      console.error('[/api/memory PATCH] Update error:', error)
      return NextResponse.json({ error: 'Failed to update memory' }, { status: 400 })
    }
    return NextResponse.json({ memory: data })
  } catch (err) {
    console.error('[/api/memory PATCH]', err)
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

    const { error } = await supabase
      .from('ai_manager_memories')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('[/api/memory DELETE] Delete error:', error)
      return NextResponse.json({ error: 'Failed to delete memory' }, { status: 400 })
    }
    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error('[/api/memory DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
