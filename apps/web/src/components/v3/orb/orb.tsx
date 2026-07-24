'use client'

import { useMemo } from 'react'
import { motion, useReducedMotion, type Transition } from 'framer-motion'
import { cva, type VariantProps } from 'class-variance-authority'
import type { OrbState } from '@2hands/types/v3'
import { cn } from '@/lib/utils'

/**
 * The intelligent 2Hands orb — primary voice control and persistent state
 * indicator (BRAND_GUIDELINES §12, IMPLEMENTATION_MAP §3.10).
 *
 * Terracotta #D97757 core, #E88768 highlights (prominent on dark),
 * #C86647 depth (prominent on light). No continuous distracting animation:
 * every motion is tied to a real state, and every animated layer falls back
 * to a static equivalent when the user prefers reduced motion.
 */

const orbVariants = cva('relative shrink-0 rounded-full select-none', {
  variants: {
    size: {
      /** 128px — empty state hero */
      hero: 'size-32',
      /** 32px — header while a conversation is active */
      compact: 'size-8',
    },
  },
  defaultVariants: {
    size: 'hero',
  },
})

/** Semantic labels — orb state is never conveyed by color/motion alone. */
const ORB_STATE_LABELS: Record<OrbState, string> = {
  idle: 'Ready',
  listening: 'Listening',
  thinking: 'Thinking',
  planning: 'Planning',
  computer_waking: 'Waking your computer',
  workspace_preparing: 'Preparing your workspace',
  agent_working: 'Working',
  running_tests: 'Running tests',
  waiting_approval: 'Waiting for your approval',
  preview_ready: 'Preview ready',
  speaking: 'Speaking',
  error: 'Something went wrong',
}

const CORE_GRADIENT = cn(
  // Light: #D97757 core reading toward #C86647 depth, restrained #E88768 highlight
  'bg-[radial-gradient(circle_at_32%_28%,#E88768_0%,#D97757_46%,#C86647_100%)]',
  // Dark: #E88768 highlight carries more of the sphere
  'dark:bg-[radial-gradient(circle_at_32%_28%,#E88768_0%,#E88768_24%,#D97757_62%,#C86647_100%)]'
)

interface OrbProps extends VariantProps<typeof orbVariants> {
  state: OrbState
  className?: string
}

