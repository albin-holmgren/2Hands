"use client"

/**
 * v3 approval card (UX.md §13, BRAND_GUIDELINES §13, SECURITY risk classes).
 *
 * Rendered above the composer when a task is waiting for approval.
 * Shows the exact action (key-value summary rows), reversibility, maximum
 * cost, and an expiry countdown. Approve and Deny differ by text, icon,
 * AND position — never by color alone. Buttons disable after a response.
 *
 * Props-driven; responding is delegated to the caller (Slice 2 wires this
 * to POST /api/approvals/:id/respond with challenge + hash + idempotency key).
 */

import * as React from "react"
import { CheckIcon, ShieldAlertIcon, TimerIcon, XIcon } from "lucide-react"
import type { Approval } from "@2hands/types/v3"

import { cn } from "@/lib/utils"

/** Subset of the canonical Approval contract this card needs. */
type ApprovalCardData = Pick<
  Approval,
  "id" | "title" | "summary" | "riskClass" | "reversibility" | "status" | "expiresAt"
> &
  Partial<Pick<Approval, "category" | "estimatedMaxCostCredits">>

interface ApprovalSummaryRow {
  label: string
  value: string
  /** Render the value in monospace (branches, hashes, amounts, paths). */
  mono?: boolean
}

interface ApprovalCardProps {
  approval: ApprovalCardData
  /** Exact-action rows: recipient, branch, amount, subject, … */
  rows: ApprovalSummaryRow[]
  onApprove: (approvalId: string) => void | Promise<void>
  onDeny: (approvalId: string) => void | Promise<void>
  disabled?: boolean
  className?: string
}

const REVERSIBILITY_LABELS: Record<Approval["reversibility"], string> = {
  reversible: "Reversible",
  partially_reversible: "Partially reversible",
  irreversible: "Not reversible",
}

/** External / material writes get the terracotta signature accent. */
function isExternalWrite(riskClass: Approval["riskClass"]): boolean {
  return riskClass === "r2_external_write" || riskClass === "r3_high_impact"
}

