import { useEffect, useRef, useState, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  Image,
  Platform,
  Share,
  ActivityIndicator,
  Alert,
  Switch,
  TextInput,
  KeyboardAvoidingView,
  PanResponder,
  Keyboard,
  Easing,
} from 'react-native'

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window')
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import {
  X,
  User,
  Settings,
  Bot,
  ChevronRight,
  ChevronLeft,
  Globe,
  Mail,
  Database,
  FileSearch,
  LogOut,
  Sparkles,
  Gift,
  Bell,
  Search,
  Zap,
  MessageCircle,
  Link as LinkIcon,
  Copy,
  Check,
  Moon,
  HelpCircle,
  Calendar,
  Shield,
} from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import * as Clipboard from 'expo-clipboard'
import * as Linking from 'expo-linking'
import { useAuth } from '@/lib/auth-context'
import { useTheme } from '@/lib/theme-context'
import { supabase } from '@/lib/supabase'
import { useChatStore } from '@/store/chat-store'
import { api } from '@/lib/api'
import { FadeInDownView, FadeInView, ScalePressable, NotificationBadge } from '@/components/ui'
import type { ReferralInfo, Profile } from '@2hands/types'
import type { Agent } from '@/store/chat-store'
import { Sun, Trash2, Plus, Edit3, Save, Key, Users, UserPlus, Plug, KeyRound, Webhook, ScrollText, BarChart3, Brain, MessageSquare } from 'lucide-react-native'

// Credential interface for mobile
interface Credential {
  id: string
  service_name: string
  credential_type: string
  created_at: string
}

// Storage keys
const NOTIFICATIONS_KEY = '@2hands_notifications'

const SETTINGS_SHEET_HEIGHT = SCREEN_HEIGHT * 0.92

