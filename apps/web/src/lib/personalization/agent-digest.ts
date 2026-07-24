/**
 * Agent Digest — Smart Briefing System
 *
 * Replaces raw agent status dumps with intelligent briefings:
 *   - Aggregates insights from all agents
 *   - Prioritizes what to report (urgent vs routine)
 *   - Batches notifications to avoid spam
 *   - Adapts reporting depth to user preference
 *   - Tracks what the user engages with
 */

import { createClient } from '@/lib/supabase/server'
import { type UserPersonalization } from './user-profile'

// ============================================================
// Types
// ============================================================

export interface AgentStatus {
  id: string
  name: string
  status: 'idle' | 'running' | 'error' | 'stopped'
  schedule_type: 'once' | 'scheduled' | 'realtime'
  schedule_cron?: string
  last_run_at: string | null
  next_run_at: string | null
  total_credits_used: number
  config: {
    description?: string
    goal_tree_active?: boolean
    auto_continue?: boolean
  } | null
}

export interface AgentInsight {
  agentId: string
  agentName: string
  type: 'insight' | 'completed' | 'failed' | 'blocker'
  content: string
  timestamp: string
  priority: 'urgent' | 'high' | 'normal' | 'low'
  seen: boolean
}

export interface AgentDigest {
  /** One-line headline for the briefing */
  headline: string
  /** Agent team summary — what's running, what completed, any issues */
  teamStatus: string
  /** Top insights from agents (prioritized, deduplicated) */
  topInsights: AgentInsight[]
  /** Agents that need attention (errors, blockers) */
  needsAttention: AgentAttentionItem[]
  /** Full formatted prompt for the AI Manager */
  promptSection: string
  /** Number of unread insights */
  unreadCount: number
}

export interface AgentAttentionItem {
  agentName: string
  agentId: string
  issue: string
  priority: 'urgent' | 'high' | 'normal'
}

// ============================================================
// Insight Priority Classification
// ============================================================

const URGENT_KEYWORDS = [
  'error', 'fail', 'down', 'outage', 'critical', 'security',
  'breach', 'unauthorized', 'payment fail', 'refund', 'complaint',
  'urgent', 'emergency', 'blocked', 'stuck', 'broken',
]

const HIGH_KEYWORDS = [
  'lead', 'opportunity', 'response', 'reply', 'meeting booked',
  'sale', 'conversion', 'signed up', 'new customer', 'revenue',
  'anomaly', 'unusual', 'spike', 'alert', 'warning',
  'deadline', 'overdue', 'escalat',
]

const LOW_KEYWORDS = [
  'no change', 'nothing new', 'all clear', 'routine',
  'checked', 'verified', 'no issues', 'unchanged',
]

function classifyInsightPriority(content: string): 'urgent' | 'high' | 'normal' | 'low' {
  const lower = content.toLowerCase()

  if (URGENT_KEYWORDS.some(k => lower.includes(k))) return 'urgent'
  if (HIGH_KEYWORDS.some(k => lower.includes(k))) return 'high'
  if (LOW_KEYWORDS.some(k => lower.includes(k))) return 'low'
  return 'normal'
}

// ============================================================
// Fetch Agent Insights
// ============================================================

/**
 * Get recent insights from all agents for a user.
 * Pulls from run_events stored in agent config and progress updates.
 */
async function getRecentAgentInsights(
  userId: string,
  agents: AgentStatus[],
  hoursBack: number = 24
): Promise<AgentInsight[]> {
  const supabase = await createClient()
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString()
  const insights: AgentInsight[] = []

  // Fetch recent progress updates (insights, completions, failures)
  const agentIds = agents.map(a => a.id)
  if (agentIds.length === 0) return insights

  const { data: progressRows } = await supabase
    .from('agent_progress')
    .select('agent_id, type, message, created_at, metadata')
    .in('agent_id', agentIds)
    .gte('created_at', cutoff)
    .in('type', ['insight', 'completed', 'failed', 'blocker'])
    .order('created_at', { ascending: false })
    .limit(50)

  if (progressRows) {
    for (const row of progressRows as Array<{
      agent_id: string
      type: string
      message: string
      created_at: string
      metadata?: Record<string, unknown>
    }>) {
      const agent = agents.find(a => a.id === row.agent_id)
      if (!agent) continue

      insights.push({
        agentId: row.agent_id,
        agentName: agent.name,
        type: row.type as AgentInsight['type'],
        content: row.message,
        timestamp: row.created_at,
        priority: classifyInsightPriority(row.message),
        seen: false,
      })
    }
  }

  // Sort by priority then recency
  const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 }
  insights.sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
    if (pDiff !== 0) return pDiff
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  })

  return insights
}

// ============================================================
// Build Smart Digest
// ============================================================

/**
 * Build a smart digest of all agent activity for the AI Manager.
 */
