/**
 * DemoCodexAdapter — deterministic implementer for CI and demo mode.
 * Applies the fixture patch (fixtures/demo-patch.json) to its writer
 * worktree and verifies with the job's verification commands. No model
 * calls, no network. Clearly labeled a demo.
 */
import type { AgentJobEnvelope } from '@2hands/types/v3'
import type {
  AgentResult,
  AgentRunEvent,
  AgentWorkspaceReadWrite,
  ImplementerAdapter,
} from './types'

export interface DemoPatch {
  description: string
  edits: Array<{ file: string; find: string; replace: string }>
  fix_after_review?: Array<{ file: string; find: string; replace: string }>
}

export class DemoCodexAdapter implements ImplementerAdapter {
  readonly id = 'demo-codex'
  readonly displayName = 'Demo Codex'
  readonly role = 'implementer' as const

  constructor(private patch: DemoPatch, private phase: 'initial' | 'fix_after_review' = 'initial') {}

  async isAvailable(): Promise<{ available: boolean; reason?: string }> {
    return { available: true }
  }

  supportedAuthModes(): string[] {
    return ['2hands_managed_api']
  }

  async run(
    job: AgentJobEnvelope,
    io: AgentWorkspaceReadWrite,
    onEvent: (event: AgentRunEvent) => void,
    signal?: AbortSignal,
  ): Promise<AgentResult> {
    const now = () => new Date().toISOString()
    const emit = (type: AgentRunEvent['type'], payload: Record<string, unknown>) =>
      onEvent({ type, agentRunId: job.id, occurredAt: now(), payload })

    emit('agent.started', { agent: this.id, role: this.role, objective: job.objective })

    const edits = this.phase === 'initial' ? this.patch.edits : (this.patch.fix_after_review ?? [])
    const changedFiles: string[] = []

    try {
      for (const edit of edits) {
        if (signal?.aborted) {
          return this.cancelled(job.id, changedFiles)
        }
        emit('agent.progress', { message: `Editing ${edit.file}` })
        const content = await io.readFile(edit.file)
        if (!content.includes(edit.find)) {
          // Idempotent re-run: if the replacement is already present, skip.
          if (content.includes(edit.replace)) continue
          throw new Error(`patch anchor not found in ${edit.file}`)
        }
        await io.writeFile(edit.file, content.replace(edit.find, edit.replace))
        changedFiles.push(edit.file)
        emit('agent.file.changed', { file: edit.file })
      }

      // Run the job's verification commands and report honestly.
      let verified = true
      for (const command of job.verificationCommands) {
        const [cmd, ...args] = command.split(' ')
        emit('agent.progress', { message: `Verifying: ${command}` })
        const result = await io.runVerification(cmd, args)
        if (result.exitCode !== 0) verified = false
      }

      emit('agent.completed', { changedFiles, verified })
      return {
        agentRunId: job.id,
        status: 'completed',
        summary: verified
          ? `Applied deterministic fix to ${changedFiles.length} file(s); verification passed.`
          : `Applied edits to ${changedFiles.length} file(s); verification still failing.`,
        changedFiles,
        findings: [],
        threadRef: `demo-codex-thread-${job.id}`,
        usage: { inputTokens: 0, outputTokens: 0, providerCostMicros: 0 },
      }
    } catch (error) {
      emit('agent.failed', { code: 'workspace_error' })
      return {
        agentRunId: job.id,
        status: 'failed',
        summary: 'Demo Codex could not apply the fixture patch.',
        changedFiles,
        findings: [],
        safeError: {
          code: 'workspace_error',
          message: error instanceof Error ? error.message : 'unknown',
          retryable: false,
        },
      }
    }
  }

  private cancelled(agentRunId: string, changedFiles: string[]): AgentResult {
    return {
      agentRunId,
      status: 'cancelled',
      summary: 'Cancelled before completion.',
      changedFiles,
      findings: [],
      safeError: { code: 'cancelled', message: 'aborted', retryable: true },
    }
  }
}
