'use client'

import { Bell, Sparkles, ChevronDown, Menu, Sun, Moon, HelpCircle, User, Settings, LogOut, ExternalLink, ArrowLeftRight, ChevronRight, Calendar, Home, Bot, Globe, Mail, Database, FileSearch, ShieldCheck, Activity, CheckCircle2, XCircle, Clock, Play, Trash2, Plus } from 'lucide-react'
import { Sidebar } from '@/components/chat/sidebar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/hooks/use-auth'
import { createClient } from '@/lib/supabase/client'
import { useChatStore } from '@/store/chat-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useCallback, useRef, useMemo, memo, lazy, Suspense } from 'react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from 'next-themes'
import type { Agent, Profile } from '@/types/database'
import { useAuthStore } from '@/store/auth-store'
import { SettingsSkeleton } from '@/components/ui/loader'
import type { SettingsSection } from '@/components/chat/settings-dialog'

// Lazy load heavy dialog components
const PricingDialog = lazy(() => import('@/components/pricing-dialog-v2').then(m => ({ default: m.PricingDialog })))
const SettingsDialog = lazy(() => import('@/components/chat/settings-dialog').then(m => ({ default: m.SettingsDialog })))

interface DashboardLayoutProps {
  children: React.ReactNode
  agents: Agent[]
}

