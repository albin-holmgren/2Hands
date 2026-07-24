import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recordNotificationOutcome } from '@/lib/push-notifications'
import { recordBehaviorSignal } from '@/lib/personalization/behavior-engine'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const unreadOnly = searchParams.get('unread') === 'true'

    // Get notifications
    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (unreadOnly) {
      query = query.eq('is_read', false)
    }

    const { data: notifications, error } = await query

    if (error) {
      console.error('Error fetching notifications:', error)
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
    }

    // Get unread count from user_settings
    const { data: settings } = await supabase
      .from('user_settings')
      .select('unread_notification_count')
      .eq('user_id', user.id)
      .single()

    return NextResponse.json({
      notifications: notifications || [],
      unreadCount: (settings as { unread_notification_count: number } | null)?.unread_notification_count || 0,
    })
  } catch (error) {
    console.error('Notifications API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action } = body

    if (action === 'mark_read') {
      // Mark all notifications as read
      await supabase
        .from('notifications')
        .update({ is_read: true } as never)
        .eq('user_id', user.id)
        .eq('is_read', false)
      
      // Reset unread count
      await supabase
        .from('user_settings')
        .update({ unread_notification_count: 0 } as never)
        .eq('user_id', user.id)
        
      return NextResponse.json({ success: true })
    }

    if (action === 'mark_single_read' && body.notificationId) {
      // Mark single notification as read
      await supabase
        .from('notifications')
        .update({ is_read: true } as never)
        .eq('id', body.notificationId)
        .eq('user_id', user.id)

      return NextResponse.json({ success: true })
    }

    if (action === 'record_outcome') {
      // Mobile app reports: user tapped, ignored, or dismissed a notification
      // This feeds into the behavior engine for learning
      const { notificationId, outcome, metadata } = body
      if (!notificationId || !outcome || !['tapped', 'ignored', 'dismissed'].includes(outcome)) {
        return NextResponse.json({ error: 'Invalid outcome — must be tapped, ignored, or dismissed' }, { status: 400 })
      }

      // Feed into behavior engine (non-blocking)
      await recordNotificationOutcome(user.id, notificationId, outcome, metadata || {})

      // If tapped, also mark as read
      if (outcome === 'tapped' && body.notificationId) {
        await supabase
          .from('notifications')
          .update({ is_read: true } as never)
          .eq('id', body.notificationId)
          .eq('user_id', user.id)
      }

      return NextResponse.json({ success: true })
    }

    if (action === 'record_push_token') {
      // Mobile app registers its push token
      const { token, platform } = body
      if (!token) {
        return NextResponse.json({ error: 'Token is required' }, { status: 400 })
      }

      await supabase
        .from('push_tokens')
        .upsert({
          user_id: user.id,
          token,
          platform: platform || 'unknown',
          updated_at: new Date().toISOString(),
        } as never, { onConflict: 'user_id,token' })

      return NextResponse.json({ success: true })
    }

    if (action === 'app_opened') {
      // Mobile app opened — record session start for behavior learning
      recordBehaviorSignal(user.id, { type: 'session_start' }).catch(() => {})
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Notifications API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