interface NotificationPrefs {
  agentUpdates: boolean
  newFeatures: boolean
  tips: boolean
}

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { isDark, themePreference, setThemePreference, colors } = useTheme()
  const theme = colors
  
  const { user, signOut } = useAuth()
  const { agents, aiName, credits, setPlanType } = useChatStore()
  
  const slideAnim = useRef(new Animated.Value(-SCREEN_WIDTH)).current
  const overlayAnim = useRef(new Animated.Value(0)).current
  
  // Referral view state
  const [showReferral, setShowReferral] = useState(false)
  const [referral, setReferral] = useState<ReferralInfo | null>(null)
  const [referralLoading, setReferralLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const referralSlideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current
  
  // Settings view state (bottom sheet)
  const [showSettings, setShowSettings] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const settingsSlideAnim = useRef(new Animated.Value(SETTINGS_SHEET_HEIGHT)).current
  const settingsDragY = useRef(new Animated.Value(0)).current
  
  // Notifications state (bottom sheet)
  const [showNotifications, setShowNotifications] = useState(false)
  const notificationsSlideAnim = useRef(new Animated.Value(SETTINGS_SHEET_HEIGHT)).current
  const notificationsDragY = useRef(new Animated.Value(0)).current
  
  // Settings pan responder for drag-to-close - uses native driver for 60fps
  const settingsDragStartY = useRef(0)
  const settingsPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to downward drags with sufficient movement
        return gestureState.dy > 5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
      },
      onPanResponderGrant: () => {
        // Capture current animation value at start of gesture
        settingsDragStartY.current = 0
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          // Smooth interpolation with resistance at the end
          const dragProgress = gestureState.dy / SETTINGS_SHEET_HEIGHT
          const resistance = 1 - dragProgress * 0.3 // Add resistance as user drags further
          const newY = Math.min(gestureState.dy * resistance, SETTINGS_SHEET_HEIGHT)
          
          // Use native driver event for smooth 60fps
          Animated.timing(settingsSlideAnim, {
            toValue: newY,
            duration: 0,
            useNativeDriver: true,
          }).start()
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const shouldClose = gestureState.dy > 80 || gestureState.vy > 0.5
        
        if (shouldClose) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          setShowSettings(false)
          Animated.timing(settingsSlideAnim, {
            toValue: SETTINGS_SHEET_HEIGHT,
            duration: 250,
            useNativeDriver: true,
            easing: Easing.out(Easing.cubic),
          }).start()
        } else {
          // Snap back with spring
          Animated.spring(settingsSlideAnim, {
            toValue: 0,
            useNativeDriver: true,
            damping: 20,
            mass: 0.8,
            stiffness: 300,
            overshootClamping: true,
          }).start()
        }
      },
    })
  ).current
  
  // Notifications pan responder - same smooth implementation
  const notificationsDragStartY = useRef(0)
  const notificationsPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 5 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
      },
      onPanResponderGrant: () => {
        notificationsDragStartY.current = 0
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          const dragProgress = gestureState.dy / SETTINGS_SHEET_HEIGHT
          const resistance = 1 - dragProgress * 0.3
          const newY = Math.min(gestureState.dy * resistance, SETTINGS_SHEET_HEIGHT)
          
          Animated.timing(notificationsSlideAnim, {
            toValue: newY,
            duration: 0,
            useNativeDriver: true,
          }).start()
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const shouldClose = gestureState.dy > 80 || gestureState.vy > 0.5
        
        if (shouldClose) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          setShowNotifications(false)
          Animated.timing(notificationsSlideAnim, {
            toValue: SETTINGS_SHEET_HEIGHT,
            duration: 250,
            useNativeDriver: true,
            easing: Easing.out(Easing.cubic),
          }).start()
        } else {
          Animated.spring(notificationsSlideAnim, {
            toValue: 0,
            useNativeDriver: true,
            damping: 20,
            mass: 0.8,
            stiffness: 300,
            overshootClamping: true,
          }).start()
        }
      },
    })
  ).current
  
  // Settings sub-page state
  type SettingsPage = 'main' | 'scheduled' | 'credentials' | 'account' | 'appearance' | 'notifications' | 'team' | 'integrations' | 'api-keys' | 'webhooks' | 'audit-log' | 'usage' | 'language' | 'proactive' | 'personalization' | 'memory'
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('main')
  const settingsSubSlideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current
  
  // Notification preferences state
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>({
    agentUpdates: true,
    newFeatures: true,
    tips: false,
  })
  
  // Profile editing state
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState('')
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  
  // Credentials state
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [credentialsLoading, setCredentialsLoading] = useState(false)
  
  // Team/Workspace state
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string; slug: string; plan: string; isPersonal: boolean; memberCount: number; agentCount: number }>>([])
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null)
  const [members, setMembers] = useState<Array<{ id: string; email: string; displayName: string | null; role: string; joinedAt: string; creditsUsedThisMonth: number }>>([])
  const [invites, setInvites] = useState<Array<{ id: string; email: string; role: string; createdAt: string }>>([])
  const [teamLoading, setTeamLoading] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  
  // Integrations state
  const [integrations, setIntegrations] = useState<Array<{ id: string; service_name: string; connected: boolean; credential_type: string }>>([])
  const [integrationsLoading, setIntegrationsLoading] = useState(false)
  
  // API Keys state
  const [apiKeys, setApiKeys] = useState<Array<{ id: string; name: string; key: string; createdAt: string; lastUsedAt: string | null }>>([])
  const [apiKeysLoading, setApiKeysLoading] = useState(false)
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null)
  
  // Webhooks state
  const [webhooks, setWebhooks] = useState<Array<{ id: string; url: string; events: string[]; active: boolean; createdAt: string }>>([])
  const [webhooksLoading, setWebhooksLoading] = useState(false)
  const [showWebhookModal, setShowWebhookModal] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['agent.completed'])
  
  // Audit Log state
  const [auditLogs, setAuditLogs] = useState<Array<{ id: string; action: string; actor: string; resource: string; details: string; createdAt: string }>>([])
  const [auditLogsLoading, setAuditLogsLoading] = useState(false)
  const [auditFilter, setAuditFilter] = useState('all')
  
  // Usage state
  const [usageData, setUsageData] = useState<{ totalCredits: number; usedCredits: number; agentRuns: number; apiCalls: number } | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)
  
  // Language state
  const [selectedLanguage, setSelectedLanguage] = useState('en')
  
  // Proactive Features state
  const [proactiveSettings, setProactiveSettings] = useState({
    suggestionsEnabled: true,
    autonomyLevel: 'balanced' as 'conservative' | 'balanced' | 'aggressive',
    autoRecovery: true,
  })
  
  // Personalization state
  const [personalization, setPersonalization] = useState({
    communicationStyle: 'friendly' as 'formal' | 'casual' | 'friendly' | 'professional',
    detailLevel: 'moderate' as 'brief' | 'moderate' | 'detailed',
    usesEmoji: true,
  })
  
  // Memory state
  const [memorySettings, setMemorySettings] = useState({
    structuredMemoryEnabled: true,
    crossAgentLearning: true,
    memoryCuration: true,
  })
  
  // Load notification preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const savedNotifs = await AsyncStorage.getItem(NOTIFICATIONS_KEY)
        if (savedNotifs) setNotificationPrefs(JSON.parse(savedNotifs))
        
        // Load language preference
        const savedLang = await AsyncStorage.getItem('@2hands_language')
        if (savedLang) setSelectedLanguage(savedLang)
        
        // Load proactive settings
        const savedProactive = await AsyncStorage.getItem('@2hands_proactive_settings')
        if (savedProactive) setProactiveSettings(JSON.parse(savedProactive))
        
        // Load personalization settings
        const savedPersonalization = await AsyncStorage.getItem('@2hands_personalization')
        if (savedPersonalization) setPersonalization(JSON.parse(savedPersonalization))
        
        // Load memory settings
        const savedMemory = await AsyncStorage.getItem('@2hands_memory_settings')
        if (savedMemory) setMemorySettings(JSON.parse(savedMemory))
      } catch (e) {
        console.error('Failed to load preferences:', e)
      }
    }
    loadPreferences()
  }, [])

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(overlayAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start()
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -SCREEN_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(overlayAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start()
      // Reset views when sidebar closes
      setShowReferral(false)
      setShowSettings(false)
      setSettingsPage('main')
      referralSlideAnim.setValue(SCREEN_WIDTH)
      settingsSlideAnim.setValue(SETTINGS_SHEET_HEIGHT)
      settingsDragY.setValue(0)
      settingsSubSlideAnim.setValue(SCREEN_WIDTH)
    }
  }, [isOpen])
  
  // Animate referral view
  useEffect(() => {
    Animated.timing(referralSlideAnim, {
      toValue: showReferral ? 0 : SCREEN_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start()
  }, [showReferral])
  
  // Animate settings view (bottom sheet) - snappier animation
  useEffect(() => {
    if (showSettings) {
      Animated.spring(settingsSlideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 25,
        mass: 0.8,
        stiffness: 300,
        overshootClamping: true,
      }).start()
    } else {
      Animated.timing(settingsSlideAnim, {
        toValue: SETTINGS_SHEET_HEIGHT,
        duration: 200,
        useNativeDriver: true,
        easing: Easing.in(Easing.cubic),
      }).start()
    }
  }, [showSettings])
  
  // Animate settings sub-page
  useEffect(() => {
    Animated.timing(settingsSubSlideAnim, {
      toValue: settingsPage !== 'main' ? 0 : SCREEN_WIDTH,
      duration: 200,
      useNativeDriver: true,
    }).start()
  }, [settingsPage])
  
  // Animate notifications view (bottom sheet) - snappier animation
  useEffect(() => {
    if (showNotifications) {
      Animated.spring(notificationsSlideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 25,
        mass: 0.8,
        stiffness: 300,
        overshootClamping: true,
      }).start()
    } else {
      Animated.timing(notificationsSlideAnim, {
        toValue: SETTINGS_SHEET_HEIGHT,
        duration: 200,
        useNativeDriver: true,
        easing: Easing.in(Easing.cubic),
      }).start()
    }
  }, [showNotifications])
  
  const openReferral = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setShowReferral(true)
    if (!referral) {
      setReferralLoading(true)
      try {
        const response = await api.getReferralInfo()
        if (response.data) {
          setReferral(response.data)
        }
      } finally {
        setReferralLoading(false)
      }
    }
  }

  const deleteCredential = async (id: string) => {
    try {
      const { error } = await supabase.from('credentials').delete().eq('id', id)
      if (error) throw error
      setCredentials(prev => prev.filter(c => c.id !== id))
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (e) {
      console.error('Failed to delete credential:', e)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    }
  }
  
  const closeReferral = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setShowReferral(false)
  }
  
  const openNotifications = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setShowNotifications(true)
  }
  
  const openSettings = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setShowSettings(true)
    
    // Always try to load fresh data, but don't block the UI
    if (!profile || !referral) {
      setSettingsLoading(true)
      try {
        const [profileRes, referralRes] = await Promise.all([
          api.getProfile(),
          api.getReferralInfo(),
        ])
        if (profileRes.data) {
          setProfile(profileRes.data)
          setPlanType(profileRes.data.plan_type || 'free')
        }
        if (referralRes.data) setReferral(referralRes.data)
      } catch (error) {
        console.error('Failed to load settings data:', error)
        // Show data even if API fails (using cached data or empty state)
      } finally {
        setSettingsLoading(false)
      }
    }
  }
  
  const closeSettings = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (settingsPage !== 'main') {
      setSettingsPage('main')
    } else {
      setShowSettings(false)
    }
  }
  
  const openSettingsPage = (page: SettingsPage) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setSettingsPage(page)
  }
  
  const closeSettingsPage = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setSettingsPage('main')
  }
  
  // Get scheduled agents - filter by schedule_type or next_run_at
  const scheduledAgents = agents.filter(a => 
    a.schedule_type === 'scheduled' || a.next_run_at
  )
  
  // Format cron expression to human readable
  const formatCron = (cron: string | null): string => {
    if (!cron) return 'Not scheduled'
    const parts = cron.split(' ')
    if (parts[1]?.startsWith('*/')) return `Every ${parts[1].substring(2)} hours`
    if (parts[0]?.startsWith('*/')) return `Every ${parts[0].substring(2)} minutes`
    if (parts[1] !== '*' && parts[0] !== '*') {
      const hour = parseInt(parts[1])
      const min = parts[0].padStart(2, '0')
      const ampm = hour >= 12 ? 'PM' : 'AM'
      const hour12 = hour % 12 || 12
      return `Daily at ${hour12}:${min} ${ampm}`
    }
    return cron
  }
  
  // Format date for next run
  const formatNextRun = (date: string | null): string => {
    if (!date) return 'Not scheduled'
    const d = new Date(date)
    const now = new Date()
    const diffMs = d.getTime() - now.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    
    if (diffHours < 0) return 'Overdue'
    if (diffHours < 1) return 'In less than an hour'
    if (diffHours < 24) return `In ${diffHours} hours`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays === 1) return 'Tomorrow'
    return `In ${diffDays} days`
  }
  
  // Handle theme change (uses global context which handles persistence)
  const handleThemeChange = async (newTheme: 'system' | 'light' | 'dark') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    await setThemePreference(newTheme)
  }
  
  // Handle notification toggle
  const handleNotificationToggle = async (key: keyof NotificationPrefs, value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const newPrefs = { ...notificationPrefs, [key]: value }
    setNotificationPrefs(newPrefs)
    try {
      await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(newPrefs))
    } catch (e) {
      console.error('Failed to save notification prefs:', e)
    }
  }
  
  // Handle profile name edit
  const startEditingName = () => {
    setEditedName(profile?.full_name || '')
    setIsEditingName(true)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }
  
  const cancelEditingName = () => {
    setIsEditingName(false)
    setEditedName('')
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }
  
  const saveProfileName = async () => {
    if (!editedName.trim()) {
      Alert.alert('Error', 'Name cannot be empty')
      return
    }
    
    setIsSavingProfile(true)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    
    try {
      const response = await api.updateProfile({ full_name: editedName.trim() })
      if (response.data) {
        setProfile(response.data)
        setIsEditingName(false)
        setEditedName('')
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      } else {
        Alert.alert('Error', response.error || 'Failed to update profile')
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to update profile')
    } finally {
      setIsSavingProfile(false)
    }
  }
  
  // Load credentials when opening credentials page
  const loadCredentials = async () => {
    setCredentialsLoading(true)
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!authData.user) {
        setCredentials([])
        return
      }

      const { data, error } = await supabase
        .from('credentials')
        .select('id, service_name, credential_type, created_at')
        .eq('user_id', authData.user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setCredentials((data || []) as Credential[])
    } catch (e) {
      console.error('Failed to load credentials:', e)
    } finally {
      setCredentialsLoading(false)
    }
  }
  
  // Open credentials page and load data
  const openCredentialsPage = () => {
    openSettingsPage('credentials')
    loadCredentials()
  }
  
  // Open team page and load data
  const openTeamPage = () => {
    openSettingsPage('team')
    loadTeamData()
  }

  // Open integrations page and load data
  const openIntegrationsPage = () => {
    openSettingsPage('integrations')
    loadIntegrations()
  }

  // Open API keys page and load data
  const openApiKeysPage = () => {
    openSettingsPage('api-keys')
    loadApiKeys()
  }

  // Open webhooks page and load data
  const openWebhooksPage = () => {
    openSettingsPage('webhooks')
    loadWebhooks()
  }

  // Open audit log page and load data
  const openAuditLogPage = () => {
    openSettingsPage('audit-log')
    loadAuditLogs()
  }

  // Open usage page and load data
  const openUsagePage = () => {
    openSettingsPage('usage')
    loadUsageData()
  }
  
  // Load team/workspace data
  const loadTeamData = async () => {
    setTeamLoading(true)
    try {
      const res = await fetch('/api/teams')
      if (res.ok) {
        const data = await res.json()
        const ws = data.workspaces || data.organizations || []
        setWorkspaces(ws.map((w: any) => ({
          id: w.id,
          name: w.name,
          slug: w.slug,
          plan: w.plan || 'free',
          isPersonal: w.is_personal || false,
          memberCount: w.member_count || 0,
          agentCount: w.agent_count || 0,
        })))
        if (ws.length > 0 && !selectedWorkspace) {
          setSelectedWorkspace(ws[0].id)
          await loadWorkspaceMembers(ws[0].id)
          await loadWorkspaceInvites(ws[0].id)
        }
      }
    } catch (error) {
      console.error('Failed to load team data:', error)
    } finally {
      setTeamLoading(false)
    }
  }
  
  // Load workspace members
  const loadWorkspaceMembers = async (workspaceId: string) => {
    try {
      const res = await fetch(`/api/teams?workspaceId=${workspaceId}&action=members`)
      if (res.ok) {
        const data = await res.json()
        setMembers(data.members || [])
      }
    } catch (error) {
      console.error('Failed to load workspace members:', error)
    }
  }
  
  // Load workspace invites
  const loadWorkspaceInvites = async (workspaceId: string) => {
    try {
      const res = await fetch(`/api/teams?workspaceId=${workspaceId}&action=invites`)
      if (res.ok) {
        const data = await res.json()
        setInvites(data.invites || [])
      }
    } catch (error) {
      console.error('Failed to load workspace invites:', error)
    }
  }
  
  // Send invite
  const sendInvite = async () => {
    if (!inviteEmail.trim() || !selectedWorkspace) return
    
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'invite',
          workspaceId: selectedWorkspace,
          email: inviteEmail.trim(),
          role: inviteRole
        })
      })
      
      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        setInviteEmail('')
        setShowInviteModal(false)
        await loadWorkspaceMembers(selectedWorkspace)
      } else {
        const error = await res.json()
        Alert.alert('Error', error.message || 'Failed to send invite')
      }
    } catch (error) {
      console.error('Failed to send invite:', error)
      Alert.alert('Error', 'Failed to send invite')
    }
  }
  
  // Cancel invite
  const cancelInvite = async (inviteId: string) => {
    if (!selectedWorkspace) return
    
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel_invite',
          workspaceId: selectedWorkspace,
          inviteId
        })
      })
      
      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        await loadWorkspaceMembers(selectedWorkspace)
      }
    } catch (error) {
      console.error('Failed to cancel invite:', error)
    }
  }
  
  // Remove member
  const removeMember = async (memberId: string) => {
    if (!selectedWorkspace) return
    
    Alert.alert(
      'Remove Member',
      'Are you sure you want to remove this member from the workspace?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await fetch('/api/teams', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'remove_member',
                  workspaceId: selectedWorkspace,
                  memberId
                })
              })
              
              if (res.ok) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
                await loadWorkspaceMembers(selectedWorkspace)
              }
            } catch (error) {
              console.error('Failed to remove member:', error)
            }
          }
        }
      ]
    )
  }

  // Load integrations data
  const loadIntegrations = async () => {
    setIntegrationsLoading(true)
    try {
      const res = await fetch('/api/integrations/connections')
      if (res.ok) {
        const data = await res.json()
        setIntegrations((data.connections || []).map((c: any) => ({
          id: c.id,
          service_name: c.provider,
          connected: c.status === 'active',
          credential_type: c.provider,
        })))
      }
    } catch (error) {
      console.error('Failed to load integrations:', error)
    } finally {
      setIntegrationsLoading(false)
    }
  }

  // Load API keys
  const loadApiKeys = async () => {
    setApiKeysLoading(true)
    try {
      const res = await fetch('/api/v1/keys')
      if (res.ok) {
        const data = await res.json()
        setApiKeys((data.keys || []).map((k: any) => ({
          id: k.id,
          name: k.name,
          key: k.keyPrefix || 'av_***',
          createdAt: k.createdAt,
          lastUsedAt: k.lastUsedAt,
        })))
      }
    } catch (error) {
      console.error('Failed to load API keys:', error)
    } finally {
      setApiKeysLoading(false)
    }
  }

  // Create API key
  const createApiKey = async () => {
    if (!newKeyName.trim()) return
    
    try {
      const res = await fetch('/api/v1/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim(), preset: 'standard' })
      })
      
      if (res.ok) {
        const data = await res.json()
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        setNewlyCreatedKey(data.rawKey)
        setNewKeyName('')
        setShowCreateKeyModal(false)
        await loadApiKeys()
      } else {
        const error = await res.json()
        Alert.alert('Error', error.error || 'Failed to create API key')
      }
    } catch (error) {
      console.error('Failed to create API key:', error)
      Alert.alert('Error', 'Failed to create API key')
    }
  }

  // Load webhooks
  const loadWebhooks = async () => {
    setWebhooksLoading(true)
    try {
      const res = await fetch('/api/v1/webhooks')
      if (res.ok) {
        const data = await res.json()
        setWebhooks((data.webhooks || []).map((w: any) => ({
          id: w.id,
          url: w.url,
          events: w.events,
          active: w.isActive,
          createdAt: w.createdAt,
        })))
      }
    } catch (error) {
      console.error('Failed to load webhooks:', error)
    } finally {
      setWebhooksLoading(false)
    }
  }

  // Create webhook
  const createWebhook = async () => {
    if (!webhookUrl.trim() || selectedEvents.length === 0) return
    
    try {
      const res = await fetch('/api/v1/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl.trim(), events: selectedEvents })
      })
      
      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        setWebhookUrl('')
        setSelectedEvents(['agent.completed'])
        setShowWebhookModal(false)
        await loadWebhooks()
      } else {
        const error = await res.json()
        Alert.alert('Error', error.error || 'Failed to create webhook')
      }
    } catch (error) {
      console.error('Failed to create webhook:', error)
      Alert.alert('Error', 'Failed to create webhook')
    }
  }

  // Load audit logs
  const loadAuditLogs = async () => {
    setAuditLogsLoading(true)
    try {
      const res = await fetch('/api/teams?action=audit-log')
      if (res.ok) {
        const data = await res.json()
        setAuditLogs((data.entries || []).map((e: any) => ({
          id: e.id,
          action: e.action,
          actor: e.userEmail || e.userId || 'Unknown',
          resource: e.resource,
          details: e.details ? JSON.stringify(e.details) : '',
          createdAt: e.createdAt,
        })))
      }
    } catch (error) {
      console.error('Failed to load audit logs:', error)
    } finally {
      setAuditLogsLoading(false)
    }
  }

  // Load usage data
  const loadUsageData = async () => {
    setUsageLoading(true)
    try {
      const res = await fetch('/api/usage')
      if (res.ok) {
        const data = await res.json()
        setUsageData({
          totalCredits: data.totalCredits || 0,
          usedCredits: data.usedCredits || 0,
          agentRuns: data.agentRuns || 0,
          apiCalls: data.apiCalls || 0,
        })
      }
    } catch (error) {
      console.error('Failed to load usage data:', error)
    } finally {
      setUsageLoading(false)
    }
  }

  // Save proactive settings
  const saveProactiveSettings = async (newSettings: typeof proactiveSettings) => {
    setProactiveSettings(newSettings)
    try {
      await AsyncStorage.setItem('@2hands_proactive_settings', JSON.stringify(newSettings))
    } catch (e) {
      console.error('Failed to save proactive settings:', e)
    }
  }

  // Save personalization settings
  const savePersonalization = async (newSettings: typeof personalization) => {
    setPersonalization(newSettings)
    try {
      await AsyncStorage.setItem('@2hands_personalization', JSON.stringify(newSettings))
    } catch (e) {
      console.error('Failed to save personalization:', e)
    }
  }

  // Save memory settings
  const saveMemorySettings = async (newSettings: typeof memorySettings) => {
    setMemorySettings(newSettings)
    try {
      await AsyncStorage.setItem('@2hands_memory_settings', JSON.stringify(newSettings))
    } catch (e) {
      console.error('Failed to save memory settings:', e)
    }
  }
  
  const handleSignOut = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Sign Out', 
          style: 'destructive',
          onPress: async () => {
            onClose()
            await signOut()
            router.replace('/(auth)/login')
          }
        },
      ]
    )
  }
  
  const handleManageBilling = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    Linking.openURL('https://2hands.ai/app/settings')
  }
  
  const copyToClipboard = async () => {
    if (!referral?.referralUrl) return
    await Clipboard.setStringAsync(referral.referralUrl)
    setCopied(true)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareReferral = async () => {
    if (!referral?.referralUrl) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    await Share.share({
      message: `Join me on 2Hands - AI automation for everyone! Use my link to get 500 bonus credits: ${referral.referralUrl}`,
      url: referral.referralUrl,
    })
  }

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    Keyboard.dismiss()
    onClose()
  }

  const handleNavigation = (path: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    Keyboard.dismiss()
    // Navigate immediately and close sidebar
    router.replace(path as any)
    onClose()
  }

  const getAgentIcon = (type: string) => {
    const iconProps = { size: 20, color: theme.foreground }
    switch (type) {
      case 'web-research': return <Globe {...iconProps} />
      case 'email-assistant': return <Mail {...iconProps} />
      case 'data-analyst': return <Database {...iconProps} />
      case 'file-organizer': return <FileSearch {...iconProps} />
      default: return <Bot {...iconProps} />
    }
  }

  if (!isOpen) return null

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }}>
      {/* Full-screen Mobile Menu */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          backgroundColor: theme.background,
          transform: [{ translateX: slideAnim }],
          opacity: overlayAnim,
        }}
      >
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          {/* Header */}
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              paddingHorizontal: 20, 
              paddingVertical: 12,
            }}>
              <ScalePressable
                onPress={openSettings}
                style={{ 
                  width: 40, 
                  height: 40, 
                  alignItems: 'center', 
                  justifyContent: 'center',
                }}
              >
                <User size={22} color={theme.foreground} />
              </ScalePressable>

              <Text style={{ 
                fontSize: 20, 
                fontWeight: '600', 
                color: theme.foreground, 
                letterSpacing: 0.02 * 20,
              }}>
                2Hands
              </Text>

              <ScalePressable 
                onPress={openNotifications}
                style={{ 
                  width: 40, 
                  height: 40, 
                  alignItems: 'center', 
                  justifyContent: 'center',
                }}
              >
                <View>
                  <Bell size={22} color={theme.foreground} />
                  <NotificationBadge 
                    count={0}
                    style={{ position: 'absolute', top: -6, right: -8 }} 
                  />
                </View>
              </ScalePressable>
            </View>

          <ScrollView 
            style={{ flex: 1 }} 
            contentContainerStyle={{ paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
          >
            {/* List Items */}
            <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
              {/* AI Manager */}
              <ScalePressable
                  onPress={() => handleNavigation('/(app)/(tabs)/')}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    marginBottom: 4,
                    borderRadius: 16,
                    backgroundColor: isDark ? '#2C2B27' : '#F5F3F0',
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                >
                  <Image 
                    source={require('../../assets/icon.png')} 
                    style={{ width: 40, height: 40, borderRadius: 12 }} 
                    resizeMode="cover"
                  />
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: theme.foreground }}>
                    {aiName || '2Hands'}
                  </Text>
                  <ChevronRight size={18} color={colors.mutedForeground} />
                </ScalePressable>

              {/* Your Agents Section */}
              {agents.length > 0 && (
                  <Text style={{ 
                    fontSize: 11, 
                    fontWeight: '600', 
                    color: colors.mutedForeground, 
                    marginTop: 16,
                    marginBottom: 12,
                    marginLeft: 4,
                  }}>
                    Your agents
                  </Text>
              )}

              {agents.map((agent) => (
                  <ScalePressable
                    key={agent.id}
                    onPress={() => handleNavigation(`/(app)/agent/${agent.id}`)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      marginBottom: 4,
                      borderRadius: 12,
                    }}
                  >
                    <View style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {getAgentIcon(agent.type)}
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: theme.foreground }} numberOfLines={1}>
                          {agent.name}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                          {new Date(agent.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 13, color: colors.mutedForeground, marginTop: 1 }} numberOfLines={1}>
                        {(agent.config as any)?.description || agent.type}
                      </Text>
                    </View>
                  </ScalePressable>
              ))}
            </View>
          </ScrollView>

          {/* Share Banner - Pinned to Bottom */}
          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            <ScalePressable
              onPress={openReferral}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingVertical: 16,
                paddingHorizontal: 18,
                borderRadius: 16,
                backgroundColor: isDark ? '#2C2B27' : '#F5F3F0',
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Image 
                source={require('../../assets/icon.png')} 
                style={{ width: 40, height: 40, borderRadius: 12 }} 
                resizeMode="cover"
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: theme.foreground }}>Share 2Hands</Text>
                <Text style={{ fontSize: 13, color: colors.mutedForeground, marginTop: 2 }}>Get 500 credits each</Text>
              </View>
              <ChevronRight size={18} color={theme.muted} />
            </ScalePressable>
          </View>

          {/* Referral View - Slides in from right */}
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: theme.background,
              transform: [{ translateX: referralSlideAnim }],
            }}
          >
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
              {/* Referral Header */}
              <View style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' }}>
                <ScalePressable
                  onPress={closeReferral}
                  style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
                >
                  <ChevronLeft size={24} color={theme.foreground} />
                </ScalePressable>
              </View>

              {referralLoading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator size="large" color={theme.foreground} />
                </View>
              ) : (
                <ScrollView 
                  style={{ flex: 1 }} 
                  contentContainerStyle={{ paddingBottom: 40 }} 
                  showsVerticalScrollIndicator={false}
                >
                  <View style={{ paddingHorizontal: 24 }}>
                    {/* Badge */}
                    <FadeInDownView delay={100}>
                      <View style={{ alignItems: 'flex-start', marginBottom: 16 }}>
                        <View style={{ 
                          paddingHorizontal: 12, 
                          paddingVertical: 6, 
                          borderRadius: 20, 
                          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                          borderWidth: 1,
                          borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                        }}>
                          <Text style={{ fontSize: 11, fontWeight: '500', color: colors.mutedForeground, letterSpacing: 0.3 }}>
                            Earn 500+ credits
                          </Text>
                        </View>
                      </View>
                    </FadeInDownView>

                    {/* Title + Logo Row */}
                    <FadeInDownView delay={150}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
                        <View style={{ flex: 1, paddingRight: 16 }}>
                          <Text style={{ fontSize: 32, fontWeight: '700', color: theme.foreground, letterSpacing: -1, lineHeight: 38 }}>
                            Share the future
                          </Text>
                          <Text style={{ fontSize: 16, color: colors.mutedForeground, marginTop: 4 }}>
                            and earn free credits
                          </Text>
                        </View>
                        <View style={{
                          width: 80,
                          height: 80,
                          borderRadius: 28,
                          backgroundColor: isDark ? '#2C2B27' : '#F5F3F0',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: theme.border,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 8 },
                          shadowOpacity: 0.15,
                          shadowRadius: 24,
                          elevation: 8,
                        }}>
                          <Image 
                            source={require('../../assets/icon.png')} 
                            style={{ width: 40, height: 40, opacity: isDark ? 0.9 : 1 }} 
                            resizeMode="contain"
                          />
                        </View>
                      </View>
                    </FadeInDownView>

                    {/* How it works */}
                    <FadeInDownView delay={200}>
                      <View style={{ marginBottom: 32 }}>
                        <Text style={{ 
                          fontSize: 13, 
                          fontWeight: '500', 
                          color: colors.mutedForeground, 
                          marginBottom: 20 
                        }}>
                          How it works
                        </Text>

                        <View style={{ gap: 20 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                            <View style={{ width: 20, alignItems: 'center' }}>
                              <Zap size={16} color={colors.mutedForeground} />
                            </View>
                            <Text style={{ fontSize: 14, color: colors.mutedForeground, fontWeight: '500' }}>
                              Share your invite link
                            </Text>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                            <View style={{ width: 20, alignItems: 'center' }}>
                              <Gift size={16} color={colors.mutedForeground} />
                            </View>
                            <Text style={{ fontSize: 14, color: colors.mutedForeground }}>
                              They sign up and get <Text style={{ fontWeight: '600', color: theme.foreground }}>extra 500 credits</Text>
                            </Text>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                            <View style={{ width: 20, alignItems: 'center' }}>
                              <MessageCircle size={16} color={colors.mutedForeground} />
                            </View>
                            <Text style={{ fontSize: 14, color: colors.mutedForeground }}>
                              You get <Text style={{ fontWeight: '600', color: theme.foreground }}>500 credits</Text> when they create their first agent
                            </Text>
                          </View>
                        </View>
                      </View>
                    </FadeInDownView>

                    {/* Stats & Link Section */}
                    <FadeInDownView delay={250}>
                      <View style={{ marginBottom: 24 }}>
                        <Text style={{ fontSize: 14, color: colors.mutedForeground, marginBottom: 16 }}>
                          Your invite link has been used by <Text style={{ fontWeight: '700', color: theme.foreground }}>{referral?.referralCount || 0}</Text> users
                        </Text>

                        {/* Link Display */}
                        <View style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          paddingHorizontal: 14,
                          paddingVertical: 14,
                          backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                          borderRadius: 16,
                          borderWidth: 1,
                          borderColor: theme.border,
                          marginBottom: 12,
                        }}>
                          <LinkIcon size={14} color={colors.mutedForeground} />
                          <Text 
                            style={{ fontSize: 13, color: colors.mutedForeground, flex: 1 }} 
                            numberOfLines={1}
                          >
                            {referral?.referralUrl || 'Loading...'}
                          </Text>
                        </View>

                        {/* Copy Button */}
                        <ScalePressable
                          onPress={copyToClipboard}
                          style={{
                            height: 48,
                            borderRadius: 14,
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'row',
                            gap: 8,
                            backgroundColor: copied 
                              ? (isDark ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)') 
                              : theme.primary,
                            borderWidth: copied ? 1 : 0,
                            borderColor: copied ? 'rgba(34,197,94,0.3)' : 'transparent',
                          }}
                        >
                          {copied ? (
                            <>
                              <Check size={16} color="#22C55E" />
                              <Text style={{ fontSize: 14, fontWeight: '600', color: '#22C55E' }}>
                                Copied to clipboard
                              </Text>
                            </>
                          ) : (
                            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.primaryForeground }}>
                              Copy link
                            </Text>
                          )}
                        </ScalePressable>
                      </View>
                    </FadeInDownView>

                    {/* Share Button */}
                    <FadeInDownView delay={300}>
                      <ScalePressable
                        onPress={shareReferral}
                        style={{
                          height: 52,
                          borderRadius: 16,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                          borderWidth: 1,
                          borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                        }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: '600', color: theme.foreground }}>
                          Share with friends
                        </Text>
                      </ScalePressable>
                    </FadeInDownView>

                    {/* Terms */}
                    <View style={{ marginTop: 32, alignItems: 'center' }}>
                      <ScalePressable
                        style={{
                          paddingHorizontal: 16,
                          paddingVertical: 8,
                          borderRadius: 20,
                          borderWidth: 1,
                          borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                        }}
                      >
                        <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                          View Terms and Conditions
                        </Text>
                      </ScalePressable>
                    </View>
                  </View>
                </ScrollView>
              )}
            </SafeAreaView>
          </Animated.View>

          {/* Settings View - Bottom Sheet */}
          <Animated.View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: SETTINGS_SHEET_HEIGHT,
              backgroundColor: theme.background,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              transform: [{ translateY: settingsSlideAnim }],
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -4 },
              shadowOpacity: 0.15,
              shadowRadius: 12,
              elevation: 10,
            }}
          >
            {/* Drag Handle */}
            <View 
              {...settingsPanResponder.panHandlers}
              style={{ 
                paddingTop: 10, 
                paddingBottom: 12,
                alignItems: 'center',
                width: '100%',
              }}
            >
              <View style={{
                width: 40,
                height: 5,
                borderRadius: 2.5,
                backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
              }} />
            </View>
            
            {/* Settings Header */}
            <View style={{ 
              paddingHorizontal: 20, 
              paddingBottom: 16,
            }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: theme.foreground, textAlign: 'left' }}>
                Settings
              </Text>
            </View>

            {settingsLoading ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color={theme.foreground} />
              </View>
            ) : (
              <ScrollView 
                style={{ flex: 1 }} 
                contentContainerStyle={{ paddingBottom: 40 }} 
                showsVerticalScrollIndicator={false}
              >
                {/* Plan & Credits Card */}
                <FadeInDownView delay={100}>
                  <View style={{ paddingHorizontal: 24, marginTop: 8, marginBottom: 24 }}>
                    <View style={{
                      backgroundColor: isDark ? '#2C2B27' : '#F5F3F0',
                      borderRadius: 16,
                      padding: 16,
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: theme.foreground }}>
                          {profile?.plan_type || 'Free'}
                        </Text>
                        {(!profile?.plan_type || profile?.plan_type === 'free') && (
                          <ScalePressable
                            onPress={handleManageBilling}
                            style={{
                              backgroundColor: theme.surfaceHover,
                              paddingHorizontal: 14,
                              paddingVertical: 8,
                              borderRadius: 8,
                            }}
                          >
                            <Text style={{ fontSize: 13, fontWeight: '600', color: theme.foreground }}>Upgrade</Text>
                          </ScalePressable>
                        )}
                      </View>
                      
                      <View style={{ height: 1, backgroundColor: theme.border, marginBottom: 16 }} />
                      
                      <ScalePressable
                        onPress={handleManageBilling}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                      >
                        <Text style={{ fontSize: 14, color: colors.mutedForeground }}>Credits</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Sparkles size={14} color={colors.mutedForeground} />
                          <Text style={{ fontSize: 14, fontWeight: '600', color: theme.foreground }}>
                            {profile?.credits || credits || 0}
                          </Text>
                          <ChevronRight size={16} color={colors.mutedForeground} />
                        </View>
                      </ScalePressable>
                    </View>
                  </View>
                </FadeInDownView>

                {/* 2Hands Section */}
                <View style={{ paddingHorizontal: 24 }}>
                  <FadeInDownView delay={150}>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: colors.mutedForeground, marginBottom: 12, marginLeft: 4 }}>
                      2Hands
                    </Text>
                  </FadeInDownView>

                  <FadeInDownView delay={200}>
                    <ScalePressable
                      onPress={() => { closeSettings(); setTimeout(openReferral, 100) }}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 }}
                    >
                      <Gift size={20} color={colors.mutedForeground} />
                      <Text style={{ flex: 1, fontSize: 15, color: theme.foreground, fontWeight: '500' }}>Share with a friend</Text>
                      <ChevronRight size={18} color={colors.mutedForeground} />
                    </ScalePressable>
                  </FadeInDownView>
                  
                  <View style={{ height: 1, backgroundColor: theme.border, marginLeft: 34 }} />
                  
                  <FadeInDownView delay={250}>
                    <ScalePressable 
                      onPress={() => openSettingsPage('scheduled')}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 }}
                    >
                      <Calendar size={20} color={colors.mutedForeground} />
                      <Text style={{ flex: 1, fontSize: 15, color: theme.foreground, fontWeight: '500' }}>Scheduled agents</Text>
                      {scheduledAgents.length > 0 && (
                        <Text style={{ fontSize: 14, color: colors.mutedForeground, marginRight: 4 }}>{scheduledAgents.length}</Text>
                      )}
                      <ChevronRight size={18} color={colors.mutedForeground} />
                    </ScalePressable>
                  </FadeInDownView>
                  
                  <View style={{ height: 1, backgroundColor: theme.border, marginLeft: 34 }} />
                  
                  <FadeInDownView delay={300}>
                    <ScalePressable 
                      onPress={openCredentialsPage}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 }}
                    >
                      <Shield size={20} color={colors.mutedForeground} />
                      <Text style={{ flex: 1, fontSize: 15, color: theme.foreground, fontWeight: '500' }}>Credentials</Text>
                      <ChevronRight size={18} color={colors.mutedForeground} />
                    </ScalePressable>
                  </FadeInDownView>

                  <View style={{ height: 1, backgroundColor: theme.border, marginLeft: 34 }} />
                  
                  <FadeInDownView delay={350}>
                    <ScalePressable 
                      onPress={openTeamPage}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 }}
                    >
                      <Users size={20} color={colors.mutedForeground} />
                      <Text style={{ flex: 1, fontSize: 15, color: theme.foreground, fontWeight: '500' }}>Team & Workspace</Text>
                      <ChevronRight size={18} color={colors.mutedForeground} />
                    </ScalePressable>
                  </FadeInDownView>
                  
                  <View style={{ height: 1, backgroundColor: theme.border, marginLeft: 34 }} />
                  
                  <FadeInDownView delay={400}>
                    <ScalePressable 
                      onPress={openIntegrationsPage}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 }}
                    >
                      <Plug size={20} color={colors.mutedForeground} />
                      <Text style={{ flex: 1, fontSize: 15, color: theme.foreground, fontWeight: '500' }}>Integrations</Text>
                      <ChevronRight size={18} color={colors.mutedForeground} />
                    </ScalePressable>
                  </FadeInDownView>
                  
                  <View style={{ height: 1, backgroundColor: theme.border, marginLeft: 34 }} />
                  
                  <FadeInDownView delay={450}>
                    <ScalePressable 
                      onPress={openApiKeysPage}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 }}
                    >
                      <KeyRound size={20} color={colors.mutedForeground} />
                      <Text style={{ flex: 1, fontSize: 15, color: theme.foreground, fontWeight: '500' }}>API Keys</Text>
                      <ChevronRight size={18} color={colors.mutedForeground} />
                    </ScalePressable>
                  </FadeInDownView>
                  
                  <View style={{ height: 1, backgroundColor: theme.border, marginLeft: 34 }} />
                  
                  <FadeInDownView delay={500}>
                    <ScalePressable 
                      onPress={openWebhooksPage}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 }}
                    >
                      <Webhook size={20} color={colors.mutedForeground} />
                      <Text style={{ flex: 1, fontSize: 15, color: theme.foreground, fontWeight: '500' }}>Webhooks</Text>
                      <ChevronRight size={18} color={colors.mutedForeground} />
                    </ScalePressable>
                  </FadeInDownView>
                  
                  <View style={{ height: 1, backgroundColor: theme.border, marginLeft: 34 }} />
                  
                  <FadeInDownView delay={550}>
                    <ScalePressable 
                      onPress={openAuditLogPage}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 }}
                    >
                      <ScrollText size={20} color={colors.mutedForeground} />
                      <Text style={{ flex: 1, fontSize: 15, color: theme.foreground, fontWeight: '500' }}>Audit Log</Text>
                      <ChevronRight size={18} color={colors.mutedForeground} />
                    </ScalePressable>
                  </FadeInDownView>
                  
                  <View style={{ height: 1, backgroundColor: theme.border, marginLeft: 34 }} />
                  
                  <FadeInDownView delay={600}>
                    <ScalePressable 
                      onPress={openUsagePage}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 }}
                    >
                      <BarChart3 size={20} color={colors.mutedForeground} />
                      <Text style={{ flex: 1, fontSize: 15, color: theme.foreground, fontWeight: '500' }}>Usage & Analytics</Text>
                      <ChevronRight size={18} color={colors.mutedForeground} />
                    </ScalePressable>
                  </FadeInDownView>
                </View>

                {/* General Section */}
                <View style={{ paddingHorizontal: 24, marginTop: 32 }}>
                  <FadeInDownView delay={350}>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: colors.mutedForeground, marginBottom: 12, marginLeft: 4 }}>
                      General
                    </Text>
                  </FadeInDownView>

                  <FadeInDownView delay={400}>
                    <ScalePressable 
                      onPress={() => openSettingsPage('account')}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 }}
                    >
                      <User size={20} color={colors.mutedForeground} />
                      <Text style={{ flex: 1, fontSize: 15, color: theme.foreground, fontWeight: '500' }}>Account</Text>
                      <ChevronRight size={18} color={colors.mutedForeground} />
                    </ScalePressable>
                  </FadeInDownView>
                  
                  <View style={{ height: 1, backgroundColor: theme.border, marginLeft: 34 }} />
                  
                  <FadeInDownView delay={450}>
                    <ScalePressable 
                      onPress={() => openSettingsPage('language')}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 }}
                    >
                      <Globe size={20} color={colors.mutedForeground} />
                      <Text style={{ flex: 1, fontSize: 15, color: theme.foreground, fontWeight: '500' }}>Language</Text>
                      <Text style={{ fontSize: 14, color: colors.mutedForeground, marginRight: 4 }}>
                        {selectedLanguage === 'en' ? 'English' : selectedLanguage === 'sv' ? 'Svenska' : selectedLanguage}
                      </Text>
                      <ChevronRight size={18} color={colors.mutedForeground} />
                    </ScalePressable>
                  </FadeInDownView>
                  
                  <View style={{ height: 1, backgroundColor: theme.border, marginLeft: 34 }} />
                  
                  <FadeInDownView delay={500}>
                    <ScalePressable 
                      onPress={() => openSettingsPage('appearance')}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 }}
                    >
                      <Moon size={20} color={colors.mutedForeground} />
                      <Text style={{ flex: 1, fontSize: 15, color: theme.foreground, fontWeight: '500' }}>Appearance</Text>
                      <Text style={{ fontSize: 14, color: colors.mutedForeground, marginRight: 4 }}>
                        {themePreference === 'system' ? 'System' : themePreference === 'light' ? 'Light' : 'Dark'}
                      </Text>
                      <ChevronRight size={18} color={colors.mutedForeground} />
                    </ScalePressable>
                  </FadeInDownView>
                  
                  <View style={{ height: 1, backgroundColor: theme.border, marginLeft: 34 }} />
                  
                  <FadeInDownView delay={550}>
                    <ScalePressable 
                      onPress={() => openSettingsPage('notifications')}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 }}
                    >
                      <Bell size={20} color={colors.mutedForeground} />
                      <Text style={{ flex: 1, fontSize: 15, color: theme.foreground, fontWeight: '500' }}>Notifications</Text>
                      <ChevronRight size={18} color={colors.mutedForeground} />
                    </ScalePressable>
                  </FadeInDownView>
                  
                  <View style={{ height: 1, backgroundColor: theme.border, marginLeft: 34 }} />
                  
                  <FadeInDownView delay={600}>
                    <ScalePressable 
                      onPress={() => Linking.openURL('https://2hands.ai/support')}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 }}
                    >
                      <HelpCircle size={20} color={colors.mutedForeground} />
                      <Text style={{ flex: 1, fontSize: 15, color: theme.foreground, fontWeight: '500' }}>Help & Support</Text>
                      <ChevronRight size={18} color={colors.mutedForeground} />
                    </ScalePressable>
                  </FadeInDownView>
                </View>

                {/* Developer & AI Section */}
                <View style={{ paddingHorizontal: 24, marginTop: 32 }}>
                  <FadeInDownView delay={650}>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: colors.mutedForeground, marginBottom: 12, marginLeft: 4 }}>
                      Developer & AI
                    </Text>
                  </FadeInDownView>

                  <FadeInDownView delay={700}>
                    <ScalePressable 
                      onPress={() => openSettingsPage('proactive')}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 }}
                    >
                      <Sparkles size={20} color={colors.mutedForeground} />
                      <Text style={{ flex: 1, fontSize: 15, color: theme.foreground, fontWeight: '500' }}>Proactive Features</Text>
                      <ChevronRight size={18} color={colors.mutedForeground} />
                    </ScalePressable>
                  </FadeInDownView>
                  
                  <View style={{ height: 1, backgroundColor: theme.border, marginLeft: 34 }} />
                  
                  <FadeInDownView delay={750}>
                    <ScalePressable 
                      onPress={() => openSettingsPage('personalization')}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 }}
                    >
                      <MessageSquare size={20} color={colors.mutedForeground} />
                      <Text style={{ flex: 1, fontSize: 15, color: theme.foreground, fontWeight: '500' }}>AI Personalization</Text>
                      <ChevronRight size={18} color={colors.mutedForeground} />
                    </ScalePressable>
                  </FadeInDownView>
                  
                  <View style={{ height: 1, backgroundColor: theme.border, marginLeft: 34 }} />
                  
                  <FadeInDownView delay={800}>
                    <ScalePressable 
                      onPress={() => openSettingsPage('memory')}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 14 }}
                    >
                      <Brain size={20} color={colors.mutedForeground} />
                      <Text style={{ flex: 1, fontSize: 15, color: theme.foreground, fontWeight: '500' }}>Memory & Learning</Text>
                      <ChevronRight size={18} color={colors.mutedForeground} />
                    </ScalePressable>
                  </FadeInDownView>
                </View>

                {/* Sign Out */}
                <View style={{ paddingHorizontal: 24, marginTop: 32 }}>
                  <FadeInDownView delay={650}>
                    <ScalePressable
                      onPress={handleSignOut}
                      style={{ 
                        flexDirection: 'row', 
                        alignItems: 'center', 
                        paddingVertical: 16, 
                        gap: 14,
                        backgroundColor: isDark ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.05)',
                        paddingHorizontal: 12,
                        borderRadius: 12,
                      }}
                    >
                      <LogOut size={20} color="#EF4444" />
                      <Text style={{ fontSize: 15, color: '#EF4444', fontWeight: '500' }}>Sign Out</Text>
                    </ScalePressable>
                  </FadeInDownView>
                </View>

                  {/* Version */}
                  <View style={{ paddingHorizontal: 24, marginTop: 32, alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, color: colors.mutedForeground }}>2Hands v1.0.0</Text>
                  </View>
                </ScrollView>
              )}
          </Animated.View>

          {/* Settings Sub-Page View - Slides in from right */}
          <Animated.View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: theme.background,
                transform: [{ translateX: settingsSubSlideAnim }],
              }}
            >
              <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
                {/* Sub-page Header */}
                <View style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' }}>
                  <ScalePressable
                    onPress={closeSettingsPage}
                    style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <ChevronLeft size={24} color={theme.foreground} />
                  </ScalePressable>
                  <Text style={{ fontSize: 17, fontWeight: '600', color: theme.foreground, marginLeft: 8 }}>
                    {settingsPage === 'scheduled' && 'Scheduled Agents'}
                    {settingsPage === 'credentials' && 'Credentials'}
                    {settingsPage === 'account' && 'Account'}
                    {settingsPage === 'appearance' && 'Appearance'}
                    {settingsPage === 'notifications' && 'Notifications'}
                    {settingsPage === 'team' && 'Team & Workspace'}
                    {settingsPage === 'integrations' && 'Integrations'}
                    {settingsPage === 'api-keys' && 'API Keys'}
                    {settingsPage === 'webhooks' && 'Webhooks'}
                    {settingsPage === 'audit-log' && 'Audit Log'}
                    {settingsPage === 'usage' && 'Usage & Analytics'}
                    {settingsPage === 'language' && 'Language'}
                    {settingsPage === 'proactive' && 'Proactive Features'}
                    {settingsPage === 'personalization' && 'AI Personalization'}
                    {settingsPage === 'memory' && 'Memory & Learning'}
                  </Text>
                </View>

                <ScrollView 
                  style={{ flex: 1 }} 
                  contentContainerStyle={{ paddingBottom: 40 }} 
                  showsVerticalScrollIndicator={false}
                >
                  {/* Scheduled Agents */}
                  {settingsPage === 'scheduled' && (
                    <View style={{ paddingHorizontal: 24 }}>
                      {scheduledAgents.length === 0 ? (
                        <FadeInDownView delay={100} style={{ alignItems: 'center', paddingVertical: 60 }}>
                          <Calendar size={48} color={theme.muted} style={{ opacity: 0.5 }} />
                          <Text style={{ fontSize: 16, fontWeight: '600', color: theme.foreground, marginTop: 16 }}>
                            No scheduled agents
                          </Text>
                          <Text style={{ fontSize: 14, color: colors.mutedForeground, marginTop: 8, textAlign: 'center' }}>
                            Create an agent with a schedule to see it here
                          </Text>
                        </FadeInDownView>
                      ) : (
                        scheduledAgents.map((agent, index) => (
                          <FadeInDownView key={agent.id} delay={index * 50}>
                            <ScalePressable
                              onPress={() => {
                                onClose()
                                setTimeout(() => router.push(`/(app)/agent/${agent.id}` as any), 150)
                              }}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                paddingVertical: 16,
                                gap: 14,
                                borderBottomWidth: 1,
                                borderBottomColor: theme.border,
                              }}
                            >
                              <View style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}>
                                <Calendar size={18} color={colors.mutedForeground} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 15, fontWeight: '600', color: theme.foreground }}>{agent.name}</Text>
                                <Text style={{ fontSize: 13, color: colors.mutedForeground, marginTop: 2 }}>
                                  {agent.next_run_at ? formatNextRun(agent.next_run_at) : 'Scheduled'}
                                </Text>
                              </View>
                              <ChevronRight size={18} color={colors.mutedForeground} />
                            </ScalePressable>
                          </FadeInDownView>
                        ))
                      )}
                    </View>
                  )}

                  {/* Credentials */}
                  {settingsPage === 'credentials' && (
                    <View style={{ paddingHorizontal: 24 }}>
                      <FadeInDownView delay={100}>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 16, marginLeft: 4 }}>
                          Saved Credentials
                        </Text>
                      </FadeInDownView>
                      
                      {credentialsLoading ? (
                        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                          <ActivityIndicator size="large" color={theme.foreground} />
                        </View>
                      ) : credentials.length === 0 ? (
                        <FadeInDownView delay={150} style={{ alignItems: 'center', paddingVertical: 40 }}>
                          <View style={{
                            width: 64,
                            height: 64,
                            borderRadius: 32,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: 16,
                          }}>
                            <Key size={28} color={colors.mutedForeground} />
                          </View>
                          <Text style={{ fontSize: 16, fontWeight: '600', color: theme.foreground }}>
                            No credentials saved
                          </Text>
                          <Text style={{ fontSize: 14, color: colors.mutedForeground, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
                            Add credentials to allow your agents to log into websites and services automatically
                          </Text>
                        </FadeInDownView>
                      ) : (
                        credentials.map((cred, index) => (
                          <FadeInDownView key={cred.id} delay={150 + index * 50}>
                            <ScalePressable
                              onPress={() => {}} // Placeholder or navigation if needed
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                paddingVertical: 16,
                                gap: 14,
                                borderBottomWidth: index < credentials.length - 1 ? 1 : 0,
                                borderBottomColor: theme.border,
                              }}
                            >
                              <View style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}>
                                <Key size={18} color={colors.mutedForeground} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 15, fontWeight: '600', color: theme.foreground }}>
                                  {cred.service_name}
                                </Text>
                                <Text style={{ fontSize: 13, color: colors.mutedForeground, marginTop: 2 }}>
                                  {cred.credential_type} • Added {new Date(cred.created_at).toLocaleDateString()}
                                </Text>
                              </View>
                              <ScalePressable
                                onPress={() => {
                                  Alert.alert(
                                    'Delete Credential',
                                    `Are you sure you want to delete the credential for ${cred.service_name}?`,
                                    [
                                      { text: 'Cancel', style: 'cancel' },
                                      { 
                                        text: 'Delete', 
                                        style: 'destructive',
                                        onPress: () => {
                                          deleteCredential(cred.id)
                                        }
                                      },
                                    ]
                                  )
                                }}
                              >
                                <Trash2 size={18} color="#EF4444" />
                              </ScalePressable>
                            </ScalePressable>
                          </FadeInDownView>
                        ))
                      )}
                    </View>
                  )}

                  {/* Account */}
                  {settingsPage === 'account' && (
                    <View style={{ paddingHorizontal: 24 }}>
                      {/* Profile Info */}
                      <FadeInDownView delay={100}>
                        <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                          <View style={{
                            width: 80,
                            height: 80,
                            borderRadius: 40,
                            backgroundColor: '#22C55E',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            <Text style={{ color: '#FFFFFF', fontSize: 32, fontWeight: '700' }}>
                              {(isEditingName ? editedName : profile?.full_name)?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || '?'}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 20, fontWeight: '700', color: theme.foreground, marginTop: 16 }}>
                            {profile?.full_name || 'User'}
                          </Text>
                          <Text style={{ fontSize: 14, color: colors.mutedForeground, marginTop: 4 }}>
                            {user?.email}
                          </Text>
                        </View>
                      </FadeInDownView>

                      {/* Account Info */}
                      <View style={{ marginTop: 16 }}>
                        {/* Editable Full Name */}
                        <FadeInDownView delay={150}>
                          <View style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              <Text style={{ fontSize: 12, color: colors.mutedForeground }}>Full Name</Text>
                              {!isEditingName ? (
                                <ScalePressable onPress={startEditingName}>
                                  <Edit3 size={16} color={theme.muted} />
                                </ScalePressable>
                              ) : (
                                <View style={{ flexDirection: 'row', gap: 12 }}>
                                  <ScalePressable onPress={cancelEditingName}>
                                    <X size={18} color={theme.muted} />
                                  </ScalePressable>
                                  <ScalePressable onPress={saveProfileName} disabled={isSavingProfile}>
                                    {isSavingProfile ? (
                                      <ActivityIndicator size="small" color="#22C55E" />
                                    ) : (
                                      <Check size={18} color="#22C55E" />
                                    )}
                                  </ScalePressable>
                                </View>
                              )}
                            </View>
                            {isEditingName ? (
                              <TextInput
                                value={editedName}
                                onChangeText={setEditedName}
                                placeholder="Enter your name"
                                placeholderTextColor={theme.muted}
                                autoFocus
                                style={{
                                  fontSize: 15,
                                  color: theme.foreground,
                                  fontWeight: '500',
                                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                                  paddingHorizontal: 12,
                                  paddingVertical: 10,
                                  borderRadius: 8,
                                }}
                                onSubmitEditing={saveProfileName}
                                returnKeyType="done"
                              />
                            ) : (
                              <Text style={{ fontSize: 15, color: theme.foreground, fontWeight: '500' }}>
                                {profile?.full_name || 'Not set'}
                              </Text>
                            )}
                          </View>
                        </FadeInDownView>
                        
                        <FadeInDownView delay={200}>
                          <View style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 4 }}>Email</Text>
                            <Text style={{ fontSize: 15, color: theme.foreground, fontWeight: '500' }}>{user?.email}</Text>
                          </View>
                        </FadeInDownView>
                        
                        <FadeInDownView delay={250}>
                          <ScalePressable 
                            onPress={handleManageBilling}
                            style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.border }}
                          >
                            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 4 }}>Plan</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Text style={{ fontSize: 15, color: theme.foreground, fontWeight: '500' }}>
                                {profile?.plan_type ? profile.plan_type.charAt(0).toUpperCase() + profile.plan_type.slice(1) : 'Free'}
                              </Text>
                              <Text style={{ fontSize: 13, color: '#22C55E', fontWeight: '500' }}>Manage →</Text>
                            </View>
                          </ScalePressable>
                        </FadeInDownView>
                        
                        <FadeInDownView delay={300}>
                          <View style={{ paddingVertical: 16 }}>
                            <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 4 }}>Member Since</Text>
                            <Text style={{ fontSize: 15, color: theme.foreground, fontWeight: '500' }}>
                              {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Unknown'}
                            </Text>
                          </View>
                        </FadeInDownView>
                      </View>
                    </View>
                  )}

                  {/* Appearance */}
                  {settingsPage === 'appearance' && (
                    <View style={{ paddingHorizontal: 24 }}>
                      <FadeInDownView delay={100}>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 16, marginLeft: 4 }}>
                          Theme
                        </Text>
                      </FadeInDownView>
                      
                      {([
                        { id: 'system', label: 'System', desc: 'Follow device settings' },
                        { id: 'light', label: 'Light', desc: 'Always light mode' },
                        { id: 'dark', label: 'Dark', desc: 'Always dark mode' },
                      ] as const).map((option, index) => (
                        <FadeInDownView key={option.id} delay={150 + index * 50}>
                          <ScalePressable
                            onPress={() => handleThemeChange(option.id)}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingVertical: 16,
                              gap: 14,
                              borderBottomWidth: index < 2 ? 1 : 0,
                              borderBottomColor: theme.border,
                            }}
                          >
                            <View style={{
                              width: 40,
                              height: 40,
                              borderRadius: 20,
                              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}>
                              <Moon size={18} color={theme.muted} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 15, color: theme.foreground, fontWeight: '500' }}>{option.label}</Text>
                              <Text style={{ fontSize: 13, color: colors.mutedForeground, marginTop: 2 }}>{option.desc}</Text>
                            </View>
                            {themePreference === option.id && (
                              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' }}>
                                <Check size={14} color="#FFFFFF" strokeWidth={3} />
                              </View>
                            )}
                          </ScalePressable>
                        </FadeInDownView>
                      ))}
                      
                      <FadeInDownView delay={350}>
                        <Text style={{ fontSize: 13, color: colors.mutedForeground, marginTop: 16, lineHeight: 20 }}>
                          Theme preference is saved locally. Changes will apply next time you open the app.
                        </Text>
                      </FadeInDownView>
                    </View>
                  )}

                  {/* Notifications */}
                  {settingsPage === 'notifications' && (
                    <View style={{ paddingHorizontal: 24 }}>
                      <FadeInDownView delay={100}>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 16, marginLeft: 4 }}>
                          Push Notifications
                        </Text>
                      </FadeInDownView>
                      
                      {([
                        { key: 'agentUpdates', title: 'Agent Updates', desc: 'Get notified when agents complete tasks' },
                        { key: 'newFeatures', title: 'New Features', desc: 'Learn about new 2Hands features' },
                        { key: 'tips', title: 'Tips & Tricks', desc: 'Helpful tips to get more from 2Hands' },
                      ] as const).map((item, index) => (
                        <FadeInDownView key={item.key} delay={150 + index * 50}>
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingVertical: 16,
                              gap: 14,
                              borderBottomWidth: index < 2 ? 1 : 0,
                              borderBottomColor: theme.border,
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 15, color: theme.foreground, fontWeight: '500' }}>{item.title}</Text>
                              <Text style={{ fontSize: 13, color: colors.mutedForeground, marginTop: 2 }}>{item.desc}</Text>
                            </View>
                            <Switch
                              value={notificationPrefs[item.key]}
                              onValueChange={(value) => handleNotificationToggle(item.key, value)}
                              trackColor={{ false: isDark ? '#3a3a3a' : '#e5e5e5', true: '#22C55E' }}
                              thumbColor="#FFFFFF"
                              ios_backgroundColor={isDark ? '#3a3a3a' : '#e5e5e5'}
                            />
                          </View>
                        </FadeInDownView>
                      ))}
                    </View>
                  )}

                  {/* Team & Workspace */}
                  {settingsPage === 'team' && (
                    <View style={{ paddingHorizontal: 24 }}>
                      {/* Workspace Selector */}
                      {workspaces.length > 0 && (
                        <FadeInDownView delay={100}>
                          <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 12, marginLeft: 4 }}>
                            Workspace
                          </Text>
                          <View style={{ gap: 8, marginBottom: 24 }}>
                            {workspaces.map((ws, index) => (
                              <ScalePressable
                                key={ws.id}
                                onPress={() => {
                                  setSelectedWorkspace(ws.id)
                                  loadWorkspaceMembers(ws.id)
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                                }}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  padding: 16,
                                  borderRadius: 12,
                                  backgroundColor: selectedWorkspace === ws.id 
                                    ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)')
                                    : 'transparent',
                                  borderWidth: 1,
                                  borderColor: selectedWorkspace === ws.id ? theme.border : 'transparent',
                                }}
                              >
                                <View style={{
                                  width: 40,
                                  height: 40,
                                  borderRadius: 20,
                                  backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}>
                                  <Users size={20} color={colors.mutedForeground} />
                                </View>
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                  <Text style={{ fontSize: 15, fontWeight: '600', color: theme.foreground }}>
                                    {ws.name}
                                  </Text>
                                  <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
                                    {ws.memberCount} members • {ws.plan} plan
                                  </Text>
                                </View>
                                {selectedWorkspace === ws.id && (
                                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' }}>
                                    <Check size={14} color="#FFFFFF" strokeWidth={3} />
                                  </View>
                                )}
                              </ScalePressable>
                            ))}
                          </View>
                        </FadeInDownView>
                      )}

                      {/* Invite Button */}
                      <FadeInDownView delay={150}>
                        <ScalePressable
                          onPress={() => setShowInviteModal(true)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            paddingVertical: 14,
                            borderRadius: 12,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                            gap: 8,
                            marginBottom: 24,
                          }}
                        >
                          <UserPlus size={20} color={theme.foreground} />
                          <Text style={{ fontSize: 15, fontWeight: '600', color: theme.foreground }}>
                            Invite Member
                          </Text>
                        </ScalePressable>
                      </FadeInDownView>

                      {/* Pending Invites */}
                      {invites.length > 0 && (
                        <FadeInDownView delay={200}>
                          <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 12, marginLeft: 4 }}>
                            Pending Invites ({invites.length})
                          </Text>
                          {invites.map((invite, index) => (
                            <View
                              key={invite.id}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                paddingVertical: 12,
                                borderBottomWidth: index < invites.length - 1 ? 1 : 0,
                                borderBottomColor: theme.border,
                              }}
                            >
                              <View style={{
                                width: 36,
                                height: 36,
                                borderRadius: 18,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}>
                                <Mail size={16} color={colors.mutedForeground} />
                              </View>
                              <View style={{ flex: 1, marginLeft: 12 }}>
                                <Text style={{ fontSize: 14, color: theme.foreground }}>{invite.email}</Text>
                                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>{invite.role}</Text>
                              </View>
                              <ScalePressable
                                onPress={() => cancelInvite(invite.id)}
                                style={{ padding: 8 }}
                              >
                                <X size={18} color="#EF4444" />
                              </ScalePressable>
                            </View>
                          ))}
                        </FadeInDownView>
                      )}

                      {/* Members List */}
                      <FadeInDownView delay={250}>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 12, marginLeft: 4 }}>
                          Members ({members.length})
                        </Text>
                        {teamLoading ? (
                          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                            <ActivityIndicator size="large" color={theme.foreground} />
                          </View>
                        ) : members.length === 0 ? (
                          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                            <Users size={48} color={colors.mutedForeground} style={{ opacity: 0.5 }} />
                            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.foreground, marginTop: 16 }}>
                              No members yet
                            </Text>
                            <Text style={{ fontSize: 14, color: colors.mutedForeground, marginTop: 8, textAlign: 'center' }}>
                              Invite team members to collaborate
                            </Text>
                          </View>
                        ) : (
                          members.map((member, index) => (
                            <View
                              key={member.id}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                paddingVertical: 12,
                                borderBottomWidth: index < members.length - 1 ? 1 : 0,
                                borderBottomColor: theme.border,
                              }}
                            >
                              <View style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                backgroundColor: '#22C55E',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}>
                                <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
                                  {(member.displayName || member.email).charAt(0).toUpperCase()}
                                </Text>
                              </View>
                              <View style={{ flex: 1, marginLeft: 12 }}>
                                <Text style={{ fontSize: 15, fontWeight: '500', color: theme.foreground }}>
                                  {member.displayName || member.email}
                                </Text>
                                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                                  {member.role} • {member.creditsUsedThisMonth} credits this month
                                </Text>
                              </View>
                              {member.role !== 'owner' && (
                                <ScalePressable
                                  onPress={() => removeMember(member.id)}
                                  style={{ padding: 8 }}
                                >
                                  <Trash2 size={18} color="#EF4444" />
                                </ScalePressable>
                              )}
                            </View>
                          ))
                        )}
                      </FadeInDownView>
                    </View>
                  )}

                  {/* Integrations */}
                  {settingsPage === 'integrations' && (
                    <View style={{ paddingHorizontal: 24 }}>
                      <FadeInDownView delay={100}>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 16, marginLeft: 4 }}>
                          Connected Services ({integrations.filter(i => i.connected).length}/{integrations.length})
                        </Text>
                      </FadeInDownView>
                      
                      {integrationsLoading ? (
                        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                          <ActivityIndicator size="large" color={theme.foreground} />
                        </View>
                      ) : integrations.length === 0 ? (
                        <FadeInDownView delay={150} style={{ alignItems: 'center', paddingVertical: 40 }}>
                          <View style={{
                            width: 64,
                            height: 64,
                            borderRadius: 32,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: 16,
                          }}>
                            <Plug size={28} color={colors.mutedForeground} />
                          </View>
                          <Text style={{ fontSize: 16, fontWeight: '600', color: theme.foreground }}>
                            No integrations yet
                          </Text>
                          <Text style={{ fontSize: 14, color: colors.mutedForeground, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
                            Connect your favorite services to enable powerful automations
                          </Text>
                        </FadeInDownView>
                      ) : (
                        integrations.map((integration, index) => (
                          <FadeInDownView key={integration.id} delay={150 + index * 50}>
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                paddingVertical: 16,
                                borderBottomWidth: index < integrations.length - 1 ? 1 : 0,
                                borderBottomColor: theme.border,
                              }}
                            >
                              <View style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}>
                                <Plug size={18} color={colors.mutedForeground} />
                              </View>
                              <View style={{ flex: 1, marginLeft: 12 }}>
                                <Text style={{ fontSize: 15, fontWeight: '600', color: theme.foreground }}>
                                  {integration.service_name}
                                </Text>
                                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                                  {integration.credential_type}
                                </Text>
                              </View>
                              <View style={{
                                paddingHorizontal: 12,
                                paddingVertical: 6,
                                borderRadius: 12,
                                backgroundColor: integration.connected 
                                  ? (isDark ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.1)')
                                  : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'),
                              }}>
                                <Text style={{ 
                                  fontSize: 12, 
                                  fontWeight: '500',
                                  color: integration.connected ? '#22C55E' : colors.mutedForeground 
                                }}>
                                  {integration.connected ? 'Connected' : 'Connect'}
                                </Text>
                              </View>
                            </View>
                          </FadeInDownView>
                        ))
                      )}
                    </View>
                  )}

                  {/* API Keys */}
                  {settingsPage === 'api-keys' && (
                    <View style={{ paddingHorizontal: 24 }}>
                      <FadeInDownView delay={100}>
                        <ScalePressable
                          onPress={() => setShowCreateKeyModal(true)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            paddingVertical: 14,
                            borderRadius: 12,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                            gap: 8,
                            marginBottom: 24,
                          }}
                        >
                          <Plus size={20} color={theme.foreground} />
                          <Text style={{ fontSize: 15, fontWeight: '600', color: theme.foreground }}>
                            Create API Key
                          </Text>
                        </ScalePressable>
                      </FadeInDownView>
                      
                      {apiKeysLoading ? (
                        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                          <ActivityIndicator size="large" color={theme.foreground} />
                        </View>
                      ) : apiKeys.length === 0 ? (
                        <FadeInDownView delay={150} style={{ alignItems: 'center', paddingVertical: 40 }}>
                          <View style={{
                            width: 64,
                            height: 64,
                            borderRadius: 32,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: 16,
                          }}>
                            <KeyRound size={28} color={colors.mutedForeground} />
                          </View>
                          <Text style={{ fontSize: 16, fontWeight: '600', color: theme.foreground }}>
                            No API keys yet
                          </Text>
                          <Text style={{ fontSize: 14, color: colors.mutedForeground, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
                            Create API keys to access 2Hands programmatically
                          </Text>
                        </FadeInDownView>
                      ) : (
                        apiKeys.map((key, index) => (
                          <FadeInDownView key={key.id} delay={150 + index * 50}>
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                paddingVertical: 16,
                                borderBottomWidth: index < apiKeys.length - 1 ? 1 : 0,
                                borderBottomColor: theme.border,
                              }}
                            >
                              <View style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}>
                                <KeyRound size={18} color={colors.mutedForeground} />
                              </View>
                              <View style={{ flex: 1, marginLeft: 12 }}>
                                <Text style={{ fontSize: 15, fontWeight: '600', color: theme.foreground }}>
                                  {key.name}
                                </Text>
                                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                                  Created {new Date(key.createdAt).toLocaleDateString()}
                                  {key.lastUsedAt && ` • Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`}
                                </Text>
                              </View>
                              <ScalePressable
                                onPress={() => {
                                  Alert.alert(
                                    'Delete API Key',
                                    'Are you sure you want to delete this API key? This action cannot be undone.',
                                    [
                                      { text: 'Cancel', style: 'cancel' },
                                      { 
                                        text: 'Delete', 
                                        style: 'destructive',
                                        onPress: async () => {
                                          try {
                                            const res = await fetch(`/api/api-keys/${key.id}`, { method: 'DELETE' })
                                            if (res.ok) {
                                              setApiKeys(prev => prev.filter(k => k.id !== key.id))
                                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
                                            }
                                          } catch (error) {
                                            console.error('Failed to delete API key:', error)
                                          }
                                        }
                                      },
                                    ]
                                  )
                                }}
                                style={{ padding: 8 }}
                              >
                                <Trash2 size={18} color="#EF4444" />
                              </ScalePressable>
                            </View>
                          </FadeInDownView>
                        ))
                      )}
                    </View>
                  )}

                  {/* Webhooks */}
                  {settingsPage === 'webhooks' && (
                    <View style={{ paddingHorizontal: 24 }}>
                      <FadeInDownView delay={100}>
                        <ScalePressable
                          onPress={() => setShowWebhookModal(true)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            paddingVertical: 14,
                            borderRadius: 12,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                            gap: 8,
                            marginBottom: 24,
                          }}
                        >
                          <Plus size={20} color={theme.foreground} />
                          <Text style={{ fontSize: 15, fontWeight: '600', color: theme.foreground }}>
                            Add Webhook
                          </Text>
                        </ScalePressable>
                      </FadeInDownView>
                      
                      {webhooksLoading ? (
                        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                          <ActivityIndicator size="large" color={theme.foreground} />
                        </View>
                      ) : webhooks.length === 0 ? (
                        <FadeInDownView delay={150} style={{ alignItems: 'center', paddingVertical: 40 }}>
                          <View style={{
                            width: 64,
                            height: 64,
                            borderRadius: 32,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: 16,
                          }}>
                            <Webhook size={28} color={colors.mutedForeground} />
                          </View>
                          <Text style={{ fontSize: 16, fontWeight: '600', color: theme.foreground }}>
                            No webhooks yet
                          </Text>
                          <Text style={{ fontSize: 14, color: colors.mutedForeground, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
                            Add webhooks to receive real-time event notifications
                          </Text>
                        </FadeInDownView>
                      ) : (
                        webhooks.map((webhook, index) => (
                          <FadeInDownView key={webhook.id} delay={150 + index * 50}>
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                paddingVertical: 16,
                                borderBottomWidth: index < webhooks.length - 1 ? 1 : 0,
                                borderBottomColor: theme.border,
                              }}
                            >
                              <View style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}>
                                <Webhook size={18} color={colors.mutedForeground} />
                              </View>
                              <View style={{ flex: 1, marginLeft: 12 }}>
                                <Text style={{ fontSize: 15, fontWeight: '600', color: theme.foreground }} numberOfLines={1}>
                                  {webhook.url}
                                </Text>
                                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                                  {webhook.events.join(', ')} • {webhook.active ? 'Active' : 'Inactive'}
                                </Text>
                              </View>
                              <ScalePressable
                                onPress={() => {
                                  Alert.alert(
                                    'Delete Webhook',
                                    'Are you sure you want to delete this webhook?',
                                    [
                                      { text: 'Cancel', style: 'cancel' },
                                      { 
                                        text: 'Delete', 
                                        style: 'destructive',
                                        onPress: async () => {
                                          try {
                                            const res = await fetch(`/api/webhooks/${webhook.id}`, { method: 'DELETE' })
                                            if (res.ok) {
                                              setWebhooks(prev => prev.filter(w => w.id !== webhook.id))
                                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
                                            }
                                          } catch (error) {
                                            console.error('Failed to delete webhook:', error)
                                          }
                                        }
                                      },
                                    ]
                                  )
                                }}
                                style={{ padding: 8 }}
                              >
                                <Trash2 size={18} color="#EF4444" />
                              </ScalePressable>
                            </View>
                          </FadeInDownView>
                        ))
                      )}
                    </View>
                  )}

                  {/* Audit Log */}
                  {settingsPage === 'audit-log' && (
                    <View style={{ paddingHorizontal: 24 }}>
                      <FadeInDownView delay={100}>
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                          {['all', 'agent', 'user', 'billing'].map((filter) => (
                            <ScalePressable
                              key={filter}
                              onPress={() => setAuditFilter(filter)}
                              style={{
                                paddingHorizontal: 12,
                                paddingVertical: 6,
                                borderRadius: 16,
                                backgroundColor: auditFilter === filter 
                                  ? (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)')
                                  : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'),
                              }}
                            >
                              <Text style={{ 
                                fontSize: 12, 
                                fontWeight: '500',
                                color: auditFilter === filter ? theme.foreground : colors.mutedForeground,
                                textTransform: 'capitalize'
                              }}>
                                {filter}
                              </Text>
                            </ScalePressable>
                          ))}
                        </View>
                      </FadeInDownView>
                      
                      {auditLogsLoading ? (
                        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                          <ActivityIndicator size="large" color={theme.foreground} />
                        </View>
                      ) : auditLogs.length === 0 ? (
                        <FadeInDownView delay={150} style={{ alignItems: 'center', paddingVertical: 40 }}>
                          <View style={{
                            width: 64,
                            height: 64,
                            borderRadius: 32,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: 16,
                          }}>
                            <ScrollText size={28} color={colors.mutedForeground} />
                          </View>
                          <Text style={{ fontSize: 16, fontWeight: '600', color: theme.foreground }}>
                            No audit logs yet
                          </Text>
                          <Text style={{ fontSize: 14, color: colors.mutedForeground, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
                            Security and activity logs will appear here
                          </Text>
                        </FadeInDownView>
                      ) : (
                        auditLogs
                          .filter(log => auditFilter === 'all' || log.action.includes(auditFilter))
                          .map((log, index) => (
                            <FadeInDownView key={log.id} delay={150 + index * 50}>
                              <View
                                style={{
                                  paddingVertical: 16,
                                  borderBottomWidth: index < auditLogs.length - 1 ? 1 : 0,
                                  borderBottomColor: theme.border,
                                }}
                              >
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text style={{ fontSize: 14, fontWeight: '500', color: theme.foreground }}>
                                    {log.action}
                                  </Text>
                                  <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                                    {new Date(log.createdAt).toLocaleDateString()}
                                  </Text>
                                </View>
                                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 4 }}>
                                  {log.actor} • {log.resource}
                                </Text>
                                {log.details && (
                                  <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                                    {log.details}
                                  </Text>
                                )}
                              </View>
                            </FadeInDownView>
                          ))
                      )}
                    </View>
                  )}

                  {/* Usage & Analytics */}
                  {settingsPage === 'usage' && (
                    <View style={{ paddingHorizontal: 24 }}>
                      {usageLoading ? (
                        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                          <ActivityIndicator size="large" color={theme.foreground} />
                        </View>
                      ) : usageData ? (
                        <>
                          <FadeInDownView delay={100}>
                            <View style={{
                              flexDirection: 'row',
                              flexWrap: 'wrap',
                              gap: 12,
                              marginBottom: 24,
                            }}>
                              <View style={{
                                flex: 1,
                                minWidth: 140,
                                padding: 16,
                                borderRadius: 12,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                              }}>
                                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 4 }}>
                                  Credits Used
                                </Text>
                                <Text style={{ fontSize: 24, fontWeight: '700', color: theme.foreground }}>
                                  {usageData.usedCredits}
                                </Text>
                                <Text style={{ fontSize: 12, color: colors.mutedForeground }}>
                                  of {usageData.totalCredits}
                                </Text>
                              </View>
                              
                              <View style={{
                                flex: 1,
                                minWidth: 140,
                                padding: 16,
                                borderRadius: 12,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                              }}>
                                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 4 }}>
                                  Agent Runs
                                </Text>
                                <Text style={{ fontSize: 24, fontWeight: '700', color: theme.foreground }}>
                                  {usageData.agentRuns}
                                </Text>
                              </View>
                              
                              <View style={{
                                flex: 1,
                                minWidth: 140,
                                padding: 16,
                                borderRadius: 12,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                              }}>
                                <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 4 }}>
                                  API Calls
                                </Text>
                                <Text style={{ fontSize: 24, fontWeight: '700', color: theme.foreground }}>
                                  {usageData.apiCalls}
                                </Text>
                              </View>
                            </View>
                          </FadeInDownView>
                          
                          <FadeInDownView delay={200}>
                            <ScalePressable
                              onPress={() => Linking.openURL('https://2hands.ai/app/settings/usage')}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                paddingVertical: 14,
                                borderRadius: 12,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                                gap: 8,
                              }}
                            >
                              <BarChart3 size={20} color={theme.foreground} />
                              <Text style={{ fontSize: 15, fontWeight: '600', color: theme.foreground }}>
                                View Detailed Analytics
                              </Text>
                            </ScalePressable>
                          </FadeInDownView>
                        </>
                      ) : (
                        <FadeInDownView delay={150} style={{ alignItems: 'center', paddingVertical: 40 }}>
                          <View style={{
                            width: 64,
                            height: 64,
                            borderRadius: 32,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: 16,
                          }}>
                            <BarChart3 size={28} color={colors.mutedForeground} />
                          </View>
                          <Text style={{ fontSize: 16, fontWeight: '600', color: theme.foreground }}>
                            No usage data yet
                          </Text>
                          <Text style={{ fontSize: 14, color: colors.mutedForeground, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
                            Usage analytics will appear here once you start using 2Hands
                          </Text>
                        </FadeInDownView>
                      )}
                    </View>
                  )}

                  {/* Language */}
                  {settingsPage === 'language' && (
                    <View style={{ paddingHorizontal: 24 }}>
                      <FadeInDownView delay={100}>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 16, marginLeft: 4 }}>
                          Select Language
                        </Text>
                      </FadeInDownView>
                      
                      {([
                        { code: 'en', label: 'English', flag: '🇺🇸' },
                        { code: 'sv', label: 'Svenska', flag: '🇸🇪' },
                        { code: 'es', label: 'Español', flag: '🇪🇸' },
                        { code: 'fr', label: 'Français', flag: '🇫🇷' },
                        { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
                        { code: 'zh', label: '中文', flag: '🇨🇳' },
                      ] as const).map((lang, index) => (
                        <FadeInDownView key={lang.code} delay={150 + index * 50}>
                          <ScalePressable
                            onPress={async () => {
                              setSelectedLanguage(lang.code)
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                              // Save to AsyncStorage
                              try {
                                await AsyncStorage.setItem('@2hands_language', lang.code)
                              } catch (e) {
                                console.error('Failed to save language:', e)
                              }
                            }}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingVertical: 16,
                              gap: 14,
                              borderBottomWidth: index < 5 ? 1 : 0,
                              borderBottomColor: theme.border,
                            }}
                          >
                            <Text style={{ fontSize: 24 }}>{lang.flag}</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 15, color: theme.foreground, fontWeight: '500' }}>
                                {lang.label}
                              </Text>
                              <Text style={{ fontSize: 13, color: colors.mutedForeground, marginTop: 2 }}>
                                {lang.code.toUpperCase()}
                              </Text>
                            </View>
                            {selectedLanguage === lang.code && (
                              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' }}>
                                <Check size={14} color="#FFFFFF" strokeWidth={3} />
                              </View>
                            )}
                          </ScalePressable>
                        </FadeInDownView>
                      ))}
                      
                      <FadeInDownView delay={500}>
                        <Text style={{ fontSize: 13, color: colors.mutedForeground, marginTop: 24, lineHeight: 20 }}>
                          Language preference is saved locally. More languages coming soon.
                        </Text>
                      </FadeInDownView>
                    </View>
                  )}

                  {/* Proactive Features */}
                  {settingsPage === 'proactive' && (
                    <View style={{ paddingHorizontal: 24 }}>
                      <FadeInDownView delay={100}>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 16, marginLeft: 4 }}>
                          AI Behavior
                        </Text>
                      </FadeInDownView>
                      
                      {/* Suggestions Toggle */}
                      <FadeInDownView delay={150}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                          <View>
                            <Text style={{ fontSize: 15, fontWeight: '500', color: theme.foreground }}>Smart Suggestions</Text>
                            <Text style={{ fontSize: 13, color: colors.mutedForeground, marginTop: 2 }}>Get AI suggestions for new automations</Text>
                          </View>
                          <Switch
                            value={proactiveSettings.suggestionsEnabled}
                            onValueChange={(value) => saveProactiveSettings({ ...proactiveSettings, suggestionsEnabled: value })}
                            trackColor={{ false: '#767577', true: '#22C55E' }}
                            thumbColor={proactiveSettings.suggestionsEnabled ? '#FFFFFF' : '#f4f3f4'}
                          />
                        </View>
                      </FadeInDownView>
                      
                      {/* Autonomy Level */}
                      <FadeInDownView delay={200}>
                        <Text style={{ fontSize: 15, fontWeight: '500', color: theme.foreground, marginTop: 16, marginBottom: 12 }}>
                          Autonomy Level
                        </Text>
                        {['conservative', 'balanced', 'aggressive'].map((level) => (
                          <ScalePressable
                            key={level}
                            onPress={() => saveProactiveSettings({ ...proactiveSettings, autonomyLevel: level as any })}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingVertical: 14,
                              paddingHorizontal: 16,
                              borderRadius: 12,
                              backgroundColor: proactiveSettings.autonomyLevel === level 
                                ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)')
                                : 'transparent',
                              marginBottom: 8,
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 15, fontWeight: '500', color: theme.foreground, textTransform: 'capitalize' }}>
                                {level}
                              </Text>
                              <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                                {level === 'conservative' && 'Always ask before acting'}
                                {level === 'balanced' && 'Ask for risky actions only'}
                                {level === 'aggressive' && 'Act autonomously when confident'}
                              </Text>
                            </View>
                            {proactiveSettings.autonomyLevel === level && (
                              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' }}>
                                <Check size={12} color="#FFFFFF" strokeWidth={3} />
                              </View>
                            )}
                          </ScalePressable>
                        ))}
                      </FadeInDownView>
                      
                      {/* Auto Recovery Toggle */}
                      <FadeInDownView delay={250}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, marginTop: 16 }}>
                          <View>
                            <Text style={{ fontSize: 15, fontWeight: '500', color: theme.foreground }}>Auto Recovery</Text>
                            <Text style={{ fontSize: 13, color: colors.mutedForeground, marginTop: 2 }}>Automatically recover from common errors</Text>
                          </View>
                          <Switch
                            value={proactiveSettings.autoRecovery}
                            onValueChange={(value) => saveProactiveSettings({ ...proactiveSettings, autoRecovery: value })}
                            trackColor={{ false: '#767577', true: '#22C55E' }}
                            thumbColor={proactiveSettings.autoRecovery ? '#FFFFFF' : '#f4f3f4'}
                          />
                        </View>
                      </FadeInDownView>
                    </View>
                  )}

                  {/* AI Personalization */}
                  {settingsPage === 'personalization' && (
                    <View style={{ paddingHorizontal: 24 }}>
                      <FadeInDownView delay={100}>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 16, marginLeft: 4 }}>
                          AI Communication Style
                        </Text>
                      </FadeInDownView>
                      
                      {/* Communication Style */}
                      <FadeInDownView delay={150}>
                        {['formal', 'casual', 'friendly', 'professional'].map((style) => (
                          <ScalePressable
                            key={style}
                            onPress={() => savePersonalization({ ...personalization, communicationStyle: style as any })}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingVertical: 14,
                              paddingHorizontal: 16,
                              borderRadius: 12,
                              backgroundColor: personalization.communicationStyle === style 
                                ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)')
                                : 'transparent',
                              marginBottom: 8,
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 15, fontWeight: '500', color: theme.foreground, textTransform: 'capitalize' }}>
                                {style}
                              </Text>
                            </View>
                            {personalization.communicationStyle === style && (
                              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' }}>
                                <Check size={12} color="#FFFFFF" strokeWidth={3} />
                              </View>
                            )}
                          </ScalePressable>
                        ))}
                      </FadeInDownView>
                      
                      {/* Detail Level */}
                      <FadeInDownView delay={200}>
                        <Text style={{ fontSize: 15, fontWeight: '500', color: theme.foreground, marginTop: 24, marginBottom: 12 }}>
                          Response Detail Level
                        </Text>
                        {['brief', 'moderate', 'detailed'].map((level) => (
                          <ScalePressable
                            key={level}
                            onPress={() => savePersonalization({ ...personalization, detailLevel: level as any })}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingVertical: 14,
                              paddingHorizontal: 16,
                              borderRadius: 12,
                              backgroundColor: personalization.detailLevel === level 
                                ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)')
                                : 'transparent',
                              marginBottom: 8,
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 15, fontWeight: '500', color: theme.foreground, textTransform: 'capitalize' }}>
                                {level}
                              </Text>
                              <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
                                {level === 'brief' && 'Short and concise responses'}
                                {level === 'moderate' && 'Balanced information'}
                                {level === 'detailed' && 'Comprehensive explanations'}
                              </Text>
                            </View>
                            {personalization.detailLevel === level && (
                              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' }}>
                                <Check size={12} color="#FFFFFF" strokeWidth={3} />
                              </View>
                            )}
                          </ScalePressable>
                        ))}
                      </FadeInDownView>
                      
                      {/* Emoji Toggle */}
                      <FadeInDownView delay={250}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, marginTop: 16 }}>
                          <View>
                            <Text style={{ fontSize: 15, fontWeight: '500', color: theme.foreground }}>Use Emoji</Text>
                            <Text style={{ fontSize: 13, color: colors.mutedForeground, marginTop: 2 }}>AI can use emoji in responses</Text>
                          </View>
                          <Switch
                            value={personalization.usesEmoji}
                            onValueChange={(value) => savePersonalization({ ...personalization, usesEmoji: value })}
                            trackColor={{ false: '#767577', true: '#22C55E' }}
                            thumbColor={personalization.usesEmoji ? '#FFFFFF' : '#f4f3f4'}
                          />
                        </View>
                      </FadeInDownView>
                    </View>
                  )}

                  {/* Memory & Learning */}
                  {settingsPage === 'memory' && (
                    <View style={{ paddingHorizontal: 24 }}>
                      <FadeInDownView delay={100}>
                        <Text style={{ fontSize: 12, color: colors.mutedForeground, marginBottom: 16, marginLeft: 4 }}>
                          AI Memory Settings
                        </Text>
                      </FadeInDownView>
                      
                      {/* Structured Memory Toggle */}
                      <FadeInDownView delay={150}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                          <View>
                            <Text style={{ fontSize: 15, fontWeight: '500', color: theme.foreground }}>Structured Memory</Text>
                            <Text style={{ fontSize: 13, color: colors.mutedForeground, marginTop: 2 }}>Save user context, facts, and preferences</Text>
                          </View>
                          <Switch
                            value={memorySettings.structuredMemoryEnabled}
                            onValueChange={(value) => saveMemorySettings({ ...memorySettings, structuredMemoryEnabled: value })}
                            trackColor={{ false: '#767577', true: '#22C55E' }}
                            thumbColor={memorySettings.structuredMemoryEnabled ? '#FFFFFF' : '#f4f3f4'}
                          />
                        </View>
                      </FadeInDownView>
                      
                      {/* Cross-Agent Learning Toggle */}
                      <FadeInDownView delay={200}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                          <View>
                            <Text style={{ fontSize: 15, fontWeight: '500', color: theme.foreground }}>Cross-Agent Learning</Text>
                            <Text style={{ fontSize: 13, color: colors.mutedForeground, marginTop: 2 }}>All agents can learn from each other</Text>
                          </View>
                          <Switch
                            value={memorySettings.crossAgentLearning}
                            onValueChange={(value) => saveMemorySettings({ ...memorySettings, crossAgentLearning: value })}
                            trackColor={{ false: '#767577', true: '#22C55E' }}
                            thumbColor={memorySettings.crossAgentLearning ? '#FFFFFF' : '#f4f3f4'}
                          />
                        </View>
                      </FadeInDownView>
                      
                      {/* Memory Curation Toggle */}
                      <FadeInDownView delay={250}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 }}>
                          <View>
                            <Text style={{ fontSize: 15, fontWeight: '500', color: theme.foreground }}>Memory Curation</Text>
                            <Text style={{ fontSize: 13, color: colors.mutedForeground, marginTop: 2 }}>AI reviews and curates learnings</Text>
                          </View>
                          <Switch
                            value={memorySettings.memoryCuration}
                            onValueChange={(value) => saveMemorySettings({ ...memorySettings, memoryCuration: value })}
                            trackColor={{ false: '#767577', true: '#22C55E' }}
                            thumbColor={memorySettings.memoryCuration ? '#FFFFFF' : '#f4f3f4'}
                          />
                        </View>
                      </FadeInDownView>
                    </View>
                  )}
                </ScrollView>
              </SafeAreaView>
            </Animated.View>

        </SafeAreaView>
      </Animated.View>
      
      {/* Notifications Bottom Sheet */}
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: SETTINGS_SHEET_HEIGHT,
          backgroundColor: theme.background,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          transform: [{ translateY: notificationsSlideAnim }],
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 10,
          zIndex: 100,
        }}
      >
        {/* Drag Handle */}
        <View 
          {...notificationsPanResponder.panHandlers}
          style={{ 
            paddingTop: 10, 
            paddingBottom: 12,
            alignItems: 'center',
            width: '100%',
          }}
        >
          <View style={{
            width: 40,
            height: 5,
            borderRadius: 2.5,
            backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
          }} />
        </View>
        
        {/* Notifications Header */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: theme.foreground, textAlign: 'left' }}>
            Notifications
          </Text>
        </View>
        
        {/* Notifications Content - Empty State */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <View style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}>
            <Bell size={28} color={colors.mutedForeground} style={{ opacity: 0.6 }} />
          </View>
          <Text style={{ fontSize: 16, fontWeight: '600', color: theme.foreground, marginBottom: 8, textAlign: 'center' }}>
            No notifications yet
          </Text>
          <Text style={{ fontSize: 14, color: colors.mutedForeground, textAlign: 'center', lineHeight: 20 }}>
            When you have updates or messages, they’ll appear here.
          </Text>
        </View>
      </Animated.View>
    </View>
  )
}
