/**
 * Push Notifications via Expo
 * 
 * Sends push notifications to mobile app users
 * Works with Expo's push notification service
 */

import { createAdminClient } from '@/lib/supabase/server'

export interface PushNotification {
  userId: string
  title: string
  body: string
  data?: Record<string, unknown>
  badge?: number
  sound?: 'default' | null
  priority?: 'default' | 'normal' | 'high'
  channelId?: string
}

export interface ExpoPushToken {
  userId: string
  token: string
  platform: 'ios' | 'android'
  deviceId: string
  createdAt: string
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

/**
 * Send push notification to a user
 */
export async function sendPushNotification(
  notification: PushNotification
): Promise<{ success: boolean; ticketId?: string; error?: string }> {
  const supabase = createAdminClient()
  
  // Get user's push tokens
  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('token, platform')
    .eq('user_id', notification.userId)
  
  if (!tokens || tokens.length === 0) {
    return { success: false, error: 'No push tokens registered for user' }
  }
  
  const results: Array<{ success: boolean; ticketId?: string; error?: string }> = []
  
  for (const tokenData of tokens as { token: string; platform: string }[]) {
    try {
      const message = {
        to: tokenData.token,
        title: notification.title,
        body: notification.body,
        data: notification.data || {},
        sound: notification.sound || 'default',
        priority: notification.priority || 'high',
        channelId: notification.channelId || 'default',
        badge: notification.badge,
      }
      
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      })
      
      const result = await response.json()
      
      if (result.data?.status === 'ok') {
        results.push({ success: true, ticketId: result.data.id })
        
        // Log successful notification
        await logNotification(notification.userId, 'sent', notification.title, tokenData.token)
      } else {
        results.push({ success: false, error: result.data?.message || 'Unknown error' })
        
        // Handle invalid tokens
        if (result.data?.details?.error === 'DeviceNotRegistered') {
          await removeInvalidToken(notification.userId, tokenData.token)
        }
      }
    } catch (error) {
      results.push({ success: false, error: String(error) })
    }
  }
  
  // Return success if at least one notification was sent
  const successfulResult = results.find(r => r.success)
  return successfulResult || results[0] || { success: false, error: 'No results' }
}

/**
 * Send push to multiple users (batch)
 */
export async function sendBatchPushNotifications(
  notifications: PushNotification[]
): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0
  
  // Process in batches of 100 (Expo limit)
  for (let i = 0; i < notifications.length; i += 100) {
    const batch = notifications.slice(i, i + 100)
    const results = await Promise.all(
      batch.map(n => sendPushNotification(n))
    )
    
    for (const result of results) {
      if (result.success) sent++
      else failed++
    }
  }
  
  return { sent, failed }
}

/**
 * Register a push token for a user
 */
export async function registerPushToken(
  userId: string,
  token: string,
  platform: 'ios' | 'android',
  deviceId: string
): Promise<void> {
  const supabase = createAdminClient()
  
  // Upsert token (update if device already registered)
  await supabase
    .from('push_tokens')
    .upsert({
      user_id: userId,
      token,
      platform,
      device_id: deviceId,
      updated_at: new Date().toISOString(),
    } as never, { onConflict: 'user_id,device_id' })
}

/**
 * Remove an invalid/expired token
 */
async function removeInvalidToken(userId: string, token: string): Promise<void> {
  const supabase = createAdminClient()
  
  await supabase
    .from('push_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('token', token)
}

/**
 * Log notification for analytics
 */
async function logNotification(
  userId: string,
  status: 'sent' | 'failed' | 'delivered' | 'opened',
  title: string,
  token: string
): Promise<void> {
  const supabase = createAdminClient()
  
  await supabase
    .from('notification_logs')
    .insert({
      user_id: userId,
      status,
      title,
      token_hash: token.slice(-8), // Only store last 8 chars for privacy
      created_at: new Date().toISOString(),
    } as never)
}

/**
 * Send notification for agent completion
 */
export async function notifyAgentComplete(
  userId: string,
  agentName: string,
  summary: string
): Promise<void> {
  await sendPushNotification({
    userId,
    title: `${agentName} finished`,
    body: summary.slice(0, 100) + (summary.length > 100 ? '...' : ''),
    data: { type: 'agent_completion', agentName },
    channelId: 'agent_updates',
  })
}

/**
 * Send notification for proactive outreach
 */
export async function notifyOutreach(
  userId: string,
  type: string,
  message: string
): Promise<void> {
  const titles: Record<string, string> = {
    check_in: 'Quick check-in',
    report_ready: 'Report ready',
    suggestion: 'New suggestion',
    celebration: 'Achievement unlocked!',
    learning_question: 'Quick question',
    reminder: 'Reminder',
    insight: 'New insight',
  }
  
  await sendPushNotification({
    userId,
    title: titles[type] || '2Hands',
    body: message.slice(0, 100) + (message.length > 100 ? '...' : ''),
    data: { type: 'outreach', outreachType: type },
    channelId: 'proactive',
  })
}

/**
 * Send notification for approval request
 */
export async function notifyApprovalNeeded(
  userId: string,
  agentName: string,
  actionDescription: string
): Promise<void> {
  await sendPushNotification({
    userId,
    title: `${agentName} needs approval`,
    body: actionDescription.slice(0, 100),
    data: { type: 'approval_needed', agentName },
    channelId: 'approvals',
    priority: 'high',
  })
}

/**
 * Send notification for error/blocker
 */
export async function notifyError(
  userId: string,
  agentName: string,
  errorSummary: string
): Promise<void> {
  await sendPushNotification({
    userId,
    title: `${agentName} needs help`,
    body: errorSummary.slice(0, 100),
    data: { type: 'error', agentName },
    channelId: 'errors',
    priority: 'high',
  })
}

/**
 * Check if user has push notifications enabled
 */
export async function hasPushEnabled(userId: string): Promise<boolean> {
  const supabase = createAdminClient()
  
  const { count } = await supabase
    .from('push_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  
  return (count || 0) > 0
}
