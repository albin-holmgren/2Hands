export type ChannelTrustPolicy = 'pairing' | 'allowlist' | 'open' | 'disabled'

export interface ChannelTrustDecision {
  allowed: boolean
  requiresPairing: boolean
  policy: ChannelTrustPolicy
  reason: string
}

const VALID_POLICIES: ChannelTrustPolicy[] = ['pairing', 'allowlist', 'open', 'disabled']
const CHANNEL_TRUST_PROVIDERS = new Set(['slack', 'discord'])

export function supportsChannelTrustProvider(provider: string): boolean {
  return CHANNEL_TRUST_PROVIDERS.has(provider.trim().toLowerCase())
}

export function getChannelTrustPolicy(config: Record<string, unknown> | null | undefined): ChannelTrustPolicy {
  const raw = typeof config?.channel_access_policy === 'string'
    ? config.channel_access_policy.trim().toLowerCase()
    : ''

  if (VALID_POLICIES.includes(raw as ChannelTrustPolicy)) {
    return raw as ChannelTrustPolicy
  }

  return 'pairing'
}

export function getAllowedExternalUserIds(config: Record<string, unknown> | null | undefined): string[] {
  const value = config?.allowed_external_user_ids
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function getPendingExternalUserIds(config: Record<string, unknown> | null | undefined): string[] {
  const value = config?.pending_external_user_ids
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function markPendingExternalUser(
  config: Record<string, unknown> | null | undefined,
  externalUserId: string | null
): Record<string, unknown> {
  const userId = externalUserId?.trim() || ''
  const nextConfig: Record<string, unknown> = { ...(config || {}) }

  if (!userId) return nextConfig

  const allowed = new Set(getAllowedExternalUserIds(nextConfig))
  if (allowed.has(userId)) {
    return nextConfig
  }

  const pending = new Set(getPendingExternalUserIds(nextConfig))
  pending.add(userId)
  nextConfig.pending_external_user_ids = Array.from(pending)
  return nextConfig
}

export function approveExternalUser(
  config: Record<string, unknown> | null | undefined,
  externalUserId: string
): Record<string, unknown> {
  const userId = externalUserId.trim()
  const nextConfig: Record<string, unknown> = { ...(config || {}) }
  if (!userId) return nextConfig

  const allowed = new Set(getAllowedExternalUserIds(nextConfig))
  allowed.add(userId)
  nextConfig.allowed_external_user_ids = Array.from(allowed)

  const pending = new Set(getPendingExternalUserIds(nextConfig))
  pending.delete(userId)
  nextConfig.pending_external_user_ids = Array.from(pending)

  return nextConfig
}

export function revokeExternalUser(
  config: Record<string, unknown> | null | undefined,
  externalUserId: string
): Record<string, unknown> {
  const userId = externalUserId.trim()
  const nextConfig: Record<string, unknown> = { ...(config || {}) }
  if (!userId) return nextConfig

  const allowed = new Set(getAllowedExternalUserIds(nextConfig))
  allowed.delete(userId)
  nextConfig.allowed_external_user_ids = Array.from(allowed)

  const pending = new Set(getPendingExternalUserIds(nextConfig))
  pending.delete(userId)
  nextConfig.pending_external_user_ids = Array.from(pending)

  return nextConfig
}

export function evaluateChannelTrust(params: {
  config: Record<string, unknown> | null | undefined
  externalUserId: string | null
}): ChannelTrustDecision {
  const policy = getChannelTrustPolicy(params.config)

  if (policy === 'disabled') {
    return {
      allowed: false,
      requiresPairing: false,
      policy,
      reason: 'Channel integration is disabled by policy',
    }
  }

  if (policy === 'open') {
    return {
      allowed: true,
      requiresPairing: false,
      policy,
      reason: 'Open policy allows all inbound users',
    }
  }

  const allowedExternalUserIds = getAllowedExternalUserIds(params.config)
  const externalUserId = params.externalUserId?.trim() || ''
  const isAllowed = Boolean(externalUserId) && allowedExternalUserIds.includes(externalUserId)

  if (policy === 'allowlist') {
    return {
      allowed: isAllowed,
      requiresPairing: false,
      policy,
      reason: isAllowed
        ? 'User is present in channel allowlist'
        : 'User is not present in channel allowlist',
    }
  }

  // pairing policy
  if (isAllowed) {
    return {
      allowed: true,
      requiresPairing: false,
      policy,
      reason: 'User already paired via allowlist',
    }
  }

  return {
    allowed: false,
    requiresPairing: true,
    policy,
    reason: 'User is unpaired and pairing policy is enforced',
  }
}

export function applyDefaultChannelTrustConfig(
  config: Record<string, unknown>,
  provider: string
): Record<string, unknown> {
  const nextConfig: Record<string, unknown> = { ...config }

  if (supportsChannelTrustProvider(provider) && typeof nextConfig.channel_access_policy !== 'string') {
    nextConfig.channel_access_policy = 'pairing'
  }

  if (!Array.isArray(nextConfig.allowed_external_user_ids)) {
    nextConfig.allowed_external_user_ids = []
  }

  if (!Array.isArray(nextConfig.pending_external_user_ids)) {
    nextConfig.pending_external_user_ids = []
  }

  return nextConfig
}
