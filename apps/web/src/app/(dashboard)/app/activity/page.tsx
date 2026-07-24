'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Activity,
  Bot,
  Target,
  CheckCircle2,
  AlertCircle,
  Search,
  ArrowRight,
  RefreshCw,
  LayoutDashboard,
  X,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'

// ── Types ────────────────────────────────────────────────────────────────────

interface ActivityItem {
  id: string
  type: 'agent_started' | 'agent_completed' | 'agent_failed' | 'mission_tick' | 'board_update' | 'finding'
  title: string
  description: string
  timestamp: string
  icon: 'bot' | 'target' | 'check' | 'alert' | 'board' | 'search'
  color: string
  link?: string
  agentName?: string
  agentId?: string
  missionGoal?: string
  status?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

const iconMap = {
  bot: Bot,
  target: Target,
  check: CheckCircle2,
  alert: AlertCircle,
  board: LayoutDashboard,
  search: Search,
}

// ── Animation Variants ───────────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.05,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.25,
      ease: [0.25, 0.1, 0.25, 1] as const,
    },
  },
}

const sidebarVariants = {
  hidden: { x: '100%', opacity: 0.8 },
  visible: {
    x: 0,
    opacity: 1,
    transition: {
      duration: 0.35,
      ease: [0.32, 0.72, 0, 1] as const,
    },
  },
  exit: {
    x: '100%',
    opacity: 0.8,
    transition: {
      duration: 0.25,
      ease: [0.32, 0.72, 0, 1] as const,
    },
  },
}

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
}

// ── Detail Sidebar ───────────────────────────────────────────────────────────

function DetailSidebar({ item, onClose }: { item: ActivityItem; onClose: () => void }) {
  const Icon = iconMap[item.icon] || Activity

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const typeLabel = (() => {
    switch (item.type) {
      case 'agent_started':
      case 'agent_completed':
      case 'agent_failed': return 'Agent'
      case 'mission_tick': return 'Mission'
      case 'board_update': return 'Board'
      case 'finding': return 'Finding'
      default: return 'Event'
    }
  })()

  return (
    <>
      {/* Backdrop */}
      <motion.div
        variants={backdropVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="fixed inset-0 z-40 bg-black/20 dark:bg-black/40"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        variants={sidebarVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="fixed top-0 right-0 z-50 h-full w-full max-w-md bg-background border-l border-border shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <motion.div
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.2 }}
              className={cn('w-8 h-8 rounded-lg flex items-center justify-center bg-muted', item.color)}
            >
              <Icon size={14} strokeWidth={2} />
            </motion.div>
            <span className="text-[12px] font-medium text-muted-foreground">{typeLabel}</span>
          </div>
          <motion.button
            whileHover={{ scale: 1.05, backgroundColor: 'hsl(var(--muted))' }}
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="p-2 rounded-lg transition-colors text-muted-foreground"
          >
            <X size={16} />
          </motion.button>
        </div>

        {/* Content */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="flex-1 overflow-y-auto px-6 py-6 space-y-8"
        >
          {/* Title */}
          <div>
            <h2 className="text-[16px] font-medium text-foreground leading-snug">{item.title}</h2>
            <p className="text-[12px] text-muted-foreground mt-1">{formatTimestamp(item.timestamp)}</p>
          </div>

          {/* Agent info */}
          {item.agentName && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: 0.15 }}
              className="space-y-2"
            >
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Agent</p>
              <div className="flex items-center gap-3">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center"
                >
                  <Bot size={14} className="text-muted-foreground" />
                </motion.div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-foreground">{item.agentName}</p>
                  {item.agentId && (
                    <p className="text-[11px] text-muted-foreground font-mono">{item.agentId.slice(0, 8)}</p>
                  )}
                </div>
                {item.link?.startsWith('/app/agent/') && (
                  <Link href={item.link} className="text-muted-foreground hover:text-foreground transition-colors">
                    <ExternalLink size={14} />
                  </Link>
                )}
              </div>
            </motion.div>
          )}

          {/* Mission */}
          {item.missionGoal && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: 0.2 }}
              className="space-y-2"
            >
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Mission</p>
              <p className="text-[13px] text-foreground leading-relaxed">{item.missionGoal}</p>
            </motion.div>
          )}

          {/* Description */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: 0.25 }}
            className="space-y-2"
          >
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Details</p>
            <p className="text-[13px] text-foreground leading-relaxed whitespace-pre-wrap">{item.description}</p>
          </motion.div>
        </motion.div>

        {/* Footer */}
        {item.link && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.3 }}
            className="shrink-0 px-6 py-4 border-t border-border"
          >
            <Link
              href={item.link}
              className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-all active:scale-[0.98]"
            >
              <ExternalLink size={14} />
              Open {typeLabel}
            </Link>
          </motion.div>
        )}
      </motion.div>
    </>
  )
}

