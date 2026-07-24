/**
 * Hardcoded Google Calendar MCP Tools
 *
 * These tools allow agents to read and create Google Calendar events
 * via the Calendar API v3. Uses Google OAuth credentials (requires calendar scope).
 */

import type { McpTool, McpExecutionContext, McpToolResult } from '../types'

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

async function calendarGet(
  path: string,
  accessToken: string,
  params?: Record<string, string>
): Promise<McpToolResult> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const res = await fetch(`${CALENDAR_API}${path}${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !data) {
    return {
      success: false,
      error: typeof data?.error === 'object'
        ? JSON.stringify((data.error as Record<string, unknown>).message || data.error)
        : `HTTP ${res.status}`,
      statusCode: res.status,
    }
  }

  return { success: true, data, statusCode: res.status }
}

async function calendarPost(
  path: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<McpToolResult> {
  const res = await fetch(`${CALENDAR_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !data) {
    return {
      success: false,
      error: typeof data?.error === 'object'
        ? JSON.stringify((data.error as Record<string, unknown>).message || data.error)
        : `HTTP ${res.status}`,
      statusCode: res.status,
    }
  }

  return { success: true, data, statusCode: res.status }
}

export const calendarListEvents: McpTool = {
  name: 'calendar_list_events',
  description: 'List upcoming Google Calendar events. Returns events from now or a specified time range.',
  inputSchema: {
    type: 'object',
    properties: {
      calendar_id: { type: 'string', description: 'Calendar ID (default "primary")' },
      time_min: { type: 'string', description: 'Start of time range (ISO 8601, e.g. "2025-01-15T00:00:00Z"). Default: now.' },
      time_max: { type: 'string', description: 'End of time range (ISO 8601). Default: 7 days from now.' },
      max_results: { type: 'number', description: 'Max events to return (default 10, max 50)' },
      query: { type: 'string', description: 'Free text search query to filter events' },
    },
  },
  execute: async (
    input: Record<string, unknown>,
    context: McpExecutionContext
  ): Promise<McpToolResult> => {
    const accessToken = context.credentials.accessToken
    if (!accessToken) return { success: false, error: 'Missing access token' }

    const calendarId = typeof input.calendar_id === 'string' && input.calendar_id.trim()
      ? encodeURIComponent(input.calendar_id.trim())
      : 'primary'

    const now = new Date()
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const params: Record<string, string> = {
      timeMin: typeof input.time_min === 'string' ? input.time_min : now.toISOString(),
      timeMax: typeof input.time_max === 'string' ? input.time_max : weekFromNow.toISOString(),
      maxResults: String(typeof input.max_results === 'number' ? Math.min(50, Math.max(1, input.max_results)) : 10),
      singleEvents: 'true',
      orderBy: 'startTime',
    }
    if (typeof input.query === 'string' && input.query.trim()) {
      params.q = input.query.trim()
    }

    const result = await calendarGet(`/calendars/${calendarId}/events`, accessToken, params)
    if (!result.success) return result

    const data = result.data as {
      items?: Array<{
        id: string
        summary: string
        description?: string
        start?: { dateTime?: string; date?: string }
        end?: { dateTime?: string; date?: string }
        location?: string
        attendees?: Array<{ email: string; responseStatus?: string }>
        htmlLink?: string
      }>
    }

    const events = (data.items || []).map(e => ({
      id: e.id,
      summary: e.summary || '(No title)',
      description: e.description?.slice(0, 200) || '',
      start: e.start?.dateTime || e.start?.date || '',
      end: e.end?.dateTime || e.end?.date || '',
      location: e.location || '',
      attendees: (e.attendees || []).map(a => ({ email: a.email, status: a.responseStatus || 'needsAction' })),
      link: e.htmlLink || '',
    }))

    return { success: true, data: { events, count: events.length } }
  },
}

