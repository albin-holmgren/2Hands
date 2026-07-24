import { createClient } from '@/lib/supabase/server'
import { scoreNotification, recordBehaviorSignal, type NotificationDecision } from '@/lib/personalization/behavior-engine'

interface PushNotificationPayload {
  title: string
  body: string
  data?: Record<string, unknown>
}

export async function sendPushNotification(
  userId: string,
  payload: PushNotificationPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    
    // Get all push tokens for the user
    const { data: tokens, error: tokensError } = await supabase
      .from('push_tokens')
      .select('token, platform')
      .eq('user_id', userId)
    
    if (tokensError) {
      console.error('[Push] Error fetching tokens:', tokensError)
      return { success: false, error: tokensError.message }
    }
    
    if (!tokens || tokens.length === 0) {
      console.log('[Push] No tokens found for user:', userId)
      return { success: true } // Not an error, user just hasn't registered
    }
    
    // Send to Expo Push API
    const typedTokens = tokens as Array<{ token: string; platform: string }>
    const messages = typedTokens.map(t => ({
      to: t.token,
      sound: 'default',
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
    }))
    
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    })
    
    const result = await response.json()
    
    // Log the notification
    await supabase.from('notification_log').insert({
      user_id: userId,
      type: payload.data?.type || 'general',
      title: payload.title,
      body: payload.body,
      data: payload.data,
      status: response.ok ? 'sent' : 'failed',
      error: response.ok ? null : JSON.stringify(result),
    } as never)
    
    if (!response.ok) {
      console.error('[Push] Expo API error:', result)
      return { success: false, error: 'Failed to send push notification' }
    }
    
    console.log('[Push] Sent to', tokens.length, 'devices for user:', userId)
    return { success: true }
  } catch (error) {
    console.error('[Push] Error:', error)
    return { success: false, error: String(error) }
  }
}

/**
 * Smart agent completion notification — uses behavior engine to decide
 * whether, when, and how to notify.
 */
export async function notifyAgentCompletion(
  userId: string,
  agentName: string,
  agentId: string,
  status: 'completed' | 'failed',
  summary?: string
): Promise<void> {
  const priority = status === 'failed' ? 'urgent' as const : 'normal' as const

  const decision = await scoreNotification(
    userId,
    'agent_completion',
    status === 'failed' ? 'error' : 'completion',
    priority,
    agentName
  )

  if (!decision.shouldSend) {
    console.log(`[Push] Suppressed agent_completion for ${userId}: ${decision.reason}`)
    return
  }

  const title = status === 'completed'
    ? `${agentName} finished`
    : `${agentName} needs attention`

  const body = summary
    ? summary.length > 120 ? summary.slice(0, 117) + '...' : summary
    : status === 'completed'
      ? 'Task completed — tap to see what was found.'
      : 'Something went wrong — tap to review.'

  if (decision.delayMinutes > 0) {
    // Schedule for later (could store in DB for a cron to pick up)
    console.log(`[Push] Delaying agent_completion for ${userId} by ${decision.delayMinutes}m (score: ${decision.score.toFixed(2)})`)
    setTimeout(() => {
      sendPushNotification(userId, { title, body, data: { type: 'agent_completion', agentId, agentName, status, notificationId: `ac_${Date.now()}` } })
    }, decision.delayMinutes * 60 * 1000)
  } else {
    await sendPushNotification(userId, { title, body, data: { type: 'agent_completion', agentId, agentName, status, notificationId: `ac_${Date.now()}` } })
  }
}

export async function notifyNewMessage(
  userId: string,
  senderName: string,
  preview: string
): Promise<void> {
  // Messages are always delivered (user expects replies)
  await sendPushNotification(userId, {
    title: senderName,
    body: preview.length > 100 ? preview.slice(0, 97) + '...' : preview,
    data: {
      type: 'message',
      notificationId: `msg_${Date.now()}`,
    },
  })
}

/**
 * Smart proactive outreach notification — scored by the behavior engine.
 */
export async function notifyProactiveOutreach(
  userId: string,
  title: string,
  message: string,
  contentCategory: string = 'general',
  priority: 'urgent' | 'high' | 'normal' | 'low' = 'normal'
): Promise<void> {
  const decision = await scoreNotification(
    userId, 'proactive_outreach', contentCategory, priority
  )

  if (!decision.shouldSend) {
    console.log(`[Push] Suppressed outreach for ${userId}: ${decision.reason}`)
    return
  }

  if (decision.delayMinutes > 0) {
    console.log(`[Push] Delaying outreach for ${userId} by ${decision.delayMinutes}m (score: ${decision.score.toFixed(2)})`)
    setTimeout(() => {
      sendPushNotification(userId, { title, body: message, data: { type: 'proactive_outreach', notificationId: `po_${Date.now()}`, contentCategory } })
    }, decision.delayMinutes * 60 * 1000)
  } else {
    await sendPushNotification(userId, { title, body: message, data: { type: 'proactive_outreach', notificationId: `po_${Date.now()}`, contentCategory } })
  }
}

