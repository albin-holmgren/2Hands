export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { supportsChannelTrustProvider } from '@/lib/security/channel-trust'
import { getSessionPoolStats } from '@/lib/compute/session-manager'
import type { ConfidenceFinding } from '@/lib/confidence/types'
import { deriveHealthLevel, summarizeFindings } from '@/lib/confidence/types'

// Use the shared ConfidenceFinding type — no local redeclaration needed
type DoctorFinding = ConfidenceFinding

function hasValidHeaderAuth(request: NextRequest): boolean {
  const configuredSecret = (process.env.INTERNAL_API_SECRET || '').trim()
  const providedSecret = (request.headers.get('x-security-audit-secret') || '').trim()
  return Boolean(configuredSecret) && Boolean(providedSecret) && configuredSecret === providedSecret
}

async function isAuthenticatedRequest(): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    return !error && Boolean(user)
  } catch {
    return false
  }
}

function getStaticFindings(): DoctorFinding[] {
  const findings: DoctorFinding[] = []

  const credentialKey = (process.env.CREDENTIAL_ENCRYPTION_KEY || '').trim()
  const vmSecret = (process.env.VM_SECRET || '').trim()
  const cronSecret = (process.env.CRON_SECRET || '').trim()
  const aiGatewayKey = (process.env.AI_GATEWAY_API_KEY || '').trim()
  const vercelOidc = (process.env.VERCEL_OIDC_TOKEN || '').trim()
  const anthropicApiKey = (process.env.ANTHROPIC_API_KEY || '').trim()

  findings.push({
    id: 'credential-encryption-key',
    severity: 'critical',
    status: Buffer.from(credentialKey || '', 'hex').length === 32 ? 'pass' : 'fail',
    title: 'Credential encryption key is configured with valid length',
    recommendation: 'Set CREDENTIAL_ENCRYPTION_KEY to a 32-byte hex key.',
  })

  findings.push({
    id: 'vm-secret-configured',
    severity: 'critical',
    status: vmSecret.length > 0 ? 'pass' : 'fail',
    title: 'VM secret is configured for signed VM operations',
    recommendation: 'Set VM_SECRET to a strong random value in every environment.',
  })

  findings.push({
    id: 'cron-secret-configured',
    severity: 'high',
    status: cronSecret.length > 0 ? 'pass' : 'fail',
    title: 'Scheduler secret is configured',
    recommendation: 'Set CRON_SECRET to protect scheduler endpoints.',
  })

  findings.push({
    id: 'ai-transport-auth',
    severity: 'high',
    status: aiGatewayKey || vercelOidc || anthropicApiKey ? 'pass' : 'fail',
    title: 'AI transport credentials are configured',
    recommendation: 'Configure AI_GATEWAY_API_KEY (recommended) or ANTHROPIC_API_KEY.',
  })

  return findings
}

