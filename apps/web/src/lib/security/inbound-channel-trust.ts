import { createAdminClient } from '@/lib/supabase/admin'
import {
  evaluateChannelTrust,
  markPendingExternalUser,
  supportsChannelTrustProvider,
  type ChannelTrustDecision,
  type ChannelTrustPolicy,
} from './channel-trust'

export interface InboundTrustConnection {
  id: string
  provider: string
  config: Record<string, unknown> | null | undefined
}

export interface InboundChannelTrustResult {
  allowed: boolean
  decision: ChannelTrustDecision
}

const TRUST_BYPASSED_DECISION: ChannelTrustDecision = {
  allowed: true,
  requiresPairing: false,
  policy: 'open' as ChannelTrustPolicy,
  reason: 'Provider does not enforce channel trust policy',
}

export async function enforceInboundChannelTrust(params: {
  connection: InboundTrustConnection
  externalUserId: string | null
}): Promise<InboundChannelTrustResult> {
  const { connection, externalUserId } = params

  if (!supportsChannelTrustProvider(connection.provider)) {
    return { allowed: true, decision: TRUST_BYPASSED_DECISION }
  }

  const decision = evaluateChannelTrust({
    config: connection.config,
    externalUserId,
  })

  if (!decision.allowed && decision.requiresPairing) {
    const supabase = createAdminClient()
    const nextConfig = markPendingExternalUser(connection.config, externalUserId)

    await supabase
      .from('integration_connections')
      .update({
        config: nextConfig,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', connection.id)
  }

  return {
    allowed: decision.allowed,
    decision,
  }
}
