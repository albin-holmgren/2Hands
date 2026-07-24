'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  Target,
  Play,
  Pause,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
  ChevronRight,
  AlertCircle,
  Bot,
  Plus,
  X,
  Trash2,
  Search,
  Download,
  Copy,
  ExternalLink,
  PlayCircle,
  Loader2,
  Brain,
  Calendar,
  FolderOpen,
  Users,
  LayoutDashboard,
  Upload,
  File,
  Repeat,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Star,
  Edit3,
  ChevronLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { KanbanBoard } from '@/components/kanban/kanban-board'
import { ConfidencePanel } from '@/components/confidence/ConfidencePanel'

// ── Mission templates ────────────────────────────────────────────────────────

interface MissionTemplate {
  id: string
  icon: string
  title: string
  goal: string
  why: string
  autonomy_level: 'draft_only' | 'execute_with_approval' | 'full_auto'
  tick_timebox_minutes: number
  category: 'growth' | 'product' | 'research' | 'content' | 'ops' | 'ai'
}

const MISSION_TEMPLATES: MissionTemplate[] = [
  {
    id: 'grow-business',
    icon: '🚀',
    title: 'Grow the business',
    goal: 'Continuously research growth opportunities, identify new customer segments, analyze competitors, and produce a weekly growth report with actionable recommendations.',
    why: 'Sustained revenue growth requires ongoing market intelligence and strategy iteration.',
    autonomy_level: 'full_auto',
    tick_timebox_minutes: 30,
    category: 'growth',
  },
  {
    id: 'build-features',
    icon: '⚙️',
    title: 'Build product features',
    goal: 'Identify the highest-impact missing features based on user needs and competitive gaps, prioritize them, and delegate implementation tasks to engineering agents.',
    why: 'Faster product iteration = more value for users = better retention and growth.',
    autonomy_level: 'execute_with_approval',
    tick_timebox_minutes: 45,
    category: 'product',
  },
  {
    id: 'content-engine',
    icon: '✍️',
    title: 'Content marketing engine',
    goal: 'Research trending topics in the AI agent space, draft SEO-optimised blog posts, create social media content, and track content performance weekly.',
    why: 'Consistent high-quality content drives organic growth and positions the brand as a thought leader.',
    autonomy_level: 'draft_only',
    tick_timebox_minutes: 30,
    category: 'content',
  },
  {
    id: 'competitor-intel',
    icon: '🔍',
    title: 'Competitor intelligence',
    goal: 'Monitor competitor product updates, pricing changes, and marketing moves. Summarise weekly and flag strategic threats or opportunities.',
    why: 'Staying ahead of the competition requires continuous monitoring and fast response.',
    autonomy_level: 'full_auto',
    tick_timebox_minutes: 20,
    category: 'research',
  },
  {
    id: 'customer-research',
    icon: '👥',
    title: 'Customer research loop',
    goal: 'Analyse user feedback, support tickets, and churn signals to identify the top pain points and unmet needs. Produce a prioritised improvement list each week.',
    why: 'Building what customers actually need is the fastest path to product-market fit.',
    autonomy_level: 'full_auto',
    tick_timebox_minutes: 25,
    category: 'research',
  },
  {
    id: 'seo-growth',
    icon: '📈',
    title: 'SEO & organic growth',
    goal: 'Research high-opportunity keywords, audit existing content for SEO gaps, and produce weekly optimisation recommendations and new page drafts.',
    why: 'Organic search is the highest-ROI acquisition channel for B2B SaaS.',
    autonomy_level: 'draft_only',
    tick_timebox_minutes: 30,
    category: 'growth',
  },
  {
    id: 'sales-outreach',
    icon: '📬',
    title: 'Sales outreach pipeline',
    goal: 'Research ideal customer profiles, find qualified leads matching target criteria, draft personalised outreach sequences, and track pipeline metrics weekly.',
    why: 'Consistent outreach fills the pipeline — the more quality touches, the more revenue.',
    autonomy_level: 'draft_only',
    tick_timebox_minutes: 25,
    category: 'growth',
  },
  {
    id: 'social-presence',
    icon: '📣',
    title: 'Social media presence',
    goal: 'Research trending topics relevant to the brand, draft LinkedIn and Twitter posts, schedule a weekly content calendar, and report on engagement trends.',
    why: 'Consistent social media presence builds brand trust and drives inbound leads.',
    autonomy_level: 'draft_only',
    tick_timebox_minutes: 20,
    category: 'content',
  },
  {
    id: 'hiring-pipeline',
    icon: '🧑‍💼',
    title: 'Recruiting & hiring',
    goal: 'Research candidate profiles on job boards, draft job descriptions, screen applicants against defined criteria, and maintain a weekly hiring tracker.',
    why: 'Faster hiring with better-matched candidates gives you a competitive advantage.',
    autonomy_level: 'draft_only',
    tick_timebox_minutes: 30,
    category: 'ops',
  },
  {
    id: 'investor-relations',
    icon: '💰',
    title: 'Fundraising research',
    goal: 'Research active investors in the relevant sector, compile detailed investor profiles, identify warm introduction paths, and draft outreach messages.',
    why: 'Raising capital requires systematic research and warm outreach — this builds that foundation.',
    autonomy_level: 'draft_only',
    tick_timebox_minutes: 30,
    category: 'research',
  },
  {
    id: 'partnerships',
    icon: '🤝',
    title: 'Partnership development',
    goal: 'Identify strategic partnership opportunities, research potential partners, draft partnership proposals, and track outreach status weekly.',
    why: 'Strategic partnerships can unlock new distribution channels and accelerate growth.',
    autonomy_level: 'draft_only',
    tick_timebox_minutes: 25,
    category: 'growth',
  },
  {
    id: 'self-improve-2hands',
    icon: '🧠',
    title: '2Hands self-improvement (AI builds itself)',
    goal: 'Continuously analyse the 2Hands codebase and product, identify bugs and high-impact missing features from user feedback and competitor research, implement improvements via PRs to the dev branch, monitor deployments, and track which changes improve key metrics. The AI improves itself to become a billion-dollar company.',
    why: 'A self-improving AI flywheel compounds every improvement — better product → more users → more data → smarter AI → better product.',
    autonomy_level: 'execute_with_approval',
    tick_timebox_minutes: 45,
    category: 'ai',
  },
]

const CATEGORY_COLORS: Record<string, string> = {
  growth: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  product: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
  research: 'text-purple-600 dark:text-purple-400 bg-purple-500/10',
  content: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  ops: 'text-orange-600 dark:text-orange-400 bg-orange-500/10',
  ai: 'text-violet-600 dark:text-violet-400 bg-violet-500/10',
}

interface GoalTreeTask {
  id: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
}

interface GoalTreeProject {
  id: string
  name: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  tasks: GoalTreeTask[]
}

interface GoalTree {
  original_goal: string
  current_project_id: string | null
  projects: GoalTreeProject[]
}

interface Mission {
  id: string
  goal: string
  status: 'active' | 'paused' | 'completed' | 'failed'
  autonomy_level: 'draft_only' | 'execute_with_approval' | 'full_auto'
  tick_timebox_minutes: number
  max_ticks_per_day: number
  last_tick_at: string | null
  next_tick_at: string | null
  handoff_note: string | null
  goal_tree: GoalTree | null
  conversation_id: string | null
  created_at: string
}

interface MissionEvent {
  id: number
  kind: string
  summary: string | null
  payload: Record<string, unknown>
  created_at: string
}

interface RunAggregates {
  queued: number
  claimed: number
  running: number
  completed: number
  failed: number
  timeout: number
  active_tasks: Array<{
    agent_id: string
    agent_name: string
    task: string
    status: string
    retry_run_id?: string | null
    retry_available_at?: string | null
  }>
  recent_failures: Array<{
    agent_id: string
    agent_name: string
    error: string
    retry_scheduled: boolean
    retry_available_at: string | null
    created_at: string
  }>
  needs_approval_count: number
}

