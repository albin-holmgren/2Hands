/**
 * Safe event envelope helpers. Envelopes are the only shape that crosses the
 * task-event boundary; secret-bearing values are not representable here and
 * payloads are validated against a denylist of secret-shaped keys as a last
 * line of defense (primary defense is that secrets never reach this layer).
 */
import { ALL_EVENT_TYPES, type EventEnvelope, type TwoHandsEventType } from '@2hands/types/v3'

const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set(ALL_EVENT_TYPES)

/** Keys that must never appear in a safe event payload, at any depth. */
const FORBIDDEN_PAYLOAD_KEYS = [
  'password',
  'passphrase',
  'secret',
  'secretValue',
  'otp',
  'otpCode',
  'verificationCode',
  'magicLink',
  'apiKey',
  'api_key',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'cookie',
  'cookies',
  'authorization',
  'cardNumber',
  'cvv',
  'recoveryCode',
] as const

export class UnsafeEventPayloadError extends Error {
  constructor(public readonly key: string, public readonly path: string) {
    super(`Event payload contains forbidden key "${key}" at ${path}`)
    this.name = 'UnsafeEventPayloadError'
  }
}

export function assertSafeEventPayload(payload: unknown, path = 'payload'): void {
  if (payload === null || typeof payload !== 'object') return
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertSafeEventPayload(item, `${path}[${i}]`))
    return
  }
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const lowered = key.toLowerCase()
    for (const forbidden of FORBIDDEN_PAYLOAD_KEYS) {
      if (lowered === forbidden.toLowerCase()) {
        throw new UnsafeEventPayloadError(key, `${path}.${key}`)
      }
    }
    assertSafeEventPayload(value, `${path}.${key}`)
  }
}

export function isKnownEventType(type: string): type is TwoHandsEventType {
  return KNOWN_EVENT_TYPES.has(type)
}

export interface BuildEnvelopeInput<TPayload> {
  id: string
  type: string
  workspaceId: string
  conversationId?: string
  taskId?: string
  runId?: string
  occurredAt?: string
  sequence: number
  actor: EventEnvelope['actor']
  payload: TPayload
}

/** Build a validated safe event envelope. Throws on unsafe payloads. */
export function buildEventEnvelope<TPayload>(
  input: BuildEnvelopeInput<TPayload>,
): EventEnvelope<string, TPayload> {
  assertSafeEventPayload(input.payload)
  return {
    id: input.id,
    version: 1,
    type: input.type,
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    taskId: input.taskId,
    runId: input.runId,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    sequence: input.sequence,
    actor: input.actor,
    payload: input.payload,
  }
}

/** Map a task_events database row to the wire envelope. */
export interface TaskEventRow {
  id: string
  version: number
  task_id: string
  workspace_id: string
  conversation_id: string | null
  run_id: string | null
  type: string
  sequence: number | string
  actor_kind: 'user' | '2hands' | 'agent' | 'connector' | 'system'
  actor_id: string | null
  occurred_at: string
  payload: Record<string, unknown>
}

export function envelopeFromRow(row: TaskEventRow): EventEnvelope {
  return {
    id: row.id,
    version: 1,
    type: row.type,
    workspaceId: row.workspace_id,
    conversationId: row.conversation_id ?? undefined,
    taskId: row.task_id,
    runId: row.run_id ?? undefined,
    occurredAt: row.occurred_at,
    sequence: typeof row.sequence === 'string' ? Number(row.sequence) : row.sequence,
    actor: { kind: row.actor_kind, id: row.actor_id ?? undefined },
    payload: row.payload,
  }
}
