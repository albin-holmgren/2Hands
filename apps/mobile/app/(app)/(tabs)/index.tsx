import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { 
  View, 
  Text, 
  FlatList, 
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Image,
  PanResponder,
  Keyboard,
  Easing,
  Share,
  TextInput,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { router } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as Clipboard from 'expo-clipboard'
import { useKeyboardHandler, KeyboardGestureArea } from 'react-native-keyboard-controller'
import Reanimated, { useAnimatedStyle, useSharedValue, withTiming, interpolateColor } from 'react-native-reanimated'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
import { SafeAreaView } from 'react-native-safe-area-context'
import { 
  Plus, 
  ArrowUp, 
  ChevronDown, 
  Sparkles,
  Search,
  MessageSquare,
  Bot,
  Check,
  ChevronRight,
  User,
  Globe,
  X,
  Camera,
  ImageIcon,
  Lightbulb,
  Brain,
  GraduationCap,
  Copy,
  Volume2,
  VolumeX,
  Share2,
} from 'lucide-react-native'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { useChat } from '@/hooks/use-chat'
import { 
  FadeInView, 
  FadeInDownView, 
  Input, 
  ScalePressable,
  TypingIndicator,
  Skeleton
} from '@/components/ui'
import { Sidebar } from '@/components/sidebar'
import { MarkdownText } from '@/components/markdown-text'
import { ThinkingDisplay, StoredThinkingMessage, PersistedThinkingDisplay, References } from '@/components/thinking-display'
import { ToolExecutionIndicator } from '@/components/tool-execution-indicator'
import { useChatStore } from '@/store/chat-store'
import type { Message } from '@/store/chat-store'
import { useTheme } from '@/lib/theme-context'

// Web app colors - aligned with brand guidelines
const colors = {
  light: {
    background: '#FFFFFF',
    foreground: '#34322D',
    card: '#FFFFFF',
    border: '#F0EDE6',
    muted: '#75736F',
    input: '#F5F3F0',
    userBubble: '#F5F3F0',
    thinkingBg: '#F5F3F0',
  },
  dark: {
    background: '#1A1918',
    foreground: '#F5F3F0',
    card: '#2C2B27',
    border: '#57504A',
    muted: '#C8C6C3',
    input: '#2C2B27',
    userBubble: '#2C2B27',
    thinkingBg: '#2C2B27',
  }
}

// Actions for AI messages - matches web's Actions component exactly
function MessageActions({ content, theme, isLastMessage = false }: { content: string; theme: typeof colors.light; isLastMessage?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)

  const handleCopy = async () => {
    await Clipboard.setStringAsync(content)
    setCopied(true)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSpeak = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (isSpeaking) {
      // Stop speaking
      setIsSpeaking(false)
      return
    }
    setIsSpeaking(true)
    // Auto-reset after estimated reading time
    const words = content.split(/\s+/).length
    const readTimeMs = Math.max(2000, (words / 3) * 1000)
    setTimeout(() => setIsSpeaking(false), readTimeMs)
  }

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    try {
      await Share.share({
        message: content,
      })
    } catch {
      // User cancelled share
    }
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
      <TouchableOpacity
        onPress={handleCopy}
        activeOpacity={0.6}
        style={{ padding: 6, borderRadius: 8 }}
      >
        {copied ? (
          <Check size={14} color="#D97757" />
        ) : (
          <Copy size={14} color={theme.muted} />
        )}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={handleSpeak}
        activeOpacity={0.6}
        style={{ padding: 6, borderRadius: 8 }}
      >
        {isSpeaking ? (
          <VolumeX size={14} color="#D97757" />
        ) : (
          <Volume2 size={14} color={theme.muted} />
        )}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={handleShare}
        activeOpacity={0.6}
        style={{ padding: 6, borderRadius: 8 }}
      >
        <Share2 size={14} color={theme.muted} />
      </TouchableOpacity>
    </View>
  )
}

