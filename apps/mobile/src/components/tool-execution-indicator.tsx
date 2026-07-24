import React, { useEffect, useRef } from 'react'
import { View, Text, Animated, StyleSheet } from 'react-native'
import { useTheme } from '@/lib/theme-context'
import { Cpu, Settings, Trash2, FileText, Sparkles, Search } from 'lucide-react-native'

interface ToolExecutionIndicatorProps {
  name: string
  type: 'create' | 'modify' | 'delete' | 'report' | 'search'
}

const TYPE_LABELS: Record<string, string> = {
  create: 'Provisioning autonomous agent...',
  modify: 'Updating configurations...',
  delete: 'Decommissioning resources...',
  report: 'Analyzing data & generating insights...',
  search: 'Searching web for real-time data...',
}

export function ToolExecutionIndicator({ name, type }: ToolExecutionIndicatorProps) {
  const { colors: theme, isDark } = useTheme()
  const pulseAnim = useRef(new Animated.Value(1)).current
  const spinAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    )

    const spin = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      })
    )

    pulse.start()
    spin.start()

    return () => {
      pulse.stop()
      spin.stop()
    }
  }, [])

  const spinInterpolate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  const IconComponent = {
    create: Cpu,
    modify: Settings,
    delete: Trash2,
    report: FileText,
    search: Search,
  }[type] || Sparkles

  return (
    <View style={[styles.container, { 
      backgroundColor: isDark ? 'rgba(25,25,25,0.5)' : 'rgba(255,255,255,0.5)',
      borderColor: theme.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.3 : 0.03,
      shadowRadius: 20,
    }]}>
      <View style={styles.iconContainer}>
        <View style={[styles.iconBg, { backgroundColor: theme.primary }]}>
          {type === 'modify' ? (
            <Animated.View style={{ transform: [{ rotate: spinInterpolate }] }}>
              <IconComponent size={18} color={theme.primaryForeground} />
            </Animated.View>
          ) : (
            <IconComponent size={18} color={theme.primaryForeground} />
          )}
        </View>
        <Animated.View style={[styles.iconPulse, { 
          borderColor: theme.foreground + '1A',
          transform: [{ scale: pulseAnim }],
        }]} />
      </View>

      <View style={styles.textContainer}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: theme.foreground }]} numberOfLines={1}>
            {name}
          </Text>
          <Animated.View style={{ transform: [{ rotate: spinInterpolate }] }}>
            <Sparkles size={12} color={theme.mutedForeground} />
          </Animated.View>
        </View>
        <Text style={[styles.label, { color: theme.mutedForeground }]}>
          {TYPE_LABELS[type] || 'Processing...'}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 280,
  },
  iconContainer: {
    position: 'relative',
  },
  iconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPulse: {
    position: 'absolute',
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: 14,
    borderWidth: 1,
  },
  textContainer: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
})
