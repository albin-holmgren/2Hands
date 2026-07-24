import { NextRequest } from 'next/server'
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import {
  createSpendingMandate,
  listSpendingMandates,
  type MandateInterval,
} from '@/lib/v3/billing'

const INTERVALS: MandateInterval[] = ['one_time', 'monthly', 'yearly']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const mandates = await listSpendingMandates(scope.workspaceId)
    return success({ mandates }, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}

export async function POST(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const rateKey = createRateLimitKey(scope.userId, 'v3-spending-mandates-create')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.general)
    if (!rateCheck.allowed) {
      return failure(429, 'rate_limited', 'Too many requests', scope.requestId, true)
    }

    const body = await request.json().catch(() => null)
    const providerId = typeof body?.providerId === 'string' ? body.providerId.trim() : ''
    const merchant = typeof body?.merchant === 'string' ? body.merchant.trim() : ''
    const planLabel = typeof body?.planLabel === 'string' ? body.planLabel.trim() : undefined
    const currency = typeof body?.currency === 'string' ? body.currency.trim() : ''
    const maxFirstAmountMinor = Number(body?.maxFirstAmountMinor)
    const maxRecurringAmountMinor = Number(body?.maxRecurringAmountMinor)
    const interval = body?.interval as MandateInterval
    const countryAllowlist = Array.isArray(body?.countryAllowlist)
      ? body.countryAllowlist.filter((c: unknown): c is string => typeof c === 'string')
      : []
    const expiresAt = typeof body?.expiresAt === 'string' ? body.expiresAt : ''
    const approvalId = typeof body?.approvalId === 'string' ? body.approvalId : ''

    if (!providerId || !merchant || !/^[A-Za-z]{3}$/.test(currency)) {
      return failure(400, 'invalid_request', 'providerId, merchant and 3-letter currency are required', scope.requestId)
    }
    if (
      !Number.isSafeInteger(maxFirstAmountMinor) || maxFirstAmountMinor < 0 ||
      !Number.isSafeInteger(maxRecurringAmountMinor) || maxRecurringAmountMinor < 0
    ) {
      return failure(400, 'invalid_request', 'amounts must be non-negative integer minor units', scope.requestId)
    }
    if (!INTERVALS.includes(interval)) {
      return failure(400, 'invalid_request', 'interval must be one_time|monthly|yearly', scope.requestId)
    }
    if (!expiresAt || Number.isNaN(Date.parse(expiresAt))) {
      return failure(400, 'invalid_request', 'expiresAt must be an ISO timestamp', scope.requestId)
    }
    if (!UUID_RE.test(approvalId)) {
      return failure(400, 'invalid_request', 'approvalId (uuid) is required — mandates need an exact approval', scope.requestId)
    }

    const mandate = await createSpendingMandate({
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      providerId,
      merchant,
      planLabel,
      currency,
      maxFirstAmountMinor,
      maxRecurringAmountMinor,
      interval,
      countryAllowlist,
      expiresAt,
      approvalId,
    })
    return success({ mandate }, scope.requestId, 201)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