export default function ChatScreen() {
  const { isDark } = useTheme()
  const theme = isDark ? colors.dark : colors.light
  const [input, setInput] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const switcherAnim = useRef(new Animated.Value(0)).current
  const flatListRef = useRef<FlatList>(null)
  const inputRef = useRef<any>(null)
  const { agents, planType } = useChatStore()
  const [isAtBottom, setIsAtBottom] = useState(true)
  const hasInitialScrolled = useRef(false)
  
  const focusInput = useCallback(() => {
    inputRef.current?.focus()
  }, [])

  // Keyboard height animation (best practice from Expo docs)
  const keyboardHeight = useSharedValue(0)
  const [keyboardVisible, setKeyboardVisible] = useState(false)

  // Send button animation (shared value - effect added after state declarations)
  const sendButtonActive = useSharedValue(0)
  useKeyboardHandler({
    onMove: (e) => {
      'worklet'
      keyboardHeight.value = Math.max(e.height, 0)
    },
    onStart: () => {
      'worklet'
    },
    onEnd: (e) => {
      'worklet'
    },
  }, [])
  
  // Track keyboard visibility for safe area
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true),
    )
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false),
    )
    return () => { showSub.remove(); hideSub.remove() }
  }, [])
  
  const keyboardStyle = useAnimatedStyle(() => ({
    height: keyboardHeight.value,
  }))
  
  useEffect(() => {
    if (showSwitcher) {
      Animated.spring(switcherAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 18,
        mass: 0.8,
        stiffness: 350,
        overshootClamping: true,
      }).start()
    } else {
      Animated.timing(switcherAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
        easing: Easing.out(Easing.ease),
      }).start()
    }
  }, [showSwitcher])

  const handleCloseSwitcher = () => {
    Animated.timing(switcherAnim, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
      easing: Easing.in(Easing.ease),
    }).start(() => setShowSwitcher(false))
  }
  
  // Content slide animation - matches sidebar spring physics
  const contentSlideAnim = useRef(new Animated.Value(SCREEN_WIDTH * 0.1)).current
  const contentOpacity = useRef(new Animated.Value(0)).current
  const contentScale = useRef(new Animated.Value(0.98)).current
  const cursorAnim = useRef(new Animated.Value(1)).current
  
  const [hasAnimatedIn, setHasAnimatedIn] = useState(false)
  
  // Initial entrance animation when screen loads
  useEffect(() => {
    if (!hasAnimatedIn) {
      Animated.parallel([
        Animated.spring(contentSlideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 32,
          mass: 1,
          stiffness: 140,
        }),
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.spring(contentScale, {
          toValue: 1,
          useNativeDriver: true,
          damping: 32,
          mass: 1,
          stiffness: 140,
        }),
      ]).start(() => setHasAnimatedIn(true))
    }
  }, [])

  const handleNavigate = (path: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    Keyboard.dismiss()
    
    // Premium exit animation
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(contentScale, {
        toValue: 0.96,
        useNativeDriver: true,
        damping: 30,
        mass: 1,
        stiffness: 150,
      }),
      Animated.spring(contentSlideAnim, {
        toValue: -SCREEN_WIDTH * 0.1,
        useNativeDriver: true,
        damping: 30,
        mass: 1,
        stiffness: 150,
      }),
    ]).start(() => {
      router.replace(path as any)
    })
  }

  useEffect(() => {
    if (!hasAnimatedIn) return
    
    if (isSidebarOpen) {
      // When sidebar opens, subtle push back effect
      Animated.parallel([
        Animated.spring(contentSlideAnim, {
          toValue: SCREEN_WIDTH * 0.15,
          useNativeDriver: true,
          damping: 30,
          mass: 0.8,
          stiffness: 120,
        }),
        Animated.timing(contentOpacity, {
          toValue: 0.5,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.spring(contentScale, {
          toValue: 0.95,
          useNativeDriver: true,
          damping: 30,
          mass: 0.8,
          stiffness: 120,
        }),
      ]).start()
    } else {
      // When sidebar closes, smooth elegant return - no bounce
      Animated.parallel([
        Animated.spring(contentSlideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 50,
          mass: 1,
          stiffness: 150,
          overshootClamping: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(contentScale, {
          toValue: 1,
          useNativeDriver: true,
          damping: 50,
          mass: 1,
          stiffness: 150,
          overshootClamping: true,
        }),
      ]).start()
    }
  }, [isSidebarOpen])
  
  const {
    messages,
    isLoading,
    isStreaming,
    streamingContent,
    thinkingContent,
    isThinking,
    executingTool,
    activitySteps,
    aiName,
    credits,
    initialized,
    sendMessage: sendChatMessage,
    loadMoreMessages,
    hasMoreMessages,
    isLoadingMore,
  } = useChat()

  // Cursor blink animation for streaming
  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null
    
    if (isStreaming) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(cursorAnim, {
            toValue: 0.4,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(cursorAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      )
      animation.start()
    } else {
      cursorAnim.setValue(1)
    }
    
    return () => {
      animation?.stop()
    }
  }, [isStreaming])

  const [selectedImages, setSelectedImages] = useState<Array<{ uri: string; base64: string; mediaType: string }>>([])

  // Send button color animation
  useEffect(() => {
    const isActive = (input.trim().length > 0 || selectedImages.length > 0) && !isLoading && !isStreaming
    sendButtonActive.value = withTiming(isActive ? 1 : 0, { duration: 200 })
  }, [input, selectedImages.length, isLoading, isStreaming])

  const sendButtonBgStyle = useAnimatedStyle(() => {
    const bg = interpolateColor(
      sendButtonActive.value,
      [0, 1],
      [isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', isDark ? 'rgba(255,255,255,0.9)' : '#D97757']
    )
    return { backgroundColor: bg }
  })

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
          Animated.spring(actionSheetDragY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 20,
          }).start()
        }
      },
    })
  ).current

  const openActionSheet = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setShowActionSheet(true)
    actionSheetDragY.setValue(0)
    Animated.spring(actionSheetAnim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 20,
      mass: 1,
      stiffness: 150,
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

  const handleSend = async () => {
    if ((!input.trim() && selectedImages.length === 0) || isLoading || isStreaming) return

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setIsAtBottom(true)
    const content = input.trim()
    const imagesToSend = selectedImages.length > 0 ? selectedImages.map(img => ({
      base64: img.base64,
      mediaType: img.mediaType,
    })) : undefined
    
    setInput('')
    setSelectedImages([])
    
    await sendChatMessage(content, imagesToSend)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  }

  const displayMessages = useMemo(() => {
    let result: Message[] = []
    if (!isStreaming) {
      result = messages
    } else if (!streamingContent) {
      const last = messages[messages.length - 1]
      result = last?.role === 'assistant' ? messages.slice(0, -1) : messages
    } else {
      const last = messages[messages.length - 1]
      if (!last) {
        result = [
          {
            id: '__streaming__',
            conversation_id: 'streaming',
            role: 'assistant',
            content: streamingContent,
            created_at: new Date().toISOString(),
          } satisfies Message,
        ]
      } else if (last.role === 'assistant') {
        const updated = [...messages]
        updated[updated.length - 1] = { ...last, content: streamingContent }
        result = updated
      } else {
        result = [
          ...messages,
          {
            id: '__streaming__',
            conversation_id: last.conversation_id,
            role: 'assistant',
            content: streamingContent,
            created_at: new Date().toISOString(),
          } satisfies Message,
        ]
      }
    }
    // Invert for FlatList
    return [...result].reverse()
  }, [isStreaming, messages, streamingContent])

  // Inverted FlatList naturally anchors to bottom (index 0 is the newest message)
  // No complex auto-scroll logic needed anymore
  useEffect(() => {
    if (displayMessages.length > 0 && !hasInitialScrolled.current) {
      hasInitialScrolled.current = true
    }
  }, [displayMessages.length])

  const handleMessageListScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset } = e.nativeEvent
    const atBottom = contentOffset.y <= 24
    setIsAtBottom(prev => (prev === atBottom ? prev : atBottom))
  }

  const renderMessage = ({ item, index }: { item: Message, index: number }) => {
    const isUser = item.role === 'user'
    const isLatest = index === 0
    const metadata = item.metadata as { type?: string; sender?: string } | undefined
    const msgType = metadata?.type
    // Thinking: progress/acknowledgement/thinking (matches web's thinking message type)
    const isThinkingMsg = msgType === 'progress' || msgType === 'acknowledgement' || msgType === 'thinking'
    // Action: browsed, searched, read (shown as simple gray text)
    const isAction = msgType === 'action'
    
    // Calculate thinking time from actual message timestamp
    const messageTime = item.created_at ? new Date(item.created_at).getTime() : Date.now()
    const nextMsgTime = displayMessages[index - 1]?.created_at 
      ? new Date(displayMessages[index - 1].created_at).getTime() 
      : Date.now()
    const thinkingTime = Math.max(1, Math.min(30, Math.round((nextMsgTime - messageTime) / 1000)))

    // Message grouping - matches web's isFirstInGroup/isLastInGroup logic
    // Note: displayMessages is inverted (index 0 = newest), so prev/next are swapped
    const prevMsg = displayMessages[index + 1]
    const nextMsg = displayMessages[index - 1]
    const isFirstInGroup = !prevMsg || prevMsg.role !== item.role
    const isLastInGroup = !nextMsg || nextMsg.role !== item.role

    // Spacing: web uses space-y-8 (32px) between messages, but tighter within groups
    const verticalPadding = !isFirstInGroup ? 2 : 16
    
    return (
      <View 
        key={item.id}
        style={{ 
          paddingHorizontal: 16, 
          paddingTop: verticalPadding,
          paddingBottom: isLastInGroup ? 16 : 2,
          alignItems: isUser ? 'flex-end' : 'flex-start',
          width: '100%',
        }}
      >
        {isUser ? (
          // User messages: guideline-aligned surface + border treatment
          <View 
            style={{
              maxWidth: '85%',
              backgroundColor: theme.userBubble,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 16,
              paddingLeft: 16,
              paddingRight: 16,
              paddingVertical: 12,
              alignSelf: 'flex-end',
            }}
          >
            <Text style={{ color: theme.foreground, fontSize: 16, lineHeight: 26 }}>
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
        ) : isThinkingMsg ? (
          // Stored thinking message from DB - matches web's Reasoning component
          <View style={{ maxWidth: '100%', paddingVertical: 4 }}>
            <StoredThinkingMessage 
              content={item.content.replace(/\*\*Update\*\*\n\n/g, '').replace(/\*\*/g, '')} 
              durationSeconds={thinkingTime} 
            />
          </View>
        ) : (
          // AI messages: full-width prose styling - matches web exactly
          <View style={{ width: '100%', paddingVertical: 4 }}>
            {/* Persisted thinking from metadata - matches web's inline ThinkingDisplay */}
            {(() => {
              const meta = item.metadata as { activity_trace?: any[]; thinking_content?: string } | null
              if (meta?.activity_trace?.length || meta?.thinking_content) {
                return (
                  <PersistedThinkingDisplay
                    activityTrace={meta?.activity_trace as any}
                    thinkingContent={meta?.thinking_content}
                  />
                )
              }
              return null
            })()}
            <MarkdownText 
              style={{ fontSize: 16, lineHeight: 28 }}
              color={theme.foreground}
            >
              {item.content}
            </MarkdownText>
            {/* Streaming cursor */}
            {isStreaming && isLatest && (
              <Animated.View
                style={{
                  width: 2,
                  height: 16,
                  backgroundColor: theme.foreground,
                  opacity: cursorAnim,
                  marginLeft: 2,
                  marginTop: 4,
                }}
              />
            )}
            {item.content.includes('run out of credits') && (
              <TouchableOpacity
                onPress={() => router.push('/(app)/upgrade')}
                activeOpacity={0.7}
                style={{
                  marginTop: 12,
                  backgroundColor: theme.foreground,
                  borderRadius: 12,
                  paddingVertical: 12,
                  paddingHorizontal: 20,
                  alignSelf: 'flex-start',
                }}
              >
                <Text style={{ color: theme.background, fontSize: 15, fontWeight: '700' }}>
                  Upgrade or Buy Credits
                </Text>
              </TouchableOpacity>
            )}
            {/* Copy action + References for completed AI messages - matches web */}
            {!isUser && !(isStreaming && isLatest) && msgType !== 'thinking' && item.content.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                <MessageActions content={item.content} theme={theme} isLastMessage={isLatest} />
                {(() => {
                  const meta = item.metadata as { activity_trace?: any[] } | null
                  if (meta?.activity_trace?.length) {
                    return <References activityTrace={meta.activity_trace as any} />
                  }
                  return null
                })()}
              </View>
            )}
          </View>
        )}
      </View>
    )
  }

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
      {/* Header */}
      <FadeInDownView delay={50}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Left: Burger Menu + AI Switcher */}
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
                Keyboard.dismiss()
                setIsSidebarOpen(true)
              }}
            >
              <View style={{ width: 20, height: 10, justifyContent: 'space-between' }}>
                <View style={{ height: 2, width: '100%', backgroundColor: theme.foreground, borderRadius: 1 }} />
                <View style={{ height: 2, width: '70%', backgroundColor: theme.foreground, borderRadius: 1 }} />
              </View>
            </ScalePressable>

            {/* AI Switcher - Left aligned */}
            <ScalePressable 
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                setShowSwitcher(true)
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 4 }}
            >
              <Text style={{ color: theme.foreground, fontWeight: '600', fontSize: 16 }}>{aiName || '2Hands'}</Text>
              <ChevronDown size={16} color={theme.muted} />
            </ScalePressable>
          </View>

          {/* Right: Credits & Upgrade (only for free users) */}
          {!planType || planType === 'free' ? (
            <ScalePressable 
              style={{
                backgroundColor: theme.card,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 12,
                paddingHorizontal: 10,
                paddingVertical: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.04,
                shadowRadius: 3,
              }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                router.push('/(app)/upgrade')
              }}
            >
              {/* Credits */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Sparkles size={12} color={theme.muted} />
                <Text style={{ color: theme.foreground, fontWeight: '600', fontSize: 13 }}>{credits.toLocaleString()}</Text>
              </View>
              
              {/* Divider */}
              <View style={{ width: 1, height: 14, backgroundColor: theme.border }} />
              
              {/* Upgrade */}
              <Text style={{ color: '#D97757', fontWeight: '600', fontSize: 12 }}>Upgrade</Text>
            </ScalePressable>
          ) : (
            /* Paid users: just show credits */
            <View 
              style={{
                backgroundColor: theme.card,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 12,
                paddingHorizontal: 10,
                paddingVertical: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Sparkles size={12} color={theme.muted} />
              <Text style={{ color: theme.foreground, fontWeight: '600', fontSize: 13 }}>{credits.toLocaleString()}</Text>
            </View>
          )}
        </View>
      </FadeInDownView>

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
                    outputRange: [-12, 0]
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
                {/* AI Manager Option - Active */}
                <ScalePressable
                  onPress={handleCloseSwitcher}
                  style={{ 
                    paddingHorizontal: 10, 
                    paddingVertical: 10, 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    gap: 10,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.04)',
                    borderRadius: 14,
                  }}
                >
                  <User size={16} color={theme.foreground} />
                  <Text style={{ color: theme.foreground, fontWeight: '600', fontSize: 15, flex: 1 }}>{aiName || '2Hands'}</Text>
                  <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: theme.foreground }} />
                </ScalePressable>
                
                {/* Agents Section */}
                {agents.length > 0 && (
                  <View style={{ marginTop: 6 }}>
                    <View style={{ paddingHorizontal: 14, paddingVertical: 6 }}>
                      <Text style={{ color: theme.muted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.2 }}>Your Agents</Text>
                    </View>
                    {agents.map((agent) => (
                      <ScalePressable
                        key={agent.id}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                          handleCloseSwitcher()
                          handleNavigate(`/(app)/agent/${agent.id}`)
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
                        <Globe size={16} color={theme.muted} />
                        <Text style={{ color: theme.muted, fontWeight: '400', fontSize: 15 }}>{agent.name}</Text>
                      </ScalePressable>
                    ))}
                  </View>
                )}
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Messages */}
      <KeyboardGestureArea interpolator="ios" style={{ flex: 1 }}>
        {isLoading && messages.length === 0 ? (
          // Skeleton loading for initial load
          <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 20 }}>
            <View style={{ gap: 16 }}>
              <FadeInView delay={100} style={{ alignItems: 'flex-start' }}>
                <Skeleton width="75%" height={80} borderRadius={20} />
              </FadeInView>
              <FadeInView delay={200} style={{ alignItems: 'flex-end' }}>
                <Skeleton width="60%" height={60} borderRadius={20} />
              </FadeInView>
              <FadeInView delay={300} style={{ alignItems: 'flex-start' }}>
                <Skeleton width="85%" height={100} borderRadius={20} />
              </FadeInView>
              <FadeInView delay={400} style={{ alignItems: 'flex-end' }}>
                <Skeleton width="50%" height={50} borderRadius={20} />
              </FadeInView>
            </View>
          </View>
        ) : (
          <FlatList
          ref={flatListRef}
          data={displayMessages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          onScroll={handleMessageListScroll}
          scrollEventThrottle={16}
          inverted
          removeClippedSubviews={false}
          getItemLayout={undefined}
          onEndReached={() => {
            if (hasMoreMessages && !isLoadingMore) {
              loadMoreMessages()
            }
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isLoadingMore ? (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#D97757" />
              </View>
            ) : null
          }
          style={{ flex: 1 }}
          contentContainerStyle={{ 
            paddingVertical: 16, 
            paddingBottom: 16,
          }}
          ListEmptyComponent={null}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        />
        )}
      </KeyboardGestureArea>

      {/* Streaming content - no background like web */}
      {null}
      
      {/* Loading indicator - show thinking, tool execution, or typing dots */}
      {(isLoading || isStreaming) && (
        <FadeInView style={{ paddingHorizontal: 16, paddingVertical: 12, alignItems: 'flex-start', width: '100%' }}>
          {/* Chain of thought / reasoning */}
          {(isThinking || thinkingContent || activitySteps.length > 0) && (
            <ThinkingDisplay content={thinkingContent} isStreaming={isThinking} activitySteps={activitySteps} />
          )}

          {/* Tool execution indicator */}
          {executingTool ? (
            <ToolExecutionIndicator name={executingTool.name} type={executingTool.type} />
          ) : !streamingContent && !thinkingContent && !isThinking ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TypingIndicator color={theme.muted} size={6} />
              <Text style={{ color: theme.muted, fontSize: 13, fontWeight: '500' }}>{aiName || '2Hands'} is thinking...</Text>
            </View>
          ) : null}
        </FadeInView>
      )}

      {/* Input - matches web design exactly */}
      <View style={{ backgroundColor: theme.background }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: keyboardVisible ? 12 : 34 }}>
          {/* Image Previews - positioned outside input container like web */}
          {selectedImages.length > 0 && (
            <View style={{ flexDirection: 'row', paddingHorizontal: 4, paddingBottom: 8, gap: 8, flexWrap: 'wrap' }}>
              {selectedImages.map((img, index) => (
                <View key={index} style={{ position: 'relative' }}>
                  <Image
                    source={{ uri: img.uri }}
                    style={{ width: 40, height: 40, borderRadius: 8 }}
                  />
                  <Pressable
                    onPress={() => removeImage(index)}
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      width: 16,
                      height: 16,
                      borderRadius: 8,
                      backgroundColor: theme.foreground,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <X size={10} color={theme.background} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <View
            style={{
              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F3F0',
              borderRadius: 32,
              paddingVertical: 10,
              paddingHorizontal: 12,
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: 4,
            }}
          >
              {/* Left: Plus button */}
              <ScalePressable 
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={openActionSheet}
              >
                <Plus size={20} color={theme.muted} />
              </ScalePressable>

              {/* Middle: Text Input */}
              <TextInput
                ref={inputRef}
                value={input}
                onChangeText={setInput}
                placeholder="Assign a task or ask anything"
                placeholderTextColor={theme.muted}
                selectionColor="#75736F"
                cursorColor="#75736F"
                multiline
                maxLength={4000}
                style={{ 
                  flex: 1,
                  color: theme.foreground,
                  fontSize: 16,
                  lineHeight: 22,
                  minHeight: 22,
                  maxHeight: 200,
                  paddingVertical: 6,
                  paddingLeft: 8,
                  paddingRight: 4,
                  backgroundColor: 'transparent',
                  borderWidth: 0,
                }}
              />

              {/* Right: Send button */}
              {isStreaming ? (
                <ScalePressable 
                  onPress={() => {}}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                  }}
                >
                  <View style={{ width: 12, height: 12, backgroundColor: theme.foreground, borderRadius: 2 }} />
                </ScalePressable>
              ) : (
                <Pressable
                  onPress={handleSend}
                  disabled={(!input.trim() && selectedImages.length === 0) || isLoading || isStreaming}
                >
                  <Reanimated.View
                    style={[
                      {
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        alignItems: 'center',
                        justifyContent: 'center',
                      },
                      sendButtonBgStyle,
                    ]}
                  >
                    <ArrowUp 
                      size={18} 
                      color={(input.trim() || selectedImages.length > 0) && !isLoading && !isStreaming
                        ? '#FFFFFF'
                        : theme.muted
                      } 
                      strokeWidth={2.5}
                    />
                  </Reanimated.View>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      {/* Animated spacer that matches keyboard height */}
      <Reanimated.View style={keyboardStyle} />
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
