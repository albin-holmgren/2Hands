#!/usr/bin/env npx tsx
// v3 Slice 4 — Email Verification Broker pure-logic tests:
// classification (incl. forbidden categories), sender-domain exactness,
// email masking.

import {
  classifyEmail,
  maskEmail,
  senderDomainAllowed,
} from '../../src/lib/v3/email-verification'

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

console.log('\n=== 1. Classification ===')

assert(classifyEmail('Your code', 'Your Demo Provider code is 123456').kind === 'otp', '6-digit code → otp')
assert(
  classifyEmail('Sign in', 'Click https://demo.test/api/magic?token=abc to continue').kind === 'magic_link',
  'magic link URL → magic_link',
)
assert(classifyEmail('Hello', 'Just a newsletter').kind === 'other', 'newsletter → other')

const forbiddenCases: Array<[string, string, string]> = [
  ['Reset your password', 'Click here to reset your password: 123456', 'password_reset'],
  ['Account recovery', 'Your recovery code is 999999', 'account_recovery'],
  ['Security alert', 'Suspicious sign-in detected. Code: 111111', 'security_warning'],
  ['Action needed', 'Confirm to disable two-factor authentication', 'disable_mfa'],
  ['Your bank', 'Your transaction code is 222222', 'bank_or_payment'],
  ['Verify identity', 'Complete identity verification with code 333333', 'identity_verification'],
  ['Order confirmation', 'Receipt for your order #42', 'purchase_confirmation'],
]
for (const [subject, body, category] of forbiddenCases) {
  const result = classifyEmail(subject, body)
  assert(
    result.kind === 'forbidden' && result.category === category,
    `"${subject}" → forbidden:${category} (never auto-consumed, even with a code inside)`,
  )
}

// Forbidden wins even when the mail also contains an OTP or link.
const mixed = classifyEmail('Password reset code', 'Your password reset code is 123456')
assert(mixed.kind === 'forbidden', 'forbidden category outranks embedded OTP')

console.log('\n=== 2. Sender domain exactness ===')

assert(senderDomainAllowed('demo-provider.test', ['demo-provider.test']), 'exact domain allowed')
assert(senderDomainAllowed('Demo-Provider.TEST', ['demo-provider.test']), 'case-insensitive match')
assert(!senderDomainAllowed('evil-demo-provider.test', ['demo-provider.test']), 'lookalike prefix rejected')
assert(!senderDomainAllowed('demo-provider.test.evil.com', ['demo-provider.test']), 'lookalike suffix rejected')
assert(!senderDomainAllowed('sub.demo-provider.test', ['demo-provider.test']), 'subdomain rejected (exact only)')

console.log('\n=== 3. Masking ===')

assert(maskEmail('demo-user@demo-provider.test') === 'd***@demo-provider.test', 'email masked to first char + domain')
assert(maskEmail('not-an-email') === '***', 'malformed input fully masked')

console.log('\n───────────────────────────────────────────────────────')
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
