/**
 * ensureCapability — pure decision logic for the Account Broker entry point.
 *
 * Given a capability request, the provider's validated manifest, and the
 * already-loaded workspace state (accounts + grants), decide:
 *   ready                    — an unexpired grant on a connected account covers it
 *   authentication_required  — an interactive auth run is needed; report which
 *                              modes are supported (enabled + hosted, sorted by
 *                              manifest priority)
 *   unsupported              — provider disabled / capability not offered /
 *                              no supported modes
 *
 * No IO here: the web service layer loads rows, calls this, then creates the
 * auth_run (attaching authRunId) or returns the ready grant.
 */
import type {
  CapabilityGrantId,
  EnsureCapabilityRequest,
  ProviderAccount,
  ProviderAuthMode,
} from '@2hands/types/v3'
import type { ProviderAuthManifest } from './manifest'

/** Row shape of public.provider_capability_grants relevant to the decision. */
export interface CapabilityGrant {
  id: string
  providerAccountId: string
  capability: string
  mode: ProviderAuthMode
  expiresAt: string
  revokedAt?: string | null
}

export type EnsureCapabilityReasonCode = 'provider_disabled' | 'no_supported_modes' | 'capability_not_offered'

/**
 * EnsureCapabilityResult minus the IO-produced authRunId: the service layer
 * creates the auth run and lifts this decision into the wire result.
 */
export type EnsureCapabilityDecision =
  | {
      state: 'ready'
      providerAccountId: string
      grantId: CapabilityGrantId
      mode: ProviderAuthMode
      expiresAt?: string
    }
  | {
      state: 'authentication_required'
      supportedModes: ProviderAuthMode[]
    }
  | {
      state: 'unsupported'
      reasonCode: EnsureCapabilityReasonCode
      safeMessage: string
    }

/**
 * Modes offered for interactive auth: enabled AND explicitly hosted
 * (fail closed — a mode without `hosted: true` is not offered on the hosted
 * platform), never `unsupported`, sorted by manifest priority ascending
 * (lower number = tried first). `preferredModes` reorders (preferred
 * supported modes first, manifest order within each group) — it is a
 * preference, not a restriction.
 */
export function supportedInteractiveModes(
  manifest: ProviderAuthManifest,
  preferredModes?: ProviderAuthMode[],
): ProviderAuthMode[] {
  const modes = manifest.authModes
    .filter((m) => m.enabled && m.hosted === true && m.mode !== 'unsupported')
    .sort((a, b) => a.priority - b.priority)
    .map((m) => m.mode)
  const unique = modes.filter((mode, i) => modes.indexOf(mode) === i)
  if (!preferredModes || preferredModes.length === 0) return unique
  const preferred = unique.filter((mode) => preferredModes.includes(mode))
  const rest = unique.filter((mode) => !preferredModes.includes(mode))
  return [...preferred, ...rest]
}

export function ensureCapability(
  request: EnsureCapabilityRequest,
  manifest: ProviderAuthManifest,
  existingAccounts: ProviderAccount[],
  existingGrants: CapabilityGrant[],
  now: Date = new Date(),
): EnsureCapabilityDecision {
  if (manifest.status === 'disabled' || manifest.status === 'coming_soon') {
    return {
      state: 'unsupported',
      reasonCode: 'provider_disabled',
      safeMessage: `Provider ${manifest.providerId} is not currently available.`,
    }
  }

  if (!manifest.capabilities.includes(request.capability)) {
    return {
      state: 'unsupported',
      reasonCode: 'capability_not_offered',
      safeMessage: `Provider ${manifest.providerId} does not offer capability ${request.capability}.`,
    }
  }

  // Ready path: a live grant for this capability on a connected account.
  const connectedAccounts = new Map(
    existingAccounts
      .filter((a) => a.providerId === request.providerId && a.status === 'connected')
      .map((a) => [a.id, a]),
  )
  for (const grant of existingGrants) {
    if (grant.capability !== request.capability) continue
    if (grant.revokedAt) continue
    if (new Date(grant.expiresAt).getTime() <= now.getTime()) continue
    const account = connectedAccounts.get(grant.providerAccountId)
    if (!account) continue
    return {
      state: 'ready',
      providerAccountId: account.id,
      grantId: grant.id as CapabilityGrantId,
      mode: grant.mode,
      expiresAt: grant.expiresAt,
    }
  }

  const supportedModes = supportedInteractiveModes(manifest, request.preferredModes)
  if (supportedModes.length === 0) {
    return {
      state: 'unsupported',
      reasonCode: 'no_supported_modes',
      safeMessage: `Provider ${manifest.providerId} has no supported authentication method for this deployment.`,
    }
  }

  return { state: 'authentication_required', supportedModes }
}
