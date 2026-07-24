import { NextRequest } from 'next/server'
import { uuidSchema } from '@/lib/validation/schemas'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { proposePublication } from '@/lib/v3/publication'

/** owner/name — no slashes beyond the separator, no traversal. */
const REPOSITORY_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})?\/[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})?$/
/** Safe git ref segment(s): alphanum plus ./-_ and inner slashes. */
const BRANCH_PATTERN = /^(?!\/)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._/-]{1,200}(?<!\/)$/

/**
 * Slice 7 — propose an exact publication (push branch + draft PR) for a task
 * that finished verification on a managed computer. Creates the R2 approval
 * with the exact repo/branch/commit/title inside the hash and parks the task
 * in awaiting_approval. NOTHING external happens here.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const { id } = await params
    if (!uuidSchema.safeParse(id).success) {
      return failure(400, 'invalid_id', 'Invalid task ID format', scope.requestId)
    }

    const body = await request.json().catch(() => null)
    const computerId = body?.computerId
    const repository = body?.repository
    const branch = body?.branch
    const prTitle = typeof body?.prTitle === 'string' ? body.prTitle.trim() : ''

    if (typeof computerId !== 'string' || !uuidSchema.safeParse(computerId).success) {
      return failure(400, 'invalid_computer_id', 'computerId must be a UUID', scope.requestId)
    }
    if (typeof repository !== 'string' || !REPOSITORY_PATTERN.test(repository)) {
      return failure(400, 'invalid_repository', "repository must look like 'owner/name'", scope.requestId)
    }
    if (typeof branch !== 'string' || !BRANCH_PATTERN.test(branch)) {
      return failure(400, 'invalid_branch', 'branch must be a safe git ref name', scope.requestId)
    }
    if (!prTitle || prTitle.length > 200) {
      return failure(400, 'invalid_pr_title', 'prTitle must be a non-empty string (max 200 chars)', scope.requestId)
    }

    const proposal = await proposePublication({
      taskId: id,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      computerId,
      repository,
      branch,
      prTitle,
    })
    return success({ proposal }, scope.requestId, 201)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
