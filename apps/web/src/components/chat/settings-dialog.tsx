'use client'

import * as React from 'react'
import { 
  Settings2, 
  User, 
  Users,
  X,
  Mail,
  Activity,
  Calendar,
  Database,
  Globe,
  Zap,
  HelpCircle,
  ExternalLink,
  Check,
  Loader2,
  Sparkles,
  Bot,
  FileSearch,
  Clock,
  Pause,
  Play,
  Trash2,
  Key,
  Shield,
  AlertTriangle,
  Download,
  Camera,
  Edit3,
  Save,
  Palette,
  LayoutGrid,
  LogOut,
  Moon,
  Sun,
  Monitor,
  Bell,
  ChevronRight,
  ChevronLeft,
  Gift,
  Plus,
  CheckCircle,
  Puzzle,
  Webhook,
  Target
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { motion, AnimatePresence } from 'framer-motion'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { PRICING, type SubscriptionPlanType } from '@/lib/stripe/config'

// Lazy-load settings page components
const TeamSettings = React.lazy(() => import('@/app/(dashboard)/settings/team/page'))
const IntegrationsSettings = React.lazy(() => import('@/app/(dashboard)/settings/integrations/page'))
const ApiKeysSettings = React.lazy(() => import('@/app/(dashboard)/settings/api-keys/page'))
const WebhooksSettings = React.lazy(() => import('@/app/(dashboard)/settings/webhooks/page'))
// const AuditLogSettings = React.lazy(() => import('@/app/(dashboard)/settings/audit-log/page')) // Hidden for now
// Missions removed from settings — accessible via /app/mission sidebar nav

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialSection?: SettingsSection
  onUpgrade?: () => void
}

export type SettingsSection = 'account' | 'settings' | 'usage' | 'credentials' | 'team' | 'integrations' | 'api-keys' | 'webhooks' | 'notifications' | 'appearance'

interface UserSettings {
  language: string
  timezone: string
  theme: string
  default_schedule_timezone: string
  pause_schedules_on_low_credits: boolean
  low_credit_threshold: number
  max_credits_per_day: number | null
  screenshot_retention_days: number
}

interface NotificationPreferences {
  email_marketing: boolean
  email_task_started: boolean
  email_task_completed: boolean
  email_task_failed: boolean
  email_low_credits: boolean
  email_billing: boolean
}

interface UsageData {
  plan: string
  subscriptionStatus: string | null
  credits: { current: number; monthlyAllowance: number }
  agents: { current: number; limit: number }
  concurrentRuns: { current: number; limit: number }
  features: string[]
}

interface ScheduledAgent {
  id: string
  name: string
  type: string
  status: string
  schedule_cron: string | null
  schedule_timezone: string
  next_run_at: string | null
  last_run_at: string | null
  estimated_cost_per_run: number
}

interface Credential {
  id: string
  service_name: string
  credential_type: string
  created_at: string
  expires_at: string | null
}

