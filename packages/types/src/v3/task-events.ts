/**
 * 2Hands v3 safe event contracts.
 * Copied verbatim from 2hands-ai-documentation-v3/specs/task-events.types.ts (canonical),
 * extended with the full canonical event-family names from the implementation map.
 * Secret-bearing values are not representable here.
 */

export interface EventEnvelope<TType extends string = string, TPayload = unknown> {
  id: string
  version: 1
  type: TType
  workspaceId: string
  conversationId?: string
  taskId?: string
  runId?: string
  occurredAt: string
  sequence: number
  actor: { kind: 'user' | '2hands' | 'agent' | 'connector' | 'system'; id?: string }
  payload: TPayload
}

export type TaskEvent =
  | EventEnvelope<'task.created', { goal: string }>
  | EventEnvelope<'task.plan.updated', { steps: Array<{ id: string; title: string; status: string }> }>
  | EventEnvelope<'task.step.started', { stepId: string; title: string }>
  | EventEnvelope<'task.step.progress', { stepId: string; message: string; percent?: number }>
  | EventEnvelope<'task.step.completed', { stepId: string; evidenceRefs: string[] }>
  | EventEnvelope<
      'task.waiting',
      { reason: 'authentication' | 'approval' | 'verification' | 'external_event'; resourceId: string }
    >
  | EventEnvelope<'task.resumed', { reason: string }>
  | EventEnvelope<'task.completed', { receiptId: string }>
  | EventEnvelope<'task.failed', { code: string; message: string; retryable: boolean }>

export type AuthEvent =
  | EventEnvelope<
      'auth.secure_input.requested',
      { authRunId: string; requestId: string; fieldKinds: string[]; expiresAt: string }
    >
  | EventEnvelope<
      'auth.secure_input.supplied',
      { authRunId: string; requestId: string; suppliedFieldIds: string[] }
    >
  | EventEnvelope<
      'auth.verification.waiting',
      { authRunId: string; expectationId: string; targetEmailMasked: string; expiresAt: string }
    >
  | EventEnvelope<
      'auth.takeover.required',
      { authRunId: string; reason: 'captcha' | 'mfa' | 'passkey' | 'identity' | 'unusual_login' }
    >
  | EventEnvelope<'auth.completed', { authRunId: string; providerAccountId: string; safeAccountLabel?: string }>
  | EventEnvelope<'auth.failed', { authRunId: string; code: string; message: string; retryable: boolean }>

export type ApprovalEvent =
  | EventEnvelope<
      'approval.requested',
      {
        approvalId: string
        riskClass: string
        title: string
        summary: string
        canonicalActionHash: string
        expiresAt: string
      }
    >
  | EventEnvelope<'approval.approved', { approvalId: string; canonicalActionHash: string }>
  | EventEnvelope<'approval.denied', { approvalId: string; reason?: string }>
  | EventEnvelope<'approval.expired', { approvalId: string }>

export type ComputerEvent =
  | EventEnvelope<'computer.session.starting', { computerId: string; sessionId: string }>
  | EventEnvelope<'computer.session.ready', { computerId: string; sessionId: string }>
  | EventEnvelope<'agent.run.started', { agentRunId: string; agent: string; role: string }>
  | EventEnvelope<'agent.run.progress', { agentRunId: string; message: string }>
  | EventEnvelope<'agent.run.completed', { agentRunId: string; evidenceRefs: string[] }>
  | EventEnvelope<'verification.test.completed', { name: string; success: boolean; evidenceRef?: string }>
  | EventEnvelope<'computer.checkpoint.created', { checkpointId: string; label: string }>
  | EventEnvelope<'computer.preview.ready', { previewId: string; expiresAt: string }>
  | EventEnvelope<'computer.session.stopped', { sessionId: string; usageRef?: string }>

export type TwoHandsEvent = TaskEvent | AuthEvent | ApprovalEvent | ComputerEvent

/**
 * Canonical event-family type names (superset used by the append-only
 * task_events stream). The typed unions above cover the payloads the clients
 * render; families below are the full vocabulary emitted by the orchestrator.
 */
export const TASK_EVENT_TYPES = [
  'task.created',
  'task.plan.updated',
  'task.step.started',
  'task.step.progress',
  'task.step.completed',
  'task.waiting',
  'task.resumed',
  'task.verification.started',
  'task.verification.completed',
  'task.completed',
  'task.failed',
  'task.cancelled',
  'receipt.created',
  'artifact.created',
] as const

export const APPROVAL_EVENT_TYPES = [
  'approval.requested',
  'approval.updated',
  'approval.approved',
  'approval.denied',
  'approval.expired',
  'approval.consumed',
  'approval.revoked',
] as const

export const AUTH_EVENT_TYPES = [
  'auth.run.created',
  'auth.method.selected',
  'auth.oauth.started',
  'auth.secure_input.requested',
  'auth.secure_input.supplied',
  'auth.browser.started',
  'auth.verification.waiting',
  'auth.verification.found',
  'auth.takeover.required',
  'auth.takeover.started',
  'auth.takeover.completed',
  'auth.terms.required',
  'auth.payment.required',
  'auth.session.saved',
  'auth.completed',
  'auth.failed',
  'auth.cancelled',
  'provider_account.connected',
  'provider_account.needs_reauth',
  'provider_account.revoked',
] as const

export const COMPUTER_EVENT_TYPES = [
  'computer.created',
  'computer.session.starting',
  'computer.session.ready',
  'computer.session.stopping',
  'computer.session.stopped',
  'computer.session.failed',
  'computer.checkpoint.created',
  'computer.checkpoint.restored',
  'computer.preview.ready',
  'runner.connected',
  'runner.lease.accepted',
  'runner.command.started',
  'runner.command.output',
  'runner.command.completed',
  'agent.run.started',
  'agent.run.progress',
  'agent.run.completed',
  'agent.run.failed',
  'verification.test.started',
  'verification.test.completed',
  'publication.proposed',
  'publication.completed',
] as const

export const USAGE_EVENT_TYPES = [
  'usage.reserved',
  'usage.measured',
  'usage.settled',
  'usage.released',
  'limit.warning',
  'limit.reached',
  'external_subscription.created',
  'external_subscription.renewal_due',
  'spending_mandate.created',
  'spending_mandate.exceeded',
] as const

export const CONVERSATION_EVENT_TYPES = [
  'conversation.created',
  'conversation.message.accepted',
  'conversation.response.delta',
  'conversation.response.completed',
  'voice.listening.started',
  'voice.transcript.partial',
  'voice.transcript.final',
  'voice.speaking.started',
  'voice.speaking.completed',
] as const

export const ALL_EVENT_TYPES = [
  ...TASK_EVENT_TYPES,
  ...APPROVAL_EVENT_TYPES,
  ...AUTH_EVENT_TYPES,
  ...COMPUTER_EVENT_TYPES,
  ...USAGE_EVENT_TYPES,
  ...CONVERSATION_EVENT_TYPES,
] as const

export type TwoHandsEventType = (typeof ALL_EVENT_TYPES)[number]
