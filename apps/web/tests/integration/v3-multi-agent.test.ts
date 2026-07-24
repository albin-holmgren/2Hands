#!/usr/bin/env npx tsx
// v3 Slice 6 — multi-agent handoff integration test (no DB, no model calls):
// Demo Codex implements in its writer worktree → checkpoint → Demo Claude
// reviews a SEPARATE read-only worktree → reconcile → fix in writer worktree
// → verification passes. Also proves the reviewer cannot write and the
// writer lease covers only its own worktree.

import { mkdtemp, rm, readFile, writeFile, cp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  FixtureComputerProvider,
  RunnerHost,
  signRunnerLease,
  newRunnerLeaseId,
  newRunnerNonce,
} from '@2hands/computer'
import { DemoCodexAdapter, DemoClaudeAdapter, type AgentRunEvent, type DemoPatch, type DemoReview } from '@2hands/agent'
import type { AgentJobEnvelope } from '@2hands/types/v3'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++
    console.log(`  ✓ ${message}`)
  } else {
    failed++
    console.log(`  ✗ ${message}`)
  }
}

const SIGNING_KEY = 'e'.repeat(64)
const FIXTURE_REPO = join(__dirname, '../../../../fixtures/demo-repo')
const PATCH_PATH = join(__dirname, '../../../../fixtures/demo-patch.json')

