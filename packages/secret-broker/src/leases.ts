/**
 * Signed one-time secret-injection leases.
 *
 * A privileged deterministic injector requests a lease binding a secret ref
 * to exactly one browser session, origin allowlist, semantic field, purpose,
 * and short expiry. HMAC-SHA256 over the canonical lease body; validation
 * fails closed on any mismatch. Replay is prevented by the database
 * (maximum_uses = 1, consumed atomically) — the signature makes the lease
 * unforgeable, the row makes it single-use.
 */
import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils'
import { randomBytes } from '@noble/ciphers/webcrypto'
import type { SecretInjectionLease as SpecLease } from '@2hands/types/v3'

/** Spec lease + anti-replay nonce (stored alongside in private.secret_leases). */
export type SecretInjectionLease = SpecLease & { nonce: string }

export type UnsignedLease = Omit<SecretInjectionLease, 'signature'>

function canonicalLeaseBody(lease: UnsignedLease): string {
  // Stable key order; arrays kept in given order (origins are normalized
  // before signing).
  const body: Record<string, unknown> = {
    allowedOrigins: lease.allowedOrigins,
    authRunId: lease.authRunId,
    browserSessionId: lease.browserSessionId,
    expiresAt: lease.expiresAt,
    fieldSemantic: lease.fieldSemantic,
    id: lease.id,
    maximumUses: lease.maximumUses,
    nonce: lease.nonce,
    providerId: lease.providerId,
    purpose: lease.purpose,
    secretRef: lease.secretRef,
    taskId: lease.taskId,
    userId: lease.userId,
    workspaceId: lease.workspaceId,
  }
  return JSON.stringify(body)
}

export function normalizeOrigin(origin: string): string {
  const url = new URL(origin)
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`Lease origins must be bare origins, got ${origin}`)
  }
  return url.origin.toLowerCase()
}

export function signLease(unsigned: UnsignedLease, signingKeyHex: string): SecretInjectionLease {
  const normalized: UnsignedLease = {
    ...unsigned,
    allowedOrigins: unsigned.allowedOrigins.map(normalizeOrigin).sort(),
  }
  const mac = hmac(sha256, hexToBytes(signingKeyHex), utf8ToBytes(canonicalLeaseBody(normalized)))
  return { ...normalized, signature: bytesToHex(mac) }
}

export interface LeaseValidationInput {
  lease: SecretInjectionLease
  signingKeyHex: string
  /** The exact page origin the injector is about to fill into. */
  currentOrigin: string
  /** The semantic field the deterministic adapter identified. */
  fieldSemantic: SecretInjectionLease['fieldSemantic']
  browserSessionId: string
  providerId: string
  now?: Date
}

export type LeaseValidationResult =
  | { valid: true; lease: SecretInjectionLease }
  | { valid: false; reason: string }

/**
 * Validate immediately before injection. Every check fails closed;
 * the reasons are safe metadata (no secret-derived data).
 */
export function validateLease(input: LeaseValidationInput): LeaseValidationResult {
  const { lease } = input
  const { signature, ...unsigned } = lease
  const expected = signLease(unsigned, input.signingKeyHex).signature
  if (!timingSafeEqualHex(signature, expected)) return { valid: false, reason: 'signature_mismatch' }

  const now = input.now ?? new Date()
  if (new Date(lease.expiresAt).getTime() <= now.getTime()) return { valid: false, reason: 'expired' }
  if (lease.maximumUses !== 1) return { valid: false, reason: 'invalid_use_count' }

  let origin: string
  try {
    origin = normalizeOrigin(input.currentOrigin)
  } catch {
    return { valid: false, reason: 'malformed_origin' }
  }
  if (!lease.allowedOrigins.includes(origin)) return { valid: false, reason: 'origin_not_allowed' }
  if (lease.fieldSemantic !== input.fieldSemantic) return { valid: false, reason: 'field_mismatch' }
  if (lease.browserSessionId !== input.browserSessionId) return { valid: false, reason: 'session_mismatch' }
  if (lease.providerId !== input.providerId) return { valid: false, reason: 'provider_mismatch' }

  return { valid: true, lease }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const ab = hexToBytes(a)
  const bb = hexToBytes(b)
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

export function newLeaseNonce(): string {
  return bytesToHex(randomBytes(16))
}

export function newLeaseId(): string {
  return `lease_${bytesToHex(randomBytes(12))}`
}