// ── Activity Row ─────────────────────────────────────────────────────────────

function ActivityRow({ item, isSelected, onSelect, index }: {
  item: ActivityItem; isSelected: boolean; onSelect: (item: ActivityItem) => void; index: number
}) {
  const Icon = iconMap[item.icon] || Activity

  return (
    <motion.button
      variants={itemVariants}
      onClick={() => onSelect(item)}
      whileHover={{ 
        x: 4,
        transition: { duration: 0.15, ease: 'easeOut' }
      }}
      whileTap={{ scale: 0.995 }}
      className={cn(
        'flex items-start gap-3 py-3 px-4 w-full text-left transition-colors border-b border-border/50',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        isSelected && 'bg-muted'
      )}
    >
      <motion.div
        whileHover={{ scale: 1.08, rotate: 2 }}
        transition={{ duration: 0.2 }}
        className={cn('w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 bg-muted', item.color)}
      >
        <Icon size={13} strokeWidth={2} />
      </motion.div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[13px] text-foreground truncate">{item.title}</p>
          {item.agentName && (
            <span className="text-[11px] text-muted-foreground truncate">• {item.agentName}</span>
          )}
        </div>
        <p className="text-[12px] text-muted-foreground line-clamp-1 mt-0.5">{item.description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] text-muted-foreground">{timeAgo(item.timestamp)}</span>
        <motion.div
          initial={{ opacity: 0, x: -5 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, delay: index * 0.03 }}
        >
          <ArrowRight size={12} className="text-muted-foreground/50" />
        </motion.div>
      </div>
    </motion.button>
  )
}

// ── Loading Skeleton ─────────────────────────────────────────────────────────