async function main() {
  const baseDir = await mkdtemp(join(tmpdir(), '2hands-agents-'))
  const provider = new FixtureComputerProvider({ baseDir })
  const patch: DemoPatch & { review: DemoReview } = JSON.parse(await readFile(PATCH_PATH, 'utf8'))

  const computer = await provider.createWorkspace({
    workspaceId: 'ws-agents',
    userId: 'user-agents',
    name: 'multi-agent demo',
    imageRef: 'fixture',
  })
  await provider.seedWorkspace(computer.id, FIXTURE_REPO)
  const session = await provider.startSession({
    computer,
    taskId: 'task-agents',
    timeoutMs: 120_000,
    networkPolicyId: 'deny_default',
  })

  const root = provider.workspacePath(computer.id)
  const implementerWorktree = join(root, 'worktrees', 'codex-implementer')
  const reviewerWorktree = join(root, 'worktrees', 'claude-reviewer')
  await mkdir(join(root, 'worktrees'), { recursive: true })
  // Separate worktrees: implementer works on a copy; reviewer gets its own
  // snapshot AFTER implementation (simulating git worktree add at the commit).
  await cp(FIXTURE_REPO, implementerWorktree, { recursive: true })

  const events: AgentRunEvent[] = []
  const onEvent = (e: AgentRunEvent) => events.push(e)

  const host = new RunnerHost({
    signingKeyHex: SIGNING_KEY,
    sessionId: session.id,
    computerId: computer.id,
    workspaceRoot: root,
    onEvent: () => undefined,
  })

  const makeLease = (allowedPaths: string[], operations: Array<'run_command' | 'read_file' | 'write_file'>) =>
    signRunnerLease(
      {
        id: newRunnerLeaseId(),
        workspaceId: 'ws-agents',
        userId: 'user-agents',
        computerId: computer.id,
        sessionId: session.id,
        taskId: 'task-agents',
        allowedPaths,
        allowedOperations: operations,
        commandPolicyId: 'default',
        networkPolicyId: 'deny_default',
        maximumRuntimeMs: 60_000,
        maximumCredits: 5,
        publishAllowed: false,
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
        nonce: newRunnerNonce(),
      },
      SIGNING_KEY,
    )

  // IO adapters bound to their worktrees (jail enforced lexically here; the
  // leased RunnerHost enforces it for command execution).
  const makeReadIo = (worktree: string) => ({
    readFile: (rel: string) => readFile(join(worktree, rel), 'utf8'),
    listFiles: async (rel: string) => {
      const { readdir } = await import('node:fs/promises')
      return readdir(join(worktree, rel))
    },
    runVerification: async (command: string, args: string[]) => {
      const result = await host.runCommand(makeLease([worktree], ['run_command']), {
        leaseId: 'x',
        command,
        args,
        cwd: worktree,
        timeoutMs: 30_000,
        idempotencyKey: `verify-${Math.random()}`,
      })
      return { exitCode: result.exitCode, output: `${result.safeStdoutRef ?? ''}\n${result.safeStderrRef ?? ''}` }
    },
  })
  const makeWriteIo = (worktree: string) => ({
    ...makeReadIo(worktree),
    writeFile: (rel: string, content: string) => writeFile(join(worktree, rel), content),
  })

  console.log('\n=== 1. Demo Codex implements in writer worktree ===')

  const implementJob: AgentJobEnvelope = {
    id: 'job-implement-1',
    taskId: 'task-agents',
    sessionId: session.id,
    leaseId: 'lease-implement',
    agent: 'codex',
    role: 'implementer',
    worktreePath: implementerWorktree,
    objective: 'Fix the failing onboarding test',
    constraints: ['no publication', 'stay in worktree'],
    verificationCommands: ['node test/onboarding.test.js'],
    capabilityGrantIds: [],
    approvalPolicy: { publishAllowed: false, deployAllowed: false },
  }

  const codex = new DemoCodexAdapter(patch)
  const implementResult = await codex.run(implementJob, makeWriteIo(implementerWorktree), onEvent)
  assert(implementResult.status === 'completed', 'implementation completed')
  assert(implementResult.changedFiles.includes('src/onboarding.js'), 'implementer changed the buggy file')

  const verifyAfterImplement = await makeReadIo(implementerWorktree).runVerification('node', ['test/onboarding.test.js'])
  assert(verifyAfterImplement.exitCode === 0, 'tests pass in implementer worktree')

  const checkpoint = await provider.createCheckpoint({ computer, session, label: 'after-implement' })
  assert(Boolean(checkpoint.id), 'checkpoint created between stages')

  console.log('\n=== 2. Demo Claude reviews a separate read-only worktree ===')

  // Reviewer worktree = snapshot of the implementer's result.
  await cp(implementerWorktree, reviewerWorktree, { recursive: true })

  const reviewJob: AgentJobEnvelope = {
    ...implementJob,
    id: 'job-review-1',
    leaseId: 'lease-review',
    agent: 'claude',
    role: 'reviewer',
    worktreePath: reviewerWorktree,
    objective: 'Review the onboarding fix',
  }

  const claude = new DemoClaudeAdapter(patch, patch.review)
  const reviewResult = await claude.run(reviewJob, makeReadIo(reviewerWorktree), onEvent)
  assert(reviewResult.status === 'completed', 'review completed')
  assert(reviewResult.findings.length === 2, 'review returned fixture findings')
  assert(reviewResult.findings.some((f) => f.severity === 'important'), 'important finding present')
  assert(reviewResult.changedFiles.length === 0, 'reviewer changed nothing')

  // Reviewer lease physically cannot run commands in the implementer worktree.
  let denied = false
  try {
    await host.runCommand(makeLease([reviewerWorktree], ['run_command']), {
      leaseId: 'x',
      command: 'node',
      args: ['-e', 'process.exit(0)'],
      cwd: implementerWorktree,
      timeoutMs: 5000,
      idempotencyKey: 'cross-worktree',
    })
  } catch {
    denied = true
  }
  assert(denied, 'reviewer-scoped lease denied in implementer worktree (one writer per worktree)')

  console.log('\n=== 3. Reconcile: fix important findings in writer worktree ===')

  const fixJob: AgentJobEnvelope = { ...implementJob, id: 'job-fix-1', objective: 'Apply important review findings' }
  const codexFix = new DemoCodexAdapter(patch, 'fix_after_review')
  const fixResult = await codexFix.run(fixJob, makeWriteIo(implementerWorktree), onEvent)
  assert(fixResult.status === 'completed', 'post-review fix completed')

  const finalVerify = await makeReadIo(implementerWorktree).runVerification('node', ['test/onboarding.test.js'])
  assert(finalVerify.exitCode === 0, 'tests still pass after review fixes')

  const fixedSource = await readFile(join(implementerWorktree, 'src/onboarding.js'), 'utf8')
  assert(fixedSource.includes('TypeError'), 'important finding (input validation) applied')
  assert(fixedSource.includes('`Welcome, ${name}!`'), 'minor finding (template literal) applied')

  console.log('\n=== 4. Normalized event stream ===')

  const types = events.map((e) => e.type)
  assert(types.filter((t) => t === 'agent.started').length === 3, 'three agent runs emitted started')
  assert(types.filter((t) => t === 'agent.completed').length === 3, 'three agent runs emitted completed')
  assert(events.every((e) => typeof e.agentRunId === 'string' && e.occurredAt), 'events carry run id + timestamp')
  const eventJson = JSON.stringify(events)
  assert(!eventJson.includes('password') && !eventJson.includes('secret'), 'no secret-shaped content in agent events')

  await provider.stopSession(session)
  await provider.deleteWorkspace(computer)
  await rm(baseDir, { recursive: true, force: true })

  console.log('\n───────────────────────────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error('Multi-agent test crashed:', error)
  process.exit(1)
})
