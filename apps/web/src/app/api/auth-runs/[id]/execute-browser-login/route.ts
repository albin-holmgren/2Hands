/**
 * POST /api/auth-runs/:id/execute-browser-login
 *
 * Drives the deterministic browser login for a demo-provider auth run whose
 * secure input (email + password) has already been supplied. Transitions
 * awaiting_secure_input -> browser_running, then runs the orchestrated login
 * inline (the demo site is same-origin localhost; acceptable in dev) with a
 * 60s budget and returns the final run state.
 *
 * Real providers are rejected with 501 until they are individually enabled
 * for automated browser login.
 */
import { NextRequest } from 'next/server'
import { DEMO_PROVIDER_ID } from '@2hands/browser'
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { uuidSchema } from '@/lib/validation/schemas'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { getAuthRun, transitionAuthRun } from '@/lib/v3/auth-runs'
import {
  performDemoBrowserLogin,
  type PerformDemoBrowserLoginResult,
} from '@/lib/v3/auth-orchestrator'

export const maxDuration = 60

const LOGIN_BUDGET_MS = 60 * 1000

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const { id } = await params
    if (!uuidSchema.safeParse(id).success) {
      return failure(400, 'invalid_id', 'Invalid auth run ID format', scope.requestId)
    }

    const rateKey = createRateLimitKey(scope.userId, 'v3-auth-runs-browser-login')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.general)
    if (!rateCheck.allowed) {
      return failure(429, 'rate_limited', 'Too many requests', scope.requestId, true)
    }

    const run = await getAuthRun(id, scope.workspaceId)
    if (!run) return failure(404, 'not_found', 'Auth run not found', scope.requestId)
    if (run.user_id !== scope.userId) {
      return failure(403, 'forbidden', 'Auth run belongs to a different user', scope.requestId)
    }
    if (run.provider_id !== DEMO_PROVIDER_ID) {
      return failure(
        501,
        'provider_not_enabled_for_browser_login',
        'Automated browser login is not enabled for this provider',
        scope.requestId,
      )
    }
    if (run.status !== 'awaiting_secure_input') {
      return failure(409, 'invalid_state', 'Auth run is not awaiting secure input', scope.requestId)
    }
    if (new Date(run.expires_at).getTime() <= Date.now()) {
      return failure(409, 'expired', 'Auth run has expired', scope.requestId)
    }

    await transitionAuthRun({
      authRunId: run.id,
      expectedStatus: 'awaiting_secure_input',
      newStatus: 'browser_running',
      actorKind: '2hands',
      eventType: 'auth.browser.started',
      payload: { providerId: run.provider_id, mode: 'user_browser_session' },
    })

    // Inline with a hard budget. performDemoBrowserLogin never throws for
    // login failures — it fails the run with a safe code and returns.
    const result = await Promise.race<PerformDemoBrowserLoginResult | 'timeout'>([
      performDemoBrowserLogin({ authRunId: run.id }),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), LOGIN_BUDGET_MS)),
    ])

    if (result === 'timeout') {
      // Best-effort fail; the in-flight orchestration's later transitions
      // fail closed against the state machine.
      try {
        const current = await getAuthRun(run.id, scope.workspaceId)
        if (current && !['completed', 'failed', 'cancelled', 'expired'].includes(current.status)) {
          await transitionAuthRun({
            authRunId: run.id,
            expectedStatus: current.status,
            newStatus: 'failed',
            actorKind: 'system',
            eventType: 'auth.failed',
            payload: {
              safeError: { code: 'browser_login_timeout', message: 'Browser login timed out', retryable: true },
            },
          })
        }
      } catch {
        // Raced with the orchestrator's own terminal transition.
      }
      const authRun = await getAuthRun(run.id, scope.workspaceId)
      return success({ authRun, timedOut: true }, scope.requestId)
    }

    const authRun = await getAuthRun(run.id, scope.workspaceId)
    return success(
      {
        authRun,
        result: {
          status: result.status,
          providerAccountId: result.providerAccountId,
          receiptId: result.receiptId,
          safeErrorCode: result.safeErrorCode,
        },
      },
      scope.requestId,
    )
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
