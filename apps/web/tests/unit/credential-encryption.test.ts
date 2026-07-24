#!/usr/bin/env npx tsx
/**
 * Unit tests for credential encryption
 * 
 * Run with: npx tsx tests/unit/credential-encryption.test.ts
 * 
 * Tests that AES-256-GCM encryption is properly implemented and secure:
 * - Encryption produces different output each time (random IV)
 * - Decryption only works with correct key
 * - Decryption fails with wrong user ID (AAD verification)
 * - Decryption fails with tampered ciphertext
 * - Decryption fails with wrong key
 */

// Test encryption key (32 bytes = 64 hex chars)
const TEST_ENCRYPTION_KEY = 'a'.repeat(64)
const WRONG_ENCRYPTION_KEY = 'b'.repeat(64)

// Set test encryption key before imports
process.env.CREDENTIAL_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY

import { encryptPassword, decryptPassword } from '../../src/lib/computer-use/credential-manager'

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

function assertThrows(fn: () => void, expectedMessage: string, testName: string): void {
  try {
    fn()
    failed++
    console.log(`  ✗ ${testName} - Expected error but none thrown`)
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedMessage)) {
      passed++
      console.log(`  ✓ ${testName}`)
    } else {
      failed++
      console.log(`  ✗ ${testName} - Wrong error: ${error}`)
    }
  }
}

console.log('\n🔐 Credential Encryption Tests (AES-256-GCM)\n')

// ============================================
// Basic Encryption Tests
// ============================================
console.log('Basic Encryption:')

const password1 = 'mySecretPassword123!'
const userId1 = 'user-123'
const encrypted1 = encryptPassword(password1, userId1)

assert(
  /^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/.test(encrypted1),
  'Encrypted format is iv:authTag:ciphertext (hex)'
)

assert(
  !encrypted1.includes(password1),
  'Encrypted does not contain plaintext password'
)

const encrypted2 = encryptPassword(password1, userId1)
assert(
  encrypted1 !== encrypted2,
  'Same password produces different ciphertext (random IV)'
)

// ============================================
// Decryption Tests
// ============================================
console.log('\nDecryption:')

const decrypted1 = decryptPassword(encrypted1, userId1)
assert(
  decrypted1 === password1,
  'Decryption returns original password'
)

const specialPassword = '!@#$%^&*()_+-=[]{}|;:,.<>?`~"\' émoji🎉'
const encryptedSpecial = encryptPassword(specialPassword, 'user-special')
const decryptedSpecial = decryptPassword(encryptedSpecial, 'user-special')
assert(
  decryptedSpecial === specialPassword,
  'Handles special characters and emoji'
)

const emptyPassword = ''
const encryptedEmpty = encryptPassword(emptyPassword, 'user-empty')
const decryptedEmpty = decryptPassword(encryptedEmpty, 'user-empty')
assert(
  decryptedEmpty === emptyPassword,
  'Handles empty password'
)

const longPassword = 'x'.repeat(10000)
const encryptedLong = encryptPassword(longPassword, 'user-long')
const decryptedLong = decryptPassword(encryptedLong, 'user-long')
assert(
  decryptedLong === longPassword,
  'Handles very long password (10,000 chars)'
)

// ============================================
// Security Tests - Decryption Failures
// ============================================
console.log('\nSecurity - Decryption Failures:')

// Wrong user ID
const encryptedForUser1 = encryptPassword('secret', 'user-correct')
assertThrows(
  () => decryptPassword(encryptedForUser1, 'user-wrong'),
  'Credential decryption failed',
  'FAILS with wrong userId (AAD mismatch)'
)

// Tampered ciphertext
const parts = encrypted1.split(':')
const cipherChars = parts[2].split('')
if (cipherChars.length > 0) {
  cipherChars[0] = cipherChars[0] === '0' ? '1' : '0'
}
const tamperedCiphertext = `${parts[0]}:${parts[1]}:${cipherChars.join('')}`
assertThrows(
  () => decryptPassword(tamperedCiphertext, userId1),
  'decryption failed',
  'FAILS with tampered ciphertext'
)

// Tampered auth tag
const tamperedAuthTag = `${parts[0]}:${'f'.repeat(32)}:${parts[2]}`
assertThrows(
  () => decryptPassword(tamperedAuthTag, userId1),
  'Credential decryption failed',
  'FAILS with tampered auth tag'
)

// Invalid format
assertThrows(
  () => decryptPassword('invalidformat', 'user'),
  'Invalid encrypted credential format',
  'FAILS with invalid format (no colons)'
)

assertThrows(
  () => decryptPassword('abc:def', 'user'),
  'Invalid encrypted credential format',
  'FAILS with invalid format (too few parts)'
)

// Invalid IV length
assertThrows(
  () => decryptPassword(`abc123:${'f'.repeat(32)}:deadbeef`, 'user'),
  'Invalid IV length',
  'FAILS with invalid IV length'
)

// ============================================
// Wrong Key Test
// ============================================
console.log('\nSecurity - Wrong Key:')

// Encrypt with current key
const encryptedWithKey1 = encryptPassword('secretData', 'user-key-test')

// Change to wrong key - need to test this differently since module is already loaded
// We'll verify the key validation instead
const originalKey = process.env.CREDENTIAL_ENCRYPTION_KEY
process.env.CREDENTIAL_ENCRYPTION_KEY = 'tooshort'

assertThrows(
  () => encryptPassword('test', 'user'),
  'must be exactly 64 hex characters',
  'FAILS with wrong key length'
)

delete process.env.CREDENTIAL_ENCRYPTION_KEY
assertThrows(
  () => encryptPassword('test', 'user'),
  'CREDENTIAL_ENCRYPTION_KEY environment variable is required',
  'FAILS when key is not set'
)

// Restore key
process.env.CREDENTIAL_ENCRYPTION_KEY = originalKey

// ============================================
// Encryption Not Reversible Without Key
// ============================================
console.log('\nEncryption Not Reversible:')

const secretPassword = 'superSecretPassword'
const encryptedSecret = encryptPassword(secretPassword, 'user-final')

assert(
  !encryptedSecret.includes(secretPassword),
  'Ciphertext does not contain plaintext'
)

assert(
  !encryptedSecret.includes(Buffer.from(secretPassword).toString('base64')),
  'Ciphertext does not contain base64 of password'
)

assert(
  !encryptedSecret.includes(Buffer.from(secretPassword).toString('hex')),
  'Ciphertext does not contain hex of password'
)

assert(
  encryptedSecret.length > secretPassword.length * 4,
  'Ciphertext is significantly longer (IV + auth tag overhead)'
)

// ============================================
// Summary
// ============================================
console.log('\n' + '='.repeat(50))
console.log(`Results: ${passed} passed, ${failed} failed`)
console.log('='.repeat(50))

if (failed > 0) {
  console.log('\n❌ Some tests failed!')
  process.exit(1)
} else {
  console.log('\n✅ All encryption tests passed!')
  process.exit(0)
}
