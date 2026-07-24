/**
 * v3 Slice 7 — publication orchestration over the Demo GitHub adapter.
 *
 * Two phases, both server-validated:
 *   propose  — task must be `verifying`; gathers the latest computer-run
 *              evidence (changed files, checkpoint), derives a deterministic
 *              commit sha, creates an EXACT approval
 *              (github.push_branch_and_draft_pr) and parks the task in
 *              `awaiting_approval`.
 *   execute  — approval must be `approved` and belong to the task; derives a
 *              stable idempotency key from the canonical action hash, resumes
 *              the task, performs the exactly-once publish, verifies the
 *              postcondition record, and completes the task with the receipt.
 */
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { deriveIdempotencyKey } from '@2hands/core'
import type { TaskStatus } from '@2hands/types/v3'
import { createApproval, getApproval, type ApprovalRow } from './approvals'
import { appendTaskEvent, getTask, transitionTask } from './tasks'
import { publishBranchAndDraftPr, type PublicationRow } from './demo-github'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (sb: ReturnType<typeof createAdminClient>, name: string) => (sb as any).from(name)

/** git-shaped 40-hex sha, deterministic per checkpoint (or per task when no checkpoint exists yet). */
export function deterministicCommitSha(latestCheckpointId: string | null, taskId: string): string {
  const seed = latestCheckpointId ?? `demo-${taskId}`
  return createHash('sha256').update(`2hands-demo-commit:${seed}`, 'utf8').digest('hex').slice(0, 40)
}

interface RunEvidence {
  diffSummary: string | null
  changedFiles: string[]
  latestCheckpointId: string | null
  latestRunId: string | null
}

