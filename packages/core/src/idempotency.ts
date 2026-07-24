/**
 * Idempotency key derivation for external side effects. A stable key derives
 * from the workspace, action kind, and canonical action hash so an ambiguous
 * retry maps onto the same external operation instead of repeating it.
 */
import { createHash, randomUUID } from 'node:crypto'

export function deriveIdempotencyKey(input: {
  workspaceId: string
  action: string
  canonicalActionHash: string
  /** Distinguishes deliberate re-runs of the same action (default 0). */
  attemptScope?: string | number
}): string {
  const digest = createHash('sha256')
    .update(
      [input.workspaceId, input.action, input.canonicalActionHash, String(input.attemptScope ?? 0)].join('\n'),
      'utf8',
    )
    .digest('hex')
  return `idem_${digest.slice(0, 40)}`
}

export function newRequestId(): string {
  return `req_${randomUUID()}`
}
