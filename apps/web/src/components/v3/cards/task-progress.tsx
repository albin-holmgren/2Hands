"use client"

/**
 * v3 compact task-progress block for the conversation surface (UX.md §3).
 *
 * Shows a restrained step list with status icons, highlights the current
 * step, and offers evidence chips (diff / test / preview) as pill buttons.
 * One meaningful current step — never a flood of low-level tool calls.
 */

import * as React from "react"
import {
  CheckIcon,
  CircleIcon,
  ClockIcon,
  ExternalLinkIcon,
  FileDiffIcon,
  FlaskConicalIcon,
  Loader2Icon,
  MinusIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import type { TaskStep } from "@2hands/types/v3"

import { cn } from "@/lib/utils"

type TaskProgressStepStatus = TaskStep["status"]

interface TaskProgressStep {
  id: string
  title: string
  status: TaskProgressStepStatus
  /** Optional compact detail, e.g. "6 files" or "12 passed". */
  detail?: string
}

type EvidenceChipKind = "diff" | "test" | "preview"

interface EvidenceChip {
  id: string
  kind: EvidenceChipKind
  label: string
  onSelect?: () => void
}

interface TaskProgressProps {
  /** Optional block heading, e.g. "Acme workspace · Codex editing". */
  title?: string
  steps: TaskProgressStep[]
  /** Highlighted step; defaults to the first running step. */
  currentStepId?: string
  evidence?: EvidenceChip[]
  onStepSelect?: (step: TaskProgressStep) => void
  className?: string
}

const STEP_STATUS_LABELS: Record<TaskProgressStepStatus, string> = {
  pending: "Pending",
  running: "Running",
  waiting: "Waiting",
  completed: "Completed",
  failed: "Failed",
  skipped: "Skipped",
  cancelled: "Cancelled",
}

function StepStatusIcon({ status }: { status: TaskProgressStepStatus }) {
  const base = "size-3.5 shrink-0"
  switch (status) {
    case "completed":
      return <CheckIcon aria-hidden className={cn(base, "text-[#10B981]")} />
    case "running":
      return (
        <Loader2Icon
          aria-hidden
          className={cn(
            base,
            "animate-spin text-[var(--color-brand-terracotta)] motion-reduce:animate-none"
          )}
        />
      )
    case "waiting":
      return <ClockIcon aria-hidden className={cn(base, "text-[#F59E0B]")} />
    case "failed":
      return <TriangleAlertIcon aria-hidden className={cn(base, "text-[var(--color-error)]")} />
    case "skipped":
      return <MinusIcon aria-hidden className={cn(base, "text-muted-foreground")} />
    case "cancelled":
      return <XIcon aria-hidden className={cn(base, "text-muted-foreground")} />
    case "pending":
      return <CircleIcon aria-hidden className={cn(base, "text-[var(--border-medium)]")} />
  }
}

const EVIDENCE_ICONS: Record<EvidenceChipKind, React.ComponentType<{ className?: string }>> = {
  diff: FileDiffIcon,
  test: FlaskConicalIcon,
  preview: ExternalLinkIcon,
}

function EvidenceChipButton({ chip }: { chip: EvidenceChip }) {
  const Icon = EVIDENCE_ICONS[chip.kind]
  return (
    <button
      type="button"
      data-slot="evidence-chip"
      data-kind={chip.kind}
      onClick={chip.onSelect}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-background px-3.5 sm:min-h-8 sm:px-3",
        "text-[13px] leading-[18px] font-medium text-foreground",
        "transition-colors duration-150 hover:border-[var(--border-medium)] hover:bg-accent",
        "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none"
      )}
    >
      <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      {chip.label}
    </button>
  )
}

function TaskProgress({
  title,
  steps,
  currentStepId,
  evidence = [],
  onStepSelect,
  className,
}: TaskProgressProps) {
  const activeStepId =
    currentStepId ?? steps.find((step) => step.status === "running")?.id

  return (
    <section
      data-slot="task-progress"
      aria-label={title ?? "Task progress"}
      className={cn(
        "w-full rounded-2xl border border-border bg-card p-4 text-card-foreground",
        className
      )}
    >
      {title && (
        <p className="pb-2 text-[13px] leading-[18px] font-medium text-muted-foreground">
          {title}
        </p>
      )}

      <ol className="flex flex-col">
        {steps.map((step) => {
          const isCurrent = step.id === activeStepId
          const interactive = onStepSelect !== undefined
          return (
            <li key={step.id}>
              <button
                type="button"
                data-slot="task-progress-step"
                data-current={isCurrent || undefined}
                disabled={!interactive}
                onClick={() => onStepSelect?.(step)}
                className={cn(
                  "flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left",
                  interactive &&
                    "transition-colors duration-150 hover:bg-accent focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
                  !interactive && "cursor-default",
                  isCurrent && "bg-secondary/60"
                )}
              >
                <StepStatusIcon status={step.status} />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm leading-5",
                    isCurrent ? "font-medium text-foreground" : "text-muted-foreground",
                    (step.status === "skipped" || step.status === "cancelled") && "line-through"
                  )}
                >
                  {step.title}
                </span>
                {step.detail && (
                  <span className="shrink-0 text-[13px] leading-[18px] text-muted-foreground">
                    {step.detail}
                  </span>
                )}
                <span className="sr-only">{STEP_STATUS_LABELS[step.status]}</span>
              </button>
            </li>
          )
        })}
      </ol>

      {evidence.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-3">
          {evidence.map((chip) => (
            <EvidenceChipButton key={chip.id} chip={chip} />
          ))}
        </div>
      )}
    </section>
  )
}

export { EvidenceChipButton, StepStatusIcon, TaskProgress }
export type {
  EvidenceChip,
  EvidenceChipKind,
  TaskProgressProps,
  TaskProgressStep,
  TaskProgressStepStatus,
}
