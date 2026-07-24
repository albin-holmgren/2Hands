/**
 * Environment validation with clear, actionable failure messages.
 * Call at startup and in health/doctor endpoints.
 */

import type { EnvCheckResult, ConfidenceFinding, CheckStatus, Severity } from './types'

interface EnvSpec {
  key: string
  required: boolean
  severity: Severity
  description: string
  validate?: (value: string) => string | null // return null = ok, string = error message
}

const ENV_SPECS: EnvSpec[] = [
  // ── Database ────────────────────────────────────────────────────────────
  {
    key: 'NEXT_PUBLIC_SUPABASE_URL',
    required: true,
    severity: 'critical',
    description: 'Supabase project URL',
  },
  {
    key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    required: true,
    severity: 'critical',
    description: 'Supabase anon/public key for client SDK',
  },
  {
    key: 'SUPABASE_SERVICE_ROLE_KEY',
    required: true,
    severity: 'critical',
    description: 'Supabase service role key for admin operations',
  },
  // ── Security ────────────────────────────────────────────────────────────
  {
    key: 'CREDENTIAL_ENCRYPTION_KEY',
    required: true,
    severity: 'critical',
    description: 'AES-256 key (32-byte hex) for encrypting stored credentials',
    validate: (v) =>
      Buffer.from(v, 'hex').length === 32
        ? null
        : 'Must be a 64-character hex string (32 bytes)',
  },
  {
    key: 'VM_SECRET',
    required: true,
    severity: 'critical',
    description: 'Shared secret for signed VM operations',
    validate: (v) =>
      v.length >= 16 ? null : 'Should be at least 16 characters for adequate entropy',
  },
  {
    key: 'CRON_SECRET',
    required: true,
    severity: 'high',
    description: 'Secret that protects cron/scheduler endpoints',
    validate: (v) =>
      v.length >= 16 ? null : 'Should be at least 16 characters for adequate entropy',
  },
  {
    key: 'INTERNAL_API_SECRET',
    required: false,
    severity: 'medium',
    description: 'Secret for internal health-check and diagnostics endpoints',
  },
  // ── AI transport ────────────────────────────────────────────────────────
  {
    key: 'ANTHROPIC_API_KEY',
    required: false,
    severity: 'high',
    description: 'Direct Anthropic API key (required if AI_GATEWAY_API_KEY is absent)',
  },
  {
    key: 'AI_GATEWAY_API_KEY',
    required: false,
    severity: 'high',
    description: 'AI gateway key (preferred over direct Anthropic key)',
  },
]

/** Validate all env vars and return a structured result. */
export function checkEnv(): EnvCheckResult {
  const missing: string[] = []
  const warnings: string[] = []

  for (const spec of ENV_SPECS) {
    const value = (process.env[spec.key] || '').trim()

    if (!value) {
      if (spec.required) {
        missing.push(`${spec.key} — ${spec.description}`)
      } else {
        // optional but worth noting
        if (spec.severity === 'high') {
          warnings.push(`${spec.key} is not set — ${spec.description}`)
        }
      }
      continue
    }

    if (spec.validate) {
      const err = spec.validate(value)
      if (err) {
        missing.push(`${spec.key} is invalid: ${err}`)
      }
    }
  }

  // At least one AI transport must be present
  const hasAiTransport =
    Boolean((process.env.AI_GATEWAY_API_KEY || '').trim()) ||
    Boolean((process.env.ANTHROPIC_API_KEY || '').trim()) ||
    Boolean((process.env.VERCEL_OIDC_TOKEN || '').trim())

  if (!hasAiTransport) {
    missing.push(
      'AI transport: set AI_GATEWAY_API_KEY (recommended) or ANTHROPIC_API_KEY — required for all AI operations'
    )
  }

  const ok = missing.length === 0

  const message = ok
    ? `All ${ENV_SPECS.length} required environment checks passed`
    : `${missing.length} environment problem${missing.length !== 1 ? 's' : ''} found — check deployment configuration`

  return { ok, missing, warnings, message }
}

/** Produce ConfidenceFinding[] from an env check result. */
export function envCheckToFindings(result: EnvCheckResult): ConfidenceFinding[] {
  if (result.ok && result.warnings.length === 0) {
    return [
      {
        id: 'env-configuration',
        severity: 'info',
        status: 'pass' as CheckStatus,
        title: 'Environment configuration is complete',
        recommendation: result.message,
      },
    ]
  }

  const findings: ConfidenceFinding[] = []

  for (const issue of result.missing) {
    const spec = ENV_SPECS.find(s => issue.startsWith(s.key))
    findings.push({
      id: `env-${(spec?.key || 'unknown').toLowerCase().replace(/_/g, '-')}`,
      severity: spec?.severity ?? 'high',
      status: 'fail' as CheckStatus,
      title: `Missing or invalid: ${spec?.key ?? issue.split(' ')[0]}`,
      recommendation: issue,
    })
  }

  for (const warning of result.warnings) {
    const spec = ENV_SPECS.find(s => warning.startsWith(s.key))
    findings.push({
      id: `env-warn-${(spec?.key || 'unknown').toLowerCase().replace(/_/g, '-')}`,
      severity: spec?.severity ?? 'medium',
      status: 'warn' as CheckStatus,
      title: `Optional but recommended: ${spec?.key ?? warning.split(' ')[0]}`,
      recommendation: warning,
    })
  }

  return findings
}

/** Convenience: log env issues to stdout so serverless logs surface them immediately at boot. */
export function logEnvCheck(): void {
  const result = checkEnv()
  if (!result.ok) {
    console.error('[EnvCheck] CONFIGURATION PROBLEMS DETECTED:')
    result.missing.forEach(m => console.error(`  ✗ ${m}`))
  }
  if (result.warnings.length > 0) {
    console.warn('[EnvCheck] Warnings:')
    result.warnings.forEach(w => console.warn(`  ⚠ ${w}`))
  }
  if (result.ok && result.warnings.length === 0) {
    console.info('[EnvCheck] All environment checks passed.')
  }
}
