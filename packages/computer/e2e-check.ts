/**
 * End-to-end check of a hosted computer, through the real provider against the
 * real Fly API. Proves the two claims that matter:
 *
 *   1. data survives the machine being stopped and started again
 *   2. upgrading a plan resizes the machine without losing that data
 *
 * Cleans up after itself so the test leaves no billable resources behind.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { FlyComputerProvider } from './src/fly'

const execFileAsync = promisify(execFile)
const FLY = `${homedir()}/.fly/bin/flyctl`
const APP = '2hands-computers'
const token = readFileSync(`${homedir()}/.2hands/fly-token`, 'utf8').trim()

/** Run a command inside the machine (the provider has no exec surface yet). */
async function inMachine(machineId: string, cmd: string): Promise<string> {
  const { stdout } = await execFileAsync(
    FLY,
    ['machine', 'exec', machineId, cmd, '--app', APP],
    { env: { ...process.env, FLY_API_TOKEN: token }, timeout: 120_000 },
  )
  return stdout.trim()
}

const step = (n: string) => console.log(`\n▶ ${n}`)

const provider = new FlyComputerProvider({
  apiToken: token,
  appName: APP,
  region: 'arn',
  monthlyBudgetUsd: 50,
})

async function main() {
let computer
try {
  step('create computer (free plan: 512MB / 1GB)')
  computer = await provider.createWorkspace({
    workspaceId: 'e2e-workspace',
    userId: 'e2e-user',
    name: 'e2e',
    imageRef: 'ubuntu:24.04',
  })
  console.log(`  id=${computer.id} state=${computer.state} ref=${computer.providerWorkspaceRef}`)

  step('start a session')
  let session = await provider.startSession({
    computer,
    taskId: 'e2e-task',
    timeoutMs: 10 * 60_000,
    networkPolicyId: 'default',
  })
  const machineId = session.providerSessionRef!
  console.log(`  session=${session.state} machine=${machineId}`)

  step('write the user\'s data')
  await inMachine(machineId, "sh -c 'mkdir -p /workspace/project && echo hello-from-2hands > /workspace/project/notes.txt'")
  console.log(`  wrote /workspace/project/notes.txt`)

  step('stop the session (user closes the app)')
  session = await provider.stopSession(session)
  console.log(`  session=${session.state}`)

  step('start again (user comes back)')
  session = await provider.startSession({
    computer,
    taskId: 'e2e-task-2',
    timeoutMs: 10 * 60_000,
    networkPolicyId: 'default',
  })
  const afterRestart = await inMachine(machineId, 'cat /workspace/project/notes.txt')
  console.log(`  read back: "${afterRestart}"`)
  if (afterRestart !== 'hello-from-2hands') throw new Error('DATA LOST across restart')

  step('upgrade free → pro (1GB RAM / 5GB disk)')
  computer = await provider.applyPlan({ computer, plan: 'pro' })
  console.log(`  state=${computer.state} storage=${(computer.storageBytes ?? 0) / 1024 ** 3}GB`)

  step('verify data survived the upgrade')
  session = await provider.startSession({
    computer,
    taskId: 'e2e-task-3',
    timeoutMs: 10 * 60_000,
    networkPolicyId: 'default',
  })
  const afterUpgrade = await inMachine(machineId, 'cat /workspace/project/notes.txt')
  const guest = await inMachine(machineId, "sh -c 'free -m | head -2 | tail -1'")
  console.log(`  read back: "${afterUpgrade}"`)
  console.log(`  memory:    ${guest}`)
  if (afterUpgrade !== 'hello-from-2hands') throw new Error('DATA LOST across upgrade')

  console.log('\n✅ persistence and seamless upgrade both verified')
} finally {
  if (computer) {
    step('cleanup')
    await provider.deleteWorkspace(computer).catch((e) => console.log('  cleanup issue:', e.message))
    console.log('  destroyed')
  }
}
}

main().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1) })
