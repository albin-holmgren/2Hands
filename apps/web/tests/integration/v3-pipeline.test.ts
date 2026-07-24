#!/usr/bin/env npx tsx
// v3 Track B — computer control plane + multi-agent pipeline against LOCAL
// Supabase: createComputer (fixture, is_demo, seeded repo) → runMultiAgentFix
// → task at 'verifying', 3 agent computer_runs (implement/review/fix), write
// lease held+released, checkpoint row, canonical task events, diff +
// test_report artifacts, tests pass in the implementer worktree; then
// stop/resume persistence and delete (provider dir gone + state 'deleted').
//
// Requires a running local stack (`supabase start`). Skips politely otherwise.

import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)

const url = process.env.TEST_SUPABASE_URL || 'http://127.0.0.1:54321'
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error('Refusing non-local Supabase URL:', url)
  process.exit(1)
}

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

async function main() {
  try {
    const res = await fetch(`${url}/auth/v1/health`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) throw new Error('down')
  } catch {
    console.log('SKIP: local Supabase is not running (supabase start). No tests executed.')
    process.exit(0)
  }
  if (!serviceKey) {
    console.log('SKIP: TEST_SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY not set.')
    process.exit(0)
  }

  // Service modules read env at import time — set before dynamic import.
  const baseDir = await mkdtemp(join(tmpdir(), '2hands-pipeline-'))
  process.env.NEXT_PUBLIC_SUPABASE_URL = url
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey
  process.env.COMPUTER_PROVIDER = 'fixture'
  process.env.COMPUTER_FIXTURE_BASE_DIR = baseDir
  process.env.RUNNER_LEASE_SIGNING_KEY = 'b'.repeat(64)

  const computers = await import('../../src/lib/v3/computers')
  const { runMultiAgentFix } = await import('../../src/lib/v3/agent-pipeline')
  const { createTask, transitionTask, getTask, listTaskEvents } = await import('../../src/lib/v3/tasks')

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = (name: string) => (admin as any).from(name)

  const stamp = Date.now()
  const { data: user } = await admin.auth.admin.createUser({
    email: `v3-pipeline-${stamp}@example.test`,
    password: `pw-${randomUUID()}`,
    email_confirm: true,
  })
  if (!user?.user) throw new Error('user create failed')
  const ws = { id: randomUUID(), name: 'v3-pipeline', slug: `v3-pipeline-${stamp}`, owner_id: user.user.id }
  {
    const { error } = await t('workspaces').insert(ws)
    if (error) throw new Error(`workspace insert failed: ${error.message}`)
  }
  {
    const { error } = await t('workspace_members').insert({
      workspace_id: ws.id,
      user_id: user.user.id,
      role: 'owner',
    })
    if (error) throw new Error(`membership insert failed: ${error.message}`)
  }

  console.log('\n=== 1. createComputer (fixture provider) ===')

  const computer = await computers.createComputer({
    workspaceId: ws.id,
    userId: user.user.id,
    name: 'Demo pipeline computer',
  })
  assert(computer.provider === 'fixture', 'provider is fixture')
  assert(computer.is_demo === true, 'fixture computer is labeled Demo (is_demo)')
  assert(computer.state === 'stopped', 'computer created stopped')
  const root = computers.workspacePathFor(computer)
  assert(existsSync(join(root, 'src', 'onboarding.js')), 'workspace seeded from fixtures/demo-repo')

  {
    const { events } = await computers.listComputerEvents({ computerId: computer.id, workspaceId: ws.id })
    assert(events.some((e) => e.type === 'computer.created'), 'computer.created event appended')
  }

  console.log('\n=== 2. Task fixture: draft → planning → queued ===')

  const task = await createTask({ workspaceId: ws.id, userId: user.user.id, goal: 'Fix onboarding bug' })
  await transitionTask({ taskId: task.id, expectedStatus: 'draft', newStatus: 'planning' })
  await transitionTask({ taskId: task.id, expectedStatus: 'planning', newStatus: 'queued' })

  console.log('\n=== 3. runMultiAgentFix ===')

  const result = await runMultiAgentFix({
    taskId: task.id,
    computerId: computer.id,
    workspaceId: ws.id,
  })
  assert(result.status === 'verifying', 'pipeline returns status verifying')
  assert(result.verificationPassed === true, 'verification passed after review reconciliation')
  assert(result.changedFiles.includes('src/onboarding.js'), 'changed files include the buggy file')
  assert(result.findings.length === 2, 'review findings surfaced (fixture review)')

  {
    const fresh = await getTask(task.id, ws.id)
    assert(fresh?.status === 'verifying', "task reaches 'verifying' and stays there")
  }

  console.log('\n=== 4. computer_runs: 3 agent rows with correct roles ===')

  const { data: runRows } = await t('computer_runs')
    .select('*')
    .eq('computer_id', computer.id)
    .eq('kind', 'agent')
    .order('created_at', { ascending: true })
  assert((runRows ?? []).length === 3, 'exactly 3 agent runs recorded')
  const roles = (runRows ?? []).map((r: { agent_role: string }) => r.agent_role)
  assert(
    roles[0] === 'implementer' && roles[1] === 'reviewer' && roles[2] === 'implementer',
    'roles are implementer (implement), reviewer (review), implementer (fix)',
  )
  const agents = (runRows ?? []).map((r: { agent: string }) => r.agent)
  assert(agents[0] === 'demo-codex' && agents[1] === 'demo-claude' && agents[2] === 'demo-codex', 'agents recorded per run')
  assert(
    (runRows ?? []).every((r: { worktree_path: string | null; lease_id: string; status: string }) =>
      Boolean(r.worktree_path) && Boolean(r.lease_id) && r.status === 'completed'),
    'runs carry worktree_path + lease_id and completed',
  )

  console.log('\n=== 5. Write lease held and released ===')

  const { data: leases } = await t('workspace_write_leases')
    .select('*')
    .eq('computer_id', computer.id)
  assert((leases ?? []).length >= 1, 'a write lease row was created for the implementer worktree')
  assert(
    (leases ?? []).every((l: { released_at: string | null }) => l.released_at !== null),
    'all write leases were released after the pipeline',
  )
  assert(
    (leases ?? []).some((l: { worktree_path: string }) => l.worktree_path.includes('codex-implementer')),
    'lease covers the implementer worktree',
  )

  console.log('\n=== 6. Checkpoint row ===')

  const { data: checkpoints } = await t('computer_checkpoints')
    .select('*')
    .eq('computer_id', computer.id)
  assert((checkpoints ?? []).length >= 1, 'checkpoint row exists')
  assert(
    (checkpoints ?? []).some((c: { label: string }) => c.label === 'after-implement'),
    'checkpoint labeled after-implement',
  )

  console.log('\n=== 7. Canonical task events ===')

  const { events: taskEvents } = await listTaskEvents({ taskId: task.id, workspaceId: ws.id, limit: 500 })
  const types = taskEvents.map((e) => e.type)
  assert(types.filter((x) => x === 'agent.run.started').length === 3, 'agent.run.started for all 3 runs')
  assert(types.filter((x) => x === 'agent.run.completed').length === 3, 'agent.run.completed for all 3 runs')
  const verifCompleted = taskEvents.filter((e) => e.type === 'verification.test.completed')
  assert(verifCompleted.length === 2, 'verification.test.completed appended for both verification passes')
  assert(
    verifCompleted.every((e) => (e.payload as { success?: boolean }).success === true),
    'verification.test.completed events report success true',
  )
  assert(types.includes('computer.checkpoint.created'), 'computer.checkpoint.created task event present')
  assert(types.filter((x) => x === 'artifact.created').length === 2, 'artifact.created for diff + test report')

  {
    const json = JSON.stringify(taskEvents)
    assert(!json.includes('password') && !json.includes('Bearer '), 'no secret-shaped content in task events')
  }

  console.log('\n=== 8. Computer events (internal vocabulary) ===')

  {
    const { events } = await computers.listComputerEvents({
      computerId: computer.id,
      workspaceId: ws.id,
      limit: 500,
    })
    const ctypes = events.map((e) => e.type)
    assert(ctypes.filter((x) => x === 'runner.agent.started').length === 3, 'runner.agent.started x3 in computer stream')
    assert(ctypes.filter((x) => x === 'runner.agent.completed').length === 3, 'runner.agent.completed x3 in computer stream')
    assert(ctypes.includes('runner.command.started'), 'runner.command.started present (leased verification)')
    assert(ctypes.includes('computer.checkpoint.created'), 'computer.checkpoint.created in computer stream')
    const seqs = events.map((e) => e.sequence)
    assert(seqs.every((s, i) => i === 0 || s > seqs[i - 1]), 'computer event sequence strictly increasing')
  }

  console.log('\n=== 9. Artifacts ===')

  const { data: artifacts } = await t('artifacts').select('*').eq('task_id', task.id)
  const kinds = (artifacts ?? []).map((a: { kind: string }) => a.kind)
  assert(kinds.includes('diff'), 'diff artifact exists')
  assert(kinds.includes('test_report'), 'test_report artifact exists')
  {
    const diff = (artifacts ?? []).find((a: { kind: string }) => a.kind === 'diff') as {
      safe_metadata: { diff?: string; changedFiles?: string[] }
    }
    assert(Boolean(diff?.safe_metadata?.diff?.includes('+++ b/src/onboarding.js')), 'diff artifact carries unified-ish text')
  }

  console.log('\n=== 10. Demo repo test passes in implementer worktree ===')

  const worktree = join(root, 'worktrees', 'codex-implementer')
  {
    let exitCode = 0
    try {
      await execFileAsync('node', ['test/onboarding.test.js'], { cwd: worktree })
    } catch {
      exitCode = 1
    }
    assert(exitCode === 0, 'node test/onboarding.test.js passes in implementer worktree')
    const source = await readFile(join(worktree, 'src', 'onboarding.js'), 'utf8')
    assert(source.includes('TypeError'), 'important review finding applied (input validation)')
  }

  console.log('\n=== 11. Stop / resume: files persist ===')

  await computers.stopComputerSession({ computerId: computer.id, workspaceId: ws.id })
  {
    const fresh = await computers.getComputer(computer.id, ws.id)
    assert(fresh?.state === 'stopped', 'computer stopped')
  }
  const resumed = await computers.startComputerSession({ computerId: computer.id, workspaceId: ws.id })
  assert(resumed.state === 'ready', 'session resumed ready')
  assert(existsSync(join(worktree, 'src', 'onboarding.js')), 'worktree files persist across stop/resume')
  {
    const source = await readFile(join(worktree, 'src', 'onboarding.js'), 'utf8')
    assert(source.includes('`Welcome, ${name}!`'), 'fixed content persists across stop/resume')
  }

  console.log('\n=== 12. Delete: refuses while active, then removes provider dir ===')

  {
    let deniedWhileActive = false
    try {
      await computers.deleteComputer({ computerId: computer.id, workspaceId: ws.id })
    } catch {
      deniedWhileActive = true
    }
    assert(deniedWhileActive, 'delete refused while a session is active')
  }
  await computers.stopComputerSession({ computerId: computer.id, workspaceId: ws.id, sessionId: resumed.id })
  const deleted = await computers.deleteComputer({ computerId: computer.id, workspaceId: ws.id })
  assert(deleted.state === 'deleted', "computer state is 'deleted'")
  assert(!existsSync(join(baseDir, computer.id)), 'provider directory removed')

  // ---- cleanup -------------------------------------------------------------
  await t('workspaces').delete().eq('id', ws.id)
  await admin.auth.admin.deleteUser(user.user.id)
  await rm(baseDir, { recursive: true, force: true })

  console.log('\n───────────────────────────────────────────────────────')
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error('Pipeline integration test crashed:', error)
  process.exit(1)
})
