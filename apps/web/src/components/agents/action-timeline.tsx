'use client'

import { useState, useEffect, useRef } from 'react'
import { 
  Activity, CheckCircle2, XCircle, Clock, Eye, MousePointer, 
  Globe, Key, AlertTriangle, Lightbulb, RotateCcw, ChevronDown, 
  ChevronUp, Play, Pause, Bot
} from 'lucide-react'

// ============================================================
// Types
// ============================================================

export interface RunEvent {
  timestamp: string
  run_id: string | null
  kind: 'lifecycle' | 'assistant' | 'tool'
  name: string
  event: string
  message?: string
  task?: string
  data?: Record<string, unknown>
}

interface TimelineProps {
  events: RunEvent[]
  isLive?: boolean
  agentName?: string
  className?: string
}

// ============================================================
// Action Timeline Component
// ============================================================

export function ActionTimeline({ events, isLive = false, agentName = 'Agent', className = '' }: TimelineProps) {
  const [expanded, setExpanded] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when live
  useEffect(() => {
    if (isLive && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [events.length, isLive])

  if (events.length === 0) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <Bot className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No activity yet</p>
      </div>
    )
  }

  const displayEvents = showAll ? events : events.slice(-20)

  return (
    <div className={`bg-card rounded-xl border border-border overflow-hidden ${className}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            Activity Timeline
          </span>
          {isLive && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-[10px] font-medium text-primary">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          )}
          <span className="text-xs text-muted-foreground">({events.length} events)</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="max-h-[400px] overflow-y-auto">
          {!showAll && events.length > 20 && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-2 text-xs text-muted-foreground hover:text-foreground bg-muted/50 transition-colors"
            >
              Show {events.length - 20} earlier events
            </button>
          )}

          <div className="px-4 py-2 space-y-0.5">
            {displayEvents.map((event, i) => (
              <TimelineEvent
                key={`${event.timestamp}-${i}`}
                event={event}
                isLatest={i === displayEvents.length - 1 && isLive}
                agentName={agentName}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Single Timeline Event
// ============================================================

function TimelineEvent({ event, isLatest, agentName }: { event: RunEvent; isLatest: boolean; agentName: string }) {
  const { icon, color, label, detail } = getEventDisplay(event, agentName)
  const time = formatEventTime(event.timestamp)

  return (
    <div className={`flex items-start gap-2.5 py-1.5 group ${isLatest ? 'bg-muted/30 -mx-2 px-2 rounded-lg' : ''}`}>
      {/* Icon */}
      <div className={`flex-shrink-0 mt-0.5 ${color}`}>
        {icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-foreground">
            {label}
          </span>
          <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            {time}
          </span>
        </div>
        {detail && (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{detail}</p>
        )}
      </div>

      {/* Live indicator */}
      {isLatest && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mt-1.5 flex-shrink-0" />
      )}
    </div>
  )
}

// ============================================================
// Run Replay Controls
// ============================================================

interface ReplayProps {
  events: RunEvent[]
  onSeek?: (index: number) => void
}

export function RunReplayControls({ events, onSeek }: ReplayProps) {
  const [playing, setPlaying] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (playing && currentIndex < events.length - 1) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex(prev => {
          const next = prev + 1
          if (next >= events.length) {
            setPlaying(false)
            return prev
          }
          onSeek?.(next)
          return next
        })
      }, 500)
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [playing, currentIndex, events.length, onSeek])

  if (events.length === 0) return null

  const progress = events.length > 1 ? (currentIndex / (events.length - 1)) * 100 : 0

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-muted rounded-lg">
      <button
        onClick={() => setPlaying(!playing)}
        className="p-1 rounded hover:bg-foreground/10 transition-colors"
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>

      <div className="flex-1 relative h-1.5 bg-muted-foreground/20 rounded-full overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full bg-foreground rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
        <input
          type="range"
          min={0}
          max={events.length - 1}
          value={currentIndex}
          onChange={e => {
            const idx = parseInt(e.target.value)
            setCurrentIndex(idx)
            onSeek?.(idx)
          }}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
      </div>

      <button
        onClick={() => { setCurrentIndex(0); onSeek?.(0) }}
        className="p-1 rounded hover:bg-foreground/10 transition-colors"
      >
        <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
      </button>

      <span className="text-[16px] leading-[1.6] prose prose-sm max-w-none tabular-nums min-w-[40px] text-right">
        {currentIndex + 1}/{events.length}
      </span>
    </div>
  )
}

// ============================================================
// Helpers
// ============================================================

function getEventDisplay(event: RunEvent, agentName: string): {
  icon: React.ReactNode
  color: string
  label: string
  detail: string | null
} {
  const eventName = event.name || event.event

  switch (eventName) {
    case 'run_started':
      return {
        icon: <Play className="w-3.5 h-3.5" />,
        color: 'text-primary',
        label: `${agentName} started`,
        detail: event.task ? `Task: ${String(event.task).slice(0, 100)}` : null,
      }
    case 'run_completed':
    case 'task_complete':
      return {
        icon: <CheckCircle2 className="w-3.5 h-3.5" />,
        color: 'text-emerald-500',
        label: 'Task completed',
        detail: event.message?.slice(0, 120) || null,
      }
    case 'run_failed':
      return {
        icon: <XCircle className="w-3.5 h-3.5" />,
        color: 'text-red-500',
        label: 'Run failed',
        detail: event.message?.slice(0, 120) || null,
      }
    case 'screenshot':
    case 'computer_screenshot':
      return {
        icon: <Eye className="w-3.5 h-3.5" />,
        color: 'text-muted-foreground',
        label: 'Screenshot taken',
        detail: null,
      }
    case 'computer_click':
    case 'click':
      return {
        icon: <MousePointer className="w-3.5 h-3.5" />,
        color: 'text-muted-foreground',
        label: 'Clicked',
        detail: event.data?.target ? String(event.data.target).slice(0, 80) : null,
      }
    case 'computer_type':
    case 'type':
      return {
        icon: <Key className="w-3.5 h-3.5" />,
        color: 'text-muted-foreground',
        label: 'Typed text',
        detail: event.data?.text ? `"${String(event.data.text).slice(0, 50)}"` : null,
      }
    case 'navigate':
    case 'browser_navigate':
      return {
        icon: <Globe className="w-3.5 h-3.5" />,
        color: 'text-primary',
        label: 'Navigated',
        detail: event.data?.url ? String(event.data.url).slice(0, 80) : null,
      }
    case 'report_insight':
      return {
        icon: <Lightbulb className="w-3.5 h-3.5" />,
        color: 'text-amber-500',
        label: 'Insight reported',
        detail: event.message?.slice(0, 120) || null,
      }
    case 'error':
    case 'warning':
      return {
        icon: <AlertTriangle className="w-3.5 h-3.5" />,
        color: 'text-amber-500',
        label: 'Warning',
        detail: event.message?.slice(0, 120) || null,
      }
    case 'assistant_thinking':
      return {
        icon: <Bot className="w-3.5 h-3.5" />,
        color: 'text-purple-400',
        label: 'Thinking...',
        detail: event.message?.slice(0, 100) || null,
      }
    case 'queued_instruction':
    case 'assistant_collect':
    case 'assistant_steer':
    case 'assistant_followup':
      return {
        icon: <Clock className="w-3.5 h-3.5" />,
        color: 'text-muted-foreground',
        label: 'Instruction queued',
        detail: event.message?.slice(0, 100) || null,
      }
    default:
      return {
        icon: <Activity className="w-3.5 h-3.5" />,
        color: 'text-muted-foreground',
        label: eventName.replace(/_/g, ' '),
        detail: event.message?.slice(0, 100) || null,
      }
  }
}

function formatEventTime(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ''
  }
}
