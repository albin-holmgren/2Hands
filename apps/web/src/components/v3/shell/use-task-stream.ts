'use client'

/**
 * v3 task event stream — cursor polling client for
 * GET /api/tasks/:id/events?cursor=. Polls every 1.5s, appends only unseen
 * sequences, and stops once the task reaches a terminal state (after the
 * final events are drained). Replay-safe: the cursor is the last rendered
 * sequence, so reconnects and re-mounts never duplicate content.
 */

import * as React from 'react'
import type { EventEnvelope, TaskStatus } from '@2hands/types/v3'

const POLL_INTERVAL_MS = 1500
const TERMINAL_STATUSES: readonly TaskStatus[] = ['completed', 'failed', 'cancelled']

export interface TaskStreamState {
  taskId: string | null
  taskStatus: TaskStatus | null
  events: EventEnvelope[]
  error: string | null
}

export interface TaskStream extends TaskStreamState {
  /** Start streaming a task (resets prior stream state). */
  start: (taskId: string) => void
  stop: () => void
}

export function useTaskStream(): TaskStream {
  const [state, setState] = React.useState<TaskStreamState>({
    taskId: null,
    taskStatus: null,
    events: [],
    error: null,
  })

  const cursorRef = React.useRef(0)
  const taskIdRef = React.useRef<string | null>(null)
  const timerRef = React.useRef<number | null>(null)
  const inFlightRef = React.useRef(false)

  const clearTimer = React.useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const poll = React.useCallback(async () => {
    const taskId = taskIdRef.current
    if (!taskId || inFlightRef.current) return
    inFlightRef.current = true
    try {
      const res = await fetch(
        `/api/tasks/${taskId}/events?cursor=${cursorRef.current}`,
        { cache: 'no-store' },
      )
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        setState((prev) =>
          prev.taskId === taskId
            ? { ...prev, error: json?.error?.message ?? `Event stream error (${res.status})` }
            : prev,
        )
        return
      }
      const { events, nextCursor, taskStatus } = json.data as {
        events: EventEnvelope[]
        nextCursor: number | null
        taskStatus: TaskStatus
      }
      // Ignore stale in-flight responses: if start() switched tasks while this
      // request was outstanding, its cursor belongs to the OLD stream and
      // must not clobber the freshly reset cursor.
      if (taskIdRef.current !== taskId) return
      if (typeof nextCursor === 'number') cursorRef.current = nextCursor
      setState((prev) => {
        if (prev.taskId !== taskId) return prev
        const seen = new Set(prev.events.map((e) => e.sequence))
        const fresh = events.filter((e) => !seen.has(e.sequence))
        return {
          ...prev,
          taskStatus,
          events: fresh.length > 0 ? [...prev.events, ...fresh] : prev.events,
          error: null,
        }
      })
      // Terminal + drained (short page means no more buffered events) → stop.
      if (TERMINAL_STATUSES.includes(taskStatus) && events.length === 0) {
        clearTimer()
      }
    } catch {
      setState((prev) =>
        prev.taskId === taskId ? { ...prev, error: 'Event stream unreachable' } : prev,
      )
    } finally {
      inFlightRef.current = false
    }
  }, [clearTimer])

  const start = React.useCallback(
    (taskId: string) => {
      clearTimer()
      taskIdRef.current = taskId
      cursorRef.current = 0
      setState({ taskId, taskStatus: null, events: [], error: null })
      void poll()
      timerRef.current = window.setInterval(() => void poll(), POLL_INTERVAL_MS)
    },
    [clearTimer, poll],
  )

  const stop = React.useCallback(() => {
    clearTimer()
    taskIdRef.current = null
  }, [clearTimer])

  React.useEffect(() => clearTimer, [clearTimer])

  return { ...state, start, stop }
}
