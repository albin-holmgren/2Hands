/**
 * v3 memory collection routes (namespaced v3-memory; legacy /api/memory is
 * preserved untouched).
 *   GET  — list memory items, optional ?status= filter (proposed|active|rejected|expired)
 *   POST — propose a memory item (secret filter runs before storage)
 */
import { NextRequest } from 'next/server'
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'
import { uuidSchema } from '@/lib/validation/schemas'
import {
  listMemories,
  proposeMemory,
  MemoryRejectedError,
  type MemoryStatus,
  type MemoryType,
  type MemoryScope,
} from '@/lib/v3/memory'

const STATUSES: MemoryStatus[] = ['proposed', 'active', 'rejected', 'expired']
const TYPES: MemoryType[] = ['profile', 'project', 'episodic', 'skill', 'fact']
const SCOPES: MemoryScope[] = ['user', 'workspace', 'project']

export async function GET(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const statusParam = request.nextUrl.searchParams.get('status')
    if (statusParam && !STATUSES.includes(statusParam as MemoryStatus)) {
      return failure(400, 'invalid_status', `status must be one of: ${STATUSES.join(', ')}`, scope.requestId)
    }
    const items = await listMemories(scope.workspaceId, (statusParam as MemoryStatus) ?? undefined)
    return success({ items }, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}

export async function POST(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped
  try {
    const rateKey = createRateLimitKey(scope.userId, 'v3-memory-propose')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.general)
    if (!rateCheck.allowed) {
      return failure(429, 'rate_limited', 'Too many requests', scope.requestId, true)
    }

    const body = await request.json().catch(() => null)
    const content = typeof body?.content === 'string' ? body.content : ''
    if (!content.trim() || content.length > 2000) {
      return failure(400, 'invalid_content', 'content must be a non-empty string (max 2000 chars)', scope.requestId)
    }
    const type = body?.type
    if (!TYPES.includes(type)) {
      return failure(400, 'invalid_type', `type must be one of: ${TYPES.join(', ')}`, scope.requestId)
    }
    const memoryScope = body?.scope ?? 'workspace'
    if (!SCOPES.includes(memoryScope)) {
      return failure(400, 'invalid_scope', `scope must be one of: ${SCOPES.join(', ')}`, scope.requestId)
    }
    const sourceTaskId = typeof body?.sourceTaskId === 'string' ? body.sourceTaskId : undefined
    if (sourceTaskId && !uuidSchema.safeParse(sourceTaskId).success) {
      return failure(400, 'invalid_source_task_id', 'sourceTaskId must be a UUID', scope.requestId)
    }
    const confidence = typeof body?.confidence === 'number' ? body.confidence : undefined
    if (confidence !== undefined && (confidence < 0 || confidence > 1)) {
      return failure(400, 'invalid_confidence', 'confidence must be between 0 and 1', scope.requestId)
    }

    const item = await proposeMemory({
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      content,
      type,
      scope: memoryScope,
      sourceTaskId,
      sourceKind: typeof body?.sourceKind === 'string' ? body.sourceKind : undefined,
      confidence,
    })
    return success({ item }, scope.requestId, 201)
  } catch (error) {
    if (error instanceof MemoryRejectedError) {
      // Safe reason only — the rejected content itself is never echoed back.
      return failure(422, 'memory_rejected', `Content rejected: ${error.reason}`, scope.requestId)
    }
    return failureFromError(error, scope.requestId)
  }
}
