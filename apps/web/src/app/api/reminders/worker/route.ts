import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = (process.env.CRON_SECRET || '').trim()
  if (!cronSecret) {
    console.error('SECURITY: CRON_SECRET not configured - rejecting reminders worker request')
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date().toISOString()

  try {
    // Find system messages of type 'reminder' where deliver_at <= now and not yet delivered
    const { data: pendingReminders, error } = await (supabase as any)
      .from('messages')
      .select('id, conversation_id, metadata')
      .eq('role', 'system')
      .lte('metadata->>deliver_at', now)
      .eq('metadata->>type', 'reminder')
      .eq('metadata->>delivered', 'false')
      .limit(20)

    if (error) {
      console.error('[Reminders Worker] Query error:', error)
      return NextResponse.json({ error: 'Failed to query reminders' }, { status: 500 })
    }

    if (!pendingReminders || pendingReminders.length === 0) {
      return NextResponse.json({ delivered: 0 })
    }

    let delivered = 0

    for (const reminder of pendingReminders) {
      const meta = reminder.metadata as {
        message?: string
        priority?: string
        reminder_id?: string
        deliver_at?: string
      }

      const content = `⏰ **Reminder:** ${meta.message || 'You set a reminder'}`

      // Insert the reminder as an assistant message so it appears in chat
      const { error: insertErr } = await (supabase as any)
        .from('messages')
        .insert({
          conversation_id: reminder.conversation_id,
          role: 'assistant',
          content,
          metadata: {
            type: 'reminder_delivered',
            reminder_id: meta.reminder_id,
            priority: meta.priority || 'medium',
          },
        })

      if (insertErr) {
        console.error('[Reminders Worker] Insert error:', insertErr)
        continue
      }

      // Mark the original system message as delivered
      await (supabase as any)
        .from('messages')
        .update({ metadata: { ...reminder.metadata, delivered: true } })
        .eq('id', reminder.id)

      delivered++
    }

    return NextResponse.json({ delivered })
  } catch (err) {
    console.error('[Reminders Worker] Unhandled error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
