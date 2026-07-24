#!/usr/bin/env npx tsx
// v3 Slice 3 — Secret Broker unit tests:
// transport sealing, storage envelope + AAD binding, lease signing/validation,
// redaction/canary scanning.

import {
  contextAad,
  decryptSecretValue,
  encryptSecretValue,
  envKeyProvider,
  generateChallengeKeypair,
  newLeaseId,
  newLeaseNonce,
  newSecretRef,
  normalizeOrigin,
  openSealedValue,
  redactText,
  scanForSecrets,
  scanObjectForSecrets,
  sealSecretValue,
  signLease,
  validateLease,
  type SecretContext,
  type UnsignedLease,
} from '@2hands/secret-broker'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++
    console.log(`  ✓ ${message}`)
  } else {
    failed++
    console.log(`  ✗ ${message}`)
  }
}

function throws(fn: () => unknown, message: string): void {
  try {
    fn()
    failed++
    console.log(`  ✗ ${message} (did not throw)`)
  } catch {
    passed++
    console.log(`  ✓ ${message}`)
  }
}

console.log('\n=== 1. Transport sealing (client → server) ===')

const challenge = generateChallengeKeypair()
const canary = `canary-${Date.now()}-hunter2-transport`
const sealed = sealSecretValue(canary, challenge.publicKeyHex)

assert(!JSON.stringify(sealed).includes(canary), 'sealed payload never contains plaintext')
assert(sealed.ciphertextHex.length > canary.length * 2, 'ciphertext carries auth tag')
assert(openSealedValue(sealed, challenge.secretKeyHex) === canary, 'server opens sealed value')

const otherChallenge = generateChallengeKeypair()
throws(() => openSealedValue(sealed, otherChallenge.secretKeyHex), 'wrong challenge key cannot open')

const tampered = { ...sealed, ciphertextHex: sealed.ciphertextHex.replace(/^../, 'ff') }
throws(() => openSealedValue(tampered, challenge.secretKeyHex), 'tampered ciphertext rejected')

const sealedTwice = sealSecretValue(canary, challenge.publicKeyHex)
assert(sealedTwice.ciphertextHex !== sealed.ciphertextHex, 'sealing is non-deterministic (fresh ephemeral+nonce)')

console.log('\n=== 2. Storage envelope + AAD binding ===')

const provider = envKeyProvider({
  SECRET_BROKER_MASTER_KEY: 'a'.repeat(64),
  SECRET_BROKER_KEY_ID: 'test-key',
})
const context: SecretContext = {
  userId: 'user-1',
  workspaceId: 'ws-1',
  authRunId: 'run-1',
  requestId: 'req-1',
  fieldKind: 'password',
  keyId: 'test-key',
  expiresAt: '2026-07-24T13:00:00Z',
}
const storedCanary = `canary-${Date.now()}-storage-secret`
const stored = encryptSecretValue(storedCanary, context, provider)

assert(!JSON.stringify(stored).includes(storedCanary), 'stored ciphertext never contains plaintext')
assert(decryptSecretValue(stored, context, provider) === storedCanary, 'round trip with exact context')

for (const [field, value] of [
  ['userId', 'user-2'],
  ['workspaceId', 'ws-2'],
  ['authRunId', 'run-2'],
  ['requestId', 'req-2'],
  ['fieldKind', 'otp'],
  ['expiresAt', '2027-01-01T00:00:00Z'],
] as const) {
  throws(
    () => decryptSecretValue(stored, { ...context, [field]: value }, provider),
    `context mismatch on ${field} fails authentication`,
  )
}

throws(
  () => envKeyProvider({ SECRET_BROKER_MASTER_KEY: 'tooshort' }),
  'malformed master key rejected loudly',
)
throws(() => envKeyProvider({}), 'missing master key rejected loudly (no silent ephemeral keys)')

const aad1 = new TextDecoder().decode(contextAad(context))
const aad2 = new TextDecoder().decode(contextAad({ ...context }))
assert(aad1 === aad2, 'AAD serialization is deterministic')

assert(newSecretRef().startsWith('sec_'), 'secret refs are namespaced opaque tokens')

console.log('\n=== 3. Injection leases ===')

