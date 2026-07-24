/**
 * AI State Constants
 * Configuration and styling constants for AI state indicators
 */

import type { AIStateConfig } from './types'

export const STATE_CONFIGS: Record<string, AIStateConfig> = {
  thinking: {
    label: 'Thinking',
    icon: 'Brain',
    color: 'text-muted-foreground',
    gradient: 'from-muted/30 via-muted/20 to-muted/30',
    borderColor: 'border-muted/30',
    animation: 'pulse',
  },
  browsing: {
    label: 'Browsing',
    icon: 'Globe',
    color: 'text-primary',
    gradient: 'from-primary/15 via-primary/10 to-primary/15',
    borderColor: 'border-primary/30',
    animation: 'shimmer',
  },
  searching: {
    label: 'Searching',
    icon: 'Search',
    color: 'text-primary',
    gradient: 'from-primary/15 via-primary/10 to-primary/15',
    borderColor: 'border-primary/30',
    animation: 'pulse',
  },
  planning: {
    label: 'Planning',
    icon: 'ClipboardList',
    color: 'text-amber-500',
    gradient: 'from-amber-500/20 via-orange-500/20 to-amber-500/20',
    borderColor: 'border-amber-500/30',
    animation: 'wave',
  },
  editing: {
    label: 'Editing',
    icon: 'Pencil',
    color: 'text-emerald-500',
    gradient: 'from-emerald-500/20 via-teal-500/20 to-emerald-500/20',
    borderColor: 'border-emerald-500/30',
    animation: 'shimmer',
  },
  working: {
    label: 'Working',
    icon: 'Settings',
    color: 'text-muted-foreground',
    gradient: 'from-muted/30 via-muted/20 to-muted/30',
    borderColor: 'border-muted/30',
    animation: 'rotate',
  },
  analyzing: {
    label: 'Analyzing',
    icon: 'BarChart3',
    color: 'text-primary',
    gradient: 'from-primary/15 via-primary/10 to-primary/15',
    borderColor: 'border-primary/30',
    animation: 'pulse',
  },
  connecting: {
    label: 'Connecting',
    icon: 'Plug',
    color: 'text-rose-500',
    gradient: 'from-rose-500/20 via-pink-500/20 to-rose-500/20',
    borderColor: 'border-rose-500/30',
    animation: 'bounce',
  },
  idle: {
    label: 'Ready',
    icon: 'Sparkles',
    color: 'text-muted-foreground',
    gradient: 'from-muted/20 to-muted/20',
    borderColor: 'border-muted/30',
    animation: 'pulse',
  },
}

// Animation durations
export const ANIMATION_DURATIONS = {
  pulse: '2s',
  shimmer: '1.5s',
  rotate: '8s',
  bounce: '1s',
  wave: '2s',
}

// Timer display formatting
export function formatElapsedTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Progress bar color based on percentage
export function getProgressColor(percentage: number): string {
  if (percentage < 30) return 'bg-rose-500'
  if (percentage < 60) return 'bg-amber-500'
  if (percentage < 90) return 'bg-primary'
  return 'bg-emerald-500'
}

// Number animation easing
export const NUMBER_ANIMATION_CONFIG = {
  duration: 0.5,
  ease: 'easeOut',
}
