import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  ScrollView,
  Image,
  Modal,
  Dimensions,
  Linking,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native'
import { useTheme } from '@/lib/theme-context'
import { Lightbulb, ChevronDown, Search, X, Globe, ExternalLink } from 'lucide-react-native'
import type { ActivityStep } from '@/store/chat-store'
import { MarkdownText } from './markdown-text'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')

// ─── ExpandableSection with height animation (matches web's AnimatePresence + height) ─────────────────

function ExpandableSection({ isExpanded, children }: { isExpanded: boolean; children: React.ReactNode }) {
  const [measuredHeight, setMeasuredHeight] = useState(0)
  const [isVisible, setIsVisible] = useState(isExpanded)
  const heightAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current
  const opacityAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current
  const contentRef = useRef<View>(null)

  // Handle expand/collapse with proper timing
  useEffect(() => {
    if (isExpanded) {
      setIsVisible(true)
      // Give time for layout to be measured, then animate
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const targetHeight = measuredHeight || 100 // Fallback if not measured yet
          Animated.parallel([
            Animated.timing(heightAnim, {
              toValue: targetHeight,
              duration: 250,
              useNativeDriver: false,
              easing: (t: number) => 1 - Math.pow(1 - t, 3),
            }),
            Animated.timing(opacityAnim, {
              toValue: 1,
              duration: 200,
              useNativeDriver: false,
            }),
          ]).start()
        })
      })
    } else {
      // Sequence: fade out first, then collapse height
      Animated.sequence([
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: false,
        }),
        Animated.timing(heightAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
          easing: (t: number) => 1 - Math.pow(1 - t, 3),
        }),
      ]).start(() => {
        setIsVisible(false)
      })
    }
  }, [isExpanded, measuredHeight, heightAnim, opacityAnim])

  // Don't render if not visible and collapsed
  if (!isVisible && !isExpanded) return null

  return (
    <Animated.View
      style={{
        height: heightAnim,
        opacity: opacityAnim,
        overflow: 'hidden',
      }}
    >
      <View
        ref={contentRef}
        style={{ position: 'absolute', width: '100%' }}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height
          if (h > 0 && h !== measuredHeight) {
            setMeasuredHeight(h)
            // If already expanded, update height immediately
            if (isExpanded) {
              heightAnim.setValue(h)
            }
          }
        }}
      >
        {children}
      </View>
    </Animated.View>
  )
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function getSummary(content: string, activitySteps?: ActivityStep[]): string {
  if (content) {
    const lines = content.split('\n').filter(line => {
      const trimmed = line.trim()
      if (!trimmed) return false
      if (/^(Thinking|Analyzing|Searching|Fetching|Processing)\.\.\.{0,3}$/i.test(trimmed)) return false
      if (/^Analyzing \w+ query\.\.\.{0,3}$/i.test(trimmed)) return false
      if (/^Step \d+:/i.test(trimmed)) return false
      return true
    })
    if (lines.length > 0) {
      let meaningful = lines[0].trim()
        .replace(/^(I('m| am)?\s+)?(thinking|analyzing|considering|evaluating|planning)\s+/i, '')
        .replace(/^(Let me|I'll|I will)\s+/i, '')
        .replace(/\.{3,}$/, '')
        .trim()
      meaningful = meaningful.charAt(0).toUpperCase() + meaningful.slice(1)
      return meaningful.length > 60 ? meaningful.slice(0, 60) + '...' : meaningful
    }
  }

  if (activitySteps?.length) {
    const activeSearch = activitySteps.find(s => s.status === 'active' && (s.kind === 'search' || s.kind === 'browse'))
    if (activeSearch?.data?.query) return `Searching ${activeSearch.data.query}`
    if (activeSearch?.data?.url) {
      try { return `Browsing ${new URL(activeSearch.data.url).hostname.replace(/^www\./, '')}` } catch { return `Browsing...` }
    }
    const activeStep = activitySteps.find(s => s.status === 'active')
    if (activeStep?.label && !/^(Understanding request|Processing\.\.\.|Thinking\.\.\.)$/i.test(activeStep.label)) {
      return activeStep.label.length > 60 ? activeStep.label.slice(0, 60) + '...' : activeStep.label
    }
    const lastComplete = [...activitySteps].reverse().find(s => s.status === 'complete')
    if (lastComplete) {
      const text = lastComplete.description || lastComplete.label
      return text.length > 60 ? text.slice(0, 60) + '...' : text
    }
  }

  return 'Thinking...'
}

function getFaviconUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`
  } catch {
    return null
  }
}

function extractSearchResults(steps: ActivityStep[]): Array<{ title: string; url?: string; favicon?: string; source?: string; description?: string }> {
  const results: Array<{ title: string; url?: string; favicon?: string; source?: string; description?: string }> = []
  const seen = new Set<string>()
  steps.forEach(step => {
    if (step.kind === 'search' || step.kind === 'browse') {
      step.data?.results_v2?.forEach(result => {
        const key = result.url || result.title
        if (key && !seen.has(key)) {
          seen.add(key)
          let favicon = result.favicon
          if (!favicon && result.url) favicon = getFaviconUrl(result.url) || undefined
          results.push({
            ...result,
            favicon,
            source: result.source || (result.url ? (() => { try { return new URL(result.url!).hostname.replace(/^www\./, '') } catch { return undefined } })() : undefined),
          })
        }
      })
    }
  })
  return results
}

// ─── Bouncing dots indicator (matches web's 3-dot bounce) ─────────────────────

function BouncingDots({ color }: { color: string }) {
  const anims = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current

  useEffect(() => {
    const animations = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(anim, { toValue: -3, duration: 300, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }),
        ])
      )
    )
    animations.forEach(a => a.start())
    return () => animations.forEach(a => a.stop())
  }, [anims])

  return (
    <View style={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={{
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: color,
            transform: [{ translateY: anim }],
          }}
        />
      ))}
    </View>
  )
}

// ─── Animated icon wrapper (wiggle/scale while streaming) ─────────────────────

function AnimatedIcon({ children, isStreaming }: { children: React.ReactNode; isStreaming: boolean }) {
  const rotateAnim = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!isStreaming) {
      rotateAnim.setValue(0)
      scaleAnim.setValue(1)
      return
    }
    const rotation = Animated.loop(
      Animated.sequence([
        Animated.timing(rotateAnim, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: -1, duration: 750, useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: 0, duration: 750, useNativeDriver: true }),
      ])
    )
    const scale = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.1, duration: 750, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 750, useNativeDriver: true }),
      ])
    )
    rotation.start()
    scale.start()
    return () => { rotation.stop(); scale.stop() }
  }, [isStreaming, rotateAnim, scaleAnim])

  const rotate = rotateAnim.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-10deg', '0deg', '10deg'] })

  return (
    <Animated.View style={{ transform: [{ rotate }, { scale: scaleAnim }] }}>
      {children}
    </Animated.View>
  )
}

// ─── Favicon cluster (overlapping circles, max 3) with stagger animation ─────────────────────────────

function FaviconCluster({ sources, isStreaming }: { sources: Array<{ favicon?: string; source?: string }>; isStreaming?: boolean }) {
  const { colors: theme, isDark } = useTheme()
  const display = sources.slice(0, 3)
  if (display.length === 0) return null

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {display.map((src, i) => {
        // Stagger animation values
        const scaleAnim = useRef(new Animated.Value(0)).current
        const opacityAnim = useRef(new Animated.Value(0)).current

        useEffect(() => {
          // Staggered entrance animation
          Animated.parallel([
            Animated.timing(scaleAnim, {
              toValue: 1,
              duration: 300,
              delay: i * 80,
              useNativeDriver: true,
              easing: (t) => 1 - Math.pow(1 - t, 3), // ease-out-cubic
            }),
            Animated.timing(opacityAnim, {
              toValue: 1,
              duration: 250,
              delay: i * 80,
              useNativeDriver: true,
            }),
          ]).start()
        }, [scaleAnim, opacityAnim, i])

        return (
          <Animated.View
            key={i}
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: isDark ? theme.surfaceHover : theme.muted,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: i > 0 ? -8 : 0,
              zIndex: display.length - i,
              overflow: 'hidden',
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            }}
          >
            {src.favicon ? (
              <Image source={{ uri: src.favicon }} style={{ width: 16, height: 16 }} resizeMode="contain" />
            ) : (
              <Text style={{ fontSize: 8, fontWeight: '600', color: theme.mutedForeground, textTransform: 'uppercase' }}>
                {src.source?.charAt(0) || '?'}
              </Text>
            )}
          </Animated.View>
        )
      })}
    </View>
  )
}

// ─── Search Results Bottom Sheet ──────────────────────────────────────────────

export function SearchResultsSheet({
  isOpen,
  onClose,
  results,
}: {
  isOpen: boolean
  onClose: () => void
  results: Array<{ title: string; url?: string; favicon?: string; source?: string; description?: string }>
}) {
  const { colors: theme, isDark } = useTheme()
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current
  const dragY = useRef(new Animated.Value(0)).current
  const [isClosing, setIsClosing] = useState(false)

  // Animate in/out
  useEffect(() => {
    if (isOpen) {
      setIsClosing(false)
      dragY.setValue(0)
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 25,
        mass: 0.8,
        stiffness: 300,
        overshootClamping: true,
      }).start()
    } else if (!isClosing) {
      Animated.spring(slideAnim, {
        toValue: SCREEN_HEIGHT,
        useNativeDriver: true,
        damping: 25,
        mass: 0.8,
        stiffness: 300,
        overshootClamping: true,
      }).start(() => setIsClosing(false))
    }
  }, [isOpen, slideAnim, dragY, isClosing])

  // Pan responder for drag-to-close
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        // Only respond to downward drags
        return gestureState.dy > 0 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
      },
      onPanResponderMove: (_: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        if (gestureState.dy > 0) {
          dragY.setValue(gestureState.dy)
        }
      },
      onPanResponderRelease: (_: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          // Close if dragged down far enough or with enough velocity
          setIsClosing(true)
          Animated.spring(slideAnim, {
            toValue: SCREEN_HEIGHT,
            useNativeDriver: true,
            damping: 20,
            mass: 0.5,
            stiffness: 200,
          }).start(() => {
            onClose()
            setIsClosing(false)
          })
        } else {
          // Snap back open
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 20,
            mass: 0.5,
            stiffness: 200,
          }).start()
        }
      },
    })
  ).current

  // Combine slide and drag animations
  const translateY = Animated.add(slideAnim, dragY)

  if (!isOpen && !results.length) return null

  return (
    <Modal transparent visible={isOpen} animationType="none" onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
      >
        <Animated.View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            maxHeight: SCREEN_HEIGHT * 0.7,
            backgroundColor: isDark ? theme.card : theme.background,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            transform: [{ translateY }],
          }}
        >
          <View {...panResponder.panHandlers}>
            {/* Handle bar - draggable */}
            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }} />
            </View>

            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 }}>
              <Search size={16} color={theme.mutedForeground} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: theme.foreground, marginLeft: 8, flex: 1 }}>
                Sources ({results.length})
              </Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={20} color={theme.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={{ height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }} />
          </View>

          {/* Results list - scrollable */}
          <ScrollView style={{ maxHeight: SCREEN_HEIGHT * 0.55, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
            {results.map((result, i) => (
              <TouchableOpacity
                key={i}
                activeOpacity={0.7}
                onPress={() => result.url && Linking.openURL(result.url)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 12,
                  paddingVertical: 14,
                  borderBottomWidth: i < results.length - 1 ? 1 : 0,
                  borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                }}
              >
                <View style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: isDark ? '#2C2B27' : '#F5F3F0',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}>
                  {result.favicon ? (
                    <Image source={{ uri: result.favicon }} style={{ width: 20, height: 20 }} resizeMode="contain" />
                  ) : (
                    <Globe size={16} color={theme.mutedForeground} />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: theme.foreground }} numberOfLines={2}>
                    {result.title}
                  </Text>
                  {result.source && (
                    <Text style={{ fontSize: 12, color: theme.mutedForeground, marginTop: 2 }} numberOfLines={1}>
                      {result.source}
                    </Text>
                  )}
                  {result.description && (
                    <Text style={{ fontSize: 12, color: theme.mutedForeground, marginTop: 4, lineHeight: 18 }} numberOfLines={3}>
                      {result.description}
                    </Text>
                  )}
                </View>
                {result.url && <ExternalLink size={14} color={theme.mutedForeground} style={{ marginTop: 2 }} />}
              </TouchableOpacity>
            ))}
            <View style={{ height: 20 }} />
          </ScrollView>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  )
}

// ─── FormattedThinkingContent (matches web's structured renderer) ─────────────

function FormattedThinkingContent({ content, searchResults }: { content: string; searchResults: Array<{ title: string; url?: string; favicon?: string; source?: string }> }) {
  const { colors: theme, isDark } = useTheme()

  const sections = useMemo(() => {
    const lines = content.split('\n')
    const result: Array<{ type: 'step' | 'search' | 'url' | 'bullet' | 'quote' | 'text'; content: string; url?: string; favicon?: string; stepNum?: number }> = []

    lines.forEach(line => {
      const trimmed = line.trim()
      if (!trimmed) { result.push({ type: 'text', content: '' }); return }

      const stepMatch = trimmed.match(/^(Step\s+(\d+):?)\s*(.*)$/i)
      if (stepMatch) { result.push({ type: 'step', content: stepMatch[3] || trimmed, stepNum: parseInt(stepMatch[2], 10) }); return }

      const searchMatch = trimmed.match(/^(Searching for|Search query|Query):?\s*(.+)$/i)
      if (searchMatch) { result.push({ type: 'search', content: searchMatch[2] }); return }

      const urlRegex = /(https?:\/\/[^\s]+)/g
      const urls = trimmed.match(urlRegex)
      if (urls?.length) {
        const url = urls[0]
        const match = searchResults.find(r => r.url === url)
        let favicon = match?.favicon || getFaviconUrl(url) || undefined
        result.push({ type: 'url', content: trimmed.replace(url, '').trim() || url, url, favicon })
        return
      }

      if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
        result.push({ type: 'bullet', content: trimmed.slice(1).trim() }); return
      }
      if (trimmed.startsWith('>') || (line.startsWith('   ') && trimmed.length > 0)) {
        result.push({ type: 'quote', content: trimmed.replace(/^>/, '').trim() }); return
      }
      result.push({ type: 'text', content: trimmed })
    })
    return result
  }, [content, searchResults])

  return (
    <View style={{ gap: 2 }}>
      {sections.map((section, i) => {
        switch (section.type) {
          case 'step':
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 }}>
                <View style={{
                  width: 20, height: 20, borderRadius: 10,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: theme.foreground }}>{section.stepNum}</Text>
                </View>
                <MarkdownText style={{ fontSize: 14, lineHeight: 22 }} color={theme.foreground}>
                  {section.content}
                </MarkdownText>
              </View>
            )
          case 'search':
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 8, marginHorizontal: -8, borderRadius: 6, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}>
                <Search size={12} color={theme.mutedForeground + '99'} />
                <Text style={{ fontSize: 10, fontWeight: '600', color: theme.mutedForeground + '99', textTransform: 'uppercase', letterSpacing: 0.5 }}>Search</Text>
                <Text style={{ fontSize: 13, color: theme.foreground + 'B3', flex: 1 }} numberOfLines={1}>{section.content}</Text>
              </View>
            )
          case 'url':
            return (
              <TouchableOpacity key={i} onPress={() => section.url && Linking.openURL(section.url)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 3 }}>
                {section.favicon ? (
                  <Image source={{ uri: section.favicon }} style={{ width: 14, height: 14, borderRadius: 7, marginTop: 2 }} resizeMode="contain" />
                ) : (
                  <Globe size={14} color={theme.mutedForeground + '66'} style={{ marginTop: 2 }} />
                )}
                <Text style={{ fontSize: 13, color: isDark ? '#E88768' : '#D97757', flex: 1 }} numberOfLines={1}>{section.content}</Text>
              </TouchableOpacity>
            )
          case 'bullet':
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 2, paddingLeft: 4 }}>
                <Text style={{ color: theme.mutedForeground + '80', marginTop: 4 }}>•</Text>
                <Text style={{ fontSize: 13, color: theme.foreground + 'B3', flex: 1, lineHeight: 20 }}>{section.content}</Text>
              </View>
            )
          case 'quote':
            return (
              <View key={i} style={{ paddingLeft: 12, paddingVertical: 3, borderLeftWidth: 2, borderLeftColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', marginVertical: 2 }}>
                <Text style={{ fontSize: 13, color: theme.mutedForeground + 'CC', fontStyle: 'italic', lineHeight: 20 }}>{section.content}</Text>
              </View>
            )
          case 'text':
            if (!section.content) return <View key={i} style={{ height: 4 }} />
            return (
              <MarkdownText 
                key={i} 
                style={{ fontSize: 13, lineHeight: 20, paddingVertical: 1 }} 
                color={theme.foreground + 'B3'}
              >
                {section.content}
              </MarkdownText>
            )
          default:
            return null
        }
      })}
    </View>
  )
}

// ─── Card wrapper (shared by all thinking display variants) ───────────────────

function ThinkingCard({ children }: { children: React.ReactNode }) {
  const { isDark } = useTheme()
  return (
    <View style={{ marginBottom: 8 }}>
      <View style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        backgroundColor: isDark ? '#2C2B27' : '#F5F3F0',
        overflow: 'hidden',
      }}>
        {children}
      </View>
    </View>
  )
}

// ─── Main ThinkingDisplay (streaming) ─────────────────────────────────────────

interface ThinkingDisplayProps {
  content: string
  isStreaming: boolean
  duration?: number
  activitySteps?: ActivityStep[]
}

export function ThinkingDisplay({ content, isStreaming, duration: durationProp, activitySteps = [] }: ThinkingDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const startTimeRef = useRef<number>(Date.now())
  const [duration, setDuration] = useState<number | undefined>(durationProp)
  const { colors: theme, isDark } = useTheme()
  const expandAnim = useRef(new Animated.Value(0)).current
  const chevronAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (isStreaming) startTimeRef.current = Date.now()
    else if (startTimeRef.current) setDuration(Math.ceil((Date.now() - startTimeRef.current) / 1000))
  }, [isStreaming])

  // Auto-expand while actively working, collapse when done - matches web
  useEffect(() => {
    const hasActiveSteps = activitySteps.some(s => s.status === 'active')
    if (isStreaming || hasActiveSteps) setIsExpanded(true)
    else setIsExpanded(false)
  }, [isStreaming, activitySteps])

  // Animate expand/collapse
  useEffect(() => {
    Animated.timing(expandAnim, { toValue: isExpanded ? 1 : 0, duration: 250, useNativeDriver: false }).start()
    Animated.timing(chevronAnim, { toValue: isExpanded ? 1 : 0, duration: 200, useNativeDriver: true }).start()
  }, [isExpanded, expandAnim, chevronAnim])

  const chevronRotate = chevronAnim.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] })

  const searchSteps = useMemo(() => activitySteps.filter(s => s.kind === 'search' || s.kind === 'browse'), [activitySteps])
  const allSearchResults = useMemo(() => extractSearchResults(activitySteps), [activitySteps])
  const displaySources = useMemo(() => allSearchResults.slice(0, 3), [allSearchResults])
  const summary = useMemo(() => getSummary(content, activitySteps), [content, activitySteps])

  if (!content && searchSteps.length === 0 && activitySteps.length === 0) return null

  return (
    <ThinkingCard>
      {/* Search row - shows when there are search/browse steps */}
      {searchSteps.length > 0 && (
        <TouchableOpacity
          onPress={() => allSearchResults.length > 0 && setShowResults(true)}
          activeOpacity={0.7}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          }}
        >
          <AnimatedIcon isStreaming={isStreaming}>
            <Search size={14} color={theme.mutedForeground + '99'} />
          </AnimatedIcon>
          <Text style={{ fontSize: 13, color: theme.mutedForeground, flex: 1 }} numberOfLines={1}>
            {searchSteps.map(s => s.data?.query || s.label).filter(Boolean).join(' | ') || 'Searching...'}
          </Text>
          {displaySources.length > 0 && <FaviconCluster sources={displaySources} />}
          {allSearchResults.length > 0 && (
            <Text style={{ fontSize: 12, color: theme.mutedForeground + '80' }}>{allSearchResults.length}</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Think toggle row */}
      <TouchableOpacity
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <AnimatedIcon isStreaming={isStreaming}>
          <Lightbulb size={14} color={theme.mutedForeground + '99'} />
        </AnimatedIcon>

        <Text
          style={{
            fontSize: 14,
            fontWeight: '500',
            color: isExpanded ? (theme.foreground + 'CC') : theme.mutedForeground,
            flex: 1,
          }}
          numberOfLines={1}
        >
          {isExpanded ? 'Think' : summary}
        </Text>

        {isStreaming && <BouncingDots color={theme.mutedForeground} />}

        <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
          <ChevronDown size={14} color={theme.mutedForeground + '80'} />
        </Animated.View>
      </TouchableOpacity>

      {/* Expanded content with height animation */}
      <ExpandableSection isExpanded={isExpanded}>
        {content ? (
          <ScrollView
            style={{ maxHeight: 300 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled
          >
            <FormattedThinkingContent content={content} searchResults={allSearchResults} />
            <View style={{ height: 12 }} />
          </ScrollView>
        ) : null}
      </ExpandableSection>

      {/* Search results bottom sheet */}
      <SearchResultsSheet isOpen={showResults} onClose={() => setShowResults(false)} results={allSearchResults} />
    </ThinkingCard>
  )
}

// ─── Persisted ThinkingDisplay (for saved AI messages with metadata) ──────────

export function PersistedThinkingDisplay({
  activityTrace,
  thinkingContent,
}: {
  activityTrace?: ActivityStep[]
  thinkingContent?: string
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const { colors: theme, isDark } = useTheme()
  const chevronAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(chevronAnim, { toValue: isExpanded ? 1 : 0, duration: 200, useNativeDriver: true }).start()
  }, [isExpanded, chevronAnim])

  const chevronRotate = chevronAnim.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] })

  const content = useMemo(() => {
    if (activityTrace?.length) {
      const parts = activityTrace.map(s => s.description || s.label).filter(Boolean)
      if (parts.join('\n\n')) return parts.join('\n\n')
    }
    return thinkingContent || ''
  }, [activityTrace, thinkingContent])

  const searchSteps = useMemo(() => (activityTrace || []).filter(s => s.kind === 'search' || s.kind === 'browse'), [activityTrace])
  const allSearchResults = useMemo(() => extractSearchResults(activityTrace || []), [activityTrace])
  const displaySources = useMemo(() => allSearchResults.slice(0, 3), [allSearchResults])
  const summary = useMemo(() => getSummary(content, activityTrace), [content, activityTrace])

  if (!content && (!activityTrace || activityTrace.length === 0)) return null

  return (
    <ThinkingCard>
      {/* Search row */}
      {searchSteps.length > 0 && allSearchResults.length > 0 && (
        <TouchableOpacity
          onPress={() => setShowResults(true)}
          activeOpacity={0.7}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          }}
        >
          <Search size={14} color={theme.mutedForeground + '99'} />
          <Text style={{ fontSize: 13, color: theme.mutedForeground, flex: 1 }} numberOfLines={1}>
            {searchSteps.map(s => s.data?.query || s.label).filter(Boolean).join(' | ')}
          </Text>
          <FaviconCluster sources={displaySources} />
          <Text style={{ fontSize: 12, color: theme.mutedForeground + '80' }}>{allSearchResults.length}</Text>
        </TouchableOpacity>
      )}

      {/* Think toggle */}
      <TouchableOpacity
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 }}
      >
        <Lightbulb size={14} color={theme.mutedForeground + '99'} />
        <Text style={{ fontSize: 14, fontWeight: '500', color: isExpanded ? (theme.foreground + 'CC') : theme.mutedForeground, flex: 1 }} numberOfLines={1}>
          {isExpanded ? 'Think' : summary}
        </Text>
        <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
          <ChevronDown size={14} color={theme.mutedForeground + '80'} />
        </Animated.View>
      </TouchableOpacity>

      <ExpandableSection isExpanded={isExpanded}>
        {content ? (
          <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }} showsVerticalScrollIndicator nestedScrollEnabled>
            <FormattedThinkingContent content={content} searchResults={allSearchResults} />
            <View style={{ height: 12 }} />
          </ScrollView>
        ) : null}
      </ExpandableSection>

      <SearchResultsSheet isOpen={showResults} onClose={() => setShowResults(false)} results={allSearchResults} />
    </ThinkingCard>
  )
}

// ─── References (inline with AI message actions) ──────────────────────────────

export function References({ activityTrace }: { activityTrace?: ActivityStep[] }) {
  const [showResults, setShowResults] = useState(false)
  const { colors: theme } = useTheme()

  const allSearchResults = useMemo(() => extractSearchResults(activityTrace || []), [activityTrace])
  const displaySources = useMemo(() => allSearchResults.slice(0, 3), [allSearchResults])

  if (allSearchResults.length === 0) return null

  return (
    <>
      <TouchableOpacity
        onPress={() => setShowResults(true)}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingLeft: 8,
          borderLeftWidth: 1,
          borderLeftColor: theme.border,
          marginLeft: 4,
        }}
      >
        <FaviconCluster sources={displaySources} />
        <Text style={{ fontSize: 13, color: theme.mutedForeground }}>Reference</Text>
      </TouchableOpacity>
      <SearchResultsSheet isOpen={showResults} onClose={() => setShowResults(false)} results={allSearchResults} />
    </>
  )
}

// ─── StoredThinkingMessage (for msgType === 'thinking' from DB) ───────────────

export function StoredThinkingMessage({
  content,
  durationSeconds,
}: {
  content: string
  durationSeconds?: number
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { colors: theme, isDark } = useTheme()
  const chevronAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(chevronAnim, { toValue: isExpanded ? 1 : 0, duration: 200, useNativeDriver: true }).start()
  }, [isExpanded, chevronAnim])

  const chevronRotate = chevronAnim.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] })

  const label = durationSeconds && durationSeconds > 0
    ? `Thought for ${durationSeconds}s`
    : 'Thoughts'

  return (
    <ThinkingCard>
      <TouchableOpacity
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 }}
      >
        <Lightbulb size={14} color={theme.mutedForeground + '99'} />
        <Text style={{ fontSize: 14, fontWeight: '500', color: theme.mutedForeground, flex: 1 }}>{label}</Text>
        <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
          <ChevronDown size={14} color={theme.mutedForeground + '80'} />
        </Animated.View>
      </TouchableOpacity>

      <ExpandableSection isExpanded={isExpanded}>
        {content ? (
          <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }} showsVerticalScrollIndicator nestedScrollEnabled>
            <Text style={{ fontSize: 13, lineHeight: 20, color: theme.mutedForeground, marginTop: 4 }}>{content}</Text>
            <View style={{ height: 12 }} />
          </ScrollView>
        ) : null}
      </ExpandableSection>
    </ThinkingCard>
  )
}
