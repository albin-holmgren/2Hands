/**
 * ProviderAuthManifest — TypeScript mirror of
 * packages/types/src/v3/provider-auth-manifest.schema.json (canonical), plus a
 * hand-rolled structural validator implementing every constraint of that
 * schema. No ajv: this package must stay dependency-free beyond @2hands/types.
 *
 * The validator is exhaustive and fails closed: unknown keys are rejected at
 * every level (additionalProperties: false), const constraints
 * (`recording: false`, `rawPaymentDataTo2Hands: false`) are enforced, and all
 * enum/pattern/format/length/uniqueness rules match the JSON schema.
 */
import type { ProviderAuthMode } from '@2hands/types/v3'

// ---------------------------------------------------------------------------
// Types (field-for-field mirror of the JSON schema)
// ---------------------------------------------------------------------------

export type ProviderManifestStatus = 'enabled' | 'beta' | 'allowlisted' | 'disabled' | 'coming_soon'

export interface ManifestAuthMode {
  mode: ProviderAuthMode
  /** 0–1000; lower number = tried first. */
  priority: number
  enabled: boolean
  hosted?: boolean
  selfHosted?: boolean
  scopes?: string[]
  requiresUserTakeover?: boolean
  requiresExplicitTerms?: boolean
  requiresPayment?: boolean
  notes?: string
}

export type SecretFieldSemantic = 'username' | 'email' | 'password' | 'otp' | 'recovery_code' | 'api_key'
export type ManifestSecretKind = 'username' | 'email' | 'password' | 'otp' | 'magic_link' | 'api_key'

export interface ManifestSecretField {
  semantic: SecretFieldSemantic
  allowedSecretKinds: ManifestSecretKind[]
  labels?: string[]
  autocomplete?: string[]
}

export type BlockedPageKind =
  | 'password_reset'
  | 'account_recovery'
  | 'disable_mfa'
  | 'show_recovery_codes'
  | 'bank_verification'
  | 'identity_document_upload'

export interface ManifestBrowserPolicy {
  allowedOrigins: string[]
  allowedRedirectOrigins?: string[]
  /** Const: session recording is never permitted. */
  recording: false
  modelVision: 'disabled' | 'redacted_only'
  persistentContext?: boolean
  secretFields: ManifestSecretField[]
  blockedPageKinds?: BlockedPageKind[]
}

export interface ManifestEmailVerification {
  supported: boolean
  defaultMode: 'manual' | 'ask_each_time' | 'automatic_if_policy_allows'
  senderDomains?: string[]
  subjectHints?: string[]
  types?: Array<'otp' | 'magic_link'>
  /** 30–3600 seconds. */
  maximumAgeSeconds?: number
}

export interface ManifestTerms {
  required?: boolean
  termsUrl?: string
  privacyUrl?: string
  versionDetection?: 'configured' | 'page_hash' | 'provider_api' | 'unknown'
}

export interface ManifestPayments {
  supported?: boolean
  entryMode?: 'provider_hosted_checkout' | 'user_takeover' | 'unsupported'
  /** Const: raw payment data never transits 2Hands. */
  rawPaymentDataTo2Hands?: false
  recurring?: boolean
}

export type PolicyUse = 'allowed' | 'restricted' | 'unknown' | 'prohibited'

export interface ManifestPolicy {
  hostedUse: PolicyUse
  selfHostedUse: PolicyUse
  notes?: string
  sourceUrls?: string[]
  lastReviewedAt: string
  reviewOwner: string
  expiresAt?: string
}

export interface ManifestRevocation {
  supported: boolean
  method?: 'api' | 'oauth_revoke' | 'browser' | 'instructions' | 'none'
  url?: string
  /** Default true in the schema. */
  deleteBrowserContext?: boolean
}

export interface ManifestHealth {
  check?: 'api' | 'token_introspection' | 'browser_probe' | 'manual' | 'none'
  /** 60–2592000 seconds. */
  intervalSeconds?: number
}

