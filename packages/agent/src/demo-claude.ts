/**
 * DemoClaudeAdapter — deterministic reviewer for CI and demo mode.
 * Reads its separate read-only worktree, verifies the implementer's change
 * is present, and returns the fixture review findings. Cannot write —
 * the AgentWorkspaceRead type has no write surface.
 */
import type { AgentJobEnvelope } from '@2hands/types/v3'
import type { AgentResult, AgentRunEvent, AgentWorkspaceRead, ReviewerAdapter } from './types'
import type { DemoPatch } from './demo-codex'

export interface DemoReview {
  reviewer: string
  findings: Array<{
    severity: 'important' | 'minor' | 'info'
    file: string
    summary: string
    suggestion?: string
  }>
}

export class DemoClaudeAdapter implements ReviewerAdapter {
  readonly id = 'demo-claude'
  readonly displayName = 'Demo Claude'
  readonly role = 'reviewer' as const

  constructor(private patch: DemoPatch, private review: DemoReview) {}

  async isAvailable(): Promise<{ available: boolean; reason?: string }> {
    return { available: true }
  }

  supportedAuthModes(): string[] {
    return ['2hands_managed_api', 'user_api_key']
  }

  async run(
    job: AgentJobEnvelope,
    io: AgentWorkspaceRead,
    onEvent: (event: AgentRunEvent) => void,
    signal?: AbortSignal,
  ): Promise<AgentResult> {
    const now = () => new Date().toISOString()
    const emit = (type: AgentRunEvent['type'], payload: Record<string, unknown>) =>
      onEvent({ type, agentRunId: job.id, occurredAt: now(), payload })

    emit('agent.started', { agent: this.id, role: this.role, objective: job.objective })

    try {
      // Confirm the implementer's change actually landed in the reviewed tree.
      const reviewedFiles: string[] = []
      for (const edit of this.patch.edits) {
        if (signal?.aborted) {
          return {
            agentRunId: job.id,
            status: 'cancelled',
            summary: 'Review cancelled.',
            changedFiles: [],
            findings: [],
            safeError: { code: 'cancelled', message: 'aborted', retryable: true },
          }
        }
        emit('agent.progress', { message: `Reviewing ${edit.file}` })
        const content = await io.readFile(edit.file)
        reviewedFiles.push(edit.file)
        if (!content.includes(edit.replace)) {
          emit('agent.completed', { findings: 1, verdict: 'change_missing' })
          return {
            agentRunId: job.id,
            status: 'completed',
            summary: 'Review found the expected implementation change missing.',
            changedFiles: [],
            findings: [
              {
                severity: 'important',
                file: edit.file,
                summary: 'Expected implementation change is not present in the reviewed tree.',
              },
            ],
            threadRef: `demo-claude-thread-${job.id}`,
          }
        }
      }

      emit('agent.completed', { findings: this.review.findings.length, verdict: 'changes_verified' })
      return {
        agentRunId: job.id,
        status: 'completed',
        summary: `Reviewed ${reviewedFiles.length} file(s); ${this.review.findings.length} finding(s).`,
        changedFiles: [],
        findings: this.review.findings,
        threadRef: `demo-claude-thread-${job.id}`,
        usage: { inputTokens: 0, outputTokens: 0, providerCostMicros: 0 },
      }
    } catch (error) {
      emit('agent.failed', { code: 'workspace_error' })
      return {
        agentRunId: job.id,
        status: 'failed',
        summary: 'Demo Claude could not read the review worktree.',
        changedFiles: [],
        findings: [],
        safeError: {
          code: 'workspace_error',
          message: error instanceof Error ? error.message : 'unknown',
          retryable: false,
        },
      }
    }
  }
}
