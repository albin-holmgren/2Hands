import React from 'react'
import { Platform, StyleSheet, View, ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '@/lib/theme-context'

/**
 * Liquid Glass surfaces.
 *
 * iOS 26's material is a real-time refracting layer with a specular edge, and
 * SwiftUI's `glassEffect` is not reachable from React Native. This is a
 * considered approximation of the parts that actually carry the effect, rather
 * than a blur slapped behind a panel:
 *
 *   1. blur      — content behind stays legible as shape and colour
 *   2. tint      — a thin wash so text has something to sit on
 *   3. specular  — a bright hairline along the top edge and a dim one along
 *                  the bottom, which is what reads as "a pane of something"
 *                  rather than "a translucent rectangle"
 *   4. sheen     — a soft diagonal gradient across the top third
 *
 * Elevation picks the blur intensity. Higher surfaces blur harder, so depth
 * comes from how much of the background survives rather than from drop
 * shadows, which is the part most imitations get wrong.
 *
 * Android has no equivalent compositor effect; BlurView there is expensive and
 * inconsistent, so it falls back to a solid surface at the same tone. Better a
 * clean opaque panel than a smeared approximation.
 */

export type GlassElevation = 'bar' | 'card' | 'sheet'

const BLUR_INTENSITY: Record<GlassElevation, number> = {
  bar: 40,
  card: 55,
  sheet: 75,
}

interface GlassProps {
  children: React.ReactNode
  elevation?: GlassElevation
  /** Corner radius. Nested glass should step down by its inset to stay concentric. */
  radius?: number
  style?: ViewStyle
}

export function Glass({ children, elevation = 'card', radius = 24, style }: GlassProps) {
  const { isDark } = useTheme()

  // Tint sits under the content and over the blur. Dark mode needs a lighter
  // hand: too much and the blur reads as flat charcoal.
  const tint = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.55)'
  const specularTop = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)'
  const specularBottom = isDark ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.06)'
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)'

  const content = (
    <>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} pointerEvents="none" />

      {/* Sheen across the top third — the light the pane is catching. */}
      <LinearGradient
        pointerEvents="none"
        colors={[
          isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.65)',
          'transparent',
        ]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 0.55 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Specular edges: bright on top, shadowed underneath. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: radius * 0.35,
          right: radius * 0.35,
          height: StyleSheet.hairlineWidth * 2,
          backgroundColor: specularTop,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: 0,
          left: radius * 0.5,
          right: radius * 0.5,
          height: StyleSheet.hairlineWidth * 2,
          backgroundColor: specularBottom,
        }}
      />

      {children}
    </>
  )

  const frame: ViewStyle = {
    borderRadius: radius,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: hairline,
  }

  if (Platform.OS !== 'ios') {
    return (
      <View
        style={[
          frame,
          { backgroundColor: isDark ? 'rgba(32,31,28,0.96)' : 'rgba(250,249,247,0.97)' },
          style,
        ]}
      >
        {children}
      </View>
    )
  }

  return (
    <BlurView
      intensity={BLUR_INTENSITY[elevation]}
      tint={isDark ? 'dark' : 'light'}
      style={[frame, style]}
    >
      {content}
    </BlurView>
  )
}

/**
 * Radius for glass nested inside glass.
 *
 * Concentric rounding: an inner corner shares its centre with the outer one,
 * so its radius is the outer radius minus the gap. Reusing the parent's radius
 * on a child is the single most common tell of a fake-looking glass stack —
 * the corners visibly disagree.
 */
export function concentricRadius(outerRadius: number, inset: number): number {
  return Math.max(4, outerRadius - inset)
}
