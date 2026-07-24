'use client'

import { useState, useEffect, lazy, Suspense, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronRight,
  Settings2,
  Bookmark,
  QrCode,
  Bot,
  User,
  Bell,
  Building2,
  BarChart3,
  Target,
  CheckCheck,
  Play,
  Clock,
  Activity,
  Search,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useChatStore } from '@/store/chat-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { SettingsSkeleton } from '@/components/ui/loader'
import { HoverScale } from '@/components/animations'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const SettingsDialog = lazy(() => import('./settings-dialog').then(m => ({ default: m.SettingsDialog })))
const ReferralDialog = lazy(() => import('./referral-dialog').then(m => ({ default: m.ReferralDialog })))

interface NowCounts {
  activeMissions: number
  runningAgents: number
  pendingApprovals: number
}

const NAV_ITEMS = [
  { href: '/app', label: 'Manager', icon: User, exact: true },
  { href: '/app/mission', label: 'Missions', icon: Target, exact: false },
  { href: '/app/activity', label: 'Activity', icon: Activity, exact: false },
  { href: '/app/office', label: 'Office', icon: Building2, exact: false },
  { href: '/app/analytics', label: 'Analytics', icon: BarChart3, exact: false },
  { href: '/app/approvals', label: 'Approvals', icon: CheckCheck, exact: false, badge: true as const },
] as const

interface SidebarProps {
  agents?: unknown[]
  collapsed?: boolean
  onToggle?: () => void
}

