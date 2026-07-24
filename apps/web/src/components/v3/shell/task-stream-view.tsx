'use client'

/**
 * v3 task stream renderer — turns the append-only safe event stream into
 * restrained conversation content (UX.md §3–§4):
 *
 *   task.created                → one contextual assistant ack line
 *   computer.* / agent.run.* /
 *   verification.* / task.step.* → a single TaskProgress block that grows
 *   approval.requested          → ApprovalCard (when the caller holds the
 *                                 challenge from propose-publication) or an
 *                                 informational line otherwise
 *   receipt.created             → evidence chip
 *   task.completed/failed/…     → one closing line
 *
 * Pure mapping over EventEnvelope[]; polling lives in use-task-stream.
 */

import * as React from 'react'
import { ReceiptTextIcon } from 'lucide-react'
import type { EventEnvelope, TaskStatus } from '@2hands/types/v3'

import { cn } from '@/lib/utils'
import { ApprovalCard, type ApprovalCardData, type ApprovalSummaryRow } from '@/components/v3/cards/approval-card'
import { TaskProgress, type TaskProgressStep } from '@/components/v3/cards/task-progress'

/** Approval the shell can actually respond to (challenge held client-side). */
export interface ActionableApproval {
  card: ApprovalCardData
  rows: ApprovalSummaryRow[]
  challenge: string
  actionHash: string
}

interface ReceiptChipData {
  receiptId: string
  kind: string
  outcome: string
}

interface DerivedStream {
  ackGoal: string | null
  steps: TaskProgressStep[]
  receipts: ReceiptChipData[]
  /** approval.requested events seen on the stream (id → title). */
  requestedApprovals: Array<{ approvalId: string; title: string }>
  closing: { tone: 'done' | 'failed' | 'cancelled'; text: string } | null
}

const AGENT_ROLE_VERBS: Record<string, string> = {
  implementer: 'implementing',
  reviewer: 'reviewing',
  verifier: 'verifying',
}

function deriveStream(events: EventEnvelope[]): DerivedStream {
  const stepOrder: string[] = []
  const steps = new Map<string, TaskProgressStep>()
  const receipts: ReceiptChipData[] = []
  const requestedApprovals: Array<{ approvalId: string; title: string }> = []
  let ackGoal: string | null = null
  let closing: DerivedStream['closing'] = null

  const upsert = (id: string, patch: Partial<TaskProgressStep> & { title?: string }) => {
    const existing = steps.get(id)
    if (existing) {
      steps.set(id, { ...existing, ...patch })
    } else {
      steps.set(id, {
        id,
        title: patch.title ?? id,
        status: patch.status ?? 'pending',
        detail: patch.detail,
      })
      stepOrder.push(id)
    }
  }

  for (const event of events) {
    const p = (event.payload ?? {}) as Record<string, unknown>
    switch (event.type) {
      case 'task.created':
        ackGoal = typeof p.goal === 'string' ? p.goal : ''
        break

      case 'task.step.started':
        upsert(`step-${String(p.stepId ?? event.sequence)}`, {
          title: typeof p.title === 'string' ? p.title : 'Working',
          status: 'running',
        })
        break
      case 'task.step.progress':
        upsert(`step-${String(p.stepId ?? '')}`, {
          detail: typeof p.message === 'string' ? p.message : undefined,
        })
        break
      case 'task.step.completed':
        upsert(`step-${String(p.stepId ?? '')}`, { status: 'completed' })
        break

      case 'computer.session.starting':
        upsert('computer-session', { title: 'Starting demo computer', status: 'running' })
        break
      case 'computer.session.ready':
        upsert('computer-session', { title: 'Demo computer ready', status: 'completed' })
        break
      case 'computer.session.stopped':
        upsert('computer-session', { status: 'completed' })
        break
      case 'computer.checkpoint.created':
        upsert(`checkpoint-${event.sequence}`, {
          title: 'Checkpoint saved',
          status: 'completed',
          detail: typeof p.label === 'string' ? p.label : undefined,
        })
        break
      case 'computer.preview.ready':
        upsert(`preview-${event.sequence}`, { title: 'Preview ready', status: 'completed' })
        break

      case 'agent.run.started': {
        const agent = typeof p.agent === 'string' ? p.agent : 'Agent'
        const role = typeof p.role === 'string' ? p.role : ''
        upsert(`agent-${String(p.agentRunId ?? event.sequence)}`, {
          title: `${agent} ${AGENT_ROLE_VERBS[role] ?? 'working'}`,
          status: 'running',
        })
        break
      }
      case 'agent.run.progress':
        upsert(`agent-${String(p.agentRunId ?? '')}`, {
          detail: typeof p.message === 'string' ? p.message : undefined,
        })
        break
      case 'agent.run.completed':
        upsert(`agent-${String(p.agentRunId ?? '')}`, { status: 'completed' })
        break
      case 'agent.run.failed':
        upsert(`agent-${String(p.agentRunId ?? '')}`, { status: 'failed' })
        break

      case 'verification.test.completed': {
        const success = p.success === true
        upsert(`verify-${event.sequence}`, {
          title: typeof p.name === 'string' ? `Verification: ${p.name}` : 'Verification',
          status: success ? 'completed' : 'failed',
          detail: success ? 'passed' : 'failed',
        })
        break
      }
      case 'task.verification.started':
        upsert('task-verification', { title: 'Verifying result', status: 'running' })
        break
      case 'task.verification.completed':
        upsert('task-verification', {
          title: 'Verifying result',
          status: p.success === false ? 'failed' : 'completed',
        })
        break

      case 'task.waiting':
        if (p.reason === 'approval') {
          upsert('awaiting-approval', { title: 'Waiting for your approval', status: 'waiting' })
        }
        break
      case 'task.resumed':
        upsert('awaiting-approval', { status: 'completed' })
        break
      case 'approval.requested':
        requestedApprovals.push({
          approvalId: String(p.approvalId ?? ''),
          title: typeof p.title === 'string' ? p.title : 'Approval requested',
        })
        break
      case 'approval.approved':
        upsert('awaiting-approval', { title: 'Approved', status: 'completed' })
        break
      case 'approval.denied':
        upsert('awaiting-approval', { title: 'Denied — nothing was sent', status: 'cancelled' })
        break

      case 'publication.completed': {
        const prNumber = p.prNumber != null ? `#${String(p.prNumber)}` : ''
        const repository = typeof p.repository === 'string' ? p.repository : ''
        upsert(`publication-${event.sequence}`, {
          title: `Draft PR ${prNumber} opened${repository ? ` on ${repository}` : ''} (Demo GitHub)`,
          status: 'completed',
          detail: typeof p.branch === 'string' ? p.branch : undefined,
        })
        break
      }

      case 'receipt.created':
        receipts.push({
          receiptId: String(p.receiptId ?? event.id),
          kind: typeof p.kind === 'string' ? p.kind : 'receipt',
          outcome: typeof p.outcome === 'string' ? p.outcome : 'success',
        })
        break

      case 'task.completed':
        closing = { tone: 'done', text: 'Done. The receipt below is the record of what happened.' }
        break
      case 'task.failed':
        closing = {
          tone: 'failed',
          text:
            typeof p.message === 'string' && p.message
              ? `This didn't finish: ${p.message}`
              : "This didn't finish. Nothing external happened without your approval.",
        }
        break
      case 'task.cancelled':
        closing = { tone: 'cancelled', text: 'Cancelled. Nothing further will happen.' }
        break

      default:
        break
    }
  }

  return {
    ackGoal,
    steps: stepOrder.map((id) => steps.get(id)!).filter(Boolean),
    receipts,
    requestedApprovals,
    closing,
  }
}

