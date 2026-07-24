export type CapabilityProfile = 'full' | 'read_only' | 'restricted'

export interface CapabilityDecision {
  allowed: boolean
  profile: CapabilityProfile
  reason: string
}

const WRITE_OPERATION_HINTS = [
  'create',
  'update',
  'delete',
  'insert',
  'post',
  'put',
  'patch',
  'send',
  'write',
  'archive',
  'remove',
]

export function getCapabilityProfile(config: Record<string, unknown> | null | undefined): CapabilityProfile {
  const raw = typeof config?.capability_profile === 'string'
    ? config.capability_profile.trim().toLowerCase()
    : ''

  if (raw === 'read_only' || raw === 'restricted' || raw === 'full') {
    return raw
  }

  return 'full'
}

function isWriteTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase()
  return WRITE_OPERATION_HINTS.some((hint) => normalized.includes(hint))
}

function getRestrictedAllowlist(config: Record<string, unknown> | null | undefined): string[] {
  const value = config?.allowed_tools
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function evaluateCapability(params: {
  config: Record<string, unknown> | null | undefined
  toolName: string
}): CapabilityDecision {
  const profile = getCapabilityProfile(params.config)
  const toolName = params.toolName.trim()

  if (!toolName) {
    return {
      allowed: false,
      profile,
      reason: 'Tool name is required for capability evaluation',
    }
  }

  if (profile === 'full') {
    return {
      allowed: true,
      profile,
      reason: 'Full profile allows all tools',
    }
  }

  if (profile === 'read_only') {
    const writeTool = isWriteTool(toolName)
    return {
      allowed: !writeTool,
      profile,
      reason: writeTool
        ? 'Read-only profile blocks write-like operations'
        : 'Read-only profile allows non-write operations',
    }
  }

  const allowlist = getRestrictedAllowlist(params.config)
  const allowed = allowlist.includes(toolName)
  return {
    allowed,
    profile,
    reason: allowed
      ? 'Restricted profile allowlist permits this tool'
      : 'Restricted profile blocks tools not in allowlist',
  }
}

export function applyDefaultCapabilityConfig(config: Record<string, unknown>): Record<string, unknown> {
  const nextConfig: Record<string, unknown> = { ...config }

  if (typeof nextConfig.capability_profile !== 'string') {
    nextConfig.capability_profile = 'full'
  }

  if (!Array.isArray(nextConfig.allowed_tools)) {
    nextConfig.allowed_tools = []
  }

  return nextConfig
}