export interface ProviderAuthManifest {
  version: 1
  providerId: string
  displayName: string
  status: ProviderManifestStatus
  capabilities: string[]
  authModes: ManifestAuthMode[]
  browser?: ManifestBrowserPolicy
  emailVerification?: ManifestEmailVerification
  terms?: ManifestTerms
  payments?: ManifestPayments
  policy: ManifestPolicy
  revocation: ManifestRevocation
  health?: ManifestHealth
}

export type ManifestValidationResult =
  | { valid: true; manifest: ProviderAuthManifest }
  | { valid: false; errors: string[] }

// ---------------------------------------------------------------------------
// Enum tables (verbatim from the schema)
// ---------------------------------------------------------------------------

const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/
const CAPABILITY_PATTERN = /^[a-z0-9][a-z0-9_.:-]+$/
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i

const STATUS_ENUM = ['enabled', 'beta', 'allowlisted', 'disabled', 'coming_soon'] as const
const AUTH_MODE_ENUM = [
  '2hands_managed_api',
  'user_oauth',
  'user_api_key',
  'user_browser_session',
  'assisted_signup',
  'enterprise_sso',
  'unsupported',
] as const
const MODEL_VISION_ENUM = ['disabled', 'redacted_only'] as const
const SECRET_SEMANTIC_ENUM = ['username', 'email', 'password', 'otp', 'recovery_code', 'api_key'] as const
const SECRET_KIND_ENUM = ['username', 'email', 'password', 'otp', 'magic_link', 'api_key'] as const
const BLOCKED_PAGE_KIND_ENUM = [
  'password_reset',
  'account_recovery',
  'disable_mfa',
  'show_recovery_codes',
  'bank_verification',
  'identity_document_upload',
] as const
const VERIFICATION_MODE_ENUM = ['manual', 'ask_each_time', 'automatic_if_policy_allows'] as const
const VERIFICATION_TYPE_ENUM = ['otp', 'magic_link'] as const
const VERSION_DETECTION_ENUM = ['configured', 'page_hash', 'provider_api', 'unknown'] as const
const PAYMENT_ENTRY_MODE_ENUM = ['provider_hosted_checkout', 'user_takeover', 'unsupported'] as const
const POLICY_USE_ENUM = ['allowed', 'restricted', 'unknown', 'prohibited'] as const
const REVOCATION_METHOD_ENUM = ['api', 'oauth_revoke', 'browser', 'instructions', 'none'] as const
const HEALTH_CHECK_ENUM = ['api', 'token_introspection', 'browser_probe', 'manual', 'none'] as const

// ---------------------------------------------------------------------------
// Validation primitives
// ---------------------------------------------------------------------------

type Errors = string[]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function rejectUnknownKeys(obj: Record<string, unknown>, allowed: readonly string[], path: string, errors: Errors): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) errors.push(`${path}.${key}: unknown key (additionalProperties: false)`)
  }
}

function requireKeys(obj: Record<string, unknown>, required: readonly string[], path: string, errors: Errors): void {
  for (const key of required) {
    if (!(key in obj)) errors.push(`${path}.${key}: required property missing`)
  }
}

function checkString(
  value: unknown,
  path: string,
  errors: Errors,
  opts: { minLength?: number; maxLength?: number; pattern?: RegExp; format?: 'uri' | 'date-time' } = {},
): void {
  if (typeof value !== 'string') {
    errors.push(`${path}: expected string`)
    return
  }
  if (opts.minLength !== undefined && value.length < opts.minLength) {
    errors.push(`${path}: shorter than minLength ${opts.minLength}`)
  }
  if (opts.maxLength !== undefined && value.length > opts.maxLength) {
    errors.push(`${path}: longer than maxLength ${opts.maxLength}`)
  }
  if (opts.pattern && !opts.pattern.test(value)) {
    errors.push(`${path}: does not match pattern ${opts.pattern.source}`)
  }
  if (opts.format === 'uri') {
    try {
      // Absolute URI required (JSON Schema "uri" format).
      new URL(value)
    } catch {
      errors.push(`${path}: not a valid uri`)
    }
  }
  if (opts.format === 'date-time') {
    if (!DATE_TIME_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
      errors.push(`${path}: not a valid RFC 3339 date-time`)
    }
  }
}

