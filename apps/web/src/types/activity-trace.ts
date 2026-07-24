// Unified Activity Trace types — single source of truth for thinking, search, references, and actions.
// Used by: server (route.ts), client (page.tsx), UI (message-list.tsx), mobile (use-chat.ts)

// ---------------------------------------------------------------------------
// Source reference (favicon, link, snippet) — used in search/browse results
// ---------------------------------------------------------------------------
export interface SourceRef {
  title: string
  url?: string
  favicon?: string
  source?: string   // hostname or display label
  snippet?: string  // short text excerpt
}

// ---------------------------------------------------------------------------
// Activity trace step — one unit of work the AI performed
// ---------------------------------------------------------------------------
export type ActivityStepKind = 'think' | 'plan' | 'search' | 'browse' | 'tool' | 'work' | 'image'
export type ActivityStepStatus = 'active' | 'complete' | 'error'

export interface ActivityTraceStep {
  id: string
  kind: ActivityStepKind
  status: ActivityStepStatus
  label: string
  reason?: string           // short "why we're doing this"
  description?: string      // longer detail (thinking content snapshot)
  sources?: SourceRef[]     // normalized results for favicons/references
  data?: {
    url?: string
    query?: string
    results?: string[]      // legacy plain-text results
    results_v2?: SourceRef[] // structured results (backward compat key)
    toolName?: string
    imageUrl?: string
    imageCaption?: string
  }
  timestamp?: number
}

// ---------------------------------------------------------------------------
// SSE event types — clear contract between server and client
// ---------------------------------------------------------------------------
export type ChatEvent =
  | { type: 'turn_start'; turnId: string }
  | { type: 'text'; text: string }
  | { type: 'reasoning_delta'; delta: string }
  | { type: 'activity_step_upsert'; step: ActivityTraceStep }
  | { type: 'activity_step_patch'; stepId: string; patch: Partial<ActivityTraceStep> }
  | { type: 'turn_end'; turnId: string }
  // Legacy compatibility — still emitted, processed into the above on the client
  | { type: 'ai_state'; state: string; context?: string; metadata?: Record<string, unknown>; startTime?: number }
  | { type: 'progress_update'; update_type: string; message: string }
  | { type: 'thinking_start' }
  | { type: 'thinking'; thinking: string }
  | { type: 'complexity'; level: string; shouldShowThinking: boolean; thinkingDepth: string }
  | { type: 'tool_call'; tool: string; name?: string; input?: Record<string, unknown> }
  | { type: 'tool_result'; tool: string; result?: string; data?: Record<string, unknown>; [key: string]: unknown }
  | { type: 'cot_step'; id?: string; label?: string; description?: string; status?: string; kind?: string; data?: Record<string, unknown> }
  | { type: 'error'; message: string }
  | { type: 'integration_setup'; connector_id: string; connector_name: string; fields: unknown[] }

// ---------------------------------------------------------------------------
// Message metadata shape (persisted to DB)
// ---------------------------------------------------------------------------
export interface MessageActivityMetadata {
  activity_trace_v2?: ActivityTraceStep[]
  reasoning_summary?: string
  // Legacy fields kept for backward compatibility with existing messages
  activity_trace?: ActivityTraceStep[]
  thinking_content?: string
}

// ---------------------------------------------------------------------------
// Turn state — atomic client-side state for one assistant turn
// ---------------------------------------------------------------------------
export interface TurnState {
  turnId: string
  text: string
  reasoningSummary: string
  activityTrace: ActivityTraceStep[]
  status: 'streaming' | 'complete' | 'error'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a favicon URL from a hostname — returns empty string (Google favicon blocked by CSP) */
export function faviconUrl(_hostname: string, _size = 64): string {
  return ''
}

/** Extract hostname from a URL string, stripping www. */
export function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** Ensure a SourceRef has a source label from the URL; favicon is left empty to avoid CSP violations */
export function ensureFavicon(ref: SourceRef): SourceRef {
  if (!ref.url) return ref
  const host = extractHostname(ref.url)
  if (!host) return ref
  return { ...ref, favicon: ref.favicon || '', source: ref.source || host }
}

/** Deduplicate sources by URL (or title as fallback key) */
export function deduplicateSources(sources: SourceRef[]): SourceRef[] {
  const seen = new Set<string>()
  return sources.filter(s => {
    const key = s.url || s.title
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Collect all sources from an activity trace, deduplicated and with favicons */
export function collectSources(trace: ActivityTraceStep[]): SourceRef[] {
  const raw: SourceRef[] = []
  for (const step of trace) {
    if (step.sources) raw.push(...step.sources)
    if (step.data?.results_v2) raw.push(...step.data.results_v2)
  }
  return deduplicateSources(raw.map(ensureFavicon))
}

/** Convert legacy ActivityStep to ActivityTraceStep */
export function fromLegacyStep(step: {
  id: string
  label: string
  description?: string
  status: 'active' | 'complete' | 'pending'
  kind?: string
  data?: Record<string, unknown>
}): ActivityTraceStep {
  const kindMap: Record<string, ActivityStepKind> = {
    thinking: 'think',
    search: 'search',
    browse: 'browse',
    tool: 'tool',
    work: 'work',
    image: 'image',
    // New kinds pass through
    think: 'think',
    plan: 'plan',
  }
  return {
    id: step.id,
    kind: kindMap[step.kind || 'think'] || 'think',
    status: step.status === 'pending' ? 'active' : step.status as ActivityStepStatus,
    label: step.label,
    description: step.description,
    data: step.data as ActivityTraceStep['data'],
    sources: (step.data?.results_v2 as SourceRef[] | undefined)?.map(ensureFavicon),
  }
}
