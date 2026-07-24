import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canCreateAgent } from '@/lib/limits'
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { parseAndValidate, createAgentRequestSchema, validationErrorResponse } from '@/lib/validation/schemas'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    let supabase: SupabaseClient<Database> = await createClient()
    let user: User | null = null

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const { createClient: createBrowserClient } = await import('@supabase/supabase-js')
      const supabaseWithToken = createBrowserClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
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

    const requestedWorkspaceId = request.nextUrl.searchParams.get('workspaceId')
      || request.cookies.get('2hands_active_workspace_id')?.value
      || null

    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })

    if (!scope.workspaceId || !scope.role) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 403 })
    }

    console.log('[Agents API] Fetching agents for:', { userId: user.id, workspaceId: scope.workspaceId, role: scope.role })

    const missionIdFilter = request.nextUrl.searchParams.get('mission_id')
    const statusFilter = request.nextUrl.searchParams.get('status') // comma-separated statuses

    // Use admin client to bypass RLS SELECT policy drift (security via explicit user_id+workspace_id filters)
    const adminDb = createAdminClient()
    let query = adminDb
      .from('agents')
      .select('*')
      .eq('user_id', user.id)
      .eq('workspace_id', scope.workspaceId)

    if (statusFilter) {
      const statuses = statusFilter.split(',').map(s => s.trim())
      query = query.in('status', statuses)
    }

    const { data: agents, error } = await query.order('created_at', { ascending: false })

    if (error) throw error

    // Filter by mission_id in config (post-fetch since config is jsonb)
    const filtered = missionIdFilter
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (agents || []).filter((a: any) => a.config?.mission_id === missionIdFilter)
      : agents || []

    return NextResponse.json({ agents: filtered, workspaceId: scope.workspaceId })
  } catch (error) {
    console.error('Agents API error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    let supabase: SupabaseClient<Database> = await createClient()
    let user: User | null = null

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const { createClient: createBrowserClient } = await import('@supabase/supabase-js')
      const supabaseWithToken = createBrowserClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`,
            },
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

    const rawBody = await request.clone().json().catch(() => null) as { workspaceId?: string } | null
    const requestedWorkspaceId = (typeof rawBody?.workspaceId === 'string' && rawBody.workspaceId.trim())
      || request.cookies.get('2hands_active_workspace_id')?.value
      || null

    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })

    if (!scope.workspaceId || !scope.role) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 403 })
    }

    // Rate limiting
    const rateKey = createRateLimitKey(user.id, 'createAgent')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.createAgent)
    if (!rateCheck.allowed) {
      return NextResponse.json({ 
        error: 'Too many requests. Please wait before creating another agent.',
        code: 'RATE_LIMITED',
        retryAfter: Math.ceil((rateCheck.resetAt - Date.now()) / 1000),
      }, { status: 429 })
    }

    const parsed = await parseAndValidate(request, createAgentRequestSchema)
    if (!parsed.success) {
      return NextResponse.json(validationErrorResponse(parsed.error), { status: parsed.status })
    }
    
    const { name, type, config, mission } = parsed.data

    // Check if user can create more agents based on plan limits
    const limitCheck = await canCreateAgent(user.id, supabase)
    if (!limitCheck.allowed) {
      return NextResponse.json({ 
        error: limitCheck.reason,
        code: 'AGENT_LIMIT_REACHED',
        currentCount: limitCheck.currentCount,
        limit: limitCheck.limit,
      }, { status: 403 })
    }

    // Create a new conversation for the agent
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        user_id: user.id,
        workspace_id: scope.workspaceId,
        title: `Chat with ${name}`,
        status: 'active',
      } as never)
      .select()
      .single()

    if (convError) throw convError
    const convData = conversation as { id: string }

    const { data: agent, error } = await supabase
      .from('agents')
      .insert({
        user_id: user.id,
        workspace_id: scope.workspaceId,
        conversation_id: convData.id,
        name,
        type,
        status: 'idle',
        config: {
          ...(config || {}),
          ...(mission ? { description: mission } : {}),
        },
        last_active: new Date().toISOString(),
      } as never)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ agent, workspaceId: scope.workspaceId })
  } catch (error) {
    console.error('Create agent error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
