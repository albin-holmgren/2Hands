/**
 * Runner job leases — signed, bounded authority for every runner operation.
 *
 * The control plane signs a lease binding user/workspace/computer/session/
 * task to allowed paths, operations, policies, runtime and credit ceilings,
 * publish flags, nonce, and expiry. The runner validates before every
 * operation and fails closed. Replay is prevented by nonce tracking on the
 * runner plus short expiries.
 */
import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils'
import { randomBytes } from '@noble/ciphers/webcrypto'
import type { RunnerJobLease, RunnerOperation } from '@2hands/types/v3'

export type UnsignedRunnerLease = Omit<RunnerJobLease, 'signature'>

export const RUNNER_LEASE_ISSUER = '2hands-control-plane'

function canonicalLeaseBody(lease: UnsignedRunnerLease): string {
  const body: Record<string, unknown> = {
    allowedOperations: [...lease.allowedOperations].sort(),
    allowedPaths: [...lease.allowedPaths].sort(),
    commandPolicyId: lease.commandPolicyId,
    computerId: lease.computerId,
    expiresAt: lease.expiresAt,
    id: lease.id,
    issuer: RUNNER_LEASE_ISSUER,
    maximumCredits: lease.maximumCredits,
    maximumRuntimeMs: lease.maximumRuntimeMs,
    networkPolicyId: lease.networkPolicyId,
    nonce: lease.nonce,
    publishAllowed: lease.publishAllowed,
    sessionId: lease.sessionId,
    taskId: lease.taskId,
    userId: lease.userId,
    workspaceId: lease.workspaceId,
  }
  return JSON.stringify(body)
}

export function signRunnerLease(unsigned: UnsignedRunnerLease, signingKeyHex: string): RunnerJobLease {
  const mac = hmac(sha256, hexToBytes(signingKeyHex), utf8ToBytes(canonicalLeaseBody(unsigned)))
  return { ...unsigned, signature: bytesToHex(mac) }
}

export interface RunnerLeaseValidationInput {
  lease: RunnerJobLease
  signingKeyHex: string
  operation: RunnerOperation
  /** Absolute path inside the workspace the operation targets, if any. */
  targetPath?: string
  sessionId: string
  computerId: string
  /** Nonces already seen by this runner instance (replay defense). */
  seenNonces?: Set<string>
  now?: Date
}

export type RunnerLeaseValidation =
  | { valid: true }
  | { valid: false; reason: string }

export function validateRunnerLease(input: RunnerLeaseValidationInput): RunnerLeaseValidation {
  const { lease } = input
  const { signature, ...unsigned } = lease
  const expected = signRunnerLease(unsigned, input.signingKeyHex).signature
  if (!timingSafeEqualHex(signature, expected)) return { valid: false, reason: 'signature_mismatch' }

  const now = input.now ?? new Date()
  if (new Date(lease.expiresAt).getTime() <= now.getTime()) return { valid: false, reason: 'expired' }
  if (lease.sessionId !== input.sessionId) return { valid: false, reason: 'session_mismatch' }
  if (lease.computerId !== input.computerId) return { valid: false, reason: 'computer_mismatch' }
  if (!lease.allowedOperations.includes(input.operation)) return { valid: false, reason: 'operation_not_allowed' }
  if (input.seenNonces?.has(lease.nonce)) return { valid: false, reason: 'replay' }

  if (input.targetPath !== undefined) {
    const check = isPathAllowed(input.targetPath, lease.allowedPaths)
    if (!check.allowed) return { valid: false, reason: check.reason }
  }
  return { valid: true }
}

/**
 * Path jail: the target must resolve inside one of the allowed prefixes,
 * with traversal segments normalized out. Callers must ALSO resolve
 * symlinks on the real filesystem (realpath) before invoking file ops —
 * this is the lexical half of the defense.
 */
export function isPathAllowed(
  targetPath: string,
  allowedPaths: string[],
): { allowed: true } | { allowed: false; reason: string } {
  if (!targetPath.startsWith('/')) return { allowed: false, reason: 'relative_path' }
  const normalized = normalizePath(targetPath)
  if (normalized === null) return { allowed: false, reason: 'path_traversal' }
  for (const allowed of allowedPaths) {
    const prefix = normalizePath(allowed)
    if (prefix === null) continue
    if (normalized === prefix || normalized.startsWith(prefix.endsWith('/') ? prefix : prefix + '/')) {
      return { allowed: true }
    }
  }
  return { allowed: false, reason: 'path_not_allowed' }
}

/** Normalize; reject when traversal escapes the root. */
function normalizePath(p: string): string | null {
  const parts = p.split('/')
  const out: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (out.length === 0) return null
      out.pop()
      continue
    }
    // Reject NUL and other control characters outright.
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f]/.test(part)) return null
    out.push(part)
  }
  return '/' + out.join('/')
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const ab = hexToBytes(a)
  const bb = hexToBytes(b)
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

export function newRunnerLeaseId(): string {
  return `rlease_${bytesToHex(randomBytes(12))}`
}

export function newRunnerNonce(): string {
  return bytesToHex(randomBytes(16))
}
