/**
 * Skill Registry — CRUD operations for 2Hands Skills
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type SkillCategory = 'research' | 'coding' | 'writing' | 'analysis' | 'product' | 'custom'

export interface AISkill {
  id: string
  user_id: string
  workspace_id: string
  name: string
  description: string
  category: SkillCategory
  icon: string | null
  user_invocable: boolean
  model_invocable: boolean
  instructions: string
  allowed_tools: string[]
  required_integrations: string[]
  config: Record<string, unknown>
  resources: SkillResource[]
  is_enabled: boolean
  is_system: boolean
  is_favorite: boolean
  usage_count: number
  last_used_at: string | null
  avg_tokens_per_run: number | null
  created_at: string
  updated_at: string
}

export interface SkillResource {
  name: string
  type: 'markdown' | 'template' | 'script' | 'data'
  content: string
}

export interface SkillMetadata {
  id: string
  name: string
  description: string
  category: SkillCategory
  icon: string | null
  user_invocable: boolean
  model_invocable: boolean
  is_enabled: boolean
  is_system: boolean
  is_favorite: boolean
  usage_count: number
}

export interface SkillRun {
  id: string
  skill_id: string
  conversation_id: string | null
  user_id: string
  workspace_id: string
  trigger_type: 'user' | 'model' | 'scheduled' | 'chained'
  arguments: string | null
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  output: string | null
  error_message: string | null
  tokens_input: number | null
  tokens_output: number | null
  duration_ms: number | null
  started_at: string
  completed_at: string | null
}

// ── User-facing (RLS) ─────────────────────────────────────────────────

export async function listSkills(
  userId: string,
  workspaceId: string,
  options?: { category?: SkillCategory; enabledOnly?: boolean }
): Promise<AISkill[]> {
  const supabase = await createClient()
  let query = supabase
    .from('ai_skills')
    .select('*')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .order('is_favorite', { ascending: false })
    .order('usage_count', { ascending: false })

  if (options?.category) query = query.eq('category', options.category)
  if (options?.enabledOnly) query = query.eq('is_enabled', true)

  const { data, error } = await query
  if (error) { console.error('[SkillRegistry] listSkills error:', error); return [] }
  return (data ?? []) as AISkill[]
}

export async function getSkillByName(
  name: string,
  workspaceId: string
): Promise<AISkill | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ai_skills')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('name', name)
    .single()

  if (error) return null
  return data as AISkill
}

export async function createSkill(
  userId: string,
  workspaceId: string,
  params: {
    name: string
    description: string
    instructions: string
    category?: SkillCategory
    icon?: string
    user_invocable?: boolean
    model_invocable?: boolean
    allowed_tools?: string[]
    resources?: SkillResource[]
    is_system?: boolean
    config?: Record<string, unknown>
  }
): Promise<AISkill | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ai_skills')
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      name: params.name,
      description: params.description,
      instructions: params.instructions,
      category: params.category ?? 'custom',
      icon: params.icon ?? null,
      user_invocable: params.user_invocable ?? true,
      model_invocable: params.model_invocable ?? true,
      allowed_tools: params.allowed_tools ?? [],
      resources: params.resources ?? [],
      is_system: params.is_system ?? false,
      config: params.config ?? {},
    } as never)
    .select()
    .single()

  if (error) { console.error('[SkillRegistry] createSkill error:', error); return null }
  return data as AISkill
}

export async function updateSkill(
  skillId: string,
  userId: string,
  updates: Partial<Pick<AISkill,
    'name' | 'description' | 'instructions' | 'category' | 'icon' |
    'user_invocable' | 'model_invocable' | 'allowed_tools' | 'resources' |
    'is_enabled' | 'is_favorite' | 'config'
  >>
): Promise<AISkill | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ai_skills')
    .update(updates as never)
    .eq('id', skillId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) { console.error('[SkillRegistry] updateSkill error:', error); return null }
  return data as AISkill
}

export async function deleteSkill(skillId: string, userId: string): Promise<boolean> {
  const supabase = await createClient()
  // Prevent deleting system skills
  const { data: skill } = await supabase
    .from('ai_skills')
    .select('is_system')
    .eq('id', skillId)
    .eq('user_id', userId)
    .single()

  if ((skill as { is_system: boolean } | null)?.is_system) return false

  const { error } = await supabase
    .from('ai_skills')
    .delete()
    .eq('id', skillId)
    .eq('user_id', userId)

  if (error) { console.error('[SkillRegistry] deleteSkill error:', error); return false }
  return true
}

export async function getSkillRuns(
  skillId: string,
  limit = 20
): Promise<SkillRun[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('skill_runs')
    .select('*')
    .eq('skill_id', skillId)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (error) { console.error('[SkillRegistry] getSkillRuns error:', error); return [] }
  return (data ?? []) as SkillRun[]
}

export async function getRecentRuns(
  workspaceId: string,
  limit = 20
): Promise<(SkillRun & { skill_name?: string })[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('skill_runs')
    .select('*, ai_skills(name)')
    .eq('workspace_id', workspaceId)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (error) { console.error('[SkillRegistry] getRecentRuns error:', error); return [] }
  return (data ?? []).map((r: unknown) => {
    const row = r as Record<string, unknown>
    return {
      ...(row as unknown as SkillRun),
      skill_name: (row.ai_skills as { name: string } | null)?.name,
    }
  })
}

// ── Admin helpers (for AI tool execution, no RLS) ─────────────────────

export async function getEnabledSkillsAdmin(
  workspaceId: string
): Promise<SkillMetadata[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('ai_skills')
    .select('id, name, description, category, icon, user_invocable, model_invocable, is_enabled, is_system, is_favorite, usage_count')
    .eq('workspace_id', workspaceId)
    .eq('is_enabled', true)
    .order('usage_count', { ascending: false })

  if (error) { console.error('[SkillRegistry] getEnabledSkillsAdmin error:', error); return [] }
  return (data ?? []) as SkillMetadata[]
}

export async function loadSkillAdmin(
  name: string,
  workspaceId: string
): Promise<AISkill | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('ai_skills')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('name', name)
    .eq('is_enabled', true)
    .single()

  if (error) return null
  return data as AISkill
}

export async function recordSkillRunAdmin(params: {
  skill_id: string
  conversation_id?: string
  user_id: string
  workspace_id: string
  trigger_type: 'user' | 'model' | 'scheduled' | 'chained'
  arguments?: string
}): Promise<string | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('skill_runs')
    .insert({
      skill_id: params.skill_id,
      conversation_id: params.conversation_id ?? null,
      user_id: params.user_id,
      workspace_id: params.workspace_id,
      trigger_type: params.trigger_type,
      arguments: params.arguments ?? null,
      status: 'running',
    } as never)
    .select('id')
    .single()

  if (error) { console.error('[SkillRegistry] recordSkillRunAdmin error:', error); return null }
  return (data as { id: string })?.id ?? null
}

export async function completeSkillRunAdmin(
  runId: string,
  result: {
    status: 'completed' | 'failed' | 'cancelled'
    output?: string
    error_message?: string
    tokens_input?: number
    tokens_output?: number
    duration_ms?: number
  }
): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('skill_runs')
    .update({
      status: result.status,
      output: result.output?.slice(0, 5000) ?? null,
      error_message: result.error_message ?? null,
      tokens_input: result.tokens_input ?? null,
      tokens_output: result.tokens_output ?? null,
      duration_ms: result.duration_ms ?? null,
      completed_at: new Date().toISOString(),
    } as never)
    .eq('id', runId)
}

export async function incrementSkillUsageAdmin(skillId: string): Promise<void> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('ai_skills')
    .select('usage_count')
    .eq('id', skillId)
    .single()

  const current = (data as { usage_count: number } | null)?.usage_count ?? 0
  await supabase
    .from('ai_skills')
    .update({
      usage_count: current + 1,
      last_used_at: new Date().toISOString(),
    } as never)
    .eq('id', skillId)
}

export async function ensureSystemSkillsAdmin(
  userId: string,
  workspaceId: string,
  systemSkills: Array<{
    name: string
    description: string
    instructions: string
    category: SkillCategory
    icon: string
    allowed_tools: string[]
  }>
): Promise<void> {
  const supabase = createAdminClient()

  for (const skill of systemSkills) {
    const { data: existing } = await supabase
      .from('ai_skills')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('name', skill.name)
      .single()

    if (!existing) {
      await supabase
        .from('ai_skills')
        .insert({
          user_id: userId,
          workspace_id: workspaceId,
          name: skill.name,
          description: skill.description,
          instructions: skill.instructions,
          category: skill.category,
          icon: skill.icon,
          allowed_tools: skill.allowed_tools,
          is_system: true,
          is_enabled: true,
          user_invocable: true,
          model_invocable: true,
          resources: [],
          config: {},
        } as never)
    } else {
      await supabase
        .from('ai_skills')
        .update({
          description: skill.description,
          instructions: skill.instructions,
          category: skill.category,
          icon: skill.icon,
          allowed_tools: skill.allowed_tools,
        } as never)
        .eq('id', (existing as { id: string }).id)
    }
  }
}
