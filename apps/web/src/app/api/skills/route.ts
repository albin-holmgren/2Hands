import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'
import {
  listSkills,
  createSkill,
  updateSkill,
  deleteSkill,
  getSkillRuns,
  getRecentRuns,
  type SkillCategory,
  type SkillResource,
} from '@/lib/skills/skill-registry'

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

    const category = request.nextUrl.searchParams.get('category') as SkillCategory | null
    const runsFor = request.nextUrl.searchParams.get('runs_for')
    const recentRuns = request.nextUrl.searchParams.get('recent_runs')

    // Return runs for a specific skill
    if (runsFor) {
      const runs = await getSkillRuns(runsFor, 30)
      return NextResponse.json({ runs })
    }

    // Return recent runs across all skills
    if (recentRuns === 'true') {
      const runs = await getRecentRuns(scope.workspaceId, 30)
      return NextResponse.json({ runs })
    }

    // Return all skills
    const skills = await listSkills(user.id, scope.workspaceId, {
      category: category ?? undefined,
    })
    return NextResponse.json({ skills })
  } catch (err) {
    console.error('[/api/skills GET]', err)
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
      name: string
      description: string
      instructions: string
      category?: SkillCategory
      icon?: string
      user_invocable?: boolean
      model_invocable?: boolean
      allowed_tools?: string[]
      resources?: SkillResource[]
      config?: Record<string, unknown>
    }

    if (!body.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (!body.description?.trim()) return NextResponse.json({ error: 'Description is required' }, { status: 400 })
    if (!body.instructions?.trim()) return NextResponse.json({ error: 'Instructions are required' }, { status: 400 })

    // Validate name format
    if (!/^[a-z0-9-]+$/.test(body.name.trim())) {
      return NextResponse.json({ error: 'Name must contain only lowercase letters, numbers, and hyphens' }, { status: 400 })
    }

    const skill = await createSkill(user.id, scope.workspaceId, {
      name: body.name.trim(),
      description: body.description.trim(),
      instructions: body.instructions.trim(),
      category: body.category,
      icon: body.icon,
      user_invocable: body.user_invocable,
      model_invocable: body.model_invocable,
      allowed_tools: body.allowed_tools,
      resources: body.resources,
      config: body.config,
    })

    if (!skill) return NextResponse.json({ error: 'Failed to create skill (name may already exist)' }, { status: 400 })
    return NextResponse.json({ skill }, { status: 201 })
  } catch (err) {
    console.error('[/api/skills POST]', err)
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
      instructions?: string
      category?: SkillCategory
      icon?: string
      user_invocable?: boolean
      model_invocable?: boolean
      allowed_tools?: string[]
      resources?: SkillResource[]
      is_enabled?: boolean
      is_favorite?: boolean
      config?: Record<string, unknown>
    }

    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { id, ...updates } = body
    const skill = await updateSkill(id, user.id, updates as any)
    if (!skill) return NextResponse.json({ error: 'Failed to update skill' }, { status: 400 })
    return NextResponse.json({ skill })
  } catch (err) {
    console.error('[/api/skills PATCH]', err)
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

    const ok = await deleteSkill(id, user.id)
    if (!ok) return NextResponse.json({ error: 'Failed to delete skill (system skills cannot be deleted)' }, { status: 400 })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error('[/api/skills DELETE]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
