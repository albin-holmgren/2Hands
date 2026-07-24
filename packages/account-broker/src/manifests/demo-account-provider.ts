/**
 * Demo Account Provider — deterministic fake provider used for CI, the golden
 * path, and local development. Points at the fake provider pages served by the
 * web app on localhost (/login/password, /login/otp, /signup, /terms,
 * /checkout, ...). It is a demo manifest (provider_manifests.is_demo = true in
 * the database); the schema carries the demo semantics in policy.notes since
 * the manifest schema has no isDemo field.
 */
import type { ProviderAuthManifest } from '../manifest'

export const demoAccountProviderManifest: ProviderAuthManifest = {
  version: 1,
  providerId: 'demo-account-provider',
  displayName: 'Demo Account Provider',
  status: 'enabled',
  capabilities: ['demo.account'],
  authModes: [
    {
      mode: 'user_browser_session',
      priority: 10,
      enabled: true,
      hosted: true,
      selfHosted: true,
      notes: 'Deterministic browser login against the local fake provider pages.',
    },
    {
      mode: 'assisted_signup',
      priority: 20,
      enabled: true,
      hosted: true,
      selfHosted: true,
      requiresExplicitTerms: true,
      requiresPayment: true,
      notes: 'Deterministic assisted signup flow: /signup -> /terms -> /checkout on the fake provider.',
    },
  ],
  browser: {
    allowedOrigins: ['http://localhost:3000'],
    allowedRedirectOrigins: ['http://localhost:3000'],
    recording: false,
    modelVision: 'disabled',
    persistentContext: true,
    secretFields: [
      { semantic: 'username', allowedSecretKinds: ['username'], autocomplete: ['username'] },
      { semantic: 'email', allowedSecretKinds: ['email'], autocomplete: ['email'] },
      { semantic: 'password', allowedSecretKinds: ['password'], autocomplete: ['current-password', 'new-password'] },
      { semantic: 'otp', allowedSecretKinds: ['otp'], autocomplete: ['one-time-code'] },
    ],
    blockedPageKinds: [
      'password_reset',
      'account_recovery',
      'disable_mfa',
      'show_recovery_codes',
      'bank_verification',
      'identity_document_upload',
    ],
  },
  emailVerification: {
    supported: true,
    defaultMode: 'ask_each_time',
    senderDomains: ['demo-provider.test'],
    types: ['otp', 'magic_link'],
    maximumAgeSeconds: 600,
  },
  terms: {
    required: true,
    versionDetection: 'configured',
  },
  payments: {
    supported: true,
    entryMode: 'provider_hosted_checkout',
    rawPaymentDataTo2Hands: false,
    recurring: true,
  },
  policy: {
    hostedUse: 'allowed',
    selfHostedUse: 'allowed',
    notes:
      'DEMO PROVIDER. Deterministic fake service owned by 2Hands for CI and the golden path. ' +
      'No real accounts, no real payments, no real terms are involved.',
    sourceUrls: [],
    lastReviewedAt: '2026-07-24T00:00:00Z',
    reviewOwner: '2hands-eng',
  },
  revocation: {
    supported: true,
    method: 'api',
    deleteBrowserContext: true,
  },
  health: {
    check: 'api',
    intervalSeconds: 3600,
  },
}