const STATUS_CONFIG = {
  active: { label: 'Active', icon: Play, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  paused: { label: 'Paused', icon: Pause, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  failed: { label: 'Failed', icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
}

const AUTONOMY_LABELS = {
  draft_only: 'Draft only',
  execute_with_approval: 'Approval required',
  full_auto: 'Full auto',
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function timeUntil(dateStr: string | null): string {
  if (!dateStr) return '—'
  const diff = new Date(dateStr).getTime() - Date.now()
  if (diff < 0) return 'Overdue'
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Imminent'
  if (mins < 60) return `in ${mins}m`
  const hrs = Math.floor(mins / 60)
  return `in ${hrs}h`
}

function EventKindIcon({ kind }: { kind: string }) {
  switch (kind) {
    case 'tick_started': return <RefreshCw size={13} className="text-blue-400 shrink-0" />
    case 'tick_completed': return <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
    case 'agent_delegated': return <Bot size={13} className="text-purple-500 shrink-0" />
    case 'agent_completed': return <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
    case 'agent_failed': return <XCircle size={13} className="text-red-500 shrink-0" />
    case 'milestone_reached': return <Zap size={13} className="text-amber-500 shrink-0" />
    case 'mission_completed': return <Target size={13} className="text-emerald-500 shrink-0" />
    case 'tick_failed': return <XCircle size={13} className="text-red-500 shrink-0" />
    case 'mission_blocked': return <AlertCircle size={13} className="text-amber-500 shrink-0" />
    case 'project_started': return <Zap size={13} className="text-blue-500 shrink-0" />
    case 'task_started': return <PlayCircle size={13} className="text-teal-500 shrink-0" />
    default:
      if (kind.includes('completed')) return <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
      if (kind.includes('failed')) return <XCircle size={13} className="text-red-500 shrink-0" />
      if (kind.includes('agent')) return <Bot size={13} className="text-purple-500 shrink-0" />
      return <Zap size={13} className="text-muted-foreground shrink-0" />
  }
}

function MissionCard({
  mission,
  onAction,
  onSelect,
  selected,
}: {
  mission: Mission
  onAction: (id: string, action: 'pause' | 'resume' | 'run_now') => void
  onSelect: (id: string) => void
  selected: boolean
}) {
  const cfg = STATUS_CONFIG[mission.status]
  const StatusIcon = cfg.icon

  return (
    <div
      className={cn(
        'rounded-2xl border p-4 cursor-pointer transition-all duration-150',
        selected
          ? 'border-primary/40 bg-primary/5 shadow-sm'
          : 'border-border bg-card hover:border-border/70 hover:shadow-sm'
      )}
      onClick={() => onSelect(mission.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={cn('mt-0.5 p-1.5 rounded-lg shrink-0', cfg.bg)}>
            <StatusIcon size={14} className={cfg.color} />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-foreground leading-snug line-clamp-2">{mission.goal}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded-md', cfg.bg, cfg.color)}>
                {cfg.label}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {AUTONOMY_LABELS[mission.autonomy_level]}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {mission.tick_timebox_minutes}min/tick
              </span>
            </div>
          </div>
        </div>
        <ChevronRight size={14} className="text-muted-foreground shrink-0 mt-1" />
      </div>

      {/* Progress bar */}
      {mission.goal_tree && (() => {
        const gt = mission.goal_tree
        const total = gt.projects.reduce((s, p) => s + p.tasks.length, 0)
        const done = gt.projects.reduce((s, p) => s + p.tasks.filter(t => t.status === 'completed').length, 0)
        if (total === 0) return null
        const pct = Math.round((done / total) * 100)
        const currentProj = gt.projects.find(p => p.id === gt.current_project_id)
        return (
          <div className="mt-2">
            {currentProj && (
              <p className="text-[10px] text-muted-foreground mb-1 line-clamp-1">
                <span className="font-medium text-foreground/70">{pct}%</span> · {currentProj.name}
              </p>
            )}
            <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-emerald-500' : 'bg-primary/60')}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })()}

      <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock size={10} />
            Last: {timeAgo(mission.last_tick_at)}
          </span>
          {mission.status === 'active' && (
            <span className="flex items-center gap-1">
              <Zap size={10} />
              Next: {timeUntil(mission.next_tick_at)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {mission.status === 'active' && (
            <>
              <button
                onClick={() => onAction(mission.id, 'run_now')}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
                title="Run tick now"
              >
                <RefreshCw size={13} />
              </button>
              <button
                onClick={() => onAction(mission.id, 'pause')}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
                title="Pause mission"
              >
                <Pause size={13} />
              </button>
            </>
          )}
          {mission.status === 'paused' && (
            <button
              onClick={() => onAction(mission.id, 'resume')}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors"
              title="Resume mission"
            >
              <Play size={13} />
            </button>
          )}
        </div>
      </div>

      {mission.handoff_note && (
        <p className="mt-2 text-[12px] text-muted-foreground line-clamp-2 italic">
          {mission.handoff_note.replace(/^##.*?\n/m, '').trim().slice(0, 160)}
        </p>
      )}
    </div>
  )
}

export default function MissionPage() {
  const router = useRouter()
  const [missions, setMissions] = useState<Mission[]>([])
  const [events, setEvents] = useState<MissionEvent[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'completed'>('all')
  const [showTemplates, setShowTemplates] = useState(false)
  const [startingTemplate, setStartingTemplate] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createGoal, setCreateGoal] = useState('')
  const [createAutonomy, setCreateAutonomy] = useState<'draft_only' | 'execute_with_approval' | 'full_auto'>('execute_with_approval')
  const [createTimebox, setCreateTimebox] = useState(20)
  const [createMaxTicks, setCreateMaxTicks] = useState(4)
  const [createContext, setCreateContext] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeAgents, setActiveAgents] = useState<{ id: string; name: string; status: string; config?: Record<string, unknown> }[]>([])
  const [mobileTab, setMobileTab] = useState<'list' | 'detail'>('list')
  const [detailTab, setDetailTab] = useState<'overview' | 'activity' | 'findings' | 'agents' | 'settings' | 'workflow'>('overview')
  const [runAggregates, setRunAggregates] = useState<RunAggregates | null>(null)
  const [editingSettings, setEditingSettings] = useState(false)
  const [editGoal, setEditGoal] = useState('')
  const [editTimebox, setEditTimebox] = useState(30)
  const [editMaxTicks, setEditMaxTicks] = useState(6)
  const [editAutonomy, setEditAutonomy] = useState<'draft_only' | 'execute_with_approval' | 'full_auto'>('full_auto')
  const [saving, setSaving] = useState(false)
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set())
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [findingSearch, setFindingSearch] = useState('')
  const [activityFilter, setActivityFilter] = useState<'all' | 'ticks' | 'agents' | 'milestones'>('all')
  const [activitySearch, setActivitySearch] = useState('')
  const [missionSort, setMissionSort] = useState<'newest' | 'progress' | 'last_tick'>('newest')
  const [dashboardStats, setDashboardStats] = useState<{ active: number; completed: number; total_ticks: number; total_agents: number; total_findings: number } | null>(null)
  const [missionTab, setMissionTab] = useState<'missions' | 'board' | 'skills' | 'calendar' | 'recurring' | 'memory' | 'files' | 'health'>('missions')

  // Live clock — updates every 10s for countdown displays
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(interval)
  }, [])

  const fetchMissions = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const [res, statsRes] = await Promise.all([
        fetch(`/api/missions?${params}`),
        fetch('/api/missions/stats'),
      ])
      if (res.ok) {
        const data = await res.json()
        setMissions(data.missions ?? [])
        if (!selectedId && data.missions?.length > 0) {
          setSelectedId(data.missions[0].id)
        }
      }
      if (statsRes.ok) {
        const statsData = await statsRes.json()
        if (statsData.summary) setDashboardStats(statsData.summary)
      }
    } catch {}
    setLoading(false)
  }, [statusFilter, selectedId])

  const handleUpdateMission = async () => {
    if (!selectedMission) return
    setSaving(true)
    try {
      const res = await fetch(`/api/missions/${selectedMission.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: editGoal.trim() || selectedMission.goal,
          tick_timebox_minutes: editTimebox,
          max_ticks_per_day: editMaxTicks,
          autonomy_level: editAutonomy,
        }),
      })
      if (res.ok) {
        toast.success('Mission settings saved')
        setEditingSettings(false)
        fetchMissions()
      } else {
        toast.error('Failed to save settings')
      }
    } catch {
      toast.error('Failed to save settings')
    }
    setSaving(false)
  }

  const handleExportReport = () => {
    if (!selectedMission) return
    const findings = events.filter(ev =>
      ev.kind === 'agent_completed' &&
      ev.payload?.agent_summary &&
      typeof ev.payload.agent_summary === 'string' &&
      (ev.payload.agent_summary as string).length > 20
    )
    const tickEvents = events.filter(ev => ev.kind === 'tick_completed')
    const lines: string[] = [
      `# Mission Report: ${selectedMission.goal}`,
      ``,
      `**Status:** ${selectedMission.status}  `,
      `**Autonomy:** ${selectedMission.autonomy_level.replace(/_/g, ' ')}  `,
      `**Created:** ${new Date(selectedMission.created_at).toLocaleDateString()}  `,
      `**Ticks run:** ${tickEvents.length}  `,
      `**Agents spawned:** ${events.filter(e => e.kind === 'agent_delegated').length}  `,
      ``,
      `---`,
      ``,
      `## Agent Findings`,
      ``,
    ]
    if (findings.length === 0) {
      lines.push('*No findings yet.*')
    } else {
      for (const ev of findings) {
        const agentName = typeof ev.payload.agent_name === 'string' ? ev.payload.agent_name : 'Agent'
        const date = new Date(ev.created_at).toLocaleString()
        lines.push(`### ${agentName}`)
        lines.push(`*${date}*`)
        lines.push(``)
        lines.push(ev.payload.agent_summary as string)
        lines.push(``)
        lines.push(`---`)
        lines.push(``)
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mission-report-${selectedMission.id.slice(0, 8)}.md`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Report downloaded')
  }

  const handleExportCsv = () => {
    if (!selectedMission) return
    const findings = events.filter(ev =>
      ev.kind === 'agent_completed' &&
      ev.payload?.agent_summary &&
      typeof ev.payload.agent_summary === 'string' &&
      (ev.payload.agent_summary as string).length > 20
    )
    const rows = [
      ['Date', 'Agent', 'Summary'],
      ...findings.map(ev => [
        new Date(ev.created_at).toISOString(),
        typeof ev.payload.agent_name === 'string' ? ev.payload.agent_name : 'Agent',
        `"${(ev.payload.agent_summary as string).replace(/"/g, '""').slice(0, 1000)}"`,
      ])
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mission-findings-${selectedMission.id.slice(0, 8)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV downloaded')
  }

  const handleDuplicateMission = async () => {
    if (!selectedMission) return
    setDeleting(true)
    try {
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'duplicate', mission_id: selectedMission.id }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success('Mission duplicated')
        fetchMissions()
        if (data.mission?.id) setSelectedId(data.mission.id)
      } else {
        toast.error('Failed to duplicate mission')
      }
    } catch {
      toast.error('Failed to duplicate mission')
    }
    setDeleting(false)
  }

  const handleDeleteMission = async (id: string) => {
    if (!confirm('Delete this mission? This cannot be undone.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/missions/${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast.success('Mission deleted')
        setSelectedId(null)
        await fetchMissions()
      } else {
        toast.error('Failed to delete mission')
      }
    } catch {
      toast.error('Failed to delete mission')
    }
    setDeleting(false)
  }

  const handleCreateMission = async () => {
    if (!createGoal.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          goal: createGoal.trim(),
          autonomy_level: createAutonomy,
          tick_timebox_minutes: createTimebox,
          max_ticks_per_day: createMaxTicks,
          constraints: createContext.trim() ? { company_context: createContext.trim() } : {},
        }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success('Mission created!')
        setCreateGoal('')
        setCreateContext('')
        setShowCreateForm(false)
        await fetchMissions()
        if (data.mission?.id) setSelectedId(data.mission.id)
      } else {
        toast.error('Failed to create mission')
      }
    } catch {
      toast.error('Failed to create mission')
    }
    setCreating(false)
  }

  const fetchEvents = useCallback(async (missionId: string) => {
    try {
      const res = await fetch(`/api/missions?events=${missionId}`)
      if (res.ok) {
        const data = await res.json()
        setEvents(data.events ?? [])
      }
    } catch {}
  }, [])

  const fetchMissionDetail = useCallback(async (missionId: string) => {
    try {
      const res = await fetch(`/api/missions/${missionId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.events) setEvents(data.events)
        if (data.run_aggregates) setRunAggregates(data.run_aggregates)
      }
    } catch {}
  }, [])

  const fetchActiveAgents = useCallback(async (missionId: string) => {
    try {
      const res = await fetch(`/api/agents?mission_id=${missionId}&status=working,initializing`)
      if (res.ok) {
        const data = await res.json()
        setActiveAgents(data.agents ?? [])
      }
    } catch { setActiveAgents([]) }
  }, [])

  useEffect(() => {
    fetchMissions()
  }, [fetchMissions])

  useEffect(() => {
    if (selectedId) {
      fetchMissionDetail(selectedId)
      fetchActiveAgents(selectedId)
      setMobileTab('detail')
      const m = missions.find(x => x.id === selectedId)
      if (m) {
        setEditGoal(m.goal)
        setEditTimebox(m.tick_timebox_minutes)
        setEditMaxTicks(m.max_ticks_per_day ?? 6)
        setEditAutonomy(m.autonomy_level)
      }
    }
  }, [selectedId, fetchEvents, fetchActiveAgents, missions])

  // Realtime subscription: live mission_events updates for selected mission
  useEffect(() => {
    if (!selectedId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`mission-events-${selectedId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mission_events', filter: `mission_id=eq.${selectedId}` },
        (payload) => {
          const newEvent = payload.new as MissionEvent
          setEvents(prev => [newEvent, ...prev])
          // Refresh mission list + active agents on any new event
          fetchMissions()
          fetchActiveAgents(selectedId!)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [selectedId, fetchMissions])

  // Realtime subscription: live missions table updates (status, next_tick_at, goal_tree)
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('missions-list-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'missions' },
        () => { fetchMissions() }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchMissions])

  // Poll every 30 s so new missions and tick updates appear without a manual refresh
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMissions()
      if (selectedId) {
        fetchMissionDetail(selectedId)
        fetchActiveAgents(selectedId)
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [fetchMissions, fetchMissionDetail, fetchActiveAgents, selectedId])

  const handleAction = async (id: string, action: 'pause' | 'resume' | 'run_now') => {
    setActionLoading(id)
    try {
      if (action === 'run_now') {
        const res = await fetch('/api/missions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'run_now', mission_id: id }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          toast.error((err as { error?: string }).error ?? 'Failed to run tick')
        } else {
          toast.success('Tick started')
        }
        await fetchMissions()
        if (selectedId) fetchEvents(selectedId)
      } else {
        const res = await fetch('/api/missions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: action === 'pause' ? 'pause' : 'resume',
            mission_id: id,
          }),
        })
        if (res.ok) {
          toast.success(action === 'pause' ? 'Mission paused' : 'Mission resumed')
        } else {
          toast.error(`Failed to ${action} mission`)
        }
        await fetchMissions()
      }
    } catch {}
    setActionLoading(null)
  }

  const handleStartTemplate = async (template: MissionTemplate) => {
    setStartingTemplate(template.id)
    try {
      const constraints: Record<string, unknown> = {}
      if (template.id === 'self-improve-2hands') {
        constraints.self_improvement = true
        constraints.repo_config = {
          owner: 'albin-holmgren',
          repo: '2Hands',
          base_branch: 'dev',
        }
      }
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          goal: template.goal,
          autonomy_level: template.autonomy_level,
          tick_timebox_minutes: template.tick_timebox_minutes,
          constraints: Object.keys(constraints).length > 0 ? constraints : undefined,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(`Mission "${template.title}" started`)
        setShowTemplates(false)
        await fetchMissions()
        if (data.mission?.id) setSelectedId(data.mission.id)
      } else {
        toast.error('Failed to create mission')
      }
    } catch {
      toast.error('Failed to create mission')
    }
    setStartingTemplate(null)
  }

  const selectedMission = missions.find((m) => m.id === selectedId)
  const filteredMissions = missions.filter((m) => {
    const matchesStatus = statusFilter === 'all' ? true : m.status === statusFilter
    const matchesSearch = searchQuery.trim() === '' || m.goal.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesStatus && matchesSearch
  }).sort((a, b) => {
    if (missionSort === 'progress') {
      const pct = (m: typeof a) => {
        const gt = m.goal_tree
        if (!gt) return 0
        const total = gt.projects.reduce((s, p) => s + p.tasks.length, 0)
        const done = gt.projects.reduce((s, p) => s + p.tasks.filter(t => t.status === 'completed').length, 0)
        return total > 0 ? done / total : 0
      }
      return pct(b) - pct(a)
    }
    if (missionSort === 'last_tick') {
      return new Date(b.last_tick_at ?? 0).getTime() - new Date(a.last_tick_at ?? 0).getTime()
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const MISSION_CONTROL_TABS = [
    { id: 'missions', label: 'Missions', icon: Target },
    { id: 'board', label: 'Board', icon: LayoutDashboard },
    { id: 'skills', label: 'Skills', icon: Sparkles },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'recurring', label: 'Recurring', icon: Repeat },
    { id: 'memory', label: 'Memory', icon: Brain },
    { id: 'files', label: 'Files', icon: FolderOpen },
    { id: 'health', label: 'Health', icon: AlertCircle },
  ] as const

  return (
    <div className="flex h-full min-h-0 overflow-hidden flex-col">
      {/* Mission Control top tab bar */}
      <div className="flex items-center gap-0.5 px-4 pt-3 pb-0 border-b border-border shrink-0 overflow-x-auto scrollbar-none">
        {MISSION_CONTROL_TABS.map((tab) => {
          const Icon = tab.icon
          const active = missionTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setMissionTab(tab.id as typeof missionTab)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium rounded-t-lg transition-colors whitespace-nowrap border-b-2 -mb-px',
                active
                  ? 'text-foreground border-primary'
                  : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-foreground/[0.03]'
              )}
            >
              <Icon size={13} strokeWidth={1.75} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Board tab — Kanban */}
      {missionTab === 'board' && (
        <KanbanBoard />
      )}

      {/* Skills tab */}
      {missionTab === 'skills' && (
        <SkillsPanel />
      )}

      {/* Calendar tab — Scheduled agents */}
      {missionTab === 'calendar' && (
        <ScheduledAgentsPanel />
      )}

      {/* Recurring Tasks tab */}
      {missionTab === 'recurring' && (
        <RecurringTasksPanel />
      )}

      {/* Memory tab */}
      {missionTab === 'memory' && (
        <MemoryPanel />
      )}

      {/* Files tab */}
      {missionTab === 'files' && (
        <FilesPanel />
      )}

      {/* Health tab — runtime confidence */}
      {missionTab === 'health' && (
        <ConfidencePanel />
      )}

      {/* Missions tab — existing list + detail */}
      {missionTab === 'missions' && (
      <div className="flex h-full min-h-0 overflow-hidden flex-col flex-1">
      {/* Mobile tab bar */}
      <div className="flex sm:hidden border-b border-border shrink-0">
        <button
          onClick={() => setMobileTab('list')}
          className={cn('flex-1 py-2.5 text-[13px] font-medium transition-colors', mobileTab === 'list' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground')}
        >Missions</button>
        <button
          onClick={() => setMobileTab('detail')}
          disabled={!selectedMission}
          className={cn('flex-1 py-2.5 text-[13px] font-medium transition-colors disabled:opacity-40', mobileTab === 'detail' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground')}
        >Detail</button>
      </div>
      <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left panel — mission list */}
      <div className={cn("shrink-0 border-r border-border flex flex-col h-full", "w-full sm:w-[340px]", mobileTab === 'detail' ? 'hidden sm:flex' : 'flex')}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target size={18} className="text-primary" />
              <h1 className="text-[16px] font-bold text-foreground">Missions</h1>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowCreateForm(v => !v)}
                className={cn(
                  'flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg transition-colors',
                  showCreateForm
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                )}
              >
                <Plus size={11} />
                New
              </button>
              <button
                onClick={() => setShowTemplates(v => !v)}
                className={cn(
                  'text-[11px] font-medium px-2 py-1 rounded-lg transition-colors',
                  showTemplates
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                )}
              >
                Templates
              </button>
            </div>
          </div>
          {dashboardStats && (dashboardStats.total_ticks > 0 || dashboardStats.active > 0) && (
            <div className="flex items-center gap-4 mb-3 px-1">
              {dashboardStats.active > 0 && (
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] text-muted-foreground">{dashboardStats.active} active</span>
                </div>
              )}
              {dashboardStats.total_ticks > 0 && (
                <span className="text-[11px] text-muted-foreground">{dashboardStats.total_ticks} ticks run</span>
              )}
              {dashboardStats.total_agents > 0 && (
                <span className="text-[11px] text-muted-foreground">{dashboardStats.total_agents} agents</span>
              )}
              {dashboardStats.total_findings > 0 && (
                <span className="text-[11px] text-emerald-600">{dashboardStats.total_findings} findings</span>
              )}
            </div>
          )}
          <div className="flex items-center justify-between mb-2">
            <div className="flex gap-1 flex-wrap">
            {(['all', 'active', 'paused', 'completed'] as const).map((f) => {
              const count = f === 'all' ? missions.length : missions.filter(m => m.status === f).length
              return (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[11px] font-medium capitalize transition-colors flex items-center gap-1',
                    statusFilter === f
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-foreground/5'
                  )}
                >
                  {f}
                  {count > 0 && <span className={cn('text-[9px] font-bold', statusFilter === f ? 'opacity-80' : 'opacity-60')}>{count}</span>}
                </button>
              )
            })}
            </div>
            <select
              value={missionSort}
              onChange={e => setMissionSort(e.target.value as typeof missionSort)}
              className="text-[10px] rounded-lg border border-border bg-background text-muted-foreground px-1.5 py-0.5 focus:outline-none"
            >
              <option value="newest">Newest</option>
              <option value="last_tick">Last tick</option>
              <option value="progress">Progress</option>
            </select>
          </div>
          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search missions…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 rounded-xl border border-border bg-background text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </div>
        </div>

        {/* Inline create form */}
        {showCreateForm && (
          <div className="p-4 border-b border-border bg-gradient-to-b from-primary/5 to-transparent">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Target size={14} className="text-primary" />
                <p className="text-[13px] font-semibold text-foreground">New Mission</p>
              </div>
              <button onClick={() => setShowCreateForm(false)} className="text-muted-foreground hover:text-foreground">
                <X size={13} />
              </button>
            </div>
            <textarea
              className="w-full rounded-xl border border-border bg-background text-[13px] text-foreground p-2.5 resize-none placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              rows={2}
              placeholder="What ambitious goal should the AI pursue? e.g. Make my company worth $100M in 2 years"
              value={createGoal}
              onChange={e => setCreateGoal(e.target.value)}
              autoFocus
            />
            <textarea
              className="w-full rounded-xl border border-border bg-background text-[12px] text-foreground p-2.5 resize-none placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 mt-2"
              rows={2}
              placeholder="Company context (optional but recommended): industry, stage, current ARR, team size, main challenges…"
              value={createContext}
              onChange={e => setCreateContext(e.target.value)}
            />
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <select
                value={createAutonomy}
                onChange={e => setCreateAutonomy(e.target.value as typeof createAutonomy)}
                className="text-[11px] rounded-lg border border-border bg-background text-foreground px-2 py-1 focus:outline-none flex-1 min-w-0"
              >
                <option value="draft_only">Research only</option>
                <option value="execute_with_approval">Ask before acting</option>
                <option value="full_auto">Full autonomous</option>
              </select>
              <select
                value={createTimebox}
                onChange={e => setCreateTimebox(Number(e.target.value))}
                className="text-[11px] rounded-lg border border-border bg-background text-foreground px-2 py-1 focus:outline-none"
                title="How long each work session runs"
              >
                <option value={10}>10 min/tick</option>
                <option value={20}>20 min/tick</option>
                <option value={30}>30 min/tick</option>
                <option value={60}>60 min/tick</option>
              </select>
              <select
                value={createMaxTicks}
                onChange={e => setCreateMaxTicks(Number(e.target.value))}
                className="text-[11px] rounded-lg border border-border bg-background text-foreground px-2 py-1 focus:outline-none"
                title="Max work sessions per day"
              >
                <option value={2}>2/day</option>
                <option value={4}>4/day</option>
                <option value={6}>6/day</option>
                <option value={12}>12/day</option>
              </select>
            </div>
            <button
              onClick={handleCreateMission}
              disabled={!createGoal.trim() || creating}
              className="w-full mt-3 py-2 rounded-xl bg-primary text-primary-foreground text-[12px] font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
            >
              {creating ? <><Loader2 size={12} className="animate-spin" />Building plan…</> : <><Target size={12} />Launch Mission</>}
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {/* Template browser */}
          {showTemplates && (
            <div className="space-y-2 mb-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-1">Quick start templates</p>
              {MISSION_TEMPLATES.map((t) => (
                <div
                  key={t.id}
                  className="rounded-2xl border border-border bg-card p-3 hover:border-border/70 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-[20px] leading-none mt-0.5 shrink-0">{t.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-semibold text-foreground leading-snug">{t.title}</p>
                        <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0 capitalize', CATEGORY_COLORS[t.category])}>
                          {t.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{t.goal.slice(0, 100)}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] text-muted-foreground capitalize">{t.autonomy_level.replace(/_/g, ' ')} · {t.tick_timebox_minutes}min/tick</span>
                        <button
                          onClick={() => handleStartTemplate(t)}
                          disabled={startingTemplate === t.id}
                          className="text-[11px] font-semibold text-primary hover:underline disabled:opacity-50"
                        >
                          {startingTemplate === t.id ? 'Starting…' : 'Use template'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div className="border-t border-border pt-2" />
            </div>
          )}

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-2xl bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : filteredMissions.length === 0 && !showTemplates ? (
            missions.length > 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center px-4">
                <Search size={20} className="text-muted-foreground/30 mb-2" />
                <p className="text-[12px] text-muted-foreground">No missions match your filter</p>
                <button onClick={() => { setStatusFilter('all'); setSearchQuery('') }} className="mt-2 text-[11px] text-primary hover:underline">
                  Clear filters
                </button>
              </div>
            ) : (
            <div className="flex flex-col items-center justify-center h-40 text-center px-4">
              <Target size={28} className="text-muted-foreground/40 mb-2" />
              <p className="text-[13px] font-medium text-muted-foreground">No missions yet</p>
              <p className="text-[12px] text-muted-foreground/60 mt-1">
                Tell the AI Manager a long-term goal to get started
              </p>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => setShowTemplates(true)}
                  className="px-3 py-1.5 border border-border rounded-lg text-[12px] font-medium hover:bg-foreground/5 transition-colors"
                >
                  Browse templates
                </button>
                <button
                  onClick={() => router.push('/app')}
                  className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-[12px] font-medium hover:opacity-90 transition-opacity"
                >
                  Open AI Manager
                </button>
              </div>
            </div>
            )
          ) : (
            filteredMissions.map((m) => (
              <MissionCard
                key={m.id}
                mission={m}
                onAction={handleAction}
                onSelect={setSelectedId}
                selected={selectedId === m.id}
              />
            ))
          )}
        </div>
      </div>

      {/* Right panel — mission detail */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {selectedMission ? (
          <>
            {/* Header */}
            <div className="p-5 border-b border-border pb-0 shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={cn(
                        'text-[11px] font-medium px-2 py-0.5 rounded-md',
                        STATUS_CONFIG[selectedMission.status].bg,
                        STATUS_CONFIG[selectedMission.status].color
                      )}
                    >
                      {STATUS_CONFIG[selectedMission.status].label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {AUTONOMY_LABELS[selectedMission.autonomy_level]}
                    </span>
                  </div>
                  <h2 className="text-[18px] font-bold text-foreground leading-snug">
                    {selectedMission.goal}
                  </h2>
                  <p className="text-[12px] text-muted-foreground mt-1">
                    Created {timeAgo(selectedMission.created_at)} · {selectedMission.tick_timebox_minutes} min per tick
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {selectedMission.status === 'active' && (
                    <>
                      <button
                        disabled={actionLoading === selectedMission.id}
                        onClick={() => handleAction(selectedMission.id, 'run_now')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw size={12} className={actionLoading === selectedMission.id ? 'animate-spin' : ''} />
                        Run now
                      </button>
                      <button
                        onClick={() => handleAction(selectedMission.id, 'pause')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-amber-600 hover:bg-amber-500/10 transition-colors"
                      >
                        <Pause size={12} />
                        Pause
                      </button>
                    </>
                  )}
                  {selectedMission.status === 'paused' && (
                    <button
                      onClick={() => handleAction(selectedMission.id, 'resume')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:opacity-90 transition-opacity"
                    >
                      <Play size={12} />
                      Resume
                    </button>
                  )}
                  {selectedMission.conversation_id && (
                    <button
                      onClick={() => router.push(`/app/chat/${selectedMission.conversation_id}`)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      title="Open mission conversation"
                    >
                      <ExternalLink size={14} />
                    </button>
                  )}
                  <button
                    onClick={handleDuplicateMission}
                    disabled={deleting}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50"
                    title="Duplicate mission"
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    onClick={() => handleDeleteMission(selectedMission.id)}
                    disabled={deleting}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    title="Delete mission"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Overall mission progress bar */}
              {selectedMission.goal_tree && (() => {
                const gt = selectedMission.goal_tree
                const total = gt.projects.reduce((s, p) => s + p.tasks.length, 0)
                const done = gt.projects.reduce((s, p) => s + p.tasks.filter(t => t.status === 'completed').length, 0)
                if (total === 0) return null
                const pct = Math.round((done / total) * 100)
                return (
                  <div className="mt-3">
                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all duration-500', pct === 100 ? 'bg-emerald-500' : 'bg-primary')}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })()}

              {/* Detail tab bar */}
              <div className="flex gap-0 mt-4 border-b border-border -mx-5 px-5">
                {(['overview', 'workflow', 'activity', 'findings', 'agents', 'settings'] as const).map((tab) => {
                  const labels = { overview: 'Overview', workflow: 'Workflow', activity: 'Activity', findings: 'Findings', agents: 'Agents', settings: 'Settings' }
                  const spawnedAgentCount = events.filter(e => e.kind === 'agent_delegated').length
                  const activeRunCount = runAggregates ? runAggregates.queued + runAggregates.claimed + runAggregates.running : 0
                  const counts: Record<string, number> = {
                    activity: events.length,
                    findings: events.filter(e => e.kind === 'agent_completed').length,
                    agents: spawnedAgentCount,
                    overview: 0,
                    settings: 0,
                    workflow: activeRunCount,
                  }
                  const activeAgentCount = activeAgents.filter(a => a.status === 'running' || a.status === 'initializing').length
                  return (
                    <button
                      key={tab}
                      onClick={() => setDetailTab(tab)}
                      className={cn(
                        'text-[12px] font-medium px-3 py-2 border-b-2 transition-colors -mb-px whitespace-nowrap',
                        detailTab === tab ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {labels[tab]}
                      {tab === 'activity' && activeAgentCount > 0 && (
                        <span className="ml-1.5 text-[9px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full animate-pulse">{activeAgentCount} running</span>
                      )}
                      {tab === 'workflow' && activeRunCount > 0 && (
                        <span className="ml-1.5 text-[9px] font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded-full animate-pulse">{activeRunCount} live</span>
                      )}
                      {counts[tab] > 0 && tab !== 'workflow' && !(tab === 'activity' && activeAgentCount > 0) && (
                        <span className="ml-1.5 text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{counts[tab]}</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Paused resume CTA */}
              {selectedMission.status === 'paused' && (
                <div className="mx-0 mt-4 p-4 rounded-2xl bg-amber-500/8 border border-amber-500/20 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">⏸</span>
                    <div>
                      <p className="text-[13px] font-bold text-foreground">Mission paused</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Resume to continue autonomous ticks.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAction(selectedMission.id, 'resume')}
                    className="shrink-0 px-3 py-1.5 rounded-xl bg-amber-500 text-white text-[12px] font-semibold hover:bg-amber-600 transition-colors"
                  >
                    Resume
                  </button>
                </div>
              )}

              {/* Completion celebration banner */}
              {selectedMission.status === 'completed' && (
                <div className="mx-0 mt-4 p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-primary/10 border border-emerald-500/25 flex items-center gap-3">
                  <span className="text-2xl">🎉</span>
                  <div>
                    <p className="text-[13px] font-bold text-foreground">Mission accomplished!</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">All goal tree projects are complete. Great work.</p>
                  </div>
                </div>
              )}

              {/* Mission blocked banner — Overview only */}
              {detailTab === 'overview' && (() => {
                const lastBlockedEvent = events.filter(e => e.kind === 'mission_blocked').slice(-1)[0]
                if (!lastBlockedEvent) return null
                const credBal = (lastBlockedEvent.payload as Record<string, unknown>)?.credits_balance
                return (
                  <div className="mx-5 mt-4 p-3 rounded-xl bg-amber-500/8 border border-amber-500/25 flex items-start gap-2.5">
                    <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-amber-600 dark:text-amber-400">Mission blocked — no credits</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {typeof credBal === 'number' ? `Balance: ${credBal} credits.` : ''} Add credits in{' '}
                        <span className="font-medium text-foreground">Settings → Billing</span> to resume automated ticks.
                      </p>
                    </div>
                  </div>
                )
              })()}

              {/* Stats row — Overview only */}
              {detailTab === 'overview' && (() => {
                const tickCount = events.filter(e => e.kind === 'tick_completed').length
                const agentCount = events.filter(e => e.kind === 'agent_delegated').length
                const findingsCount = events.filter(e => e.kind === 'agent_completed').length
                const daysRunning = Math.max(1, Math.floor((Date.now() - new Date(selectedMission.created_at).getTime()) / 86_400_000))
                const tree = selectedMission.goal_tree
                const totalTasks = tree ? tree.projects.reduce((sum, p) => sum + p.tasks.length, 0) : 0
                const doneTasks = tree ? tree.projects.reduce((sum, p) => sum + p.tasks.filter(t => t.status === 'completed').length, 0) : 0
                const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
                const completedProjects = tree ? tree.projects.filter(p => p.status === 'completed').length : 0
                const totalProjects = tree ? tree.projects.length : 0
                return (
                  <div className="flex items-center gap-5 mt-4 flex-wrap">
                    {totalProjects > 0 && (
                      <div className="text-center">
                        <p className="text-[11px] text-muted-foreground">Progress</p>
                        <p className="text-[13px] font-semibold text-foreground">{progressPct}% <span className="text-[10px] text-muted-foreground font-normal">({completedProjects}/{totalProjects} projects)</span></p>
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-[11px] text-muted-foreground">Last tick</p>
                      <p className="text-[13px] font-semibold text-foreground">{timeAgo(selectedMission.last_tick_at)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[11px] text-muted-foreground">Next tick</p>
                      <p className={cn('text-[13px] font-semibold', selectedMission.next_tick_at && new Date(selectedMission.next_tick_at).getTime() - now < 120_000 ? 'text-primary animate-pulse' : 'text-foreground')}>
                        {(() => {
                          void now // reactive
                          return timeUntil(selectedMission.next_tick_at)
                        })()}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[11px] text-muted-foreground">Ticks run</p>
                      <p className="text-[13px] font-semibold text-foreground">{tickCount}</p>
                    </div>
                    {selectedMission.max_ticks_per_day > 0 && (() => {
                      const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0)
                      const today = events.filter(e => e.kind === 'tick_completed' && new Date(e.created_at) >= startOfDay).length
                      return (
                        <div className="text-center">
                          <p className="text-[11px] text-muted-foreground">Today</p>
                          <p className={cn('text-[13px] font-semibold', today >= selectedMission.max_ticks_per_day ? 'text-amber-500' : 'text-foreground')}>
                            {today}/{selectedMission.max_ticks_per_day}
                          </p>
                        </div>
                      )
                    })()}
                    <div className="text-center">
                      <p className="text-[11px] text-muted-foreground">Agents spawned</p>
                      <p className="text-[13px] font-semibold text-foreground">{agentCount}</p>
                    </div>
                    {findingsCount > 0 && (
                      <div className="text-center">
                        <p className="text-[11px] text-muted-foreground">Findings</p>
                        <p className="text-[13px] font-semibold text-emerald-600">{findingsCount}</p>
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-[11px] text-muted-foreground">Day{daysRunning !== 1 ? 's' : ''} running</p>
                      <p className="text-[13px] font-semibold text-foreground">{daysRunning}</p>
                    </div>
                    {tickCount > 0 && daysRunning > 0 && (
                      <div className="text-center">
                        <p className="text-[11px] text-muted-foreground">Ticks/day</p>
                        <p className="text-[13px] font-semibold text-foreground">{(tickCount / daysRunning).toFixed(1)}</p>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

            {detailTab === 'overview' && (
              <div className="flex-1 overflow-y-auto pb-6">

            {/* Current Focus card — what the AI is working on right now */}
            {detailTab === 'overview' && selectedMission.status === 'active' && (() => {
              const handoff = selectedMission.handoff_note
              const nextTaskMatch = handoff?.match(/\*\*Next task:\*\*\s*(.+)/i)
              const progressMatch = handoff?.match(/\*\*(?:Progress|Intelligence gathered):\*\*\s*(.+)/i)
              const latestFinding = events.find(e => e.kind === 'agent_completed')
              const latestFindingSummary = latestFinding
                ? String((latestFinding.payload as Record<string, unknown>)?.agent_summary || latestFinding.summary || '').slice(0, 200)
                : null
              if (!nextTaskMatch && !latestFindingSummary) return null
              return (
                <div className="mx-5 mt-4 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-3.5 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Zap size={13} className="text-primary shrink-0" />
                    <span className="text-[11px] font-semibold text-primary uppercase tracking-wide">AI currently working on</span>
                  </div>
                  {nextTaskMatch && (
                    <p className="text-[13px] font-medium text-foreground leading-snug">{nextTaskMatch[1].trim()}</p>
                  )}
                  {progressMatch && !nextTaskMatch && (
                    <p className="text-[13px] text-foreground leading-snug">{progressMatch[1].trim()}</p>
                  )}
                  {latestFindingSummary && (
                    <div className="border-t border-border/40 pt-2.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Latest finding</span>
                        {latestFinding && <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(latestFinding.created_at)}</span>}
                      </div>
                      <p className="text-[12px] text-muted-foreground line-clamp-3 leading-relaxed">{latestFindingSummary}</p>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Active agents for this mission — overview only */}
            {detailTab === 'overview' && activeAgents.length > 0 && (
              <div className="mx-5 mt-4">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Active agents</p>
                <div className="space-y-1.5">
                  {activeAgents.map((agent) => (
                    <div
                      key={agent.id}
                      className="flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 cursor-pointer hover:border-primary/40 transition-colors"
                      onClick={() => router.push(`/app?agent=${agent.id}`)}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="text-[12px] font-medium text-foreground line-clamp-1">{agent.name}</span>
                        {agent.config?.active_run_task ? (
                          <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                            {`${agent.config.active_run_task}`.slice(0, 80)}
                          </p>
                        ) : null}
                      </div>
                      <span className="text-[10px] text-primary shrink-0 capitalize">{agent.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Goal tree / project breakdown — overview only */}
            {detailTab === 'overview' && selectedMission.goal_tree && selectedMission.goal_tree.projects.length > 0 && (
              <div className="mx-5 mt-4">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Project roadmap</p>
                <div className="space-y-1.5">
                  {selectedMission.goal_tree.projects.map((proj) => {
                    const isCurrent = proj.id === selectedMission.goal_tree?.current_project_id
                    const completedTasks = proj.tasks.filter(t => t.status === 'completed').length
                    return (
                      <div key={proj.id} className={cn(
                        'rounded-xl p-2.5 border',
                        proj.status === 'completed' ? 'border-emerald-500/20 bg-emerald-500/5' :
                        isCurrent ? 'border-primary/30 bg-primary/5' :
                        'border-border/50 bg-card/40'
                      )}>
                        <div className="flex items-center gap-2">
                          {proj.status === 'completed'
                            ? <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                            : isCurrent
                            ? <Zap size={12} className="text-primary shrink-0" />
                            : <div className="w-3 h-3 rounded-full border border-border/60 shrink-0" />}
                          <span className={cn('text-[12px] font-medium flex-1', proj.status === 'completed' ? 'text-muted-foreground line-through' : 'text-foreground')}>
                            {proj.name}
                          </span>
                          {proj.tasks.length > 0 && (
                            <span className="text-[10px] text-muted-foreground shrink-0">{completedTasks}/{proj.tasks.length}</span>
                          )}
                        </div>
                        {proj.tasks.length > 0 && (
                          <div className="mt-1.5 ml-5">
                            <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all',
                                  proj.status === 'completed' ? 'bg-emerald-500' : 'bg-primary'
                                )}
                                style={{ width: `${Math.round((proj.tasks.filter(t => t.status === 'completed').length / proj.tasks.length) * 100)}%` }}
                              />
                            </div>
                          </div>
                        )}
                        {/* Expandable task list for all projects */}
                        {proj.tasks.length > 0 && (expandedProjects.has(proj.id) || isCurrent) && (
                          <div className="mt-2 ml-5 space-y-1">
                            {proj.tasks.map(t => (
                              <div key={t.id} className="flex items-center gap-1.5 group/task">
                                {t.status === 'completed'
                                  ? <CheckCircle2 size={10} className="text-emerald-500 shrink-0" />
                                  : t.status === 'in_progress'
                                  ? <div className="w-2.5 h-2.5 rounded-full border-2 border-primary bg-primary/20 shrink-0 animate-pulse" />
                                  : <div className="w-2.5 h-2.5 rounded-full border border-border/60 shrink-0" />}
                                <span className={cn('text-[11px] line-clamp-1 flex-1',
                                  t.status === 'completed' ? 'text-muted-foreground/60 line-through' :
                                  t.status === 'in_progress' ? 'text-foreground/90 font-medium' :
                                  'text-muted-foreground'
                                )}>{t.description}</span>
                                {t.status === 'in_progress' && (
                                  <button
                                    onClick={async () => {
                                      await fetch('/api/missions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mission_id: selectedMission.id, task_id: t.id, status: 'completed' }) })
                                      await fetchMissions()
                                    }}
                                    className="opacity-0 group-hover/task:opacity-100 transition-opacity text-[9px] text-emerald-600 hover:underline shrink-0 ml-1"
                                  >
                                    ✓ done
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Expand/collapse toggle for non-current projects with tasks */}
                        {!isCurrent && proj.tasks.length > 0 && (
                          <button
                            onClick={() => setExpandedProjects(prev => {
                              const n = new Set(prev)
                              n.has(proj.id) ? n.delete(proj.id) : n.add(proj.id)
                              return n
                            })}
                            className="ml-5 mt-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {expandedProjects.has(proj.id) ? '▲ hide tasks' : `▼ ${proj.tasks.length} tasks`}
                          </button>
                        )}
                        {proj.tasks.length === 0 && proj.description && (
                          <p className="text-[11px] text-muted-foreground mt-1 ml-5 leading-relaxed line-clamp-2">{proj.description}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Handoff note — overview only */}
            {detailTab === 'overview' && selectedMission.handoff_note && (() => {
              const note = selectedMission.handoff_note!
              const intel = note.match(/\*\*Intelligence gathered:\*\*\s*(.+)/i)?.[1]?.trim()
              const blocker = note.match(/\*\*Blocker:\*\*\s*(.+)/i)?.[1]?.trim()
              const nextTask = note.match(/\*\*Next task:\*\*\s*(.+)/i)?.[1]?.trim()
              // Extract bullet-based notes from the summary body (lines starting with - or *)
              const bullets = note
                .split('\n')
                .filter(l => /^[-•*]\s/.test(l.trim()) && l.trim().length > 10)
                .slice(0, 5)
                .map(l => l.replace(/^[-•*]\s*/, '').trim())
              return (
                <div className="mx-5 mt-4 rounded-xl bg-blue-500/5 border border-blue-500/15 overflow-hidden">
                  <div className="px-3 pt-2.5 pb-2 border-b border-blue-500/10 flex items-center gap-1.5">
                    <Brain size={11} className="text-blue-500 shrink-0" />
                    <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">AI memory — what I know so far</p>
                  </div>
                  <div className="px-3 py-2.5 space-y-1.5">
                    {intel && <p className="text-[12px] text-foreground/80 leading-relaxed">{intel.slice(0, 200)}</p>}
                    {bullets.length > 0 && bullets.map((b, i) => (
                      <div key={i} className="flex gap-1.5">
                        <span className="text-blue-400 text-[11px] mt-0.5 shrink-0">•</span>
                        <p className="text-[11px] text-foreground/70 leading-relaxed">{b.slice(0, 150)}</p>
                      </div>
                    ))}
                    {blocker && (
                      <div className="flex gap-1.5 mt-1">
                        <span className="text-amber-400 text-[11px] mt-0.5 shrink-0">⚠</span>
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">{blocker.slice(0, 150)}</p>
                      </div>
                    )}
                    {nextTask && (
                      <p className="text-[11px] text-primary/80 pt-1 border-t border-blue-500/10">→ {nextTask.slice(0, 150)}</p>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Recent findings from completed agents — overview only */}
            {detailTab === 'overview' && (() => {
              const findings = events.filter(ev =>
                ev.kind === 'agent_completed' &&
                ev.payload?.agent_summary &&
                typeof ev.payload.agent_summary === 'string' &&
                (ev.payload.agent_summary as string).length > 20
              ).slice(0, 3)
              if (findings.length === 0) return null
              return (
                <div className="mx-5 mt-4 mb-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Recent findings</p>
                  <div className="space-y-2">
                    {findings.map((ev) => (
                      <div key={ev.id} className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
                        <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mb-1 truncate">
                          {typeof ev.payload.agent_name === 'string' ? ev.payload.agent_name : 'Agent'}
                        </p>
                        <p className="text-[12px] text-foreground/75 leading-relaxed line-clamp-3">
                          {(ev.payload.agent_summary as string).slice(0, 280)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

              </div>
            )}

            {/* Workflow assembly-line panel */}
            {detailTab === 'workflow' && (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">

                {/* Stage counts row */}
                {runAggregates && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Run pipeline</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Queued',    value: runAggregates.queued,    color: 'text-amber-500',   bg: 'bg-amber-500/10',   dot: 'bg-amber-400' },
                        { label: 'Running',   value: runAggregates.running + runAggregates.claimed, color: 'text-primary',     bg: 'bg-primary/10',     dot: 'bg-primary animate-pulse' },
                        { label: 'Completed', value: runAggregates.completed, color: 'text-emerald-600', bg: 'bg-emerald-500/10', dot: 'bg-emerald-500' },
                        { label: 'Failed',    value: runAggregates.failed + runAggregates.timeout, color: 'text-red-500',     bg: 'bg-red-500/10',     dot: 'bg-red-500' },
                        { label: 'Awaiting approval', value: runAggregates.needs_approval_count, color: 'text-violet-600', bg: 'bg-violet-500/10', dot: 'bg-violet-500' },
                        { label: 'Agents total', value: events.filter(e => e.kind === 'agent_delegated').length, color: 'text-foreground', bg: 'bg-muted/50', dot: 'bg-muted-foreground' },
                      ].map(({ label, value, color, bg, dot }) => (
                        <div key={label} className={cn('rounded-xl p-2.5 border border-border', bg)}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', dot)} />
                            <span className="text-[10px] text-muted-foreground">{label}</span>
                          </div>
                          <p className={cn('text-[18px] font-bold leading-none', color)}>{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Active tasks */}
                {runAggregates && runAggregates.active_tasks.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Active tasks</p>
                    <div className="space-y-2">
                      {runAggregates.active_tasks.map((task, i) => (
                        <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-primary/5 border border-primary/15">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0 mt-1.5" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[12px] font-semibold text-foreground">{task.agent_name}</span>
                              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md font-medium capitalize',
                                task.status === 'running' ? 'bg-primary/10 text-primary' :
                                task.status === 'queued' ? 'bg-amber-500/10 text-amber-600' :
                                'bg-muted text-muted-foreground'
                              )}>{task.status}</span>
                              {task.retry_run_id && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-orange-500/10 text-orange-600 font-medium">retry</span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{task.task}</p>
                            {task.retry_available_at && (
                              <p className="text-[10px] text-orange-500 mt-1">Retry available: {timeUntil(task.retry_available_at)}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Policy-blocked events */}
                {(() => {
                  const blocked = events.filter(e => e.kind === 'policy_blocked').slice(0, 3)
                  if (blocked.length === 0) return null
                  return (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Policy blocks</p>
                      <div className="space-y-2">
                        {blocked.map((ev) => (
                          <div key={ev.id} className="flex items-start gap-2 p-2.5 rounded-xl bg-violet-500/5 border border-violet-500/15">
                            <AlertCircle size={12} className="text-violet-500 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold text-foreground">{String((ev.payload as Record<string,unknown>).agent_name ?? '')}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">{ev.summary}</p>
                              <p className="text-[10px] text-muted-foreground/70 mt-0.5">{timeAgo(ev.created_at)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {/* Recent failures with retry info */}
                {runAggregates && runAggregates.recent_failures.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Recent failures</p>
                    <div className="space-y-2">
                      {runAggregates.recent_failures.map((f, i) => (
                        <div key={i} className="p-2.5 rounded-xl bg-red-500/5 border border-red-500/15">
                          <div className="flex items-center gap-2 mb-1">
                            <XCircle size={11} className="text-red-500 shrink-0" />
                            <span className="text-[12px] font-semibold text-foreground">{f.agent_name}</span>
                            {f.retry_scheduled ? (
                              <span className="ml-auto text-[10px] text-orange-500 font-medium">
                                Retry {f.retry_available_at ? timeUntil(f.retry_available_at) : 'soon'}
                              </span>
                            ) : (
                              <span className="ml-auto text-[10px] text-muted-foreground">{timeAgo(f.created_at)}</span>
                            )}
                          </div>
                          <p className="text-[11px] text-red-600 dark:text-red-400 leading-relaxed line-clamp-2">{f.error}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty state */}
                {(!runAggregates || (
                  runAggregates.queued === 0 && runAggregates.running === 0 && runAggregates.claimed === 0 &&
                  runAggregates.completed === 0 && runAggregates.failed === 0
                )) && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Bot size={28} className="text-muted-foreground/40 mb-3" />
                    <p className="text-[13px] font-medium text-muted-foreground">No agent runs yet</p>
                    <p className="text-[11px] text-muted-foreground/70 mt-1">Run a tick to spawn agents and see the pipeline here.</p>
                  </div>
                )}

              </div>
            )}

            {/* Activity log — activity tab */}
            {detailTab === 'activity' && (
              <div className="flex-1 overflow-y-auto p-5">
                {/* Tick in progress indicator */}
                {selectedMission.status === 'active' && activeAgents.some(a => a.status === 'running' || a.status === 'initializing') && (
                  <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-primary/8 border border-primary/15">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
                    <p className="text-[12px] text-primary font-medium">
                      Tick running — {activeAgents.filter(a => a.status === 'running' || a.status === 'initializing').length} agent{activeAgents.filter(a => a.status === 'running' || a.status === 'initializing').length > 1 ? 's' : ''} working
                    </p>
                  </div>
                )}
                {events.length > 5 && (
                  <div className="mb-3">
                    <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                      {(['all', 'ticks', 'agents', 'milestones'] as const).map(f => (
                        <button
                          key={f}
                          onClick={() => setActivityFilter(f)}
                          className={cn(
                            'text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors',
                            activityFilter === f
                              ? 'bg-primary/10 border-primary/30 text-primary'
                              : 'bg-transparent border-border text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {f === 'all' ? 'All' : f === 'ticks' ? 'Ticks' : f === 'agents' ? 'Agents' : 'Milestones'}
                        </button>
                      ))}
                    </div>
                    {events.length > 10 && (
                      <div className="relative">
                        <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Search activity…"
                          value={activitySearch}
                          onChange={e => setActivitySearch(e.target.value)}
                          className="w-full pl-7 pr-3 py-1.5 rounded-xl border border-border bg-background text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </div>
                    )}
                  </div>
                )}
                {(() => {
                  const baseEvents = activityFilter === 'all' ? events
                    : activityFilter === 'ticks' ? events.filter(e => e.kind.startsWith('tick') || e.kind === 'mission_completed')
                    : activityFilter === 'agents' ? events.filter(e => e.kind.startsWith('agent'))
                    : events.filter(e => e.kind === 'milestone_reached' || e.kind === 'project_started' || e.kind === 'task_started' || e.kind === 'mission_completed' || e.kind === 'mission_blocked')
                  const filteredEvents = activitySearch.trim()
                    ? baseEvents.filter(e =>
                        e.summary?.toLowerCase().includes(activitySearch.toLowerCase()) ||
                        e.kind.replace(/_/g, ' ').includes(activitySearch.toLowerCase()) ||
                        (typeof e.payload?.agent_name === 'string' && (e.payload.agent_name as string).toLowerCase().includes(activitySearch.toLowerCase()))
                      )
                    : baseEvents
                  if (filteredEvents.length === 0) return (
                    <div className="flex items-center gap-2 text-[13px] text-muted-foreground py-6">
                      <AlertCircle size={14} />
                      No activity yet — the mission will log progress after the first tick.
                    </div>
                  )
                  return (
                  <div className="space-y-1.5">
                    {filteredEvents.map((ev) => (
                      <div key={ev.id} className={cn(
                        'flex items-start gap-2.5 py-2 border-b border-border/40 last:border-0',
                        ev.kind === 'milestone_reached' ? 'rounded-xl px-3 py-2.5 bg-amber-500/8 border border-amber-500/20 !border-b' :
                        ev.kind === 'agent_failed' || ev.kind === 'tick_failed' ? 'rounded-xl px-3 py-2.5 bg-red-500/6 border border-red-500/15 !border-b' :
                        ev.kind === 'mission_blocked' ? 'rounded-xl px-3 py-2.5 bg-amber-500/8 border border-amber-500/20 !border-b' :
                        ev.kind === 'project_started' ? 'rounded-xl px-3 py-2.5 bg-blue-500/6 border border-blue-500/15 !border-b' :
                        ev.kind === 'mission_completed' ? 'rounded-xl px-3 py-2.5 bg-emerald-500/8 border border-emerald-500/25 !border-b' :
                        ev.kind === 'task_started' ? 'rounded-xl px-3 py-2.5 bg-teal-500/6 border border-teal-500/15 !border-b' : ''
                      )}>
                        <EventKindIcon kind={ev.kind} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-foreground/80 leading-snug">
                            {ev.summary || ev.kind.replace(/_/g, ' ')}
                          </p>
                          {ev.kind === 'agent_completed' && typeof ev.payload?.agent_summary === 'string' && (ev.payload.agent_summary as string).length > 20 && (
                            <>
                              <button
                                onClick={() => setExpandedEvents(prev => {
                                  const next = new Set(prev)
                                  next.has(ev.id) ? next.delete(ev.id) : next.add(ev.id)
                                  return next
                                })}
                                className="text-[11px] text-primary hover:underline mt-0.5"
                              >
                                {expandedEvents.has(ev.id) ? 'Hide findings' : 'Show findings'}
                              </button>
                              {expandedEvents.has(ev.id) && (
                                <p className="text-[11px] text-foreground/70 mt-1.5 leading-relaxed whitespace-pre-wrap bg-muted/40 rounded-lg p-2.5">
                                  {(ev.payload.agent_summary as string).slice(0, 600)}
                                </p>
                              )}
                            </>
                          )}
                          {ev.kind === 'tick_completed' && typeof ev.payload?.progress_pct === 'number' && (
                            <span className="inline-block mt-0.5 text-[10px] font-medium text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded-md">
                              {ev.payload.progress_pct}% overall
                            </span>
                          )}
                          {ev.kind === 'agent_delegated' && typeof ev.payload?.task === 'string' && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {(ev.payload.task as string).slice(0, 120)}
                            </p>
                          )}
                          {ev.kind === 'agent_failed' && typeof ev.payload?.task === 'string' && (
                            <p className="text-[11px] text-red-400/80 mt-0.5 line-clamp-2">
                              Task: {(ev.payload.task as string).slice(0, 120)}
                            </p>
                          )}
                          {ev.kind === 'task_started' && typeof ev.payload?.agent_name === 'string' && (
                            <p className="text-[11px] text-teal-600/80 dark:text-teal-400/70 mt-0.5">
                              Agent: {(ev.payload.agent_name as string)}
                            </p>
                          )}
                          {ev.kind === 'mission_blocked' && typeof ev.payload?.credits_balance === 'number' && (
                            <p className="text-[11px] text-amber-500/80 mt-0.5">
                              Credits: {ev.payload.credits_balance} — go to Settings → Billing to top up.
                            </p>
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground shrink-0 mt-0.5">
                          {timeAgo(ev.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                  )
                })()}
              </div>
            )}

            {/* Findings tab — all agent_completed summaries */}
            {detailTab === 'findings' && (
              <div className="flex-1 overflow-y-auto p-5">
                {(() => {
                  const findings = events.filter(ev =>
                    ev.kind === 'agent_completed' &&
                    ev.payload?.agent_summary &&
                    typeof ev.payload.agent_summary === 'string' &&
                    (ev.payload.agent_summary as string).length > 20
                  )
                  if (findings.length === 0) return (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Zap size={28} className="text-muted-foreground/30 mb-2" />
                      <p className="text-[13px] font-medium text-muted-foreground">No findings yet</p>
                      <p className="text-[11px] text-muted-foreground/60 mt-1">Agent research results will appear here after missions spawn agents.</p>
                    </div>
                  )
                  const filtered = findingSearch.trim()
                    ? findings.filter(ev =>
                        (ev.payload.agent_summary as string).toLowerCase().includes(findingSearch.toLowerCase()) ||
                        (typeof ev.payload.agent_name === 'string' && ev.payload.agent_name.toLowerCase().includes(findingSearch.toLowerCase()))
                      )
                    : findings
                  return (
                    <>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{filtered.length} finding{filtered.length !== 1 ? 's' : ''}</p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleExportCsv}
                          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Download size={11} />
                          CSV
                        </button>
                        <button
                          onClick={handleExportReport}
                          className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Download size={11} />
                          Markdown
                        </button>
                      </div>
                    </div>
                    {findings.length > 3 && (
                      <div className="relative mb-3">
                        <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Search findings…"
                          value={findingSearch}
                          onChange={e => setFindingSearch(e.target.value)}
                          className="w-full pl-7 pr-3 py-1.5 rounded-xl border border-border bg-background text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                      </div>
                    )}
                    <div className="space-y-3">
                      {filtered.map((ev) => {
                        const fullSummary = ev.payload.agent_summary as string
                        const isExpanded = expandedEvents.has(ev.id)
                        const taskCtx = typeof ev.payload.task === 'string' ? (ev.payload.task as string).slice(0, 120) : null
                        // Parse structured sections from the agent summary markdown
                        const summaryMatch = fullSummary.match(/##\s*Summary\s*\n([\s\S]*?)(?=\n##|$)/i)
                        const keyFindingsMatch = fullSummary.match(/##\s*Key Findings\s*\n([\s\S]*?)(?=\n##|$)/i)
                        const nextActionsMatch = fullSummary.match(/##\s*Recommended Next Actions\s*\n([\s\S]*?)(?=\n##|$)/i)
                        const summaryText = summaryMatch?.[1]?.trim()
                        const keyFindings = keyFindingsMatch?.[1]?.trim()
                          ?.split('\n')
                          .filter(l => /^\d+\./.test(l.trim()))
                          .slice(0, 4)
                          .map(l => l.replace(/^\d+\.\s*/, '').replace(/\*\*([^*]+)\*\*:/, '$1:').trim())
                        const nextActions = nextActionsMatch?.[1]?.trim()
                          ?.split('\n')
                          .filter(l => /^\d+\./.test(l.trim()))
                          .slice(0, 2)
                          .map(l => l.replace(/^\d+\.\s*/, '').trim())
                        const hasStructured = !!(summaryText || (keyFindings && keyFindings.length > 0))
                        return (
                          <div key={ev.id} className="rounded-2xl border border-emerald-500/20 bg-emerald-500/4 overflow-hidden">
                            {/* Header */}
                            <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-emerald-500/10">
                              <div className="flex items-center gap-2 min-w-0">
                                <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                                <span className="text-[12px] font-bold text-foreground truncate">
                                  {typeof ev.payload.agent_name === 'string' ? ev.payload.agent_name : 'Agent'}
                                </span>
                              </div>
                              <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{timeAgo(ev.created_at)}</span>
                            </div>
                            <div className="px-4 py-3 space-y-2.5">
                              {taskCtx && (
                                <p className="text-[10px] text-muted-foreground line-clamp-1 italic">{taskCtx}</p>
                              )}
                              {hasStructured ? (
                                <>
                                  {summaryText && (
                                    <p className="text-[12px] text-foreground leading-relaxed">{summaryText.slice(0, 220)}{summaryText.length > 220 ? '…' : ''}</p>
                                  )}
                                  {keyFindings && keyFindings.length > 0 && (
                                    <div className="space-y-1.5">
                                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Key findings</p>
                                      {keyFindings.map((f, i) => (
                                        <div key={i} className="flex gap-2">
                                          <span className="text-emerald-500 text-[11px] mt-0.5 shrink-0">•</span>
                                          <p className="text-[11px] text-foreground/80 leading-relaxed">{f.slice(0, 160)}{f.length > 160 ? '…' : ''}</p>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {nextActions && nextActions.length > 0 && (
                                    <div className="border-t border-emerald-500/10 pt-2 space-y-1">
                                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Next actions</p>
                                      {nextActions.map((a, i) => (
                                        <p key={i} className="text-[11px] text-primary/80">{i + 1}. {a.slice(0, 120)}{a.length > 120 ? '…' : ''}</p>
                                      ))}
                                    </div>
                                  )}
                                  <button
                                    onClick={() => setExpandedEvents(prev => { const n = new Set(prev); n.has(ev.id) ? n.delete(ev.id) : n.add(ev.id); return n })}
                                    className="text-[11px] text-primary hover:underline"
                                  >
                                    {isExpanded ? 'Show less' : 'Show raw output'}
                                  </button>
                                  {isExpanded && (
                                    <p className="text-[11px] text-foreground/60 leading-relaxed whitespace-pre-wrap border-t border-border/40 pt-2">{fullSummary}</p>
                                  )}
                                </>
                              ) : (
                                <>
                                  <p className="text-[12px] text-foreground/75 leading-relaxed whitespace-pre-wrap">
                                    {isExpanded ? fullSummary : fullSummary.slice(0, 400)}
                                  </p>
                                  {fullSummary.length > 400 && (
                                    <button
                                      onClick={() => setExpandedEvents(prev => { const n = new Set(prev); n.has(ev.id) ? n.delete(ev.id) : n.add(ev.id); return n })}
                                      className="text-[11px] text-primary hover:underline"
                                    >
                                      {isExpanded ? 'Show less' : 'Show more'}
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    </>
                  )
                })()}
              </div>
            )}

            {/* Agents tab — all spawned agents */}
            {detailTab === 'agents' && (
              <div className="flex-1 overflow-y-auto p-5">
                {(() => {
                  const delegated = events.filter(e => e.kind === 'agent_delegated')
                  if (delegated.length === 0) return (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Bot size={28} className="text-muted-foreground/30 mb-2" />
                      <p className="text-[13px] font-medium text-muted-foreground">No agents spawned yet</p>
                      <p className="text-[11px] text-muted-foreground/60 mt-1">Agents will appear here after the first tick.</p>
                    </div>
                  )
                  // Merge delegated events with completion events for status
                  const completedIds = new Set(events.filter(e => e.kind === 'agent_completed').map(e => String(e.payload.agent_id)))
                  const activeIds = new Set(activeAgents.map(a => a.id))
                  return (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">{delegated.length} agent{delegated.length !== 1 ? 's' : ''} spawned</p>
                      {delegated.map((ev) => {
                        const agentId = String(ev.payload.agent_id ?? '')
                        const agentName = typeof ev.payload.agent_name === 'string' ? ev.payload.agent_name : 'Agent'
                        const task = typeof ev.payload.task === 'string' ? ev.payload.task : ''
                        const isDone = completedIds.has(agentId)
                        const isRunning = activeIds.has(agentId)
                        return (
                          <div key={ev.id} className={cn(
                            'p-3 rounded-xl border',
                            isDone ? 'border-emerald-500/20 bg-emerald-500/4' :
                            isRunning ? 'border-primary/20 bg-primary/5' :
                            'border-border/60 bg-card/40'
                          )}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <Bot size={12} className={cn('shrink-0', isDone ? 'text-emerald-500' : isRunning ? 'text-primary' : 'text-muted-foreground')} />
                                <span className="text-[12px] font-semibold text-foreground truncate">{agentName}</span>
                              </div>
                              <span className={cn('text-[10px] font-medium shrink-0 px-1.5 py-0.5 rounded-md',
                                isDone ? 'text-emerald-600 bg-emerald-500/10' :
                                isRunning ? 'text-primary bg-primary/10 animate-pulse' :
                                'text-muted-foreground bg-muted'
                              )}>
                                {isDone ? 'Done' : isRunning ? 'Running' : 'Queued'}
                              </span>
                            </div>
                            {task && <p className="text-[11px] text-muted-foreground mt-1.5 line-clamp-2">{task.slice(0, 150)}</p>}
                            <div className="flex items-center justify-between mt-1">
                              <p className="text-[10px] text-muted-foreground/60">{timeAgo(ev.created_at)}</p>
                              {typeof ev.payload.conversation_id === 'string' && ev.payload.conversation_id && (
                                <button
                                  onClick={() => router.push(`/app/chat/${ev.payload.conversation_id}`)}
                                  className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                                >
                                  <ExternalLink size={10} />
                                  View chat
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Settings tab */}
            {detailTab === 'settings' && (
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Autonomy level</label>
                  <select
                    value={editAutonomy}
                    onChange={e => setEditAutonomy(e.target.value as typeof editAutonomy)}
                    className="w-full px-3 py-2 text-[13px] rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="draft_only">Draft only — AI plans, you approve actions</option>
                    <option value="execute_with_approval">Execute with approval — AI acts, flags decisions</option>
                    <option value="full_auto">Full auto — AI acts autonomously</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Mission goal</label>
                  <textarea
                    value={editGoal}
                    onChange={e => setEditGoal(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 text-[13px] rounded-xl border border-border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Timebox per tick (minutes)</label>
                  <input
                    type="number"
                    min={5}
                    max={120}
                    value={editTimebox}
                    onChange={e => setEditTimebox(Number(e.target.value))}
                    className="w-full px-3 py-2 text-[13px] rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Max ticks per day</label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={editMaxTicks}
                    onChange={e => setEditMaxTicks(Number(e.target.value))}
                    className="w-full px-3 py-2 text-[13px] rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleUpdateMission}
                    disabled={saving}
                    className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save settings'}
                  </button>
                  <button
                    onClick={() => { setEditGoal(selectedMission?.goal ?? ''); setEditTimebox(selectedMission?.tick_timebox_minutes ?? 30); setEditMaxTicks(selectedMission?.max_ticks_per_day ?? 6); setEditAutonomy(selectedMission?.autonomy_level ?? 'full_auto') }}
                    className="px-4 py-2 rounded-xl border border-border text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Reset
                  </button>
                </div>
                <div className="pt-2 border-t border-border/40 space-y-1">
                  <p className="text-[10px] text-muted-foreground/60">Mission ID: <span className="font-mono">{selectedMission.id}</span></p>
                  <p className="text-[10px] text-muted-foreground/60">Created: {new Date(selectedMission.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
                </div>
              </div>
            )}

            {/* Overview bottom spacer */}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
            <Target size={40} className="text-muted-foreground/30 mb-3" />
            <p className="text-[15px] font-semibold text-foreground">Select a mission</p>
            <p className="text-[13px] text-muted-foreground mt-1">
              Choose a mission from the list to see its progress, activity log, and controls.
            </p>
          </div>
        )}
      </div>
      </div>
      </div>
      )}
    </div>
  )
}

function ScheduledAgentsPanel() {
  const [agents, setAgents] = useState<{id: string; name: string; schedule_type: string; next_run_at: string | null; status: string; config?: Record<string, unknown>}[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/agents?schedule_type=scheduled')
      .then(r => r.json())
      .then(d => setAgents((d.agents ?? []).filter((a: {schedule_type: string}) => a.schedule_type === 'scheduled')))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-2xl mx-auto space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
            <div className="w-9 h-9 rounded-full bg-foreground/8 animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-32 bg-foreground/8 rounded animate-pulse" />
              <div className="h-3 w-24 bg-foreground/8 rounded animate-pulse" />
            </div>
            <div className="h-5 w-16 bg-foreground/8 rounded-full animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )

  if (agents.length === 0) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
      <Calendar size={40} className="text-muted-foreground/20" />
      <p className="text-[15px] font-semibold text-foreground">No scheduled agents</p>
      <p className="text-[13px] text-muted-foreground">Agents with a schedule will appear here.</p>
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-2xl mx-auto space-y-3">
        <h2 className="text-[15px] font-bold text-foreground mb-4">Scheduled Agents</h2>
        {agents.map(agent => (
          <div key={agent.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bot size={16} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-foreground truncate">{agent.name}</p>
              {agent.next_run_at && (
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  Next: {new Date(agent.next_run_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </p>
              )}
            </div>
            <span className={cn(
              'text-[11px] font-medium px-2 py-0.5 rounded-full',
              agent.status === 'working' ? 'bg-primary/10 text-primary' :
              agent.status === 'completed' ? 'bg-green-500/10 text-green-600 dark:text-green-400' :
              'bg-muted text-muted-foreground'
            )}>{agent.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const SKILL_CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  research: { label: 'Research', color: 'text-blue-600 bg-blue-500/10', icon: '🔍' },
  coding: { label: 'Coding', color: 'text-emerald-600 bg-emerald-500/10', icon: '💻' },
  writing: { label: 'Writing', color: 'text-violet-600 bg-violet-500/10', icon: '📝' },
  analysis: { label: 'Analysis', color: 'text-amber-600 bg-amber-500/10', icon: '📊' },
  product: { label: 'Product', color: 'text-rose-600 bg-rose-500/10', icon: '📋' },
  custom: { label: 'Custom', color: 'text-gray-600 bg-gray-500/10', icon: '⚙️' },
}

const AVAILABLE_TOOLS_FOR_SKILLS = [
  'web_search', 'analyze_url', 'manage_memory_box', 'manage_board',
  'manage_recurring_task', 'calculate', 'create_visual_report',
]

interface SkillData {
  id: string; name: string; description: string; category: string; icon: string | null
  instructions: string; allowed_tools: string[]; resources: Array<{ name: string; type: string; content: string }>
  is_enabled: boolean; is_system: boolean; is_favorite: boolean
  user_invocable: boolean; model_invocable: boolean
  usage_count: number; last_used_at: string | null; created_at: string
}

const SKILL_BUNDLE_LIST = [
  { id: 'startup-founder', name: 'Startup Founder', icon: '🚀', desc: 'Build, grow, and fundraise' },
  { id: 'marketer', name: 'Marketing & Growth', icon: '📈', desc: 'Content, SEO, outreach' },
  { id: 'developer', name: 'Developer', icon: '💻', desc: 'Code, debug, test, ship' },
  { id: 'product-manager', name: 'Product Manager', icon: '📋', desc: 'Stories, research, roadmaps' },
  { id: 'sales', name: 'Sales & BD', icon: '🤝', desc: 'Outreach, pitch, close' },
  { id: 'all-rounder', name: 'All Skills', icon: '⚡', desc: 'Enable everything' },
]

function SkillsPanel() {
  const [skills, setSkills] = useState<SkillData[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [view, setView] = useState<'list' | 'create' | 'edit' | 'import' | 'bundles'>('list')
  const [editingSkill, setEditingSkill] = useState<SkillData | null>(null)

  // Create/Edit form state
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formInstructions, setFormInstructions] = useState('')
  const [formCategory, setFormCategory] = useState('custom')
  const [formIcon, setFormIcon] = useState('')
  const [formAllowedTools, setFormAllowedTools] = useState<string[]>([])
  const [formUserInvocable, setFormUserInvocable] = useState(true)
  const [formModelInvocable, setFormModelInvocable] = useState(true)
  const [saving, setSaving] = useState(false)

  // Import state
  const [importUrl, setImportUrl] = useState('')
  const [importContent, setImportContent] = useState('')
  const [importMode, setImportMode] = useState<'url' | 'paste'>('url')
  const [importing, setImporting] = useState(false)
  const [activatingBundle, setActivatingBundle] = useState<string | null>(null)

  const fetchSkills = useCallback(async () => {
    try {
      const params = categoryFilter !== 'all' ? `?category=${categoryFilter}` : ''
      const res = await fetch(`/api/skills${params}`)
      if (res.ok) {
        const data = await res.json()
        setSkills(data.skills ?? [])
      }
    } catch {}
    setLoading(false)
  }, [categoryFilter])

  useEffect(() => { fetchSkills() }, [fetchSkills])

  const resetForm = () => {
    setFormName(''); setFormDesc(''); setFormInstructions(''); setFormCategory('custom')
    setFormIcon(''); setFormAllowedTools([]); setFormUserInvocable(true); setFormModelInvocable(true)
  }

  const openCreate = () => { resetForm(); setEditingSkill(null); setView('create') }

  const openEdit = (skill: SkillData) => {
    setEditingSkill(skill)
    setFormName(skill.name); setFormDesc(skill.description); setFormInstructions(skill.instructions)
    setFormCategory(skill.category); setFormIcon(skill.icon ?? ''); setFormAllowedTools(skill.allowed_tools)
    setFormUserInvocable(skill.user_invocable); setFormModelInvocable(skill.model_invocable)
    setView('edit')
  }

  const handleSave = async () => {
    if (!formName.trim() || !formDesc.trim() || !formInstructions.trim()) { toast.error('Name, description, and instructions are required'); return }
    setSaving(true)
    try {
      if (view === 'edit' && editingSkill) {
        const res = await fetch('/api/skills', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingSkill.id,
            description: formDesc.trim(),
            instructions: formInstructions.trim(),
            category: formCategory,
            icon: formIcon.trim() || undefined,
            allowed_tools: formAllowedTools,
            user_invocable: formUserInvocable,
            model_invocable: formModelInvocable,
          }),
        })
        if (res.ok) { toast.success('Skill updated'); setView('list'); fetchSkills() }
        else { const err = await res.json(); toast.error(err.error || 'Failed to update') }
      } else {
        const res = await fetch('/api/skills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
            description: formDesc.trim(),
            instructions: formInstructions.trim(),
            category: formCategory,
            icon: formIcon.trim() || undefined,
            allowed_tools: formAllowedTools,
            user_invocable: formUserInvocable,
            model_invocable: formModelInvocable,
          }),
        })
        if (res.ok) { toast.success('Skill created'); setView('list'); fetchSkills() }
        else { const err = await res.json(); toast.error(err.error || 'Failed to create') }
      }
    } catch { toast.error('Failed to save skill') }
    finally { setSaving(false) }
  }

  const handleToggle = async (skill: SkillData) => {
    try {
      await fetch('/api/skills', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: skill.id, is_enabled: !skill.is_enabled }),
      })
      fetchSkills()
    } catch {}
  }

  const handleFavorite = async (skill: SkillData) => {
    try {
      await fetch('/api/skills', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: skill.id, is_favorite: !skill.is_favorite }),
      })
      fetchSkills()
    } catch {}
  }

  const handleDelete = async (skill: SkillData) => {
    if (skill.is_system) { toast.error('System skills cannot be deleted'); return }
    if (!confirm(`Delete skill "${skill.name}"?`)) return
    try {
      await fetch('/api/skills', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: skill.id }),
      })
      toast.success('Skill deleted')
      fetchSkills()
    } catch {}
  }

  const handleImport = async () => {
    setImporting(true)
    try {
      const body = importMode === 'url' ? { url: importUrl.trim() } : { content: importContent.trim() }
      const res = await fetch('/api/skills/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Imported "${data.skill?.name}" successfully`)
        setImportUrl(''); setImportContent(''); setView('list'); fetchSkills()
      } else {
        toast.error(data.error || 'Import failed')
      }
    } catch { toast.error('Import failed') }
    finally { setImporting(false) }
  }

  const handleActivateBundle = async (bundleId: string) => {
    setActivatingBundle(bundleId)
    try {
      const res = await fetch('/api/skills/bundles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle_id: bundleId }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(`Activated "${data.bundle}" — ${data.skills_enabled} skills enabled`)
        setView('list'); fetchSkills()
      } else {
        toast.error('Failed to activate bundle')
      }
    } catch { toast.error('Failed to activate bundle') }
    finally { setActivatingBundle(null) }
  }

  if (loading) return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto space-y-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-foreground/5 animate-pulse" />)}
      </div>
    </div>
  )

  // ── Import View ──
  if (view === 'import') {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setView('list')} className="p-1.5 rounded-lg hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft size={16} />
            </button>
            <h2 className="text-[15px] font-bold text-foreground">Import Skill</h2>
          </div>

          <p className="text-[12px] text-muted-foreground mb-4">Import a skill from any SKILL.md URL (GitHub, SkillsMP, etc.) or paste raw SKILL.md content.</p>

          <div className="flex gap-2 mb-4">
            <button onClick={() => setImportMode('url')} className={cn('px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors', importMode === 'url' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-foreground/5')}>From URL</button>
            <button onClick={() => setImportMode('paste')} className={cn('px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors', importMode === 'paste' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-foreground/5')}>Paste SKILL.md</button>
          </div>

          {importMode === 'url' ? (
            <div className="space-y-3">
              <input value={importUrl} onChange={e => setImportUrl(e.target.value)} placeholder="https://github.com/user/repo/blob/main/skills/my-skill/SKILL.md" className="w-full text-[13px] p-2.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <p className="text-[11px] text-muted-foreground">Supports GitHub URLs, raw URLs, and any SKILL.md file link. Browse skills at <a href="https://skillsmp.com" target="_blank" rel="noopener" className="text-primary hover:underline">skillsmp.com</a></p>
            </div>
          ) : (
            <textarea value={importContent} onChange={e => setImportContent(e.target.value)} placeholder={`---\nname: my-skill\ndescription: What this skill does...\n---\n\n# My Skill\n\n## Workflow\n1. Step one...\n2. Step two...`} rows={14} className="w-full text-[12px] p-3 rounded-lg border border-border bg-background resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono" />
          )}

          <div className="flex items-center gap-2 mt-4">
            <button onClick={() => setView('list')} className="px-4 py-2 text-[12px] font-medium rounded-lg text-muted-foreground hover:text-foreground">Cancel</button>
            <button onClick={handleImport} disabled={importing || (importMode === 'url' ? !importUrl.trim() : !importContent.trim())} className="px-4 py-2 text-[12px] font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {importing ? 'Importing…' : 'Import Skill'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Bundles View ──
  if (view === 'bundles') {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => setView('list')} className="p-1.5 rounded-lg hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft size={16} />
            </button>
            <h2 className="text-[15px] font-bold text-foreground">Skill Bundles</h2>
          </div>
          <p className="text-[12px] text-muted-foreground mb-4">Pick your role — the right skills are enabled automatically. You can always customize later.</p>

          <div className="grid grid-cols-2 gap-3">
            {SKILL_BUNDLE_LIST.map(bundle => (
              <button key={bundle.id} onClick={() => handleActivateBundle(bundle.id)} disabled={activatingBundle !== null}
                className={cn('p-4 rounded-xl border text-left transition-all hover:border-primary/30 hover:bg-primary/5', activatingBundle === bundle.id ? 'border-primary/30 bg-primary/5' : 'border-border bg-card')}>
                <span className="text-2xl">{bundle.icon}</span>
                <p className="text-[13px] font-semibold text-foreground mt-2">{bundle.name}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{bundle.desc}</p>
                {activatingBundle === bundle.id && <p className="text-[10px] text-primary mt-1">Activating…</p>}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Create/Edit View ──
  if (view === 'create' || view === 'edit') {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setView('list')} className="p-1.5 rounded-lg hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft size={16} />
            </button>
            <h2 className="text-[15px] font-bold text-foreground">{view === 'edit' ? `Edit: ${editingSkill?.name}` : 'Create Skill'}</h2>
          </div>

          <div className="space-y-4">
            {view === 'create' && (
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">Name (lowercase, hyphens only)</label>
                <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="my-skill-name" className="w-full text-[13px] p-2.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            )}

            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">Description (when should the AI use this?)</label>
              <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Use this skill when..." rows={2} className="w-full text-[13px] p-2.5 rounded-lg border border-border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">Category</label>
                <select value={formCategory} onChange={e => setFormCategory(e.target.value)} className="w-full text-[12px] p-2 rounded-lg border border-border bg-background focus:outline-none">
                  {Object.entries(SKILL_CATEGORY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
              <div className="w-20">
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">Icon</label>
                <input value={formIcon} onChange={e => setFormIcon(e.target.value)} placeholder="🔍" className="w-full text-[13px] p-2 rounded-lg border border-border bg-background focus:outline-none text-center" />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">Instructions (Markdown — the AI follows these step by step)</label>
              <textarea value={formInstructions} onChange={e => setFormInstructions(e.target.value)} placeholder={`# My Skill\n\n## Workflow\n1. First step...\n2. Second step...\n\n## Output Format\n- Bullet points\n- Structured data`} rows={14} className="w-full text-[12px] p-3 rounded-lg border border-border bg-background resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono" />
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1.5">Allowed Tools</label>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_TOOLS_FOR_SKILLS.map(tool => (
                  <button key={tool} onClick={() => setFormAllowedTools(prev => prev.includes(tool) ? prev.filter(t => t !== tool) : [...prev, tool])}
                    className={cn('px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors', formAllowedTools.includes(tool) ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-border/70')}>
                    {tool}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-[12px]">
                <input type="checkbox" checked={formUserInvocable} onChange={e => setFormUserInvocable(e.target.checked)} className="rounded" />
                <span className="text-muted-foreground">User can trigger</span>
              </label>
              <label className="flex items-center gap-2 text-[12px]">
                <input type="checkbox" checked={formModelInvocable} onChange={e => setFormModelInvocable(e.target.checked)} className="rounded" />
                <span className="text-muted-foreground">AI auto-triggers</span>
              </label>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <button onClick={() => setView('list')} className="px-4 py-2 text-[12px] font-medium rounded-lg text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving || !formDesc.trim() || !formInstructions.trim()} className="px-4 py-2 text-[12px] font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : view === 'edit' ? 'Update Skill' : 'Create Skill'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── List View ──
  const systemSkills = skills.filter(s => s.is_system)
  const customSkills = skills.filter(s => !s.is_system)

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-bold text-foreground">Skills</h2>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {['all', ...Object.keys(SKILL_CATEGORY_CONFIG)].map(f => (
                <button key={f} onClick={() => setCategoryFilter(f)} className={cn('px-2 py-1 rounded-lg text-[10px] font-medium capitalize transition-colors', categoryFilter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-foreground/5')}>
                  {f}
                </button>
              ))}
            </div>
            <button onClick={() => setView('bundles')} className="flex items-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors">
              <Zap size={11} /> Bundles
            </button>
            <button onClick={() => setView('import')} className="flex items-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors">
              <Download size={11} /> Import
            </button>
            <button onClick={openCreate} className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              <Plus size={11} /> Create
            </button>
          </div>
        </div>

        {skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 text-center py-16">
            <Sparkles size={36} className="text-muted-foreground/20" />
            <p className="text-[14px] font-medium text-muted-foreground">No skills yet</p>
            <p className="text-[12px] text-muted-foreground/60">Skills are modular AI capabilities. Create your own or enable system skills.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* System Skills */}
            {systemSkills.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">System Skills</p>
                <div className="space-y-1.5">
                  {systemSkills.map(skill => (
                    <SkillCard key={skill.id} skill={skill} onToggle={handleToggle} onFavorite={handleFavorite} onEdit={openEdit} onDelete={handleDelete} />
                  ))}
                </div>
              </div>
            )}

            {/* Custom Skills */}
            {customSkills.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Custom Skills</p>
                <div className="space-y-1.5">
                  {customSkills.map(skill => (
                    <SkillCard key={skill.id} skill={skill} onToggle={handleToggle} onFavorite={handleFavorite} onEdit={openEdit} onDelete={handleDelete} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SkillCard({ skill, onToggle, onFavorite, onEdit, onDelete }: {
  skill: SkillData
  onToggle: (s: SkillData) => void
  onFavorite: (s: SkillData) => void
  onEdit: (s: SkillData) => void
  onDelete: (s: SkillData) => void
}) {
  const cat = SKILL_CATEGORY_CONFIG[skill.category] ?? SKILL_CATEGORY_CONFIG.custom

  return (
    <div className={cn('p-3 rounded-xl border bg-card group transition-all', skill.is_enabled ? 'border-border' : 'border-border/50 opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[14px]">{skill.icon ?? cat.icon}</span>
            <p className="text-[13px] font-semibold text-foreground truncate">{skill.name}</p>
            {skill.is_system && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground">System</span>}
            <span className={cn('text-[9px] font-medium px-1.5 py-0.5 rounded', cat.color)}>{cat.label}</span>
          </div>
          <p className="text-[11px] text-muted-foreground line-clamp-1 mb-1">{skill.description}</p>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60">
            {skill.usage_count > 0 && <span>{skill.usage_count} runs</span>}
            {skill.last_used_at && <span>Last: {new Date(skill.last_used_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>}
            {skill.allowed_tools.length > 0 && <span>{skill.allowed_tools.length} tools</span>}
            {skill.user_invocable && <span>/{skill.name}</span>}
          </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => onFavorite(skill)} className={cn('p-1.5 rounded-lg transition-colors', skill.is_favorite ? 'text-amber-500' : 'text-muted-foreground hover:text-amber-500')} title="Favorite">
            <Star size={12} fill={skill.is_favorite ? 'currentColor' : 'none'} />
          </button>
          <button onClick={() => onEdit(skill)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors" title="Edit">
            <Edit3 size={12} />
          </button>
          <button onClick={() => onToggle(skill)} className={cn('p-1.5 rounded-lg transition-colors', skill.is_enabled ? 'text-emerald-500 hover:text-amber-500' : 'text-muted-foreground hover:text-emerald-500')} title={skill.is_enabled ? 'Disable' : 'Enable'}>
            {skill.is_enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
          </button>
          {!skill.is_system && (
            <button onClick={() => onDelete(skill)} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors" title="Delete">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const SCHEDULE_PRESETS = [
  { value: 'every_hour', label: 'Every hour', cron: '0 * * * *' },
  { value: 'every_6_hours', label: 'Every 6 hours', cron: '0 */6 * * *' },
  { value: 'daily_9am', label: 'Daily at 9am', cron: '0 9 * * *' },
  { value: 'weekdays_9am', label: 'Weekdays at 9am', cron: '0 9 * * 1-5' },
  { value: 'weekly_monday', label: 'Weekly Monday', cron: '0 9 * * 1' },
  { value: 'monthly_1st', label: 'Monthly (1st)', cron: '0 9 1 * *' },
]

function RecurringTasksPanel() {
  const [tasks, setTasks] = useState<Array<{ id: string; title: string; description: string | null; schedule_cron: string; status: string; task_type: string; output_destination: string; next_run_at: string | null; last_run_at: string | null; run_count: number; last_output: string | null; created_by: string; created_at: string }>>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newSchedule, setNewSchedule] = useState('daily_9am')
  const [newTaskType, setNewTaskType] = useState('action')
  const [newOutput, setNewOutput] = useState('board')
  const [creating, setCreating] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all')

  const fetchTasks = useCallback(async () => {
    try {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
      const res = await fetch(`/api/recurring-tasks${params}`)
      if (res.ok) {
        const data = await res.json()
        setTasks(data.tasks ?? [])
      }
    } catch {}
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/recurring-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDesc.trim() || undefined,
          schedule_cron: newSchedule,
          task_type: newTaskType,
          output_destination: newOutput,
        }),
      })
      if (res.ok) {
        toast.success('Recurring task created')
        setNewTitle(''); setNewDesc(''); setShowCreate(false)
        fetchTasks()
      } else { toast.error('Failed to create task') }
    } catch { toast.error('Failed to create task') }
    finally { setCreating(false) }
  }

  const handleToggle = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active'
    try {
      const res = await fetch('/api/recurring-tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      })
      if (res.ok) {
        toast.success(newStatus === 'active' ? 'Task resumed' : 'Task paused')
        fetchTasks()
      }
    } catch {}
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this recurring task?')) return
    try {
      await fetch('/api/recurring-tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      toast.success('Task deleted')
      fetchTasks()
    } catch {}
  }

  const cronLabel = (cron: string) => SCHEDULE_PRESETS.find(p => p.cron === cron)?.label ?? cron

  if (loading) return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-2xl mx-auto space-y-3">
        {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-foreground/5 animate-pulse" />)}
      </div>
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-bold text-foreground">Recurring Tasks</h2>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {(['all', 'active', 'paused'] as const).map(f => (
                <button key={f} onClick={() => setStatusFilter(f)} className={cn('px-2 py-1 rounded-lg text-[11px] font-medium capitalize transition-colors', statusFilter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-foreground/5')}>
                  {f}
                </button>
              ))}
            </div>
            <button onClick={() => setShowCreate(v => !v)} className={cn('flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg transition-colors', showCreate ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5')}>
              <Plus size={11} /> New
            </button>
          </div>
        </div>

        {showCreate && (
          <div className="mb-4 p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Task title…" className="w-full text-[13px] p-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" autoFocus />
            <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What should this task do? (optional)" rows={2} className="w-full text-[12px] p-2 rounded-lg border border-border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <div className="flex items-center gap-2 flex-wrap">
              <select value={newSchedule} onChange={e => setNewSchedule(e.target.value)} className="text-[11px] rounded-lg border border-border bg-background px-2 py-1 focus:outline-none">
                {SCHEDULE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <select value={newTaskType} onChange={e => setNewTaskType(e.target.value)} className="text-[11px] rounded-lg border border-border bg-background px-2 py-1 focus:outline-none">
                <option value="action">Action</option>
                <option value="research">Research</option>
                <option value="monitor">Monitor</option>
                <option value="report">Report</option>
              </select>
              <select value={newOutput} onChange={e => setNewOutput(e.target.value)} className="text-[11px] rounded-lg border border-border bg-background px-2 py-1 focus:outline-none">
                <option value="board">→ Board card</option>
                <option value="memory">→ Memory</option>
                <option value="chat">→ Chat</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-[11px] font-medium rounded-lg text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={handleCreate} disabled={!newTitle.trim() || creating} className="px-4 py-1.5 text-[11px] font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {creating ? 'Creating…' : 'Create Task'}
              </button>
            </div>
          </div>
        )}

        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 text-center py-16">
            <Repeat size={36} className="text-muted-foreground/20" />
            <p className="text-[14px] font-medium text-muted-foreground">No recurring tasks</p>
            <p className="text-[12px] text-muted-foreground/60">Create tasks that run on a schedule — daily reports, weekly monitoring, etc.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map(task => (
              <div key={task.id} className="p-3 rounded-xl border border-border bg-card group">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', task.status === 'active' ? 'bg-emerald-500' : task.status === 'paused' ? 'bg-amber-500' : 'bg-muted-foreground/30')} />
                      <p className="text-[13px] font-semibold text-foreground truncate">{task.title}</p>
                      {task.created_by === 'ai' && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">AI</span>}
                    </div>
                    {task.description && <p className="text-[11px] text-muted-foreground line-clamp-1 mb-1">{task.description}</p>}
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock size={10} /> {cronLabel(task.schedule_cron)}</span>
                      <span className="capitalize">{task.task_type}</span>
                      <span>→ {task.output_destination}</span>
                      {task.run_count > 0 && <span>{task.run_count} runs</span>}
                    </div>
                    {task.next_run_at && task.status === 'active' && (
                      <p className="text-[10px] text-primary mt-1">Next: {new Date(task.next_run_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                    )}
                    {task.last_output && (
                      <p className="text-[10px] text-muted-foreground/60 mt-1 line-clamp-1 italic">Last: {task.last_output}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => handleToggle(task.id, task.status)} className={cn('p-1.5 rounded-lg transition-colors', task.status === 'active' ? 'hover:bg-amber-500/10 text-muted-foreground hover:text-amber-500' : 'hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-500')} title={task.status === 'active' ? 'Pause' : 'Resume'}>
                      {task.status === 'active' ? <Pause size={12} /> : <Play size={12} />}
                    </button>
                    <button onClick={() => handleDelete(task.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors" title="Delete">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MemoryCard({ memory, onUpdate, onDelete }: { memory: { id: string; content: string; memory_type: string; importance: number; created_at: string }; onUpdate: (m: { id: string; content: string; importance: number }) => void; onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(memory.content)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!editContent.trim() || editContent === memory.content) { setEditing(false); return }
    setSaving(true)
    try {
      const res = await fetch('/api/memory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: memory.id, content: editContent.trim() }),
      })
      if (res.ok) {
        const d = await res.json()
        onUpdate(d.memory)
      }
    } catch { /* ignore */ } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  const handleDelete = async () => {
    try {
      const res = await fetch('/api/memory', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: memory.id }),
      })
      if (res.ok) onDelete(memory.id)
    } catch { /* ignore */ } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="p-3 rounded-xl border border-border bg-card group">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary capitalize">{memory.memory_type?.replace('_', ' ') ?? 'general'}</span>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground/60 shrink-0">{new Date(memory.created_at).toLocaleDateString()}</span>
          {!editing && !confirming && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
              <button onClick={() => { setEditContent(memory.content); setEditing(true) }} className="p-1 rounded hover:bg-foreground/5 text-muted-foreground hover:text-foreground" title="Edit">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
              </button>
              <button onClick={() => setConfirming(true)} className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500" title="Delete">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            </div>
          )}
        </div>
      </div>
      {editing ? (
        <div className="space-y-2 mt-1">
          <textarea
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            className="w-full text-[13px] p-2 rounded-lg border border-border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            rows={2}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button onClick={handleSave} disabled={saving} className="px-3 py-1 text-[11px] font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)} className="px-3 py-1 text-[11px] font-medium rounded-lg text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
        </div>
      ) : confirming ? (
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[12px] text-red-500">Delete this memory?</span>
          <button onClick={handleDelete} className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-red-500 text-white hover:bg-red-600">Delete</button>
          <button onClick={() => setConfirming(false)} className="px-2.5 py-1 text-[11px] font-medium rounded-lg text-muted-foreground hover:text-foreground">Cancel</button>
        </div>
      ) : (
        <p className="text-[13px] text-foreground leading-relaxed">{memory.content}</p>
      )}
    </div>
  )
}

interface MemoryBoxData {
  id: string
  name: string
  description: string | null
  category: string
  icon: string | null
  color: string | null
  is_pinned: boolean
  memory_count: number
}

const BOX_CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  persona: { label: 'Persona', color: 'text-violet-600 bg-violet-500/10', icon: '👤' },
  projects: { label: 'Projects', color: 'text-blue-600 bg-blue-500/10', icon: '📁' },
  knowledge: { label: 'Knowledge', color: 'text-emerald-600 bg-emerald-500/10', icon: '🧠' },
  operations: { label: 'Operations', color: 'text-amber-600 bg-amber-500/10', icon: '⚙️' },
  context: { label: 'Context', color: 'text-rose-600 bg-rose-500/10', icon: '📌' },
}

function MemoryPanel() {
  const [boxes, setBoxes] = useState<MemoryBoxData[]>([])
  const [memories, setMemories] = useState<{id: string; content: string; memory_type: string; importance: number; created_at: string; box_id?: string | null}[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeBox, setActiveBox] = useState<string | null>(null) // null = all, 'unboxed' = unboxed, else box id
  const [showCreateBox, setShowCreateBox] = useState(false)
  const [newBoxName, setNewBoxName] = useState('')
  const [newBoxCategory, setNewBoxCategory] = useState('knowledge')
  const [newBoxDesc, setNewBoxDesc] = useState('')
  const [creatingBox, setCreatingBox] = useState(false)
  const [showAddMemory, setShowAddMemory] = useState(false)
  const [newMemContent, setNewMemContent] = useState('')
  const [addingMemory, setAddingMemory] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [boxesRes, memoriesRes] = await Promise.all([
        fetch('/api/memory/boxes').then(r => r.json()),
        fetch('/api/memory').then(r => r.json()),
      ])
      setBoxes(boxesRes.boxes ?? [])
      setMemories(memoriesRes.memories ?? [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleCreateBox = async () => {
    if (!newBoxName.trim()) return
    setCreatingBox(true)
    try {
      const res = await fetch('/api/memory/boxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name: newBoxName.trim(), category: newBoxCategory, description: newBoxDesc.trim() || undefined }),
      })
      if (res.ok) {
        setNewBoxName(''); setNewBoxDesc(''); setShowCreateBox(false)
        fetchData()
      }
    } catch {} finally { setCreatingBox(false) }
  }

  const handleAddMemory = async () => {
    if (!newMemContent.trim() || !activeBox || activeBox === 'unboxed') return
    setAddingMemory(true)
    try {
      const res = await fetch('/api/memory/boxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_memory', box_id: activeBox, content: newMemContent.trim() }),
      })
      if (res.ok) {
        setNewMemContent(''); setShowAddMemory(false)
        fetchData()
      }
    } catch {} finally { setAddingMemory(false) }
  }

  const handleDeleteBox = async (boxId: string) => {
    if (!confirm('Delete this box? Memories will be unboxed, not deleted.')) return
    try {
      await fetch('/api/memory/boxes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: boxId }),
      })
      if (activeBox === boxId) setActiveBox(null)
      fetchData()
    } catch {}
  }

  const filtered = memories.filter(m => {
    if (search && !m.content.toLowerCase().includes(search.toLowerCase())) return false
    if (activeBox === null) return true
    if (activeBox === 'unboxed') return !m.box_id
    return m.box_id === activeBox
  })

  if (loading) return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-5 w-40 bg-foreground/8 rounded animate-pulse flex-1" />
          <div className="h-8 w-44 bg-foreground/8 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-foreground/5 animate-pulse" />)}
        </div>
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="p-3 rounded-xl border border-border bg-card space-y-1.5">
              <div className="h-3 bg-foreground/8 rounded animate-pulse" style={{ width: `${65 + (i * 7) % 30}%` }} />
              <div className="h-3 w-24 bg-foreground/8 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const activeBoxData = boxes.find(b => b.id === activeBox)
  const unboxedCount = memories.filter(m => !m.box_id).length

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-[15px] font-bold text-foreground flex-1">
            {activeBox === null ? 'Workspace Memory' : activeBox === 'unboxed' ? 'Unboxed Memories' : activeBoxData?.name ?? 'Box'}
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="pl-8 pr-3 py-1.5 text-[12px] rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 w-40" />
            </div>
            <button onClick={() => setShowCreateBox(v => !v)} className="flex items-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors">
              <Plus size={11} /> Box
            </button>
          </div>
        </div>

        {/* Create Box Form */}
        {showCreateBox && (
          <div className="mb-4 p-3 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
            <input value={newBoxName} onChange={e => setNewBoxName(e.target.value)} placeholder="Box name…" className="w-full text-[13px] p-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" autoFocus />
            <input value={newBoxDesc} onChange={e => setNewBoxDesc(e.target.value)} placeholder="Description (optional)…" className="w-full text-[12px] p-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <div className="flex items-center gap-2">
              <select value={newBoxCategory} onChange={e => setNewBoxCategory(e.target.value)} className="text-[11px] rounded-lg border border-border bg-background px-2 py-1 focus:outline-none">
                {Object.entries(BOX_CATEGORY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
              <div className="flex-1" />
              <button onClick={() => setShowCreateBox(false)} className="px-3 py-1 text-[11px] font-medium rounded-lg text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={handleCreateBox} disabled={!newBoxName.trim() || creatingBox} className="px-3 py-1 text-[11px] font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {creatingBox ? 'Creating…' : 'Create Box'}
              </button>
            </div>
          </div>
        )}

        {/* Box Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          <button onClick={() => setActiveBox(null)} className={cn('p-3 rounded-xl border text-left transition-all', activeBox === null ? 'border-primary/30 bg-primary/5' : 'border-border bg-card hover:border-border/70')}>
            <p className="text-[12px] font-semibold text-foreground">All Memories</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{memories.length} items</p>
          </button>
          {boxes.map(box => {
            const cat = BOX_CATEGORY_CONFIG[box.category] ?? BOX_CATEGORY_CONFIG.knowledge
            return (
              <button key={box.id} onClick={() => setActiveBox(box.id)} className={cn('p-3 rounded-xl border text-left transition-all group relative', activeBox === box.id ? 'border-primary/30 bg-primary/5' : 'border-border bg-card hover:border-border/70')}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[14px]">{box.icon ?? cat.icon}</span>
                  <p className="text-[12px] font-semibold text-foreground truncate">{box.name}</p>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', cat.color)}>{cat.label}</span>
                  <span className="text-[10px] text-muted-foreground">{box.memory_count}</span>
                </div>
                {box.description && <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">{box.description}</p>}
                <button onClick={(e) => { e.stopPropagation(); handleDeleteBox(box.id) }} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-all" title="Delete box">
                  <X size={10} />
                </button>
              </button>
            )
          })}
          {unboxedCount > 0 && (
            <button onClick={() => setActiveBox('unboxed')} className={cn('p-3 rounded-xl border text-left transition-all border-dashed', activeBox === 'unboxed' ? 'border-primary/30 bg-primary/5' : 'border-border bg-card/50 hover:border-border/70')}>
              <p className="text-[12px] font-medium text-muted-foreground">Unboxed</p>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">{unboxedCount} items</p>
            </button>
          )}
        </div>

        {/* Add Memory to Box */}
        {activeBox && activeBox !== 'unboxed' && (
          <div className="mb-3">
            {showAddMemory ? (
              <div className="p-3 rounded-xl border border-border bg-card space-y-2">
                <textarea value={newMemContent} onChange={e => setNewMemContent(e.target.value)} placeholder="What should I remember?" rows={2} className="w-full text-[13px] p-2 rounded-lg border border-border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" autoFocus />
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowAddMemory(false)} className="px-3 py-1 text-[11px] font-medium rounded-lg text-muted-foreground hover:text-foreground">Cancel</button>
                  <button onClick={handleAddMemory} disabled={!newMemContent.trim() || addingMemory} className="px-3 py-1 text-[11px] font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {addingMemory ? 'Adding…' : 'Add Memory'}
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAddMemory(true)} className="w-full py-2 rounded-xl border border-dashed border-border text-[12px] text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors">
                + Add memory to this box
              </button>
            )}
          </div>
        )}

        {/* Memory List */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 text-center py-16">
            <Brain size={36} className="text-muted-foreground/20" />
            <p className="text-[14px] text-muted-foreground">{search ? 'No matching memories' : activeBox ? 'No memories in this box yet' : 'No memories stored yet'}</p>
            <p className="text-[12px] text-muted-foreground/60">The AI will store important facts here as you chat</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(m => (
              <MemoryCard key={m.id} memory={m} onUpdate={(updated) => setMemories(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x))} onDelete={(id) => setMemories(prev => prev.filter(x => x.id !== id))} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface WorkspaceFile {
  id: string
  name: string
  mime_type: string
  size_bytes: number
  storage_path: string
  created_at: string
  download_url?: string
}

function FilesPanel() {
  const [files, setFiles] = useState<WorkspaceFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch('/api/files')
      if (res.ok) {
        const data = await res.json()
        setFiles(data.files ?? [])
      }
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchFiles() }, [fetchFiles])

  const uploadFile = async (file: File) => {
    setUploading(true)
    try {
      const urlRes = await fetch('/api/files/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, mime_type: file.type, size_bytes: file.size }),
      })
      if (!urlRes.ok) { toast.error('Failed to get upload URL'); return }
      const { upload_url, storage_path } = await urlRes.json()

      const putRes = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!putRes.ok) { toast.error('Upload failed'); return }

      const regRes = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, mime_type: file.type, size_bytes: file.size, storage_path }),
      })
      if (regRes.ok) { toast.success(`${file.name} uploaded`); fetchFiles() }
      else { toast.error('Failed to register file') }
    } catch { toast.error('Upload failed') } finally {
      setUploading(false)
    }
  }

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return
    Array.from(fileList).forEach(uploadFile)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return
    const res = await fetch(`/api/files/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('File deleted'); fetchFiles() }
    else { toast.error('Failed to delete file') }
  }

  const formatBytes = (b: number) => {
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
    return `${(b / (1024 * 1024)).toFixed(1)} MB`
  }

  const mimeIcon = (mime: string) => {
    if (mime.startsWith('image/')) return '🖼️'
    if (mime === 'application/pdf') return '📄'
    if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return '📊'
    if (mime.includes('word') || mime.includes('document')) return '📝'
    if (mime.includes('zip') || mime.includes('tar') || mime.includes('gz')) return '🗜️'
    return '📁'
  }

  const filtered = files.filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()))

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-5 w-36 bg-foreground/8 rounded animate-pulse flex-1" />
            <div className="h-8 w-32 bg-foreground/8 rounded-lg animate-pulse" />
            <div className="h-8 w-24 bg-foreground/8 rounded-lg animate-pulse" />
          </div>
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
                <div className="text-xl opacity-20 bg-foreground/8 w-8 h-8 rounded animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-foreground/8 rounded animate-pulse" style={{ width: `${45 + (i * 11) % 40}%` }} />
                  <div className="h-3 w-20 bg-foreground/8 rounded animate-pulse" />
                </div>
                <div className="h-7 w-16 bg-foreground/8 rounded-lg animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn('flex-1 overflow-y-auto p-4', dragging && 'ring-2 ring-primary ring-inset')}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
    >
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-[15px] font-bold text-foreground flex-1">Workspace Files</h2>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search files…"
              className="pl-8 pr-3 py-1.5 text-[12px] rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 w-44"
            />
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            Upload
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
        </div>

        {dragging && (
          <div className="mb-4 p-6 rounded-xl border-2 border-dashed border-primary/40 bg-primary/[0.03] text-center">
            <p className="text-[13px] text-primary font-medium">Drop files here to upload</p>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 text-center py-16">
            <FolderOpen size={36} className="text-muted-foreground/20" />
            <p className="text-[14px] text-muted-foreground">{search ? 'No matching files' : 'No files yet — drop files here or click Upload'}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.map(f => (
              <div key={f.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:border-border/80 transition-colors group">
                <span className="text-[20px] leading-none shrink-0">{mimeIcon(f.mime_type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">{f.name}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{formatBytes(f.size_bytes)} · {new Date(f.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {f.download_url && (
                    <a
                      href={f.download_url}
                      download={f.name}
                      className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                      title="Download"
                    >
                      <Download size={13} className="text-muted-foreground" />
                    </a>
                  )}
                  <button
                    onClick={() => handleDelete(f.id, f.name)}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={13} className="text-muted-foreground hover:text-destructive transition-colors" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PeoplePanel() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
      <Users size={40} className="text-muted-foreground/20" />
      <div>
        <p className="text-[15px] font-semibold text-foreground">Team & People</p>
        <p className="text-[13px] text-muted-foreground mt-1">Manage workspace members and roles in Settings.</p>
      </div>
      <a
        href="/settings/team"
        className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-90 transition-opacity"
      >
        Go to Team Settings
      </a>
    </div>
  )
}
