/**
 * Run Claude Code on the user's hosted computer, from chat.
 *
 * This is the first real execution path behind "Voice in. Work happens." —
 * the user asks for something, and it actually runs on their persistent Fly
 * machine, in /workspace, where the results stay when the machine stops.
 *
 * The agent runs on the user's own Claude credential, resolved through the
 * Account Broker at the moment of injection — 2Hands navigates and delegates,
 * it never executes on its own keys. Mechanics proven end to end on
 * 2026-07-31: Claude Code 2.1.220 installed and ran inside a Fly machine,
 * and with a valid credential produced the requested artifact.
 *
 * Jobs are asynchronous by nature: Claude Code takes seconds to minutes. We
 * wait inline for a bounded window so short jobs feel instant, and hand back
 * a job id for anything longer — the model then tells the user honestly that
 * work is underway rather than stalling the whole conversation.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import type { ComputerWorkspace } from '@2hands/types/v3'
import { FlyComputerProvider } from '@2hands/computer'
import {
  createComputer,
  flyOptions,
  selectedProviderId,
  type ComputerRow,
} from '@/lib/v3/computers'
import { resolveAgentCredential } from '@/lib/v3/agent-connect'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (sb: ReturnType<typeof createAdminClient>, name: string) => (sb as any).from(name)

/** How long a chat turn will wait before handing back a job id instead. */
const INLINE_WAIT_MS = 90_000
const POLL_INTERVAL_MS = 5_000

export type AgentJobOutcome =
  | { status: 'done'; output: string; computerName: string }
  | { status: 'failed'; error: string; computerName: string }
  | { status: 'running'; jobId: string; computerId: string; computerName: string }
  | { status: 'unavailable'; reason: string }
  /**
   * No agent connected. Deliberately its own status rather than 'failed':
   * the fix is an action the user takes (connect their Claude account), not
   * a retry, and the assistant should say exactly that.
   */
  | { status: 'not_connected'; reason: string }

function rowToWorkspace(row: ComputerRow): ComputerWorkspace {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ownerUserId: row.owner_user_id,
    provider: row.provider,
    providerWorkspaceRef: row.provider_workspace_ref ?? undefined,
    name: row.name,
    state: row.state as ComputerWorkspace['state'],
    imageRef: row.image_ref,
    blueprintVersion: row.blueprint_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** The user's Fly computer, created on first use — nobody should have to "set up" one. */
async function findOrCreateComputer(userId: string): Promise<ComputerRow> {
  const admin = createAdminClient()

  const { data: existing } = await table(admin, 'computers')
    .select('*')
    .eq('owner_user_id', userId)
    .eq('provider', 'fly')
    .neq('state', 'deleted')
    .order('created_at', { ascending: true })
    .limit(1)

  if (existing?.length) return existing[0] as ComputerRow

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: wsId, error: wsError } = await (admin as any).rpc('ensure_personal_workspace', {
    p_user_id: userId,
  })
  if (wsError || !wsId) {
    throw new Error(`Could not resolve a workspace: ${wsError?.message ?? 'no id returned'}`)
  }

  return createComputer({
    workspaceId: String(wsId),
    userId,
    name: 'My computer',
  })
}

function parseClaudeResult(resultJson: string): { ok: boolean; text: string } {
  try {
    const parsed = JSON.parse(resultJson) as { is_error?: boolean; result?: string }
    return { ok: !parsed.is_error, text: String(parsed.result ?? '') }
  } catch {
    // The job wrote something unparseable — surface it raw rather than
    // pretending the job produced nothing.
    return { ok: false, text: resultJson.slice(0, 500) }
  }
}

export async function runOnComputer(input: {
  userId: string
  prompt: string
}): Promise<AgentJobOutcome> {
  if (selectedProviderId() !== 'fly') {
    return {
      status: 'unavailable',
      reason:
        'Hosted computers are not enabled in this environment (COMPUTER_PROVIDER is not fly).',
    }
  }
  // 2Hands never executes on its own credentials — no fallback to any
  // 2Hands-owned key, ever. The user's agent, the user's account, their bill.
  const credential = await resolveAgentCredential(input.userId)
  if (!credential) {
    return {
      status: 'not_connected',
      reason:
        'No coding agent is connected. The user needs to connect their Claude ' +
        'account (an Anthropic API key, or a Claude Code token from ' +
        '`claude setup-token`) before work can run on their computer.',
    }
  }

  const row = await findOrCreateComputer(input.userId)
  const provider = new FlyComputerProvider(flyOptions())
  const computer = rowToWorkspace(row)

  const session = await provider.startSession({
    computer,
    taskId: `chat-${Date.now()}`,
    timeoutMs: 30 * 60_000,
    networkPolicyId: 'default',
  })

  const jobId = crypto.randomUUID()
  await provider.runAgentJob({
    computer,
    jobId,
    prompt: input.prompt,
    credential: { envName: credential.envName, value: credential.value },
    // No model override: the agent runs whatever the user's own plan or key
    // defaults to. Their account, their model choice.
  })

  const deadline = Date.now() + INLINE_WAIT_MS
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    const poll = await provider.pollAgentJob({ computer, jobId })
    if (poll.done) {
      await provider.stopSession(session).catch(() => undefined)
      const parsed = parseClaudeResult(poll.resultJson)
      return parsed.ok
        ? { status: 'done', output: parsed.text, computerName: row.name }
        : {
            status: 'failed',
            error: parsed.text || poll.stderr || `exit code ${poll.exitCode}`,
            computerName: row.name,
          }
    }
  }

  // Still going. The machine stays up so the job can finish; a later
  // check_computer_job stops it. The session timeout above bounds the cost of
  // a job nobody ever asks about again.
  return { status: 'running', jobId, computerId: row.id, computerName: row.name }
}

export async function checkComputerJob(input: {
  userId: string
  jobId: string
}): Promise<AgentJobOutcome> {
  if (selectedProviderId() !== 'fly') {
    return { status: 'unavailable', reason: 'Hosted computers are not enabled.' }
  }

  const admin = createAdminClient()
  const { data } = await table(admin, 'computers')
    .select('*')
    .eq('owner_user_id', input.userId)
    .eq('provider', 'fly')
    .neq('state', 'deleted')
    .limit(1)
  if (!data?.length) {
    return { status: 'unavailable', reason: 'No computer found for this account.' }
  }

  const row = data[0] as ComputerRow
  const provider = new FlyComputerProvider(flyOptions())
  const computer = rowToWorkspace(row)

  const poll = await provider.pollAgentJob({ computer, jobId: input.jobId })
  if (!poll.done) {
    return { status: 'running', jobId: input.jobId, computerId: row.id, computerName: row.name }
  }

  // Job finished — the machine has nothing left to do.
  await provider
    .stopSession({
      id: input.jobId,
      computerId: row.id,
      taskId: 'check',
      providerSessionRef: computer.providerWorkspaceRef?.split(':')[0],
      state: 'ready',
      expiresAt: new Date().toISOString(),
    })
    .catch(() => undefined)

  const parsed = parseClaudeResult(poll.resultJson)
  return parsed.ok
    ? { status: 'done', output: parsed.text, computerName: row.name }
    : {
        status: 'failed',
        error: parsed.text || poll.stderr || `exit code ${poll.exitCode}`,
        computerName: row.name,
      }
}
