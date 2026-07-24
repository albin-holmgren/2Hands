// 2Hands Tailwind Config
// Shared types for 2Hands monorepo web and mobile

export { colors } from './colors'
export { radius, durationMs, spacePx, font, layout, shadows } from './tokens'
export type { Radius, DurationMs, SpacePx, Font, Layout, Shadows } from './tokens'

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
} as const

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  '3xl': 32,
  full: 9999,
} as const

export const fontFamily = {
  sans: ['DM Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
} as const

export const fontSize = {
  xs: 11,
  sm: 13,
  base: 14,
  lg: 16,
  xl: 18,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
} as const

export const fontWeight = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const

export const shadow = {
  sm: '0 1px 2px rgba(52, 50, 45, 0.05)',
  md: '0 4px 6px rgba(52, 50, 45, 0.07)',
  lg: '0 10px 15px rgba(52, 50, 45, 0.1)',
  xl: '0 20px 25px rgba(52, 50, 45, 0.15)',
} as const

// Animation durations (ms)
export const duration = {
  fast: 150,
  normal: 200,
  slow: 300,
} as const

// Z-index layers
export const zIndex = {
  base: 0,
  dropdown: 50,
  modal: 100,
  toast: 150,
  tooltip: 200,
} as const