export const calendarCreateEvent: McpTool = {
  name: 'calendar_create_event',
  description: 'Create a new Google Calendar event with optional attendees.',
  inputSchema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Event title' },
      description: { type: 'string', description: 'Event description (optional)' },
      start_time: { type: 'string', description: 'Start time in ISO 8601 (e.g. "2025-01-20T10:00:00+01:00")' },
      end_time: { type: 'string', description: 'End time in ISO 8601' },
      location: { type: 'string', description: 'Event location (optional)' },
      attendees: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of attendee email addresses (optional)',
      },
      calendar_id: { type: 'string', description: 'Calendar ID (default "primary")' },
      all_day: { type: 'boolean', description: 'If true, creates an all-day event. Use start_time as YYYY-MM-DD.' },
    },
    required: ['summary', 'start_time', 'end_time'],
  },
  execute: async (
    input: Record<string, unknown>,
    context: McpExecutionContext
  ): Promise<McpToolResult> => {
    const accessToken = context.credentials.accessToken
    if (!accessToken) return { success: false, error: 'Missing access token' }

    const summary = typeof input.summary === 'string' ? input.summary.trim() : ''
    const startTime = typeof input.start_time === 'string' ? input.start_time.trim() : ''
    const endTime = typeof input.end_time === 'string' ? input.end_time.trim() : ''
    if (!summary || !startTime || !endTime) {
      return { success: false, error: 'summary, start_time, and end_time are required' }
    }

    const calendarId = typeof input.calendar_id === 'string' && input.calendar_id.trim()
      ? encodeURIComponent(input.calendar_id.trim())
      : 'primary'

    const isAllDay = input.all_day === true

    const event: Record<string, unknown> = {
      summary,
      start: isAllDay ? { date: startTime } : { dateTime: startTime },
      end: isAllDay ? { date: endTime } : { dateTime: endTime },
    }

    if (typeof input.description === 'string' && input.description.trim()) {
      event.description = input.description.trim()
    }
    if (typeof input.location === 'string' && input.location.trim()) {
      event.location = input.location.trim()
    }
    if (Array.isArray(input.attendees) && input.attendees.length > 0) {
      event.attendees = input.attendees
        .filter((e): e is string => typeof e === 'string' && e.includes('@'))
        .map(email => ({ email: email.trim() }))
    }

    return calendarPost(`/calendars/${calendarId}/events`, accessToken, event)
  },
}

export const calendarGetFreeBusy: McpTool = {
  name: 'calendar_get_freebusy',
  description: 'Check free/busy times for calendars to find available meeting slots.',
  inputSchema: {
    type: 'object',
    properties: {
      time_min: { type: 'string', description: 'Start of time range (ISO 8601)' },
      time_max: { type: 'string', description: 'End of time range (ISO 8601)' },
      calendars: {
        type: 'array',
        items: { type: 'string' },
        description: 'Calendar IDs to check (default ["primary"])',
      },
    },
    required: ['time_min', 'time_max'],
  },
  execute: async (
    input: Record<string, unknown>,
    context: McpExecutionContext
  ): Promise<McpToolResult> => {
    const accessToken = context.credentials.accessToken
    if (!accessToken) return { success: false, error: 'Missing access token' }

    const timeMin = typeof input.time_min === 'string' ? input.time_min : ''
    const timeMax = typeof input.time_max === 'string' ? input.time_max : ''
    if (!timeMin || !timeMax) return { success: false, error: 'time_min and time_max are required' }

    const calendars = Array.isArray(input.calendars)
      ? input.calendars.filter((c): c is string => typeof c === 'string')
      : ['primary']

    const body = {
      timeMin,
      timeMax,
      items: calendars.map(id => ({ id })),
    }

    const res = await fetch(`${CALENDAR_API}/freeBusy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!res.ok || !data) {
      return {
        success: false,
        error: typeof data?.error === 'object'
          ? JSON.stringify((data.error as Record<string, unknown>).message || data.error)
          : `HTTP ${res.status}`,
        statusCode: res.status,
      }
    }

    return { success: true, data, statusCode: res.status }
  },
}

export const googleCalendarTools: McpTool[] = [
  calendarListEvents,
  calendarCreateEvent,
  calendarGetFreeBusy,
]