export function Orb({ state, size, className }: OrbProps) {
  const prefersReducedMotion = useReducedMotion()
  const reduced = prefersReducedMotion === true

  const showListeningRing = state === 'listening'
  const showInnerRotation = state === 'thinking' || state === 'planning'
  const showSoftPulse = state === 'computer_waking' || state === 'workspace_preparing'
  const showShimmer = state === 'agent_working' || state === 'running_tests'
  const showHalo = state === 'waiting_approval'
  const showBadge = state === 'preview_ready'
  const showAmplitudeRings = state === 'speaking'
  const isError = state === 'error'

  // Container: very slow breathing at idle (motion allowed only),
  // a slight held scale while waiting for approval, otherwise settled.
  const containerAnimate = useMemo(() => {
    if (state === 'waiting_approval') return { scale: 1.04 }
    if (state === 'idle' && !reduced) return { scale: [1, 1.015, 1] }
    return { scale: 1 }
  }, [state, reduced])

  const containerTransition: Transition =
    state === 'idle' && !reduced
      ? { duration: 6, repeat: Infinity, ease: 'easeInOut' }
      : { duration: 0.3, ease: 'easeOut' }

  return (
    <motion.div
      role="img"
      aria-label={ORB_STATE_LABELS[state]}
      data-orb-state={state}
      animate={containerAnimate}
      transition={containerTransition}
      className={cn(orbVariants({ size }), className)}
    >
      {/* Core sphere */}
      <div
        aria-hidden="true"
        className={cn(
          'absolute inset-0 rounded-full shadow-[0_4px_6px_rgba(52,50,45,0.07)] transition-[filter] duration-300',
          CORE_GRADIENT,
          isError && 'saturate-[0.2]'
        )}
      />

      {/* Cream reflection — static, part of the brand form */}
      <div
        aria-hidden="true"
        className="absolute top-[13%] left-[17%] h-[20%] w-[30%] -rotate-[18deg] rounded-full bg-[#F5F3F0]/60 blur-[4px] dark:bg-[#F5F3F0]/45"
      />

      {/* Listening — gentle reactive ring */}
      {showListeningRing &&
        (reduced ? (
          <div
            aria-hidden="true"
            className="absolute -inset-[9%] rounded-full border-2 border-[#D97757]/50"
          />
        ) : (
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.55, 0.25, 0.55], scale: [1, 1.06, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -inset-[9%] rounded-full border-2 border-[#D97757]"
          />
        ))}

      {/* Thinking / planning — subtle inner rotation */}
      {showInnerRotation && (
        <>
          {reduced ? (
            <div
              aria-hidden="true"
              className="absolute inset-[14%] rotate-45 rounded-full border-2 border-transparent border-t-[#F5F3F0]/60"
            />
          ) : (
            <motion.div
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, rotate: 360 }}
              transition={{
                opacity: { duration: 0.3, ease: 'easeOut' },
                rotate: { duration: 3.2, repeat: Infinity, ease: 'linear' },
              }}
              className="absolute inset-[14%] rounded-full border-2 border-transparent border-t-[#F5F3F0]/60"
            />
          )}
          {/* Planning adds a second, counter-rotating arc */}
          {state === 'planning' &&
            (reduced ? (
              <div
                aria-hidden="true"
                className="absolute inset-[28%] -rotate-45 rounded-full border-2 border-transparent border-b-[#F5F3F0]/40"
              />
            ) : (
              <motion.div
                aria-hidden="true"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, rotate: -360 }}
                transition={{
                  opacity: { duration: 0.3, ease: 'easeOut' },
                  rotate: { duration: 4.2, repeat: Infinity, ease: 'linear' },
                }}
                className="absolute inset-[28%] rounded-full border-2 border-transparent border-b-[#F5F3F0]/40"
              />
            ))}
        </>
      )}

      {/* Computer waking / workspace preparing — soft pulse (center brightens) */}
      {showSoftPulse &&
        (reduced ? (
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_45%,#F5F3F0_0%,transparent_65%)] opacity-20"
          />
        ) : (
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.08, 0.28, 0.08] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_45%,#F5F3F0_0%,transparent_65%)]"
          />
        ))}

      {/* Agent working / running tests — restrained activity shimmer */}
      {showShimmer &&
        (reduced ? (
          <div
            aria-hidden="true"
            className="absolute inset-0 overflow-hidden rounded-full opacity-20"
          >
            <div className="absolute inset-0 bg-[conic-gradient(from_0deg,transparent_0deg,#F5F3F0_40deg,transparent_80deg)]" />
          </div>
        ) : (
          <div aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-full">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.22, rotate: 360 }}
              transition={{
                opacity: { duration: 0.3, ease: 'easeOut' },
                rotate: {
                  duration: state === 'running_tests' ? 3.6 : 5.2,
                  repeat: Infinity,
                  ease: 'linear',
                },
              }}
              className="absolute inset-0 bg-[conic-gradient(from_0deg,transparent_0deg,#F5F3F0_40deg,transparent_80deg)]"
            />
          </div>
        ))}

      {/* Waiting for approval — static attention halo (no loop) */}
      {showHalo && (
        <motion.div
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="absolute -inset-[12%] rounded-full bg-[#D97757]/15 blur-[6px]"
        />
      )}

      {/* Preview ready — settled core with a small badge dot */}
      {showBadge && (
        <motion.div
          aria-hidden="true"
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="absolute top-[2%] right-[2%] size-[16%] min-h-2 min-w-2 rounded-full bg-[#10B981] ring-2 ring-white dark:ring-[#1A1918]"
        />
      )}

      {/* Speaking — soft amplitude rings */}
      {showAmplitudeRings &&
        (reduced ? (
          <>
            <div
              aria-hidden="true"
              className="absolute -inset-[8%] rounded-full border border-[#D97757]/40"
            />
            <div
              aria-hidden="true"
              className="absolute -inset-[18%] rounded-full border border-[#D97757]/20"
            />
          </>
        ) : (
          <>
            <motion.div
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.4, 0.15, 0.4], scale: [1, 1.05, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -inset-[8%] rounded-full border border-[#D97757]"
            />
            <motion.div
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.25, 0.08, 0.25], scale: [1, 1.07, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
              className="absolute -inset-[18%] rounded-full border border-[#D97757]"
            />
          </>
        ))}

      {/* Error — motion stops, desaturated core, warm-black ring */}
      {isError && (
        <div
          aria-hidden="true"
          className="absolute -inset-[6%] rounded-full border-2 border-[#34322D] dark:border-[#4A4843]"
        />
      )}
    </motion.div>
  )
}

export { orbVariants, ORB_STATE_LABELS }
export type { OrbProps }
