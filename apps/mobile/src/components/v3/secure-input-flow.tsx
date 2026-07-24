import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Text } from 'react-native'
import { sealSecretValue, type SealedValue } from '@2hands/secret-broker/client'
import type { SecureInputRequest, SecureInputSubmissionReceipt } from '@2hands/types/v3'
import { colors as brand } from '@2hands/tailwind-config'
import { useTheme } from '@/lib/theme-context'
import { supabase } from '@/lib/supabase'
import { SecureInputCard, type SecureInputValue } from '@/components/v3/secure-input-card'

/**
 * SecureInputFlow — wires the trusted SecureInputCard visual to the ISOLATED
 * Secret Broker flow (Slice 3, AUTH_SECRETS): challenge → seal → submit.
 * Mirrors apps/web/src/components/v3/cards/secure-input-flow.tsx against the
 * EXPO_PUBLIC_API_URL base with the app's Bearer-token fetch pattern.
 *
 * SECURITY CONTRACT:
 * - Plaintext values exist ONLY in the card's local state and this
 *   component's submit handler locals; overwritten right after sealing and
 *   the reference dropped. Never stored, logged, or sent anywhere else.
 * - Only sealed ciphertext reaches /api/secure-input/submit; the
 *   conversation only ever sees the receipt (opaque secretRefs).
 */

type SecureInputFieldSpec = SecureInputRequest['fields'][number]

interface SecureInputChallengeDto {
  requestId: string
  publicKeyHex: string
  fields: SecureInputFieldSpec[]
  expiresAt: string
}

interface SealedFieldPayload {
  fieldId: string
  kind: SecureInputFieldSpec['kind']
  sealed: SealedValue
  retain?: boolean
}

/** Default login field specs — matches the demo account provider flow. */
const DEFAULT_FIELDS: SecureInputFieldSpec[] = [
  { id: 'email', kind: 'email', label: 'Email' },
  { id: 'password', kind: 'password', label: 'Password', retainOption: true },
]

// Same source as src/lib/api.ts / use-chat.ts — explicit env, no fallback here;
// a missing URL surfaces as the flow's safe error state.
const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim() ?? ''

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
  return headers
}

/** Unwrap the ApiSuccess/ApiFailure envelope; throws safe machine codes only. */
async function readEnvelope<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    | { ok: true; data: T }
    | { ok: false; error?: { code?: string } }
    | null
  if (!response.ok || !body || body.ok !== true) {
    const code = body && body.ok === false ? body.error?.code : undefined
    throw new Error(code ?? 'request_failed')
  }
  return body.data
}

export interface SecureInputFlowProps {
  authRunId: string
  /** Exact origin the credentials are for, e.g. "https://demo.2hands.dev". */
  origin: string
  /** Called with the safe receipt (opaque secretRefs only) after submission. */
  onComplete: (receipt: SecureInputSubmissionReceipt) => void
  onCancel?: () => void
  /** Field specs for the challenge. Defaults to email + password login. */
  fields?: SecureInputFieldSpec[]
  /** Human provider name to display; falls back to the run's providerId. */
  providerName?: string
  title?: string
  description?: string
}

export function SecureInputFlow({
  authRunId,
  origin,
  onComplete,
  onCancel,
  fields,
  providerName,
  title,
  description,
}: SecureInputFlowProps) {
  const { colors } = useTheme()

  const [challenge, setChallenge] = useState<SecureInputChallengeDto | null>(null)
  const [providerId, setProviderId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Field specs are captured once per mount — a new challenge is only minted
  // when the auth run changes, not on prop identity churn.
  const fieldsRef = useRef<SecureInputFieldSpec[]>(fields ?? DEFAULT_FIELDS)

  useEffect(() => {
    let cancelled = false
    const start = async () => {
      setChallenge(null)
      setError(null)
      try {
        if (!API_URL) throw new Error('missing_api_url')
        const headers = await authHeaders()
        const runData = await readEnvelope<{ authRun: { provider_id: string } }>(
          await fetch(`${API_URL}/api/auth-runs/${authRunId}`, { headers })
        )
        const challengeData = await readEnvelope<{ challenge: SecureInputChallengeDto }>(
          await fetch(`${API_URL}/api/secure-input/challenge`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ authRunId, fields: fieldsRef.current }),
          })
        )
        if (cancelled) return
        setProviderId(runData.authRun.provider_id)
        setChallenge(challengeData.challenge)
      } catch {
        // Safe generic copy only — never server or request detail.
        if (!cancelled) setError('Could not start the protected sign-in. Try again shortly.')
      }
    }
    void start()
    return () => {
      cancelled = true
    }
  }, [authRunId])

  const handleSubmitSecure = useCallback(
    async (suppliedValues: SecureInputValue[]) => {
      if (!challenge) throw new Error('challenge_not_ready')

      // SECURITY: seal EACH value to the challenge public key. The plaintext
      // entries are overwritten immediately after sealing and the reference
      // dropped — never stored, logged, or sent anywhere else.
      let values: SecureInputValue[] | null = suppliedValues
      let sealedValues: SealedFieldPayload[]
      try {
        const specById = new Map(challenge.fields.map((spec) => [spec.id, spec]))
        sealedValues = values.map((entry) => {
          const spec = specById.get(entry.fieldId)
          if (!spec) throw new Error('unknown_field')
          return {
            fieldId: entry.fieldId,
            kind: spec.kind,
            sealed: sealSecretValue(entry.value, challenge.publicKeyHex),
            ...(spec.retainOption && entry.retain ? { retain: true } : {}),
          }
        })
      } finally {
        if (values) {
          for (const entry of values) entry.value = ''
        }
        values = null
      }

      // Ciphertext only from here on.
      const data = await readEnvelope<{ receipt: SecureInputSubmissionReceipt }>(
        await fetch(`${API_URL}/api/secure-input/submit`, {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ requestId: challenge.requestId, sealedValues }),
        })
      )
      onComplete(data.receipt)
    },
    [challenge, onComplete]
  )

  if (error) {
    return (
      <Text accessibilityRole="alert" style={{ fontSize: 13, color: brand.functional.error }}>
        {error}
      </Text>
    )
  }

  if (!challenge) {
    return (
      <Text style={{ fontSize: 13, color: colors.textSecondary }}>
        Preparing protected sign-in…
      </Text>
    )
  }

  const request: SecureInputRequest = {
    id: challenge.requestId,
    authRunId,
    providerId: providerId ?? '',
    title: title ?? 'Sign in securely',
    ...(description ? { description } : {}),
    fields: challenge.fields,
    expiresAt: challenge.expiresAt,
  }

  return (
    <SecureInputCard
      request={request}
      providerName={providerName}
      origin={origin}
      onSubmitSecure={handleSubmitSecure}
      onCancel={onCancel ?? (() => {})}
    />
  )
}
