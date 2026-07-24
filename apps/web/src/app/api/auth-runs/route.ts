import { NextRequest } from 'next/server'
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import {
  createAuthRun,
  getAuthRun,
  getLatestProviderManifest,
  listAuthRuns,
  pickSecureInputMode,
  setAuthRunSelectedMode,
  transitionAuthRun,
} from '@/lib/v3/auth-runs'

export async function GET(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const authRuns = await listAuthRuns(scope.workspaceId)
    return success({ authRuns }, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}

export async function POST(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const rateKey = createRateLimitKey(scope.userId, 'v3-auth-runs-create')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.general)
    if (!rateCheck.allowed) {
      return failure(429, 'rate_limited', 'Too many requests', scope.requestId, true)
    }

    const body = await request.json().catch(() => null)
    const providerId = typeof body?.providerId === 'string' ? body.providerId.trim() : ''
    const capability = typeof body?.capability === 'string' ? body.capability.trim() : ''
    const taskId = typeof body?.taskId === 'string' ? body.taskId : undefined
    if (!providerId || providerId.length > 64 || !capability || capability.length > 128) {
      return failure(400, 'invalid_request', 'providerId and capability are required', scope.requestId)
    }

    const manifestRow = await getLatestProviderManifest(providerId)
    if (!manifestRow) {
      return failure(404, 'unknown_provider', 'No manifest for provider', scope.requestId)
    }
    if (manifestRow.status !== 'enabled') {
      return failure(409, 'provider_disabled', 'Provider is not enabled', scope.requestId)
    }

    const run = await createAuthRun({
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      taskId,
      providerId,
      capability,
    })

    await transitionAuthRun({
      authRunId: run.id,
      expectedStatus: 'created',
      newStatus: 'selecting_method',
      actorKind: '2hands',
    })

    // Demo flow: protected-input modes go straight to awaiting_secure_input.
    const mode = pickSecureInputMode(manifestRow.manifest)
    if (mode) {
      await setAuthRunSelectedMode({ authRunId: run.id, workspaceId: scope.workspaceId, mode })
      await transitionAuthRun({
        authRunId: run.id,
        expectedStatus: 'selecting_method',
        newStatus: 'awaiting_secure_input',
        actorKind: '2hands',
        eventType: 'auth.method.selected',
        payload: { mode },
      })
    }

    const authRun = await getAuthRun(run.id, scope.workspaceId)
    return success({ authRun }, scope.requestId, 201)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
