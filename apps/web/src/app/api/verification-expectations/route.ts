import { NextRequest } from 'next/server'
import { uuidSchema } from '@/lib/validation/schemas'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { getAuthRun, getLatestProviderManifest } from '@/lib/v3/auth-runs'
import { createVerificationExpectation } from '@/lib/v3/email-verification'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const VALID_TYPES = new Set(['otp', 'magic_link'])
const VALID_POLICIES = new Set(['manual', 'ask_each_time', 'automatic_if_policy_allows'])

interface ManifestEmailVerificationBlock {
  supported?: boolean
  defaultMode?: string
  senderDomains?: string[]
  subjectHints?: string[]
  types?: Array<'otp' | 'magic_link'>
  maximumAgeSeconds?: number
}

function readEmailVerificationBlock(
  manifest: Record<string, unknown> | undefined,
): ManifestEmailVerificationBlock | null {
  const block = manifest?.emailVerification
  if (!block || typeof block !== 'object' || Array.isArray(block)) return null
  return block as ManifestEmailVerificationBlock
}

/**
 * Create a verification expectation for an ACTIVE auth run in this workspace.
 * The expectation must exist BEFORE any mailbox search; sender domains and
 * types default from the provider manifest and the TTL is capped by the
 * manifest's maximumAgeSeconds.
 */
export async function POST(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const body = await request.json().catch(() => null)
    const authRunId = body?.authRunId
    if (!uuidSchema.safeParse(authRunId).success) {
      return failure(400, 'invalid_auth_run_id', 'authRunId (uuid) is required', scope.requestId)
    }

    // The auth run must belong to this workspace and still be active.
    const run = await getAuthRun(authRunId, scope.workspaceId)
    if (!run) return failure(404, 'auth_run_not_found', 'Auth run not found', scope.requestId)
    if (['completed', 'failed', 'cancelled', 'expired'].includes(run.status)) {
      return failure(409, 'auth_run_not_active', `Auth run is ${run.status}`, scope.requestId)
    }

    const manifestRow = await getLatestProviderManifest(run.provider_id)
    const emailVerification = readEmailVerificationBlock(manifestRow?.manifest)
    if (emailVerification && emailVerification.supported === false) {
      return failure(409, 'verification_not_supported', 'Provider does not support email verification', scope.requestId)
    }

    const targetEmail = typeof body?.targetEmail === 'string' ? body.targetEmail.trim() : ''
    if (!targetEmail || targetEmail.length > 320 || !EMAIL_PATTERN.test(targetEmail)) {
      return failure(400, 'invalid_target_email', 'targetEmail must be a valid email address', scope.requestId)
    }

    const manifestDomains = Array.isArray(emailVerification?.senderDomains)
      ? emailVerification.senderDomains.filter((d): d is string => typeof d === 'string')
      : []
    const requestedDomains = Array.isArray(body?.allowedSenderDomains)
      ? (body.allowedSenderDomains as unknown[]).filter((d): d is string => typeof d === 'string' && d.length > 0)
      : null
    const allowedSenderDomains = requestedDomains ?? manifestDomains
    if (allowedSenderDomains.length === 0) {
      return failure(400, 'missing_sender_domains', 'allowedSenderDomains is required (no manifest default)', scope.requestId)
    }
    // Requested domains must stay inside the manifest allowlist when one exists.
    if (requestedDomains && manifestDomains.length > 0) {
      const manifestSet = new Set(manifestDomains.map((d) => d.toLowerCase()))
      if (!requestedDomains.every((d) => manifestSet.has(d.toLowerCase()))) {
        return failure(400, 'sender_domain_not_in_manifest', 'allowedSenderDomains must be within the provider manifest allowlist', scope.requestId)
      }
    }

    const manifestTypes = Array.isArray(emailVerification?.types) ? emailVerification.types : null
    const requestedTypes = Array.isArray(body?.allowedTypes) ? (body.allowedTypes as unknown[]) : null
    const allowedTypes = (requestedTypes ?? manifestTypes ?? ['otp']).filter(
      (t): t is 'otp' | 'magic_link' => typeof t === 'string' && VALID_TYPES.has(t),
    )
    if (allowedTypes.length === 0) {
      return failure(400, 'invalid_allowed_types', "allowedTypes must include 'otp' and/or 'magic_link'", scope.requestId)
    }

    const usePolicy =
      typeof body?.usePolicy === 'string' && VALID_POLICIES.has(body.usePolicy)
        ? (body.usePolicy as 'manual' | 'ask_each_time' | 'automatic_if_policy_allows')
        : ((emailVerification?.defaultMode && VALID_POLICIES.has(emailVerification.defaultMode)
            ? emailVerification.defaultMode
            : 'ask_each_time') as 'manual' | 'ask_each_time' | 'automatic_if_policy_allows')

    const subjectHints = Array.isArray(body?.subjectHints)
      ? (body.subjectHints as unknown[]).filter((h): h is string => typeof h === 'string').slice(0, 10)
      : undefined

    let ttlMs = typeof body?.ttlMs === 'number' && body.ttlMs > 0 ? body.ttlMs : 10 * 60 * 1000
    const maxAgeSeconds = emailVerification?.maximumAgeSeconds
    if (typeof maxAgeSeconds === 'number' && maxAgeSeconds > 0) {
      ttlMs = Math.min(ttlMs, maxAgeSeconds * 1000)
    }

    const expectation = await createVerificationExpectation({
      authRunId,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      providerId: run.provider_id,
      targetEmail,
      allowedSenderDomains,
      allowedTypes,
      subjectHints,
      usePolicy,
      ttlMs,
    })
    return success({ expectation }, scope.requestId, 201)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
