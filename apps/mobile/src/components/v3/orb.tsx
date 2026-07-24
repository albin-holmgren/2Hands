import React, { useEffect, useState } from 'react'
import { AccessibilityInfo, Pressable, View, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import type { OrbState } from '@2hands/types/v3'
import { colors as brand } from '@2hands/tailwind-config'
import { useTheme } from '@/lib/theme-context'

/**
 * The 2Hands intelligent orb — primary voice control and persistent state
 * indicator. 12 frozen states (IMPLEMENTATION_MAP §3.10); restrained,
 * state-tied motion only. Reduced motion → static fallbacks.
 */

export const ORB_SIZES = { hero: 128, compact: 32 } as const

export const ORB_STATE_LABELS: Record<OrbState, string> = {
  idle: 'Idle',
  listening: 'Listening',
  thinking: 'Thinking',
  planning: 'Planning',
  computer_waking: 'Computer waking',
  workspace_preparing: 'Preparing workspace',
  agent_working: 'Agent working',
  running_tests: 'Running tests',
  waiting_approval: 'Needs your approval',
  preview_ready: 'Preview ready',
  speaking: 'Speaking',
  error: 'Something went wrong',
}

const TERRACOTTA = brand.brand.terracotta
const TERRACOTTA_HOVER = brand.brand['terracotta-dark']
const TERRACOTTA_LIGHT = brand.brand['terracotta-light']
const CREAM = brand.brand.beige
const WARM_BLACK = brand.brand.black
const ERROR = brand.functional.error

interface OrbProps {
  state: OrbState
  /** 'hero' = 128, 'compact' = 32, or an explicit pixel size. */
  size?: 'hero' | 'compact' | number
  onPress?: () => void
  style?: ViewStyle
}

export function Orb({ state, size = 'hero', onPress, style }: OrbProps) {
  const { isDark } = useTheme()
  const px = typeof size === 'number' ? size : ORB_SIZES[size]

  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled)
    })
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])

  // Motion primitives — each state drives a small, restrained subset.
  const breathe = useSharedValue(1) // core scale
  const rotateA = useSharedValue(0) // arc A, degrees
  const rotateB = useSharedValue(0) // arc B, degrees
  const arcOpacity = useSharedValue(0) // arc visibility
  const glow = useSharedValue(0.3) // cream reflection brightness
  const halo = useSharedValue(0) // outer halo ring
  const coreOpacity = useSharedValue(1)

  useEffect(() => {
    // Reset everything before applying the new state's motion.
    cancelAnimation(breathe)
    cancelAnimation(rotateA)
    cancelAnimation(rotateB)
    cancelAnimation(arcOpacity)
    cancelAnimation(glow)
    cancelAnimation(halo)
    cancelAnimation(coreOpacity)

    const settle = { duration: 300, easing: Easing.out(Easing.ease) }
    breathe.value = withTiming(1, settle)
    rotateA.value = 0
    rotateB.value = 0
    arcOpacity.value = withTiming(0, settle)
    glow.value = withTiming(0.3, settle)
    halo.value = withTiming(0, settle)
    coreOpacity.value = withTiming(1, settle)

    const spinA = (durationMs: number) => {
      rotateA.value = 0
      rotateA.value = withRepeat(withTiming(360, { duration: durationMs, easing: Easing.linear }), -1, false)
    }
    const spinB = (durationMs: number) => {
      rotateB.value = 0
      rotateB.value = withRepeat(withTiming(-360, { duration: durationMs, easing: Easing.linear }), -1, false)
    }
    const pulseScale = (to: number, durationMs: number) => {
      breathe.value = withRepeat(
        withSequence(
          withTiming(to, { duration: durationMs, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: durationMs, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      )
    }

    switch (state) {
      case 'idle':
        // Slow, barely perceptible breathing.
        if (!reduceMotion) pulseScale(1.015, 2400)
        break
      case 'listening':
        halo.value = withTiming(0.55, settle)
        if (!reduceMotion) pulseScale(1.05, 900)
        break
      case 'thinking':
        // Two arcs orbit in opposite directions.
        arcOpacity.value = withTiming(0.7, settle)
        if (!reduceMotion) {
          spinA(3600)
          spinB(4800)
        } else {
          rotateA.value = 30
          rotateB.value = 210
        }
        break
      case 'planning':
        // Single slow arc — deliberate, quieter than thinking.
        arcOpacity.value = withTiming(0.55, settle)
        if (!reduceMotion) spinA(6000)
        else rotateA.value = 120
        break
      case 'computer_waking':
        // Center brightens.
        if (!reduceMotion) {
          glow.value = withRepeat(
            withSequence(
              withTiming(0.7, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
              withTiming(0.4, { duration: 1200, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            false
          )
        } else {
          glow.value = withTiming(0.6, settle)
        }
        break
      case 'workspace_preparing':
        glow.value = withTiming(0.55, settle)
        arcOpacity.value = withTiming(0.45, settle)
        if (!reduceMotion) spinA(8000)
        else rotateA.value = 200
        break
      case 'agent_working':
        // Supervisor/worker arcs at different measured speeds.
        arcOpacity.value = withTiming(0.7, settle)
        if (!reduceMotion) {
          spinA(2800)
          spinB(4400)
        } else {
          rotateA.value = 60
          rotateB.value = 240
        }
        break
      case 'running_tests':
        // Measured tick pulse on the arcs; no rotation.
        rotateA.value = 45
        rotateB.value = 225
        if (!reduceMotion) {
          arcOpacity.value = withRepeat(
            withSequence(
              withTiming(0.8, { duration: 700, easing: Easing.inOut(Easing.ease) }),
              withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.ease) })
            ),
            -1,
            false
          )
        } else {
          arcOpacity.value = withTiming(0.6, settle)
        }
        break
      case 'waiting_approval':
        // Motion pauses; static halo. Already static — reduced-motion safe.
        halo.value = withTiming(0.6, settle)
        break
      case 'preview_ready':
        // One soft settle, then steady glow. Single transition, not a loop.
        glow.value = withTiming(0.6, settle)
        if (!reduceMotion) {
          breathe.value = withSequence(
            withTiming(1.04, { duration: 150, easing: Easing.out(Easing.ease) }),
            withTiming(1, { duration: 300, easing: Easing.inOut(Easing.ease) })
          )
        }
        break
      case 'speaking':
        if (!reduceMotion) pulseScale(1.03, 800)
        else glow.value = withTiming(0.5, settle)
        break
      case 'error':
        // Motion stops entirely; core dims.
        coreOpacity.value = withTiming(0.85, settle)
        break
    }
  }, [state, reduceMotion, breathe, rotateA, rotateB, arcOpacity, glow, halo, coreOpacity])

  const coreAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathe.value }],
    opacity: coreOpacity.value,
  }))
  const arcAStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotateA.value}deg` }],
    opacity: arcOpacity.value,
  }))
  const arcBStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotateB.value}deg` }],
    opacity: arcOpacity.value,
  }))
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
  }))
  const haloStyle = useAnimatedStyle(() => ({
    opacity: halo.value,
  }))

  const haloSize = px * 1.25
  const arcInset = px * 0.09
  const arcSize = px - arcInset * 2
  const arcWidth = Math.max(1.5, px * 0.028)
  const highlightSize = px * 0.42

  const isError = state === 'error'

  const orb = (
    <View
      style={[{ width: px, height: px, alignItems: 'center', justifyContent: 'center' }, style]}
      accessible
      accessibilityLabel={`2Hands: ${ORB_STATE_LABELS[state]}`}
    >
      {/* Halo — listening / waiting_approval */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: haloSize,
            height: haloSize,
            borderRadius: haloSize / 2,
            borderWidth: Math.max(1, px * 0.015),
            borderColor: TERRACOTTA + '66',
          },
          haloStyle,
        ]}
      />

      {/* Core — terracotta with warm-black and cream reflection */}
      <Animated.View
        style={[
          {
            width: px,
            height: px,
            borderRadius: px / 2,
            overflow: 'hidden',
            borderWidth: isError ? Math.max(1, px * 0.02) : 0,
            borderColor: isError ? ERROR + '99' : 'transparent',
          },
          coreAnimatedStyle,
        ]}
      >
        <LinearGradient
          colors={[TERRACOTTA_LIGHT, TERRACOTTA, TERRACOTTA_HOVER]}
          start={{ x: 0.2, y: 0.1 }}
          end={{ x: 0.8, y: 0.95 }}
          style={{ width: '100%', height: '100%' }}
        />
        {/* Cream reflection, upper left */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: px * 0.12,
              left: px * 0.14,
              width: highlightSize,
              height: highlightSize,
              borderRadius: highlightSize / 2,
              backgroundColor: CREAM,
            },
            glowStyle,
          ]}
        />
        {/* Warm-black grounding shade, lower edge */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: -px * 0.28,
            left: px * 0.1,
            width: px * 0.8,
            height: px * 0.55,
            borderRadius: px * 0.4,
            backgroundColor: WARM_BLACK,
            opacity: isDark ? 0.25 : 0.15,
          }}
        />
      </Animated.View>

      {/* Two arcs — the two hands */}
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', width: arcSize, height: arcSize }, arcAStyle]}
      >
        <View
          style={{
            width: arcSize,
            height: arcSize,
            borderRadius: arcSize / 2,
            borderWidth: arcWidth,
            borderColor: 'transparent',
            borderTopColor: CREAM + 'CC',
          }}
        />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', width: arcSize, height: arcSize }, arcBStyle]}
      >
        <View
          style={{
            width: arcSize,
            height: arcSize,
            borderRadius: arcSize / 2,
            borderWidth: arcWidth,
            borderColor: 'transparent',
            borderBottomColor: CREAM + '99',
          }}
        />
      </Animated.View>
    </View>
  )

  if (!onPress) return orb

  // Keep touch target >= 44 even for the compact orb.
  const slop = Math.max(0, Math.ceil((44 - px) / 2))
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: slop, bottom: slop, left: slop, right: slop }}
      accessibilityRole="button"
      accessibilityLabel={`2Hands: ${ORB_STATE_LABELS[state]}`}
    >
      {orb}
    </Pressable>
  )
}