function LoadingRow({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      className="flex items-start gap-3 py-3 px-4"
    >
      <div className="w-7 h-7 rounded-md bg-muted animate-pulse shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 bg-muted rounded animate-pulse" style={{ width: `${30 + (index * 10) % 40}%` }} />
        <div className="h-3 bg-muted rounded animate-pulse" style={{ width: `${50 + (index * 8) % 30}%` }} />
      </div>
      <div className="h-3 w-10 bg-muted rounded animate-pulse shrink-0" />
    </motion.div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<ActivityItem | null>(null)

  const fetchActivity = useCallback(async () => {
    try {
      const [agentsRes, missionsRes, boardRes] = await Promise.all([
        fetch('/api/agents?limit=50'),
        fetch('/api/missions'),
        fetch('/api/boards'),
      ])

      const items: ActivityItem[] = []

      // Parse agents
      if (agentsRes.ok) {
        const agentsData = await agentsRes.json()
        const agents = (agentsData.agents ?? []) as Array<{
          id: string; name: string; status: string; config?: Record<string, unknown>; created_at: string; updated_at: string
        }>

        for (const agent of agents.slice(0, 20)) {
          const summary = (agent.config?.last_run_summary as string) || ''
          if (agent.status === 'working') {
            items.push({
              id: `agent-working-${agent.id}`,
              type: 'agent_started',
              title: `${agent.name} is working`,
              description: (agent.config?.description as string)?.slice(0, 120) || 'Running task...',
              timestamp: agent.updated_at,
              icon: 'bot',
              color: 'text-muted-foreground',
              link: `/app/agent/${agent.id}`,
              agentName: agent.name,
              agentId: agent.id,
            })
          } else if (agent.status === 'completed' && summary) {
            items.push({
              id: `agent-done-${agent.id}`,
              type: 'agent_completed',
              title: `${agent.name} completed`,
              description: summary.slice(0, 150),
              timestamp: agent.updated_at,
              icon: 'check',
              color: 'text-muted-foreground',
              link: `/app/agent/${agent.id}`,
              agentName: agent.name,
              agentId: agent.id,
            })
          } else if (agent.status === 'failed') {
            items.push({
              id: `agent-fail-${agent.id}`,
              type: 'agent_failed',
              title: `${agent.name} failed`,
              description: (agent.config?.last_error as string)?.slice(0, 120) || 'Task failed',
              timestamp: agent.updated_at,
              icon: 'alert',
              color: 'text-destructive',
              link: `/app/agent/${agent.id}`,
              agentName: agent.name,
              agentId: agent.id,
            })
          }
        }
      }

      // Parse missions
      if (missionsRes.ok) {
        const missionsData = await missionsRes.json()
        const missions = (missionsData.missions ?? []) as Array<{
          id: string; goal: string; status: string; tick_count: number; last_tick_at: string; created_at: string
        }>

        for (const m of missions.slice(0, 10)) {
          if (m.last_tick_at) {
            items.push({
              id: `mission-tick-${m.id}`,
              type: 'mission_tick',
              title: `Mission tick #${m.tick_count || '?'}`,
              description: m.goal.slice(0, 100),
              timestamp: m.last_tick_at,
              icon: 'target',
              color: 'text-muted-foreground',
              link: '/app/mission',
              missionGoal: m.goal,
            })
          }
        }
      }

      // Parse board cards
      if (boardRes.ok) {
        const boardData = await boardRes.json()
        const cards = (boardData.cards ?? []) as Array<{
          id: string; title: string; status: string; description: string | null; agent_id: string | null; updated_at: string; created_at: string
        }>

        const recentCards = [...cards]
          .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
          .slice(0, 10)

        for (const card of recentCards) {
          items.push({
            id: `board-${card.id}`,
            type: 'board_update',
            title: card.title,
            description: card.description?.slice(0, 100) || `Status: ${card.status.replace(/_/g, ' ')}`,
            timestamp: card.updated_at || card.created_at,
            icon: 'board',
            color: 'text-muted-foreground',
            link: '/app/mission',
            status: card.status,
          })
        }
      }

      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      setActivities(items)
    } catch (err) {
      console.error('Failed to fetch activity:', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchActivity()
    const interval = setInterval(fetchActivity, 15000)
    return () => clearInterval(interval)
  }, [fetchActivity])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('activity-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, () => fetchActivity())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mission_cards' }, () => fetchActivity())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchActivity])

  // Group activities by date
  const groupedActivities = activities.reduce<Record<string, ActivityItem[]>>((groups, item) => {
    const d = new Date(item.timestamp)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    let label: string
    if (d.toDateString() === today.toDateString()) label = 'Today'
    else if (d.toDateString() === yesterday.toDateString()) label = 'Yesterday'
    else label = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

    if (!groups[label]) groups[label] = []
    groups[label].push(item)
    return groups
  }, {})

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Simple Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0"
      >
        <div className="flex items-center gap-3">
          <motion.div
            whileHover={{ rotate: 15, scale: 1.1 }}
            transition={{ duration: 0.2 }}
          >
            <Activity size={18} className="text-muted-foreground" />
          </motion.div>
          <div>
            <h1 className="text-[16px] font-medium text-foreground">Activity</h1>
            <p className="text-[12px] text-muted-foreground">Recent events from your AI team</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.05, backgroundColor: 'hsl(var(--muted))' }}
            whileTap={{ scale: 0.95 }}
            onClick={fetchActivity}
            className="p-2 rounded-lg transition-colors text-muted-foreground"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </motion.button>
        </div>
      </motion.div>

      {/* Activity List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="divide-y divide-border/50">
            {[...Array(8)].map((_, i) => (
              <LoadingRow key={i} index={i} />
            ))}
          </div>
        ) : activities.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center gap-2 text-center py-20"
          >
            <Activity size={32} className="text-muted-foreground/20" />
            <p className="text-[14px] text-muted-foreground">No activity yet</p>
            <p className="text-[12px] text-muted-foreground/60">Start a mission or create an agent to see activity</p>
          </motion.div>
        ) : (
          <div className="divide-y divide-border/50">
            {Object.entries(groupedActivities).map(([dateLabel, items], groupIndex) => (
              <motion.div
                key={dateLabel}
                initial="hidden"
                animate="visible"
                variants={containerVariants}
              >
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: groupIndex * 0.05 }}
                  className="sticky top-0 z-10 px-4 py-2 bg-background border-b border-border/50"
                >
                  <p className="text-[11px] font-medium text-muted-foreground">{dateLabel}</p>
                </motion.div>
                {items.map((item, index) => (
                  <ActivityRow
                    key={item.id}
                    item={item}
                    index={index}
                    isSelected={selectedItem?.id === item.id}
                    onSelect={setSelectedItem}
                  />
                ))}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Detail Sidebar */}
      <AnimatePresence mode="wait">
        {selectedItem && (
          <DetailSidebar item={selectedItem} onClose={() => setSelectedItem(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}
