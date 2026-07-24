'use client'

import type { OrbState } from '@2hands/types/v3'
import { Orb } from './orb/orb'
import { cn } from '@/lib/utils'

/**
 * Empty conversation state (UX.md §3): the hero orb sits slightly above the
 * vertical midpoint, followed by a Newsreader display prompt and a short
 * DM Sans subline, inside the 800px conversation column.
 */

interface EmptyStateProps {
  orbState?: OrbState
  title?: string
  subtitle?: string
  className?: string
}

export function EmptyState({
  orbState = 'idle',
  title = 'What should we get done?',
  subtitle = 'Speak or type. I handle the steps and check with you before anything external happens.',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex w-full flex-1 flex-col items-center justify-center px-4',
        className
      )}
    >
      <div className="flex w-full max-w-[800px] -translate-y-[6vh] flex-col items-center text-center">
        <Orb state={orbState} size="hero" />
        <h1 className="font-display mt-8 text-[32px] leading-[37px] font-medium text-foreground md:text-[40px] md:leading-[44px]">
          {title}
        </h1>
        <p className="mt-3 max-w-[480px] text-base leading-6 text-muted-foreground">
          {subtitle}
        </p>
      </div>
    </div>
  )
}

export type { EmptyStateProps }
