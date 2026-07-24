/**
 * Specialist agent adapter contract. Codex and Claude are specialist
 * workers, never the principal agent: the principal (2Hands orchestrator)
 * owns plan, authority, budgets, verification, user communication, and the
 * receipt. Adapters receive bounded jobs and emit normalized events.
 */
import type { AgentJobEnvelope } from '@2hands/types/v3'

export type AgentRunEventType =
  | 'agent.started'
  | 'agent.progress'
  | 'agent.file.changed'
  | 'agent.command.requested'
  | 'agent.completed'
  | 'agent.failed'

export interface AgentRunEvent {
  type: AgentRunEventType
  agentRunId: string
  occurredAt: string
  /** Safe payload — no secrets, no raw credentials, bounded size. */
  payload: Record<string, unknown>
}

export type AgentErrorCode =
  | 'not_configured'
  | 'auth_missing'
  | 'budget_exceeded'
  | 'timeout'
  | 'cancelled'
  | 'workspace_error'
  | 'provider_error'

export interface AgentResult {
  agentRunId: string
  status: 'completed' | 'failed' | 'cancelled'
  /** Human-readable summary; success is judged by evidence, not this text. */
  summary: string
  changedFiles: string[]
  /** Review findings (reviewer role) — empty for implementers. */
  findings: Array<{
    severity: 'important' | 'minor' | 'info'
    file: string
    summary: string
    suggestion?: string
  }>
  usage?: { inputTokens?: number; outputTokens?: number; providerCostMicros?: number }
  threadRef?: string
  safeError?: { code: AgentErrorCode; message: string; retryable: boolean }
}

/**
 * Workspace IO handed to an adapter. The ROLE decides the surface:
 * implementers get ReadWrite IO on their own worktree; reviewers get
 * ReadOnly IO — the type system enforces the separate-worktree rule.
 */
export interface AgentWorkspaceRead {
  readFile(relativePath: string): Promise<string>
  listFiles(relativeDir: string): Promise<string[]>
  runVerification(command: string, args: string[]): Promise<{ exitCode: number | null; output: string }>
}

export interface AgentWorkspaceReadWrite extends AgentWorkspaceRead {
  writeFile(relativePath: string, content: string): Promise<void>
}

export interface AgentAdapter {
  readonly id: string
  readonly displayName: string
  /** True when the adapter can run (configuration/credentials present). */
  isAvailable(): Promise<{ available: boolean; reason?: string }>
  /** Supported authentication modes, for capability resolution. */
  supportedAuthModes(): string[]
}

export interface ImplementerAdapter extends AgentAdapter {
  readonly role: 'implementer'
  run(
    job: AgentJobEnvelope,
    io: AgentWorkspaceReadWrite,
    onEvent: (event: AgentRunEvent) => void,
    signal?: AbortSignal,
  ): Promise<AgentResult>
}

export interface ReviewerAdapter extends AgentAdapter {
  readonly role: 'reviewer'
  run(
    job: AgentJobEnvelope,
    io: AgentWorkspaceRead,
    onEvent: (event: AgentRunEvent) => void,
    signal?: AbortSignal,
  ): Promise<AgentResult>
}

export type AnyAgentAdapter = ImplementerAdapter | ReviewerAdapter
