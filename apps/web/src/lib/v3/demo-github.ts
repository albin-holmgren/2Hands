/**
 * Demo GitHub publication adapter — deterministic, approval-gated,
 * exactly-once branch push + draft PR records. The real GitHub App adapter
 * implements the same contract against the GitHub API with short-lived
 * post-approval credentials.
 *
 * Exactly-once protocol (survives retries and ambiguous timeouts):
 *   1. replay check — an existing record under this idempotency key is
 *      returned as-is (reconciliation after ambiguity);
 *   2. exact-approval consumption — v3_consume_approval succeeds once;
 *   3. insert the immutable publication record (unique key backstop);
 *   4. immutable receipt.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { consumeApproval, createReceipt } from './approvals'
import { appendTaskEvent } from './tasks'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (sb: ReturnType<typeof createAdminClient>, name: string) => (sb as any).from(name)
const rpc = (sb: ReturnType<typeof createAdminClient>, name: string, args: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb as any).rpc(name, args)

export interface PublicationRow {
  id: string
  workspace_id: string
  task_id: string | null
  approval_id: string | null
  repository: string
  branch: string
  commit_sha: string
  pr_number: number | null
  pr_title: string | null
  pr_draft: boolean
  diff_summary: string | null
  idempotency_key: string
  created_at: string
}

export interface PublishInput {
  workspaceId: string
  taskId?: string
  approvalId: string
  /** Hash the approval was granted for — must still match. */
  actionHash: string
  repository: string
  branch: string
  commitSha: string
  prTitle: string
  diffSummary?: string
  idempotencyKey: string
}

export type PublishResult =
  | { status: 'published'; publication: PublicationRow; replayed: boolean }
  | { status: 'rejected'; reason: 'approval_not_consumable' }

export async function publishBranchAndDraftPr(input: PublishInput): Promise<PublishResult> {
  const admin = createAdminClient()

  // 1. Idempotent replay: same key → same publication, no second side effect.
  const { data: existing } = await table(admin, 'demo_github_publications')
    .select('*')
    .eq('workspace_id', input.workspaceId)
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle()
  if (existing) {
    return { status: 'published', publication: existing as PublicationRow, replayed: true }
  }

  // 2. Exact approval consumption — single use, hash must still match.
  const consumed = await consumeApproval({ approvalId: input.approvalId, actionHash: input.actionHash })
  if (!consumed) {
    return { status: 'rejected', reason: 'approval_not_consumable' }
  }

  // 3. Record the publication (unique index backstops races).
  const { data: prNumber, error: prError } = await rpc(admin, 'v3_next_demo_pr_number', {
    p_workspace_id: input.workspaceId,
  })
  if (prError) throw new Error(`pr number failed: ${prError.message}`)

  const { data: publication, error } = await table(admin, 'demo_github_publications')
    .insert({
      workspace_id: input.workspaceId,
      task_id: input.taskId ?? null,
      approval_id: input.approvalId,
      repository: input.repository,
      branch: input.branch,
      commit_sha: input.commitSha,
      pr_number: prNumber,
      pr_title: input.prTitle,
      pr_draft: true,
      diff_summary: input.diffSummary ?? null,
      idempotency_key: input.idempotencyKey,
    })
    .select('*')
    .single()
  if (error) {
    // Race lost to a concurrent identical publish: reconcile to the winner.
    if (String(error.message).includes('duplicate key')) {
      const { data: winner } = await table(admin, 'demo_github_publications')
        .select('*')
        .eq('workspace_id', input.workspaceId)
        .eq('idempotency_key', input.idempotencyKey)
        .single()
      return { status: 'published', publication: winner as PublicationRow, replayed: true }
    }
    throw new Error(`publication insert failed: ${error.message}`)
  }

  // 4. Receipt + task event.
  const receipt = await createReceipt({
    workspaceId: input.workspaceId,
    taskId: input.taskId,
    approvalId: input.approvalId,
    kind: 'github.publication',
    title: `Draft PR #${prNumber}: ${input.prTitle}`,
    summary: `Pushed ${input.branch} (${input.commitSha.slice(0, 8)}) and opened draft PR #${prNumber} on ${input.repository} (Demo GitHub).`,
    evidence: [
      { kind: 'branch', ref: input.branch },
      { kind: 'commit', ref: input.commitSha },
      { kind: 'pull_request', ref: `demo#${prNumber}`, label: input.prTitle },
    ],
    provider: 'demo-github',
    providerRequestRef: (publication as PublicationRow).id,
    idempotencyKey: input.idempotencyKey,
    outcome: 'success',
  })

  if (input.taskId) {
    await appendTaskEvent({
      taskId: input.taskId,
      type: 'publication.completed',
      actorKind: 'connector',
      payload: {
        provider: 'demo-github',
        repository: input.repository,
        branch: input.branch,
        prNumber,
        receiptId: receipt.id,
      },
    })
  }

  return { status: 'published', publication: publication as PublicationRow, replayed: false }
}

export async function listPublications(workspaceId: string): Promise<PublicationRow[]> {
  const admin = createAdminClient()
  const { data, error } = await table(admin, 'demo_github_publications')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`listPublications failed: ${error.message}`)
  return (data ?? []) as PublicationRow[]
}