/** Latest computer-run evidence for the proposal preview: changed files + checkpoint. */
async function gatherRunEvidence(workspaceId: string, computerId: string): Promise<RunEvidence> {
  const admin = createAdminClient()

  const { data: run } = await table(admin, 'computer_runs')
    .select('id, kind, status, created_at')
    .eq('computer_id', computerId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: checkpoint } = await table(admin, 'computer_checkpoints')
    .select('id, label, created_at')
    .eq('computer_id', computerId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Changed-file evidence from the append-only computer event stream.
  const { data: events } = await table(admin, 'computer_events')
    .select('type, payload')
    .eq('computer_id', computerId)
    .eq('workspace_id', workspaceId)
    .order('sequence', { ascending: true })
    .limit(500)

  const changed = new Set<string>()
  for (const event of (events ?? []) as Array<{ type: string; payload: Record<string, unknown> }>) {
    const payload = event.payload ?? {}
    if (event.type === 'agent.file.changed' || event.type === 'agent.run.file.changed') {
      const file = payload.file ?? payload.path
      if (typeof file === 'string') changed.add(file)
    }
    if (Array.isArray((payload as { changedFiles?: unknown }).changedFiles)) {
      for (const file of (payload as { changedFiles: unknown[] }).changedFiles) {
        if (typeof file === 'string') changed.add(file)
      }
    }
  }

  const changedFiles = Array.from(changed).sort()
  const parts: string[] = []
  if (changedFiles.length > 0) {
    const shown = changedFiles.slice(0, 5).join(', ')
    parts.push(
      `${changedFiles.length} file${changedFiles.length === 1 ? '' : 's'} changed (${shown}${changedFiles.length > 5 ? ', …' : ''})`,
    )
  }
  if (run) parts.push(`latest ${run.kind} run ${run.status}`)
  if (checkpoint) parts.push(`checkpoint "${checkpoint.label}"`)

  return {
    diffSummary: parts.length > 0 ? parts.join(' · ') : null,
    changedFiles,
    latestCheckpointId: checkpoint?.id ?? null,
    latestRunId: run?.id ?? null,
  }
}

export interface ProposePublicationInput {
  taskId: string
  workspaceId: string
  userId: string
  computerId: string
  repository: string
  branch: string
  prTitle: string
}

export interface PublicationProposal {
  approval: {
    id: string
    title: string
    summary: string
    riskClass: string
    category: string | null
    reversibility: string
    status: ApprovalRow['status']
    canonicalAction: Record<string, unknown>
    canonicalActionHash: string
    challenge: string
    expiresAt: string
  }
  commitSha: string
  diffSummary: string | null
  changedFiles: string[]
}

export async function proposePublication(input: ProposePublicationInput): Promise<PublicationProposal> {
  const task = await getTask(input.taskId, input.workspaceId)
  if (!task) throw new Error('Task not found')
  if (task.status !== 'verifying') {
    throw new Error(
      `Illegal transition: task is '${task.status}' — a publication is proposed from 'verifying'`,
    )
  }

  const admin = createAdminClient()
  const { data: computer } = await table(admin, 'computers')
    .select('id, name')
    .eq('id', input.computerId)
    .eq('workspace_id', input.workspaceId)
    .maybeSingle()
  if (!computer) throw new Error('Computer not found')

  const evidence = await gatherRunEvidence(input.workspaceId, input.computerId)
  const commitSha = deterministicCommitSha(evidence.latestCheckpointId, task.id)

  // Exact action: repo, branch, commit, and PR title are all inside the hash —
  // any drift between preview and execution invalidates the approval.
  const approval = await createApproval({
    workspaceId: input.workspaceId,
    taskId: task.id,
    riskClass: 'r2_external_write',
    category: 'publication',
    title: `Push branch and open draft PR on ${input.repository}`,
    summary: `${input.repository} ← ${input.branch}${evidence.diffSummary ? ` — ${evidence.diffSummary}` : ''} (Demo GitHub)`,
    action: {
      action: 'github.push_branch_and_draft_pr',
      taskId: task.id,
      target: { repository: input.repository, branch: input.branch },
      input: { commitSha, prTitle: input.prTitle },
    },
  })

  await transitionTask({
    taskId: task.id,
    expectedStatus: 'verifying',
    newStatus: 'awaiting_approval',
    actorKind: '2hands',
    eventType: 'task.waiting',
    payload: { reason: 'approval', resourceId: approval.id },
  })

  return {
    approval: {
      id: approval.id,
      title: approval.title,
      summary: approval.summary,
      riskClass: approval.risk_class,
      category: approval.category,
      reversibility: approval.reversibility,
      status: approval.status,
      canonicalAction: approval.canonical_action,
      canonicalActionHash: approval.canonical_action_hash,
      challenge: approval.challenge,
      expiresAt: approval.expires_at,
    },
    commitSha,
    diffSummary: evidence.diffSummary,
    changedFiles: evidence.changedFiles,
  }
}

export interface ExecutePublicationInput {
  taskId: string
  workspaceId: string
  userId: string
  approvalId: string
}

export interface ExecutePublicationResult {
  publication: PublicationRow
  replayed: boolean
  receiptId: string | null
  taskStatus: TaskStatus
}

export async function executePublication(input: ExecutePublicationInput): Promise<ExecutePublicationResult> {
  const task = await getTask(input.taskId, input.workspaceId)
  if (!task) throw new Error('Task not found')
  const approval = await getApproval(input.approvalId, input.workspaceId)
  if (!approval) throw new Error('Approval not found')
  if (approval.task_id !== task.id) {
    throw new Error('Approval mismatch: this approval does not belong to this task')
  }

  const action = (approval.canonical_action ?? {}) as {
    target?: { repository?: string; branch?: string }
    input?: { commitSha?: string; prTitle?: string }
  }
  const repository = action.target?.repository
  const branch = action.target?.branch
  const commitSha = action.input?.commitSha
  const prTitle = action.input?.prTitle
  if (!repository || !branch || !commitSha || !prTitle) {
    throw new Error('Approval mismatch: canonical action is not a publication action')
  }

  // Stable across retries: an ambiguous timeout maps onto the SAME publish.
  const idempotencyKey = deriveIdempotencyKey({
    workspaceId: input.workspaceId,
    action: 'github.publish',
    canonicalActionHash: approval.canonical_action_hash,
  })

  const admin = createAdminClient()
  const findReceiptId = async (): Promise<string | null> => {
    const { data } = await table(admin, 'action_receipts')
      .select('id')
      .eq('workspace_id', input.workspaceId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()
    return data?.id ?? null
  }

  // Idempotent replay after full completion: return the existing outcome.
  if (task.status === 'completed' && approval.status === 'consumed') {
    const replay = await publishBranchAndDraftPr({
      workspaceId: input.workspaceId,
      taskId: task.id,
      approvalId: approval.id,
      actionHash: approval.canonical_action_hash,
      repository,
      branch,
      commitSha,
      prTitle,
      idempotencyKey,
    })
    if (replay.status === 'published') {
      return {
        publication: replay.publication,
        replayed: true,
        receiptId: task.receipt_id ?? (await findReceiptId()),
        taskStatus: 'completed',
      }
    }
    throw new Error('Task is already completed but the publication record is missing')
  }

  if (approval.status !== 'approved') {
    throw new Error(
      `Illegal transition: approval is '${approval.status}' — it must be approved before executing`,
    )
  }

  if (task.status === 'awaiting_approval') {
    await transitionTask({
      taskId: task.id,
      expectedStatus: 'awaiting_approval',
      newStatus: 'running',
      actorKind: '2hands',
      eventType: 'task.resumed',
      payload: { reason: 'approval_granted', resourceId: approval.id },
    })
  } else if (task.status !== 'running') {
    // 'running' is allowed for crash recovery between resume and publish.
    throw new Error(
      `Illegal transition: task is '${task.status}' — a publication executes from 'awaiting_approval'`,
    )
  }

  const result = await publishBranchAndDraftPr({
    workspaceId: input.workspaceId,
    taskId: task.id,
    approvalId: approval.id,
    actionHash: approval.canonical_action_hash,
    repository,
    branch,
    commitSha,
    prTitle,
    idempotencyKey,
  })

  if (result.status === 'rejected') {
    await transitionTask({
      taskId: task.id,
      expectedStatus: 'running',
      newStatus: 'failed',
      actorKind: 'system',
      eventType: 'task.failed',
      payload: {
        code: 'approval_not_consumable',
        message: 'The approval could not be consumed; nothing was published.',
        retryable: false,
        safeError: {
          code: 'approval_not_consumable',
          message: 'The approval could not be consumed; nothing was published.',
          retryable: false,
        },
      },
    })
    throw new Error('Approval already consumed, denied, or expired — nothing was published')
  }

  const receiptId = await findReceiptId()

  // Postcondition verification: the immutable publication record IS the
  // demo provider's branch+draft-PR evidence (branch-exists / exactly-one-PR).
  await transitionTask({
    taskId: task.id,
    expectedStatus: 'running',
    newStatus: 'verifying',
    actorKind: '2hands',
    eventType: 'task.verification.started',
    payload: { postconditions: ['branch_exists', 'exactly_one_draft_pr'] },
  })
  await appendTaskEvent({
    taskId: task.id,
    type: 'task.verification.completed',
    actorKind: '2hands',
    payload: {
      success: true,
      repository,
      branch,
      prNumber: result.publication.pr_number,
      publicationId: result.publication.id,
    },
  })

  await transitionTask({
    taskId: task.id,
    expectedStatus: 'verifying',
    newStatus: 'completed',
    actorKind: '2hands',
    eventType: 'task.completed',
    payload: receiptId ? { receiptId } : {},
  })

  if (receiptId) {
    const { error: updateError } = await table(admin, 'tasks')
      .update({ receipt_id: receiptId })
      .eq('id', task.id)
      .eq('workspace_id', input.workspaceId)
    if (updateError) throw new Error(`setting task receipt failed: ${updateError.message}`)
  }

  return {
    publication: result.publication,
    replayed: result.replayed,
    receiptId,
    taskStatus: 'completed',
  }
}
