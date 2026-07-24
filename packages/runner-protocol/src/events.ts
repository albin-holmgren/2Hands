/**
 * Runner event vocabulary — the internal provider/runner stream that the
 * control plane normalizes into the canonical `computer.*` / `runner.*` /
 * `agent.run.*` families (docs/v3/IMPLEMENTATION_MAP.md §3.6).
 */

export const RUNNER_INTERNAL_EVENTS = [
  'runner.connected',
  'runner.lease.accepted',
  'runner.lease.rejected',
  'runner.command.started',
  'runner.command.output',
  'runner.command.completed',
  'runner.file.read',
  'runner.file.written',
  'runner.git.operation',
  'runner.process.started',
  'runner.process.stopped',
  'runner.preview.started',
  'runner.checkpoint.created',
  'runner.agent.started',
  'runner.agent.progress',
  'runner.agent.completed',
  'runner.agent.failed',
  'runner.heartbeat',
  'runner.cancelled',
  'runner.error',
] as const

export type RunnerInternalEvent = (typeof RUNNER_INTERNAL_EVENTS)[number]

/** internal → canonical event-family normalization map. */
export const RUNNER_EVENT_NORMALIZATION: Readonly<Record<RunnerInternalEvent, string | null>> = {
  'runner.connected': 'runner.connected',
  'runner.lease.accepted': 'runner.lease.accepted',
  'runner.lease.rejected': null, // internal-only; surfaces as task failure elsewhere
  'runner.command.started': 'runner.command.started',
  'runner.command.output': 'runner.command.output',
  'runner.command.completed': 'runner.command.completed',
  'runner.file.read': null,
  'runner.file.written': null,
  'runner.git.operation': null,
  'runner.process.started': null,
  'runner.process.stopped': null,
  'runner.preview.started': 'computer.preview.ready',
  'runner.checkpoint.created': 'computer.checkpoint.created',
  'runner.agent.started': 'agent.run.started',
  'runner.agent.progress': 'agent.run.progress',
  'runner.agent.completed': 'agent.run.completed',
  'runner.agent.failed': 'agent.run.failed',
  'runner.heartbeat': null,
  'runner.cancelled': null,
  'runner.error': 'computer.session.failed',
}

export interface RunnerEvent<TPayload = Record<string, unknown>> {
  type: RunnerInternalEvent
  leaseId: string
  sessionId: string
  computerId: string
  occurredAt: string
  sequence: number
  /** Safe payload only — redaction applied before emission. */
  payload: TPayload
}