async function getDynamicFindings(): Promise<DoctorFinding[]> {
  const findings: DoctorFinding[] = []

  const hasAdminCreds = Boolean((process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim())
    && Boolean((process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim())
  if (!hasAdminCreds) {
    return [
      {
        id: 'stale-outbound-processing',
        severity: 'high',
        status: 'warn',
        title: 'Could not verify stale processing deliveries',
        recommendation: 'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for runtime diagnostics.',
      },
      {
        id: 'open-channel-policies',
        severity: 'medium',
        status: 'warn',
        title: 'Could not evaluate open channel policies',
        recommendation: 'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for runtime diagnostics.',
      },
      {
        id: 'session-pool-health',
        severity: 'high',
        status: 'warn',
        title: 'Could not evaluate session pool health',
        recommendation: 'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for runtime diagnostics.',
      },
      {
        id: 'billing-reconciliation-health',
        severity: 'high',
        status: 'warn',
        title: 'Could not evaluate billing reconciliation health',
        recommendation: 'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for runtime diagnostics.',
      },
    ]
  }

  const supabase = createAdminClient()

  try {
    const staleProcessingCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { count, error } = await supabase
      .from('outbound_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'processing')
      .lt('updated_at', staleProcessingCutoff)

    if (error) {
      findings.push({
        id: 'stale-outbound-processing',
        severity: 'high',
        status: 'warn',
        title: 'Could not verify stale processing deliveries',
        recommendation: 'Check outbound_deliveries table health and query permissions.',
      })
    } else {
      const staleCount = count || 0
      findings.push({
        id: 'stale-outbound-processing',
        severity: 'high',
        status: staleCount >= 50 ? 'fail' : staleCount > 0 ? 'warn' : 'pass',
        title: 'Outbound processing queue is healthy',
        recommendation: 'Investigate delivery workers/retries when stale processing rows accumulate.',
        details: { stale_processing_count: staleCount },
      })
    }
  } catch {
    findings.push({
      id: 'stale-outbound-processing',
      severity: 'high',
      status: 'warn',
      title: 'Could not verify stale processing deliveries',
      recommendation: 'Check outbound_deliveries table health and query permissions.',
    })
  }

  try {
    const { data, error } = await supabase
      .from('integration_connections')
      .select('id, provider, config')
      .eq('status', 'active')

    if (error) {
      findings.push({
        id: 'open-channel-policies',
        severity: 'medium',
        status: 'warn',
        title: 'Could not evaluate open channel policies',
        recommendation: 'Check integration_connections read health and evaluate policy posture manually.',
      })
    } else {
      const rows = (data || []) as Array<{ provider: string; config: Record<string, unknown> | null }>
      const openCount = rows.filter((row) => {
        if (!supportsChannelTrustProvider(row.provider)) return false
        const policy = typeof row.config?.channel_access_policy === 'string'
          ? row.config.channel_access_policy.trim().toLowerCase()
          : ''
        return policy === 'open'
      }).length

      findings.push({
        id: 'open-channel-policies',
        severity: 'medium',
        status: openCount > 0 ? 'warn' : 'pass',
        title: 'Trust-enabled channel integrations are not publicly open by default',
        recommendation: 'Prefer pairing/allowlist for production channels; use open only with explicit risk acceptance.',
        details: { open_policy_connections: openCount },
      })
    }
  } catch {
    findings.push({
      id: 'open-channel-policies',
      severity: 'medium',
      status: 'warn',
      title: 'Could not evaluate open channel policies',
      recommendation: 'Check integration_connections read health and evaluate policy posture manually.',
    })
  }

  try {
    const stats = await getSessionPoolStats()
    const depleted = stats.availableHealthy === 0 && (stats.leased > 0 || stats.total > 0)
    const staleLeases = stats.expiredLeases > 0
    const rpcUnavailable = stats.claimRpcAvailability === 'unavailable'

    findings.push({
      id: 'session-pool-health',
      severity: 'high',
      status: depleted ? 'fail' : staleLeases || rpcUnavailable ? 'warn' : 'pass',
      title: 'Session pool has healthy available capacity',
      recommendation: 'Investigate session pool maintenance if availableHealthy is 0, leases expire, or RPC leasing is unavailable.',
      details: {
        total_slots: stats.total,
        available_healthy: stats.availableHealthy,
        warming: stats.warming,
        leased: stats.leased,
        draining: stats.draining,
        unhealthy: stats.unhealthy,
        expired_leases: stats.expiredLeases,
        claim_rpc_availability: stats.claimRpcAvailability,
      },
    })
  } catch {
    findings.push({
      id: 'session-pool-health',
      severity: 'high',
      status: 'warn',
      title: 'Could not evaluate session pool health',
      recommendation: 'Check session_pool table access and maintenance endpoint health.',
    })
  }

  try {
    const billingCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const [{ count: failedCommitCount, error: failedCommitError }, { count: escalatedCount, error: escalatedError }] = await Promise.all([
      supabase
        .from('agent_run_events')
        .select('id', { count: 'exact', head: true })
        .eq('name', 'credit_commit_failed')
        .gte('created_at', billingCutoff),
      supabase
        .from('agents')
        .select('id', { count: 'exact', head: true })
        .contains('config', { billing_reconciliation_escalated: true }),
    ])

    if (failedCommitError || escalatedError) {
      findings.push({
        id: 'billing-reconciliation-health',
        severity: 'high',
        status: 'warn',
        title: 'Could not evaluate billing reconciliation health',
        recommendation: 'Check agent_run_events query permissions and credit commit telemetry.',
      })
    } else {
      const recentCommitFailures = failedCommitCount || 0
      const escalatedReconciliations = escalatedCount || 0
      findings.push({
        id: 'billing-reconciliation-health',
        severity: 'high',
        status: escalatedReconciliations > 0
          ? 'fail'
          : recentCommitFailures >= 10
            ? 'fail'
            : recentCommitFailures > 0
              ? 'warn'
              : 'pass',
        title: 'Credit reservation commits are healthy',
        recommendation: 'Investigate commit_credit_reservation failures and reconcile flagged runs when counts rise.',
        details: {
          failed_commits_last_hour: recentCommitFailures,
          escalated_reconciliations: escalatedReconciliations,
        },
      })
    }
  } catch {
    findings.push({
      id: 'billing-reconciliation-health',
      severity: 'high',
      status: 'warn',
      title: 'Could not evaluate billing reconciliation health',
      recommendation: 'Check agent_run_events query permissions and credit commit telemetry.',
    })
  }

  return findings
}

export async function GET(request: NextRequest) {
  const allowed = hasValidHeaderAuth(request) || await isAuthenticatedRequest()
  if (!allowed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const findings = [...getStaticFindings(), ...(await getDynamicFindings())]

  // Doctor route uses severity-based fail-only level derivation:
  // warns (e.g. unavailable DB in test/cold-start) do not escalate level.
  // Only actual fail findings by severity matter here.
  const hasCriticalFail = findings.some(f => f.severity === 'critical' && f.status === 'fail')
  const hasHighFail = findings.some(f => f.severity === 'high' && f.status === 'fail')
  const level: import('@/lib/confidence/types').HealthLevel =
    hasCriticalFail ? 'unhealthy' : hasHighFail ? 'degraded' : 'healthy'

  return NextResponse.json({
    level,
    status: level, // backward-compat alias
    timestamp: new Date().toISOString(),
    summary: summarizeFindings(findings),
    findings,
  }, {
    status: level === 'healthy' ? 200 : 503,
  })
}
