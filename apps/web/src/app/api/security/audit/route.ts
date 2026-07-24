export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ConfidenceFinding } from '@/lib/confidence/types'
import { deriveHealthLevel, summarizeFindings } from '@/lib/confidence/types'

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

function getSecurityFindings(): ConfidenceFinding[] {
  const findings: ConfidenceFinding[] = []

  const credentialKey = (process.env.CREDENTIAL_ENCRYPTION_KEY || '').trim()
  const vmSecret = (process.env.VM_SECRET || '').trim()
  const cronSecret = (process.env.CRON_SECRET || '').trim()
  const internalApiSecret = (process.env.INTERNAL_API_SECRET || '').trim()
  const aiGatewayKey = (process.env.AI_GATEWAY_API_KEY || '').trim()
  const vercelOidc = (process.env.VERCEL_OIDC_TOKEN || '').trim()
  const anthropicApiKey = (process.env.ANTHROPIC_API_KEY || '').trim()

  const credentialKeyBuffer = Buffer.from(credentialKey || '', 'hex')
  findings.push({
    id: 'credential-encryption-key',
    severity: 'critical',
    status: credentialKeyBuffer.length === 32 ? 'pass' : 'fail',
    title: 'Credential encryption key is configured with valid length',
    recommendation: 'Set CREDENTIAL_ENCRYPTION_KEY to a 32-byte hex key (openssl rand -hex 32).',
  })

  findings.push({
    id: 'vm-secret-configured',
    severity: 'critical',
    status: vmSecret.length > 0 ? 'pass' : 'fail',
    title: 'VM HMAC secret is configured',
    recommendation: 'Set VM_SECRET to a strong random secret in all environments.',
  })

  findings.push({
    id: 'cron-secret-configured',
    severity: 'high',
    status: cronSecret.length > 0 ? 'pass' : 'fail',
    title: 'Scheduler secret is configured',
    recommendation: 'Set CRON_SECRET to protect scheduler endpoints from unauthorized execution.',
  })

  findings.push({
    id: 'internal-api-secret-configured',
    severity: 'high',
    status: internalApiSecret.length > 0 ? 'pass' : 'warn',
    title: 'Internal API secret is configured',
    recommendation: 'Set INTERNAL_API_SECRET to protect internal-only operational endpoints.',
  })

  const hasAiTransport = Boolean(aiGatewayKey || vercelOidc || anthropicApiKey)
  findings.push({
    id: 'ai-transport-auth',
    severity: 'medium',
    status: hasAiTransport ? 'pass' : 'warn',
    title: 'At least one AI transport credential is configured',
    recommendation: 'Configure AI_GATEWAY_API_KEY (recommended) or ANTHROPIC_API_KEY for model access.',
  })

  return findings
}

export async function GET(request: NextRequest) {
  const allowed = hasValidHeaderAuth(request) || await isAuthenticatedRequest()
  if (!allowed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const findings = getSecurityFindings()
  const level = deriveHealthLevel(findings)
  const summary = summarizeFindings(findings)

  return NextResponse.json({
    level,
    status: level, // backward-compat alias
    timestamp: new Date().toISOString(),
    summary: {
      ...summary,
      total: findings.length,
    },
    findings,
  }, {
    status: level === 'healthy' ? 200 : 503,
  })
}
