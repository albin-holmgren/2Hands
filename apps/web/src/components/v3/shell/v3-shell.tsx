'use client'

/**
 * v3 voice-first conversation shell (UX.md §2–§4, IMPLEMENTATION_MAP Slices
 * 1 + 7).
 *
 * One minimal screen: marketplace control top-left, account/usage top-right,
 * a compact orb centered in the header once a conversation is active, the
 * hero EmptyState otherwise, an 800px conversation column, and the glass
 * Composer pinned to the bottom (safe-area aware).
 *
 * The conversation is wired to REAL v3 task streams: sending a goal creates
 * a durable task (POST /api/tasks) and the shell renders the append-only
 * safe event stream via cursor polling (use-task-stream). When the Demo
 * Computer is enabled and the goal mentions "fix" (or via the dev-only
 * golden-path button), the demo pipeline runs end to end: fixture computer →
 * run-demo-pipeline → exact publication approval → approve → exactly-once
 * draft PR + receipt. Everything demo is labeled Demo; nothing external
 * happens without the exact approval.
 */

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PlayIcon, Volume2, VolumeX } from 'lucide-react'
import type { OrbState } from '@2hands/types/v3'

import { useAuth } from '@/hooks/use-auth'
import { useWorkspaceStore } from '@/store/workspace-store'
import { cn } from '@/lib/utils'
import { Orb } from '@/components/v3/orb/orb'
import { Composer } from '@/components/v3/composer/composer'
import { EmptyState } from '@/components/v3/empty-state'
import { AccountButton, MarketplaceButton } from '@/components/v3/marketplace/marketplace-button'
import {
  MarketplaceSheet,
  type ProviderRow,
} from '@/components/v3/marketplace/marketplace-sheet'
import { MessageBubble, type ShellMessage } from '@/components/v3/shell/message-bubble'
import { DemoCards } from '@/components/v3/shell/demo-cards'
import { useTaskStream } from '@/components/v3/shell/use-task-stream'
import {
  TaskStreamView,
  type ActionableApproval,
} from '@/components/v3/shell/task-stream-view'
import { usePushToTalk } from '@/components/v3/voice/use-push-to-talk'
import { isSpeechSupported, speak, stopSpeaking } from '@/components/v3/voice/speak'

/** Marketplace demo data — deterministic fakes are labeled "Demo"; real providers arrive in Slices 3–7 and show as coming soon. */
const DEMO_CONNECTED_APPS: ProviderRow[] = [
  {
    id: 'demo-gmail',
    name: 'Demo Gmail',
    description: 'Deterministic fake inbox for the golden path',
    status: 'demo',
  },
  {
    id: 'demo-account-provider',
    name: 'Demo Account Provider',
    description: 'Fake sign-in provider for testing secure input',
    status: 'demo',
  },
  {
    id: 'demo-github',
    name: 'Demo GitHub',
    description: 'Fake repository host for publication tests',
    status: 'demo',
  },
  { id: 'github', name: 'GitHub', description: 'Repos, branches, draft PRs', status: 'coming_soon' },
  { id: 'gmail', name: 'Gmail', description: 'Read, draft, and send email', status: 'coming_soon' },
  { id: 'vercel', name: 'Vercel', description: 'Previews and deployments', status: 'coming_soon' },
  { id: 'supabase', name: 'Supabase', description: 'Database and auth', status: 'coming_soon' },
]

const DEMO_COMPUTERS: ProviderRow[] = [
  {
    id: 'demo-computer',
    name: 'Demo Computer',
    description: 'Local fixture workspace',
    status: 'demo',
  },
]

/** Demo golden-path publication target (Demo GitHub — no real repository). */
const DEMO_REPOSITORY = 'demo/onboarding'
const DEMO_BRANCH = '2hands/fix-onboarding'
const DEMO_GOAL = 'Fix the onboarding bug in the demo repo'

const TERMINAL_TASK_STATUSES = ['completed', 'failed', 'cancelled'] as const