function checkBoolean(value: unknown, path: string, errors: Errors): void {
  if (typeof value !== 'boolean') errors.push(`${path}: expected boolean`)
}

function checkInteger(value: unknown, path: string, errors: Errors, opts: { minimum?: number; maximum?: number } = {}): void {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    errors.push(`${path}: expected integer`)
    return
  }
  if (opts.minimum !== undefined && value < opts.minimum) errors.push(`${path}: below minimum ${opts.minimum}`)
  if (opts.maximum !== undefined && value > opts.maximum) errors.push(`${path}: above maximum ${opts.maximum}`)
}

function checkEnum(value: unknown, allowed: readonly string[], path: string, errors: Errors): void {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    errors.push(`${path}: expected one of [${allowed.join(', ')}]`)
  }
}

function checkUniqueItems(value: unknown[], path: string, errors: Errors): void {
  const seen = new Set<string>()
  for (const item of value) {
    const key = JSON.stringify(item)
    if (seen.has(key)) {
      errors.push(`${path}: items must be unique (duplicate ${key})`)
      return
    }
    seen.add(key)
  }
}

function checkArray(
  value: unknown,
  path: string,
  errors: Errors,
  opts: { minItems?: number; maxItems?: number; uniqueItems?: boolean },
  each?: (item: unknown, itemPath: string) => void,
): void {
  if (!Array.isArray(value)) {
    errors.push(`${path}: expected array`)
    return
  }
  if (opts.minItems !== undefined && value.length < opts.minItems) {
    errors.push(`${path}: fewer than minItems ${opts.minItems}`)
  }
  if (opts.maxItems !== undefined && value.length > opts.maxItems) {
    errors.push(`${path}: more than maxItems ${opts.maxItems}`)
  }
  if (opts.uniqueItems) checkUniqueItems(value, path, errors)
  if (each) value.forEach((item, i) => each(item, `${path}[${i}]`))
}

// ---------------------------------------------------------------------------
// Sub-schema validators ($defs)
// ---------------------------------------------------------------------------

function validateAuthMode(value: unknown, path: string, errors: Errors): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected object`)
    return
  }
  rejectUnknownKeys(
    value,
    ['mode', 'priority', 'enabled', 'hosted', 'selfHosted', 'scopes', 'requiresUserTakeover', 'requiresExplicitTerms', 'requiresPayment', 'notes'],
    path,
    errors,
  )
  requireKeys(value, ['mode', 'priority', 'enabled'], path, errors)
  if ('mode' in value) checkEnum(value.mode, AUTH_MODE_ENUM, `${path}.mode`, errors)
  if ('priority' in value) checkInteger(value.priority, `${path}.priority`, errors, { minimum: 0, maximum: 1000 })
  if ('enabled' in value) checkBoolean(value.enabled, `${path}.enabled`, errors)
  if ('hosted' in value) checkBoolean(value.hosted, `${path}.hosted`, errors)
  if ('selfHosted' in value) checkBoolean(value.selfHosted, `${path}.selfHosted`, errors)
  if ('scopes' in value) {
    checkArray(value.scopes, `${path}.scopes`, errors, { uniqueItems: true }, (item, itemPath) =>
      checkString(item, itemPath, errors),
    )
  }
  if ('requiresUserTakeover' in value) checkBoolean(value.requiresUserTakeover, `${path}.requiresUserTakeover`, errors)
  if ('requiresExplicitTerms' in value) checkBoolean(value.requiresExplicitTerms, `${path}.requiresExplicitTerms`, errors)
  if ('requiresPayment' in value) checkBoolean(value.requiresPayment, `${path}.requiresPayment`, errors)
  if ('notes' in value) checkString(value.notes, `${path}.notes`, errors, { maxLength: 2000 })
}

function validateSecretField(value: unknown, path: string, errors: Errors): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected object`)
    return
  }
  rejectUnknownKeys(value, ['semantic', 'allowedSecretKinds', 'labels', 'autocomplete'], path, errors)
  requireKeys(value, ['semantic', 'allowedSecretKinds'], path, errors)
  if ('semantic' in value) checkEnum(value.semantic, SECRET_SEMANTIC_ENUM, `${path}.semantic`, errors)
  if ('allowedSecretKinds' in value) {
    checkArray(value.allowedSecretKinds, `${path}.allowedSecretKinds`, errors, { minItems: 1 }, (item, itemPath) =>
      checkEnum(item, SECRET_KIND_ENUM, itemPath, errors),
    )
  }
  if ('labels' in value) {
    checkArray(value.labels, `${path}.labels`, errors, {}, (item, itemPath) => checkString(item, itemPath, errors))
  }
  if ('autocomplete' in value) {
    checkArray(value.autocomplete, `${path}.autocomplete`, errors, {}, (item, itemPath) => checkString(item, itemPath, errors))
  }
}

