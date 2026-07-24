import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { parseAndValidate, createConversationRequestSchema, validationErrorResponse } from '@/lib/validation/schemas'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limiting
    const rateKey = createRateLimitKey(user.id, 'conversations')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.general)
    if (!rateCheck.allowed) {
      return NextResponse.json({ 
        error: 'Too many requests',
        retryAfter: Math.ceil((rateCheck.resetAt - Date.now()) / 1000)
      }, { status: 429 })
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

    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', user.id)
      .eq('workspace_id', scope.workspaceId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Conversations query error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        workspaceId: scope.workspaceId,
        userId: user.id
      })
      return NextResponse.json({ error: error.message, details: error.details }, { status: 500 })
    }

    return NextResponse.json(conversations)
  } catch (error) {
    console.error('Conversations API error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = await parseAndValidate(request, createConversationRequestSchema)
    if (!parsed.success) {
      return NextResponse.json(validationErrorResponse(parsed.error), { status: parsed.status })
    }
    
    const body = parsed.data

    const requestedWorkspaceId = body.workspaceId
      || request.cookies.get('2hands_active_workspace_id')?.value
      || null

    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })

    if (!scope.workspaceId || !scope.role) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 403 })
    }

    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert({
        user_id: user.id,
        workspace_id: scope.workspaceId,
        title: body.title || null,
      } as never)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(conversation)
  } catch (error) {
    console.error('Create conversation error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
