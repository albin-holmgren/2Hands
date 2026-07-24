/**
 * v3 multi-agent demo pipeline — the §26 core loop, deterministic:
 *
 *   queued → running: wake the computer, acquire the write lease for the
 *   implementer worktree, Demo Codex implements, verification runs through
 *   the leased RunnerHost, checkpoint, snapshot a SEPARATE read-only
 *   reviewer worktree, Demo Claude reviews, reconcile important findings
 *   (Demo Codex fix_after_review), rerun verification, artifacts (diff +
 *   test report), running → verifying.
 *
 * Every stage is appended BOTH as a computer event (internal runner.*
 * vocabulary) AND as a task event (canonical vocabulary via
 * RUNNER_EVENT_NORMALIZATION). Publication approval is a separate step.
 */
import { readFile, writeFile, readdir, mkdir, cp } from 'node:fs/promises'
import { join, relative } from 'node:path'
import {
  RunnerHost,
  signRunnerLease,
  newRunnerLeaseId,
  newRunnerNonce,
} from '@2hands/computer'
import {
  DemoCodexAdapter,
  DemoClaudeAdapter,
  type AgentRunEvent,
  type AgentResult,
  type DemoPatch,
  type DemoReview,
} from '@2hands/agent'
import { RUNNER_EVENT_NORMALIZATION, type RunnerInternalEvent } from '@2hands/runner-protocol'
import type { AgentJobEnvelope, RunnerOperation } from '@2hands/types/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTask, transitionTask, appendTaskEvent } from './tasks'
import {
  getComputer,
  getActiveSession,
  startComputerSession,
  createComputerCheckpoint,
  appendComputerEvent,
  acquireWriteLease,
  releaseWriteLease,
  workspacePathFor,
  fixturesPath,
  runnerSigningKey,
  type ComputerRow,
  type ComputerSessionRow,
} from './computers'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (sb: ReturnType<typeof createAdminClient>, name: string) => (sb as any).from(name)

const VERIFICATION_COMMAND = 'node test/onboarding.test.js'

export interface PipelineArtifactRef {
  id: string
  kind: 'diff' | 'test_report'
  title: string
}

export interface PipelineRunRef {
  id: string
  agent: string
  role: 'implementer' | 'reviewer'
  phase: 'implement' | 'review' | 'fix'
  status: string
}

export interface MultiAgentFixResult {
  status: 'verifying'
  taskId: string
  computerId: string
  sessionId: string
  checkpointId: string
  changedFiles: string[]
  findings: AgentResult['findings']
  verificationPassed: boolean
  artifacts: PipelineArtifactRef[]
  runs: PipelineRunRef[]
}

/** internal agent-adapter event → internal runner-stream event. */
const ADAPTER_TO_RUNNER: Record<AgentRunEvent['type'], RunnerInternalEvent> = {
  'agent.started': 'runner.agent.started',
  'agent.progress': 'runner.agent.progress',
  'agent.file.changed': 'runner.file.written',
  'agent.command.requested': 'runner.agent.progress',
  'agent.completed': 'runner.agent.completed',
  'agent.failed': 'runner.agent.failed',
}

interface PipelineContext {
  taskId: string
  computerId: string
  sessionId: string
  userId: string
}

/** Append one stage as computer event (internal) + task event (canonical). */
async function emitStage(
  ctx: PipelineContext,
  internalType: RunnerInternalEvent,
  payload: Record<string, unknown>,
  runId?: string,
): Promise<void> {
  await appendComputerEvent({
    computerId: ctx.computerId,
    type: internalType,
    sessionId: ctx.sessionId,
    runId: runId ?? null,
    payload,
  })
  const canonical = RUNNER_EVENT_NORMALIZATION[internalType]
  if (canonical) {
    await appendTaskEvent({
      taskId: ctx.taskId,
      type: canonical,
      actorKind: 'agent',
      payload,
      runId,
    })
  }
}