export function DashboardLayout({
  children,
  agents,
}: DashboardLayoutProps) {
  const { user, profile, signOut, loading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [pricingOpen, setPricingOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('settings')
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const { agents: storeAgents, agentsHydrated, setAgents, updateAgent: storeUpdateAgent, addAgent: storeAddAgent } = useChatStore()
  const { setProfile } = useAuthStore()
  const { workspaces, activeWorkspace, setActiveWorkspace, setUserRole } = useWorkspaceStore()

  // Generate a deterministic gradient for workspace based on name or id
  const getWorkspaceGradient = (workspaceId: string, name: string) => {
    const gradients = [
      'from-[#D97757] to-[#C86647]',
      'from-[#57554F] to-[#34322D]',
      'from-[#75736F] to-[#57554F]',
      'from-[#9E9C99] to-[#75736F]',
      'from-[#8B6B5F] to-[#6F554B]',
      'from-[#6A5B52] to-[#4F433D]',
      'from-[#A36E59] to-[#7F4E3D]',
      'from-[#5E5B66] to-[#3F3D45]',
    ]
    const seed = (workspaceId + name).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return gradients[seed % gradients.length]
  }

  const switchWorkspace = useCallback(async (workspaceId: string) => {
    const nextWorkspace = workspaces.find(ws => ws.id === workspaceId)
    if (!nextWorkspace) return

    // Reset chat store state when switching workspaces
    useChatStore.getState().reset()
    
    setActiveWorkspace(nextWorkspace)
    const res = await fetch(`/api/teams?workspaceId=${nextWorkspace.id}`)
    if (res.ok) {
      const data = await res.json()
      setUserRole(data.role || null)
      // Patch live credits so the badge shows the correct balance immediately
      const liveCredits = data.workspace?.credits
      if (liveCredits != null) {
        setActiveWorkspace({ ...nextWorkspace, credits: liveCredits })
      }
    }

    const agentsRes = await fetch(`/api/agents?workspaceId=${nextWorkspace.id}`)
    if (agentsRes.ok) {
      const agentsData = await agentsRes.json()
      setAgents(agentsData.agents || [])
    }
    
    // Navigate to /app to ensure manager conversation loads for new workspace
    router.push('/app')
  }, [setActiveWorkspace, setUserRole, setAgents, workspaces, router])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    
    // Initialize store with server-fetched agents (only once on mount)
    if (agents.length > 0 && !agentsHydrated) {
      setAgents(agents)
    }

    return () => {
      window.removeEventListener('resize', checkMobile)
    }
  }, [agents, agentsHydrated, setAgents])

  useEffect(() => {
    // Avoid auth-startup races; only subscribe once auth and workspace have resolved.
    if (loading || !user?.id || !activeWorkspace?.id) return

    const supabase = createClient()

    const agentChannel = supabase
      .channel(`agent-updates-${activeWorkspace.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agents',
          filter: `user_id=eq.${user.id},workspace_id=eq.${activeWorkspace.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            storeAddAgent(payload.new as Agent)
          } else if (payload.eventType === 'UPDATE') {
            storeUpdateAgent(payload.new.id, payload.new as Partial<Agent>)
          } else if (payload.eventType === 'DELETE') {
            useChatStore.getState().deleteAgent(payload.old.id)
          }
        }
      )
      .subscribe()

    // Subscribe to real-time profile updates (credits, plan changes)
    const profileChannel = supabase
      .channel('profile-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as Profile | null
          if (updated) {
            setProfile(updated)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(agentChannel)
      supabase.removeChannel(profileChannel)
    }
  }, [loading, user?.id, activeWorkspace?.id, storeAddAgent, storeUpdateAgent, setProfile])

  // Extract model name from pathname or use a default
  const getAiManagerName = () => {
    if (pathname.includes('/app/agent/')) {
      const agentId = pathname.split('/app/agent/')[1]
      const currentAgent = storeAgents.find(a => a.id === agentId) || agents.find(a => a.id === agentId)
      return currentAgent ? currentAgent.name : 'AI Agent'
    }
    // Use workspace AI name instead of user profile ai_name
    return activeWorkspace?.ai_name || '2Hands'
  }

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const getAgentIcon = (type: string) => {
    switch (type) {
      case 'web-research': return <Globe size={14} />
      case 'email-assistant': return <Mail size={14} />
      case 'data-analyst': return <Database size={14} />
      case 'file-organizer': return <FileSearch size={14} />
      default: return <Bot size={14} />
    }
  }

  // Fetch recent mission events for the notification bell
  const [missionActivityEvents, setMissionActivityEvents] = useState<Array<{ id: string; kind: string; summary: string | null; created_at: string }>>([])
  useEffect(() => {
    if (!activeWorkspace?.id) return
    const fetchMissionEvents = async () => {
      try {
        const res = await fetch('/api/missions/stats')
        if (!res.ok) return
        const data = await res.json()
        if (data.recent_events) setMissionActivityEvents(data.recent_events)
      } catch { /* non-critical */ }
    }
    fetchMissionEvents()
    const interval = setInterval(fetchMissionEvents, 60_000)
    return () => clearInterval(interval)
  }, [activeWorkspace?.id])

  // Derive activity feed from agents + mission events
  const activityFeed = useMemo(() => {
    const events: Array<{
      id: string
      icon: React.ReactNode
      iconColor: string
      title: string
      detail: string
      time: string
      agentId?: string
      category: 'all' | 'updates' | 'messages'
    }> = []

    const timeAgo = (dateStr: string) => {
      const diff = Date.now() - new Date(dateStr).getTime()
      const mins = Math.floor(diff / 60000)
      if (mins < 1) return 'Just now'
      if (mins < 60) return `${mins}m ago`
      const hrs = Math.floor(mins / 60)
      if (hrs < 24) return `${hrs}h ago`
      const days = Math.floor(hrs / 24)
      if (days < 7) return `${days}d ago`
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }

    for (const agent of storeAgents) {
      // Agent creation
      events.push({
        id: `created-${agent.id}`,
        icon: <Plus size={14} />,
        iconColor: 'text-emerald-500',
        title: `${agent.name} created`,
        detail: (agent.config as { description?: string })?.description?.slice(0, 60) || agent.type,
        time: timeAgo(agent.created_at),
        agentId: agent.id,
        category: 'updates',
      })

      // Status-based events
      if (agent.status === 'working' || agent.status === 'initializing') {
        events.push({
          id: `working-${agent.id}`,
          icon: <Play size={14} strokeWidth={1.5} />,
          iconColor: 'text-primary',
          title: `${agent.name} is running`,
          detail: agent.status === 'initializing' ? 'Starting up...' : 'Executing task',
          time: agent.last_run_at ? timeAgo(agent.last_run_at) : timeAgo(agent.last_active),
          agentId: agent.id,
          category: 'updates',
        })
      } else if (agent.status === 'completed' && agent.last_run_at) {
        events.push({
          id: `completed-${agent.id}`,
          icon: <CheckCircle2 size={14} strokeWidth={1.5} />,
          iconColor: 'text-[#10b981]',
          title: `${agent.name} completed`,
          detail: `Used ${agent.total_credits_used || 0} credits`,
          time: timeAgo(agent.last_run_at),
          agentId: agent.id,
          category: 'updates',
        })
      } else if (agent.status === 'failed' && agent.last_run_at) {
        events.push({
          id: `failed-${agent.id}`,
          icon: <XCircle size={14} strokeWidth={1.5} />,
          iconColor: 'text-[#ef4444]',
          title: `${agent.name} failed`,
          detail: 'Check agent for details',
          time: timeAgo(agent.last_run_at),
          agentId: agent.id,
          category: 'updates',
        })
      }

      // Scheduled agent next run
      if (agent.schedule_type === 'scheduled' && agent.next_run_at) {
        const nextRun = new Date(agent.next_run_at)
        if (nextRun > new Date()) {
          events.push({
            id: `scheduled-${agent.id}`,
            icon: <Clock size={14} strokeWidth={1.5} />,
            iconColor: 'text-[#f59e0b]',
            title: `${agent.name} scheduled`,
            detail: `Next run: ${nextRun.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
            time: timeAgo(agent.last_active),
            agentId: agent.id,
            category: 'updates',
          })
        }
      }
    }

    // Add mission events to the feed
    for (const mEvt of missionActivityEvents) {
      const iconMap: Record<string, { icon: React.ReactNode; color: string; title: string }> = {
        tick_completed: { icon: <Activity size={14} />, color: 'text-emerald-500', title: 'Mission tick completed' },
        agent_delegated: { icon: <Bot size={14} />, color: 'text-purple-500', title: 'Agent spawned' },
        agent_completed: { icon: <CheckCircle2 size={14} strokeWidth={1.5} />, color: 'text-emerald-500', title: 'Agent findings ready' },
        milestone_reached: { icon: <Sparkles size={14} />, color: 'text-amber-500', title: 'Milestone reached' },
        mission_completed: { icon: <CheckCircle2 size={14} strokeWidth={1.5} />, color: 'text-emerald-500', title: 'Mission completed' },
        tick_failed: { icon: <XCircle size={14} strokeWidth={1.5} />, color: 'text-red-500', title: 'Mission tick failed' },
      }
      const cfg = iconMap[mEvt.kind]
      if (!cfg) continue
      events.push({
        id: `mission-${mEvt.id}`,
        icon: cfg.icon,
        iconColor: cfg.color,
        title: cfg.title,
        detail: mEvt.summary?.slice(0, 80) || mEvt.kind.replace(/_/g, ' '),
        time: timeAgo(mEvt.created_at),
        category: 'updates',
      })
    }

    // Sort by most recent (parse time strings - "Just now" first, then by m/h/d)
    events.sort((a, b) => {
      const order = (t: string) => {
        if (t === 'Just now') return 0
        const m = t.match(/^(\d+)(m|h|d)/)
        if (!m) return 99999
        const val = parseInt(m[1])
        if (m[2] === 'm') return val
        if (m[2] === 'h') return val * 60
        return val * 1440
      }
      return order(a.time) - order(b.time)
    })

    return events
  }, [storeAgents, missionActivityEvents])

  return (
    <div className="flex h-screen overflow-hidden bg-background transition-theme">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobile && isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <Sidebar 
        agents={agents} 
        collapsed={isMobile ? !isSidebarOpen : undefined}
        onToggle={isMobile ? () => setIsSidebarOpen(!isSidebarOpen) : undefined}
      />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-[52px] flex items-center justify-between px-3 sm:px-6 bg-transparent shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden w-11 h-11 -ml-2 flex items-center justify-center hover:bg-foreground/5 rounded-lg transition-colors"
              aria-label="Open menu"
            >
              <svg width="20" height="10" viewBox="0 0 20 10" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-foreground">
                <rect width="20" height="2" rx="1" fill="currentColor"/>
                <rect y="8" width="14" height="2" rx="1" fill="currentColor"/>
              </svg>
            </button>
            {/* Workspace Switcher Dropdown */}
            {mounted && (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1.5 px-2 py-1.5 rounded-full hover:bg-foreground/5 transition-all group active:scale-95 focus:outline-none max-w-[200px] sm:max-w-[280px]">
                    {activeWorkspace && (
                      <div className={cn('w-5 h-5 rounded-md bg-gradient-to-br shrink-0', getWorkspaceGradient(activeWorkspace.id, activeWorkspace.name))} />
                    )}
                    <span className="text-[14px] font-medium text-foreground truncate">
                      {activeWorkspace?.name ?? 'Select workspace'}
                    </span>
                    <ChevronDown size={14} className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" sideOffset={8} className="w-[220px] p-1.5 overflow-hidden border border-border shadow-xl rounded-[18px] bg-popover/95 backdrop-blur-xl outline-none">
                  <div className="space-y-0.5">
                    <p className="px-2.5 py-1 text-[10px] font-bold text-muted-foreground/40 uppercase tracking-[0.1em]">Workspaces</p>
                    {workspaces.map((ws) => {
                      const isActive = activeWorkspace?.id === ws.id
                      return (
                        <button
                          key={ws.id}
                          onClick={() => switchWorkspace(ws.id)}
                          className={cn(
                            'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left transition-all duration-200',
                            isActive
                              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                              : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                          )}
                        >
                          <div className={cn('w-6 h-6 rounded-lg bg-gradient-to-br shrink-0', getWorkspaceGradient(ws.id, ws.name))} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold">{ws.name}</p>
                          </div>
                          {isActive && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                        </button>
                      )
                    })}
                    <div className="mx-2 my-1.5 border-t border-border/30" />
                    <button
                      onClick={() => { setSettingsSection('team'); setSettingsOpen(true) }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200 text-left"
                    >
                      <Settings size={13} className="shrink-0" />
                      <p className="text-[13px] font-medium">Workspace settings</p>
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Theme toggle */}
            <button 
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className="flex w-10 h-10 items-center justify-center rounded-full bg-transparent hover:bg-foreground/5 transition-all duration-300 active:scale-95 group focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Toggle theme"
            >
              <AnimatePresence mode="wait" initial={false}>
                {mounted && (resolvedTheme === 'dark' ? (
                  <motion.div
                    key="sun"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Sun size={18} className="text-foreground/80 group-hover:text-foreground transition-colors" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="moon"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Moon size={18} className="text-foreground/80 group-hover:text-foreground transition-colors" />
                  </motion.div>
                ))}
              </AnimatePresence>
            </button>

            {/* Bell Icon (Notifications) - hidden on mobile */}
            {mounted && (
              <Popover>
                <PopoverTrigger asChild>
                <button 
                  className="hidden sm:flex w-10 h-10 items-center justify-center rounded-full bg-transparent hover:bg-foreground/5 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="View notifications"
                >
                  <Bell size={18} className="text-foreground/80" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[400px] p-0 overflow-hidden border border-border rounded-[28px] bg-popover shadow-[0_40px_100px_-20px_rgba(0,0,0,0.25)]">
                <div className="p-4 pb-2">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-[15px] font-semibold text-foreground">Activity</h2>
                    {activityFeed.some(e => e.iconColor === 'text-primary') && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-[11px] font-semibold uppercase tracking-[0.05em] text-primary">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        Live
                      </span>
                    )}
                  </div>
                </div>
                <div className="max-h-[380px] overflow-y-auto px-2 pb-3">
                  {activityFeed.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4">
                      <Activity size={36} className="text-muted-foreground/20 mb-3" />
                      <p className="text-[14px] text-muted-foreground font-medium">No activity yet</p>
                      <p className="text-[12px] text-muted-foreground/60 mt-1">Create an agent to see activity here</p>
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {activityFeed.slice(0, 20).map((event) => (
                        <Link
                          key={event.id}
                          href={event.agentId ? `/app/agent/${event.agentId}` : '/app'}
                          className="flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-foreground/[0.03] dark:hover:bg-white/[0.03] transition-colors group"
                        >
                          <div className={cn("mt-0.5 shrink-0", event.iconColor)}>
                            {event.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-foreground truncate">{event.title}</p>
                            <p className="text-[12px] text-muted-foreground/70 truncate mt-0.5">{event.detail}</p>
                          </div>
                          <span className="text-[11px] text-muted-foreground/50 shrink-0 tabular-nums mt-0.5">{event.time}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </PopoverContent>
              </Popover>
            )}

            {/* Credits Badge - Workspace Scoped */}
            {mounted && activeWorkspace && (
              <button 
                onClick={() => setPricingOpen(true)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-card border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:bg-muted active:scale-95 transition-all"
              >
                <div className="flex items-center gap-1">
                  <Sparkles size={12} className="text-muted-foreground" />
                  <span className="text-[13px] font-semibold text-foreground tabular-nums">
                    {activeWorkspace.credits != null ? activeWorkspace.credits.toLocaleString() : '—'}
                  </span>
                </div>
                {(!activeWorkspace.plan || activeWorkspace.plan === 'free' || activeWorkspace.plan === 'team') && (
                  <>
                    <div className="w-px h-3.5 bg-border" />
                    <span className="text-[12px] font-semibold text-primary">Upgrade</span>
                  </>
                )}
              </button>
            )}

            {/* User Avatar - hidden on mobile */}
            {mounted && !isMobile && (
              <Popover open={userMenuOpen} onOpenChange={setUserMenuOpen}>
              <PopoverTrigger asChild>
                <button 
                  className="relative outline-hidden rounded-full hover:bg-foreground/5 transition-colors p-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="User menu"
                >
                  <Avatar className="h-9 w-9 cursor-pointer">
                    <AvatarImage src={profile?.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-[14px] font-medium">
                      {getInitials(profile?.full_name || user?.email)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[280px] p-0 overflow-hidden border border-border rounded-[28px] bg-popover shadow-[0_40px_100px_-20px_rgba(0,0,0,0.25)]">
                <div className="bg-popover">
                  {/* User Profile Info */}
                  <div className="p-3 flex items-center gap-2.5">
                    <Avatar className="h-9 w-9 border border-border shadow-sm">
                      <AvatarImage src={profile?.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-[14px] font-medium">
                        {getInitials(profile?.full_name || user?.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-[14px] font-semibold text-foreground truncate">
                          {profile?.full_name || 'User'}
                        </p>
                      </div>
                      <p className="text-[12px] text-muted-foreground truncate">
                        {user?.email}
                      </p>
                    </div>
                  </div>

                  <Separator className="bg-border" />

                  {/* Plan & Credits - Workspace Scoped */}
                  <div className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[15px] font-bold text-foreground capitalize">
                        {activeWorkspace?.plan || 'Team'} Plan
                      </span>
                      <button 
                        onClick={() => setPricingOpen(true)}
                        className="px-4 py-1.5 bg-primary text-primary-foreground rounded-full text-[13px] font-semibold hover:opacity-90 transition-opacity"
                      >
                        {(!activeWorkspace?.plan || activeWorkspace?.plan === 'free' || activeWorkspace?.plan === 'team') ? 'Upgrade' : 'Manage'}
                      </button>
                    </div>
                    
                    <button 
                      onClick={() => setPricingOpen(true)}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl border border-border bg-[#F5F3F0]/50 dark:bg-[#2C2B27] hover:bg-[#F5F3F0] dark:hover:bg-[#3A3833] transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles size={14} className="text-foreground/80" />
                        <span className="text-[13px] text-muted-foreground">Credits</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-foreground">
                          {activeWorkspace?.credits?.toLocaleString() || '0'}
                        </span>
                        <ChevronRight size={14} className="text-muted-foreground" />
                      </div>
                    </button>
                  </div>

                  <Separator className="bg-border" />

                  {/* Workspace Switcher */}
                  <div className="p-2.5">
                    <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em] mb-2">Workspaces</p>
                    <div className="space-y-2">
                      <Select
                        value={activeWorkspace?.id || ''}
                        onValueChange={(value) => switchWorkspace(value)}
                      >
                        <SelectTrigger className="w-full h-10 rounded-xl border-border bg-[#F5F3F0]/70 dark:bg-[#2C2B27] text-[13px] text-foreground focus:ring-0 focus:ring-offset-0 [&>span]:flex [&>span]:items-center [&>span]:gap-2">
                          <SelectValue placeholder="Select workspace">
                            {activeWorkspace && (
                              <>
                                <div className={cn(
                                  "w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold text-white bg-gradient-to-br shrink-0",
                                  getWorkspaceGradient(activeWorkspace.id, activeWorkspace.name)
                                )}>
                                  {activeWorkspace.name.charAt(0).toUpperCase()}
                                </div>
                                <span className="truncate">{activeWorkspace.name}</span>
                              </>
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-border shadow-xl min-w-[220px]" align="start" sideOffset={4}>
                          {workspaces.map((ws) => (
                            <SelectItem
                              key={ws.id}
                              value={ws.id}
                              className="rounded-lg text-[13px] py-2 pl-8 pr-2 cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <div className={cn(
                                  "w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold text-white bg-gradient-to-br shrink-0",
                                  getWorkspaceGradient(ws.id, ws.name)
                                )}>
                                  {ws.name.charAt(0).toUpperCase()}
                                </div>
                                <span className="truncate">{ws.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">{workspaces.length} workspaces</p>
                    </div>
                    <button
                      onClick={() => {
                        setSettingsSection('team')
                        setSettingsOpen(true)
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 mt-1 rounded-xl text-[13px] text-muted-foreground hover:text-foreground hover:bg-[#F5F3F0] dark:hover:bg-[#3A3833] transition-colors"
                    >
                      <Settings size={13} />
                      Manage workspaces
                    </button>
                    <button
                      onClick={() => {
                        try { localStorage.setItem('2hands_create_workspace_intent', '1') } catch {}
                        setSettingsSection('team')
                        setSettingsOpen(true)
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 mt-1 rounded-xl text-[13px] text-muted-foreground hover:text-foreground hover:bg-[#F5F3F0] dark:hover:bg-[#3A3833] transition-colors"
                    >
                      <Plus size={13} />
                      Create workspace
                    </button>
                  </div>

                  <Separator className="bg-border" />

                  {/* Menu Items */}
                  <div className="p-1.5">
                    {profile?.stripe_customer_id && (
                      <button 
                        onClick={async () => {
                          const res = await fetch('/api/stripe/portal', { method: 'POST' });
                          const data = await res.json();
                          if (data.url) window.location.href = data.url;
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[14px] text-muted-foreground hover:bg-[#F5F3F0] dark:hover:bg-[#3A3833] hover:text-[#34322D] dark:hover:text-[#F5F3F0] transition-colors group"
                      >
                        <ShieldCheck size={16} className="text-muted-foreground group-hover:text-[#34322D] dark:group-hover:text-[#F5F3F0]" />
                        Billing & Subscription
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        setSettingsSection('account')
                        setSettingsOpen(true)
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[14px] text-muted-foreground hover:bg-[#F5F3F0] dark:hover:bg-[#3A3833] hover:text-[#34322D] dark:hover:text-[#F5F3F0] transition-colors group"
                    >
                      <User size={16} className="text-muted-foreground group-hover:text-[#34322D] dark:group-hover:text-[#F5F3F0]" />
                      Account
                    </button>
                    <button 
                      onClick={() => {
                        setSettingsSection('settings')
                        setSettingsOpen(true)
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[14px] text-muted-foreground hover:bg-[#F5F3F0] dark:hover:bg-[#3A3833] hover:text-[#34322D] dark:hover:text-[#F5F3F0] transition-colors group"
                    >
                      <Settings size={16} className="text-muted-foreground group-hover:text-[#34322D] dark:group-hover:text-[#F5F3F0]" />
                      Settings
                    </button>
                  </div>

                  <Separator className="bg-border" />

                  {/* External Links */}
                  <div className="p-1.5">
                    <a 
                      href="https://docs.2hands.ai" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-[14px] text-muted-foreground hover:bg-[#F5F3F0] dark:hover:bg-[#3A3833] hover:text-[#34322D] dark:hover:text-[#F5F3F0] transition-colors group"
                    >
                      <div className="flex items-center gap-2.5">
                        <HelpCircle size={16} className="text-muted-foreground group-hover:text-[#34322D] dark:group-hover:text-[#F5F3F0]" />
                        Get help
                      </div>
                      <ExternalLink size={13} className="text-muted-foreground" />
                    </a>
                  </div>

                  <Separator className="bg-border" />

                  {/* Logout */}
                  <div className="p-1.5">
                    <button 
                      onClick={async () => {
                        // Close popover first
                        setUserMenuOpen(false)
                        
                        // Small delay to let popover close animation complete
                        await new Promise(resolve => setTimeout(resolve, 100))
                        
                        try {
                          console.log('[Dashboard] Signing out...')
                          await signOut()
                          console.log('[Dashboard] Sign out successful')
                        } catch (error) {
                          console.error('[Dashboard] Sign out error:', error)
                          // Clear stores manually as fallback
                          useAuthStore.getState().setUser(null)
                          useAuthStore.getState().setProfile(null)
                          useWorkspaceStore.getState().reset()
                        } finally {
                          // Always redirect to sign-in
                          router.push('/sign-in')
                        }
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[14px] text-[#ef4444] hover:bg-[#ef4444]/5 transition-colors group"
                    >
                      <LogOut size={16} className="text-[#ef4444]" />
                      Sign out
                    </button>
                  </div>
                </div>
              </PopoverContent>
              </Popover>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-auto relative min-w-0">
          {children}
        </div>
      </main>

      {/* Lazy-loaded Dialogs - only render when open */}
      {pricingOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />}>
          <PricingDialog open={pricingOpen} onOpenChange={setPricingOpen} />
        </Suspense>
      )}
      
      {settingsOpen && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-3xl bg-card rounded-2xl border border-border p-6 shadow-2xl">
              <SettingsSkeleton />
            </div>
          </div>
        }>
          <SettingsDialog 
            open={settingsOpen} 
            onOpenChange={setSettingsOpen} 
            initialSection={settingsSection}
            onUpgrade={() => setPricingOpen(true)}
          />
        </Suspense>
      )}
    </div>
  )
}
