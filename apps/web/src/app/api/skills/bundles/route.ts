import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'
import { ensureSystemSkillsAdmin } from '@/lib/skills/skill-registry'
import { createAdminClient } from '@/lib/supabase/admin'
import { SKILL_BUNDLES, getBundleSkillNames } from '@/lib/skills/skill-bundles'
import { SYSTEM_SKILLS } from '@/lib/skills/system-skills'

export async function GET() {
  return NextResponse.json({ bundles: SKILL_BUNDLES })
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

    const { bundle_id } = await request.json() as { bundle_id: string }
    if (!bundle_id) return NextResponse.json({ error: 'bundle_id is required' }, { status: 400 })

    const bundle = SKILL_BUNDLES.find(b => b.id === bundle_id)
    if (!bundle) return NextResponse.json({ error: 'Bundle not found' }, { status: 404 })

    // Ensure all system skills exist
    await ensureSystemSkillsAdmin(user.id, scope.workspaceId, SYSTEM_SKILLS)

    const skillNames = getBundleSkillNames(bundle_id)
    const admin = createAdminClient()

    if (skillNames === null) {
      // Enable ALL skills
      await admin
        .from('ai_skills')
        .update({ is_enabled: true } as never)
        .eq('workspace_id', scope.workspaceId)
        .eq('user_id', user.id)
    } else {
      // Disable all first, then enable only bundle skills
      await admin
        .from('ai_skills')
        .update({ is_enabled: false } as never)
        .eq('workspace_id', scope.workspaceId)
        .eq('user_id', user.id)
        .eq('is_system', true)

      for (const name of skillNames) {
        await admin
          .from('ai_skills')
          .update({ is_enabled: true } as never)
          .eq('workspace_id', scope.workspaceId)
          .eq('name', name)
      }
    }

    return NextResponse.json({
      success: true,
      bundle: bundle.name,
      skills_enabled: skillNames?.length ?? 'all',
    })
  } catch (err) {
    console.error('[/api/skills/bundles POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