async function createRunRow(input: {
  ctx: PipelineContext
  workspaceId: string
  kind: 'agent' | 'test'
  agent?: string
  agentRole?: 'implementer' | 'reviewer'
  worktreePath?: string
}): Promise<{ id: string; leaseId: string }> {
  const admin = createAdminClient()
  const leaseId = newRunnerLeaseId()
  const { data, error } = await table(admin, 'computer_runs')
    .insert({
      session_id: input.ctx.sessionId,
      computer_id: input.ctx.computerId,
      workspace_id: input.workspaceId,
      task_id: input.ctx.taskId,
      lease_id: leaseId,
      kind: input.kind,
      agent: input.agent ?? null,
      agent_role: input.agentRole ?? null,
      worktree_path: input.worktreePath ?? null,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error) throw new Error(`createRunRow failed: ${error.message}`)
  return { id: data.id as string, leaseId }
}

async function finishRunRow(runId: string, input: {
  status: 'completed' | 'failed' | 'cancelled'
  exitCode?: number | null
  safeOutput?: string
}): Promise<void> {
  const admin = createAdminClient()
  const { error } = await table(admin, 'computer_runs')
    .update({
      status: input.status,
      exit_code: input.exitCode ?? null,
      safe_output_ref: input.safeOutput?.slice(0, 4000) ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId)
  if (error) throw new Error(`finishRunRow failed: ${error.message}`)
}

/**
 * Copy the workspace into a worktree, excluding the worktrees dir itself
 * (node cp refuses copying a directory into its own subdirectory, so copy
 * top-level entries individually).
 */
async function snapshotWorktree(sourceRoot: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true })
  const entries = await readdir(sourceRoot)
  for (const entry of entries) {
    if (entry === 'worktrees') continue
    await cp(join(sourceRoot, entry), join(target, entry), { recursive: true })
  }
}

/** Minimal unified-ish diff of changed files between two trees. */
async function buildDiffText(
  originalRoot: string,
  changedRoot: string,
  changedFiles: string[],
): Promise<string> {
  const chunks: string[] = []
  for (const file of changedFiles) {
    let before = ''
    try {
      before = await readFile(join(originalRoot, file), 'utf8')
    } catch {
      /* new file */
    }
    const after = await readFile(join(changedRoot, file), 'utf8')
    chunks.push(`--- a/${file}`, `+++ b/${file}`)
    const beforeLines = before.split('\n')
    const afterLines = after.split('\n')
    for (let i = 0; i < Math.max(beforeLines.length, afterLines.length); i++) {
      const b = beforeLines[i]
      const a = afterLines[i]
      if (b === a) continue
      if (b !== undefined) chunks.push(`- ${b}`)
      if (a !== undefined) chunks.push(`+ ${a}`)
    }
    chunks.push('')
  }
  return chunks.join('\n').slice(0, 16_000)
}

async function createArtifact(input: {
  workspaceId: string
  taskId: string
  kind: 'diff' | 'test_report'
  title: string
  safeMetadata: Record<string, unknown>
}): Promise<PipelineArtifactRef> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'artifacts')
    .insert({
      workspace_id: input.workspaceId,
      task_id: input.taskId,
      kind: input.kind,
      title: input.title,
      mime_type: 'text/plain',
      safe_metadata: input.safeMetadata,
    })
    .select('id')
    .single()
  if (error) throw new Error(`createArtifact failed: ${error.message}`)
  await appendTaskEvent({
    taskId: input.taskId,
    type: 'artifact.created',
    actorKind: '2hands',
    payload: { artifactId: data.id, kind: input.kind, title: input.title },
  })
  return { id: data.id as string, kind: input.kind, title: input.title }
}

