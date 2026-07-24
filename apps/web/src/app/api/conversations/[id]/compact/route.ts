import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MIN_MESSAGES_TO_COMPACT = 12
const KEEP_RECENT = 6

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify the conversation belongs to this user
    const { data: conv } = await supabase
      .from('conversations')
      .select('id, user_id')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .single()

    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    type MsgRow = { id: string; role: string; content: string; created_at: string; metadata: Record<string, unknown> | null }

    // Fetch all messages ordered oldest first
    const admin = createAdminClient()
    const { data: allMessages, error: fetchErr } = await (admin as any)
      .from('messages')
      .select('id, role, content, created_at, metadata')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true }) as { data: MsgRow[] | null; error: unknown }

    if (fetchErr || !allMessages) {
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    // Filter out existing compaction summaries and system messages
    const rows = (allMessages ?? []) as MsgRow[]
    const compactable = rows.filter(m => {
      const meta = m.metadata as { type?: string } | null
      return m.role !== 'system' && meta?.type !== 'compaction_summary'
    })

    if (compactable.length <= MIN_MESSAGES_TO_COMPACT) {
      return NextResponse.json({ removed: 0, summary: null, message: 'Nothing to compact' })
    }

    // Keep the most recent KEEP_RECENT messages intact
    const toRemove: MsgRow[] = compactable.slice(0, compactable.length - KEEP_RECENT)
    const kept: MsgRow[] = compactable.slice(compactable.length - KEEP_RECENT)

    if (toRemove.length === 0) {
      return NextResponse.json({ removed: 0, summary: null, message: 'Nothing to compact' })
    }

    // Build a condensed summary from the messages being removed
    const summaryLines: string[] = []
    for (const msg of toRemove) {
      if (!msg.content?.trim()) continue
      const role = msg.role === 'user' ? 'User' : 'Assistant'
      const snippet = msg.content.trim().slice(0, 150)
      summaryLines.push(`${role}: ${snippet}${msg.content.length > 150 ? '…' : ''}`)
    }
    const summaryText = [
      `[Conversation history compacted — ${toRemove.length} earlier messages summarised]`,
      '',
      summaryLines.slice(0, 20).join('\n'),
    ].join('\n')

    // Delete old messages using admin client
    const idsToDelete = toRemove.map(m => m.id)
    const { error: deleteErr } = await (admin as any)
      .from('messages')
      .delete()
      .in('id', idsToDelete) as { error: unknown }

    if (deleteErr) {
      console.error('[Compact] Delete error:', deleteErr)
      return NextResponse.json({ error: 'Failed to delete messages' }, { status: 500 })
    }

    // Insert a summary system message at the start (just before oldest kept message)
    const summaryTimestamp = kept.length > 0
      ? new Date(new Date(kept[0].created_at).getTime() - 1000).toISOString()
      : new Date().toISOString()

    await admin.from('messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: summaryText,
      created_at: summaryTimestamp,
      metadata: {
        type: 'compaction_summary',
        removed_count: toRemove.length,
        compacted_at: new Date().toISOString(),
      },
    } as never)

    return NextResponse.json({
      removed: toRemove.length,
      summary: summaryText.slice(0, 200),
    })
  } catch (err) {
    console.error('[Compact] Unhandled error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
