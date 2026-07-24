'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, ArrowUp } from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import type { OrbState } from '@2hands/types/v3'
import { cn } from '@/lib/utils'

/**
 * Bottom voice-first glass composer (UX.md §2/§4, BRAND_GUIDELINES §11/§13).
 *
 * - 24px sheet radius, one-pixel glass border, backdrop blur with an opaque
 *   fallback when `backdrop-filter` is unsupported (and for reduced
 *   transparency the surface stays mostly opaque).
 * - The microphone is the strongest control (44px, terracotta while
 *   listening). Send appears only when text is present.
 * - Enter sends; Shift+Enter inserts a newline. Input font is 16px so mobile
 *   browsers never zoom.
 */

const MAX_TEXTAREA_HEIGHT_PX = 160

interface ComposerProps {
  onSend: (text: string) => void
  onMicPress: () => void
  orbState: OrbState
  disabled?: boolean
  placeholder?: string
  className?: string
}

export function Composer({
  onSend,
  onMicPress,
  orbState,
  disabled = false,
  placeholder = 'What should we get done?',
  className,
}: ComposerProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const prefersReducedMotion = useReducedMotion()
  const reduced = prefersReducedMotion === true

  const isListening = orbState === 'listening'
  const hasText = text.trim().length > 0

  const autogrow = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`
  }, [])

  useEffect(() => {
    autogrow()
  }, [text, autogrow])

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.focus()
    }
  }, [text, disabled, onSend])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  return (
    <div className={cn('mx-auto w-full max-w-[800px]', className)}>
      <div
        className={cn(
          'flex items-end gap-2 rounded-3xl border border-border p-2',
          'shadow-[0_8px_40px_-8px_rgba(0,0,0,0.12),0_2px_8px_-2px_rgba(0,0,0,0.06)]',
          // Opaque fallback first; translucent glass only where supported
          'bg-background supports-[backdrop-filter]:bg-background/75 supports-[backdrop-filter]:backdrop-blur-xl',
          disabled && 'opacity-70'
        )}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          aria-label="Message 2Hands"
          className={cn(
            'min-h-11 flex-1 resize-none self-center bg-transparent px-3 py-2.5',
            'text-base leading-6 text-foreground placeholder:text-muted-foreground',
            'outline-none disabled:cursor-not-allowed',
            'max-h-40 overflow-y-auto'
          )}
        />

        {/* Send — appears only when text is present */}
        <AnimatePresence initial={false}>
          {hasText && (
            <motion.button
              key="send"
              type="button"
              onClick={handleSend}
              disabled={disabled}
              aria-label="Send message"
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-full',
                'bg-[#34322D] text-white dark:bg-[#F5F3F0] dark:text-[#1A1918]',
                'transition-opacity duration-150 hover:opacity-85',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                'disabled:pointer-events-none disabled:opacity-50'
              )}
            >
              <ArrowUp className="size-5" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Microphone — the primary control */}
        <button
          type="button"
          onClick={onMicPress}
          disabled={disabled}
          aria-label={isListening ? 'Stop listening' : 'Start voice input'}
          aria-pressed={isListening}
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-full',
            'transition-colors duration-150',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:pointer-events-none disabled:opacity-50',
            isListening
              ? 'bg-[#D97757] text-white hover:bg-[#C86647]'
              : 'bg-[#34322D] text-white hover:opacity-85 dark:bg-[#F5F3F0] dark:text-[#1A1918]'
          )}
        >
          <Mic className="size-5" />
        </button>
      </div>
    </div>
  )
}

export type { ComposerProps }