function validateBrowserPolicy(value: unknown, path: string, errors: Errors): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected object`)
    return
  }
  rejectUnknownKeys(
    value,
    ['allowedOrigins', 'allowedRedirectOrigins', 'recording', 'modelVision', 'persistentContext', 'secretFields', 'blockedPageKinds'],
    path,
    errors,
  )
  requireKeys(value, ['allowedOrigins', 'recording', 'modelVision', 'secretFields'], path, errors)
  if ('allowedOrigins' in value) {
    checkArray(value.allowedOrigins, `${path}.allowedOrigins`, errors, { minItems: 1, uniqueItems: true }, (item, itemPath) =>
      checkString(item, itemPath, errors, { format: 'uri' }),
    )
  }
  if ('allowedRedirectOrigins' in value) {
    checkArray(value.allowedRedirectOrigins, `${path}.allowedRedirectOrigins`, errors, { uniqueItems: true }, (item, itemPath) =>
      checkString(item, itemPath, errors, { format: 'uri' }),
    )
  }
  if ('recording' in value && value.recording !== false) {
    errors.push(`${path}.recording: must be const false`)
  }
  if ('modelVision' in value) checkEnum(value.modelVision, MODEL_VISION_ENUM, `${path}.modelVision`, errors)
  if ('persistentContext' in value) checkBoolean(value.persistentContext, `${path}.persistentContext`, errors)
  if ('secretFields' in value) {
    checkArray(value.secretFields, `${path}.secretFields`, errors, {}, (item, itemPath) =>
      validateSecretField(item, itemPath, errors),
    )
  }
  if ('blockedPageKinds' in value) {
    checkArray(value.blockedPageKinds, `${path}.blockedPageKinds`, errors, {}, (item, itemPath) =>
      checkEnum(item, BLOCKED_PAGE_KIND_ENUM, itemPath, errors),
    )
  }
}

function validateEmailVerification(value: unknown, path: string, errors: Errors): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected object`)
    return
  }
  rejectUnknownKeys(
    value,
    ['supported', 'defaultMode', 'senderDomains', 'subjectHints', 'types', 'maximumAgeSeconds'],
    path,
    errors,
  )
  requireKeys(value, ['supported', 'defaultMode'], path, errors)
  if ('supported' in value) checkBoolean(value.supported, `${path}.supported`, errors)
  if ('defaultMode' in value) checkEnum(value.defaultMode, VERIFICATION_MODE_ENUM, `${path}.defaultMode`, errors)
  if ('senderDomains' in value) {
    checkArray(value.senderDomains, `${path}.senderDomains`, errors, { uniqueItems: true }, (item, itemPath) =>
      checkString(item, itemPath, errors),
    )
  }
  if ('subjectHints' in value) {
    checkArray(value.subjectHints, `${path}.subjectHints`, errors, {}, (item, itemPath) => checkString(item, itemPath, errors))
  }
  if ('types' in value) {
    checkArray(value.types, `${path}.types`, errors, { uniqueItems: true }, (item, itemPath) =>
      checkEnum(item, VERIFICATION_TYPE_ENUM, itemPath, errors),
    )
  }
  if ('maximumAgeSeconds' in value) {
    checkInteger(value.maximumAgeSeconds, `${path}.maximumAgeSeconds`, errors, { minimum: 30, maximum: 3600 })
  }
}

