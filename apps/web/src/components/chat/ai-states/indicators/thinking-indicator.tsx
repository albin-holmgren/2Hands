'use client'

/**
 * Thinking Indicator Component - Using ai-elements Reasoning
 * Professional, clean design matching Sana Labs style
 */

import { useEffect, useState } from 'react'
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from '@/components/ai-elements/reasoning'

interface ThinkingIndicatorProps {
  thoughts?: string
  startTime?: number
}

export function ThinkingIndicator({ 
  thoughts = '',
  startTime = Date.now() 
}: ThinkingIndicatorProps) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startTime])

  return (
    <Reasoning isStreaming={!thoughts} duration={thoughts ? elapsed : undefined} defaultOpen={true}>
      <ReasoningTrigger />
      {thoughts && <ReasoningContent>{thoughts}</ReasoningContent>}
    </Reasoning>
  )
}
