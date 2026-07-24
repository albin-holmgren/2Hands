import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { parseAndValidate, parseQueryParams, messagesQuerySchema, createMessageRequestSchema, validationErrorResponse } from '@/lib/validation/schemas'
import { resolveWorkspaceScope } from '@/lib/enterprise/workspace-context'

const MESSAGES_PER_PAGE = 20

// GET - Fetch paginated messages for a conversation
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limiting
    const rateKey = createRateLimitKey(user.id, 'messages')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.general)
    if (!rateCheck.allowed) {
      return NextResponse.json({ 
        error: 'Too many requests',
        retryAfter: Math.ceil((rateCheck.resetAt - Date.now()) / 1000)
      }, { status: 429 })
    }

    const queryResult = parseQueryParams(request.url, messagesQuerySchema)
    if (!queryResult.success) {
      return NextResponse.json(validationErrorResponse(queryResult.error), { status: 400 })
    }
    
    const { conversation_id: conversationId, cursor, limit } = queryResult.data

    const requestedWorkspaceId = request.nextUrl.searchParams.get('workspaceId')
      || request.cookies.get('2hands_active_workspace_id')?.value
      || null

    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })

    if (!scope.workspaceId || !scope.role) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 403 })
    }

    // Verify conversation belongs to user and workspace
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .eq('workspace_id', scope.workspaceId)
      .single()

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Build query
    let query = supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit + 1) // Fetch one extra to check if there are more

    // Cursor-based pagination: look up the cursor message's timestamp from DB
    // This avoids all client-server timestamp precision/encoding issues
    if (cursor) {
      const { data: cursorMsg } = await supabase
        .from('messages')
        .select('created_at')
        .eq('id', cursor)
        .single()

      if (cursorMsg) {
        query = query.lt('created_at', (cursorMsg as { created_at: string }).created_at)
      }
    }

    const { data: messages, error } = await query

    if (error) {
      console.error('Messages query error:', error)
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    const hasMore = messages && messages.length > limit
    const resultMessages = hasMore ? messages.slice(0, limit) : messages

    // Reverse to get chronological order
    const chronologicalMessages = resultMessages?.reverse() || []
    
    return NextResponse.json({
      messages: chronologicalMessages,
      hasMore,
    })
  } catch (error) {
    console.error('Fetch messages error:', error)
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

    const parsed = await parseAndValidate(request, createMessageRequestSchema)
    if (!parsed.success) {
      return NextResponse.json(validationErrorResponse(parsed.error), { status: parsed.status })
    }
    
    const body = parsed.data

    const requestedWorkspaceId = (typeof body.workspaceId === 'string' && body.workspaceId.trim())
      || request.cookies.get('2hands_active_workspace_id')?.value
      || null

    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId, {
      strictPreferred: Boolean(requestedWorkspaceId),
    })

    if (!scope.workspaceId || !scope.role) {
      return NextResponse.json({ error: 'Workspace not found or access denied' }, { status: 403 })
    }

    // Verify conversation belongs to user and workspace
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', body.conversation_id)
      .eq('user_id', user.id)
      .eq('workspace_id', scope.workspaceId)
      .single()

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        id: body.id,
        conversation_id: body.conversation_id,
        role: body.role,
        content: body.content,
        metadata: body.metadata || {},
      } as never)
      .select()
      .single()

    if (error) {
      console.error('[Messages POST] Insert error:', error)
      return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
    }

    // Update conversation title if it's the first user message (but not for AI Manager conversation)
    const { data: conv } = await supabase
      .from('conversations')
      .select('title')
      .eq('id', body.conversation_id)
      .single()

    const convData = conv as { title: string } | null
    const isManagerConversation = convData?.title === 'AI Manager'

    if (!isManagerConversation && body.role === 'user') {
      const { data: userMessages } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', body.conversation_id)
        .eq('role', 'user')

      if (userMessages && userMessages.length === 1) {
        // Generate a title from the first message
        const title = body.content.slice(0, 50) + (body.content.length > 50 ? '...' : '')
        await supabase
          .from('conversations')
          .update({ title, updated_at: new Date().toISOString() } as never)
          .eq('id', body.conversation_id)
      }
    }
    
    // Always update timestamp
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() } as never)
      .eq('id', body.conversation_id)

    return NextResponse.json(message)
  } catch (error) {
    console.error('Create message error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// PATCH - Update metadata on the latest assistant message in a conversation
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { conversation_id, metadata } = body

    if (!conversation_id || !metadata) {
      return NextResponse.json({ error: 'Missing conversation_id or metadata' }, { status: 400 })
    }

    // Resolve active workspace scope for this request
    const requestedWorkspaceId = body.workspaceId
      || request.cookies.get('2hands_active_workspace_id')?.value
      || null
    const scope = await resolveWorkspaceScope(user.id, requestedWorkspaceId)
    if (!scope.workspaceId) {
      return NextResponse.json({ error: 'No active workspace' }, { status: 400 })
    }

    // Verify conversation belongs to user AND the active workspace
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversation_id)
      .eq('user_id', user.id)
      .eq('workspace_id', scope.workspaceId)
      .single()

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Use admin client to bypass RLS for metadata update
    const adminSupabase = createAdminClient()

    // Get the latest assistant message in this conversation
    const { data: latestMsg } = await adminSupabase
      .from('messages')
      .select('id, metadata')
      .eq('conversation_id', conversation_id)
      .eq('role', 'assistant')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!latestMsg) {
      return NextResponse.json({ error: 'No assistant message found' }, { status: 404 })
    }

    const existingMeta = (latestMsg as { id: string; metadata: Record<string, unknown> }).metadata || {}
    const mergedMetadata = { ...existingMeta, ...metadata }

    const { error: updateError } = await adminSupabase
      .from('messages')
      .update({ metadata: mergedMetadata } as never)
      .eq('id', (latestMsg as { id: string }).id)

    if (updateError) {
      console.error('[PATCH] Update error:', updateError)
      return NextResponse.json({ error: 'Failed to update message' }, { status: 500 })
    }

    return NextResponse.json({ success: true, messageId: (latestMsg as { id: string }).id })
  } catch (error) {
    console.error('Update message metadata error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
