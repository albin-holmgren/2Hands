'use client'

/**
 * v3 conversation bubbles (UX.md §4, BRAND_GUIDELINES §13).
 *
 * User messages: right-aligned warm-secondary bubble, 16px card radius.
 * Assistant messages: left-aligned plain text — the assistant owns the page,
 * so it never wraps itself in a bubble. Both live inside the 800px column.
 */

import { cn } from '@/lib/utils'

interface ShellMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface MessageBubbleProps {
  message: ShellMessage
  className?: string
}

export function MessageBubble({ message, className }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div
      data-slot="v3-message"
      data-role={message.role}
      className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start', className)}
    >
      {isUser ? (
        <div className="max-w-[85%] rounded-2xl bg-secondary px-4 py-2.5 text-base leading-6 whitespace-pre-wrap text-foreground md:max-w-[70%]">
          {message.content}
        </div>
      ) : (
        <div className="max-w-full text-base leading-7 whitespace-pre-wrap text-foreground">
          {message.content}
        </div>
      )}
    </div>
  )
}

export type { MessageBubbleProps, ShellMessage }