export function Sidebar({ collapsed: controlledCollapsed, onToggle }: SidebarProps) {
  const { agents: storeAgents } = useChatStore()
  const [internalCollapsed, setInternalCollapsed] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [isLogoHovered, setIsLogoHovered] = useState(false)
  const pathname = usePathname()

  const collapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed
  const setCollapsed = onToggle || setInternalCollapsed

  const SIDEBAR_WIDTH = 260
  const MINI_SIDEBAR_WIDTH = 60

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024
      setIsMobile(mobile)
      if (mobile && controlledCollapsed === undefined) setInternalCollapsed(true)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [controlledCollapsed])

  const { activeWorkspace } = useWorkspaceStore()
  const aiName = activeWorkspace?.ai_name || '2Hands'
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isMobilePopupOpen, setIsMobilePopupOpen] = useState(false)
  const [isReferralOpen, setIsReferralOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [nowCounts, setNowCounts] = useState<NowCounts>({ activeMissions: 0, runningAgents: 0, pendingApprovals: 0 })
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const running = storeAgents.filter(a => a.status === 'working' || a.status === 'initializing').length
    setNowCounts(prev => ({ ...prev, runningAgents: running }))
  }, [storeAgents])

  const fetchNowCounts = useCallback(async () => {
    try {
      const [missionsRes, approvalsRes] = await Promise.allSettled([
        fetch('/api/missions?status=active'),
        fetch('/api/approvals?status=pending'),
      ])
      if (missionsRes.status === 'fulfilled' && missionsRes.value.ok) {
        const data = await missionsRes.value.json()
        setNowCounts(prev => ({ ...prev, activeMissions: data.missions?.length ?? 0 }))
      }
      if (approvalsRes.status === 'fulfilled' && approvalsRes.value.ok) {
        const data = await approvalsRes.value.json()
        setNowCounts(prev => ({ ...prev, pendingApprovals: data.total ?? data.approvals?.length ?? 0 }))
      }
    } catch {}
  }, [])

  useEffect(() => {
    fetchNowCounts()
    const interval = setInterval(fetchNowCounts, 30_000)
    return () => clearInterval(interval)
  }, [fetchNowCounts])

  const isNavActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  return (
    <motion.aside
      initial={false}
      animate={{ 
        width: isMobile ? (collapsed ? 0 : '100vw') : (collapsed ? MINI_SIDEBAR_WIDTH : SIDEBAR_WIDTH),
        x: isMobile && collapsed ? '-100vw' : 0
      }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      data-testid="sidebar"
      className={cn(
        "flex flex-col h-full bg-background border-r border-border text-foreground overflow-hidden relative z-50 transition-theme",
        isMobile && "fixed inset-0 shadow-none",
        collapsed && !isMobile && "items-center"
      )}
    >
      <div className="lg:hidden flex flex-col h-full">
        <div className="flex items-center justify-between px-5 py-3 pt-[calc(env(safe-area-inset-top)+12px)]">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-10 h-10 flex items-center justify-center"
            aria-label="Account"
          >
            <User size={22} className="text-foreground" />
          </button>
          <div className="text-[20px] font-semibold text-foreground tracking-[0.02em]">{aiName}</div>
          <div className="flex items-center">
            <button className="w-10 h-10 flex items-center justify-center" aria-label="Search conversations" type="button" onClick={() => { if (typeof window !== 'undefined') (window as any).__openSearch?.() }}>
              <Search size={20} className="text-foreground" />
            </button>
            <button className="w-10 h-10 flex items-center justify-center" aria-label="Notifications" type="button">
              <Bell size={22} className="text-foreground" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 pt-3 pb-24 space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = isNavActive(item.href, item.exact)
              const Icon = item.icon
              const badge = item.label === 'Missions' ? nowCounts.activeMissions
                : ('badge' in item && item.badge ? nowCounts.pendingApprovals : 0)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => { if (isMobile && onToggle) onToggle() }}
                  className={cn(
                    "w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-left transition-colors",
                    active
                      ? "bg-[#E5E3E0] dark:bg-[#57554F] text-foreground"
                      : "text-muted-foreground hover:bg-[#F5F3F0] dark:hover:bg-[#3A3833] hover:text-foreground"
                  )}
                >
                  <Icon size={20} strokeWidth={1.75} className="shrink-0" />
                  <span className="flex-1 text-[15px] font-semibold">{item.label === 'Manager' ? aiName : item.label}</span>
                  {badge > 0 && (
                    <span className={cn(
                      "min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center",
                      item.label === 'Missions'
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-primary text-primary-foreground"
                    )}>
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* Header - Logo Only */}
      <div 
        className="hidden lg:flex items-center h-[60px] w-full relative"
        onMouseEnter={() => setIsLogoHovered(true)}
        onMouseLeave={() => setIsLogoHovered(false)}
      >
        <AnimatePresence mode="wait">
          {collapsed && isLogoHovered && !isMobile ? (
            <motion.button
              key="toggle-collapsed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setCollapsed(!collapsed)}
              className="w-full h-full flex items-center justify-center"
            >
              <div className="w-10 h-10 rounded-full bg-transparent hover:bg-sidebar-accent transition-colors flex items-center justify-center text-foreground/80 z-20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                title="Expand sidebar"
                role="button"
                aria-label="Expand sidebar"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="0.75">
                  <path d="M19.25 7A2.25 2.25 0 0 0 17 4.75H7A2.25 2.25 0 0 0 4.75 7v10A2.25 2.25 0 0 0 7 19.25h10A2.25 2.25 0 0 0 19.25 17zm1.5 10A3.75 3.75 0 0 1 17 20.75H7A3.75 3.75 0 0 1 3.25 17V7A3.75 3.75 0 0 1 7 3.25h10A3.75 3.75 0 0 1 20.75 7z"/>
                  <path d="M12 7.25a.75.75 0 0 1 .75.75v8a.75.75 0 0 1-.75.75H8a.75.75 0 0 1-.75-.75V8A.75.75 0 0 1 8 7.25z"/>
                </svg>
              </div>
            </motion.button>
          ) : (
            <motion.div
              key={collapsed ? "logo-mini" : "logo-full"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "flex items-center transition-all duration-300",
                !collapsed ? "w-full justify-between px-4" : "justify-center w-full h-full"
              )}
            >
              <Link href="/app" className={collapsed ? "flex items-center justify-center" : "flex items-center gap-2"}>
                {/* Light mode */}
                <svg viewBox="0 0 104 70" className="block dark:hidden w-7 h-7" xmlns="http://www.w3.org/2000/svg">
                  <rect x="15" y="17" width="8" height="35" rx="4" fill="#D97757"/>
                  <rect x="27" y="12" width="8" height="35" rx="4" fill="#D97757"/>
                  <rect x="39" y="17" width="8" height="35" rx="4" fill="#D97757"/>
                  <rect x="57" y="17" width="8" height="35" rx="4" fill="#D97757"/>
                  <rect x="69" y="12" width="8" height="35" rx="4" fill="#D97757"/>
                  <rect x="81" y="17" width="8" height="35" rx="4" fill="#D97757"/>
                </svg>
                {/* Dark mode */}
                <svg viewBox="0 0 104 70" className="hidden dark:block w-7 h-7" xmlns="http://www.w3.org/2000/svg">
                  <rect x="15" y="17" width="8" height="35" rx="4" fill="#D97757"/>
                  <rect x="27" y="12" width="8" height="35" rx="4" fill="#D97757"/>
                  <rect x="39" y="17" width="8" height="35" rx="4" fill="#D97757"/>
                  <rect x="57" y="17" width="8" height="35" rx="4" fill="#D97757"/>
                  <rect x="69" y="12" width="8" height="35" rx="4" fill="#D97757"/>
                  <rect x="81" y="17" width="8" height="35" rx="4" fill="#D97757"/>
                </svg>
                {!collapsed && (
                  <span className="text-[15px] font-semibold">{aiName}</span>
                )}
              </Link>
              {!collapsed && (
                <button
                  onClick={() => setCollapsed(!collapsed)}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-transparent hover:bg-sidebar-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  title="Collapse sidebar"
                  type="button"
                  aria-label="Hide sidebar"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="0.75" className="text-foreground/80">
                    <path d="M19.25 7A2.25 2.25 0 0 0 17 4.75H7A2.25 2.25 0 0 0 4.75 7v10A2.25 2.25 0 0 0 7 19.25h10A2.25 2.25 0 0 0 19.25 17zm-12 9V8a.75.75 0 0 1 1.5 0v8a.75.75 0 0 1-1.5 0m13.5 1A3.75 3.75 0 0 1 17 20.75H7A3.75 3.75 0 0 1 3.25 17V7A3.75 3.75 0 0 1 7 3.25h10A3.75 3.75 0 0 1 20.75 7z"/>
                  </svg>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Desktop Primary Navigation */}
      <div className={cn("hidden lg:flex lg:flex-1 lg:flex-col min-h-0 overflow-y-auto")}>
        <TooltipProvider delayDuration={80}>
          <div className={cn("px-3 py-2 space-y-0.5", collapsed && "px-2")}>
            {NAV_ITEMS.map((item) => {
              const active = isNavActive(item.href, item.exact)
              const Icon = item.icon
              const badge = item.label === 'Missions' ? nowCounts.activeMissions
                : ('badge' in item && item.badge ? nowCounts.pendingApprovals : 0)
              const label = item.label === 'Manager' ? aiName : item.label
              const linkEl = (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center transition-all duration-200 group",
                    collapsed ? "justify-center p-2.5 rounded-xl" : "gap-3 px-2.5 py-2 rounded-xl",
                    active
                      ? "bg-[#E5E3E0] dark:bg-[#57554F] text-foreground"
                      : "text-muted-foreground hover:bg-[#F5F3F0] dark:hover:bg-[#3A3833] hover:text-foreground"
                  )}
                >
                  <div className="relative shrink-0">
                    <Icon size={16} strokeWidth={1.75} />
                    {badge > 0 && collapsed && (
                      <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                        {badge > 9 ? '9+' : badge}
                      </span>
                    )}
                  </div>
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-[13.5px] font-medium">
                        {label}
                      </span>
                      {badge > 0 && (
                        <span className={cn(
                          "min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center",
                          item.label === 'Missions'
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-primary text-primary-foreground"
                        )}>
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              )
              if (collapsed) {
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
                    <TooltipContent
                      side="right"
                      sideOffset={12}
                      showArrow={false}
                      className="bg-card/95 backdrop-blur-md text-foreground border border-border/60 shadow-lg shadow-black/[0.08] dark:shadow-black/30 rounded-xl px-3.5 py-2 text-[13px] font-medium tracking-[-0.01em] data-[side=right]:slide-in-from-left-3"
                    >
                      {label}
                    </TooltipContent>
                  </Tooltip>
                )
              }
              return linkEl
            })}
          </div>
        </TooltipProvider>

        {!collapsed && mounted && (
          <div className="mx-3 mt-4 mb-2 px-2.5 py-3 rounded-xl bg-[#F5F3F0]/60 dark:bg-[#2C2B27]/60 border border-border/50">
            <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-[0.1em] mb-2.5">Now</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Target size={12} className="text-primary shrink-0" />
                <span className="text-[12px] text-muted-foreground flex-1">Active missions</span>
                <span className="text-[12px] font-semibold text-foreground tabular-nums">{nowCounts.activeMissions}</span>
              </div>
              <div className="flex items-center gap-2">
                <Play size={12} className={cn("shrink-0", nowCounts.runningAgents > 0 ? "text-primary" : "text-muted-foreground/50")} />
                <span className="text-[12px] text-muted-foreground flex-1">Running agents</span>
                <span className={cn("text-[12px] font-semibold tabular-nums", nowCounts.runningAgents > 0 ? "text-primary" : "text-foreground")}>{nowCounts.runningAgents}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={12} className={cn("shrink-0", nowCounts.pendingApprovals > 0 ? "text-amber-500" : "text-muted-foreground/50")} />
                <span className="text-[12px] text-muted-foreground flex-1">Pending approvals</span>
                <span className={cn("text-[12px] font-semibold tabular-nums", nowCounts.pendingApprovals > 0 ? "text-amber-500" : "text-foreground")}>{nowCounts.pendingApprovals}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className={cn("hidden lg:block p-3 space-y-3", collapsed && "p-2 items-center")}>
        {!collapsed && (
          <button
            onClick={() => setIsReferralOpen(true)}
            className="w-full px-3 py-3 bg-card rounded-xl border border-border text-left group transition-all hover:border-foreground/10 flex items-center gap-4"
          >
            <svg viewBox="0 0 104 70" className="block dark:hidden w-6 h-6 shrink-0 rounded bg-muted border border-border p-1 opacity-80" xmlns="http://www.w3.org/2000/svg">
              <rect x="15" y="17" width="8" height="35" rx="4" fill="#D97757"/>
              <rect x="27" y="12" width="8" height="35" rx="4" fill="#D97757"/>
              <rect x="39" y="17" width="8" height="35" rx="4" fill="#D97757"/>
              <rect x="57" y="17" width="8" height="35" rx="4" fill="#D97757"/>
              <rect x="69" y="12" width="8" height="35" rx="4" fill="#D97757"/>
              <rect x="81" y="17" width="8" height="35" rx="4" fill="#D97757"/>
            </svg>
            <svg viewBox="0 0 104 70" className="hidden dark:block w-6 h-6 shrink-0 rounded bg-muted border border-border p-1 opacity-80" xmlns="http://www.w3.org/2000/svg">
              <rect x="15" y="17" width="8" height="35" rx="4" fill="#D97757"/>
              <rect x="27" y="12" width="8" height="35" rx="4" fill="#D97757"/>
              <rect x="39" y="17" width="8" height="35" rx="4" fill="#D97757"/>
              <rect x="57" y="17" width="8" height="35" rx="4" fill="#D97757"/>
              <rect x="69" y="12" width="8" height="35" rx="4" fill="#D97757"/>
              <rect x="81" y="17" width="8" height="35" rx="4" fill="#D97757"/>
            </svg>
            <div className="flex-1 min-w-0">
              <span className="text-[13px] font-semibold text-foreground block">Share 2Hands</span>
              <span className="text-[11px] text-muted-foreground">Get 500 credits each</span>
            </div>
            <ChevronRight size={14} className="text-muted-foreground group-hover:translate-x-0.5 transition-transform shrink-0" />
          </button>
        )}

        <div className={cn(
          "flex border-t border-border pt-2",
          collapsed ? "flex-col items-center gap-4" : "items-center justify-between px-2"
        )}>
          <div className={cn("flex items-center", collapsed ? "flex-col gap-4" : "gap-4")}>
            <HoverScale>
              <button
                onClick={() => setIsSettingsOpen(true)}
                data-testid="settings-button"
                className="flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
                aria-label="Open settings"
              >
                <Settings2 size={18} className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
              </button>
            </HoverScale>

            <div className="relative">
              <HoverScale>
                <button
                  onClick={() => setIsMobilePopupOpen(!isMobilePopupOpen)}
                  className="flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
                  aria-label="Download mobile app"
                  aria-expanded={isMobilePopupOpen}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                    <rect x="7" y="2" width="10" height="20" rx="2" ry="2"></rect>
                    <path d="M12 18h.01"></path>
                  </svg>
                </button>
              </HoverScale>

              <AnimatePresence>
                {isMobilePopupOpen && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-[60]"
                      onClick={() => setIsMobilePopupOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 10 }}
                      className={cn(
                        "absolute z-[70] bg-card p-4 rounded-2xl shadow-2xl border border-border w-48",
                        collapsed ? "left-full ml-4 bottom-0" : "bottom-full mb-4 left-0"
                      )}
                    >
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-32 h-32 bg-sidebar rounded-xl flex items-center justify-center border border-border">
                          <QrCode size={80} className="text-foreground/80" />
                        </div>
                        <p className="text-[11px] font-medium text-center text-muted-foreground">Scan to download the 2Hands mobile app</p>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
          <HoverScale>
            <button
              className="flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
              aria-label="Bookmarks"
            >
              <Bookmark size={18} className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
            </button>
          </HoverScale>
        </div>
      </div>
      {/* Lazy-loaded dialogs - only render when open */}
      {isSettingsOpen && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-3xl bg-card rounded-2xl border border-border p-6 shadow-2xl">
              <SettingsSkeleton />
            </div>
          </div>
        }>
          <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
        </Suspense>
      )}
      {isReferralOpen && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-card rounded-2xl border border-border p-6 shadow-2xl">
              <div className="space-y-4">
                <div className="h-6 w-40 bg-foreground/10 rounded animate-pulse" />
                <div className="h-4 w-full bg-foreground/5 rounded animate-pulse" />
                <div className="h-32 w-full bg-foreground/5 rounded-xl animate-pulse" />
              </div>
            </div>
          </div>
        }>
          <ReferralDialog open={isReferralOpen} onOpenChange={setIsReferralOpen} />
        </Suspense>
      )}
    </motion.aside>
  )
}
