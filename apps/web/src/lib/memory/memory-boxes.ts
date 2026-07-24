/**
 * Memory Boxes — Cohere-inspired contextual containers
 *
 * Organises ai_manager_memories into thematic boxes for better
 * retrieval, display, and AI-driven management.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type BoxCategory = 'persona' | 'projects' | 'knowledge' | 'operations' | 'context'

export interface MemoryBox {
  id: string
  user_id: string
  workspace_id: string
  name: string
  description: string | null
  category: BoxCategory
  icon: string | null
  color: string | null
  is_pinned: boolean
  memory_count: number
  created_at: string
  updated_at: string
}

export interface MemoryInBox {
  id: string
  content: string
  memory_type: string
  importance: string
  box_id: string | null
  created_at: string
  updated_at: string
}

// ── User-facing helpers (use RLS client) ──────────────────────────────

export async function listBoxes(
  userId: string,
  workspaceId: string
): Promise<MemoryBox[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('memory_boxes')
    .select('*')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .order('is_pinned', { ascending: false })
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[MemoryBoxes] listBoxes error:', error)
    return []
  }
  return (data ?? []) as MemoryBox[]
}

export async function createBox(
  userId: string,
  workspaceId: string,
  params: { name: string; description?: string; category?: BoxCategory; icon?: string; color?: string }
): Promise<MemoryBox | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('memory_boxes')
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      name: params.name,
      description: params.description ?? null,
      category: params.category ?? 'knowledge',
      icon: params.icon ?? null,
      color: params.color ?? null,
    } as never)
    .select()
    .single()

  if (error) {
    console.error('[MemoryBoxes] createBox error:', error)
    return null
  }
  return data as MemoryBox
}

export async function updateBox(
  boxId: string,
  userId: string,
  updates: Partial<Pick<MemoryBox, 'name' | 'description' | 'category' | 'icon' | 'color' | 'is_pinned'>>
): Promise<MemoryBox | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('memory_boxes')
    .update(updates as never)
    .eq('id', boxId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    console.error('[MemoryBoxes] updateBox error:', error)
    return null
  }
  return data as MemoryBox
}

export async function deleteBox(boxId: string, userId: string): Promise<boolean> {
  const supabase = await createClient()
  // Unlink memories first (set box_id to null)
  await supabase
    .from('ai_manager_memories')
    .update({ box_id: null } as never)
    .eq('box_id', boxId)
    .eq('user_id', userId)

  const { error } = await supabase
    .from('memory_boxes')
    .delete()
    .eq('id', boxId)
    .eq('user_id', userId)

  if (error) {
    console.error('[MemoryBoxes] deleteBox error:', error)
    return false
  }
  return true
}

export async function getMemoriesInBox(
  boxId: string | null,
  userId: string,
  workspaceId: string,
  limit = 50
): Promise<MemoryInBox[]> {
  const supabase = await createClient()
  let query = supabase
    .from('ai_manager_memories')
    .select('id, content, memory_type, importance, box_id, created_at, updated_at')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .order('importance', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (boxId === null) {
    query = query.is('box_id', null)
  } else {
    query = query.eq('box_id', boxId)
  }

  const { data, error } = await query
  if (error) {
    console.error('[MemoryBoxes] getMemoriesInBox error:', error)
    return []
  }
  return (data ?? []) as MemoryInBox[]
}

export async function assignMemoryToBox(
  memoryId: string,
  boxId: string | null,
  userId: string
): Promise<boolean> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('ai_manager_memories')
    .update({ box_id: boxId } as never)
    .eq('id', memoryId)
    .eq('user_id', userId)

  if (error) {
    console.error('[MemoryBoxes] assignMemoryToBox error:', error)
    return false
  }
  return true
}

export async function addMemoryToBox(
  userId: string,
  workspaceId: string,
  boxId: string,
  content: string,
  memoryType: string = 'context',
  importance: string = 'medium'
): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ai_manager_memories')
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      box_id: boxId,
      memory_type: memoryType,
      content,
      importance,
      source: 'memory_box',
    } as never)
    .select('id')
    .single()

  if (error) {
    console.error('[MemoryBoxes] addMemoryToBox error:', error)
    return null
  }
  return (data as { id: string })?.id ?? null
}

// ── Admin helpers (for AI tools, no RLS) ──────────────────────────────

export async function createBoxAdmin(
  userId: string,
  workspaceId: string,
  params: { name: string; description?: string; category?: BoxCategory; icon?: string }
): Promise<MemoryBox | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('memory_boxes')
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      name: params.name,
      description: params.description ?? null,
      category: params.category ?? 'knowledge',
      icon: params.icon ?? null,
    } as never)
    .select()
    .single()

  if (error) {
    console.error('[MemoryBoxes] createBoxAdmin error:', error)
    return null
  }
  return data as MemoryBox
}

export async function addMemoryToBoxAdmin(
  userId: string,
  workspaceId: string,
  boxId: string,
  content: string,
  memoryType: string = 'context',
  importance: string = 'medium'
): Promise<string | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('ai_manager_memories')
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      box_id: boxId,
      memory_type: memoryType,
      content,
      importance,
      source: 'ai_tool',
    } as never)
    .select('id')
    .single()

  if (error) {
    console.error('[MemoryBoxes] addMemoryToBoxAdmin error:', error)
    return null
  }
  return (data as { id: string })?.id ?? null
}

export async function searchMemoriesAdmin(
  userId: string,
  workspaceId: string,
  query: string,
  options?: { boxId?: string; limit?: number }
): Promise<MemoryInBox[]> {
  const supabase = createAdminClient()
  let q = supabase
    .from('ai_manager_memories')
    .select('id, content, memory_type, importance, box_id, created_at, updated_at')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .ilike('content', `%${query}%`)
    .order('importance', { ascending: true })
    .limit(options?.limit ?? 20)

  if (options?.boxId) {
    q = q.eq('box_id', options.boxId)
  }

  const { data, error } = await q
  if (error) {
    console.error('[MemoryBoxes] searchMemoriesAdmin error:', error)
    return []
  }
  return (data ?? []) as MemoryInBox[]
}

export async function listBoxesAdmin(
  userId: string,
  workspaceId: string
): Promise<MemoryBox[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('memory_boxes')
    .select('*')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .order('is_pinned', { ascending: false })
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[MemoryBoxes] listBoxesAdmin error:', error)
    return []
  }
  return (data ?? []) as MemoryBox[]
}
