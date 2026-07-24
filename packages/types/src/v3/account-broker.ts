/**
 * 2Hands v3 Account Broker contracts.
 * Copied verbatim from 2hands-ai-documentation-v3/specs/account-broker.types.ts (canonical).
 * Do not edit names or unions without updating the spec package.
 */

export type ProviderAuthMode =
  | '2hands_managed_api'
  | 'user_oauth'
  | 'user_api_key'
  | 'user_browser_session'
  | 'assisted_signup'
  | 'enterprise_sso'
  | 'unsupported'

export type AuthRunStatus =
  | 'created'
  | 'selecting_method'
  | 'awaiting_oauth'
  | 'awaiting_secure_input'
  | 'browser_running'
  | 'awaiting_email_verification'
  | 'awaiting_user_takeover'
  | 'awaiting_terms'
  | 'awaiting_payment'
  | 'validating_session'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired'

export type SecretKind = 'username' | 'email' | 'password' | 'otp' | 'magic_link' | 'api_key'

export type SecretReference = string & { readonly __brand: 'SecretReference' }
export type CapabilityGrantId = string & { readonly __brand: 'CapabilityGrantId' }

export interface EnsureCapabilityRequest {
  workspaceId: string
  userId: string
  providerId: string
  capability: string
  taskId: string
  preferredModes?: ProviderAuthMode[]
  allowInteractiveAuth: boolean
}

export type EnsureCapabilityResult =
  | {
      state: 'ready'
      providerAccountId: string
      grantId: CapabilityGrantId
      mode: ProviderAuthMode
      expiresAt?: string
    }
  | {
      state: 'authentication_required'
      authRunId: string
      supportedModes: ProviderAuthMode[]
    }
  | {
      state: 'unsupported'
      reasonCode: string
      safeMessage: string
    }

export interface AuthRun {
  id: string
  workspaceId: string
  userId: string
  taskId?: string
  providerId: string
  capability: string
  selectedMode?: ProviderAuthMode
  status: AuthRunStatus
  browserSessionId?: string
  verificationExpectationId?: string
  providerAccountId?: string
  createdAt: string
  updatedAt: string
  expiresAt: string
  safeError?: { code: string; message: string; retryable: boolean }
}

export interface SecureInputRequest {
  id: string
  authRunId: string
  providerId: string
  title: string
  description?: string
  fields: Array<{
    id: string
    kind: Exclude<SecretKind, 'magic_link'>
    label: string
    autocomplete?: string
    retainOption?: boolean
  }>
  expiresAt: string
}

export interface SecureInputSubmissionReceipt {
  requestId: string
  supplied: Array<{
    fieldId: string
    secretRef: SecretReference
    retained: boolean
  }>
  /** Never includes value, length, character classes, or hash of user input. */
  submittedAt: string
}

export interface SecretInjectionLease {
  id: string
  secretRef: SecretReference
  workspaceId: string
  userId: string
  taskId: string
  authRunId: string
  providerId: string
  browserSessionId: string
  allowedOrigins: string[]
  fieldSemantic: 'username' | 'email' | 'password' | 'otp' | 'api_key'
  purpose: 'login' | 'signup' | 'verification' | 'api_key_setup'
  maximumUses: 1
  expiresAt: string
  signature: string
}

export interface InjectionReceipt {
  leaseId: string
  browserSessionId: string
  origin: string
  fieldSemantic: SecretInjectionLease['fieldSemantic']
  success: boolean
  consumedAt: string
  /** No secret-derived data. */
  safeErrorCode?: string
}

export interface VerificationExpectation {
  id: string
  authRunId: string
  workspaceId: string
  userId: string
  providerId: string
  targetEmail: string
  allowedSenderDomains: string[]
  allowedTypes: Array<'otp' | 'magic_link'>
  notBefore: string
  expiresAt: string
  usePolicy: 'manual' | 'ask_each_time' | 'automatic_if_policy_allows'
  status: 'waiting' | 'candidate_found' | 'approved' | 'consumed' | 'expired' | 'cancelled'
}

export interface ProviderAccount {
  id: string
  workspaceId: string
  userId: string
  providerId: string
  externalAccountLabel?: string
  accountOwner: 'user' | 'workspace' | '2hands'
  billingOwner: 'user' | 'workspace' | '2hands'
  mode: ProviderAuthMode
  status: 'connected' | 'needs_reauth' | 'revoked' | 'error'
  grantedCapabilities: string[]
  grantedScopes: string[]
  tokenRef?: string
  browserContextRef?: string
  lastVerifiedAt?: string
  createdAt: string
  updatedAt: string
}

export interface ProviderAuthAdapter {
  readonly providerId: string
  resolveModes(request: EnsureCapabilityRequest): Promise<ProviderAuthMode[]>
  start(run: AuthRun, mode: ProviderAuthMode): Promise<AuthRun>
  continue(run: AuthRun, event: unknown): Promise<AuthRun>
  validateSession(run: AuthRun): Promise<ProviderAccount>
  revoke(account: ProviderAccount): Promise<void>
}
