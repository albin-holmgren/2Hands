import { NextRequest } from 'next/server'
import { uuidSchema } from '@/lib/validation/schemas'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { getLatestProviderManifest } from '@/lib/v3/auth-runs'
import { consumeVerification, getVerificationExpectation } from '@/lib/v3/email-verification'

/**
 * Consume a found verification candidate.
 *
 * Use-policy enforcement:
 *  - 'manual' and 'ask_each_time' REQUIRE this explicit user action — the
 *    authenticated request itself is the user's approval;
 *  - automatic consumption (body {automatic: true}, orchestrator-driven) is
 *    permitted ONLY when the expectation's use_policy is
 *    'automatic_if_policy_allows' AND the provider manifest's
 *    emailVerification.defaultMode also says 'automatic_if_policy_allows'.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const { id } = await params
    if (!uuidSchema.safeParse(id).success) {
      return failure(400, 'invalid_id', 'Invalid expectation ID format', scope.requestId)
    }

    const expectation = await getVerificationExpectation(id, scope.workspaceId)
    if (!expectation) return failure(404, 'not_found', 'Expectation not found', scope.requestId)

    const body = await request.json().catch(() => null)
    const automatic = body?.automatic === true

    if (automatic) {
      if (expectation.use_policy !== 'automatic_if_policy_allows') {
        return failure(
          403,
          'user_action_required',
          `use_policy '${expectation.use_policy}' requires an explicit user consume action`,
          scope.requestId,
        )
      }
      const manifestRow = await getLatestProviderManifest(expectation.provider_id)
      const emailVerification = (manifestRow?.manifest as { emailVerification?: { defaultMode?: string } } | undefined)
        ?.emailVerification
      if (emailVerification?.defaultMode !== 'automatic_if_policy_allows') {
        return failure(
          403,
          'manifest_requires_user_action',
          'Provider manifest does not allow automatic verification consumption',
          scope.requestId,
        )
      }
    }

    await consumeVerification(id, scope.userId)
    const updated = await getVerificationExpectation(id, scope.workspaceId)
    return success({ expectation: updated }, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
