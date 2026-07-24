/**
 * Transport encryption for protected values (Secret Broker).
 *
 * Standard NaCl-box-style construction from audited primitives
 * (@noble/curves x25519 + HKDF-SHA256 + XChaCha20-Poly1305). No custom
 * cryptography: the client seals each protected value to a short-lived
 * server challenge public key with an ephemeral keypair, so plaintext never
 * crosses the wire un-encrypted even inside TLS, and the conversation
 * pipeline can never see it.
 *
 * Runs in browser, Expo/React Native, and Node (pure JS, no native modules).
 */
import { x25519 } from '@noble/curves/ed25519'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha2'
import { xchacha20poly1305 } from '@noble/ciphers/chacha'
import { randomBytes } from '@noble/ciphers/webcrypto'
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils'

const HKDF_INFO = utf8ToBytes('2hands-secret-broker-transport-v1')
const NONCE_LENGTH = 24

export interface ChallengeKeypair {
  /** Hex-encoded x25519 public key — sent to the client. */
  publicKeyHex: string
  /** Hex-encoded x25519 secret key — held server-side only, short-lived. */
  secretKeyHex: string
}

export function generateChallengeKeypair(): ChallengeKeypair {
  const secretKey = x25519.utils.randomPrivateKey()
  const publicKey = x25519.getPublicKey(secretKey)
  return { publicKeyHex: bytesToHex(publicKey), secretKeyHex: bytesToHex(secretKey) }
}

export interface SealedValue {
  /** Hex ephemeral client public key. */
  ephemeralPublicKeyHex: string
  /** Hex 24-byte XChaCha20 nonce. */
  nonceHex: string
  /** Hex ciphertext (includes Poly1305 tag). */
  ciphertextHex: string
}

function deriveSharedKey(sharedSecret: Uint8Array, ephemeralPub: Uint8Array, challengePub: Uint8Array): Uint8Array {
  // Salt binds both public keys so a transcript from one exchange can never
  // decrypt under another.
  const salt = new Uint8Array(ephemeralPub.length + challengePub.length)
  salt.set(ephemeralPub, 0)
  salt.set(challengePub, ephemeralPub.length)
  return hkdf(sha256, sharedSecret, salt, HKDF_INFO, 32)
}

/** CLIENT: seal one protected value to the server's challenge public key. */
export function sealSecretValue(plaintext: string, challengePublicKeyHex: string): SealedValue {
  const challengePub = hexToBytes(challengePublicKeyHex)
  const ephemeralSecret = x25519.utils.randomPrivateKey()
  const ephemeralPub = x25519.getPublicKey(ephemeralSecret)
  const shared = x25519.getSharedSecret(ephemeralSecret, challengePub)
  const key = deriveSharedKey(shared, ephemeralPub, challengePub)
  const nonce = randomBytes(NONCE_LENGTH)
  const cipher = xchacha20poly1305(key, nonce)
  const ciphertext = cipher.encrypt(utf8ToBytes(plaintext))
  // Ephemeral secret and derived key go out of scope immediately; @noble
  // typed arrays are zeroed where the API allows.
  ephemeralSecret.fill(0)
  key.fill(0)
  return {
    ephemeralPublicKeyHex: bytesToHex(ephemeralPub),
    nonceHex: bytesToHex(nonce),
    ciphertextHex: bytesToHex(ciphertext),
  }
}

/**
 * SERVER (privileged boundary only): open a sealed value with the challenge
 * secret key. Callers must immediately envelope-encrypt for storage and drop
 * the plaintext.
 */
export function openSealedValue(sealed: SealedValue, challengeSecretKeyHex: string): string {
  const challengeSecret = hexToBytes(challengeSecretKeyHex)
  const challengePub = x25519.getPublicKey(challengeSecret)
  const ephemeralPub = hexToBytes(sealed.ephemeralPublicKeyHex)
  const shared = x25519.getSharedSecret(challengeSecret, ephemeralPub)
  const key = deriveSharedKey(shared, ephemeralPub, challengePub)
  const cipher = xchacha20poly1305(key, hexToBytes(sealed.nonceHex))
  const plaintext = cipher.decrypt(hexToBytes(sealed.ciphertextHex))
  key.fill(0)
  return new TextDecoder().decode(plaintext)
}
