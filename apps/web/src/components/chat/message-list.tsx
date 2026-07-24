'use client'

import { useEffect, useLayoutEffect, useRef, useMemo, memo, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Sparkles, Loader2, Cpu, Settings, Trash2, FileText, ArrowDown, ChevronDown, Volume2, VolumeX, Share2, Lightbulb, Search, ImageIcon, Globe, Wrench, Brain, Flame, Target, Zap, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import type { Message } from '@/types/database'
import { IntegrationSetupCard } from '@/components/chat/integration-setup-card'
import { MarkdownTable } from '@/components/chat/markdown-table'
import type { AIState, AIStateMetadata } from '@/components/chat/ai-states'
import type { ChainOfThoughtSearchResultItem } from '@/components/ai-elements/chain-of-thought'
import { Actions, Action } from '@/components/ai/actions'
import type { ConnectorField } from '@/lib/integrations/connector-fields'
import { TwoHandsLoader } from '@/components/ui/loader'
import { collectSources, ensureFavicon, type SourceRef } from '@/types/activity-trace'


// ── Mission card types & components ──────────────────────────────────────────

interface MissionProposal {
  goal: string
  why: string
  first_steps: string
  autonomy_level: string
  tick_timebox_minutes: number
}

interface MissionStarted {
  id: string
  goal: string
  status: string
  next_tick_at: string | null
}

function MissionProposalCard({ proposal, onStart }: { proposal: MissionProposal; onStart?: (proposal: MissionProposal) => void }) {
  const [starting, setStarting] = useState(false)
  const [started, setStarted] = useState(false)

  const handleStart = async () => {
    if (starting || started) return
    if (onStart) { onStart(proposal); return }
    setStarting(true)
    try {
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          goal: proposal.goal,
          autonomy_level: proposal.autonomy_level,
          tick_timebox_minutes: proposal.tick_timebox_minutes,
        }),
      })
      if (res.ok) setStarted(true)
    } catch { /* ignore */ } finally {
      setStarting(false)
    }
  }

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 max-w-[560px]">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-primary/15">
          <Target size={14} className="text-primary" />
        </div>
        <span className="text-[13px] font-bold text-foreground">Mission Proposal</span>
      </div>
      <p className="text-[14px] font-semibold text-foreground mb-1">{proposal.goal}</p>
      <p className="text-[12px] text-muted-foreground mb-3">{proposal.why}</p>
      <div className="rounded-xl bg-background/60 border border-border/60 p-3 mb-3">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">First steps</p>
        <p className="text-[12px] text-foreground/80 whitespace-pre-line">{proposal.first_steps}</p>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mb-3">
        <span className="flex items-center gap-1"><Zap size={10} />{proposal.tick_timebox_minutes}min per tick</span>
        <span className="capitalize">{proposal.autonomy_level.replace(/_/g, ' ')}</span>
      </div>
      {started ? (
        <div className="flex items-center gap-2 text-[12px] text-emerald-600 dark:text-emerald-400 font-medium">
          <CheckCircle2 size={13} />Mission started — check the Missions tab
        </div>
      ) : (
        <button
          onClick={handleStart}
          disabled={starting}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-[12px] font-semibold hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-60"
        >
          {starting ? <Sparkles size={13} className="animate-spin" /> : <Zap size={13} />}
          {starting ? 'Starting…' : 'Start Mission'}
        </button>
      )}
    </div>
  )
}

function MissionStartedCard({ mission }: { mission: MissionStarted }) {
  const nextTick = mission.next_tick_at ? (() => {
    const diff = new Date(mission.next_tick_at!).getTime() - Date.now()
    if (diff < 0) return 'Soon'
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `in ${mins}m`
    return `in ${Math.floor(mins / 60)}h`
  })() : null

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 overflow-hidden max-w-[560px]">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-emerald-500/10">
        <div className="w-6 h-6 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
          <CheckCircle2 size={13} className="text-emerald-500" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-bold text-foreground">Mission started</span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Running autonomously
            </span>
            {nextTick && (
              <span className="text-[11px] text-muted-foreground">· first tick {nextTick}</span>
            )}
          </div>
        </div>
      </div>
      {/* Body */}
      <div className="px-4 py-3">
        <p className="text-[13px] text-foreground/80 leading-relaxed mb-3">{mission.goal}</p>
        <a
          href="/app/mission"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline underline-offset-2"
        >
          <Target size={11} />
          View mission details &amp; activity log
        </a>
      </div>
    </div>
  )
}

interface MissionProgress {
  mission_id: string
  goal?: string
  agents_created?: number
  actions?: string[]
  next_tick_at?: string | null
}