/**
 * Smart agent insight notification — only sends if the user cares about this type.
 */
export async function notifyAgentInsight(
  userId: string,
  agentName: string,
  agentId: string,
  insight: string,
  contentCategory: string = 'general',
  priority: 'urgent' | 'high' | 'normal' | 'low' = 'normal'
): Promise<void> {
  const decision = await scoreNotification(
    userId, 'agent_insight', contentCategory, priority, agentName
  )

  if (!decision.shouldSend) {
    console.log(`[Push] Suppressed insight for ${userId}: ${decision.reason}`)
    return
  }

  const title = `${agentName} found something`
  const body = insight.length > 120 ? insight.slice(0, 117) + '...' : insight

  if (decision.delayMinutes > 0) {
    setTimeout(() => {
      sendPushNotification(userId, { title, body, data: { type: 'agent_insight', agentId, agentName, notificationId: `ai_${Date.now()}`, contentCategory } })
    }, decision.delayMinutes * 60 * 1000)
  } else {
    await sendPushNotification(userId, { title, body, data: { type: 'agent_insight', agentId, agentName, notificationId: `ai_${Date.now()}`, contentCategory } })
  }
}

/**
 * Mission tick completion notification — sent after each successful tick.
 */
export async function notifyMissionProgress(
  userId: string,
  missionId: string,
  goalSnippet: string,
  summary: string,
  agentsCreated: number,
  progressPct?: number
): Promise<void> {
  const decision = await scoreNotification(
    userId, 'proactive_outreach', 'mission_progress', 'normal'
  )

  if (!decision.shouldSend) return

  const title = progressPct != null ? `🎯 Mission ${progressPct}% complete` : `🎯 Mission update`
  const agentNote = agentsCreated > 0 ? ` · ${agentsCreated} agent${agentsCreated > 1 ? 's' : ''} delegated` : ''
  const goal = goalSnippet.length > 40 ? goalSnippet.slice(0, 37) + '…' : goalSnippet
  const body = `${goal}${agentNote} — ${summary.replace(/\*\*/g, '').slice(0, 80)}`

  await sendPushNotification(userId, {
    title,
    body,
    data: { type: 'mission_progress', missionId, notificationId: `mp_${Date.now()}` },
  })
}

/**
 * Mission completed notification — high priority, always sends if behavior score allows.
 */
export async function notifyMissionCompleted(
  userId: string,
  missionId: string,
  goal: string,
  tickCount: number,
  agentCount: number
): Promise<void> {
  const decision = await scoreNotification(userId, 'proactive_outreach', 'mission_progress', 'high')
  if (!decision.shouldSend) return
  const goalSnippet = goal.length > 50 ? goal.slice(0, 47) + '…' : goal
  await sendPushNotification(userId, {
    title: `🏆 Mission complete!`,
    body: `"${goalSnippet}" — ${tickCount} tick${tickCount !== 1 ? 's' : ''}, ${agentCount} agent${agentCount !== 1 ? 's' : ''}`,
    data: { type: 'mission_completed', missionId, notificationId: `mc_${Date.now()}` },
  })
}

/**
 * Mission milestone notification — sent when a project completes within a mission.
 */
export async function notifyMissionMilestone(
  userId: string,
  missionId: string,
  projectName: string,
  completedProjects: number,
  totalProjects: number
): Promise<void> {
  const decision = await scoreNotification(userId, 'proactive_outreach', 'mission_progress', 'normal')
  if (!decision.shouldSend) return
  await sendPushNotification(userId, {
    title: `🏅 Mission milestone reached!`,
    body: `"${projectName.slice(0, 50)}" complete — ${completedProjects}/${totalProjects} projects done`,
    data: { type: 'mission_milestone', missionId, notificationId: `mm_${Date.now()}` },
  })
}

/**
 * Record notification outcome — called when user taps or ignores a notification.
 * This feeds back into the behavior engine for learning.
 */
export async function recordNotificationOutcome(
  userId: string,
  notificationId: string,
  outcome: 'tapped' | 'ignored' | 'dismissed',
  metadata?: Record<string, unknown>
): Promise<void> {
  const signalType = outcome === 'tapped' ? 'notification_tapped' as const
    : outcome === 'dismissed' ? 'notification_dismissed' as const
    : 'notification_ignored' as const

  await recordBehaviorSignal(userId, {
    type: signalType,
    metadata: {
      notificationId,
      notificationType: metadata?.type || 'unknown',
      ...metadata,
    },
  })
}
