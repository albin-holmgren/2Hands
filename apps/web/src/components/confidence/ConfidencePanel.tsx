'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, AlertTriangle, RefreshCw, Zap, Database, Shield, Clock, CreditCard, Bot, Lock, ArrowRight, LogIn, Ban } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ConfidenceStatusResponse } from '@/app/api/confidence/status/route'

type IndicatorStatus = 'ok' | 'warn' | 'error'

// ── Error classification ──────────────────────────────────────────────────

type FetchErrorKind = 'session_expired' | 'unauthorized' | 'cooldown' | 'transient' | 'unknown'

interface ClassifiedError {
  kind: FetchErrorKind
  message: string
  hint: string
}

function classifyFetchError(status: number, body: { error?: string }): ClassifiedError {
  if (status === 401) return {
    kind: 'session_expired',
    message: 'Session expired',
    hint: 'Please sign in again to view your health status.',
  }
  if (status === 403) return {
    kind: 'unauthorized',
    message: 'Access denied',
    hint: 'You do not have permission to view this.',
  }
  if (status === 429) return {
    kind: 'cooldown',
    message: body.error ?? 'On cooldown',
    hint: 'Recovery was triggered recently. Wait a moment before trying again.',
  }
  if (status >= 500) return {
    kind: 'transient',
    message: 'Service temporarily unavailable',
    hint: 'This is a temporary platform issue. The system will auto-retry.',
  }
  return {
    kind: 'unknown',
    message: body.error ?? `Unexpected error (${status})`,
    hint: 'Refresh to try again.',
  }
}

// ── Sub-components ────────────────────────────────────────────────────────

interface Indicator {
  id: string
  label: string
  icon: React.ReactNode
  status: IndicatorStatus
  value?: string | number
  action?: string
}

function StatusDot({ status }: { status: IndicatorStatus | 'healthy' | 'degraded' | 'unhealthy' }) {
  const normalized: IndicatorStatus =
    status === 'healthy' ? 'ok' :
    status === 'degraded' ? 'warn' :
    status === 'unhealthy' ? 'error' : status

  return (
    <span className={cn(
      'inline-block w-2 h-2 rounded-full shrink-0',
      normalized === 'ok'    && 'bg-emerald-500',
      normalized === 'warn'  && 'bg-amber-400',
      normalized === 'error' && 'bg-red-500',
    )} />
  )
}

function LevelBadge({ level }: { level: 'healthy' | 'degraded' | 'unhealthy' }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold',
      level === 'healthy'   && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      level === 'degraded'  && 'bg-amber-400/10 text-amber-600 dark:text-amber-400',
      level === 'unhealthy' && 'bg-red-500/10 text-red-600 dark:text-red-400',
    )}>
      {level === 'healthy' && <CheckCircle2 size={12} />}
      {level === 'degraded' && <AlertTriangle size={12} />}
      {level === 'unhealthy' && <AlertCircle size={12} />}
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  )
}

