import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'
import { createSkill } from '@/lib/skills/skill-registry'
import { parseSkillMd, importSkillFromUrl } from '@/lib/skills/skill-importer'

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
      url?: string
      content?: string // raw SKILL.md content
    }

    let parsed: Awaited<ReturnType<typeof importSkillFromUrl>>

    if (body.url) {
      parsed = await importSkillFromUrl(body.url)
    } else if (body.content) {
      parsed = parseSkillMd(body.content)
    } else {
      return NextResponse.json({ error: 'Provide either url or content' }, { status: 400 })
    }

    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    // Create the skill in the database
    const skill = await createSkill(user.id, scope.workspaceId, {
      name: parsed.name,
      description: parsed.description,
      instructions: parsed.instructions,
      category: parsed.category,
      icon: parsed.icon,
      allowed_tools: parsed.allowed_tools,
      config: parsed.source_url ? { source_url: parsed.source_url } : {},
    })

    if (!skill) {
      return NextResponse.json({ error: 'Failed to create skill (name may already exist)' }, { status: 400 })
    }

    return NextResponse.json({ skill, source: parsed.source_url || 'manual' }, { status: 201 })
  } catch (err) {
    console.error('[/api/skills/import POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
