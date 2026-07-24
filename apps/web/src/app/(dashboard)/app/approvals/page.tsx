'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  CheckCheck,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  Bot,
  ShieldAlert,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

interface Approval {
  id: string
  source: 'agent_approvals' | 'agent_pending_approvals'
  agent_id: string
  agent_name: string | null
  action_type: string
  title: string
  description: string
  preview: string | null
  risk_level?: string | null
  status: string
  created_at: string
  expires_at: string
  decided_at: string | null
}

type TabFilter = 'pending' | 'approved' | 'rejected'

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function timeUntil(date: string) {
  const diff = new Date(date).getTime() - Date.now()
  if (diff <= 0) return 'expired'
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m left`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h left`
  return `${Math.floor(h / 24)}d left`
}

function ApprovalCard({
  approval,
  onAction,
  acting,
}: {
  approval: Approval
  onAction: (id: string, source: string, action: 'approved' | 'rejected') => void
  acting: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const isPending = approval.status === 'pending'
  const isExpired = isPending && new Date(approval.expires_at) < new Date()

  return (
    <div
      className={cn(
        'rounded-2xl border bg-card transition-all',
        isPending && !isExpired ? 'border-amber-500/30' : 'border-border'
      )}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <Bot size={16} className="text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {approval.agent_name && (
                  <p className="text-[11px] font-medium text-primary mb-0.5">{approval.agent_name}</p>
                )}
                <p className="text-[13px] font-semibold text-foreground">{approval.title}</p>
                <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-2">{approval.description}</p>
              </div>

              <div className="flex flex-col items-end gap-1 shrink-0">
                <span
                  className={cn(
                    'text-[10px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wide',
                    approval.status === 'pending' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                    approval.status === 'approved' ? 'bg-green-500/10 text-green-600 dark:text-green-400' :
                    approval.status === 'rejected' ? 'bg-red-500/10 text-red-600 dark:text-red-400' :
                    'bg-muted text-muted-foreground'
                  )}
                >
                  {approval.status}
                </span>
                <span className="text-[11px] text-muted-foreground">{timeAgo(approval.created_at)}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-2">
              <span className="text-[11px] font-mono text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">
                {approval.action_type}
              </span>
              {isPending && !isExpired && (
                <span className="flex items-center gap-1 text-[11px] text-amber-500">
                  <Clock size={10} />
                  {timeUntil(approval.expires_at)}
                </span>
              )}
              {isExpired && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <AlertCircle size={10} />
                  Expired
                </span>
              )}
            </div>
          </div>
        </div>

        {approval.preview && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-3 flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? 'Hide preview' : 'Show preview'}
          </button>
        )}

        {expanded && approval.preview && (
          <div className="mt-2 p-3 rounded-xl bg-muted/50 border border-border/50">
            <p className="text-[12px] text-foreground whitespace-pre-wrap">{approval.preview}</p>
          </div>
        )}

        {isPending && !isExpired && (
          <div className="flex items-center gap-2 mt-4">
            <button
              disabled={acting === approval.id}
              onClick={() => onAction(approval.id, approval.source, 'approved')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {acting === approval.id ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <CheckCircle2 size={13} />
              )}
              Approve
            </button>
            <button
              disabled={acting === approval.id}
              onClick={() => onAction(approval.id, approval.source, 'rejected')}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-red-500/30 text-red-600 dark:text-red-400 text-[13px] font-medium hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              <XCircle size={13} />
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabFilter>('pending')
  const [acting, setActing] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)

  const fetchApprovals = useCallback(async (status: string) => {
    try {
      const res = await fetch(`/api/approvals?status=${status}`)
      if (res.ok) {
        const data = await res.json()
        setApprovals(data.approvals ?? [])
        if (typeof data.pending_count === 'number') setPendingCount(data.pending_count)
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchApprovals(tab)
    const interval = setInterval(() => fetchApprovals(tab), 30_000)
    return () => clearInterval(interval)
  }, [tab, fetchApprovals])

  // Realtime: refresh when approval tables change
  useEffect(() => {
    const supabase = createClient()
    const channels = [
      supabase.channel('approvals-rt-1').on('postgres_changes', { event: '*', schema: 'public', table: 'agent_approvals' }, () => fetchApprovals(tab)).subscribe(),
      supabase.channel('approvals-rt-2').on('postgres_changes', { event: '*', schema: 'public', table: 'agent_pending_approvals' }, () => fetchApprovals(tab)).subscribe(),
    ]
    return () => { channels.forEach(c => supabase.removeChannel(c)) }
  }, [tab, fetchApprovals])

  const handleAction = async (id: string, source: string, action: 'approved' | 'rejected') => {
    setActing(id)
    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, source, action }),
      })
      if (res.ok) {
        toast.success(action === 'approved' ? 'Action approved' : 'Action rejected')
        await fetchApprovals(tab)
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error((err as { error?: string }).error ?? 'Failed to process action')
      }
    } catch {
      toast.error('Failed to process action')
    }
    setActing(null)
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-0 border-b border-border shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <CheckCheck size={20} className="text-primary" />
          <div>
            <h1 className="text-[22px] font-bold text-foreground">Approvals</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Review and approve actions requested by your AI agents
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0.5">
          {(['pending', 'approved', 'rejected'] as TabFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium capitalize rounded-t-lg transition-colors border-b-2 -mb-px',
                tab === t
                  ? 'text-foreground border-primary'
                  : 'text-muted-foreground border-transparent hover:text-foreground'
              )}
            >
              {t}
              {t === 'pending' && pendingCount > 0 && (
                <span className="min-w-[18px] h-4.5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="max-w-2xl mx-auto space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-foreground/8 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1.5 flex-1">
                        <div className="h-3.5 w-48 bg-foreground/8 rounded animate-pulse" />
                        <div className="h-3 w-64 bg-foreground/8 rounded animate-pulse" />
                      </div>
                      <div className="h-5 w-16 bg-foreground/8 rounded-full animate-pulse shrink-0" />
                    </div>
                    <div className="h-3 w-24 bg-foreground/8 rounded animate-pulse" />
                    <div className="flex gap-2 mt-3">
                      <div className="flex-1 h-9 bg-foreground/8 rounded-xl animate-pulse" />
                      <div className="flex-1 h-9 bg-foreground/8 rounded-xl animate-pulse" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : approvals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCheck size={40} className="text-muted-foreground/20 mb-3" />
            <p className="text-[15px] font-semibold text-foreground">
              {tab === 'pending' ? 'No pending approvals' : `No ${tab} approvals`}
            </p>
            <p className="text-[13px] text-muted-foreground mt-1">
              {tab === 'pending'
                ? 'Your agents will request approval here when they need to take sensitive actions.'
                : `Actions you've ${tab} will appear here.`}
            </p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-3">
            {approvals.map((approval) => (
              <ApprovalCard
                key={`${approval.source}-${approval.id}`}
                approval={approval}
                onAction={handleAction}
                acting={acting}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