/** Voice replies opt-in (speechSynthesis) — persisted, OFF by default. */
const VOICE_REPLIES_STORAGE_KEY = '2hands_v3_voice_replies'
/** Active-task persistence so a reload resumes the stream from cursor 0. */
const ACTIVE_TASK_STORAGE_KEY = '2hands_v3_active_task'

interface ApiResult<T> {
  ok: boolean
  status: number
  data: T | null
  errorMessage: string | null
}

/** POST JSON against a v3 route; unwraps the ApiSuccess/ApiFailure envelope. */
async function postJson<T>(path: string, body: Record<string, unknown>): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) {
      return {
        ok: false,
        status: res.status,
        data: null,
        errorMessage: json?.error?.message ?? `Request failed (${res.status})`,
      }
    }
    return { ok: true, status: res.status, data: json.data as T, errorMessage: null }
  } catch {
    return { ok: false, status: 0, data: null, errorMessage: 'Network error' }
  }
}

interface ProposalPayload {
  proposal: {
    approval: {
      id: string
      title: string
      summary: string
      riskClass: string
      category: string | null
      reversibility: string
      status: string
      canonicalAction: Record<string, unknown>
      canonicalActionHash: string
      challenge: string
      expiresAt: string
    }
    commitSha: string
    diffSummary: string | null
    changedFiles: string[]
  }
}