function IndicatorRow({ indicator }: { indicator: Indicator }) {
  return (
    <div className={cn(
      'flex items-center gap-3 p-3 rounded-xl border transition-colors',
      indicator.status === 'ok'    && 'border-border bg-card',
      indicator.status === 'warn'  && 'border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10',
      indicator.status === 'error' && 'border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-900/10',
    )}>
      <div className={cn(
        'p-1.5 rounded-lg',
        indicator.status === 'ok'    && 'bg-muted text-muted-foreground',
        indicator.status === 'warn'  && 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
        indicator.status === 'error' && 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
      )}>
        {indicator.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-foreground">{indicator.label}</p>
        {indicator.action && (
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{indicator.action}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {indicator.value !== undefined && (
          <span className={cn(
            'text-[12px] font-mono font-medium',
            indicator.status === 'ok'    && 'text-muted-foreground',
            indicator.status === 'warn'  && 'text-amber-600 dark:text-amber-400',
            indicator.status === 'error' && 'text-red-600 dark:text-red-400',
          )}>
            {indicator.value}
          </span>
        )}
        <StatusDot status={indicator.status} />
      </div>
    </div>
  )
}

interface RecoverResult {
  total_issues_fixed: number
  summary: string[]
  actor?: { type: string; id: string }
}

// ── Error screen ──────────────────────────────────────────────────────────

function ErrorScreen({ error, onRetry }: { error: ClassifiedError; onRetry: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
      {error.kind === 'session_expired'
        ? <LogIn size={36} className="text-muted-foreground/30" />
        : error.kind === 'unauthorized'
          ? <Ban size={36} className="text-muted-foreground/30" />
          : <AlertCircle size={36} className="text-muted-foreground/30" />
      }
      <div>
        <p className="text-[14px] font-medium text-foreground">{error.message}</p>
        <p className="text-[12px] text-muted-foreground mt-1">{error.hint}</p>
      </div>
      {error.kind === 'session_expired' && (
        <a
          href="/auth/login"
          className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:opacity-90 transition-opacity"
        >
          Sign in
        </a>
      )}
      {error.kind !== 'session_expired' && error.kind !== 'unauthorized' && (
        <button
          onClick={onRetry}
          className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:opacity-90 transition-opacity"
        >
          Retry
        </button>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

interface StabilityData {
  stability: { healthyPercent: number; total: number; latestLevel: string | null }
}

export function ConfidencePanel() {
  const queryClient = useQueryClient()
  const [recoverResult, setRecoverResult] = useState<RecoverResult | null>(null)
  const [recoverError, setRecoverError] = useState<ClassifiedError | null>(null)

  const { data: historyData } = useQuery<StabilityData>({
    queryKey: ['confidence-history'],
    queryFn: async () => {
      const res = await fetch('/api/confidence/history?hours=24')
      if (!res.ok) return { stability: { healthyPercent: 100, total: 0, latestLevel: null } }
      return res.json() as Promise<StabilityData>
    },
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  })

  const { data, isLoading, error: queryError, dataUpdatedAt, refetch } = useQuery<ConfidenceStatusResponse, ClassifiedError>({
    queryKey: ['confidence-status'],
    queryFn: async () => {
      const res = await fetch('/api/confidence/status')
      const body = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw classifyFetchError(res.status, body)
      return body as ConfidenceStatusResponse
    },
    refetchInterval: 60_000,
    retry: (failureCount, err) => {
      const classified = err as ClassifiedError
      if (classified.kind === 'session_expired' || classified.kind === 'unauthorized') return false
      return failureCount < 2
    },
    staleTime: 30_000,
  })

  const recoverMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/confidence/recover', { method: 'POST' })
      const body = await res.json().catch(() => ({})) as { error?: string } & RecoverResult
      if (!res.ok) throw classifyFetchError(res.status, body)
      return body as RecoverResult
    },
    onSuccess: (result) => {
      setRecoverResult(result)
      setRecoverError(null)
      queryClient.invalidateQueries({ queryKey: ['confidence-status'] })
    },
    onError: (err) => {
      setRecoverError(err as unknown as ClassifiedError)
      setRecoverResult(null)
    },
  })

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw size={20} className="text-muted-foreground animate-spin" />
      </div>
    )
  }

  if (queryError || !data) {
    const classified = queryError ?? { kind: 'unknown' as const, message: 'Could not load status', hint: 'Refresh to try again.' }
    return <ErrorScreen error={classified} onRetry={() => refetch()} />
  }

  const { indicators } = data

  // ── User-action rows (scoped to what the user can act on) ─────────────────
  const userRows: Indicator[] = [
    {
      id: 'approvals',
      label: 'Pending approvals',
      icon: <Clock size={13} />,
      status: indicators.pending_approvals > 0 ? 'warn' : 'ok',
      value: indicators.pending_approvals > 0 ? indicators.pending_approvals : undefined,
      action: indicators.pending_approvals > 0 ? 'Approve actions your agents are waiting on' : undefined,
    },
    {
      id: 'missions',
      label: 'Mission execution',
      icon: <Zap size={13} />,
      status: indicators.stale_locks > 3 ? 'error' : indicators.stale_locks > 0 || indicators.blocked_missions > 0 ? 'warn' : 'ok',
      value: indicators.blocked_missions > 0 ? `${indicators.blocked_missions} blocked` : indicators.stale_locks > 0 ? `${indicators.stale_locks} stale locks` : undefined,
      action: indicators.blocked_missions > 0
        ? `${indicators.blocked_missions} mission${indicators.blocked_missions !== 1 ? 's' : ''} blocked — check credits or pending approvals`
        : indicators.stale_locks > 0 ? 'Stale tick locks detected — click Recover to release them' : undefined,
    },
  ]

  // ── System-status rows (platform signals) ─────────────────────────────────
  const systemRows: Indicator[] = [
    {
      id: 'stale_runs',
      label: 'Agent run queue',
      icon: <Bot size={13} />,
      status: indicators.stale_runs > 5 ? 'error' : indicators.stale_runs > 0 ? 'warn' : 'ok',
      value: indicators.stale_runs > 0 ? `${indicators.stale_runs} stale` : indicators.queue_backlog > 0 ? `${indicators.queue_backlog} queued` : undefined,
      action: indicators.stale_runs > 0 ? 'Stale runs detected — click Recover to clean them up' : undefined,
    },
    {
      id: 'env',
      label: 'Environment',
      icon: <Shield size={13} />,
      status: indicators.env,
      action: indicators.env !== 'ok' ? 'One or more required environment variables are missing or invalid' : undefined,
    },
    {
      id: 'database',
      label: 'Database connection',
      icon: <Database size={13} />,
      status: indicators.database,
      action: indicators.database !== 'ok' ? 'Supabase is unreachable — check credentials' : undefined,
    },
    {
      id: 'session_pool',
      label: 'Browser session pool',
      icon: <Lock size={13} />,
      status: indicators.session_pool,
      action: indicators.session_pool === 'error' ? 'Session pool depleted — browser agents cannot run' : undefined,
    },
    {
      id: 'billing',
      label: 'Credit reconciliation',
      icon: <CreditCard size={13} />,
      status: indicators.billing,
      action: indicators.billing === 'error' ? 'Credit commit failures in the last hour — check billing config' : undefined,
    },
  ]

  const needsAttention = [...userRows, ...systemRows].some(r => r.status !== 'ok')
  const showRecover = indicators.stale_runs > 0 || indicators.stale_locks > 0

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-[15px] font-semibold text-foreground">Runtime Health</p>
          <LevelBadge level={data.level} />
        </div>
        <div className="flex items-center gap-2">
          {dataUpdatedAt > 0 && (
            <span className="text-[11px] text-muted-foreground">
              Updated {new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button onClick={() => refetch()} title="Refresh" className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <RefreshCw size={13} className="text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Recover success banner */}
      {recoverResult && (
        <div className="flex items-start gap-3 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-900/10">
          <CheckCircle2 size={15} className="text-emerald-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-emerald-700 dark:text-emerald-400">
              {recoverResult.total_issues_fixed > 0
                ? `Fixed ${recoverResult.total_issues_fixed} issue${recoverResult.total_issues_fixed !== 1 ? 's' : ''}`
                : 'Nothing to recover — system was already clean'}
            </p>
            {recoverResult.summary.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {recoverResult.summary.map((s, i) => (
                  <li key={i} className="text-[11px] text-emerald-600 dark:text-emerald-500">{s}</li>
                ))}
              </ul>
            )}
            {recoverResult.actor && (
              <p className="text-[10px] text-emerald-600/60 dark:text-emerald-500/60 mt-1">
                Triggered by {recoverResult.actor.type === 'user' ? 'you' : 'the system'}
              </p>
            )}
          </div>
          <button onClick={() => setRecoverResult(null)} className="text-[11px] text-muted-foreground hover:text-foreground shrink-0">✕</button>
        </div>
      )}

      {/* Recover error banner */}
      {recoverError && (
        <div className="flex items-start gap-3 p-3 rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-900/10">
          <AlertCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-red-700 dark:text-red-400">{recoverError.message}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{recoverError.hint}</p>
          </div>
          <button onClick={() => setRecoverError(null)} className="text-[11px] text-muted-foreground hover:text-foreground shrink-0">✕</button>
        </div>
      )}

      {/* Your actions */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-0.5">Your issues</p>
        {userRows.map(r => <IndicatorRow key={r.id} indicator={r} />)}
      </div>

      {/* Recover button */}
      {showRecover && (
        <button
          onClick={() => recoverMutation.mutate()}
          disabled={recoverMutation.isPending}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-colors',
            'bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60'
          )}
        >
          {recoverMutation.isPending
            ? <><RefreshCw size={13} className="animate-spin" /> Recovering…</>
            : <><Zap size={13} /> Recover {indicators.stale_runs > 0 ? `${indicators.stale_runs} stale run${indicators.stale_runs !== 1 ? 's' : ''}` : 'stale locks'}</>
          }
        </button>
      )}

      {/* 24h stability bar */}
      {historyData && historyData.stability.total > 0 && (
        <div className="p-3 rounded-xl border border-border bg-card space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">24h stability</p>
            <span className={cn(
              'text-[12px] font-semibold',
              historyData.stability.healthyPercent >= 90 && 'text-emerald-600 dark:text-emerald-400',
              historyData.stability.healthyPercent >= 70 && historyData.stability.healthyPercent < 90 && 'text-amber-600 dark:text-amber-400',
              historyData.stability.healthyPercent < 70 && 'text-red-600 dark:text-red-400',
            )}>
              {historyData.stability.healthyPercent}% healthy
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                historyData.stability.healthyPercent >= 90 && 'bg-emerald-500',
                historyData.stability.healthyPercent >= 70 && historyData.stability.healthyPercent < 90 && 'bg-amber-400',
                historyData.stability.healthyPercent < 70 && 'bg-red-500',
              )}
              style={{ width: `${historyData.stability.healthyPercent}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Based on {historyData.stability.total} check{historyData.stability.total !== 1 ? 's' : ''} in the last 24h
          </p>
        </div>
      )}

      {/* System status */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-0.5">System status</p>
        {systemRows.map(r => <IndicatorRow key={r.id} indicator={r} />)}
      </div>

      {/* Actions needed (plain-text list of what to do) */}
      {data.actions_needed.length > 0 && (
        <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10">
          <p className="text-[12px] font-semibold text-amber-700 dark:text-amber-400 mb-2">What to do next</p>
          <ul className="space-y-1.5">
            {data.actions_needed.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px] text-amber-700 dark:text-amber-400">
                <ArrowRight size={11} className="shrink-0 mt-0.5" />
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* All clear */}
      {!needsAttention && (
        <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-900/10 text-center">
          <CheckCircle2 size={24} className="text-emerald-500 mx-auto mb-2" />
          <p className="text-[13px] font-medium text-emerald-700 dark:text-emerald-400">Everything looks healthy</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">No pending approvals, no stale runs, system is fully operational.</p>
        </div>
      )}
    </div>
  )
}