export async function runMultiAgentFix(input: {
  taskId: string
  computerId: string
  workspaceId: string
}): Promise<MultiAgentFixResult> {
  const task = await getTask(input.taskId, input.workspaceId)
  if (!task) throw new Error('Task not found')
  if (task.status !== 'queued') {
    throw new Error(`Task is ${task.status}; the pipeline requires queued`)
  }

  const computer = await getComputer(input.computerId, input.workspaceId)
  if (!computer) throw new Error('Computer not found')
  if (computer.provider !== 'fixture') {
    throw new Error('The demo pipeline requires a fixture (Demo) computer')
  }
  if (!computer.is_demo) {
    throw new Error('The demo pipeline only runs on Demo computers')
  }

  // queued → running
  await transitionTask({
    taskId: task.id,
    expectedStatus: 'queued',
    newStatus: 'running',
    actorKind: '2hands',
    eventType: 'task.step.started',
    payload: { step: 'multi_agent_fix', computerId: computer.id },
  })

  try {
    const result = await executePipeline(task.id, task.user_id, computer, input.workspaceId)

    // running → verifying; publication approval is a separate step (Track C).
    await transitionTask({
      taskId: task.id,
      expectedStatus: 'running',
      newStatus: 'verifying',
      actorKind: '2hands',
      eventType: 'task.verification.started',
      payload: { verification: VERIFICATION_COMMAND },
    })

    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'pipeline error'
    await transitionTask({
      taskId: task.id,
      expectedStatus: 'running',
      newStatus: 'failed',
      actorKind: '2hands',
      eventType: 'task.failed',
      payload: { reason: 'pipeline_error', message: message.slice(0, 500) },
    }).catch(() => undefined)
    throw error
  }
}