export function V3Shell() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, profile, loading: authLoading } = useAuth()
  const { activeWorkspace } = useWorkspaceStore()
  const stream = useTaskStream()

  const [messages, setMessages] = React.useState<ShellMessage[]>([])
  const [orbState, setOrbState] = React.useState<OrbState>('idle')
  const [marketplaceOpen, setMarketplaceOpen] = React.useState(false)
  const [approval, setApproval] = React.useState<ActionableApproval | null>(null)
  const [approvalBusy, setApprovalBusy] = React.useState(false)
  const [pipelineBusy, setPipelineBusy] = React.useState(false)
  const [voiceReplies, setVoiceReplies] = React.useState(false)
  const [voiceBanner, setVoiceBanner] = React.useState<string | null>(null)

  const scrollAnchorRef = React.useRef<HTMLDivElement>(null)
  const voiceRepliesRef = React.useRef(voiceReplies)
  voiceRepliesRef.current = voiceReplies

  // Dev-only: `?demo=cards` renders the ApprovalCard + SecureInputCard demos.
  const showDemoCards =
    process.env.NODE_ENV !== 'production' && searchParams.get('demo') === 'cards'
  const showGoldenPathButton = process.env.NODE_ENV !== 'production'

  const demoComputerEnabled = DEMO_COMPUTERS.some(
    (row) => row.id === 'demo-computer' && row.status === 'demo',
  )

  // Defensive client-side guard — the (dashboard) layout already redirects
  // server-side; this mirrors the existing app page's pattern.
  React.useEffect(() => {
    if (!authLoading && !user) router.push('/sign-in')
  }, [authLoading, user, router])

  // Keep the latest content in view.
  React.useEffect(() => {
    if (messages.length === 0 && stream.events.length === 0) return
    scrollAnchorRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, stream.events.length, approval])

  // The orb thinks while a task is live, settles when it lands.
  React.useEffect(() => {
    if (!stream.taskId) return
    if (
      stream.taskStatus &&
      (TERMINAL_TASK_STATUSES as readonly string[]).includes(stream.taskStatus)
    ) {
      setOrbState('idle')
    } else {
      setOrbState('thinking')
    }
  }, [stream.taskId, stream.taskStatus])

  const note = React.useCallback((content: string) => {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', content }])
    // Spoken replies are opt-in — never speak while the toggle is off.
    if (voiceRepliesRef.current) speak(content)
  }, [])

  // ---------------------------------------------------------------------
  // Voice (Slice 9): restore the opt-in voice-replies preference, announce
  // task landings aloud when it is on, and stop speech on unmount.
  // ---------------------------------------------------------------------
  React.useEffect(() => {
    try {
      setVoiceReplies(window.localStorage.getItem(VOICE_REPLIES_STORAGE_KEY) === 'true')
    } catch {
      /* storage unavailable */
    }
    return () => stopSpeaking()
  }, [])

  React.useEffect(() => {
    if (!voiceRepliesRef.current) return
    if (stream.taskStatus === 'completed') {
      speak('Done. The receipt is the record of what happened.')
    } else if (stream.taskStatus === 'failed') {
      speak('The task failed. Nothing external happened without your approval.')
    }
  }, [stream.taskStatus])

  const toggleVoiceReplies = React.useCallback(() => {
    setVoiceReplies((current) => {
      const next = !current
      try {
        window.localStorage.setItem(VOICE_REPLIES_STORAGE_KEY, String(next))
      } catch {
        /* storage unavailable */
      }
      if (!next) stopSpeaking()
      return next
    })
  }, [])

  /**
   * Demo golden path: fixture computer → demo pipeline (implement + review +
   * verify) → exact publication approval. Approving publishes exactly once.
   */
  const runDemoPipeline = React.useCallback(
    async (taskId: string, goal: string) => {
      setPipelineBusy(true)
      try {
        const computerRes = await postJson<{ computer?: { id?: string }; id?: string }>(
          '/api/computers',
          { name: 'Demo Computer', provider: 'fixture' },
        )
        const computerId = computerRes.data?.computer?.id ?? computerRes.data?.id
        if (!computerRes.ok || !computerId) {
          note(
            computerRes.status === 404
              ? 'The demo computer endpoint (/api/computers) is not available yet in this build — the task stays queued until the managed-computer slice lands.'
              : `Could not start the demo computer: ${computerRes.errorMessage ?? 'unknown error'}.`,
          )
          return
        }

        const pipelineRes = await postJson<Record<string, unknown>>(
          `/api/tasks/${taskId}/run-demo-pipeline`,
          { computerId },
        )
        if (!pipelineRes.ok) {
          note(
            pipelineRes.status === 404
              ? 'The demo pipeline endpoint is not available yet in this build — the task stays queued until the managed-computer slice lands.'
              : `The demo pipeline did not finish: ${pipelineRes.errorMessage ?? 'unknown error'}.`,
          )
          return
        }

        const prTitle = goal.length > 0 ? goal.slice(0, 120) : 'Demo fix'
        const proposeRes = await postJson<ProposalPayload>(
          `/api/tasks/${taskId}/propose-publication`,
          {
            computerId,
            repository: DEMO_REPOSITORY,
            branch: DEMO_BRANCH,
            prTitle,
          },
        )
        if (!proposeRes.ok || !proposeRes.data) {
          note(`Could not prepare the publication: ${proposeRes.errorMessage ?? 'unknown error'}.`)
          return
        }

        const { proposal } = proposeRes.data
        setApproval({
          card: {
            id: proposal.approval.id,
            title: proposal.approval.title,
            summary: proposal.approval.summary,
            riskClass: proposal.approval.riskClass as ActionableApproval['card']['riskClass'],
            category: proposal.approval.category as ActionableApproval['card']['category'],
            reversibility:
              proposal.approval.reversibility as ActionableApproval['card']['reversibility'],
            status: 'pending',
            expiresAt: proposal.approval.expiresAt,
          },
          rows: [
            { label: 'Repository', value: DEMO_REPOSITORY, mono: true },
            { label: 'Branch', value: DEMO_BRANCH, mono: true },
            { label: 'Commit', value: proposal.commitSha.slice(0, 12), mono: true },
            { label: 'PR title', value: prTitle },
            ...(proposal.diffSummary
              ? [{ label: 'Changes', value: proposal.diffSummary }]
              : []),
          ],
          challenge: proposal.approval.challenge,
          actionHash: proposal.approval.canonicalActionHash,
        })
      } finally {
        setPipelineBusy(false)
      }
    },
    [note],
  )

  const handleSend = React.useCallback(
    async (text: string) => {
      if (!user) {
        router.push('/sign-in')
        return
      }
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', content: text }])
      setApproval(null)
      setOrbState('thinking')

      const created = await postJson<{ task: { id: string } }>('/api/tasks', { goal: text })
      if (!created.ok || !created.data?.task?.id) {
        note(`I couldn't create the task: ${created.errorMessage ?? 'unknown error'}.`)
        setOrbState('idle')
        return
      }
      const taskId = created.data.task.id
      try {
        window.sessionStorage.setItem(ACTIVE_TASK_STORAGE_KEY, taskId)
      } catch {
        /* storage unavailable */
      }
      stream.start(taskId)

      if (demoComputerEnabled && /\bfix\b/i.test(text)) {
        void runDemoPipeline(taskId, text)
      }
    },
    [user, router, note, stream, demoComputerEnabled, runDemoPipeline],
  )

  const handleGoldenPath = React.useCallback(() => {
    void handleSend(DEMO_GOAL)
  }, [handleSend])

  // ---------------------------------------------------------------------
  // Push-to-talk (Slice 9): the mic toggles MediaRecorder capture; the
  // transcript from /api/voice/transcribe is sent as a normal message. A 501
  // (voice not configured) or permission error surfaces as a banner — a
  // transcript is never fabricated.
  // ---------------------------------------------------------------------
  const pushToTalk = usePushToTalk({
    onTranscript: (transcript) => void handleSend(transcript),
    onError: (error) => setVoiceBanner(error.message),
  })

  const handleMicPress = React.useCallback(() => {
    setVoiceBanner(null)
    pushToTalk.toggle()
  }, [pushToTalk])

  // Voice capture states take precedence over the task-driven orb machine.
  const effectiveOrbState: OrbState =
    pushToTalk.state === 'recording'
      ? 'listening'
      : pushToTalk.state === 'transcribing' || pushToTalk.state === 'requesting_permission'
        ? 'thinking'
        : orbState

  // ---------------------------------------------------------------------
  // Reconnect-from-cursor: a reload mid-task resumes the event stream (full
  // replay from cursor 0) and restores a still-pending ApprovalCard from the
  // last approval.requested event via GET /api/approvals/:id.
  // ---------------------------------------------------------------------
  const resumeAttemptedRef = React.useRef(false)
  React.useEffect(() => {
    if (resumeAttemptedRef.current || authLoading || !user) return
    resumeAttemptedRef.current = true
    let storedTaskId: string | null = null
    try {
      storedTaskId = window.sessionStorage.getItem(ACTIVE_TASK_STORAGE_KEY)
    } catch {
      /* storage unavailable */
    }
    if (!storedTaskId) return
    stream.start(storedTaskId)
  }, [authLoading, user, stream])

  // Clear the stored task once it lands; restore the approval card when the
  // replayed stream shows an unresolved approval.requested.
  const restoredApprovalRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!stream.taskId) return
    if (
      stream.taskStatus &&
      (TERMINAL_TASK_STATUSES as readonly string[]).includes(stream.taskStatus)
    ) {
      try {
        window.sessionStorage.removeItem(ACTIVE_TASK_STORAGE_KEY)
      } catch {
        /* storage unavailable */
      }
      return
    }
    if (approval || stream.taskStatus !== 'awaiting_approval') return

    const requested = [...stream.events]
      .reverse()
      .find((event) => event.type === 'approval.requested')
    const approvalId =
      requested && typeof (requested.payload as Record<string, unknown>).approvalId === 'string'
        ? String((requested.payload as Record<string, unknown>).approvalId)
        : null
    if (!approvalId || restoredApprovalRef.current === approvalId) return
    restoredApprovalRef.current = approvalId

    void (async () => {
      // Retry a few times — a single dropped request must not strand the
      // card, since the effect only re-runs when the stream changes.
      let dto: {
        id: string
        title: string
        summary: string
        riskClass: string
        category: string | null
        reversibility: string
        status: string
        challenge: string
        expiresAt: string
        canonicalActionHash: string
        canonicalAction?: { target?: Record<string, string>; input?: Record<string, unknown> }
      } | null = null
      for (let attempt = 0; attempt < 3 && !dto; attempt++) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1500))
        try {
          const res = await fetch(`/api/approvals/${approvalId}`, { cache: 'no-store' })
          const json = await res.json().catch(() => null)
          if (json?.ok) dto = json.data?.approval ?? null
        } catch {
          /* retry */
        }
      }
      if (!dto || dto.status !== 'pending') {
        // Allow a later stream change to retry the restore.
        restoredApprovalRef.current = null
        return
      }
      const target = (dto.canonicalAction?.target ?? {}) as Record<string, string>
      const input = (dto.canonicalAction?.input ?? {}) as Record<string, unknown>
      setApproval({
        card: {
          id: dto.id,
          title: dto.title,
          summary: dto.summary,
          riskClass: dto.riskClass as ActionableApproval['card']['riskClass'],
          category: dto.category as ActionableApproval['card']['category'],
          reversibility: dto.reversibility as ActionableApproval['card']['reversibility'],
          status: 'pending',
          expiresAt: dto.expiresAt,
        },
        rows: [
          { label: 'Repository', value: target.repository ?? '—', mono: true },
          { label: 'Branch', value: target.branch ?? '—', mono: true },
          ...(typeof input.commitSha === 'string'
            ? [{ label: 'Commit', value: input.commitSha.slice(0, 12), mono: true }]
            : []),
          ...(typeof input.prTitle === 'string'
            ? [{ label: 'PR title', value: input.prTitle }]
            : []),
        ],
        challenge: dto.challenge,
        actionHash: dto.canonicalActionHash,
      })
    })()
  }, [stream.taskId, stream.taskStatus, stream.events, approval])

  const handleApprove = React.useCallback(
    async (approvalId: string) => {
      if (!approval || !stream.taskId) return
      setApprovalBusy(true)
      try {
        const responded = await postJson<{ result: { status: string } }>(
          `/api/approvals/${approvalId}/respond`,
          {
            response: 'approved',
            challenge: approval.challenge,
            actionHash: approval.actionHash,
            idempotencyKey: crypto.randomUUID(),
          },
        )
        if (!responded.ok) {
          note(`The approval could not be recorded: ${responded.errorMessage ?? 'unknown error'}.`)
          throw new Error(responded.errorMessage ?? 'respond failed')
        }
        const executed = await postJson<{ result: Record<string, unknown> }>(
          `/api/tasks/${stream.taskId}/execute-publication`,
          { approvalId },
        )
        if (!executed.ok) {
          note(`Publication did not run: ${executed.errorMessage ?? 'unknown error'}.`)
        }
      } finally {
        setApprovalBusy(false)
      }
    },
    [approval, stream.taskId, note],
  )

  const handleDeny = React.useCallback(
    async (approvalId: string) => {
      if (!approval) return
      setApprovalBusy(true)
      try {
        const responded = await postJson<{ result: { status: string } }>(
          `/api/approvals/${approvalId}/respond`,
          {
            response: 'denied',
            challenge: approval.challenge,
            actionHash: approval.actionHash,
            idempotencyKey: crypto.randomUUID(),
          },
        )
        if (!responded.ok) {
          note(`The denial could not be recorded: ${responded.errorMessage ?? 'unknown error'}.`)
          throw new Error(responded.errorMessage ?? 'respond failed')
        }
      } finally {
        setApprovalBusy(false)
      }
    },
    [approval, note],
  )

  const hasConversation = messages.length > 0 || stream.events.length > 0
  const displayName = profile?.full_name ?? user?.email ?? undefined
  const credits =
    typeof activeWorkspace?.credits === 'number'
      ? activeWorkspace.credits
      : typeof profile?.credits === 'number'
        ? profile.credits
        : undefined

  return (
    // Fixed overlay: fully covers the legacy dashboard chrome (sidebar,
    // header) that the (dashboard) layout renders around every page.
    <div
      data-slot="v3-shell"
      className="fixed inset-0 z-50 flex flex-col bg-background text-foreground"
    >
      {/* Header — marketplace left, compact orb center (active conversation only), account right */}
      <header
        className={cn(
          'relative flex shrink-0 items-center justify-between',
          'px-4 pb-2 md:px-8',
          'pt-[max(0.75rem,env(safe-area-inset-top))]'
        )}
      >
        <MarketplaceButton
          open={marketplaceOpen}
          onClick={() => setMarketplaceOpen(true)}
        />
        {hasConversation && (
          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2">
            <Orb state={effectiveOrbState} size="compact" />
          </div>
        )}
        <div className="flex items-center gap-2">
          {isSpeechSupported() && (
            <button
              type="button"
              onClick={toggleVoiceReplies}
              aria-label={voiceReplies ? 'Turn voice replies off' : 'Turn voice replies on'}
              aria-pressed={voiceReplies}
              data-testid="voice-replies-toggle"
              className={cn(
                'flex size-11 items-center justify-center rounded-full border transition-colors duration-150',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                voiceReplies
                  ? 'border-transparent bg-[#D97757] text-white hover:bg-[#C86647]'
                  : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {voiceReplies ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
            </button>
          )}
          <AccountButton
            name={displayName}
            avatarUrl={profile?.avatar_url ?? undefined}
            credits={credits}
            onClick={() => router.push('/settings')}
          />
        </div>
      </header>

      {/* Conversation surface */}
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {hasConversation ? (
          <div className="mx-auto flex w-full max-w-[800px] flex-col gap-5 px-4 py-6 md:px-8">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <TaskStreamView
              events={stream.events}
              taskStatus={stream.taskStatus}
              actionableApproval={approval}
              onApprove={handleApprove}
              onDeny={handleDeny}
              approvalDisabled={approvalBusy}
            />
            {stream.error && (
              <p className="text-[13px] leading-[18px] text-muted-foreground" role="status">
                Reconnecting to the task stream…
              </p>
            )}
            {pipelineBusy && (
              <p className="text-[13px] leading-[18px] text-muted-foreground" role="status">
                Demo run in progress…
              </p>
            )}
            {showDemoCards && <DemoCards className="pt-2" />}
            <div ref={scrollAnchorRef} aria-hidden className="h-px shrink-0" />
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-[800px] flex-1 flex-col gap-6 px-4 py-6 md:px-8">
            <EmptyState orbState={effectiveOrbState} className={showDemoCards ? 'min-h-[40vh]' : undefined} />
            {showGoldenPathButton && (
              <div className="flex justify-center pb-2">
                {/* Dev-only: runs the full Demo golden path (fixture computer →
                    agents → verification → exact publication approval). */}
                <button
                  type="button"
                  data-slot="golden-path-button"
                  onClick={handleGoldenPath}
                  disabled={authLoading || pipelineBusy}
                  className={cn(
                    'inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-background px-4',
                    'text-[13px] leading-[18px] font-medium text-muted-foreground',
                    'transition-colors duration-150 hover:border-[var(--border-medium)] hover:bg-accent hover:text-foreground',
                    'focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
                    'disabled:pointer-events-none disabled:opacity-50',
                  )}
                >
                  <PlayIcon aria-hidden className="size-3.5" />
                  Run demo golden path
                </button>
              </div>
            )}
            {showDemoCards && <DemoCards />}
          </div>
        )}
      </main>

      {/* Composer — pinned to the bottom, safe-area aware */}
      <div
        className={cn(
          'shrink-0 px-4 pt-2 md:px-8',
          'pb-[max(1rem,env(safe-area-inset-bottom))]'
        )}
      >
        {voiceBanner && (
          <div
            data-testid="voice-banner"
            role="status"
            className={cn(
              'mx-auto mb-2 flex w-full max-w-[800px] items-start justify-between gap-3',
              'rounded-2xl border border-border bg-secondary/60 px-4 py-2.5'
            )}
          >
            <p className="text-[13px] leading-[18px] text-muted-foreground">{voiceBanner}</p>
            <button
              type="button"
              onClick={() => setVoiceBanner(null)}
              aria-label="Dismiss voice notice"
              className="text-[13px] font-medium text-foreground hover:opacity-70"
            >
              Dismiss
            </button>
          </div>
        )}
        <Composer
          onSend={(text) => void handleSend(text)}
          onMicPress={handleMicPress}
          orbState={effectiveOrbState}
          disabled={authLoading}
        />
      </div>

      <MarketplaceSheet
        open={marketplaceOpen}
        onOpenChange={setMarketplaceOpen}
        connectedApps={DEMO_CONNECTED_APPS}
        computers={DEMO_COMPUTERS}
      />
    </div>
  )
}