export function SettingsDialog({ open, onOpenChange, initialSection = 'settings', onUpgrade }: SettingsDialogProps) {
  const [activeSection, setActiveSection] = React.useState<SettingsSection>(initialSection)
  const [isLoading, setIsLoading] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  
  // Settings state
  const [settings, setSettings] = React.useState<UserSettings | null>(null)
  const [notifications, setNotifications] = React.useState<NotificationPreferences | null>(null)
  const [usage, setUsage] = React.useState<UsageData | null>(null)
  const [scheduledAgents, setScheduledAgents] = React.useState<ScheduledAgent[]>([])
  const [credentials, setCredentials] = React.useState<Credential[]>([])
  
  // Edit states
  const [editingName, setEditingName] = React.useState(false)
  const [editingAiName, setEditingAiName] = React.useState(false)
  const [tempName, setTempName] = React.useState('')
  const [tempAiName, setTempAiName] = React.useState('')
  
  const { user, profile, refreshProfile, signOut } = useAuth()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mobileView, setMobileView] = React.useState<'list' | 'detail'>('list')
  const [mobileDetailSection, setMobileDetailSection] = React.useState<string | null>(null)
  
  // Update active section when initialSection changes
  React.useEffect(() => {
    if (open && initialSection) {
      setActiveSection(initialSection)
    }
  }, [open, initialSection])
  
  // Load settings when dialog opens
  React.useEffect(() => {
    if (open) {
      loadSettings()
      loadUsage()
      loadScheduledAgents()
      loadCredentials()
    }
  }, [open])
  
  const loadSettings = async () => {
    try {
      const res = await fetch('/api/settings')
      if (res.ok) {
        const data = await res.json()
        setSettings(data.settings)
        setNotifications(data.notifications)
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }
  
  const loadUsage = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      const { data: profileDataWithBilling, error: profileBillingError } = await supabase
        .from('profiles')
        .select('plan_type, credits, subscription_status, monthly_credits')
        .eq('id', user.id)
        .single()

      let profileData = profileDataWithBilling
      if (profileBillingError) {
        // Fallback for databases that don't yet have billing columns on profiles
        const { data: profileDataLegacy } = await supabase
          .from('profiles')
          .select('plan_type, credits')
          .eq('id', user.id)
          .single()
        profileData = profileDataLegacy
      }
      
      const { count: agentCount } = await supabase
        .from('agents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
      
      const { count: runningCount } = await supabase
        .from('agents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'working')
      
      // Derive plan limits from PRICING config
      const getPlanLimits = (planType: string) => {
        if (planType === 'free') {
          return { credits: PRICING.free.dailyCredits * 30, agents: PRICING.free.agents, concurrent: 1, features: ['Basic agents', 'Community support'] }
        }
        const subPlan = PRICING.subscriptions[planType as SubscriptionPlanType]
        if (!subPlan) {
          return { credits: PRICING.free.dailyCredits * 30, agents: PRICING.free.agents, concurrent: 1, features: ['Basic agents', 'Community support'] }
        }
        const baseTier = subPlan.tiers[0]
        return {
          credits: baseTier.credits,
          agents: subPlan.agents,
          concurrent: planType === 'business' ? 20 : planType === 'pro' ? 5 : 2,
          features: subPlan.features,
        }
      }
      
      const pd = profileData as { plan_type?: string; credits?: number; subscription_status?: string; monthly_credits?: number } | null
      const plan = pd?.plan_type || 'free'
      const limits = getPlanLimits(plan)
      // Use monthly_credits from profile (set by webhook) if available, otherwise fall back to plan default
      const monthlyAllowance = (pd?.monthly_credits && pd.monthly_credits > 0) ? pd.monthly_credits : limits.credits
      
      setUsage({
        plan,
        subscriptionStatus: pd?.subscription_status || null,
        credits: { current: pd?.credits || 0, monthlyAllowance },
        agents: { current: agentCount || 0, limit: limits.agents },
        concurrentRuns: { current: runningCount || 0, limit: limits.concurrent },
        features: limits.features,
      })
    } catch (error) {
      console.error('Failed to load usage:', error)
    }
  }
  
  const loadScheduledAgents = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      const { data } = await supabase
        .from('agents')
        .select('id, name, type, status, schedule_cron, schedule_timezone, next_run_at, last_run_at, estimated_cost_per_run')
        .eq('user_id', user.id)
        .eq('schedule_type', 'scheduled')
        .order('next_run_at', { ascending: true })
      
      setScheduledAgents((data || []) as ScheduledAgent[])
    } catch (error) {
      console.error('Failed to load scheduled agents:', error)
    }
  }
  
  const loadCredentials = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      const { data } = await supabase
        .from('credentials')
        .select('id, service_name, credential_type, created_at, expires_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      
      setCredentials((data || []) as Credential[])
    } catch (error) {
      console.error('Failed to load credentials:', error)
    }
  }
  
  const saveSettings = async (updates: { settings?: Partial<UserSettings>; notifications?: Partial<NotificationPreferences>; profile?: Record<string, unknown> }) => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      
      if (res.ok) {
        const data = await res.json()
        if (data.settings) setSettings(prev => ({ ...prev, ...data.settings }))
        if (data.notifications) setNotifications(prev => ({ ...prev, ...data.notifications }))
        if (data.profile) await refreshProfile()
        toast.success('Settings saved')
      } else {
        toast.error('Failed to save settings')
      }
    } catch (error) {
      console.error('Save error:', error)
      toast.error('Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }
  
  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme)
    saveSettings({ settings: { theme: newTheme } })
  }

  const personalSections = [
    { id: 'account', label: 'Account', icon: User },
    { id: 'settings', label: 'Settings', icon: Settings2 },
    { id: 'usage', label: 'Usage', icon: Activity },
    { id: 'credentials', label: 'Credentials', icon: Key },
  ] as const

  const workspaceSections = [
    { id: 'team', label: 'Workspace', icon: Users },
    { id: 'integrations', label: 'Connectors', icon: () => (
      <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" width="16" height="16" className="shrink-0"><path fill="currentColor" d="M19.25 7a2.25 2.25 0 1 0-4.5 0 2.25 2.25 0 0 0 4.5 0m-10 0a2.25 2.25 0 1 0-4.5 0 2.25 2.25 0 0 0 4.5 0m-4.5 10a2.25 2.25 0 1 0 4.5 0 2.25 2.25 0 0 0-4.5 0m6-10a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0m10 0a3.75 3.75 0 0 1-3 3.675V14A3.75 3.75 0 0 1 14 17.75h-3.325a3.751 3.751 0 1 1 0-1.5H14A2.25 2.25 0 0 0 16.25 14v-3.325A3.751 3.751 0 1 1 20.75 7"></path></svg>
    )},
    { id: 'api-keys', label: 'API Keys', icon: Key },
    { id: 'webhooks', label: 'Webhooks', icon: Webhook },
    // { id: 'audit-log', label: 'Audit Log', icon: Shield }, // Hidden for now
  ] as const

  const sections = [...personalSections, ...workspaceSections]
  const isPageSection = false
  
  const getAgentIcon = (type: string) => {
    switch (type) {
      case 'web-research': return <Globe size={14} />
      case 'email-assistant': return <Mail size={14} />
      case 'data-analyst': return <Database size={14} />
      case 'file-organizer': return <FileSearch size={14} />
      default: return <Bot size={14} />
    }
  }
  
  const formatCron = (cron: string | null) => {
    if (!cron) return 'Not scheduled'
    const parts = cron.split(' ')
    if (parts[1]?.startsWith('*/')) return `Every ${parts[1].substring(2)} hours`
    if (parts[0]?.startsWith('*/')) return `Every ${parts[0].substring(2)} minutes`
    if (parts[1] !== '*' && parts[0] !== '*') return `Daily at ${parts[1]}:${parts[0].padStart(2, '0')}`
    return cron
  }
  
  const formatDate = (date: string | null) => {
    if (!date) return 'Never'
    return new Date(date).toLocaleString()
  }
  
  const deleteCredential = async (id: string) => {
    try {
      const supabase = createClient()
      await supabase.from('credentials').delete().eq('id', id)
      setCredentials(prev => prev.filter(c => c.id !== id))
      toast.success('Credential deleted')
    } catch (error) {
      toast.error('Failed to delete credential')
    }
  }

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[100]"
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.98, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 12 }}
                transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                data-testid="settings-dialog"
                className="fixed inset-0 md:inset-auto md:left-[50%] md:top-[50%] md:translate-x-[-50%] md:translate-y-[-50%] w-full md:w-[95vw] md:max-w-[1400px] h-full md:h-[92vh] md:max-h-[920px] bg-background md:rounded-[32px] shadow-none md:shadow-[0_40px_100px_-20px_rgba(0,0,0,0.15)] z-[101] overflow-hidden flex flex-col md:flex-row md:border md:border-border"
              >
                <VisuallyHidden.Root>
                  <DialogPrimitive.Title>Settings</DialogPrimitive.Title>
                  <DialogPrimitive.Description>
                    Manage your account, workspace, integrations, and advanced preferences.
                  </DialogPrimitive.Description>
                </VisuallyHidden.Root>
                {/* Mobile Settings - iOS style layout */}
                <div className="md:hidden flex flex-col h-full overflow-hidden relative">
                  {/* Main List View */}
                  <div className={`absolute inset-0 flex flex-col overflow-y-auto transition-transform duration-300 ease-out ${mobileDetailSection ? '-translate-x-full' : 'translate-x-0'}`}>
                    <div className="px-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-2 flex items-center justify-between">
                      <h1 className="text-[34px] font-bold text-foreground">Settings</h1>
                      <DialogPrimitive.Close className="w-8 h-8 flex items-center justify-center text-muted-foreground">
                        <X size={20} />
                      </DialogPrimitive.Close>
                    </div>
                    
                    <div className="flex-1 px-4 pb-[calc(env(safe-area-inset-bottom)+24px)]">
                      {/* Plan Card */}
                      <div className="mt-4 p-4 rounded-2xl border border-border bg-card">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[17px] font-semibold text-foreground capitalize">{usage?.plan || 'Free'}</span>
                          <button 
                            onClick={() => window.open('/upgrade', '_blank')}
                            className="px-4 py-1.5 bg-foreground text-background rounded-full text-[13px] font-semibold"
                          >
                            Upgrade
                          </button>
                        </div>
                        <button className="flex items-center justify-between w-full">
                          <span className="text-[15px] text-muted-foreground">Credits</span>
                          <div className="flex items-center gap-1.5 text-foreground">
                            <Sparkles size={14} />
                            <span className="text-[15px] font-medium">{usage?.credits.current || 0}</span>
                            <ChevronRight size={16} className="text-muted-foreground" />
                          </div>
                        </button>
                      </div>

                      {/* 2Hands Section */}
                      <div className="mt-6">
                        <h3 className="text-[12px] font-medium text-muted-foreground px-1 mb-3">2Hands</h3>
                        <div className="space-y-0">
                          <button className="w-full flex items-center gap-3.5 py-4 border-b border-border">
                            <Gift size={20} className="text-muted-foreground" />
                            <span className="flex-1 text-[15px] text-foreground text-left font-medium">Share with a friend</span>
                            <ChevronRight size={18} className="text-muted-foreground" />
                          </button>
                          <button 
                            onClick={() => setMobileDetailSection('credentials')}
                            className="w-full flex items-center gap-3.5 py-4"
                          >
                            <Shield size={20} className="text-muted-foreground" />
                            <span className="flex-1 text-[15px] text-foreground text-left font-medium">Credentials</span>
                            <ChevronRight size={18} className="text-muted-foreground" />
                          </button>
                        </div>
                      </div>

                      {/* General Section */}
                      <div className="mt-8">
                        <h3 className="text-[12px] font-medium text-muted-foreground px-1 mb-3">General</h3>
                        <div className="space-y-0">
                          <button 
                            onClick={() => setMobileDetailSection('account')}
                            className="w-full flex items-center gap-3.5 py-4 border-b border-border"
                          >
                            <User size={20} className="text-muted-foreground" />
                            <span className="flex-1 text-[15px] text-foreground text-left font-medium">Account</span>
                            <ChevronRight size={18} className="text-muted-foreground" />
                          </button>
                          <button className="w-full flex items-center gap-3.5 py-4 border-b border-border">
                            <Globe size={20} className="text-muted-foreground" />
                            <span className="flex-1 text-[15px] text-foreground text-left font-medium">Language</span>
                            <span className="text-[14px] text-muted-foreground mr-1">English</span>
                          </button>
                          <button 
                            onClick={() => setMobileDetailSection('appearance')}
                            className="w-full flex items-center gap-3.5 py-4 border-b border-border"
                          >
                            <Moon size={20} className="text-muted-foreground" />
                            <span className="flex-1 text-[15px] text-foreground text-left font-medium">Appearance</span>
                            <span className="text-[14px] text-muted-foreground mr-1 capitalize">{theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark'}</span>
                            <ChevronRight size={18} className="text-muted-foreground" />
                          </button>
                          <button 
                            onClick={() => setMobileDetailSection('notifications')}
                            className="w-full flex items-center gap-3.5 py-4 border-b border-border"
                          >
                            <Bell size={20} className="text-muted-foreground" />
                            <span className="flex-1 text-[15px] text-foreground text-left font-medium">Notifications</span>
                            <ChevronRight size={18} className="text-muted-foreground" />
                          </button>
                          <a 
                            href="https://2hands.ai/support"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full flex items-center gap-3.5 py-4"
                          >
                            <HelpCircle size={20} className="text-muted-foreground" />
                            <span className="flex-1 text-[15px] text-foreground text-left font-medium">Help & Support</span>
                            <ChevronRight size={18} className="text-muted-foreground" />
                          </a>
                        </div>
                      </div>

                      {/* Workspace Section */}
                      <div className="mt-8">
                        <h3 className="text-[12px] font-medium text-muted-foreground px-1 mb-3">Workspace</h3>
                        <div className="space-y-0">
                          <button 
                            onClick={() => setMobileDetailSection('team')}
                            className="w-full flex items-center gap-3.5 py-4 border-b border-border"
                          >
                            <Users size={20} className="text-muted-foreground" />
                            <span className="flex-1 text-[15px] text-foreground text-left font-medium">Team</span>
                            <ChevronRight size={18} className="text-muted-foreground" />
                          </button>
                          <button 
                            onClick={() => setMobileDetailSection('integrations')}
                            className="w-full flex items-center gap-3.5 py-4 border-b border-border"
                          >
                            <Puzzle size={20} className="text-muted-foreground" />
                            <span className="flex-1 text-[15px] text-foreground text-left font-medium">Connectors</span>
                            <ChevronRight size={18} className="text-muted-foreground" />
                          </button>
                          <button 
                            onClick={() => setMobileDetailSection('api-keys')}
                            className="w-full flex items-center gap-3.5 py-4 border-b border-border"
                          >
                            <Key size={20} className="text-muted-foreground" />
                            <span className="flex-1 text-[15px] text-foreground text-left font-medium">API Keys</span>
                            <ChevronRight size={18} className="text-muted-foreground" />
                          </button>
                          <button 
                            onClick={() => setMobileDetailSection('webhooks')}
                            className="w-full flex items-center gap-3.5 py-4 border-b border-border"
                          >
                            <Webhook size={20} className="text-muted-foreground" />
                            <span className="flex-1 text-[15px] text-foreground text-left font-medium">Webhooks</span>
                            <ChevronRight size={18} className="text-muted-foreground" />
                          </button>
                          {/* Audit log hidden for now
                          <button 
                            onClick={() => setMobileDetailSection('audit-log')}
                            className="w-full flex items-center gap-3.5 py-4"
                          >
                            <Shield size={20} className="text-muted-foreground" />
                            <span className="flex-1 text-[15px] text-foreground text-left font-medium">Audit Log</span>
                            <ChevronRight size={18} className="text-muted-foreground" />
                          </button> */}
                        </div>
                      </div>

                      {/* Sign Out */}
                      <div className="mt-8">
                        <button 
                          onClick={async () => {
                            await signOut()
                            window.location.href = '/sign-in'
                          }}
                          className="w-full flex items-center gap-3.5 py-4"
                        >
                          <LogOut size={20} className="text-red-500" />
                          <span className="text-[15px] font-medium text-red-500">Sign Out</span>
                        </button>
                      </div>

                      {/* Version */}
                      <div className="mt-8 text-center">
                        <span className="text-[11px] text-muted-foreground">2Hands v1.0.0</span>
                      </div>
                    </div>
                  </div>

                  {/* Detail View - slides in from right */}
                  <div className={`absolute inset-0 flex flex-col bg-background transition-transform duration-300 ease-out ${mobileDetailSection ? 'translate-x-0' : 'translate-x-full'}`}>
                    {/* Detail Header */}
                    <div className="px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3 flex items-center">
                      <button
                        onClick={() => setMobileDetailSection(null)}
                        className="w-10 h-10 flex items-center justify-center -ml-2"
                      >
                        <ChevronLeft size={24} className="text-foreground" />
                      </button>
                      <span className="text-[17px] font-semibold text-foreground ml-2">
                        {mobileDetailSection === 'credentials' && 'Credentials'}
                        {mobileDetailSection === 'account' && 'Account'}
                        {mobileDetailSection === 'appearance' && 'Appearance'}
                        {mobileDetailSection === 'notifications' && 'Notifications'}
                        {mobileDetailSection === 'team' && 'Team'}
                        {mobileDetailSection === 'integrations' && 'Connectors'}
                        {mobileDetailSection === 'api-keys' && 'API Keys'}
                        {mobileDetailSection === 'webhooks' && 'Webhooks'}
                        {/* Audit log hidden for now: {mobileDetailSection === 'audit-log' && 'Audit Log'} */}
                      </span>
                    </div>

                    {/* Detail Content */}
                    <div className="flex-1 overflow-y-auto px-6 pb-[calc(env(safe-area-inset-bottom)+24px)]">
                      {/* Scheduled Agents */}
                      {mobileDetailSection === 'scheduled' && (
                        <div>
                          {scheduledAgents.length === 0 ? (
                            <div className="flex flex-col items-center py-16">
                              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                                <Calendar size={28} className="text-muted-foreground opacity-50" />
                              </div>
                              <span className="text-[16px] font-semibold text-foreground">No scheduled agents</span>
                              <span className="text-[14px] text-muted-foreground mt-2 text-center">Create an agent with a schedule to see it here</span>
                            </div>
                          ) : (
                            scheduledAgents.map((agent, index) => {
                              const getTimeUntil = (dateStr: string) => {
                                const now = new Date()
                                const nextRun = new Date(dateStr)
                                const diff = nextRun.getTime() - now.getTime()
                                if (diff < 0) return 'Overdue'
                                const hours = Math.floor(diff / (1000 * 60 * 60))
                                if (hours < 1) return 'Less than an hour'
                                if (hours < 24) return `In ${hours} hours`
                                const days = Math.floor(hours / 24)
                                return `In ${days} day${days > 1 ? 's' : ''}`
                              }
                              return (
                                <button
                                  key={agent.id}
                                  onClick={() => {
                                    onOpenChange(false)
                                    window.location.href = `/app/agent/${agent.id}`
                                  }}
                                  className={`w-full flex items-center gap-3.5 py-4 ${index < scheduledAgents.length - 1 ? 'border-b border-border' : ''}`}
                                >
                                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                                    <Calendar size={20} className="text-muted-foreground" />
                                  </div>
                                  <div className="flex-1 text-left">
                                    <span className="text-[16px] font-semibold text-foreground block">{agent.name}</span>
                                    <span className="text-[14px] text-muted-foreground">{agent.next_run_at ? getTimeUntil(agent.next_run_at) : 'Scheduled'}</span>
                                  </div>
                                  <ChevronRight size={18} className="text-muted-foreground" />
                                </button>
                              )
                            })
                          )}
                        </div>
                      )}

                      {/* Credentials */}
                      {mobileDetailSection === 'credentials' && (
                        <div>
                          <p className="text-[13px] text-muted-foreground mb-6">Saved Credentials</p>
                          {credentials.length === 0 ? (
                            <div className="flex flex-col items-center py-8">
                              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                                <Key size={28} className="text-muted-foreground opacity-60" />
                              </div>
                              <span className="text-[17px] font-semibold text-foreground">No credentials saved</span>
                              <span className="text-[14px] text-muted-foreground mt-2 text-center leading-5 px-4">Add credentials to allow your agents to log into websites and services automatically</span>
                            </div>
                          ) : (
                            credentials.map((cred, index) => (
                              <div
                                key={cred.id}
                                className={`flex items-center gap-3.5 py-4 ${index < credentials.length - 1 ? 'border-b border-border' : ''}`}
                              >
                                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                                  <Key size={20} className="text-muted-foreground" />
                                </div>
                                <div className="flex-1">
                                  <span className="text-[16px] font-semibold text-foreground block">{cred.service_name}</span>
                                  <span className="text-[14px] text-muted-foreground">{cred.credential_type}</span>
                                </div>
                                <ChevronRight size={18} className="text-muted-foreground" />
                              </div>
                            ))
                          )}
                        </div>
                      )}

                      {/* Account */}
                      {mobileDetailSection === 'account' && (
                        <div>
                          {/* Profile Avatar */}
                          <div className="flex flex-col items-center py-8">
                            <div className="w-24 h-24 rounded-full bg-primary flex items-center justify-center">
                              <span className="text-primary-foreground text-[36px] font-bold">
                                {profile?.full_name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || '?'}
                              </span>
                            </div>
                            <span className="text-[22px] font-bold text-foreground mt-4">{profile?.full_name || 'User'}</span>
                            <span className="text-[14px] text-muted-foreground mt-1">{user?.email}</span>
                          </div>

                          {/* Account Info */}
                          <div className="mt-2 space-y-0">
                            <div className="py-4 border-b border-border">
                              <div className="flex items-center justify-between">
                                <span className="text-[13px] text-muted-foreground">Full Name</span>
                                {!editingName && (
                                  <button onClick={() => { setTempName(profile?.full_name || ''); setEditingName(true); }}>
                                    <Edit3 size={16} className="text-muted-foreground" />
                                  </button>
                                )}
                              </div>
                              {editingName ? (
                                <div className="flex items-center gap-2 mt-2">
                                  <input
                                    type="text"
                                    value={tempName}
                                    onChange={(e) => setTempName(e.target.value)}
                                    className="flex-1 text-[16px] font-medium text-foreground bg-muted px-3 py-2 rounded-lg"
                                    autoFocus
                                  />
                                  <button onClick={() => setEditingName(false)} className="p-2">
                                    <X size={18} className="text-muted-foreground" />
                                  </button>
                                  <button onClick={async () => {
                                    await fetch('/api/settings', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ full_name: tempName })
                                    })
                                    refreshProfile()
                                    setEditingName(false)
                                  }} className="p-2">
                                    <Save size={18} className="text-primary" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[16px] font-medium text-foreground mt-2 block">{profile?.full_name || 'Not set'}</span>
                              )}
                            </div>
                            <div className="py-4 border-b border-border">
                              <span className="text-[13px] text-muted-foreground block">Email</span>
                              <span className="text-[16px] font-medium text-foreground mt-2 block">{user?.email}</span>
                            </div>
                            <div className="py-4 border-b border-border">
                              <span className="text-[13px] text-muted-foreground block">Plan</span>
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-[16px] font-medium text-foreground capitalize">{usage?.plan || 'Free'}</span>
                                <button 
                                  onClick={() => window.open('/upgrade', '_blank')}
                                  className="text-[14px] font-medium text-primary flex items-center gap-1"
                                >
                                  Manage <span>→</span>
                                </button>
                              </div>
                            </div>
                            <div className="py-4">
                              <span className="text-[13px] text-muted-foreground block">Member Since</span>
                              <span className="text-[16px] font-medium text-foreground mt-2 block">
                                {user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Unknown'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Appearance */}
                      {mobileDetailSection === 'appearance' && (
                        <div>
                          <p className="text-[13px] text-muted-foreground mb-4">Theme</p>
                          <div className="space-y-0">
                            {([
                              { value: 'system', label: 'System', desc: 'Follow device settings' },
                              { value: 'light', label: 'Light', desc: 'Always light mode' },
                              { value: 'dark', label: 'Dark', desc: 'Always dark mode' }
                            ] as const).map((option, index) => (
                              <button
                                key={option.value}
                                onClick={() => setTheme(option.value)}
                                className={`w-full flex items-center gap-4 py-4 ${index < 2 ? 'border-b border-border' : ''}`}
                              >
                                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                                  <Moon size={20} className="text-muted-foreground" />
                                </div>
                                <div className="flex-1 text-left">
                                  <span className="text-[16px] font-semibold text-foreground block">{option.label}</span>
                                  <span className="text-[14px] text-muted-foreground">{option.desc}</span>
                                </div>
                                {theme === option.value && (
                                  <CheckCircle size={24} className="text-primary" />
                                )}
                              </button>
                            ))}
                          </div>
                          <p className="text-[13px] text-muted-foreground mt-8 leading-5">Theme preference is saved locally. Changes will apply next time you open the app.</p>
                        </div>
                      )}

                      {/* Workspace page sections on mobile */}
                      {mobileDetailSection === 'team' && (
                        <React.Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                          <TeamSettings />
                        </React.Suspense>
                      )}
                      {mobileDetailSection === 'integrations' && (
                        <React.Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                          <IntegrationsSettings />
                        </React.Suspense>
                      )}
                      {mobileDetailSection === 'api-keys' && (
                        <React.Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                          <ApiKeysSettings />
                        </React.Suspense>
                      )}
                      {mobileDetailSection === 'webhooks' && (
                        <React.Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                          <WebhooksSettings />
                        </React.Suspense>
                      )}
                      {/* Audit log hidden for now
                      {mobileDetailSection === 'audit-log' && (
                        <React.Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                          <AuditLogSettings />
                        </React.Suspense>
                      )} */}

                      {/* Notifications */}
                      {mobileDetailSection === 'notifications' && (
                        <div>
                          <p className="text-[13px] text-muted-foreground mb-4">Push Notifications</p>
                          <div className="space-y-0">
                            <div className="flex items-center justify-between py-4 border-b border-border">
                              <div className="flex-1">
                                <span className="text-[16px] font-semibold text-foreground block">Agent Updates</span>
                                <span className="text-[14px] text-muted-foreground">Get notified when agents complete tasks</span>
                              </div>
                              <Switch 
                                checked={notifications?.email_task_completed ?? true}
                                onCheckedChange={(checked) => setNotifications(prev => prev ? {...prev, email_task_completed: checked} : null)}
                              />
                            </div>
                            <div className="flex items-center justify-between py-4 border-b border-border">
                              <div className="flex-1">
                                <span className="text-[16px] font-semibold text-foreground block">New Features</span>
                                <span className="text-[14px] text-muted-foreground">Learn about new 2Hands features</span>
                              </div>
                              <Switch 
                                checked={notifications?.email_task_started ?? true}
                                onCheckedChange={(checked) => setNotifications(prev => prev ? {...prev, email_task_started: checked} : null)}
                              />
                            </div>
                            <div className="flex items-center justify-between py-4">
                              <div className="flex-1">
                                <span className="text-[16px] font-semibold text-foreground block">Tips & Tricks</span>
                                <span className="text-[14px] text-muted-foreground">Helpful tips to get more from 2Hands</span>
                              </div>
                              <Switch 
                                checked={notifications?.email_marketing ?? false}
                                onCheckedChange={(checked) => setNotifications(prev => prev ? {...prev, email_marketing: checked} : null)}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Desktop Sidebar */}
                <div className="hidden md:flex w-[260px] bg-card border-r border-border flex-col shrink-0">
                  <div className="h-4" />

                  <div className="flex-1 px-3 space-y-1 overflow-y-auto">
                    {personalSections.map((section) => (
                      <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id as SettingsSection)}
                        className={cn(
                          "w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-[14px] font-medium transition-all duration-200",
                          activeSection === section.id
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <section.icon size={16} className="shrink-0" />
                        {section.label}
                      </button>
                    ))}

                    <div className="pt-3 pb-1 px-3">
                      <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-[0.1em]">Workspace</span>
                    </div>

                    {workspaceSections.map((section) => (
                      <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id as SettingsSection)}
                        className={cn(
                          "w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-[14px] font-medium transition-all duration-200",
                          activeSection === section.id
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <section.icon size={16} className="shrink-0" />
                        {section.label}
                      </button>
                    ))}
                  </div>

                  <div className="p-3 mt-auto">
                    <a 
                      href="https://docs.2hands.ai" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-[14px] font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all"
                    >
                      <div className="flex items-center gap-2.5">
                        <HelpCircle size={16} />
                        Get help
                      </div>
                      <ExternalLink size={14} className="text-muted-foreground" />
                    </a>
                  </div>
                </div>

                {/* Main Content Area - Desktop only */}
                <div className="hidden md:flex flex-1 flex-col min-w-0 bg-background">
                  <header className="hidden md:flex px-5 py-4 items-center justify-between shrink-0 border-b border-border">
                    <h2 className="text-[15px] font-semibold text-foreground">
                      {sections.find(s => s.id === activeSection)?.label}
                    </h2>
                    <DialogPrimitive.Close 
                      className="p-1.5 rounded-full hover:bg-foreground/5 transition-all text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      aria-label="Close settings"
                    >
                      <X size={18} />
                    </DialogPrimitive.Close>
                  </header>

                  <div className={cn("flex-1 overflow-y-auto", isPageSection ? "" : "px-4 py-4 md:px-5 md:py-5 pb-[calc(env(safe-area-inset-bottom)+24px)] md:pb-6")}>
                    {/* Account Section */}
                    {activeSection === 'account' && (
                      <div className="max-w-2xl mx-auto space-y-8">
                        {/* Profile */}
                        <section className="space-y-6">
                          <h3 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">Profile</h3>
                          
                          <div className="flex items-start gap-4">
                            <div className="relative group">
                              <Avatar className="h-14 w-14 border-2 border-border">
                                <AvatarImage src={profile?.avatar_url || undefined} />
                                <AvatarFallback className="bg-primary text-primary-foreground text-lg font-medium">
                                  {getInitials(profile?.full_name || user?.email)}
                                </AvatarFallback>
                              </Avatar>
                              <button 
                                className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label="Change profile photo"
                              >
                                <Camera size={16} className="text-white" />
                              </button>
                            </div>
                            
                            <div className="flex-1 space-y-3">
                              <div className="space-y-2">
                                <label className="text-[13px] font-medium text-muted-foreground">Full Name</label>
                                {editingName ? (
                                  <div className="flex gap-2">
                                    <Input 
                                      value={tempName} 
                                      onChange={(e) => setTempName(e.target.value)}
                                      className="h-10 bg-card border border-border rounded-xl"
                                    />
                                    <Button 
                                      size="sm" 
                                      onClick={() => {
                                        saveSettings({ profile: { full_name: tempName } })
                                        setEditingName(false)
                                      }}
                                      disabled={isSaving}
                                    >
                                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check size={16} />}
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>
                                      <X size={16} />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[14px] font-medium text-foreground">{profile?.full_name || 'Not set'}</span>
                                    <button 
                                      onClick={() => { setTempName(profile?.full_name || ''); setEditingName(true) }}
                                      className="p-1 hover:bg-foreground/5 rounded"
                                    >
                                      <Edit3 size={14} className="text-muted-foreground" />
                                    </button>
                                  </div>
                                )}
                              </div>
                              
                              <div className="space-y-2">
                                <label className="text-[13px] font-medium text-muted-foreground">Email</label>
                                <span className="text-[14px] text-foreground block">{user?.email}</span>
                              </div>
                            </div>
                          </div>
                        </section>
                        
                        {/* AI Manager Name */}
                        <section className="space-y-4">
                          <h3 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">AI Manager</h3>
                          <div className="space-y-2">
                            <label className="text-[13px] font-medium text-muted-foreground">Name your AI</label>
                            {editingAiName ? (
                              <div className="flex gap-2">
                                <Input 
                                  value={tempAiName} 
                                  onChange={(e) => setTempAiName(e.target.value)}
                                  placeholder="e.g. Atlas, Jarvis, Friday..."
                                  className="h-10 bg-card border border-border rounded-xl max-w-xs"
                                />
                                <Button 
                                  size="sm" 
                                  onClick={() => {
                                    saveSettings({ profile: { ai_name: tempAiName } })
                                    setEditingAiName(false)
                                  }}
                                  disabled={isSaving}
                                >
                                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check size={16} />}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditingAiName(false)}>
                                  <X size={16} />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-[14px] font-medium text-foreground">{profile?.ai_name || '2Hands'}</span>
                                <button 
                                  onClick={() => { setTempAiName(profile?.ai_name || ''); setEditingAiName(true) }}
                                  className="p-1 hover:bg-foreground/5 rounded"
                                >
                                  <Edit3 size={14} className="text-muted-foreground" />
                                </button>
                              </div>
                            )}
                            <p className="text-[12px] text-muted-foreground">Give your AI manager a personal name</p>
                          </div>
                        </section>
                        
                        {/* Danger Zone */}
                        <section className="space-y-4 pt-6 border-t border-border">
                          <h3 className="text-[13px] font-semibold text-red-500 uppercase tracking-wider">Danger Zone</h3>
                          <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 space-y-3">
                            <div className="flex items-start gap-3">
                              <AlertTriangle size={20} className="text-red-500 mt-0.5" />
                              <div className="flex-1">
                                <h4 className="text-[14px] font-medium text-foreground">Delete Account</h4>
                                <p className="text-[12px] text-muted-foreground">Permanently delete your account and all associated data. This action cannot be undone.</p>
                              </div>
                              <Button variant="destructive" size="sm">Delete</Button>
                            </div>
                          </div>
                        </section>
                      </div>
                    )}
                    
                    {/* Settings Section */}
                    {activeSection === 'settings' && (
                      <div className="max-w-2xl mx-auto space-y-10">
                        {/* General Section */}
                        <section className="space-y-4">
                          <h3 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">General</h3>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <label className="text-[14px] font-medium text-foreground">Language</label>
                              <Select 
                                value={settings?.language || 'en'} 
                                onValueChange={(v) => saveSettings({ settings: { language: v } })}
                              >
                                <SelectTrigger className="w-[200px] bg-card border border-border rounded-xl h-10">
                                  <SelectValue placeholder="Select Language" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="en">English</SelectItem>
                                  <SelectItem value="sv">Svenska</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            
                            <div className="space-y-2">
                              <label className="text-[14px] font-medium text-foreground">Timezone</label>
                              <Select 
                                value={settings?.timezone || 'UTC'} 
                                onValueChange={(v) => saveSettings({ settings: { timezone: v } })}
                              >
                                <SelectTrigger className="w-[280px] bg-card border border-border rounded-xl h-10">
                                  <SelectValue placeholder="Select Timezone" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="UTC">UTC</SelectItem>
                                  <SelectItem value="Europe/Stockholm">Europe/Stockholm</SelectItem>
                                  <SelectItem value="Europe/London">Europe/London</SelectItem>
                                  <SelectItem value="America/New_York">America/New_York</SelectItem>
                                  <SelectItem value="America/Los_Angeles">America/Los_Angeles</SelectItem>
                                  <SelectItem value="Asia/Tokyo">Asia/Tokyo</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </section>

                        {/* Appearance Section */}
                        <section className="space-y-4">
                          <h3 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">Appearance</h3>
                          <div className="flex gap-4">
                            {[
                              { id: 'light', label: 'Light' },
                              { id: 'dark', label: 'Dark' },
                              { id: 'system', label: 'System' },
                            ].map((t) => (
                              <button
                                key={t.id}
                                onClick={() => handleThemeChange(t.id)}
                                className="group flex flex-col items-center gap-3"
                              >
                                <div className={cn(
                                  "w-28 h-18 rounded-xl border-2 transition-all relative overflow-hidden",
                                  t.id === 'dark' ? 'bg-[#1A1918]' : t.id === 'light' ? 'bg-white' : 'bg-gradient-to-r from-white to-[#1A1918]',
                                  (theme || resolvedTheme) === t.id 
                                    ? "border-primary ring-4 ring-primary/10" 
                                    : "border-border hover:border-foreground/20"
                                )}>
                                  <div className="absolute inset-2 flex flex-col gap-1.5">
                                    <div className={cn("h-1.5 w-8 rounded-full", t.id === 'dark' ? 'bg-[#F5F3F0]/20' : t.id === 'light' ? 'bg-[#34322D]/20' : 'bg-[#34322D]/20')} />
                                    <div className="flex gap-1">
                                      <div className={cn("h-1 w-4 rounded-full", t.id === 'dark' ? 'bg-[#F5F3F0]/10' : 'bg-[#34322D]/10')} />
                                      <div className={cn("h-1 w-6 rounded-full", t.id === 'dark' ? 'bg-[#F5F3F0]/10' : 'bg-[#34322D]/10')} />
                                    </div>
                                  </div>
                                </div>
                                <span className={cn(
                                  "text-[13px] font-medium",
                                  (theme || resolvedTheme) === t.id ? "text-foreground" : "text-muted-foreground"
                                )}>
                                  {t.label}
                                </span>
                              </button>
                            ))}
                          </div>
                        </section>

                        {/* Notifications */}
                        <section className="space-y-6">
                          <h3 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">Email Notifications</h3>
                          
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="space-y-0.5">
                                <h4 className="text-[14px] font-medium text-foreground">Marketing emails</h4>
                                <p className="text-[12px] text-muted-foreground">Product updates, tips, and offers</p>
                              </div>
                              <Switch 
                                checked={notifications?.email_marketing ?? true}
                                onCheckedChange={(v) => saveSettings({ notifications: { email_marketing: v } })}
                              />
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <div className="space-y-0.5">
                                <h4 className="text-[14px] font-medium text-foreground">Task started</h4>
                                <p className="text-[12px] text-muted-foreground">When your agent starts working</p>
                              </div>
                              <Switch 
                                checked={notifications?.email_task_started ?? true}
                                onCheckedChange={(v) => saveSettings({ notifications: { email_task_started: v } })}
                              />
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <div className="space-y-0.5">
                                <h4 className="text-[14px] font-medium text-foreground">Task completed</h4>
                                <p className="text-[12px] text-muted-foreground">When your agent finishes a task</p>
                              </div>
                              <Switch 
                                checked={notifications?.email_task_completed ?? false}
                                onCheckedChange={(v) => saveSettings({ notifications: { email_task_completed: v } })}
                              />
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <div className="space-y-0.5">
                                <h4 className="text-[14px] font-medium text-foreground">Task failed</h4>
                                <p className="text-[12px] text-muted-foreground">When an agent encounters an error</p>
                              </div>
                              <Switch 
                                checked={notifications?.email_task_failed ?? true}
                                onCheckedChange={(v) => saveSettings({ notifications: { email_task_failed: v } })}
                              />
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <div className="space-y-0.5">
                                <h4 className="text-[14px] font-medium text-foreground">Low credits warning</h4>
                                <p className="text-[12px] text-muted-foreground">When your credits are running low</p>
                              </div>
                              <Switch 
                                checked={notifications?.email_low_credits ?? true}
                                onCheckedChange={(v) => saveSettings({ notifications: { email_low_credits: v } })}
                              />
                            </div>
                          </div>
                        </section>
                      </div>
                    )}
                    
                    {/* Usage Section */}
                    {activeSection === 'usage' && (
                      <div className="max-w-2xl mx-auto space-y-8">
                        {/* Plan Overview */}
                        <section className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-[16px] font-semibold text-foreground capitalize">{usage?.plan || 'Free'} Plan</h3>
                              <p className="text-[13px] text-muted-foreground">
                                {usage?.subscriptionStatus === 'active' ? 'Active subscription' : 'No active subscription'}
                              </p>
                            </div>
                            <Button 
                              onClick={() => {
                                onOpenChange(false)
                                if (onUpgrade) setTimeout(() => onUpgrade(), 200)
                              }}
                              className="rounded-full"
                            >
                              {usage?.plan === 'free' ? 'Upgrade' : 'Manage Plan'}
                            </Button>
                          </div>
                        </section>
                        
                        {/* Credits */}
                        <section className="space-y-4">
                          <h3 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">Credits</h3>
                          <div className="p-5 rounded-2xl border border-border bg-card space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Sparkles size={18} className="text-primary" />
                                <span className="text-[15px] font-medium">Available Credits</span>
                              </div>
                              <span className="text-[18px] font-bold text-foreground">
                                {usage?.credits.current.toLocaleString() || 0}
                              </span>
                            </div>
                            <Progress value={Math.min(100, (usage?.credits.current || 0) / (usage?.credits.monthlyAllowance || 1) * 100)} className="h-2" />
                            <p className="text-[12px] text-muted-foreground">
                              {usage?.credits.monthlyAllowance.toLocaleString()} credits included monthly
                            </p>
                          </div>
                        </section>
                        
                        {/* Limits */}
                        <section className="space-y-4">
                          <h3 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">Usage Limits</h3>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-xl border border-border bg-card">
                              <div className="flex items-center gap-2 mb-2">
                                <Bot size={16} className="text-muted-foreground" />
                                <span className="text-[13px] font-medium text-muted-foreground">Agents</span>
                              </div>
                              <div className="flex items-baseline gap-1">
                                <span className="text-[20px] font-bold">{usage?.agents.current || 0}</span>
                                <span className="text-[14px] text-muted-foreground">
                                  / {usage?.agents.limit === -1 ? '∞' : usage?.agents.limit}
                                </span>
                              </div>
                            </div>
                            
                            <div className="p-4 rounded-xl border border-border bg-card">
                              <div className="flex items-center gap-2 mb-2">
                                <Activity size={16} className="text-muted-foreground" />
                                <span className="text-[13px] font-medium text-muted-foreground">Concurrent Runs</span>
                              </div>
                              <div className="flex items-baseline gap-1">
                                <span className="text-[20px] font-bold">{usage?.concurrentRuns.current || 0}</span>
                                <span className="text-[14px] text-muted-foreground">/ {usage?.concurrentRuns.limit}</span>
                              </div>
                            </div>
                          </div>
                        </section>
                        
                        {/* Features */}
                        <section className="space-y-4">
                          <h3 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">Included Features</h3>
                          <div className="grid grid-cols-2 gap-2">
                            {(usage?.features ?? ['AI Manager', 'Agent deployment', 'Mission mode', 'Memory system']).map((feature, i) => (
                              <div key={i} className="flex items-center gap-2 text-[14px] text-foreground">
                                <Check size={16} className="text-emerald-500" />
                                {feature}
                              </div>
                            ))}
                          </div>
                        </section>
                      </div>
                    )}
                    
                    {/* Credentials Section */}
                    {activeSection === 'credentials' && (
                      <div className="max-w-2xl mx-auto space-y-6">
                        <section className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">
                                Saved Credentials ({credentials.length})
                              </h3>
                              <p className="text-[12px] text-muted-foreground mt-1">
                                Logins your AI agents can use to access services
                              </p>
                            </div>
                          </div>
                          
                          {credentials.length === 0 ? (
                            <div className="p-8 text-center rounded-2xl border border-dashed border-border">
                              <Key size={32} className="mx-auto mb-3 text-muted-foreground" />
                              <p className="text-[14px] font-medium text-foreground">No saved credentials</p>
                              <p className="text-[12px] text-muted-foreground mt-1">
                                When your AI agent logs into a service, the credentials are securely saved here for future use.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {credentials.map((cred) => (
                                <div 
                                  key={cred.id}
                                  className="p-4 rounded-xl border border-border bg-card hover:border-foreground/10 transition-colors"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-lg bg-foreground/5 flex items-center justify-center">
                                        <Globe size={18} className="text-muted-foreground" />
                                      </div>
                                      <div>
                                        <h4 className="text-[14px] font-medium text-foreground capitalize">{cred.service_name}</h4>
                                        <p className="text-[12px] text-muted-foreground">
                                          {cred.credential_type === 'password' ? 'Username & Password' : 
                                           cred.credential_type === 'oauth' ? 'OAuth Token' :
                                           cred.credential_type === 'api_key' ? 'API Key' :
                                           cred.credential_type === 'cookie' ? 'Session Cookie' : cred.credential_type}
                                          {' • '}Saved {new Date(cred.created_at).toLocaleDateString()}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {cred.expires_at && new Date(cred.expires_at) < new Date() ? (
                                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-destructive/10 text-destructive">
                                          Expired
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-500/10 text-green-500">
                                          Active
                                        </span>
                                      )}
                                      <Button 
                                        variant="ghost" 
                                        size="sm"
                                        onClick={() => deleteCredential(cred.id)}
                                        className="text-muted-foreground hover:text-red-500"
                                      >
                                        <Trash2 size={14} />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </section>
                        
                        <section className="space-y-4 pt-6 border-t border-border">
                          <h3 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">How it works</h3>
                          <div className="space-y-3">
                            <div className="p-4 rounded-xl border border-border bg-card">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                  <Bot size={16} className="text-primary" />
                                </div>
                                <div>
                                  <h4 className="text-[14px] font-medium text-foreground">AI-powered login</h4>
                                  <p className="text-[12px] text-muted-foreground">
                                    Your AI agent can log into websites and services on your behalf using these saved credentials.
                                  </p>
                                </div>
                              </div>
                            </div>
                            
                            <div className="p-4 rounded-xl border border-border bg-card">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                                  <Shield size={16} className="text-emerald-500" />
                                </div>
                                <div>
                                  <h4 className="text-[14px] font-medium text-foreground">Encrypted & secure</h4>
                                  <p className="text-[12px] text-muted-foreground">
                                    All credentials are encrypted with AES-256. We never have access to your raw passwords.
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </section>
                      </div>
                    )}

                    {/* Workspace Sections - lazy-loaded page components */}
                    {activeSection === 'team' && (
                      <React.Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                        <TeamSettings />
                      </React.Suspense>
                    )}
                    {activeSection === 'integrations' && (
                      <React.Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                        <IntegrationsSettings />
                      </React.Suspense>
                    )}
                    {activeSection === 'api-keys' && (
                      <React.Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                        <ApiKeysSettings />
                      </React.Suspense>
                    )}
                    {activeSection === 'webhooks' && (
                      <React.Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                        <WebhooksSettings />
                      </React.Suspense>
                    )}
                    {/* Audit log hidden for now
                    {activeSection === 'audit-log' && (
                      <React.Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                        <AuditLogSettings />
                      </React.Suspense>
                    )} */}
                  </div>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}
