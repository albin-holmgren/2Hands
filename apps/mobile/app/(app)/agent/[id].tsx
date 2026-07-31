import { useState, useRef, useEffect, useMemo } from 'react'
import { 
  View, 
  Text, 
  FlatList, 
  KeyboardAvoidingView, 
  Platform, 
  ActivityIndicator, 
  Animated,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
  TextInput,
  PanResponder,
  Keyboard,
  Image as RNImage
} from 'react-native'
import { Image } from 'expo-image'
import { BlurView } from 'expo-blur'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { Bot, Clock, Check, XCircle, Loader2, Plus, ArrowUp, Monitor, ChevronDown, Sparkles, ChevronRight, User, Globe, Settings2, Trash2, X, Camera, ImageIcon, Lightbulb, Brain, GraduationCap, Calendar } from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import { useAgentChat, Message } from '@/hooks/use-agent-chat'
import { FadeInView, FadeInDownView, Input, ScalePressable, TypingIndicator, Skeleton } from '@/components/ui'
import { Sidebar } from '@/components/sidebar'
import { MarkdownText } from '@/components/markdown-text'
import { useChatStore } from '@/store/chat-store'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/lib/theme-context'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

// Web app colors - aligned with brand guidelines
const colors = {
  light: {
    background: '#FCFBF8',
    foreground: '#34322D',
    card: '#FFFFFF',
    border: 'rgba(52, 50, 45, 0.08)',
    muted: '#75736F',
    input: '#e5e5e5',
  },
  dark: {
    background: '#0a0a0a',
    foreground: '#FAFAFA',
    card: '#141414',
    border: 'rgba(255, 255, 255, 0.08)',
    muted: '#9E9C99',
    input: '#262626',
  }
}

const statusConfig = {
  idle: { color: '#75736F', label: 'Idle', Icon: Clock },
  initializing: { color: '#D97757', label: 'Starting', Icon: Loader2 },
  working: { color: '#D97757', label: 'Working', Icon: Loader2 },
  completed: { color: '#22C55E', label: 'Completed', Icon: Check },
  failed: { color: '#EF4444', label: 'Failed', Icon: XCircle },
  terminated: { color: '#75736F', label: 'Stopped', Icon: XCircle },
} as const

