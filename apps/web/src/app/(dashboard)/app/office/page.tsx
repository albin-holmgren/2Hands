'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useWorkspaceStore } from '@/store/workspace-store'
import {
  Bot,
  Clock,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Building2,
  Zap,
  Tv2,
  LayoutGrid,
  Trash2,
  CheckSquare,
  Square,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { OfficeScene } from '@/components/office/office-scene'

// ── Types ────────────────────────────────────────────────────────────────────

interface OfficeAgent {
  id: string
  name: string
  type: string
  status: 'initializing' | 'idle' | 'working' | 'completed' | 'failed' | 'terminated'
  last_active: string
  intent?: 'blocked' | 'approval' | 'working' | 'idle' | 'completed' | 'failed'
  intent_text?: string
  description?: string | null
  mission_id?: string | null
  active_run_task?: string | null
  last_progress?: { type: string; message: string; timestamp: string; data?: Record<string, unknown> } | null
  last_tool?: { name: string | null; action_type: string | null; action_target: string | null; timestamp: string | null } | null
  approval?: { id: string; title: string; description: string; created_at: string } | null
  gridX?: number
  gridY?: number
}

type OfficeManager = { intent: string; intent_text: string }

type OfficeFeed = {
  manager: OfficeManager
  agents: OfficeAgent[]
  approvals?: { pending_count: number }
  generated_at: string
}

// ── Status helpers ────────────────────────────────────────────────────────────

function statusLabel(s: OfficeAgent['status']) {
  switch (s) {
    case 'working':      return 'Working'
    case 'initializing': return 'Queued'
    case 'idle':         return 'Resting'
    case 'completed':    return 'Done'
    case 'failed':       return 'Failed'
    case 'terminated':   return 'Terminated'
  }
}

function statusColor(s: OfficeAgent['status']) {
  switch (s) {
    case 'working':      return 'bg-emerald-500'
    case 'initializing': return 'bg-amber-400 animate-pulse'
    case 'idle':         return 'bg-indigo-400/40'
    case 'completed':    return 'bg-sky-500'
    case 'failed':       return 'bg-destructive'
    case 'terminated':   return 'bg-muted-foreground/20'
  }
}

// ── Agent card ────────────────────────────────────────────────────────────────

function AgentDesk({
  agent, onClick, selectionMode, selected, onToggleSelect,
}: {
  agent: OfficeAgent
  onClick: () => void
  selectionMode: boolean
  selected: boolean
  onToggleSelect: () => void
}) {
  const isWorking = agent.status === 'working'
  const isQueued = agent.status === 'initializing'
  const isActive = isWorking || isQueued
  const isResting = agent.status === 'idle'
  const taskDesc = (agent.intent_text || agent.active_run_task || agent.description || '').slice(0, 60)
  const [screenshot, setScreenshot] = useState<string | null>(null)

  useEffect(() => {
    if (!isWorking) { setScreenshot(null); return }
    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetch(`/api/agents/screenshot?agentId=${agent.id}`)
        if (res.ok && !cancelled) {
          const data = await res.json()
          if (data.screenshot) setScreenshot(data.screenshot)
        }
      } catch { /* silent */ }
    }
    poll()
    const iv = setInterval(poll, 2000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [agent.id, isWorking])

  return (
    <button
      onClick={selectionMode ? onToggleSelect : onClick}
      className={cn(
        'relative flex flex-col rounded-2xl border overflow-hidden transition-all duration-200 text-left w-full',
        'hover:scale-[1.02] hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selectionMode && selected
          ? 'border-blue-500 bg-card ring-2 ring-blue-500/30'
          : isActive
            ? 'border-blue-500/30 bg-card shadow-[0_0_0_1px_rgba(37,99,235,0.15)]'
            : 'bg-card border-border hover:border-foreground/15'
      )}
    >
      {/* Selection checkbox */}
      {selectionMode && (
        <div className="absolute top-2 right-2 z-20 pointer-events-none">
          {selected
            ? <CheckSquare size={16} className="text-blue-500 drop-shadow" />
            : <Square size={16} className="text-white/80 drop-shadow" />
          }
        </div>
      )}

      {/* Screenshot / VM display */}
      {isWorking ? (
        <div className="relative w-full aspect-video bg-[#0a0a0a] overflow-hidden">
          {screenshot ? (
            <>
              <img src={`data:image/png;base64,${screenshot}`} alt="Agent VM" className="w-full h-full object-cover" />
              <div className="absolute inset-0 pointer-events-none rounded-t-2xl office-glow-pulse" />
              <style>{`@keyframes office-glow { 0%,100%{box-shadow:inset 0 0 20px 4px rgba(37,99,235,0.4)} 50%{box-shadow:inset 0 0 32px 8px rgba(37,99,235,0.8)} } .office-glow-pulse{animation:office-glow 3s ease-in-out infinite}`}</style>
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
              <Loader2 size={18} className="animate-spin text-blue-400/70" />
              <p className="text-[10px] text-blue-300/50">Connecting to VM…</p>
            </div>
          )}
          <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-600/80 backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-200 animate-pulse" />
            <span className="text-[9px] font-semibold text-blue-100 uppercase tracking-wide">Live</span>
          </div>
          {!selectionMode && (
            <span className="absolute top-2 right-2 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          )}
        </div>
      ) : isQueued ? (
        <div className="w-full aspect-video flex flex-col items-center justify-center gap-2 bg-amber-500/5">
          <Clock size={20} className="text-amber-400/60" />
          <p className="text-[10px] text-amber-400/70 font-medium">Waiting in queue</p>
        </div>
      ) : isResting ? (
        <div className="w-full aspect-video flex flex-col items-center justify-center gap-1.5 bg-indigo-500/5">
          <Bot size={22} className="text-indigo-400/40" />
          <p className="text-[10px] text-indigo-400/50 font-medium">Resting</p>
        </div>
      ) : (
        <div className="w-full aspect-video flex items-center justify-center bg-muted/40">
          <Bot size={28} className="text-muted-foreground/30" />
        </div>
      )}

      {/* Info row */}
      <div className="px-3 py-2.5">
        <p className="text-[12px] font-semibold text-foreground truncate">{agent.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusColor(agent.status))} />
          <span className="text-[10px] text-muted-foreground">{statusLabel(agent.status)}</span>
        </div>
        {taskDesc && (
          <p className="text-[10px] text-muted-foreground/60 mt-1 line-clamp-1">{taskDesc}</p>
        )}
      </div>
    </button>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function OfficePage() {
  const router = useRouter()
  const { activeWorkspace } = useWorkspaceStore()
  const [agents, setAgents] = useState<OfficeAgent[]>([])
  const [manager, setManager] = useState<OfficeManager | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'idle' | 'done'>('all')
  const [view, setView] = useState<'scene' | 'list'>('scene')

  // Selection + bulk delete state
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchOfficeFeed = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const res = await fetch('/api/office/feed', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as OfficeFeed
      setAgents(Array.isArray(data.agents) ? data.agents : [])
      setManager(data.manager ?? null)
    } catch { /* silent */ } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchOfficeFeed(true)
    const interval = setInterval(() => {
      if (document.hidden) return
      fetchOfficeFeed(true)
    }, 6000)
    return () => clearInterval(interval)
  }, [fetchOfficeFeed])

  // Reset selection when leaving grid view
  useEffect(() => {
    if (view !== 'list') {
      setSelectionMode(false)
      setSelectedIds(new Set())
      setConfirmingDelete(false)
    }
  }, [view])

  const exitSelectionMode = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
    setConfirmingDelete(false)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = (visibleIds: string[]) => {
    const allSelected = visibleIds.every(id => selectedIds.has(id))
    setSelectedIds(allSelected ? new Set() : new Set(visibleIds))
  }

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return
    setIsDeleting(true)
    try {
      await Promise.all(
        Array.from(selectedIds).map(id =>
          fetch(`/api/agents/${id}`, { method: 'DELETE' })
        )
      )
      setAgents(prev => prev.filter(a => !selectedIds.has(a.id)))
      exitSelectionMode()
    } catch { /* silent — partial deletes still clear on next poll */ } finally {
      setIsDeleting(false)
      await fetchOfficeFeed(true)
    }
  }

  const filtered = agents.filter(a => {
    if (filter === 'active') return a.status === 'working' || a.status === 'initializing'
    if (filter === 'idle')   return a.status === 'idle'
    if (filter === 'done')   return a.status === 'completed' || a.status === 'failed'
    return true
  })

  const activeCount = agents.filter(a => a.status === 'working' || a.status === 'initializing').length
  const idleCount   = agents.filter(a => a.status === 'idle').length
  const doneCount   = agents.filter(a => a.status === 'completed' || a.status === 'failed').length

  const FILTERS: { id: typeof filter; label: string; count: number }[] = [
    { id: 'all',    label: 'All',      count: agents.length },
    { id: 'active', label: 'Working',   count: activeCount },
    { id: 'idle',   label: 'Standby',   count: idleCount },
    { id: 'done',   label: 'Done',      count: doneCount },
  ]

  const filteredIds = filtered.map(a => a.id)
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.has(id))

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <Building2 size={18} className="text-muted-foreground" />
          <div>
            <h1 className="text-[17px] font-semibold text-foreground tracking-tight leading-none">Office</h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {activeCount > 0 ? `${activeCount} agent${activeCount !== 1 ? 's' : ''} working` : 'All agents resting'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-3 mr-2">
            <span className="flex items-center gap-1 text-[11px] text-emerald-500 font-medium"><Zap size={11} />{activeCount} working</span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Clock size={11} />{idleCount} idle</span>
            <span className="flex items-center gap-1 text-[11px] text-sky-500"><CheckCircle2 size={11} />{doneCount} done</span>
          </div>
          {/* View toggle */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-border bg-muted/50">
            <button onClick={() => setView('scene')} className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors', view === 'scene' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              <Tv2 size={12} /> Scene
            </button>
            <button onClick={() => setView('list')} className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors', view === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              <LayoutGrid size={12} /> Grid
            </button>
          </div>
          <button onClick={() => fetchOfficeFeed()} disabled={refreshing} className="p-2 rounded-xl hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" title="Refresh">
            <RefreshCw size={15} className={cn(refreshing && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Scene view */}
      {view === 'scene' && (
        <div className="flex-1 overflow-hidden relative">
          <OfficeScene manager={manager} agents={agents} loading={loading} onDeploy={() => router.push('/app/agents')} aiName={activeWorkspace?.ai_name || undefined} />
        </div>
      )}

      {/* Grid view */}
      {view === 'list' && (
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* Filter + action bar */}
          <div className="flex items-center justify-between gap-2 mb-5">
            <div className="flex items-center gap-1">
              {!selectionMode && FILTERS.map(f => (
                <button key={f.id} onClick={() => setFilter(f.id)} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors', filter === f.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground hover:bg-accent')}>
                  {f.label}
                  <span className={cn('text-[10px] px-1 py-0.5 rounded-full', filter === f.id ? 'bg-background/20 text-background' : 'bg-muted text-muted-foreground')}>{f.count}</span>
                </button>
              ))}
              {selectionMode && (
                <button
                  onClick={() => toggleSelectAll(filteredIds)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  {allFilteredSelected
                    ? <><CheckSquare size={13} /> Deselect all</>
                    : <><Square size={13} /> Select all</>
                  }
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Selection mode toggle */}
              {!selectionMode && filtered.length > 0 && (
                <button
                  onClick={() => setSelectionMode(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent hover:border-border transition-colors"
                >
                  <CheckSquare size={13} /> Select
                </button>
              )}

              {/* Selection mode: count + delete */}
              {selectionMode && (
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-muted-foreground">
                    {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'None selected'}
                  </span>
                  {!confirmingDelete ? (
                    <button
                      onClick={() => { if (selectedIds.size > 0) setConfirmingDelete(true) }}
                      disabled={selectedIds.size === 0}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors',
                        selectedIds.size > 0
                          ? 'bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20'
                          : 'text-muted-foreground/40 cursor-not-allowed'
                      )}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-destructive/30 bg-destructive/8 text-[12px]">
                      <span className="text-destructive font-medium">Delete {selectedIds.size} agent{selectedIds.size !== 1 ? 's' : ''}?</span>
                      <button
                        onClick={deleteSelected}
                        disabled={isDeleting}
                        className="ml-1 px-2 py-0.5 rounded-md bg-destructive text-destructive-foreground font-semibold hover:bg-destructive/90 transition-colors disabled:opacity-60"
                      >
                        {isDeleting ? <Loader2 size={11} className="animate-spin" /> : 'Confirm'}
                      </button>
                      <button onClick={() => setConfirmingDelete(false)} className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors">
                        <X size={13} />
                      </button>
                    </div>
                  )}
                  <button onClick={exitSelectionMode} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors" title="Cancel selection">
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex flex-col rounded-2xl border border-border overflow-hidden bg-card">
                  <div className="w-full aspect-video bg-foreground/8 animate-pulse" />
                  <div className="px-3 py-2.5 space-y-1.5">
                    <div className="h-3.5 bg-foreground/8 rounded animate-pulse" style={{ width: `${50 + (i * 9) % 40}%` }} />
                    <div className="h-3 w-16 bg-foreground/8 rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <Building2 size={40} className="text-muted-foreground/20" />
              <p className="text-[14px] text-muted-foreground">{filter === 'all' ? 'No agents deployed yet' : `No ${filter} agents`}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filtered.map(agent => (
                <AgentDesk
                  key={agent.id}
                  agent={agent}
                  onClick={() => router.push(`/app/agent/${agent.id}`)}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(agent.id)}
                  onToggleSelect={() => toggleSelect(agent.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