export async function buildAgentDigest(
  userId: string,
  agents: AgentStatus[],
  userProfile: UserPersonalization
): Promise<AgentDigest> {
  const insights = await getRecentAgentInsights(userId, agents)

  // Classify agents by state
  const running = agents.filter(a => a.status === 'running')
  const errored = agents.filter(a => a.status === 'error')
  const idle = agents.filter(a => a.status === 'idle')
  const scheduled = agents.filter(a => a.schedule_type === 'scheduled')
  
  // Build attention items
  const needsAttention: AgentAttentionItem[] = []
  for (const agent of errored) {
    needsAttention.push({
      agentName: agent.name,
      agentId: agent.id,
      issue: 'Agent encountered an error on last run',
      priority: 'urgent',
    })
  }
  
  // Check for agents with urgent insights
  const urgentInsights = insights.filter(i => i.priority === 'urgent')
  for (const insight of urgentInsights) {
    if (!needsAttention.some(a => a.agentId === insight.agentId)) {
      needsAttention.push({
        agentName: insight.agentName,
        agentId: insight.agentId,
        issue: insight.content.slice(0, 100),
        priority: 'urgent',
      })
    }
  }

  // Build headline
  let headline: string
  if (needsAttention.length > 0) {
    headline = `${needsAttention.length} item${needsAttention.length > 1 ? 's' : ''} need${needsAttention.length === 1 ? 's' : ''} your attention`
  } else if (running.length > 0) {
    headline = `${running.length} agent${running.length > 1 ? 's' : ''} working now`
  } else if (insights.length > 0) {
    headline = `${insights.length} new update${insights.length > 1 ? 's' : ''} from your team`
  } else {
    headline = 'All agents idle — everything looks good'
  }

  // Build team status (concise)
  const statusParts: string[] = []
  if (running.length > 0) {
    statusParts.push(`**Active:** ${running.map(a => a.name).join(', ')}`)
  }
  if (errored.length > 0) {
    statusParts.push(`**Needs attention:** ${errored.map(a => a.name).join(', ')}`)
  }
  if (scheduled.length > 0) {
    const nextRuns = scheduled
      .filter(a => a.next_run_at)
      .sort((a, b) => new Date(a.next_run_at!).getTime() - new Date(b.next_run_at!).getTime())
      .slice(0, 3)
    if (nextRuns.length > 0) {
      statusParts.push(`**Next up:** ${nextRuns.map(a => {
        const when = formatRelativeTime(new Date(a.next_run_at!))
        return `${a.name} (${when})`
      }).join(', ')}`)
    }
  }
  if (idle.length > 0 && idle.length <= 3) {
    statusParts.push(`**Idle:** ${idle.map(a => a.name).join(', ')}`)
  } else if (idle.length > 3) {
    statusParts.push(`**Idle:** ${idle.length} agents`)
  }
  const teamStatus = statusParts.join('\n')

  // Select top insights based on user preference
  const maxInsights = userProfile.preferredDetailLevel === 'brief' ? 3
    : userProfile.preferredDetailLevel === 'detailed' ? 10
    : 5
  const topInsights = insights.slice(0, maxInsights)

  // Build the prompt section
  const promptSection = formatDigestForPrompt(
    headline,
    teamStatus,
    topInsights,
    needsAttention,
    agents,
    userProfile
  )

  return {
    headline,
    teamStatus,
    topInsights,
    needsAttention,
    promptSection,
    unreadCount: insights.filter(i => !i.seen).length,
  }
}

// ============================================================
// Format for AI Manager Prompt
// ============================================================

function formatDigestForPrompt(
  headline: string,
  teamStatus: string,
  topInsights: AgentInsight[],
  needsAttention: AgentAttentionItem[],
  agents: AgentStatus[],
  userProfile: UserPersonalization
): string {
  if (agents.length === 0) return ''

  const parts: string[] = [
    '\n## YOUR TEAM STATUS',
    `*${headline}*`,
    '',
    teamStatus,
  ]

  // Needs attention — always show
  if (needsAttention.length > 0) {
    parts.push('', '### Needs Your Attention')
    for (const item of needsAttention) {
      const icon = item.priority === 'urgent' ? '🔴' : '🟡'
      parts.push(`${icon} **${item.agentName}:** ${item.issue}`)
    }
  }

  // Recent insights — filtered by priority
  if (topInsights.length > 0) {
    parts.push('', '### Recent Agent Updates')
    for (const insight of topInsights) {
      const age = formatRelativeTime(new Date(insight.timestamp))
      const priorityLabel = insight.priority === 'urgent' ? ' [URGENT]'
        : insight.priority === 'high' ? ' [Important]'
        : ''
      parts.push(`- **${insight.agentName}** (${age})${priorityLabel}: ${insight.content.slice(0, 200)}`)
    }
  }

  // Agent directory (compact)
  parts.push('', '### Agent Directory')
  for (const agent of agents) {
    const statusIcon = agent.status === 'running' ? '🟢'
      : agent.status === 'error' ? '🔴'
      : agent.status === 'stopped' ? '⏹️'
      : '⚪'
    const desc = agent.config?.description?.slice(0, 60) || 'No description'
    const schedLabel = agent.schedule_type === 'scheduled'
      ? `, scheduled`
      : agent.schedule_type === 'realtime' ? ', realtime'
      : ''
    parts.push(`${statusIcon} **${agent.name}** (${agent.id.slice(0, 8)}...): ${desc}${schedLabel}`)
  }

  // Reporting instructions for the AI Manager
  parts.push('', '### How to Report to the User')
  parts.push(`PROACTIVE REPORTING RULES:
- **Urgent items**: Mention immediately when the user opens chat. Lead with the issue.
- **High-priority insights**: Mention naturally in conversation. "By the way, ${agents[0]?.name || 'your agent'} found something interesting..."
- **Normal updates**: Only share if the user asks about agents or if there's a natural opening.
- **Low-priority/routine**: Don't volunteer. Only share if directly asked.
- **Never dump all updates at once** — surface the most important 1-2 items, offer more if they're interested.
- **Match the user's energy** — if they're asking about something else, don't derail with agent updates.
- **Use the user's preferred detail level**: ${userProfile.preferredDetailLevel}`)

  return parts.join('\n')
}