export default function AgentDetailScreen() {
  const { isDark } = useTheme()
  const theme = isDark ? colors.dark : colors.light
  const { id } = useLocalSearchParams<{ id: string }>()
  const [input, setInput] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const switcherAnim = useRef(new Animated.Value(0)).current
  const flatListRef = useRef<FlatList>(null)
  const { agents, aiName, updateAgent, deleteAgent } = useChatStore()
  const localAgent = agents.find(a => a.id === id)
  
  const [showSettings, setShowSettings] = useState(false)
  const settingsAnim = useRef(new Animated.Value(0)).current
  const settingsDragY = useRef(new Animated.Value(0)).current
  const [name, setName] = useState('')
  const [mission, setMission] = useState('')
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Screenshot state for live VM preview - uses base64 for reliable rendering
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [forceShowVM, setForceShowVM] = useState(false)
  const lastEtagRef = useRef<string | null>(null)
  const screenshotPulse = useRef(new Animated.Value(0.3)).current
  const shimmerAnim = useRef(new Animated.Value(0)).current
  const spinnerRotation = useRef(new Animated.Value(0)).current
  
  // Boot screen detection moved below agent definition
  
  // Track collapsed state for thinking messages
  const [collapsedThinking, setCollapsedThinking] = useState<Set<string>>(new Set())
  
  const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://2hands.ai'

  // Settings pan responder for drag-to-close
  const settingsPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          settingsDragY.setValue(gestureState.dy)
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          handleCloseSettings()
        }
        Animated.timing(settingsDragY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start()
      },
    })
  ).current

  useEffect(() => {
    if (localAgent) {
      setName(localAgent.name)
      setMission((localAgent.config as { description?: string })?.description || '')
    }
  }, [localAgent?.id])

  const handleOpenSettings = () => {
    setShowSettings(true)
    Animated.timing(settingsAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start()
  }

  const handleCloseSettings = () => {
    Animated.timing(settingsAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowSettings(false)
      settingsDragY.setValue(0)
    })
  }

  const triggerAutoSave = (newName: string, newMission: string) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    
    autoSaveTimer.current = setTimeout(async () => {
      if (!agent || !newName.trim()) return
      
      try {
        const updatedConfig = {
          ...(agent.config as object || {}),
          description: newMission.trim(),
        }
        
        const { error } = await supabase
          .from('agents')
          .update({
            name: newName.trim(),
            config: updatedConfig,
          })
          .eq('id', agent.id)
        
        if (error) throw error
        
        updateAgent(agent.id, {
          name: newName.trim(),
          config: updatedConfig,
        })
      } catch (error) {
        console.error('Auto-save error:', error)
      }
    }, 1000)
  }

  const handleNameChange = (text: string) => {
    setName(text)
    triggerAutoSave(text, mission)
  }

  const handleMissionChange = (text: string) => {
    setMission(text)
    triggerAutoSave(name, text)
  }

  const handleDeleteAgent = () => {
    Alert.alert(
      'Delete Agent',
      `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
            try {
              const { error } = await supabase
                .from('agents')
                .delete()
                .eq('id', id)
              
              if (error) throw error
              
              deleteAgent(id!)
              handleCloseSettings()
              router.replace('/')
            } catch (error) {
              console.error('Error deleting agent:', error)
              Alert.alert('Error', 'Failed to delete agent')
            }
          }
        },
      ]
    )
  }

  useEffect(() => {
    if (showSwitcher) {
      Animated.timing(switcherAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start()
    } else {
      Animated.timing(switcherAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start()
    }
  }, [showSwitcher])

  const handleCloseSwitcher = () => {
    Animated.timing(switcherAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => setShowSwitcher(false))
  }
  
  const handleNavigate = (path: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    
    // Premium exit animation
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(contentScale, {
        toValue: 0.97,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(contentSlideAnim, {
        toValue: -SCREEN_WIDTH * 0.1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      router.replace(path as any)
    })
  }

  // Content slide animation - matches sidebar spring physics
  const contentSlideAnim = useRef(new Animated.Value(SCREEN_WIDTH * 0.05)).current
  const contentOpacity = useRef(new Animated.Value(0)).current
  const contentScale = useRef(new Animated.Value(0.98)).current
  const [hasAnimatedIn, setHasAnimatedIn] = useState(false)
  
  // Initial entrance animation when screen loads
  useEffect(() => {
    if (!hasAnimatedIn) {
      Animated.parallel([
        Animated.timing(contentSlideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(contentScale, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => setHasAnimatedIn(true))
    }
  }, [])
  
  useEffect(() => {
    if (!hasAnimatedIn) return
    
    if (isSidebarOpen) {
      // When sidebar opens, subtle push back effect
      Animated.parallel([
        Animated.timing(contentSlideAnim, {
          toValue: SCREEN_WIDTH * 0.15,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: 0.5,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(contentScale, {
          toValue: 0.95,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start()
    } else {
      // When sidebar closes, smooth elegant return
      Animated.parallel([
        Animated.timing(contentSlideAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(contentScale, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start()
    }
  }, [isSidebarOpen])
  
  const {
    agent,
    messages,
    isLoading,
    isStreaming,
    streamingContent,
    sendMessage: sendChatMessage,
  } = useAgentChat(id || '')

  // Agent is active when status is working/initializing, or we're forcing display after user message
  const isAgentActive = agent?.status === 'working' || agent?.status === 'initializing' || forceShowVM
  
  // Boot screen detection - based on status
  const isBootScreen = agent?.status === 'initializing'
  
  // Poll screenshot endpoint for base64 image
  useEffect(() => {
    console.log('[Screenshot] Poll check:', { agentId: agent?.id, isAgentActive, forceShowVM, status: agent?.status })
    
    if (!agent?.id || !isAgentActive) {
      // Keep last frame visible until forceShowVM expires
      return
    }
    
    let isMounted = true
    let accessToken: string | null = null
    
    const pollScreenshot = async () => {
      if (!isMounted) return
      
      try {
        // Get auth token once
        if (!accessToken) {
          const { data: { session } } = await supabase.auth.getSession()
          if (!session?.access_token || !isMounted) return
          accessToken = session.access_token
        }
        
        // Poll screenshot endpoint - returns base64 directly
        const url = `${API_URL}/api/agents/screenshot?agentId=${agent.id}&force=true`
        const res = await fetch(url, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        })
        
        if (!isMounted) return
        
        if (res.ok) {
          const data = await res.json()
          console.log('[Screenshot] Response:', { hasScreenshot: !!data.screenshot, status: data.status })
          
          if (data.screenshot) {
            setScreenshot(data.screenshot)
          }
        } else {
          console.log('[Screenshot] Error:', res.status)
        }
      } catch (err) {
        console.log('[Screenshot] Network error:', err)
      }
    }
    
    // Poll immediately and then every 1.5 seconds
    pollScreenshot()
    const interval = setInterval(pollScreenshot, 1500)
    
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [agent?.id, isAgentActive, forceShowVM, API_URL])
  
  // Clear forceShowVM and screenshot when agent completes or fails
  useEffect(() => {
    if (agent?.status === 'completed' || agent?.status === 'failed' || agent?.status === 'idle') {
      // Keep VM visible for 5 more seconds after completion so user can see final state
      const timer = setTimeout(() => {
        setForceShowVM(false)
        setScreenshot(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [agent?.status])

  // Pulsing animation for screenshot border + shimmer for loading text
  useEffect(() => {
    if (isAgentActive || isBootScreen) {
      // Blue pulse for vignette
      Animated.loop(
        Animated.sequence([
          Animated.timing(screenshotPulse, {
            toValue: 0.7,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(screenshotPulse, {
            toValue: 0.3,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      ).start()
      
      // Smooth spinner rotation
      Animated.loop(
        Animated.timing(spinnerRotation, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
          easing: require('react-native').Easing.linear,
        })
      ).start()
    } else {
      screenshotPulse.setValue(0.3)
      spinnerRotation.setValue(0)
    }
  }, [isAgentActive, isBootScreen])

  const [selectedImages, setSelectedImages] = useState<Array<{ uri: string; base64: string; mediaType: string }>>([])
  const [showActionSheet, setShowActionSheet] = useState(false)
  const actionSheetAnim = useRef(new Animated.Value(0)).current
  const actionSheetDragY = useRef(new Animated.Value(0)).current

  const actionSheetPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          actionSheetDragY.setValue(gestureState.dy)
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 80 || gestureState.vy > 0.5) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          closeActionSheet()
        } else {
          Animated.timing(actionSheetDragY, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
          }).start()
        }
      },
    })
  ).current

  const openActionSheet = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setShowActionSheet(true)
    actionSheetDragY.setValue(0)
    Animated.timing(actionSheetAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start()
  }

  const closeActionSheet = () => {
    Animated.timing(actionSheetAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowActionSheet(false)
      actionSheetDragY.setValue(0)
    })
  }

  const pickImage = async () => {
    closeActionSheet()
    setTimeout(async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        base64: true,
      })

      if (!result.canceled && result.assets) {
        const newImages = result.assets
          .filter(asset => asset.base64)
          .map(asset => ({
            uri: asset.uri,
            base64: asset.base64!,
            mediaType: asset.mimeType || 'image/jpeg',
          }))
        setSelectedImages(prev => [...prev, ...newImages].slice(0, 4))
      }
    }, 300)
  }

  const removeImage = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setSelectedImages(prev => prev.filter((_, i) => i !== index))
  }
  
  // Track when initial load attempt completes
  useEffect(() => {
    if (agent || (!isLoading && !hasAttemptedLoad)) {
      // Small delay to ensure we've actually tried to load
      const timer = setTimeout(() => setHasAttemptedLoad(true), 500)
      return () => clearTimeout(timer)
    }
  }, [agent, isLoading])

  const handleSend = async () => {
    if ((!input.trim() && selectedImages.length === 0) || isLoading || isStreaming || !agent) return

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const content = input.trim()
    const imagesToSend = selectedImages.length > 0 ? selectedImages.map(img => ({
      base64: img.base64,
      mediaType: img.mediaType,
    })) : undefined
    
    setInput('')
    setSelectedImages([])
    
    // Force show VM display when user sends a message - agent will run
    setForceShowVM(true)
    // Auto-hide after 60 seconds if agent doesn't stay active
    setTimeout(() => setForceShowVM(false), 60000)
    
    await sendChatMessage(content, imagesToSend)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  }

  const displayMessages = useMemo(() => {
    if (!isStreaming) return messages

    if (!streamingContent) {
      const last = messages[messages.length - 1]
      if (last?.role === 'assistant') return messages.slice(0, -1)
      return messages
    }

    const last = messages[messages.length - 1]
    if (!last) {
      return [
        {
          id: '__streaming__',
          conversation_id: agent?.conversation_id || agent?.id || 'streaming',
          role: 'assistant',
          content: streamingContent,
          created_at: new Date().toISOString(),
        } satisfies Message,
      ]
    }

    if (last.role === 'assistant') {
      const updated = [...messages]
      updated[updated.length - 1] = { ...last, content: streamingContent }
      return updated
    }

    return [
      ...messages,
      {
        id: '__streaming__',
        conversation_id: last.conversation_id,
        role: 'assistant',
        content: streamingContent,
        created_at: new Date().toISOString(),
      } satisfies Message,
    ]
  }, [agent, isStreaming, messages, streamingContent])

  const handleDelete = async () => {
    if (!agent) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
    router.back()
  }

  // Only show error state if definitely not found (after load attempt)
  if (!agent && !isLoading && hasAttemptedLoad) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ color: theme.foreground, fontSize: 18, fontWeight: '600' }}>Agent not found</Text>
          <ScalePressable
            onPress={() => router.back()}
            style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 16 }}
          >
            <Text style={{ color: theme.foreground, fontWeight: '600' }}>Go back</Text>
          </ScalePressable>
        </SafeAreaView>
      </View>
    )
  }

  const status = statusConfig[agent?.status || 'idle'] || statusConfig.idle
  const StatusIcon = status.Icon
  
  const toggleThinkingCollapse = (messageId: string) => {
    setCollapsedThinking(prev => {
      const next = new Set(prev)
      if (next.has(messageId)) {
        next.delete(messageId)
      } else {
        next.add(messageId)
      }
      return next
    })
  }

  const renderMessage = ({ item, index }: { item: Message, index: number }) => {
    const isUser = item.role === 'user'
    const metadata = item.metadata as { type?: string; action_type?: string; action_target?: string } | undefined
    const msgType = metadata?.type
    // Thinking: only progress/acknowledgement (insights and completions show as normal text)
    const isThinking = msgType === 'progress' || msgType === 'acknowledgement'
    // Action: browsed, searched, read (shown as simple gray text, not collapsible)
    const isAction = msgType === 'action'
    // Collapsed by default - expanded items are tracked in the Set
    const isExpanded = collapsedThinking.has(item.id)
    
    // Calculate thinking time from actual message timestamp
    const messageTime = item.created_at ? new Date(item.created_at).getTime() : Date.now()
    const nextMsgTime = displayMessages[index - 1]?.created_at 
      ? new Date(displayMessages[index - 1].created_at).getTime() 
      : Date.now()
    const thinkingTime = Math.max(1, Math.min(30, Math.round((nextMsgTime - messageTime) / 1000)))
    
    return (
      <View 
        style={{ paddingHorizontal: 16, paddingVertical: 8, alignItems: isUser ? 'flex-end' : 'flex-start' }}
      >
        {isUser ? (
          <View
            style={{
              maxWidth: '85%',
              backgroundColor: theme.card,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 20,
              borderBottomRightRadius: 4,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: isDark ? 0.4 : 0.04,
              shadowRadius: 8,
              elevation: 2,
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            <Text style={{ color: theme.foreground, fontSize: 16, lineHeight: 24 }}>
              {item.content}
            </Text>
          </View>
        ) : isAction ? (
          // Action indicator (Browsed, Searched, Read) - simple gray text
          <View style={{ maxWidth: '100%', paddingVertical: 2 }}>
            <Text style={{ color: theme.muted, fontSize: 14 }}>
              {item.content}
            </Text>
          </View>
        ) : isThinking ? (
          // Thinking-style message (like Claude's "Thought for Xs")
          <View style={{ maxWidth: '100%', paddingVertical: 4 }}>
            <Pressable 
              onPress={() => toggleThinkingCollapse(item.id)}
              style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}
            >
              <Text style={{ color: theme.muted, fontSize: 14, fontWeight: '500' }}>
                Thought for {thinkingTime}s
              </Text>
              <ChevronDown 
                size={14} 
                color={theme.muted} 
                style={{ 
                  marginLeft: 4,
                  transform: [{ rotate: isExpanded ? '0deg' : '-90deg' }]
                }} 
              />
            </Pressable>
            {isExpanded && (
              <View style={{ paddingLeft: 0 }}>
                <Text style={{ color: theme.muted, fontSize: 15, lineHeight: 22 }}>
                  {item.content.replace(/\*\*Update\*\*\n\n/g, '').replace(/\*\*/g, '')}
                </Text>
              </View>
            )}
          </View>
        ) : (
          // Normal message (completion, insight, etc.)
          <View style={{ maxWidth: '100%', paddingVertical: 4 }}>
            <MarkdownText 
              style={{ fontSize: 16, lineHeight: 26 }}
              color={theme.foreground}
            >
              {item.content}
            </MarkdownText>
          </View>
        )}
      </View>
    )
  }

  // Messages List Component
  const listComponent = (
    <FlatList
      ref={flatListRef}
      data={displayMessages}
      renderItem={renderMessage}
      keyExtractor={item => item.id}
      style={{ flex: 1 }}
      contentContainerStyle={{ 
        paddingVertical: 16, 
        paddingBottom: 16,
        flexGrow: 1,
        justifyContent: displayMessages.length === 0 ? 'center' : 'flex-start'
      }}
      ListEmptyComponent={
        <FadeInDownView delay={300} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ color: theme.foreground, fontSize: 24, fontWeight: '300', textAlign: 'center', lineHeight: 32 }}>
            How can {agent?.name} help you?
          </Text>
        </FadeInDownView>
      }
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : 'none'}
      onScrollBeginDrag={Keyboard.dismiss}
    />
  )

  // Loading skeleton with shimmer animation
  const skeletonComponent = (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 20 }}>
      {/* VM preview placeholder */}
      <FadeInView delay={100} style={{ marginBottom: 20 }}>
        <Skeleton variant="card" height={180} borderRadius={20} />
      </FadeInView>
      
      {/* Message placeholders */}
      <View style={{ gap: 16 }}>
        <FadeInView delay={200} style={{ alignItems: 'flex-start' }}>
          <Skeleton width="75%" height={60} borderRadius={16} />
        </FadeInView>
        <FadeInView delay={300} style={{ alignItems: 'flex-end' }}>
          <Skeleton width="60%" height={60} borderRadius={16} />
        </FadeInView>
        <FadeInView delay={400} style={{ alignItems: 'flex-start' }}>
          <Skeleton width="80%" height={60} borderRadius={16} />
        </FadeInView>
      </View>
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Sidebar */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content - Animated to match sidebar slide */}
      <Animated.View style={{ 
        flex: 1, 
        backgroundColor: theme.background,
        transform: [
          { translateX: contentSlideAnim },
          { scale: contentScale }
        ],
        opacity: contentOpacity,
        borderRadius: 16,
        overflow: 'hidden',
      }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          {/* Header - Matches AI Manager style */}
          <FadeInDownView delay={0}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              {/* Left: Burger Menu + Agent Switcher */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {/* Burger Menu */}
                <ScalePressable 
                  style={{
                    width: 44,
                    height: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: -8,
                  }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    setIsSidebarOpen(true)
                  }}
                >
                  <View style={{ width: 20, height: 10, justifyContent: 'space-between' }}>
                    <View style={{ height: 2, width: '100%', backgroundColor: theme.foreground, borderRadius: 1 }} />
                    <View style={{ height: 2, width: '70%', backgroundColor: theme.foreground, borderRadius: 1 }} />
                  </View>
                </ScalePressable>

                {/* Agent Switcher - Left aligned */}
                <ScalePressable 
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    setShowSwitcher(true)
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 4 }}
                >
                  <Text style={{ color: theme.foreground, fontWeight: '600', fontSize: 16 }}>{name || 'Agent'}</Text>
                  <ChevronDown size={16} color={theme.muted} />
                </ScalePressable>
              </View>

              {/* Right: Settings Icon */}
              <ScalePressable 
                style={{
                  width: 40,
                  height: 40,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  handleOpenSettings()
                }}
              >
                <Settings2 size={22} color={theme.foreground} strokeWidth={1.5} />
              </ScalePressable>
            </View>
          </FadeInDownView>

          {/* Schedule Info - Matches web header */}
          {(agent?.schedule_type === 'scheduled' || agent?.last_run_at) && (
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              paddingHorizontal: 16,
              paddingBottom: 8,
              gap: 16,
              flexWrap: 'wrap',
            }}>
              {/* Next run info */}
              {agent?.schedule_type === 'scheduled' && agent?.next_run_at && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Clock size={14} color={theme.muted} />
                  <Text style={{ fontSize: 13, color: theme.muted }}>
                    Next run: {new Date(agent.next_run_at).toLocaleString(undefined, { 
                      month: 'short', 
                      day: 'numeric', 
                      hour: 'numeric', 
                      minute: '2-digit'
                    })}
                  </Text>
                </View>
              )}
              
              {/* Last run info */}
              {agent?.last_run_at && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Calendar size={14} color={theme.muted} />
                  <Text style={{ fontSize: 13, color: theme.muted }}>
                    Last run: {new Date(agent.last_run_at).toLocaleString(undefined, { 
                      month: 'short', 
                      day: 'numeric', 
                      hour: 'numeric', 
                      minute: '2-digit'
                    })}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Switcher Modal */}
          <Modal
            visible={showSwitcher}
            transparent
            animationType="none"
            onRequestClose={handleCloseSwitcher}
          >
            <View style={StyleSheet.absoluteFill}>
              <Pressable 
                style={StyleSheet.absoluteFill} 
                onPress={handleCloseSwitcher}
              >
                <Animated.View 
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      backgroundColor: 'black',
                      opacity: switcherAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 0.3]
                      })
                    }
                  ]}
                />
              </Pressable>
              
              <Animated.View 
                style={{ 
                  marginTop: 120,
                  marginHorizontal: 40,
                  alignSelf: 'center',
                  width: SCREEN_WIDTH - 80,
                  maxWidth: 340,
                  opacity: switcherAnim,
                  transform: [
                    { scale: switcherAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.9, 1]
                      }) 
                    },
                    { translateY: switcherAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-20, 0]
                      })
                    }
                  ],
                }}
              >
                <View
                  style={{
                    borderRadius: 20,
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                    backgroundColor: isDark ? 'rgba(50,50,50,0.95)' : 'rgba(255,255,255,0.98)',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.15,
                    shadowRadius: 24,
                  }}
                >
                  <View style={{ padding: 6 }}>
                    {/* AI Manager Option */}
                    <ScalePressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                        handleCloseSwitcher()
                        handleNavigate('/(app)/(tabs)/')
                      }}
                      style={{ 
                        paddingHorizontal: 10, 
                        paddingVertical: 10, 
                        flexDirection: 'row', 
                        alignItems: 'center', 
                        gap: 10,
                        borderRadius: 14,
                      }}
                    >
                      <User size={16} color={theme.muted} />
                      <Text style={{ color: theme.muted, fontWeight: '400', fontSize: 15, flex: 1 }}>{aiName || '2Hands'}</Text>
                    </ScalePressable>
                    
                    {/* Agents Section */}
                    {agents.length > 0 && (
                      <View style={{ marginTop: 6 }}>
                        <View style={{ paddingHorizontal: 14, paddingVertical: 6 }}>
                          <Text style={{ color: theme.muted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.2 }}>Your Agents</Text>
                        </View>
                        {agents.map((agentItem) => {
                          const isActive = agentItem.id === id
                          return (
                            <ScalePressable
                              key={agentItem.id}
                              onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                                handleCloseSwitcher()
                                if (!isActive) {
                                  handleNavigate(`/(app)/agent/${agentItem.id}`)
                                }
                              }}
                              style={{ 
                                paddingHorizontal: 10, 
                                paddingVertical: 10, 
                                flexDirection: 'row', 
                                alignItems: 'center', 
                                gap: 10,
                                borderRadius: 14,
                                backgroundColor: isActive ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.04)') : 'transparent',
                              }}
                            >
                              <Globe size={16} color={isActive ? theme.foreground : theme.muted} />
                              <Text style={{ color: isActive ? theme.foreground : theme.muted, fontWeight: '600', fontSize: 15, flex: 1 }}>
                                {agentItem.name}
                              </Text>
                              {isActive && (
                                <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: theme.foreground }} />
                              )}
                            </ScalePressable>
                          )
                        })}
                      </View>
                    )}
                  </View>
                </View>
              </Animated.View>
            </View>
          </Modal>

          {/* Settings Bottom Sheet */}
          <Modal
            visible={showSettings}
            transparent
            animationType="none"
            onRequestClose={handleCloseSettings}
          >
            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
              <Pressable 
                style={StyleSheet.absoluteFill} 
                onPress={handleCloseSettings}
              >
                <Animated.View 
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      backgroundColor: 'black',
                      opacity: settingsAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 0.4]
                      })
                    }
                  ]}
                />
              </Pressable>
              
              <Animated.View 
                style={{ 
                  backgroundColor: theme.background,
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  paddingBottom: 40,
                  height: '92%',
                  transform: [
                    { translateY: Animated.add(
                        settingsAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [SCREEN_WIDTH * 2, 0]
                        }),
                        settingsDragY
                      )
                    }
                  ],
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
                  style={{ paddingTop: 10, paddingBottom: 12, alignItems: 'center', width: '100%' }}
                >
                  <View style={{ 
                    width: 40, 
                    height: 5, 
                    borderRadius: 2.5, 
                    backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' 
                  }} />
                </View>

                {/* Header */}
                <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
                  <Text style={{ fontSize: 18, fontWeight: '600', color: theme.foreground, textAlign: 'left' }}>
                    Settings
                  </Text>
                </View>

                <ScrollView 
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingBottom: 40 }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {/* Agent Section */}
                  <View style={{ paddingHorizontal: 24 }}>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: theme.muted, marginBottom: 12, marginLeft: 4 }}>
                      Agent
                    </Text>

                    {/* Name Field */}
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 13, color: theme.muted, marginBottom: 8, marginLeft: 4 }}>Name</Text>
                      <TextInput
                        value={name}
                        onChangeText={handleNameChange}
                        placeholder="Agent name"
                        placeholderTextColor={theme.muted}
                        style={{
                          backgroundColor: isDark ? theme.card : theme.input,
                          borderWidth: 1,
                          borderColor: theme.border,
                          borderRadius: 12,
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          fontSize: 15,
                          color: theme.foreground,
                        }}
                      />
                    </View>

                    {/* Mission Field */}
                    <View>
                      <Text style={{ fontSize: 13, color: theme.muted, marginBottom: 8, marginLeft: 4 }}>Mission</Text>
                      <TextInput
                        value={mission}
                        onChangeText={handleMissionChange}
                        placeholder="What should this agent do?"
                        placeholderTextColor={theme.muted}
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                        style={{
                          backgroundColor: isDark ? theme.card : theme.input,
                          borderWidth: 1,
                          borderColor: theme.border,
                          borderRadius: 12,
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          fontSize: 15,
                          color: theme.foreground,
                          minHeight: 100,
                        }}
                      />
                    </View>
                  </View>

                  {/* Credentials Section - Matches web */}
                  <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: theme.muted, marginBottom: 12, marginLeft: 4 }}>
                      Credentials
                    </Text>
                    <View style={{
                      backgroundColor: isDark ? theme.card : theme.input,
                      borderWidth: 1,
                      borderColor: theme.border,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 14,
                    }}>
                      <Text style={{ fontSize: 14, color: theme.muted, lineHeight: 20 }}>
                        {(agent?.config as { credentials?: Record<string, string> })?.credentials 
                          ? 'Credentials are securely stored for this agent.'
                          : 'No credentials saved. The AI Manager will request them when needed.'}
                      </Text>
                    </View>
                  </View>

                  {/* Danger Zone */}
                  <View style={{ paddingHorizontal: 24, marginTop: 32 }}>
                    <ScalePressable 
                      onPress={handleDeleteAgent}
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
                      <Trash2 size={20} color="#EF4444" />
                      <Text style={{ fontSize: 15, color: '#EF4444', fontWeight: '500' }}>Delete Agent</Text>
                    </ScalePressable>
                  </View>
                </ScrollView>
              </Animated.View>
            </View>
          </Modal>

          {/* Screen Display - Shows when agent is active */}
          {!isLoading && isAgentActive && (
            <FadeInDownView style={{ marginHorizontal: 16, marginTop: 8 }}>
              <View style={{ 
                backgroundColor: theme.card, 
                borderRadius: 24,
                overflow: 'hidden',
                // Subtle shadow matching web
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: isDark ? 0.3 : 0.08,
                shadowRadius: 16,
                elevation: 8,
              }}>
                {/* Screen Preview Area - matches web 16:10 aspect ratio */}
                <View style={{ 
                  aspectRatio: 16/10,
                  borderRadius: 24,
                  overflow: 'hidden',
                }}>
                  {screenshot ? (
                    // Live screenshot view - uses RN Image for reliable updates without flashing
                    <View style={{ flex: 1, position: 'relative' }}>
                      <RNImage
                        source={{ uri: `data:image/png;base64,${screenshot}` }}
                        style={{ 
                          width: '100%', 
                          height: '100%',
                          borderRadius: 24,
                        }}
                        resizeMode="cover"
                      />
                    </View>
                  ) : (
                    // Loading state - VM booting or not ready
                    <View style={{ 
                      flex: 1, 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      backgroundColor: '#1A1918',
                    }}>
                      {/* Premium smooth spinner */}
                      <Animated.View style={{
                        transform: [{
                          rotate: spinnerRotation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '360deg'],
                          }),
                        }],
                      }}>
                        <Loader2 size={32} color="#75736F" strokeWidth={2} />
                      </Animated.View>
                    </View>
                  )}
                  {/* Pulsing blue vignette - shows when agent is active */}
                  {isAgentActive && (
                    <Animated.View 
                      style={{ 
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        borderRadius: 24,
                        opacity: screenshotPulse,
                        overflow: 'hidden',
                      }}
                      pointerEvents="none"
                    >
                      {/* Top vignette */}
                      <LinearGradient
                        colors={['rgba(37, 99, 235, 0.6)', 'rgba(37, 99, 235, 0.2)', 'transparent']}
                        locations={[0, 0.3, 1]}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '40%' }}
                      />
                      {/* Bottom vignette */}
                      <LinearGradient
                        colors={['transparent', 'rgba(37, 99, 235, 0.2)', 'rgba(37, 99, 235, 0.6)']}
                        locations={[0, 0.7, 1]}
                        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%' }}
                      />
                      {/* Left vignette */}
                      <LinearGradient
                        colors={['rgba(37, 99, 235, 0.6)', 'rgba(37, 99, 235, 0.2)', 'transparent']}
                        locations={[0, 0.3, 1]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '35%' }}
                      />
                      {/* Right vignette */}
                      <LinearGradient
                        colors={['transparent', 'rgba(37, 99, 235, 0.2)', 'rgba(37, 99, 235, 0.6)']}
                        locations={[0, 0.7, 1]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '35%' }}
                      />
                    </Animated.View>
                  )}
                </View>
              </View>
            </FadeInDownView>
          )}

          {/* Content Area */}
          {isLoading ? skeletonComponent : listComponent}
          
          {/* Loading indicator */}
          {(isStreaming && !streamingContent) && (
            <FadeInView style={{ paddingHorizontal: 16, paddingVertical: 12, alignItems: 'flex-start' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TypingIndicator color={theme.muted} size={6} />
                <Text style={{ color: theme.muted, fontSize: 13, fontWeight: '500' }}>{agent?.name} is thinking...</Text>
              </View>
            </FadeInView>
          )}

          {/* Input */}
          <SafeAreaView edges={['bottom']} style={{ backgroundColor: theme.background }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
          >
            <FadeInDownView delay={200}>
              <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }}>
                <View 
                  style={{
                    backgroundColor: theme.card,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 24,
                    paddingVertical: 12,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: isDark ? 0.3 : 0.04,
                    shadowRadius: 12,
                    elevation: 3,
                  }}
                >
                  {/* Image Previews */}
                  {selectedImages.length > 0 && (
                    <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8, flexWrap: 'wrap' }}>
                      {selectedImages.map((img, index) => (
                        <View key={index} style={{ position: 'relative' }}>
                          <Image
                            source={{ uri: img.uri }}
                            style={{ width: 60, height: 60, borderRadius: 12, borderWidth: 1, borderColor: theme.border }}
                          />
                          <Pressable
                            onPress={() => removeImage(index)}
                            style={{
                              position: 'absolute',
                              top: -6,
                              right: -6,
                              width: 20,
                              height: 20,
                              borderRadius: 10,
                              backgroundColor: theme.foreground,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <X size={12} color={theme.background} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Text Input */}
                  <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                    <Input
                      value={input}
                      onChangeText={setInput}
                      placeholder={`Message ${agent?.name || 'agent'}...`}
                      placeholderTextColor={theme.muted}
                      multiline
                      maxLength={4000}
                      className="bg-transparent border-0 text-[16px] p-0 m-0"
                      style={{ textAlignVertical: 'top', minHeight: 24, maxHeight: 120, color: theme.foreground }}
                    />
                  </View>

                  {/* Action Buttons */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ScalePressable 
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: theme.border,
                        }}
                        onPress={openActionSheet}
                      >
                        <Plus size={18} color={theme.foreground} />
                      </ScalePressable>
                    </View>

                    <ScalePressable 
                      onPress={handleSend}
                      disabled={(!input.trim() && selectedImages.length === 0) || isLoading || isStreaming}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: (input.trim() || selectedImages.length > 0) && !isLoading && !isStreaming
                          ? theme.foreground
                          : isDark ? '#333' : '#e5e5e5',
                      }}
                    >
                      <ArrowUp 
                        size={16} 
                        color={(input.trim() || selectedImages.length > 0) && !isLoading && !isStreaming
                          ? theme.background
                          : theme.muted
                        } 
                        strokeWidth={2.5}
                      />
                    </ScalePressable>
                  </View>
                </View>
              </View>
            </FadeInDownView>
          </KeyboardAvoidingView>
          </SafeAreaView>
        </SafeAreaView>
      </Animated.View>

      {/* Action Sheet Modal */}
      <Modal
        visible={showActionSheet}
        transparent
        animationType="none"
        onRequestClose={closeActionSheet}
      >
        <Pressable 
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
          onPress={closeActionSheet}
        >
          <Animated.View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: isDark ? '#2C2B27' : '#FFFFFF',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingBottom: 40,
              transform: [{
                translateY: Animated.add(
                  actionSheetAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [300, 0],
                  }),
                  actionSheetDragY
                ),
              }],
            }}
          >
            {/* Drag Handle */}
            <View 
              {...actionSheetPanResponder.panHandlers}
              style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 16, width: '100%' }}
            >
              <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }} />
            </View>

            {/* Photos Section */}
            <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 17, fontWeight: '600', color: theme.foreground }}>Photos</Text>
                <Pressable onPress={pickImage}>
                  <Text style={{ fontSize: 15, fontWeight: '500', color: '#D97757' }}>Show All</Text>
                </Pressable>
              </View>
              <Pressable 
                onPress={pickImage}
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 12,
                  backgroundColor: isDark ? '#2C2B27' : '#F5F3F0',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Camera size={28} color={theme.muted} />
              </Pressable>
            </View>
          </Animated.View>
        </Pressable>
      </Modal>
    </View>
  )
}