function validateTerms(value: unknown, path: string, errors: Errors): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected object`)
    return
  }
  rejectUnknownKeys(value, ['required', 'termsUrl', 'privacyUrl', 'versionDetection'], path, errors)
  if ('required' in value) checkBoolean(value.required, `${path}.required`, errors)
  if ('termsUrl' in value) checkString(value.termsUrl, `${path}.termsUrl`, errors, { format: 'uri' })
  if ('privacyUrl' in value) checkString(value.privacyUrl, `${path}.privacyUrl`, errors, { format: 'uri' })
  if ('versionDetection' in value) checkEnum(value.versionDetection, VERSION_DETECTION_ENUM, `${path}.versionDetection`, errors)
}

function validatePayments(value: unknown, path: string, errors: Errors): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected object`)
    return
  }
  rejectUnknownKeys(value, ['supported', 'entryMode', 'rawPaymentDataTo2Hands', 'recurring'], path, errors)
  if ('supported' in value) checkBoolean(value.supported, `${path}.supported`, errors)
  if ('entryMode' in value) checkEnum(value.entryMode, PAYMENT_ENTRY_MODE_ENUM, `${path}.entryMode`, errors)
  if ('rawPaymentDataTo2Hands' in value && value.rawPaymentDataTo2Hands !== false) {
    errors.push(`${path}.rawPaymentDataTo2Hands: must be const false`)
  }
  if ('recurring' in value) checkBoolean(value.recurring, `${path}.recurring`, errors)
}

function validatePolicy(value: unknown, path: string, errors: Errors): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected object`)
    return
  }
  rejectUnknownKeys(
    value,
    ['hostedUse', 'selfHostedUse', 'notes', 'sourceUrls', 'lastReviewedAt', 'reviewOwner', 'expiresAt'],
    path,
    errors,
  )
  requireKeys(value, ['hostedUse', 'selfHostedUse', 'lastReviewedAt', 'reviewOwner'], path, errors)
  if ('hostedUse' in value) checkEnum(value.hostedUse, POLICY_USE_ENUM, `${path}.hostedUse`, errors)
  if ('selfHostedUse' in value) checkEnum(value.selfHostedUse, POLICY_USE_ENUM, `${path}.selfHostedUse`, errors)
  if ('notes' in value) checkString(value.notes, `${path}.notes`, errors, { maxLength: 4000 })
  if ('sourceUrls' in value) {
    checkArray(value.sourceUrls, `${path}.sourceUrls`, errors, { maxItems: 20 }, (item, itemPath) =>
      checkString(item, itemPath, errors, { format: 'uri' }),
    )
  }
  if ('lastReviewedAt' in value) checkString(value.lastReviewedAt, `${path}.lastReviewedAt`, errors, { format: 'date-time' })
  if ('reviewOwner' in value) checkString(value.reviewOwner, `${path}.reviewOwner`, errors, { minLength: 1 })
  if ('expiresAt' in value) checkString(value.expiresAt, `${path}.expiresAt`, errors, { format: 'date-time' })
}

function validateRevocation(value: unknown, path: string, errors: Errors): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected object`)
    return
  }
  rejectUnknownKeys(value, ['supported', 'method', 'url', 'deleteBrowserContext'], path, errors)
  requireKeys(value, ['supported'], path, errors)
  if ('supported' in value) checkBoolean(value.supported, `${path}.supported`, errors)
  if ('method' in value) checkEnum(value.method, REVOCATION_METHOD_ENUM, `${path}.method`, errors)
  if ('url' in value) checkString(value.url, `${path}.url`, errors, { format: 'uri' })
  if ('deleteBrowserContext' in value) checkBoolean(value.deleteBrowserContext, `${path}.deleteBrowserContext`, errors)
}

