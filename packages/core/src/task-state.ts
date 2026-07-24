/**
 * Canonical task state machine (mirrors public.v3_is_legal_task_transition).
 * The database is the enforcement point; this module lets application code
 * fail fast and render legal next actions.
 */
import {
  TASK_TRANSITIONS,
  TERMINAL_TASK_STATUSES,
  type TaskStatus,
} from '@2hands/types/v3'

export function isLegalTaskTransition(from: TaskStatus, to: TaskStatus): boolean {
  return (TASK_TRANSITIONS[from] ?? []).includes(to)
}

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return TERMINAL_TASK_STATUSES.includes(status)
}

export function legalNextStatuses(from: TaskStatus): readonly TaskStatus[] {
  return TASK_TRANSITIONS[from] ?? []
}

/** Waiting states a task can re-enter multiple times before finishing. */
export function isWaitingStatus(status: TaskStatus): boolean {
  return status === 'awaiting_auth' || status === 'awaiting_approval'
}

export class IllegalTaskTransitionError extends Error {
  constructor(
    public readonly from: TaskStatus,
    public readonly to: TaskStatus,
  ) {
    super(`Illegal task transition ${from} -> ${to}`)
    this.name = 'IllegalTaskTransitionError'
  }
}

export function assertLegalTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (!isLegalTaskTransition(from, to)) {
    throw new IllegalTaskTransitionError(from, to)
  }
}
