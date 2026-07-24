/**
 * Canonical serialization and hashing for exact approvals.
 *
 * The approval hash covers the canonical action object:
 *   (task_id, run_id, capability, target account/repository, normalized input,
 *    branch/commit or file hashes, attachment hashes, cost ceiling,
 *    policy version, expires_at)
 * Any material payload change produces a different hash and invalidates the
 * approval (docs/v3/IMPLEMENTATION_MAP.md §3.5).
 */
import { createHash } from 'node:crypto'

/**
 * Deterministic JSON: object keys sorted lexicographically at every depth,
 * arrays preserved in order, no insignificant whitespace. `undefined` object
 * members are dropped (matching JSON.stringify); `undefined` array slots and
 * non-finite numbers are rejected — approval payloads must be plain data.
 */
export function canonicalJson(value: unknown): string {
  return serialize(value)
}

function serialize(value: unknown): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value)
    case 'number':
      if (!Number.isFinite(value)) {
        throw new TypeError('canonicalJson: non-finite numbers are not representable')
      }
      return JSON.stringify(value)
    case 'boolean':
      return value ? 'true' : 'false'
    case 'undefined':
      throw new TypeError('canonicalJson: cannot serialize undefined at top level or in arrays')
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((item) => serialize(item)).join(',')}]`
      }
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${serialize(v)}`).join(',')}}`
    }
    default:
      throw new TypeError(`canonicalJson: cannot serialize ${typeof value}`)
  }
}

/** SHA-256 over the canonical JSON form, hex-encoded with an algorithm prefix. */
export function canonicalActionHash(action: Record<string, unknown>): string {
  const digest = createHash('sha256').update(canonicalJson(action), 'utf8').digest('hex')
  return `sha256:${digest}`
}

/** Constant-shape equality check: does the presented action match the hash? */
export function actionMatchesHash(action: Record<string, unknown>, hash: string): boolean {
  return canonicalActionHash(action) === hash
}