function ReceiptChip({ receipt }: { receipt: ReceiptChipData }) {
  return (
    <span
      data-slot="receipt-chip"
      data-receipt-id={receipt.receiptId}
      className={cn(
        'inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3',
        'text-[13px] leading-[18px] font-medium text-foreground',
      )}
    >
      <ReceiptTextIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      Receipt · {receipt.kind}
      {receipt.outcome !== 'success' && ` (${receipt.outcome})`}
    </span>
  )
}

interface TaskStreamViewProps {
  events: EventEnvelope[]
  taskStatus: TaskStatus | null
  /** Approval this client can respond to (from propose-publication). */
  actionableApproval?: ActionableApproval | null
  onApprove?: (approvalId: string) => void | Promise<void>
  onDeny?: (approvalId: string) => void | Promise<void>
  approvalDisabled?: boolean
  className?: string
}

export function TaskStreamView({
  events,
  taskStatus,
  actionableApproval,
  onApprove,
  onDeny,
  approvalDisabled = false,
  className,
}: TaskStreamViewProps) {
  const derived = React.useMemo(() => deriveStream(events), [events])
  if (events.length === 0) return null

  const actionableId = actionableApproval?.card.id
  const infoOnlyApprovals = derived.requestedApprovals.filter(
    (r) => r.approvalId !== actionableId,
  )

  return (
    <div data-slot="task-stream" className={cn('flex w-full flex-col gap-4', className)}>
      {derived.ackGoal !== null && (
        <div className="max-w-full text-base leading-7 text-foreground">
          On it — I turned that into a task and will check with you before anything external
          happens.
        </div>
      )}

      {derived.steps.length > 0 && (
        <TaskProgress title="Demo run" steps={derived.steps} />
      )}

      {infoOnlyApprovals.map((r) => (
        <p key={r.approvalId} className="text-sm leading-5 text-muted-foreground">
          Approval requested: {r.title}
        </p>
      ))}

      {actionableApproval && onApprove && onDeny && (
        <ApprovalCard
          approval={actionableApproval.card}
          rows={actionableApproval.rows}
          onApprove={onApprove}
          onDeny={onDeny}
          disabled={approvalDisabled}
        />
      )}

      {derived.receipts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {derived.receipts.map((receipt) => (
            <ReceiptChip key={receipt.receiptId} receipt={receipt} />
          ))}
        </div>
      )}

      {derived.closing && (
        <div
          className={cn(
            'max-w-full text-base leading-7',
            derived.closing.tone === 'failed' ? 'text-[var(--color-error)]' : 'text-foreground',
          )}
          role="status"
        >
          {derived.closing.text}
        </div>
      )}

      {taskStatus && !derived.closing && (
        <p className="text-[13px] leading-[18px] text-muted-foreground" aria-live="polite">
          Task status: {taskStatus.replaceAll('_', ' ')}
        </p>
      )}
    </div>
  )
}

export type { TaskStreamViewProps }
