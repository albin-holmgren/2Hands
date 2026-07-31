import React from 'react'
import { Platform, StyleSheet, View, ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import { useTheme } from '@/lib/theme-context'

/**
 * Liquid Glass surfaces.
 *
 * On iOS 26 this is Apple's own material via expo-glass-effect, which wraps
 * UIGlassEffect — the real thing, with the system's refraction, specular edge
 * and content-adaptive tinting, and it stays correct as the OS refines it.
 * Hand-rolled approximations always drift from the platform; this cannot.
 *
 * Older iOS has no such material, so it falls back to a blur plus the details
 * that make a pane read as glass: a thin tint, a bright hairline along the top
 * edge with a dim one beneath, and a diagonal sheen. Android falls back to a
 * solid surface — its blur is expensive and inconsistent, and a clean opaque
 * panel beats a smeared approximation.
 */

export type GlassElevation = 'bar' | 'card' | 'sheet'

/** Fallback blur only. Higher surfaces let less of the background through. */
const BLUR_INTENSITY: Record<GlassElevation, number> = {
  bar: 40,
  card: 55,
  sheet: 75,
}

/**
 * `clear` is nearly transparent and lets busy content behind it wreck
 * legibility; `regular` is the system default and what Apple uses for bars and
 * sheets. Sheets cover the most content, so they get the most substantial
 * treatment.
 */
const GLASS_STYLE: Record<GlassElevation, 'clear' | 'regular'> = {
  bar: 'regular',
  card: 'clear',
  sheet: 'regular',
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

  const frame: ViewStyle = {
    borderRadius: radius,
    overflow: 'hidden',
  }

  // ---- iOS 26+: the system material -------------------------------------
  if (isLiquidGlassAvailable()) {
    return (
      <GlassView
        glassEffectStyle={GLASS_STYLE[elevation]}
        // Let the system decide contrast from what is behind the surface;
        // forcing a scheme is what makes glass look pasted on.
        colorScheme="auto"
        style={[frame, style]}
      >
        {children}
      </GlassView>
    )
  }

  // ---- Older iOS: approximate the material -------------------------------
  const tint = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.55)'
  const specularTop = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)'
  const specularBottom = isDark ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.06)'
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)'

  if (Platform.OS !== 'ios') {
    return (
      <View
        style={[
          frame,
          { borderWidth: StyleSheet.hairlineWidth, borderColor: hairline },
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
      style={[frame, { borderWidth: StyleSheet.hairlineWidth, borderColor: hairline }, style]}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} pointerEvents="none" />
      <LinearGradient
        pointerEvents="none"
        colors={[isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.65)', 'transparent']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 0.55 }}
        style={StyleSheet.absoluteFill}
      />
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
    </BlurView>
  )
}

/**
 * Radius for glass nested inside glass.
 *
 * Concentric rounding: an inner corner shares its centre with the outer one,
 * so its radius is the outer radius minus the gap. Reusing the parent's radius
 * on a child is the most common tell of a fake-looking glass stack — the
 * corners visibly disagree.
 */
export function concentricRadius(outerRadius: number, inset: number): number {
  return Math.max(4, outerRadius - inset)
}