function MissionProgressCard({ progress, content }: { progress: MissionProgress; content: string }) {
  const nextTick = progress.next_tick_at ? (() => {
    const diff = new Date(progress.next_tick_at!).getTime() - Date.now()
    if (diff < 0) return 'Soon'
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `in ${mins}m`
    return `in ${Math.floor(mins / 60)}h`
  })() : null

  // Strip boilerplate header lines
  const body = content
    .replace(/^🎯\s*\*\*Mission Update\*\*.*\n\n?/m, '')
    .replace(/^#{1,3}\s*Mission Update\s*\n\n?/im, '')
    .trim()

  // Extract key insight lines (lines starting with **bold:** pattern or bullet points)
  const bulletLines = body.split('\n')
    .filter(l => l.match(/^[\-•*]\s+/) || l.match(/^\d+\.\s+/))
    .map(l => l.replace(/^[\-•*\d.]+\s+/, '').replace(/\*\*/g, '').trim())
    .filter(l => l.length > 8)
    .slice(0, 4)

  // Paragraph summary (non-bullet lines joined)
  const summaryLines = body.split('\n')
    .filter(l => l.trim() && !l.match(/^[\-•*\d#]/))
    .slice(0, 2)
    .join(' ')
    .replace(/\*\*/g, '')
    .trim()
    .slice(0, 200)

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/4 overflow-hidden max-w-[600px]">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-primary/10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <Target size={13} className="text-primary" />
          </div>
          <div className="min-w-0">
            <span className="text-[13px] font-bold text-foreground">Mission tick complete</span>
            {progress.goal && (
              <p className="text-[11px] text-muted-foreground truncate max-w-[300px]">{progress.goal}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {progress.agents_created && progress.agents_created > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 font-medium border border-purple-500/15">
              {progress.agents_created} agent{progress.agents_created > 1 ? 's' : ''} spawned
            </span>
          )}
          {nextTick && (
            <span className="text-[11px] text-muted-foreground">next {nextTick}</span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2">
        {summaryLines && (
          <p className="text-[13px] text-foreground/80 leading-relaxed">{summaryLines}</p>
        )}
        {bulletLines.length > 0 && (
          <ul className="space-y-1 mt-1">
            {bulletLines.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0 mt-1.5" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        )}
        {/* Actions from metadata */}
        {!bulletLines.length && progress.actions && progress.actions.length > 0 && (
          <ul className="space-y-1">
            {progress.actions.slice(0, 4).map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] text-muted-foreground">
                <Zap size={10} className="text-primary/60 shrink-0 mt-1" />
                <span className="line-clamp-2">{a}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// Buffers incoming streamed text and reveals it at a steady cadence,
// decoupling bursty network chunks from smooth visual output.
function useStreamBuffer(incoming: string, active: boolean): string {
  const [displayed, setDisplayed] = useState(incoming)
  const incomingRef = useRef(incoming)
  const displayedLenRef = useRef(incoming.length)
  const rafRef = useRef<number | null>(null)
  const activeRef = useRef(active)

  // Keep refs synchronously up to date on every render
  incomingRef.current = incoming
  activeRef.current = active

  // Stable animation ticker (never recreated)
  const startTick = useCallback(() => {
    if (rafRef.current !== null) return
    const tick = () => {
      if (!activeRef.current) {
        rafRef.current = null
        return
      }
      const target = incomingRef.current
      const curLen = displayedLenRef.current
      if (curLen >= target.length) {
        rafRef.current = null
        return
      }
      // Normal: 6 chars/frame (~360 chars/sec at 60fps)
      // Catch-up: 24 chars/frame when buffer > 300 chars behind
      const lag = target.length - curLen
      const step = lag > 300 ? 24 : 6
      displayedLenRef.current = Math.min(curLen + step, target.length)
      setDisplayed(target.slice(0, displayedLenRef.current))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  // Start/stop based on active flag
  useEffect(() => {
    if (!active) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      // Snap to full content immediately when streaming ends
      displayedLenRef.current = incoming.length
      setDisplayed(incoming)
      return
    }
    startTick()
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  // Kick the animation when new content arrives and the loop is idle (caught up)
  useEffect(() => {
    if (active && rafRef.current === null && displayedLenRef.current < incomingRef.current.length) {
      startTick()
    }
  }, [incoming, active, startTick])

  return displayed
}

// Lightweight streaming message renderer.
// Uses the smooth buffer hook so text reveals steadily instead of in bursty chunks.
// Does NOT parse markdown — that happens once on completion via ReactMarkdown.
const StreamingMessage = memo(function StreamingMessage({ text }: { text: string }) {
  const revealed = useStreamBuffer(text, true)
  return (
    <div className="text-[16px] leading-[1.7] text-card-foreground whitespace-pre-wrap break-words select-text">
      {revealed}
      <span
        aria-hidden
        className="inline-block w-[2px] h-[1.1em] bg-current opacity-60 ml-[2px] align-text-bottom"
        style={{ animation: 'blink 1s step-start infinite' }}
      />
    </div>
  )
})

function deriveWorkLabel(steps: ActivityStep[]): string {
  const planSteps = steps.filter(s => s.kind === 'plan')
  if (planSteps.length >= 2) {
    return planSteps.slice(0, 3).map(s => s.label).join(' → ')
  }
  const GENERIC = /^(Understanding request|Processing\.\.\.|Thinking\.{0,3}|Working(?:\.{0,3}| on your request)?|Initializing|Starting|Running:)$/i
  const activeStep = steps.find(s => s.status === 'active')
  if (activeStep?.label && !GENERIC.test(activeStep.label)) return activeStep.label
  const lastComplete = [...steps].reverse().find(s => s.status === 'complete')
  if (lastComplete?.label && !GENERIC.test(lastComplete.label)) return lastComplete.label
  // Try to derive a more specific fallback from integration/tool context
  const integrationStep = [...steps].reverse().find(s =>
    s.label && /\b(attio|hubspot|github|slack|notion|sheets|gmail|crm|deal|company|pipeline)\b/i.test(s.label)
  )
  if (integrationStep?.label) return integrationStep.label
  return 'Executing…'
}

function CompactProgressDots({ label, steps }: { label?: string; steps?: ActivityStep[] }) {
  const displayLabel = steps && steps.length > 0 ? deriveWorkLabel(steps) : (label ?? 'Working on your request')
  return (
    <div className="flex items-center gap-2 py-2">
      <span className="flex gap-1">
        <motion.span
          className="size-1.5 bg-[#C4A484] rounded-full"
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.span
          className="size-1.5 bg-[#C4A484] rounded-full"
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut', delay: 0.15 }}
        />
        <motion.span
          className="size-1.5 bg-[#C4A484] rounded-full"
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
        />
      </span>
      {displayLabel && (
        <span className="text-[11px] text-muted-foreground/70 font-medium">{displayLabel}</span>
      )}
    </div>
  )
}

function ManagerTurnCard({ status, startedAt, hasMetadata, steps }: { status: string; startedAt?: string; hasMetadata?: boolean; steps?: ActivityStep[] }) {
  const isCompleted = status === 'completed'
  const isFailed = status === 'failed'
  const isStale = !isCompleted && !isFailed && startedAt
    ? Date.now() - new Date(startedAt).getTime() > 5 * 60 * 1000
    : false

  if (isCompleted) {
    if (hasMetadata) {
      return null
    }
    return (
      <div className="flex items-center gap-1.5 py-1">
        <CheckCircle2 size={12} className="text-muted-foreground/50" />
        <span className="text-[11px] text-muted-foreground/50">Done</span>
      </div>
    )
  }

  if (isFailed) {
    return (
      <p className="text-[13px] text-amber-500/80 italic">
        Response may have been interrupted — try sending your message again.
      </p>
    )
  }

  if (isStale) {
    return (
      <p className="text-[12px] text-muted-foreground/60 italic">
        This response took longer than expected. Try sending your message again if no update appears.
      </p>
    )
  }

  return <CompactProgressDots steps={steps} />
}

function AgentFindingCard({ agentName, content }: { agentName: string; content: string }) {
  // Strip the "🔍 **AgentName — findings ready**\n\n" header
  const body = content.replace(/^🔍\s*\*\*.*?—\s*findings ready\*\*\n\n?/m, '').trim()
  const lines = body.split('\n').filter(l => l.trim())
  const paragraphs = lines.filter(l => !l.match(/^[\-•*\d]/)).slice(0, 2).join(' ').slice(0, 200)
  const bullets = lines
    .filter(l => l.match(/^[\-•*]\s+/) || l.match(/^\d+\.\s+/))
    .map(l => l.replace(/^[\-•*\d.]+\s+/, '').replace(/\*\*/g, '').trim())
    .filter(l => l.length > 6)
    .slice(0, 5)

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/4 overflow-hidden max-w-[600px]">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-emerald-500/10">
        <div className="w-6 h-6 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
          <Zap size={12} className="text-emerald-500" />
        </div>
        <div className="min-w-0">
          <span className="text-[13px] font-bold text-foreground">{agentName}</span>
          <p className="text-[11px] text-muted-foreground">findings ready</p>
        </div>
      </div>
      <div className="px-4 py-3 space-y-2">
        {paragraphs && <p className="text-[13px] text-foreground/80 leading-relaxed">{paragraphs}</p>}
        {bullets.length > 0 && (
          <ul className="space-y-1">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 shrink-0 mt-1.5" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── End mission cards ─────────────────────────────────────────────────────────

// Memoized animation variants to prevent recreation
const messageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const }
}

// Activity step type for chain-of-thought trace
export interface ActivityStep {
  id: string
  label: string
  description?: string
  status: 'active' | 'complete' | 'pending'
  kind?: 'thinking' | 'search' | 'browse' | 'tool' | 'work' | 'image' | 'plan'
  data?: {
    url?: string
    query?: string
    results?: string[]
    results_v2?: Array<{
      title: string
      url?: string
      favicon?: string
      source?: string
    }>
    toolName?: string
    imageUrl?: string
    imageCaption?: string
  }
}

// Search results sidebar component - full page height right panel
function SearchResultsSidebar({ 
  isOpen, 
  onClose, 
  results 
}: { 
  isOpen: boolean
  onClose: () => void
  results: Array<{ title: string; url?: string; favicon?: string; source?: string; description?: string }>
}) {
  if (!isOpen) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed top-0 right-0 bottom-0 w-[290px] sm:w-[330px] z-50 bg-background border-l border-border shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="shrink-0 border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">Search</span>
            <span className="text-sm text-muted-foreground">{results.length}</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-secondary rounded-lg transition-colors"
            style={{ cursor: 'pointer' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        
        {/* Results list */}
        <div className="flex-1 overflow-y-auto">
          {results.map((result, index) => {
            let hostname = ''
            let favicon = result.favicon || ''
            try {
              if (result.url) {
                const urlObj = new URL(result.url)
                hostname = urlObj.hostname.replace(/^www\./, '')
              }
            } catch { /* ignore */ }

            return (
              <a
                key={index}
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 px-4 py-3 hover:bg-secondary/80 transition-colors border-b border-border/40 group"
              >
                <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5 overflow-hidden">
                  {favicon ? (
                    <img 
                      src={favicon} 
                      alt="" 
                      className="w-4 h-4 object-contain rounded-full"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  ) : (
                    <Globe className="size-3 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {hostname && (
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs text-muted-foreground">{hostname}</span>
                      {result.source && (
                        <span className="text-xs text-muted-foreground/60">{result.source}</span>
                      )}
                    </div>
                  )}
                  <h4 className="font-medium text-foreground text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                    {result.title}
                  </h4>
                  {result.description && (
                    <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2 leading-relaxed">
                      {result.description}
                    </p>
                  )}
                </div>
              </a>
            )
          })}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}

// Component to display web references with favicons - inline with actions
function References({ steps }: { steps: ActivityStep[] }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  
  // Use shared collectSources helper for consistent deduplication + favicon generation
  const sources = useMemo(() => collectSources(steps as any), [steps])
  
  const MAX_DISPLAY = 6
  const displaySources = showAll ? sources : sources.slice(0, 3)
  const hasMore = sources.length > MAX_DISPLAY && !showAll
  
  if (sources.length === 0) return null
  
  return (
    <>
      <button 
        onClick={() => setIsSidebarOpen(true)}
        className="flex items-center gap-2 pl-2 pr-2 py-1 rounded-lg border-l border-border ml-1 hover:bg-muted/60 transition-colors"
        style={{ cursor: 'pointer' }}
      >
        {/* Overlapping favicon icons */}
        <div className="flex items-center">
          {displaySources.slice(0, 3).map((source, index) => (
            <div 
              key={index} 
              className="w-5 h-5 rounded-full bg-muted border border-border overflow-hidden flex items-center justify-center -ml-2 first:ml-0 ring-1 ring-background"
              style={{ zIndex: 3 - index }}
            >
              {source.favicon ? (
                <img 
                  src={source.favicon} 
                  alt="" 
                  className="w-4 h-4 object-contain"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              ) : (
                <span className="text-[8px] font-medium text-muted-foreground uppercase">
                  {source.source?.charAt(0) || '?'}
                </span>
              )}
            </div>
          ))}
        </div>
        {/* Reference label with count */}
        <span className="text-[13px] text-muted-foreground">
          {sources.length} {sources.length === 1 ? 'source' : 'sources'}
        </span>
      </button>
      
      <SearchResultsSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        results={sources}
      />
    </>
  )
}
function ThinkingTimer() {
  const [elapsed, setElapsed] = useState(0)
  
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(e => e + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])
  
  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  
  return (
    <span className="text-[11px] text-muted-foreground/50 font-mono tabular-nums ml-1">
      {minutes}:{seconds.toString().padStart(2, '0')}
    </span>
  )
}

// Format thinking content with visual structure and subtle highlights
interface FormattedThinkingContentProps {
  content: string
  searchResults: Array<{ title: string; url?: string; favicon?: string; source?: string }>
}

function FormattedThinkingContent({ content, searchResults }: FormattedThinkingContentProps) {
  // Parse content into structured sections
  const sections = useMemo(() => {
    // JUNK_LINE: operational status lines that must never appear in the Think (reasoning) panel.
    // These are tool-call / API-activity messages — not model reasoning.
    const JUNK_LINE = /^(Setting up integration|Testing .* connection[.…]*|Connecting[.…]*|Verifying[.…]*|Fetching[.…]*|Working on[.…]*|Working on agent:.*|Calling [\w\s]+ API[.…]*|Running:.*|Thinking[.…]*|Analyzing[.…]*|Processing[.…]*|Searching[.…]*|Browsing[.…]*|Analyzing (simple|medium|complex) query[.…]*)$/i
    const lines = content.split('\n')
    const result: Array<{
      type: 'heading' | 'step' | 'search' | 'url' | 'bullet' | 'quote' | 'text'
      content: string
      url?: string
      favicon?: string
      stepNum?: number
    }> = []
    
    lines.forEach((line, index) => {
      const trimmed = line.trim()
      // Skip empty / single-char / pure-punctuation / placeholder lines
      if (!trimmed || trimmed.length <= 1 || /^[-*•·.…,;]+$/.test(trimmed) || JUNK_LINE.test(trimmed)) {
        // Empty line - add spacing
        if (result.length > 0 && result[result.length - 1].type !== 'text' && result[result.length - 1].content !== '') {
          result.push({ type: 'text', content: '' })
        }
        return
      }
      
      // Check for step headers (Step 1:, Step 2:, etc.)
      const stepMatch = trimmed.match(/^(Step\s+(\d+):?)\s*(.*)$/i)
      if (stepMatch) {
        result.push({
          type: 'step',
          content: stepMatch[3] || trimmed,
          stepNum: parseInt(stepMatch[2], 10)
        })
        return
      }
      
      // Check for search query patterns
      const searchMatch = trimmed.match(/^(Searching (?:the web )?for|Search query|Query|Found \d+ results? for):?\s*(.+)$/i)
      if (searchMatch) {
        result.push({
          type: 'search',
          content: searchMatch[2]
        })
        return
      }
      
      // Check for "No results found" patterns — render as muted text
      if (/^No results found/i.test(trimmed)) {
        result.push({
          type: 'text',
          content: trimmed
        })
        return
      }
      
      // Strip leading "Thinking..." prefix when glued to the next sentence
      const thinkingStrip = trimmed.match(/^(?:Thinking|Analyzing \w+ query)\.{2,}\s*(.+)$/i)
      if (thinkingStrip && thinkingStrip[1]) {
        // Re-process the remaining text as a normal line
        const remaining = thinkingStrip[1].trim()
        if (remaining) {
          result.push({
            type: 'text',
            content: remaining.charAt(0).toUpperCase() + remaining.slice(1)
          })
        }
        return
      }
      
      // Check for URL patterns in the text
      const urlRegex = /(https?:\/\/[^\s]+)/g
      const urls = trimmed.match(urlRegex)
      if (urls && urls.length > 0) {
        // Find favicon for this URL if available in search results
        const url = urls[0]
        const matchingResult = searchResults.find(r => r.url === url || (url.includes(r.source || '') && r.favicon))
        let favicon = matchingResult?.favicon
        
        // No favicon fallback — avoids CSP violations; UI shows a globe icon
        
        result.push({
          type: 'url',
          content: trimmed.replace(url, '').trim() || url,
          url,
          favicon
        })
        return
      }
      
      // Check for bullet points
      if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
        result.push({
          type: 'bullet',
          content: trimmed.slice(1).trim()
        })
        return
      }
      
      // Check for quote/thought blocks (lines starting with > or indented)
      if (trimmed.startsWith('>') || (line.startsWith('   ') && trimmed.length > 0)) {
        result.push({
          type: 'quote',
          content: trimmed.replace(/^>/, '').trim()
        })
        return
      }
      
      // Skip lines that are just "Thinking..." or "Analyzing complex query..."
      if (/^(Thinking|Analyzing \w+ query)\.{2,}$/i.test(trimmed)) {
        return
      }
      
      // Regular text
      result.push({
        type: 'text',
        content: trimmed
      })
    })
    
    return result
  }, [content, searchResults])
  
  return (
    <div className="space-y-1">
      {sections.map((section, index) => {
        switch (section.type) {
          case 'step':
            return (
              <div key={index} className="flex items-start gap-2 py-1.5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0 mt-0.5">
                  {section.stepNum}
                </span>
                <span className="text-foreground/80 font-medium">{section.content}</span>
              </div>
            )
          
          case 'search':
            return (
              <div key={index} className="flex items-center gap-2 py-1 px-2 -mx-2 rounded-md bg-muted/30">
                <Search className="size-3.5 text-muted-foreground/60 shrink-0" />
                <span className="text-muted-foreground/80 text-xs uppercase tracking-wider font-medium">Search</span>
                <span className="text-foreground/70">{section.content}</span>
              </div>
            )
          
          case 'url': {
            // Extract hostname for display when content is just surrounding text (e.g. "Fetching and analyzing:")
            let displayHostname = ''
            try { displayHostname = section.url ? new URL(section.url).hostname.replace(/^www\./, '') : '' } catch {}
            const isWrappingText = section.content && section.content !== section.url
            return (
              <div key={index} className="flex items-start gap-2 py-1 group">
                {section.favicon ? (
                  <img 
                    src={section.favicon} 
                    alt="" 
                    className="w-4 h-4 rounded-full object-contain shrink-0 mt-0.5 opacity-70 group-hover:opacity-100 transition-opacity"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                ) : (
                  <Globe className="size-4 text-muted-foreground/40 shrink-0 mt-0.5" />
                )}
                <a 
                  href={section.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-primary/80 hover:text-primary hover:underline truncate"
                >
                  {isWrappingText ? (
                    <>{section.content} <span className="text-foreground/60">{displayHostname}</span></>
                  ) : (
                    displayHostname || section.url
                  )}
                </a>
              </div>
            )
          }
          
          case 'bullet':
            return (
              <div key={index} className="flex items-start gap-2 py-0.5 pl-1">
                <span className="text-muted-foreground/50 mt-1.5 shrink-0">•</span>
                <span className="text-foreground/70">{section.content}</span>
              </div>
            )
          
          case 'quote':
            return (
              <div key={index} className="pl-3 py-1 border-l-2 border-border/50 my-1">
                <span className="text-muted-foreground/80 italic">{section.content}</span>
              </div>
            )
          
          case 'text':
            if (!section.content) {
              return <div key={index} className="h-2" />
            }
            // Highlight key terms like "Analyzing", "Considering", etc.
            const highlightedContent = section.content
              .replace(/\b(Analyzing|Considering|Evaluating|Planning|Synthesizing|Reviewing|Processing)\b/g, '<span class="text-foreground/90 font-medium">$1</span>')
              .replace(/\b(Note|Important|Key|However|Therefore|Additionally)\b:/g, '<span class="text-foreground/90 font-medium">$1:</span>')
            
            return (
              <p 
                key={index} 
                className="text-foreground/70 leading-relaxed py-0.5"
                dangerouslySetInnerHTML={{ __html: highlightedContent }}
              />
            )
          
          default:
            return null
        }
      })}
    </div>
  )
}

// ThinkingDisplay component - shows "Thinking about" header, search bar with results, and collapsible thinking content
function ThinkingDisplay({ 
  content, 
  isStreaming,
  activitySteps = []
}: { 
  content: string; 
  isStreaming: boolean;
  activitySteps?: ActivityStep[];
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  
  // Auto-scroll thinking content to bottom whenever content changes
  useEffect(() => {
    if (isExpanded && contentRef.current) {
      requestAnimationFrame(() => {
        if (contentRef.current) {
          contentRef.current.scrollTop = contentRef.current.scrollHeight
        }
      })
    }
  }, [isExpanded, content, activitySteps])
  
  // Auto-expand when actively working, but don't auto-collapse (let user control)
  useEffect(() => {
    const hasActiveSteps = activitySteps.some(s => s.status === 'active')
    if (isStreaming || hasActiveSteps) {
      setIsExpanded(true)
    }
  }, [isStreaming, activitySteps])
  
  // Get search steps (show bar even without results yet)
  const searchSteps = useMemo(() => {
    return activitySteps.filter(step => 
      step.kind === 'search' || step.kind === 'browse'
    )
  }, [activitySteps])

  // Get all search results with favicons — uses shared collectSources for consistency
  const allSearchResults = useMemo(() => collectSources(searchSteps as any), [searchSteps])

  // Get display sources for the top row (max 3)
  const displaySources = useMemo(() => {
    return allSearchResults.slice(0, 3)
  }, [allSearchResults])
  
  if (!content && searchSteps.length === 0) return null

  // Get a clean summary for the collapsed state - describes what AI is thinking about
  const summary = useMemo(() => {
    // Priority 1: Use activity steps — they have structured info (queries, URLs)
    const searchStep = activitySteps.find(s => s.kind === 'search')
    const browseStep = activitySteps.find(s => s.kind === 'browse')
    if (searchStep?.data?.query) {
      const q = searchStep.data.query as string
      return `Researching: ${q.length > 60 ? q.slice(0, 60) + '...' : q}`
    }
    if (browseStep?.data?.url) {
      try {
        const hostname = new URL(browseStep.data.url as string).hostname.replace(/^www\./, '')
        return `Browsing ${hostname}`
      } catch {
        return `Browsing page`
      }
    }
    
    // Priority 2: Active step label
    const activeStep = activitySteps.find(s => s.status === 'active')
    if (activeStep) {
      const label = activeStep.label || ''
      if (label && !label.match(/^(Understanding request|Processing\.\.\.|Thinking\.\.\.?)$/i)) {
        return label.length > 70 ? label.slice(0, 70) + '...' : label
      }
    }
    
    // Priority 3: Extract from thinking content — skip AI internal reasoning
    if (content) {
      const lines = content.split('\n').filter(line => {
        const t = line.trim()
        if (!t) return false
        // Skip generic status prefixes
        if (/^(Thinking|Analyzing|Searching|Fetching|Processing)\.{2,}/i.test(t)) return false
        if (/^Analyzing \w+ query/i.test(t)) return false
        if (/^Step \d+:/i.test(t)) return false
        // Skip AI internal reasoning
        if (/^(The user|I should|I need|I will|I'll|Let me|This is a|This means)/i.test(t)) return false
        // Skip search result lines (URLs, "Found N results")
        if (/^(Found \d|No results|https?:\/\/)/i.test(t)) return false
        return true
      })
      if (lines.length > 0) {
        let meaningful = lines[0].trim()
        meaningful = meaningful
          .replace(/^(I('m| am)?\s+)?(thinking|analyzing|considering|evaluating|planning)\s+/i, '')
          .replace(/\.{3,}$/, '')
          .trim()
        if (meaningful.length > 3) {
          meaningful = meaningful.charAt(0).toUpperCase() + meaningful.slice(1)
          return meaningful.length > 70 ? meaningful.slice(0, 70) + '...' : meaningful
        }
      }
    }
    
    // Priority 4: Last complete step
    const lastComplete = [...activitySteps].reverse().find(s => s.status === 'complete')
    if (lastComplete) {
      const text = lastComplete.description || lastComplete.label
      if (text) return text.length > 70 ? text.slice(0, 70) + '...' : text
    }
    
    return 'Thinking...'
  }, [content, activitySteps])
  
  return (
    <motion.div 
      className="my-2"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0, overflow: 'hidden' }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      layout={false}
    >      
      <div className="rounded-2xl border border-border/60 bg-secondary overflow-hidden relative">
        {/* Subtle gradient shimmer when streaming */}
        {isStreaming && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.03, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
            }}
          />
        )}
        
        {/* Search results bar with favicons - entire row clickable */}
        {searchSteps.length > 0 && (
          <motion.button
            onClick={() => setIsSidebarOpen(true)}
            className="flex items-center gap-3 w-full px-4 py-3 bg-secondary border-b border-border/40 text-left hover:bg-secondary/80 transition-colors relative"
            style={{ cursor: 'pointer' }}
            whileHover={{ backgroundColor: 'rgba(0,0,0,0.03)' }}
            whileTap={{ scale: 0.995 }}
          >
            <motion.div
              initial={{ rotate: 0 }}
              animate={isStreaming ? { rotate: [0, 15, 0] } : {}}
              transition={{ duration: 0.5, repeat: isStreaming ? Infinity : 0, ease: "easeInOut", repeatDelay: 1 }}
            >
              <Search className="size-4 text-muted-foreground/70 shrink-0" />
            </motion.div>
            <span className="text-sm font-medium text-muted-foreground/80 shrink-0">Search</span>
            <span className="text-muted-foreground/30 shrink-0">|</span>
            <motion.span 
              className="text-sm text-muted-foreground flex-1 truncate"
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              {searchSteps.map(step => step.data?.query || step.label).join(', ')}
            </motion.span>
            
            {/* Website favicons in top row with stagger animation */}
            {displaySources.length > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="flex items-center">
                  {displaySources.map((source, index) => (
                    <motion.div 
                      key={index}
                      initial={{ opacity: 0, scale: 0, x: -10 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      transition={{ 
                        duration: 0.3, 
                        delay: index * 0.08,
                        ease: [0.22, 1, 0.36, 1]
                      }}
                      className="w-5 h-5 rounded-full bg-muted border border-border overflow-hidden flex items-center justify-center -ml-2 first:ml-0 ring-1 ring-background"
                      style={{ zIndex: displaySources.length - index }}
                    >
                      {source.favicon ? (
                        <img 
                          src={source.favicon} 
                          alt="" 
                          className="w-4 h-4 object-contain"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        <Globe className="size-3 text-muted-foreground" />
                      )}
                    </motion.div>
                  ))}
                </div>
                {allSearchResults.length > 3 && (
                  <motion.span 
                    className="text-xs text-muted-foreground"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    +{allSearchResults.length - 3}
                  </motion.span>
                )}
              </div>
            )}
            
            {allSearchResults.length > 0 && displaySources.length === 0 && (
              <motion.span 
                className="text-sm text-muted-foreground/60 shrink-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                {allSearchResults.length} results
              </motion.span>
            )}
          </motion.button>
        )}
        
        {/* Think toggle — only render when there is actual thinking content */}
        {content && <motion.button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2.5 w-full px-4 py-3 text-left relative"
          style={{ cursor: 'pointer' }}
          whileHover={{ backgroundColor: 'rgba(0,0,0,0.03)' }}
          whileTap={{ scale: 0.995 }}
        >
          <motion.div
            animate={isStreaming ? { 
              rotate: [0, 10, -10, 0],
              scale: [1, 1.1, 1]
            } : {}}
            transition={{ duration: 1.5, repeat: isStreaming ? Infinity : 0, ease: "easeInOut" }}
          >
            <Lightbulb className="size-4 text-muted-foreground/60 shrink-0" />
          </motion.div>
          
          <AnimatePresence mode="wait">
            {isExpanded ? (
              <motion.span 
                key="expanded"
                className="text-sm font-medium text-foreground/80 flex-1"
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                transition={{ duration: 0.15 }}
              >
                Think
              </motion.span>
            ) : (
              <motion.span 
                key="summary"
                className="text-sm text-muted-foreground flex-1 truncate"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
              >
                {summary}
              </motion.span>
            )}
          </AnimatePresence>
          
          {isStreaming && (
            <span className="flex gap-0.5 shrink-0">
              <motion.span 
                className="size-1 bg-muted-foreground rounded-full"
                animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.span 
                className="size-1 bg-muted-foreground rounded-full"
                animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut", delay: 0.15 }}
              />
              <motion.span 
                className="size-1 bg-muted-foreground rounded-full"
                animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
              />
            </span>
          )}
          
          <motion.div
            animate={{ rotate: isExpanded ? 0 : -90 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <ChevronDown 
              className="size-4 text-muted-foreground/50 shrink-0"
            />
          </motion.div>
        </motion.button>}
        
        {/* Expanded content with smooth height animation */}
        <AnimatePresence>
          {isExpanded && content && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-0">
                <motion.div 
                  ref={contentRef}
                  className="text-sm leading-relaxed max-h-[300px] overflow-y-auto"
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2, delay: 0.05 }}
                >
                  <FormattedThinkingContent 
                    content={content} 
                    searchResults={allSearchResults}
                  />
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* Search Results Sidebar */}
      <SearchResultsSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        results={allSearchResults}
      />
    </motion.div>
  )
}


interface MessageListProps {
  messages: Message[]
  isLoading?: boolean
  isStreaming?: boolean
  streamingContent?: string
  streamingMessageId?: string
  thinkingContent?: string
  isThinking?: boolean
  hasMoreMessages?: boolean
  isLoadingMore?: boolean
  onLoadMore?: () => void
  aiName?: string
  executingTool?: { name: string; type: 'create' | 'modify' | 'delete' | 'report' | 'search' } | null
  aiState?: { state: AIState; context?: string; metadata?: AIStateMetadata; startTime?: number } | null
  activitySteps?: ActivityStep[]
  shouldShowThinking?: boolean
  onIntegrationConnected?: (connectorId: string, connectorName: string) => void
  workspaceId?: string
}

export function MessageList({ 
  messages, 
  isLoading,
  isStreaming, 
  streamingContent,
  streamingMessageId,
  thinkingContent = '',
  isThinking = false,
  hasMoreMessages = false,
  isLoadingMore = false,
  onLoadMore,
  aiName = '2Hands',
  executingTool = null,
  aiState = null,
  activitySteps = [],
  shouldShowThinking = true,
  onIntegrationConnected,
  workspaceId,
}: MessageListProps) {
  const displayMessages = useMemo(() => {
    const seen = new Set<string>()
    return messages.filter(m => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      // Never show system-role messages — they are AI context, not user-facing
      if (m.role === 'system') return false
      // Never show delivered reminder bubbles — the AI responds to them silently
      const meta = m.metadata as { type?: string } | null
      if (meta?.type === 'reminder_delivered') return false
      return true
    })
  }, [messages])

  const isBusy = isLoading || isStreaming || !!streamingContent || !!streamingMessageId || !!executingTool

  // Filter activity steps to only show meaningful ones (search/browse/plan or non-generic work labels)
  const meaningfulActivitySteps = useMemo(() => {
    return activitySteps.filter(step => {
      if (step.kind === 'search' || step.kind === 'browse' || step.kind === 'plan') return true
      const label = (step.label || '').trim()
      if (!label || label.length <= 3) return false
      // Filter out generic placeholder labels
      const isGeneric = /^(Processing|Working on agent|Thinking|Understanding request|Starting|Initializing|Analyzing\s*\.+|Running:)[\.…]*/i.test(label)
      return !isGeneric
    })
  }, [activitySteps])
  
  const topRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const prevScrollHeightRef = useRef<number>(0)
  const lastMessageIdRef = useRef<string | null>(null)
  const isInitialLoadRef = useRef(true)
  const isLoadingMoreRef = useRef(false)
  const isAutoScrollEnabledRef = useRef(true)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [canScroll, setCanScroll] = useState(false)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    if (scrollContainerRef.current) {
      const { scrollHeight, clientHeight } = scrollContainerRef.current
      scrollContainerRef.current.scrollTo({
        top: scrollHeight - clientHeight,
        behavior
      })
      isAutoScrollEnabledRef.current = true
    }
  }, [])

  // Handle initial load and new messages
  useLayoutEffect(() => {
    if (displayMessages.length === 0) return
    
    const lastMessage = displayMessages[displayMessages.length - 1]
    const lastMessageId = lastMessage?.id
    
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false
      lastMessageIdRef.current = lastMessageId
      // Double rAF + fallback to ensure DOM is fully rendered after hydration
      scrollToBottom('auto')
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToBottom('auto')
        })
      })
      // Fallback for slow renders (images, markdown, etc.)
      setTimeout(() => scrollToBottom('auto'), 100)
      setTimeout(() => scrollToBottom('auto'), 300)
      return
    }
    
    if (lastMessageId !== lastMessageIdRef.current) {
      lastMessageIdRef.current = lastMessageId
      if (lastMessage.role === 'user') {
        scrollToBottom('auto')
      } else if (isAutoScrollEnabledRef.current) {
        scrollToBottom('auto')
      }
    }
  }, [displayMessages, scrollToBottom])
  
  // ChatGPT-style Stick to Bottom logic
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const distanceToBottom = scrollHeight - scrollTop - clientHeight
      const hasScrollableContent = scrollHeight > clientHeight + 10
      
      setCanScroll(hasScrollableContent)
      
      // If user scrolls up significantly (> 100px from bottom), disable auto-scroll
      if (distanceToBottom > 100) {
        if (isAutoScrollEnabledRef.current) {
          isAutoScrollEnabledRef.current = false
        }
        setShowScrollButton(true)
      } 
      // If user scrolls back near bottom (< 30px), re-enable auto-scroll
      else if (distanceToBottom < 30) {
        if (!isAutoScrollEnabledRef.current) {
          isAutoScrollEnabledRef.current = true
        }
        setShowScrollButton(false)
      }
    }

    const performAnchoring = () => {
      if (isBusy && isAutoScrollEnabledRef.current) {
        container.scrollTop = container.scrollHeight - container.clientHeight
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    
    const observer = new MutationObserver(() => {
      if (isAutoScrollEnabledRef.current) {
        performAnchoring()
      }
    })

    observer.observe(container, {
      childList: true,
      subtree: true,
      // characterData intentionally omitted: watching every text-node mutation during
      // streaming causes scroll churn at 60fps. Layout changes from new elements are enough.
    })
    
    // Also perform initial check
    performAnchoring()
    
    return () => {
      container.removeEventListener('scroll', handleScroll)
      observer.disconnect()
    }
  }, [isBusy])

  // Maintain scroll position after prepending messages (infinite scroll up)
  // useLayoutEffect runs before browser paint, preventing visual flicker
  useLayoutEffect(() => {
    if (scrollContainerRef.current && prevScrollHeightRef.current > 0) {
      const newScrollHeight = scrollContainerRef.current.scrollHeight
      const scrollDiff = newScrollHeight - prevScrollHeightRef.current
      if (scrollDiff > 0) {
        scrollContainerRef.current.scrollTop += scrollDiff
      }
      prevScrollHeightRef.current = 0
    }
  }, [messages])

  // Sync ref with state for immediate checks
  useEffect(() => {
    isLoadingMoreRef.current = isLoadingMore
  }, [isLoadingMore])

  // Scroll anchoring during streaming — replaces characterData MutationObserver watching.
  // Fires at the same cadence as streaming flushes (~30fps via rAF) without observing
  // every individual text-node mutation.
  useEffect(() => {
    if (!isStreaming || !isAutoScrollEnabledRef.current || !scrollContainerRef.current) return
    const container = scrollContainerRef.current
    container.scrollTop = container.scrollHeight - container.clientHeight
  }, [streamingContent, isStreaming])

  // Intersection observer for infinite scroll up
  useEffect(() => {
    if (!topRef.current || !hasMoreMessages || !onLoadMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        // Only trigger if not already loading
        if (entries[0].isIntersecting && hasMoreMessages && !isLoadingMoreRef.current && !isLoadingMore) {
          isLoadingMoreRef.current = true
          if (scrollContainerRef.current) {
            prevScrollHeightRef.current = scrollContainerRef.current.scrollHeight
          }
          onLoadMore()
        }
      },
      { threshold: 0, root: scrollContainerRef.current, rootMargin: '400px 0px 0px 0px' }
    )

    observer.observe(topRef.current)
    return () => observer.disconnect()
  }, [hasMoreMessages, onLoadMore, isLoadingMore])

  // Show skeleton only when truly empty (no messages, not streaming, not loading, no streaming content)
  const hasStreamingContent = !!streamingContent || !!thinkingContent || activitySteps.length > 0
  if (displayMessages.length === 0 && !isStreaming && !isLoading && !hasStreamingContent) {
    return (
      <div className="flex-1 h-full overflow-y-auto overflow-x-hidden relative">
        <div className="w-full max-w-[850px] mx-auto px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8 space-y-8 pb-32" style={{ maxWidth: '850px' }}>
          <div className="flex flex-col w-full items-start">
            <div className="max-w-[85%] sm:max-w-[80%] px-0 py-1 space-y-3">
              <div className="h-5 bg-muted rounded w-64 animate-pulse" />
              <div className="h-5 bg-muted rounded w-48 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div 
      ref={scrollContainerRef} 
      className="flex-1 h-full overflow-y-auto overflow-x-hidden relative"
      style={{ overflowAnchor: 'none', scrollBehavior: 'auto' }}
    >
      <div className="w-full max-w-[850px] mx-auto px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8 space-y-5 pb-24" style={{ maxWidth: '850px' }}>
          <div ref={topRef} className="h-2 w-full flex-shrink-0" />
        
        {isLoadingMore && (
          <div className="flex items-center justify-center py-3">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        )}
        
        <AnimatePresence initial={false}>
          {displayMessages.map((message, index) => {
            const prevMessage = displayMessages[index - 1]
            const nextMessage = displayMessages[index + 1]
            const isFirstInGroup = !prevMessage || prevMessage.role !== message.role
            const isLastInGroup = !nextMessage || nextMessage.role !== message.role
            const isLastMessage = index === displayMessages.length - 1
            const isThisStreaming = !!streamingMessageId && message.id === streamingMessageId
            const msgMeta = message.metadata as { type?: string; status?: string; started_at?: string } | null
            const isManagerTurnRunning = isThisStreaming &&
              msgMeta?.type === 'manager_turn' &&
              msgMeta?.status !== 'failed' &&
              !message.content?.trim()

            return (
              <div 
                key={`${message.id}-${index}`}
                data-role={message.role}
                className={cn(
                  "relative",
                  !isFirstInGroup ? "mt-0.5" : index > 0 ? "mt-5" : "",
                  isLastInGroup && "mb-1"
                )}
              >
                {/* ThinkingDisplay injects above the streaming message while it's active */}
                {isThisStreaming && (meaningfulActivitySteps.length > 0 || thinkingContent.replace(/\s/g, '').length > 15) && (
                  <div className="py-2 px-0 sm:px-2">
                    <ThinkingDisplay
                      content={thinkingContent}
                      isStreaming={isThinking}
                      activitySteps={activitySteps}
                    />
                  </div>
                )}
                {/* ThinkingDisplay for COMPLETED messages — reads from persisted metadata */}
                {!isThisStreaming && message.role !== 'user' && (() => {
                  const meta = message.metadata as { thinking_content?: string; activity_trace_v2?: ActivityStep[]; activity_trace?: ActivityStep[] } | null
                  const storedThinking = meta?.thinking_content || ''
                  const storedSteps = meta?.activity_trace_v2 || meta?.activity_trace || []
                  const hasMeaningfulStored = storedSteps.some(s =>
                    s.kind === 'search' || s.kind === 'browse' || s.kind === 'tool' || s.kind === 'plan' ||
                    (s.label && !s.label.match(/^(Processing|Working|Thinking|Understanding|Starting|Initializing|Analyzing)[.…]*/i))
                  )
                  if (storedThinking.replace(/\s/g, '').length > 15 || hasMeaningfulStored) {
                    return (
                      <div className="py-2 px-0 sm:px-2">
                        <ThinkingDisplay
                          content={storedThinking}
                          isStreaming={false}
                          activitySteps={storedSteps}
                        />
                      </div>
                    )
                  }
                  return null
                })()}
                {/* Compact progress for manager_turn:running before any thinking content arrives */}
                {isManagerTurnRunning && meaningfulActivitySteps.length === 0 && thinkingContent.replace(/\s/g, '').length <= 15 && (
                  <div className="flex items-start py-2 px-0 sm:px-2">
                    <CompactProgressDots steps={activitySteps} />
                  </div>
                )}
                {/* Skip MessageBubble body for the running placeholder — ThinkingDisplay/dots above handle it */}
                {!isManagerTurnRunning && (
                  <MessageBubble 
                    message={message} 
                    isStreaming={isThisStreaming}
                    streamingText={isThisStreaming ? streamingContent : undefined}
                    isFirstInGroup={isFirstInGroup}
                    isLastInGroup={isLastInGroup}
                    isLastMessage={isLastMessage}
                    aiName={aiName}
                    onIntegrationConnected={onIntegrationConnected}
                    workspaceId={workspaceId}
                  />
                )}
              </div>
            )
          })}
          
          {/* Loading indicator - shows from send until first streaming content or thinking */}
          {(isLoading || (isStreaming && !streamingMessageId && meaningfulActivitySteps.length === 0 && thinkingContent.replace(/\s/g, '').length <= 15)) && (
            <motion.div
              key="loading-indicator"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex items-start py-2 px-0 sm:px-2"
            >
              <CompactProgressDots steps={activitySteps} />
            </motion.div>
          )}

          {/* ThinkingDisplay - pre-message phase: shown only before streaming message enters the store AND only when there is no active streaming message already showing the same panel inline */}
          {isStreaming && !streamingMessageId && (meaningfulActivitySteps.length > 0 || thinkingContent.replace(/\s/g, '').length > 15) && (
            <motion.div
              key="pre-text-thinking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="py-2 px-0 sm:px-2">
                <ThinkingDisplay
                  content={thinkingContent}
                  isStreaming={isThinking}
                  activitySteps={activitySteps}
                />
              </div>
            </motion.div>
          )}

          {/* Tool executing indicator */}
          {isStreaming && executingTool && (
            <motion.div
              key="executing-tool-indicator"
              initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(8px)" }}
              className="flex items-start gap-3 py-3 px-0 sm:px-2"
            >
              <div className="flex items-center gap-4 px-5 py-4 bg-card/50 backdrop-blur-sm rounded-2xl border border-border shadow-[0px_4px_20px_0px_rgba(0,0,0,0.03)] dark:shadow-[0px_8px_30px_0px_rgba(0,0,0,0.3)] min-w-[280px]">
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                    {executingTool.type === 'create' && <Cpu size={20} className="text-primary-foreground" />}
                    {executingTool.type === 'modify' && <Settings size={20} className="text-primary-foreground" />}
                    {executingTool.type === 'delete' && <Trash2 size={20} className="text-primary-foreground" />}
                    {executingTool.type === 'report' && <FileText size={20} className="text-primary-foreground" />}
                    {executingTool.type === 'search' && <Sparkles size={20} className="text-primary-foreground" />}
                  </div>
                  <motion.div
                    className="absolute -inset-1 rounded-[14px] border border-foreground/10"
                    animate={{ scale: [1, 1.05, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  />
                </div>
                
                <div className="flex flex-col flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium text-foreground truncate">
                      {executingTool.name}
                    </span>
                    <Loader2 size={12} className="text-muted-foreground animate-spin" />
                  </div>
                  <span className="text-[12px] text-muted-foreground font-medium mt-0.5">
                    {executingTool.type === 'create' && 'Provisioning autonomous agent...'}
                    {executingTool.type === 'modify' && 'Updating configurations...'}
                    {executingTool.type === 'delete' && 'Decommissioning resources...'}
                    {executingTool.type === 'report' && 'Analyzing data & generating insights...'}
                    {executingTool.type === 'search' && 'Searching web for real-time data...'}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

interface MessageBubbleProps {
  message: Message
  isStreaming?: boolean
  streamingText?: string
  isFirstInGroup?: boolean
  isLastInGroup?: boolean
  isLastMessage?: boolean
  aiName?: string
  onIntegrationConnected?: (connectorId: string, connectorName: string) => void
  workspaceId?: string
}

// Memoized message bubble to prevent unnecessary re-renders
const MessageBubble = memo(function MessageBubble({ 
  message, 
  isStreaming,
  streamingText,
  isFirstInGroup = true,
  isLastInGroup = true,
  isLastMessage = false,
  aiName = '2Hands',
  onIntegrationConnected,
  workspaceId,
}: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const messageType = (message.metadata as { type?: string } | null)?.type
  const [copied, setCopied] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null)

  // Display content directly — streaming already provides real-time text updates
  // Strip thinking placeholder text and action narration from AI messages — ThinkingDisplay handles that
  const displayContent = (() => {
    if (isUser) return message.content
    // During live streaming, skip all normalization — StreamingMessage handles the live display
    if (isStreaming && streamingText !== undefined) return streamingText
    const c = (message.content || '').trim()
    if (!c) return ''
    // If entire content is just a thinking placeholder, hide it entirely
    if (/^(Thinking|Analyzing|Working|Processing)[.…]*$/i.test(c)) return ''

    // Remediate $2 garbling artifacts: these appear when old code had a broken regex
    // that produced literal "$2" between every character. Strip them to restore readable text.
    const degarbled = c.replace(/\. \$2/g, '').replace(/\$2/g, '')
    const c2 = degarbled !== c ? degarbled : c

    // Normalize adjacent bold blocks that run together with no space
    // e.g. "**Title:****Body.**" → "**Title:** **Body.**"
    let normalized = c2.replace(/\*\*(\s*)\*\*/g, '** **').replace(/\*\*\s+\*\*/g, '** **')
    // Fix "**text:****more**" pattern — closing ** immediately followed by opening **
    normalized = normalized.replace(/(\*\*[^*]+\*\*)(\*\*)/g, (_, a, b) => `${a} ${b}`)
    // Fix sentence-boundary spacing: "sentence.Next" → "sentence. Next"
    normalized = normalized.replace(/([a-z0-9\]])\.([A-Z])/g, (_, a, b) => `${a}. ${b}`)
    // Fix colon spacing: "word:Capital" → "word: Capital" — skip URL schemes (http: https: ftp:)
    normalized = normalized.replace(/\b(?!https?:|ftp:)([a-z]+)(:)([A-Z])/g, (_, a, b, c) => `${a}${b} ${c}`)

    // Strip lines that are pure action narration (not user-facing information)
    const NARRATION_LINE = /^(\*{0,2})(Testing\s+[\w\s]+(connection|live|now)[^a-z]*|Connecting[\s\w]*[:.…]*|Verifying[\s\w]*[:.…]*|Setting up integration[:.…]*|Checking [\w\s]+ connection[:.…]*|Running:\s+.+|The credential card is now showing[^.]*\.?|Let me show you the credential card[^.]*\.?|I[''']ll test it[^.]*\.?|Testing connection now[:.…]*)(\*{0,2})\s*$/i
    // Additional: strip broader intention/diagnosis narration that belongs in Think, not the final message.
    // Safe guard: keep lines that contain concrete result evidence (HTTP codes, record IDs, URLs, outcomes).
    const HAS_RESULT = /\b(http [2-5]\d{2}|record_id|✅|❌|failed[: ]|error[: ]|success[: ]|created[: ]|updated[: ]|deleted|found \d|\d+ record|\bhttps?:\/\/)/i
    const INTENTION_LINE = /^(let me (check|try|use|search|look|call|inspect|find|create|get|run|update|fix|retry|see|verify|test|now|approach|format|think|review|re|first|also)\b|i'?'?ll (now |try |use |check |call |create |run |search |look |update |fix |retry |format |approach |re|also |first )|i will (now |try |use |check |call |create |run |search |look |update |fix |retry |format |approach )|i need to |i'm going to |the issue is |the problem is |the root cause |based on the error|this means |it seems |looking at this|i can see that )/i
    // Also strip "card:" prefix lines (AI accidentally outputs "card:Result text" which is garbled)
    const CARD_PREFIX = /^card:\s*/i
    const lines = normalized.split('\n')
    const filtered = lines
      .map(line => line.replace(CARD_PREFIX, ''))
      .filter(line => {
        const t = line.trim()
        if (!t) return true
        if (HAS_RESULT.test(t)) return true // always keep lines with concrete evidence
        if (NARRATION_LINE.test(t)) return false
        if (INTENTION_LINE.test(t)) return false
        return true
      })
    // Collapse 3+ consecutive blank lines to 2
    const collapsed = filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim()

    // Strip thinking placeholder prefix if followed by real content
    const stripped = collapsed.replace(/^(Thinking|Analyzing|Working|Processing)[.…]+\s*/i, '').trim()
    return stripped || message.content
  })()

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
    }
  }, [message.content])

  const handleSpeak = useCallback(() => {
    if (isSpeaking) {
      window.speechSynthesis.cancel()
      setIsSpeaking(false)
      return
    }
    const utterance = new SpeechSynthesisUtterance(message.content)
    utterance.rate = 1
    utterance.pitch = 1
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    speechRef.current = utterance
    window.speechSynthesis.speak(utterance)
    setIsSpeaking(true)
  }, [message.content, isSpeaking])

  const handleShare = useCallback(async () => {
    const shareData = { title: `${aiName} response`, text: message.content }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
      } else {
        await navigator.clipboard.writeText(message.content)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      // User cancelled share
    }
  }, [message.content, aiName])

  return (
    <motion.div
      initial={isFirstInGroup ? messageVariants.initial : { opacity: 1 }}
      animate={messageVariants.animate}
      transition={isFirstInGroup ? messageVariants.transition : { duration: 0.15 }}
      className={cn('flex flex-col w-full group', isUser ? 'items-end' : 'items-start')}
    >
      <div className={cn(
        // AI messages: fixed max width for optimal reading (prose = 65ch ≈ 560px, 3xl = 768px)
        // User messages: bubble style with smaller max width
        "relative",
        isUser 
          ? cn(
              // User messages: beige background for contrast against white page
              "w-fit max-w-[85%] sm:max-w-[75%]",
              "px-4 py-3 bg-secondary border border-border rounded-xl"
            )
          : "w-full max-w-none px-0 py-0 bg-transparent text-foreground"
      )}>
        {messageType === 'integration_setup' && !isUser ? (
          <IntegrationSetupCard
            connectorId={(message.metadata as unknown as { connector_id: string }).connector_id}
            connectorName={(message.metadata as unknown as { connector_name: string }).connector_name}
            fields={(message.metadata as unknown as { fields: ConnectorField[] }).fields}
            workspaceId={workspaceId}
            onComplete={(success) => {
              if (success) {
                const cid = (message.metadata as unknown as { connector_id: string }).connector_id
                const cname = (message.metadata as unknown as { connector_name: string }).connector_name
                onIntegrationConnected?.(cid, cname)
              }
            }}
          />
        ) : messageType === 'mission_proposal' && !isUser ? (
          <MissionProposalCard proposal={(message.metadata as unknown as { proposal: MissionProposal }).proposal} />
        ) : messageType === 'mission_started' && !isUser ? (
          <MissionStartedCard mission={(message.metadata as unknown as { mission: MissionStarted }).mission} />
        ) : messageType === 'mission_progress' && !isUser ? (
          <MissionProgressCard
            progress={message.metadata as unknown as MissionProgress}
            content={message.content}
          />
        ) : messageType === 'agent_handoff' && !isUser ? (() => {
          const hMeta = message.metadata as { agentName?: string; status?: string; scheduleType?: string } | null
          const hName = hMeta?.agentName || 'Agent'
          const hStatus = hMeta?.status || 'queued'
          const isHDone = hStatus === 'completed'
          const isHFailed = hStatus === 'failed'
          const statusLabel = isHDone ? 'Completed' : isHFailed ? 'Failed' : hStatus === 'working' ? 'Working' : 'Queued'
          const statusColor = isHDone ? 'text-emerald-500' : isHFailed ? 'text-red-400' : 'text-[#C4A484]'
          return (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-border/50 bg-card/30 max-w-[420px]">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Cpu size={14} className="text-primary/70" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-foreground/90 truncate">{hName}</span>
                  <span className={cn("text-[11px] font-medium", statusColor)}>{statusLabel}</span>
                  {!isHDone && !isHFailed && (
                    <Loader2 size={10} className="text-muted-foreground/50 animate-spin" />
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground/60">Runs in background — you can close the app</span>
              </div>
            </div>
          )
        })()
        : messageType === 'manager_turn' && !isUser && (!message.content?.trim() || /^(Thinking|Analyzing|Working|Processing)[\u2026\.]{0,3}$/i.test(message.content.trim())) ? (() => {
          const mtMeta = message.metadata as { status?: string; started_at?: string; thinking_content?: string; activity_trace_v2?: unknown[]; activity_trace?: unknown[]; setup_card?: unknown } | null
          const mtStatus = mtMeta?.status || 'running'
          const mtHasMetadata = !!(mtMeta?.thinking_content || (mtMeta?.activity_trace_v2 && (mtMeta.activity_trace_v2 as unknown[]).length > 0) || (mtMeta?.activity_trace && (mtMeta.activity_trace as unknown[]).length > 0) || mtMeta?.setup_card)
          if (mtStatus === 'completed' && mtHasMetadata) {
            return null
          }
          return (
            <ManagerTurnCard
              status={mtStatus}
              startedAt={mtMeta?.started_at}
              hasMetadata={mtHasMetadata}
            />
          )
        })()
        : messageType === 'agent_finding' && !isUser ? (
          <AgentFindingCard
            agentName={(message.metadata as unknown as { agent_name?: string }).agent_name || 'Agent'}
            content={message.content}
          />
        ) : messageType === 'error' && !isUser ? (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/5 max-w-[560px]">
            <div className="p-1.5 rounded-lg bg-red-500/15 shrink-0 mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
            </div>
            <p className="text-[13px] text-red-600 dark:text-red-400 leading-relaxed">{message.content}</p>
          </div>
        ) : (
          <>
            {(() => {
              const metadata = message.metadata as { tool_calls?: Array<{ name: string }> } | null
              if (metadata?.tool_calls && isStreaming) {
                return (
                  <div className="space-y-2 mb-4">
                    {metadata.tool_calls.map((tool, i: number) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 bg-foreground/5 rounded-xl border border-border">
                        <div className="w-5 h-5 rounded-lg bg-primary/15 flex items-center justify-center">
                          <TwoHandsLoader size="sm" />
                        </div>
                        <span className="text-xs font-mono font-medium text-foreground/60 uppercase tracking-widest">
                          Executing: {tool.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              }
              return null
            })()}

            {isUser ? (
              // User messages: image attachments (if any) then text
              <div className="text-card-foreground">
                {(() => {
                  const attachments = (message.metadata as { attachments?: Array<{ base64: string; mediaType: string; name: string }> } | null)?.attachments
                  if (!attachments || attachments.length === 0) return null
                  return (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {attachments.map((att, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={`data:${att.mediaType};base64,${att.base64}`}
                          alt={att.name}
                          className="rounded-lg object-cover w-[80px] h-[80px] border border-border"
                        />
                      ))}
                    </div>
                  )
                })()}
                {message.content && message.content !== '[Image]' && (
                  <p className="text-base whitespace-pre-wrap break-words select-text leading-relaxed">
                    {message.content}
                  </p>
                )}
                {(!message.content || message.content === '[Image]') && !(message.metadata as { attachments?: unknown[] } | null)?.attachments?.length && (
                  <p className="text-base whitespace-pre-wrap break-words select-text leading-relaxed">
                    {message.content}
                  </p>
                )}
              </div>
            ) : (displayContent || (isStreaming && streamingText)) ? (
              // AI messages: lightweight StreamingMessage while streaming, full ReactMarkdown when done
              <div className={cn(
                "text-[16px] leading-[1.7] max-w-none",
                !isStreaming && [
                  "prose prose-sm dark:prose-invert",
                  // Tighter paragraph gaps so short status lines read as a scannable list, not a wall
                  "prose-p:my-2 prose-p:first:mt-0 prose-p:last:mb-0",
                  "prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5",
                  "prose-strong:font-semibold prose-strong:text-card-foreground",
                  "prose-headings:font-semibold prose-headings:text-card-foreground prose-headings:my-4",
                  "prose-h3:text-lg prose-h3:font-semibold prose-h3:mt-6 prose-h3:mb-3",
                  "prose-blockquote:border-0 prose-blockquote:pl-0 prose-blockquote:not-italic prose-blockquote:font-normal prose-blockquote:text-card-foreground prose-blockquote:bg-transparent prose-blockquote:my-2",
                  "prose-table:w-full prose-table:border-collapse prose-table:my-4",
                  "prose-thead:border-b prose-thead:border-border",
                  "prose-th:border-0 prose-th:p-3 prose-th:text-left prose-th:font-semibold prose-th:text-sm prose-th:text-card-foreground",
                  "prose-td:border-0 prose-td:p-3 prose-td:text-sm prose-td:text-card-foreground",
                  "prose-tr:border-b prose-tr:border-border last:prose-tr:border-0",
                  "prose-tr:even:bg-muted/30 prose-tr:hover:bg-muted/50",
                  "prose-code:text-card-foreground prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm",
                  "prose-pre:bg-transparent prose-pre:p-0",
                ],
                "text-card-foreground"
              )}>
                {isStreaming && streamingText !== undefined ? (
                  <StreamingMessage text={streamingText} />
                ) : (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      blockquote: ({ children }) => (
                        <div>{children}</div>
                      ),
                      table: ({ children }) => (
                        <MarkdownTable>
                          <table className="w-full">{children}</table>
                        </MarkdownTable>
                      )
                    }}
                  >
                    {displayContent}
                  </ReactMarkdown>
                )}
              </div>
            ) : null}

            {/* Inline setup card — attached to text message, renders after content */}
            {!isUser && !isStreaming && (() => {
              const card = (message.metadata as { setup_card?: { connector_id: string; connector_name: string; fields: ConnectorField[]; logo_url?: string | null } } | null)?.setup_card
              if (!card) return null
              return (
                <IntegrationSetupCard
                  connectorId={card.connector_id}
                  connectorName={card.connector_name}
                  fields={card.fields}
                  logoUrl={card.logo_url ?? undefined}
                  workspaceId={workspaceId}
                  onComplete={(success) => {
                    if (success) onIntegrationConnected?.(card.connector_id, card.connector_name)
                  }}
                />
              )
            })()}

          </>
        )}
      </div>
      
      {/* Actions for user messages - show on hover (outside bubble) */}
      {isUser && !isStreaming && (
        <div className={cn(
          "mt-2 transition-opacity duration-200 flex justify-end opacity-0 group-hover:opacity-100"
        )}>
          <Actions>
            <Action 
              onClick={handleCopy} 
              tooltip={copied ? "Copied!" : "Copy to clipboard"}
              label={copied ? "Copied" : "Copy"}
              className={copied ? "text-green-500" : ""}
            >
              {copied ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" role="img" width="16" height="16" viewBox="0 0 1024 1024" className="iconify"><path d="M725.333333 302.933333a166.4 166.4 0 0 1 166.4 166.4v256a166.4 166.4 0 0 1-166.4 166.4h-256A166.4 166.4 0 0 1 302.933333 725.333333v-256A166.4 166.4 0 0 1 469.333333 302.933333h256z m-256 76.8A89.6 89.6 0 0 0 379.733333 469.333333v256c0 49.493333 40.106667 89.6 89.6 89.6h256a89.6 89.6 0 0 0 89.6-89.6v-256A89.6 89.6 0 0 0 725.333333 379.733333h-256z" fill="currentColor"></path><path d="M554.666667 132.266667a166.4 166.4 0 0 1 144.128 83.2 38.4 38.4 0 0 1-66.517334 38.4A89.514667 89.514667 0 0 0 554.666667 209.066667H298.666667A89.6 89.6 0 0 0 209.066667 298.666667v256c0 33.109333 17.92 62.08 44.8 77.653333a38.4 38.4 0 0 1-38.4 66.474667A166.4 166.4 0 0 1 132.266667 554.666667V298.666667A166.4 166.4 0 0 1 298.666667 132.266667h256z" fill="currentColor"></path></svg>
              )}
            </Action>
            <Action 
              onClick={handleShare} 
              tooltip="Share"
              label="Share"
            >
              <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" role="img" width="16" height="16" viewBox="0 0 1024 1024" className="iconify"><path d="M386.218667 247.850667c0-102.4 120.405333-157.397333 197.76-90.282667l304.426666 264.32a119.466667 119.466667 0 0 1 1.365334 179.285333l-304.469334 272.170667c-76.970667 68.778667-199.082667 14.122667-199.082666-89.088v-89.173333c-33.024 2.261333-59.306667 6.826667-83.2 15.36-30.592 10.88-61.866667 29.952-98.602667 67.712a76.8 76.8 0 0 1-131.84-53.504c0-98.645333 24.106667-190.976 83.712-261.888 55.253333-65.792 133.973333-104.789333 229.930667-117.845334V247.850667z m147.413333-32.256c-27.648-23.978667-70.613333-4.352-70.613333 32.256v126.208l-0.256 4.309333c-2.218667 21.504-20.437333 38.186667-42.410667 40.021333l-17.194667 1.706667c-173.994667 20.949333-253.824 136.405333-253.824 304.554667 86.997333-89.557333 163.925333-105.386667 270.933334-107.861334a42.026667 42.026667 0 0 1 42.752 42.24v125.226667c0 34.56 38.272 53.845333 65.706666 35.925333l5.376-4.096 304.426667-272.213333a42.666667 42.666667 0 0 0 2.986667-60.714667l-3.413334-3.285333-304.469333-264.277333z" fill="currentColor"></path></svg>
            </Action>
          </Actions>
        </div>
      )}

      {/* Memory chips for AI messages */}
      {!isUser && !isStreaming && (() => {
        const memLabels = (message.metadata as { memory_labels?: Array<{ type: string; label: string }> } | null)?.memory_labels
        if (!memLabels || memLabels.length === 0) return null
        return (
          <div className="flex items-center gap-1.5 mt-1 px-0.5 flex-wrap">
            <Brain size={11} className="text-muted-foreground/40 shrink-0" />
            {memLabels.map((m, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/8 text-primary/60 border border-primary/10 select-none">
                {m.label}
              </span>
            ))}
          </div>
        )
      })()}


      {/* Actions for AI messages - always show for last message, hover for others */}
      {!isUser && !isStreaming && displayContent && messageType !== 'thinking' && messageType !== 'integration_setup' && (
        <div className={cn(
          "transition-opacity duration-200 flex items-center gap-1",
          isLastMessage ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}>
          <Actions>
            <Action 
              onClick={handleCopy} 
              tooltip={copied ? "Copied!" : "Copy to clipboard"}
              label={copied ? "Copied" : "Copy"}
              className={copied ? "text-green-500" : ""}
            >
              {copied ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" role="img" width="16" height="16" viewBox="0 0 1024 1024" className="iconify"><path d="M725.333333 302.933333a166.4 166.4 0 0 1 166.4 166.4v256a166.4 166.4 0 0 1-166.4 166.4h-256A166.4 166.4 0 0 1 302.933333 725.333333v-256A166.4 166.4 0 0 1 469.333333 302.933333h256z m-256 76.8A89.6 89.6 0 0 0 379.733333 469.333333v256c0 49.493333 40.106667 89.6 89.6 89.6h256a89.6 89.6 0 0 0 89.6-89.6v-256A89.6 89.6 0 0 0 725.333333 379.733333h-256z" fill="currentColor"></path><path d="M554.666667 132.266667a166.4 166.4 0 0 1 144.128 83.2 38.4 38.4 0 0 1-66.517334 38.4A89.514667 89.514667 0 0 0 554.666667 209.066667H298.666667A89.6 89.6 0 0 0 209.066667 298.666667v256c0 33.109333 17.92 62.08 44.8 77.653333a38.4 38.4 0 0 1-38.4 66.474667A166.4 166.4 0 0 1 132.266667 554.666667V298.666667A166.4 166.4 0 0 1 298.666667 132.266667h256z" fill="currentColor"></path></svg>
              )}
            </Action>
            <Action 
              onClick={handleSpeak} 
              tooltip={isSpeaking ? "Stop speaking" : "Read aloud"}
              label={isSpeaking ? "Stop speaking" : "Read aloud"}
              className={isSpeaking ? "text-primary" : ""}
            >
              {isSpeaking ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </Action>
            <Action 
              onClick={handleShare} 
              tooltip="Share"
              label="Share"
            >
              <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" role="img" width="16" height="16" viewBox="0 0 1024 1024" className="iconify"><path d="M386.218667 247.850667c0-102.4 120.405333-157.397333 197.76-90.282667l304.426666 264.32a119.466667 119.466667 0 0 1 1.365334 179.285333l-304.469334 272.170667c-76.970667 68.778667-199.082667 14.122667-199.082666-89.088v-89.173333c-33.024 2.261333-59.306667 6.826667-83.2 15.36-30.592 10.88-61.866667 29.952-98.602667 67.712a76.8 76.8 0 0 1-131.84-53.504c0-98.645333 24.106667-190.976 83.712-261.888 55.253333-65.792 133.973333-104.789333 229.930667-117.845334V247.850667z m147.413333-32.256c-27.648-23.978667-70.613333-4.352-70.613333 32.256v126.208l-0.256 4.309333c-2.218667 21.504-20.437333 38.186667-42.410667 40.021333l-17.194667 1.706667c-173.994667 20.949333-253.824 136.405333-253.824 304.554667 86.997333-89.557333 163.925333-105.386667 270.933334-107.861334a42.026667 42.026667 0 0 1 42.752 42.24v125.226667c0 34.56 38.272 53.845333 65.706666 35.925333l5.376-4.096 304.426667-272.213333a42.666667 42.666667 0 0 0 2.986667-60.714667l-3.413334-3.285333-304.469333-264.277333z" fill="currentColor"></path></svg>
            </Action>
          </Actions>
          {/* References display - inline with actions — prefer v2 trace */}
          {(() => {
            const meta = message.metadata as { activity_trace_v2?: ActivityStep[]; activity_trace?: ActivityStep[] } | null
            const trace = meta?.activity_trace_v2 || meta?.activity_trace
            if (trace && trace.length > 0) {
              return <References steps={trace} />
            }
            return null
          })()}
        </div>
      )}
    </motion.div>
  )
})
