#!/usr/bin/env npx tsx
// v3 Slice 5 — computer provider integration test (fixture provider, no
// Docker needed): create → seed fixture repo → session → leased runner
// command (failing test) → checkpoint → patch → passing test → restore
// checkpoint (failing again) → stop/resume persistence → delete.
//
// Also proves the runner lease boundary: no lease/bad lease → no execution.

import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  FixtureComputerProvider,
  RunnerHost,
  signRunnerLease,
  newRunnerLeaseId,
  newRunnerNonce,
  type UnsignedRunnerLease,
} from '@2hands/computer'

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

const SIGNING_KEY = 'f'.repeat(64)
const FIXTURE_REPO = join(__dirname, '../../../../fixtures/demo-repo')

async function main() {
  const baseDir = await mkdtemp(join(tmpdir(), '2hands-computer-'))
  const provider = new FixtureComputerProvider({ baseDir })

  console.log('\n=== 1. Workspace lifecycle ===')
  const computer = await provider.createWorkspace({
    workspaceId: 'ws-test',
    userId: 'user-test',
    name: 'demo project',
    imageRef: 'fixture',
  })
  assert(computer.state === 'stopped', 'workspace created stopped')
  await provider.seedWorkspace(computer.id, FIXTURE_REPO)
  const pkg = JSON.parse(await readFile(join(provider.workspacePath(computer.id), 'package.json'), 'utf8'))
  assert(pkg.name === 'demo-onboarding', 'fixture repo seeded')

  const session = await provider.startSession({
    computer,
    taskId: 'task-test',
    timeoutMs: 60_000,
    networkPolicyId: 'deny_default',
  })
  assert(session.state === 'ready', 'session ready')

  console.log('\n=== 2. Leased runner commands ===')
  const workspacePath = provider.workspacePath(computer.id)
  const events: string[] = []
  const host = new RunnerHost({
    signingKeyHex: SIGNING_KEY,
    sessionId: session.id,
    computerId: computer.id,
    workspaceRoot: workspacePath,
    onEvent: (type) => events.push(type),
  })

  const makeLease = (overrides: Partial<UnsignedRunnerLease> = {}) =>
    signRunnerLease(
      {
        id: newRunnerLeaseId(),
        workspaceId: 'ws-test',
        userId: 'user-test',
        computerId: computer.id,
        sessionId: session.id,
        taskId: 'task-test',
        allowedPaths: [workspacePath],
        allowedOperations: ['run_command', 'read_file', 'write_file'],
        commandPolicyId: 'default',
        networkPolicyId: 'deny_default',
        maximumRuntimeMs: 30_000,
        maximumCredits: 5,
        publishAllowed: false,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        nonce: newRunnerNonce(),
        ...overrides,
      },
      SIGNING_KEY,
    )

  // Failing test first (the fixture bug).
  const failRun = await host.runCommand(makeLease(), {
    leaseId: 'x',
    command: 'node',
    args: ['test/onboarding.test.js'],
    cwd: workspacePath,
    timeoutMs: 20_000,
    idempotencyKey: 'run-1',
  })
  assert(failRun.exitCode === 1, 'fixture test fails before patch (exit 1)')
  assert((failRun.safeStdoutRef ?? '').includes('not ok'), 'failure output captured')

  // Lease enforcement.
  let rejected = false
  try {
    await host.runCommand(makeLease({ expiresAt: new Date(Date.now() - 1000).toISOString() }), {
      leaseId: 'x',
      command: 'node',
      args: ['-e', 'console.log(1)'],
      cwd: workspacePath,
      timeoutMs: 5000,
      idempotencyKey: 'run-2',
    })
  } catch {
    rejected = true
  }
  assert(rejected, 'expired lease → no execution')

  rejected = false
  try {
    await host.runCommand(makeLease(), {
      leaseId: 'x',
      command: 'node',
      args: ['-e', 'console.log(1)'],
      cwd: '/etc',
      timeoutMs: 5000,
      idempotencyKey: 'run-3',
    })
  } catch {
    rejected = true
  }
  assert(rejected, 'out-of-jail cwd → no execution')

  const replayLease = makeLease()
  await host.runCommand(replayLease, {
    leaseId: 'x',
    command: 'node',
    args: ['-e', 'process.exit(0)'],
    cwd: workspacePath,
    timeoutMs: 5000,
    idempotencyKey: 'run-4',
  })
  rejected = false
  try {
    await host.runCommand(replayLease, {
      leaseId: 'x',
      command: 'node',
      args: ['-e', 'process.exit(0)'],
      cwd: workspacePath,
      timeoutMs: 5000,
      idempotencyKey: 'run-5',
    })
  } catch {
    rejected = true
  }
  assert(rejected, 'lease nonce replay → no execution')

  console.log('\n=== 3. Checkpoint / patch / restore ===')
  const checkpoint = await provider.createCheckpoint({ computer, session, label: 'before-fix' })
  assert(Boolean(checkpoint.id), 'checkpoint created before patch')

  // Apply the deterministic demo patch (what Demo Codex will do in Slice 6).
  const patch = JSON.parse(await readFile(join(__dirname, '../../../../fixtures/demo-patch.json'), 'utf8'))
  for (const edit of patch.edits) {
    const filePath = join(workspacePath, edit.file)
    const content = await readFile(filePath, 'utf8')
    if (!content.includes(edit.find)) throw new Error(`patch anchor missing in ${edit.file}`)
    await writeFile(filePath, content.replace(edit.find, edit.replace))
  }

  const passRun = await host.runCommand(makeLease(), {
    leaseId: 'x',
    command: 'node',
    args: ['test/onboarding.test.js'],
    cwd: workspacePath,
    timeoutMs: 20_000,
    idempotencyKey: 'run-6',
  })
  assert(passRun.exitCode === 0, 'fixture test passes after patch (exit 0)')

  await provider.restoreCheckpoint({ computer, checkpointId: checkpoint.id })
  const restoredRun = await host.runCommand(makeLease(), {
    leaseId: 'x',
    command: 'node',
    args: ['test/onboarding.test.js'],
    cwd: workspacePath,
    timeoutMs: 20_000,
    idempotencyKey: 'run-7',
  })
  assert(restoredRun.exitCode === 1, 'restore rewinds to failing state (checkpoint integrity)')

  console.log('\n=== 4. Stop/resume persistence + delete ===')
  await provider.stopSession(session)
  assert((await provider.getWorkspace(computer.id)).state === 'stopped', 'workspace stopped')

  const session2 = await provider.startSession({
    computer,
    taskId: 'task-test-2',
    timeoutMs: 60_000,
    networkPolicyId: 'deny_default',
  })
  const persisted = JSON.parse(await readFile(join(workspacePath, 'package.json'), 'utf8'))
  assert(persisted.name === 'demo-onboarding', 'files persist across stop/resume')
  await provider.stopSession(session2)

  await provider.deleteWorkspace(computer)
  let gone = false
  try {
    await readFile(join(workspacePath, 'package.json'), 'utf8')
  } catch {
    gone = true
  }
  assert(gone, 'delete removes all workspace data')

  assert(events.includes('runner.command.started') && events.includes('runner.command.completed'), 'runner events emitted')
  assert(events.includes('runner.lease.rejected'), 'lease rejections emitted as events')

  await rm(baseDir, { recursive: true, force: true })

  console.log('\n───────────────────────────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error('Computer integration test crashed:', error)
  process.exit(1)
})