function formatRemaining(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    return `${hours}h ${minutes % 60}m`
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function useCountdown(expiresAt: string): number {
  const [remaining, setRemaining] = React.useState(
    () => new Date(expiresAt).getTime() - Date.now()
  )
  React.useEffect(() => {
    const update = () => setRemaining(new Date(expiresAt).getTime() - Date.now())
    update()
    const interval = window.setInterval(update, 1000)
    return () => window.clearInterval(interval)
  }, [expiresAt])
  return remaining
}

function ApprovalCard({
  approval,
  rows,
  onApprove,
  onDeny,
  disabled = false,
  className,
}: ApprovalCardProps) {
  const [responded, setResponded] = React.useState<"approved" | "denied" | null>(null)
  const [pending, setPending] = React.useState(false)
  const remaining = useCountdown(approval.expiresAt)

  const expired = remaining <= 0 || approval.status === "expired"
  const external = isExternalWrite(approval.riskClass)
  const settledStatus =
    responded ??
    (approval.status !== "pending" && approval.status !== "expired" ? approval.status : null)
  const inactive = disabled || pending || expired || settledStatus !== null

  const respond = async (decision: "approved" | "denied") => {
    if (inactive) return
    setPending(true)
    try {
      await (decision === "approved" ? onApprove(approval.id) : onDeny(approval.id))
      setResponded(decision)
    } finally {
      setPending(false)
    }
  }

  return (
    <section
      data-slot="approval-card"
      data-risk-class={approval.riskClass}
      aria-label={`Needs your approval: ${approval.title}`}
      className={cn(
        "w-full overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-[0_1px_2px_rgba(52,50,45,0.05)]",
        // Risk-class accent: terracotta for external writes, warm black otherwise.
        "border-l-[3px]",
        external
          ? "border-l-[var(--color-brand-terracotta)]"
          : "border-l-[var(--color-brand-black)] dark:border-l-[var(--border-strong)]",
        className
      )}
    >
      <div className="flex flex-col gap-3 p-4">
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="flex items-center gap-1.5 text-[11px] leading-4 font-medium tracking-wide uppercase text-muted-foreground">
              <ShieldAlertIcon
                aria-hidden
                className={cn(
                  "size-3.5",
                  external ? "text-[var(--color-brand-terracotta)]" : "text-muted-foreground"
                )}
              />
              Needs your approval
            </p>
            <h3 className="text-base leading-6 font-medium text-foreground">{approval.title}</h3>
            {approval.summary && (
              <p className="text-sm leading-5 text-muted-foreground">{approval.summary}</p>
            )}
          </div>
          <p
            className={cn(
              "flex shrink-0 items-center gap-1 text-[13px] leading-[18px] tabular-nums",
              expired ? "text-[var(--color-error)]" : "text-muted-foreground"
            )}
            aria-live="polite"
          >
            <TimerIcon aria-hidden className="size-3.5" />
            {expired ? "Expired" : formatRemaining(remaining)}
          </p>
        </header>

        {rows.length > 0 && (
          <dl className="flex flex-col divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-subtle)] bg-secondary/50">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline gap-3 px-3 py-2">
                <dt className="w-24 shrink-0 text-[13px] leading-[18px] text-muted-foreground">
                  {row.label}
                </dt>
                <dd
                  className={cn(
                    "min-w-0 flex-1 text-sm leading-5 break-words text-foreground",
                    row.mono && "font-mono text-[13px]"
                  )}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {REVERSIBILITY_LABELS[approval.reversibility]}
          {typeof approval.estimatedMaxCostCredits === "number" && (
            <> · Up to {approval.estimatedMaxCostCredits} work credits</>
          )}
        </p>

        {settledStatus ? (
          <p className="text-sm leading-5 font-medium text-muted-foreground" role="status">
            {settledStatus === "approved" && "Approved."}
            {settledStatus === "denied" && "Denied. Nothing was sent."}
            {settledStatus === "cancelled" && "Cancelled."}
            {settledStatus === "consumed" && "Approved and completed."}
          </p>
        ) : (
          <div className="flex items-center justify-between gap-2 pt-1">
            {/* Deny: ghost, left, X icon. Approve: primary warm black, right, check icon. */}
            <button
              type="button"
              data-slot="approval-deny"
              disabled={inactive}
              onClick={() => void respond("denied")}
              className={cn(
                "flex h-11 min-w-24 items-center justify-center gap-1.5 rounded-lg px-4",
                "text-sm font-medium text-muted-foreground",
                "transition-colors duration-150 hover:bg-accent hover:text-foreground",
                "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
                "disabled:pointer-events-none disabled:opacity-50"
              )}
            >
              <XIcon aria-hidden className="size-4" />
              Deny
            </button>
            <button
              type="button"
              data-slot="approval-approve"
              disabled={inactive}
              onClick={() => void respond("approved")}
              className={cn(
                "flex h-11 min-w-32 items-center justify-center gap-1.5 rounded-lg px-5",
                "bg-[var(--color-brand-black)] text-sm font-medium text-white",
                "transition-opacity duration-150 hover:opacity-85",
                "dark:bg-[var(--color-brand-beige)] dark:text-[var(--color-brand-black)]",
                "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
                "disabled:pointer-events-none disabled:opacity-50"
              )}
            >
              <CheckIcon aria-hidden className="size-4" />
              Approve
            </button>
          </div>
        )}

        {expired && settledStatus === null && (
          <p className="text-[13px] leading-[18px] text-muted-foreground" role="status">
            This approval expired. Ask 2Hands to prepare it again.
          </p>
        )}
      </div>
    </section>
  )
}

export { ApprovalCard }
export type { ApprovalCardData, ApprovalCardProps, ApprovalSummaryRow }
