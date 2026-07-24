/**
 * Proactive Outreach API
 * 
 * Endpoints:
 * - POST: Process pending outreach messages (called by cron)
 * - GET: Get outreach status for debugging
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { 
  processProactiveOutreach, 
  shouldReachOut,
  scheduleOutreach
} from '@/lib/personalization/proactive-outreach'
import { celebrateMilestone } from '@/lib/personalization/proactive-outreach'
import { shouldSendOutreach } from '@/lib/personalization/adaptive-outreach'
import { sendPushNotification, notifyOutreach, hasPushEnabled } from '@/lib/notifications/push-notifications'
import { acquireCronLock, releaseCronLock, canSendOutreach, markOutreachSent } from '@/lib/proactive/idempotency'

// POST: Process all pending outreach (called by cron)
export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = (process.env.CRON_SECRET || '').trim()
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    // Use admin client for cron operations (bypasses RLS)
    const supabase = createAdminClient()
    
    // Get all active users
    const { data: users } = await supabase
      .from('profiles')
      .select('id')
      .limit(100)
    
    if (!users) {
      return NextResponse.json({ processed: 0, scheduled: 0 })
    }
    
    let scheduledCount = 0
    
    // Check if we should proactively reach out to each user, per workspace
    for (const user of users as { id: string }[]) {
      // Get user's workspaces
      const { data: memberships } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
      
      const workspaceIds = (memberships as { workspace_id: string }[] || []).map(m => m.workspace_id)
      
      for (const workspaceId of workspaceIds) {
        const { shouldReach, type } = await shouldReachOut(user.id, workspaceId)
        
        if (shouldReach && type) {
          await scheduleOutreach({
            userId: user.id,
            workspaceId,
            type,
          })
          scheduledCount++
        }
        
        // Check for milestones
        const { data: milestones } = await supabase
          .rpc('check_user_milestones' as never, { p_user_id: user.id } as never)
        
        if (milestones && Array.isArray(milestones)) {
          for (const milestone of milestones as { description: string }[]) {
            await celebrateMilestone(user.id, workspaceId, milestone.description)
          }
        }
      }
    }
    
    // Process all pending outreach messages
    const sentCount = await processProactiveOutreach()
    
    return NextResponse.json({
      success: true,
      processed: sentCount,
      scheduled: scheduledCount,
      timestamp: new Date().toISOString(),
    })
    
  } catch (error) {
    console.error('[Outreach API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process outreach' },
      { status: 500 }
    )
  }
}

// GET: Status and debug info
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = (process.env.CRON_SECRET || '').trim()
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    const supabase = createAdminClient()
    
    // Get pending outreach count
    const { count: pendingCount } = await supabase
      .from('proactive_outreach')
      .select('id', { count: 'exact', head: true })
      .is('sent_at', null)
    
    // Get sent in last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: sentCount } = await supabase
      .from('proactive_outreach')
      .select('id', { count: 'exact', head: true })
      .gt('sent_at', oneDayAgo)
    
    return NextResponse.json({
      pending: pendingCount || 0,
      sentLast24h: sentCount || 0,
      timestamp: new Date().toISOString(),
    })
    
  } catch (error) {
    console.error('[Outreach API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get status' },
      { status: 500 }
    )
  }
}