// ============================================================
// Engagement Tracking
// ============================================================

/**
 * Record that the user engaged with an agent update.
 * Used to learn what kind of updates the user cares about.
 */
export async function recordDigestEngagement(
  userId: string,
  agentId: string,
  insightType: string,
  engaged: boolean // true = user asked follow-up, false = user ignored
): Promise<void> {
  const supabase = await createClient()

  try {
    await supabase
      .from('digest_engagement')
      .insert({
        user_id: userId,
        agent_id: agentId,
        insight_type: insightType,
        engaged,
        created_at: new Date().toISOString(),
      } as never)
  } catch (err) {
    console.error('[AgentDigest] Failed to record engagement:', err)
  }
}

/**
 * Get engagement stats to learn user preferences.
 * Returns which agent/insight types the user cares about most.
 */
export async function getEngagementStats(userId: string): Promise<{
  mostEngagedAgents: string[]
  leastEngagedAgents: string[]
  preferredInsightTypes: string[]
  engagementRate: number
}> {
  const supabase = await createClient()

  const { data: rows } = await supabase
    .from('digest_engagement')
    .select('agent_id, insight_type, engaged')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (!rows || rows.length === 0) {
    return {
      mostEngagedAgents: [],
      leastEngagedAgents: [],
      preferredInsightTypes: [],
      engagementRate: 0.5,
    }
  }

  const typedRows = rows as Array<{ agent_id: string; insight_type: string; engaged: boolean }>

  // Agent engagement
  const agentEngagement = new Map<string, { engaged: number; total: number }>()
  for (const row of typedRows) {
    const existing = agentEngagement.get(row.agent_id) || { engaged: 0, total: 0 }
    existing.total++
    if (row.engaged) existing.engaged++
    agentEngagement.set(row.agent_id, existing)
  }

  const agentRates = Array.from(agentEngagement.entries())
    .map(([id, stats]) => ({ id, rate: stats.engaged / stats.total }))
    .sort((a, b) => b.rate - a.rate)

  // Insight type preferences
  const typeEngagement = new Map<string, { engaged: number; total: number }>()
  for (const row of typedRows) {
    const existing = typeEngagement.get(row.insight_type) || { engaged: 0, total: 0 }
    existing.total++
    if (row.engaged) existing.engaged++
    typeEngagement.set(row.insight_type, existing)
  }

  const preferredTypes = Array.from(typeEngagement.entries())
    .filter(([, stats]) => stats.engaged / stats.total > 0.5)
    .map(([type]) => type)

  const totalEngaged = typedRows.filter(r => r.engaged).length
  const engagementRate = totalEngaged / typedRows.length

  return {
    mostEngagedAgents: agentRates.filter(a => a.rate > 0.5).map(a => a.id),
    leastEngagedAgents: agentRates.filter(a => a.rate < 0.2).map(a => a.id),
    preferredInsightTypes: preferredTypes,
    engagementRate,
  }
}

// ============================================================
// Notification Batching
// ============================================================

/**
 * Determine whether to send an agent update now or batch it.
 */
export function shouldNotifyImmediately(
  priority: 'urgent' | 'high' | 'normal' | 'low',
  userProfile: UserPersonalization
): boolean {
  // Urgent — always notify immediately
  if (priority === 'urgent') return true

  // High — notify if user is in established/trusted relationship
  if (priority === 'high') {
    return userProfile.relationshipStage === 'established' || userProfile.relationshipStage === 'trusted'
  }

  // Normal/low — batch into next check-in
  return false
}

// ============================================================
// Helpers
// ============================================================

function formatRelativeTime(date: Date): string {
  const now = Date.now()
  const diff = now - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}
