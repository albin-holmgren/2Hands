import React, { useEffect, useState } from 'react'
import { AccessibilityInfo, Pressable, View, ViewStyle } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import type { OrbState } from '@2hands/types/v3'
import { colors as brand } from '@2hands/tailwind-config'
import { useTheme } from '@/lib/theme-context'

/**
 * The 2Hands mark, alive.
 *
 * This used to be a terracotta sphere with a cream specular highlight — a
 * generic glossy orb that belonged to no particular product. The brand mark is
 * six rounded bars in two groups of three, which already reads as a waveform,
 * so it makes a far better voice-and-state indicator than a globe: the same
 * shape that identifies the product also shows what it is doing.
 *
 * Each state drives the bars differently rather than tinting one blob:
 *   idle              slow shared breath
 *   listening         live waveform, bars moving independently
 *   thinking/planning a travelling wave, left to right
 *   speaking          faster, shallower waveform
 *   waiting_approval  synchronised pulse — deliberately harder to ignore
 *   error             still, tinted, no motion
 *
 * Reduced motion collapses every state to the static mark. The bars never
 * disappear, so the logo is always legible.
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
const ERROR = brand.functional.error

/**
 * Bar geometry, in the mark's own units (brand_guidelines/logos/icon-*.svg):
 * six bars spanning x 15..89, y 15..55. `tall` bars are the raised inner pair
 * of each hand. Kept as ratios so the mark scales exactly at any size.
 */
const MARK_W = 74
const MARK_H = 40
const BARS = [
  { x: 0, tall: false },
  { x: 12, tall: true },
  { x: 24, tall: false },
  { x: 42, tall: false },
  { x: 54, tall: true },
  { x: 66, tall: false },
] as const
const BAR_W = 8

interface OrbProps {
  state: OrbState
  /** 'hero' = 128, 'compact' = 32, or an explicit pixel size. */
  size?: 'hero' | 'compact' | number
  onPress?: () => void
  style?: ViewStyle
}

/** Per-state motion for one bar. Index gives each bar its own phase. */
function useBarMotion(state: OrbState, index: number, reduceMotion: boolean) {
  const scale = useSharedValue(1)

  useEffect(() => {
    cancelAnimation(scale)

    if (reduceMotion) {
      scale.value = 1
      return
    }

    // Offsets are irregular on purpose: evenly spaced bars read as a machine,
    // slightly uneven ones read as something alive.
    const phase = [0, 90, 180, 60, 150, 30][index] ?? 0
    const ease = Easing.inOut(Easing.quad)

    switch (state) {
      case 'listening':
        scale.value = withDelay(
          phase,
          withRepeat(
            withSequence(
              withTiming(1 + 0.55 * (index % 2 ? 0.7 : 1), { duration: 320, easing: ease }),
              withTiming(0.72, { duration: 380, easing: ease }),
            ),
            -1,
            true,
          ),
        )
        break

      case 'speaking':
        scale.value = withDelay(
          phase / 2,
          withRepeat(
            withSequence(
              withTiming(1.32, { duration: 200, easing: ease }),
              withTiming(0.85, { duration: 240, easing: ease }),
            ),
            -1,
            true,
          ),
        )
        break

      case 'thinking':
      case 'planning':
      case 'agent_working':
      case 'running_tests':
      case 'computer_waking':
      case 'workspace_preparing':
        // Travelling wave: the delay is what makes it move across the mark.
        scale.value = withDelay(
          index * 110,
          withRepeat(
            withSequence(
              withTiming(1.28, { duration: 420, easing: ease }),
              withTiming(0.88, { duration: 520, easing: ease }),
            ),
            -1,
            true,
          ),
        )
        break

      case 'waiting_approval':
        // Every bar together — a heartbeat rather than a texture.
        scale.value = withRepeat(
          withSequence(
            withTiming(1.18, { duration: 460, easing: ease }),
            withTiming(0.94, { duration: 460, easing: ease }),
          ),
          -1,
          true,
        )
        break

      case 'error':
        scale.value = withTiming(1, { duration: 200 })
        break

      default:
        // idle / preview_ready — a slow shared breath.
        scale.value = withDelay(
          phase * 2,
          withRepeat(
            withSequence(
              withTiming(1.06, { duration: 1600, easing: ease }),
              withTiming(0.97, { duration: 1600, easing: ease }),
            ),
            -1,
            true,
          ),
        )
    }

    return () => cancelAnimation(scale)
  }, [state, index, reduceMotion, scale])

  return useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }))
}

function Bar({
  index,
  state,
  reduceMotion,
  unit,
  color,
}: {
  index: number
  state: OrbState
  reduceMotion: boolean
  unit: number
  color: string
}) {
  const bar = BARS[index]
  const animatedStyle = useBarMotion(state, index, reduceMotion)
  const height = (bar.tall ? 35 : 35) * unit
  const width = BAR_W * unit

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: bar.x * unit,
          // The raised pair sits 5 units higher, exactly as in the mark.
          top: (bar.tall ? 0 : 5) * unit,
          width,
          height,
          borderRadius: width / 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  )
}

export function Orb({ state, size = 'hero', onPress, style }: OrbProps) {
  const { isDark } = useTheme()
  const px = typeof size === 'number' ? size : ORB_SIZES[size]

  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    let active = true
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled)
    })
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotion(enabled)
    })
    return () => {
      active = false
      sub?.remove?.()
    }
  }, [])

  // Fit the mark inside the given box with a little breathing room, and keep
  // its aspect ratio — the bars must not stretch.
  const unit = (px * 0.92) / MARK_W
  const markW = MARK_W * unit
  const markH = MARK_H * unit

  const isError = state === 'error'
  const color = isError ? ERROR : TERRACOTTA

  // A soft glow behind the mark carries state colour without a plate around it.
  const glow = useSharedValue(0)
  useEffect(() => {
    cancelAnimation(glow)
    const wants = state === 'listening' || state === 'waiting_approval' || state === 'speaking'
    if (reduceMotion || !wants) {
      glow.value = withTiming(wants ? 0.22 : 0, { duration: 240 })
      return
    }
    glow.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    )
    return () => cancelAnimation(glow)
  }, [state, reduceMotion, glow])

  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }))
  const glowSize = px * 1.15

  const orb = (
    <View
      style={[{ width: px, height: px, alignItems: 'center', justifyContent: 'center' }, style]}
      accessible
      accessibilityLabel={`2Hands: ${ORB_STATE_LABELS[state]}`}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: glowSize,
            height: glowSize,
            borderRadius: glowSize / 2,
            backgroundColor: color,
            // Dark backgrounds swallow a soft glow, so give it a little more.
            opacity: isDark ? 0.3 : 0.2,
          },
          glowStyle,
        ]}
      />

      <View style={{ width: markW, height: markH }}>
        {BARS.map((_, index) => (
          <Bar
            key={index}
            index={index}
            state={state}
            reduceMotion={reduceMotion}
            unit={unit}
            color={color}
          />
        ))}
      </View>
    </View>
  )

  if (!onPress) return orb

  // Keep touch target >= 44 even for the compact mark.
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