async function executePipeline(
  taskId: string,
  userId: string,
  computer: ComputerRow,
  workspaceId: string,
): Promise<MultiAgentFixResult> {
  // 1. Wake/start a session.
  const existing: ComputerSessionRow | null = await getActiveSession(computer.id, workspaceId)
  const session: ComputerSessionRow =
    existing ??
    (await startComputerSession({
      computerId: computer.id,
      workspaceId,
      taskId,
      timeoutMs: 30 * 60_000,
    }))

  const ctx: PipelineContext = { taskId, computerId: computer.id, sessionId: session.id, userId }

  const root = workspacePathFor(computer)
  const implementerWorktree = join(root, 'worktrees', 'codex-implementer')
  const reviewerWorktree = join(root, 'worktrees', 'claude-reviewer')

  // 2. Implementer worktree = copy of the workspace files.
  await snapshotWorktree(root, implementerWorktree)

  const patch: DemoPatch & { review: DemoReview } = JSON.parse(
    await readFile(fixturesPath('demo-patch.json'), 'utf8'),
  )

  const signingKey = runnerSigningKey()
  const hostEvents: Array<{ type: string; payload: Record<string, unknown> }> = []
  const host = new RunnerHost({
    signingKeyHex: signingKey,
    sessionId: session.id,
    computerId: computer.id,
    workspaceRoot: root,
    // RunnerHost's own events are appended after each command (safe payloads).
    onEvent: (type, payload) => {
      hostEvents.push({ type, payload })
    },
  })

  const flushHostEvents = async (runId?: string) => {
    const pending = hostEvents.splice(0, hostEvents.length)
    for (const event of pending) {
      await appendComputerEvent({
        computerId: computer.id,
        type: event.type,
        sessionId: session.id,
        runId: runId ?? null,
        payload: event.payload,
      })
    }
  }

  const makeLease = (allowedPaths: string[], operations: RunnerOperation[]) =>
    signRunnerLease(
      {
        id: newRunnerLeaseId(),
        workspaceId,
        userId,
        computerId: computer.id,
        sessionId: session.id,
        taskId,
        allowedPaths,
        allowedOperations: operations,
        commandPolicyId: 'default',
        networkPolicyId: 'deny_default',
        maximumRuntimeMs: 120_000,
        maximumCredits: 5,
        publishAllowed: false,
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        nonce: newRunnerNonce(),
      },
      signingKey,
    )

  const makeReadIo = (worktree: string) => ({
    readFile: (rel: string) => readFile(join(worktree, rel), 'utf8'),
    listFiles: (rel: string) => readdir(join(worktree, rel)),
    runVerification: async (command: string, args: string[]) => {
      const result = await host.runCommand(makeLease([worktree], ['run_command']), {
        leaseId: 'inline',
        command,
        args,
        cwd: worktree,
        timeoutMs: 60_000,
        idempotencyKey: `verify-${newRunnerNonce()}`,
      })
      return {
        exitCode: result.exitCode,
        output: `${result.safeStdoutRef ?? ''}\n${result.safeStderrRef ?? ''}`,
      }
    },
  })
  const makeWriteIo = (worktree: string) => ({
    ...makeReadIo(worktree),
    writeFile: (rel: string, content: string) => writeFile(join(worktree, rel), content),
  })

  const runs: PipelineRunRef[] = []

  const runAgent = async (input2: {
    phase: 'implement' | 'review' | 'fix'
    agent: 'demo-codex' | 'demo-claude'
    role: 'implementer' | 'reviewer'
    worktree: string
    objective: string
    execute: (job: AgentJobEnvelope, onEvent: (e: AgentRunEvent) => void) => Promise<AgentResult>
  }): Promise<{ runId: string; result: AgentResult }> => {
    const run = await createRunRow({
      ctx,
      workspaceId,
      kind: 'agent',
      agent: input2.agent,
      agentRole: input2.role,
      worktreePath: relative(root, input2.worktree),
    })

    const job: AgentJobEnvelope = {
      id: run.id,
      taskId,
      sessionId: session.id,
      leaseId: run.leaseId,
      agent: input2.agent === 'demo-codex' ? 'codex' : 'claude',
      role: input2.role,
      worktreePath: input2.worktree,
      objective: input2.objective,
      constraints: ['no publication', 'stay in worktree'],
      verificationCommands: [VERIFICATION_COMMAND],
      capabilityGrantIds: [],
      approvalPolicy: { publishAllowed: false, deployAllowed: false },
    }

    // Adapter events are collected synchronously and persisted in order.
    const collected: AgentRunEvent[] = []
    const result = await input2.execute(job, (e) => collected.push(e))
    await flushHostEvents(run.id)
    for (const event of collected) {
      const internal = ADAPTER_TO_RUNNER[event.type]
      await emitStage(
        ctx,
        internal,
        { agent: input2.agent, role: input2.role, phase: input2.phase, ...event.payload },
        run.id,
      )
    }

    await finishRunRow(run.id, {
      status: result.status === 'completed' ? 'completed' : result.status === 'cancelled' ? 'cancelled' : 'failed',
      safeOutput: result.summary,
    })
    runs.push({ id: run.id, agent: input2.agent, role: input2.role, phase: input2.phase, status: result.status })
    return { runId: run.id, result }
  }

  const runVerification = async (worktree: string, phase: string): Promise<boolean> => {
    const run = await createRunRow({
      ctx,
      workspaceId,
      kind: 'test',
      worktreePath: relative(root, worktree),
    })
    await appendTaskEvent({
      taskId,
      type: 'verification.test.started',
      actorKind: '2hands',
      payload: { command: VERIFICATION_COMMAND, phase },
      runId: run.id,
    })
    const [cmd, ...args] = VERIFICATION_COMMAND.split(' ')
    const result = await host.runCommand(makeLease([worktree], ['run_command']), {
      leaseId: 'inline',
      command: cmd,
      args,
      cwd: worktree,
      timeoutMs: 60_000,
      idempotencyKey: `verify-${phase}-${newRunnerNonce()}`,
    })
    await flushHostEvents(run.id)
    const success = result.exitCode === 0
    await finishRunRow(run.id, {
      status: success ? 'completed' : 'failed',
      exitCode: result.exitCode,
      safeOutput: result.safeStdoutRef ?? undefined,
    })
    await appendTaskEvent({
      taskId,
      type: 'verification.test.completed',
      actorKind: '2hands',
      payload: { command: VERIFICATION_COMMAND, phase, success, exitCode: result.exitCode },
      runId: run.id,
    })
    return success
  }

  // 3. One writer per worktree: the implementer holds the write lease for
  // its worktree from implementation through the post-review fix.
  const writeLeaseId = await acquireWriteLease({
    computerId: computer.id,
    worktreePath: relative(root, implementerWorktree),
    holder: 'demo-codex-implementer',
    sessionId: session.id,
  })

  let checkpointId = ''
  let changedFiles: string[] = []
  let findings: AgentResult['findings'] = []
  let verificationPassed = false

  try {
    // 4. Demo Codex implements in its writer worktree.
    const implement = await runAgent({
      phase: 'implement',
      agent: 'demo-codex',
      role: 'implementer',
      worktree: implementerWorktree,
      objective: 'Fix the failing onboarding test',
      execute: (job, onEvent) =>
        new DemoCodexAdapter(patch).run(job, makeWriteIo(implementerWorktree), onEvent),
    })
    if (implement.result.status !== 'completed') {
      throw new Error(`Implementer failed: ${implement.result.safeError?.message ?? 'unknown'}`)
    }
    changedFiles = implement.result.changedFiles

    // 5. Verify the implementation through the leased runner.
    await runVerification(implementerWorktree, 'after_implement')

    // 6. Checkpoint between stages.
    const checkpoint = await createComputerCheckpoint({
      computerId: computer.id,
      workspaceId,
      label: 'after-implement',
      sessionId: session.id,
    })
    checkpointId = checkpoint.id
    await appendTaskEvent({
      taskId,
      type: 'computer.checkpoint.created',
      actorKind: '2hands',
      payload: { checkpointId: checkpoint.id, label: 'after-implement' },
    })

    // 7. Reviewer gets a SEPARATE read-only snapshot of the implementer tree.
    await cp(implementerWorktree, reviewerWorktree, { recursive: true })

    const review = await runAgent({
      phase: 'review',
      agent: 'demo-claude',
      role: 'reviewer',
      worktree: reviewerWorktree,
      objective: 'Review the onboarding fix',
      execute: (job, onEvent) =>
        new DemoClaudeAdapter(patch, patch.review).run(job, makeReadIo(reviewerWorktree), onEvent),
    })
    if (review.result.status !== 'completed') {
      throw new Error(`Reviewer failed: ${review.result.safeError?.message ?? 'unknown'}`)
    }
    findings = review.result.findings

    // 8. Reconcile: important findings go back to the implementer worktree.
    if (findings.some((f) => f.severity === 'important')) {
      const fix = await runAgent({
        phase: 'fix',
        agent: 'demo-codex',
        role: 'implementer',
        worktree: implementerWorktree,
        objective: 'Apply important review findings',
        execute: (job, onEvent) =>
          new DemoCodexAdapter(patch, 'fix_after_review').run(job, makeWriteIo(implementerWorktree), onEvent),
      })
      if (fix.result.status !== 'completed') {
        throw new Error(`Post-review fix failed: ${fix.result.safeError?.message ?? 'unknown'}`)
      }
      for (const file of fix.result.changedFiles) {
        if (!changedFiles.includes(file)) changedFiles.push(file)
      }
    }

    // 9. Rerun verification after reconciliation.
    verificationPassed = await runVerification(implementerWorktree, 'after_review')
    if (!verificationPassed) {
      throw new Error('Verification failed after review reconciliation')
    }
  } finally {
    await releaseWriteLease(writeLeaseId).catch(() => undefined)
  }

  // 10. Artifacts: diff summary + test report.
  const diffText = await buildDiffText(root, implementerWorktree, changedFiles)
  const artifacts: PipelineArtifactRef[] = []
  artifacts.push(
    await createArtifact({
      workspaceId,
      taskId,
      kind: 'diff',
      title: `Changes to ${changedFiles.length} file(s)`,
      safeMetadata: { changedFiles, diff: diffText },
    }),
  )
  artifacts.push(
    await createArtifact({
      workspaceId,
      taskId,
      kind: 'test_report',
      title: 'Verification test report',
      safeMetadata: {
        command: VERIFICATION_COMMAND,
        success: verificationPassed,
        findingsAddressed: findings.filter((f) => f.severity === 'important').length,
      },
    }),
  )

  return {
    status: 'verifying',
    taskId,
    computerId: computer.id,
    sessionId: session.id,
    checkpointId,
    changedFiles,
    findings,
    verificationPassed,
    artifacts,
    runs,
  }
}
