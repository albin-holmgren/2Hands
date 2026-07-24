/**
 * Storage envelope encryption for protected secrets (server-side only).
 *
 * AES-256-GCM-equivalent AEAD (XChaCha20-Poly1305 from @noble/ciphers) with
 * associated data binding the ciphertext to its exact context: user,
 * workspace, auth run, request, field kind, key id, and expiry. A ciphertext
 * copied to any other row or context fails authentication on decrypt.
 *
 * Key hierarchy:
 *   master key (env SECRET_BROKER_MASTER_KEY in dev; KMS/HSM-wrapped in prod
 *   via the KeyProvider interface) → per-secret data key (HKDF, random salt).
 */
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha2'
import { xchacha20poly1305 } from '@noble/ciphers/chacha'
import { randomBytes } from '@noble/ciphers/webcrypto'
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils'

const HKDF_INFO = utf8ToBytes('2hands-secret-broker-storage-v1')

/** Context bound into the AAD. Every field participates in authentication. */
export interface SecretContext {
  userId: string
  workspaceId: string
  authRunId: string
  requestId: string
  fieldKind: string
  keyId: string
  expiresAt: string
}

export interface StoredCiphertext {
  keyId: string
  saltHex: string
  nonceHex: string
  ciphertextHex: string
}

/** Deterministic AAD serialization (sorted keys, no whitespace). */
export function contextAad(context: SecretContext): Uint8Array {
  const entries = Object.entries(context).sort(([a], [b]) => (a < b ? -1 : 1))
  return utf8ToBytes(JSON.stringify(Object.fromEntries(entries)))
}

export interface KeyProvider {
  readonly keyId: string
  getMasterKey(): Uint8Array
}

/**
 * Development/local key provider backed by SECRET_BROKER_MASTER_KEY
 * (64 hex chars). Production deployments must supply a KMS-backed provider;
 * constructing this without the env var fails loudly rather than generating
 * an ephemeral key that would silently orphan stored secrets.
 */
export function envKeyProvider(env: { SECRET_BROKER_MASTER_KEY?: string; SECRET_BROKER_KEY_ID?: string }): KeyProvider {
  const hex = env.SECRET_BROKER_MASTER_KEY?.trim()
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      'SECRET_BROKER_MASTER_KEY must be 64 hex characters (32 bytes). ' +
        'Generate one with: openssl rand -hex 32. ' +
        'WARNING: env-backed master keys are for local development; production must use KMS wrapping.',
    )
  }
  const keyId = env.SECRET_BROKER_KEY_ID?.trim() || 'env-dev-key'
  const key = hexToBytes(hex)
  return { keyId, getMasterKey: () => key }
}

export function encryptSecretValue(
  plaintext: string,
  context: SecretContext,
  provider: KeyProvider,
): StoredCiphertext {
  if (context.keyId !== provider.keyId) {
    throw new Error('SecretContext.keyId must match the key provider')
  }
  const salt = randomBytes(32)
  const dataKey = hkdf(sha256, provider.getMasterKey(), salt, HKDF_INFO, 32)
  const nonce = randomBytes(24)
  const cipher = xchacha20poly1305(dataKey, nonce, contextAad(context))
  const ciphertext = cipher.encrypt(utf8ToBytes(plaintext))
  dataKey.fill(0)
  return {
    keyId: provider.keyId,
    saltHex: bytesToHex(salt),
    nonceHex: bytesToHex(nonce),
    ciphertextHex: bytesToHex(ciphertext),
  }
}

/**
 * Decrypt inside the privileged boundary only (trusted injector / broker).
 * Throws on any context mismatch — wrong user, workspace, run, field, or
 * expiry means authentication failure, not a wrong value.
 */
export function decryptSecretValue(
  stored: StoredCiphertext,
  context: SecretContext,
  provider: KeyProvider,
): string {
  if (stored.keyId !== provider.keyId) {
    throw new Error(`Unknown key id ${stored.keyId}`)
  }
  const dataKey = hkdf(sha256, provider.getMasterKey(), hexToBytes(stored.saltHex), HKDF_INFO, 32)
  const cipher = xchacha20poly1305(dataKey, hexToBytes(stored.nonceHex), contextAad(context))
  const plaintext = cipher.decrypt(hexToBytes(stored.ciphertextHex))
  dataKey.fill(0)
  return new TextDecoder().decode(plaintext)
}

/** Opaque secret reference: `sec_<uuid-ish>` — carries no secret material. */
export function newSecretRef(): string {
  return `sec_${bytesToHex(randomBytes(16))}`
}