function validateHealth(value: unknown, path: string, errors: Errors): void {
  if (!isRecord(value)) {
    errors.push(`${path}: expected object`)
    return
  }
  rejectUnknownKeys(value, ['check', 'intervalSeconds'], path, errors)
  if ('check' in value) checkEnum(value.check, HEALTH_CHECK_ENUM, `${path}.check`, errors)
  if ('intervalSeconds' in value) {
    checkInteger(value.intervalSeconds, `${path}.intervalSeconds`, errors, { minimum: 60, maximum: 2592000 })
  }
}

// ---------------------------------------------------------------------------
// Root validator
// ---------------------------------------------------------------------------

const ROOT_KEYS = [
  'version',
  'providerId',
  'displayName',
  'status',
  'capabilities',
  'authModes',
  'browser',
  'emailVerification',
  'terms',
  'payments',
  'policy',
  'revocation',
  'health',
] as const

const ROOT_REQUIRED = [
  'version',
  'providerId',
  'displayName',
  'status',
  'capabilities',
  'authModes',
  'policy',
  'revocation',
] as const

export function validateProviderManifest(manifest: unknown): ManifestValidationResult {
  const errors: Errors = []

  if (!isRecord(manifest)) {
    return { valid: false, errors: ['$: expected object'] }
  }

  rejectUnknownKeys(manifest, ROOT_KEYS, '$', errors)
  requireKeys(manifest, ROOT_REQUIRED, '$', errors)

  if ('version' in manifest && manifest.version !== 1) errors.push('$.version: must be const 1')
  if ('providerId' in manifest) checkString(manifest.providerId, '$.providerId', errors, { pattern: PROVIDER_ID_PATTERN })
  if ('displayName' in manifest) checkString(manifest.displayName, '$.displayName', errors, { minLength: 1, maxLength: 100 })
  if ('status' in manifest) checkEnum(manifest.status, STATUS_ENUM, '$.status', errors)
  if ('capabilities' in manifest) {
    checkArray(manifest.capabilities, '$.capabilities', errors, { minItems: 1, uniqueItems: true }, (item, itemPath) =>
      checkString(item, itemPath, errors, { pattern: CAPABILITY_PATTERN }),
    )
  }
  if ('authModes' in manifest) {
    checkArray(manifest.authModes, '$.authModes', errors, { minItems: 1 }, (item, itemPath) =>
      validateAuthMode(item, itemPath, errors),
    )
  }
  if ('browser' in manifest) validateBrowserPolicy(manifest.browser, '$.browser', errors)
  if ('emailVerification' in manifest) validateEmailVerification(manifest.emailVerification, '$.emailVerification', errors)
  if ('terms' in manifest) validateTerms(manifest.terms, '$.terms', errors)
  if ('payments' in manifest) validatePayments(manifest.payments, '$.payments', errors)
  if ('policy' in manifest) validatePolicy(manifest.policy, '$.policy', errors)
  if ('revocation' in manifest) validateRevocation(manifest.revocation, '$.revocation', errors)
  if ('health' in manifest) validateHealth(manifest.health, '$.health', errors)

  if (errors.length > 0) return { valid: false, errors }
  return { valid: true, manifest: manifest as unknown as ProviderAuthManifest }
}