const signingKey = 'b'.repeat(64)
const unsigned: UnsignedLease = {
  id: newLeaseId(),
  secretRef: newSecretRef() as UnsignedLease['secretRef'],
  workspaceId: 'ws-1',
  userId: 'user-1',
  taskId: 'task-1',
  authRunId: 'run-1',
  providerId: 'demo-provider',
  browserSessionId: 'bs-1',
  allowedOrigins: ['https://accounts.demo-provider.test'],
  fieldSemantic: 'password',
  purpose: 'login',
  maximumUses: 1,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  nonce: newLeaseNonce(),
}
const lease = signLease(unsigned, signingKey)
assert(lease.signature.length === 64, 'lease signed (HMAC-SHA256)')

const baseInput = {
  lease,
  signingKeyHex: signingKey,
  currentOrigin: 'https://accounts.demo-provider.test',
  fieldSemantic: 'password' as const,
  browserSessionId: 'bs-1',
  providerId: 'demo-provider',
}

assert(validateLease(baseInput).valid, 'exact-match lease validates')

const forged = { ...lease, allowedOrigins: ['https://evil.example'] }
const forgedResult = validateLease({ ...baseInput, lease: forged, currentOrigin: 'https://evil.example' })
assert(!forgedResult.valid && forgedResult.reason === 'signature_mismatch', 'origin tamper breaks signature')

const wrongOrigin = validateLease({ ...baseInput, currentOrigin: 'https://phish.demo-provider.test' })
assert(!wrongOrigin.valid && wrongOrigin.reason === 'origin_not_allowed', 'unlisted origin rejected')

const subPath = validateLease({ ...baseInput, currentOrigin: 'https://accounts.demo-provider.test/login' })
assert(!subPath.valid && subPath.reason === 'malformed_origin', 'path-bearing origin rejected (exact origins only)')

const wrongField = validateLease({ ...baseInput, fieldSemantic: 'otp' as const })
assert(!wrongField.valid && wrongField.reason === 'field_mismatch', 'wrong semantic field rejected')

const wrongSession = validateLease({ ...baseInput, browserSessionId: 'bs-2' })
assert(!wrongSession.valid && wrongSession.reason === 'session_mismatch', 'cross-session use rejected')

const wrongProvider = validateLease({ ...baseInput, providerId: 'other' })
assert(!wrongProvider.valid && wrongProvider.reason === 'provider_mismatch', 'cross-provider use rejected')

const expiredLease = signLease({ ...unsigned, expiresAt: new Date(Date.now() - 1000).toISOString() }, signingKey)
const expiredResult = validateLease({ ...baseInput, lease: expiredLease })
assert(!expiredResult.valid && expiredResult.reason === 'expired', 'expired lease rejected')

const wrongKey = validateLease({ ...baseInput, signingKeyHex: 'c'.repeat(64) })
assert(!wrongKey.valid && wrongKey.reason === 'signature_mismatch', 'wrong signing key rejected')

assert(normalizeOrigin('HTTPS://Accounts.Demo-Provider.TEST') === 'https://accounts.demo-provider.test', 'origins normalized')
throws(() => normalizeOrigin('https://a.test/path'), 'origins with paths rejected at signing time')

console.log('\n=== 4. Redaction + canary scanning ===')

const secret = 'S3cr3t-Canary-Value-42'
const b64 = Buffer.from(secret).toString('base64')
const hex = Buffer.from(secret).toString('hex')

assert(scanForSecrets(`log line with ${secret} inside`, [secret]).length > 0, 'plain occurrence detected')
assert(scanForSecrets(`encoded ${b64} here`, [secret]).some((h) => h.encoding === 'base64'), 'base64 variant detected')
assert(scanForSecrets(`hexdump ${hex}`, [secret]).some((h) => h.encoding === 'hex'), 'hex variant detected')
assert(
  scanForSecrets(`url ${encodeURIComponent(secret)}`, [secret]).some((h) => h.encoding === 'url' || h.encoding === 'plain'),
  'url-encoded variant detected',
)
assert(scanForSecrets('clean log line', [secret]).length === 0, 'no false positive on clean text')
assert(scanForSecrets('short', ['abc']).length === 0, 'values under 6 chars ignored (noise guard)')

const objHits = scanObjectForSecrets({ a: [{ b: `deep ${secret}` }] }, [secret])
assert(objHits.length === 1 && objHits[0].path === '$.a[0].b', 'deep object scan reports path')

const redacted = redactText(`before ${secret} after ${b64}`, [secret])
assert(!redacted.text.includes(secret) && !redacted.text.includes(b64), 'redaction removes all encodings')
assert(redacted.redactionsApplied >= 2, 'redaction count reported')

console.log('\n───────────────────────────────────────────────────────')
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
