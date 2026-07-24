"use client"

/**
 * SecureInputFlow — wires the trusted SecureInputCard visual to the ISOLATED
 * Secret Broker flow (Slice 3, AUTH_SECRETS): challenge → seal → submit.
 *
 * On mount it POSTs /api/secure-input/challenge for the auth run and renders
 * the card with the challenge's field specs. On submit, EACH value is sealed
 * client-side to the challenge x25519 public key (`sealSecretValue`), so only
 * ciphertext ever crosses the wire — then POSTed to /api/secure-input/submit.
 *
 * ============================================================================
 * SECURITY CONTRACT
 * ----------------------------------------------------------------------------
 * - Plaintext values exist ONLY inside the card's local state and this
 *   component's submit handler locals. They are overwritten immediately
 *   after sealing and the reference is dropped.
 * - Plaintext is NEVER placed in state stores, logs, analytics, URLs, or any
 *   other fetch. Only sealed ciphertext reaches the isolated endpoint.
 * - The conversation only ever sees the SecureInputSubmissionReceipt
 *   (opaque secretRefs — no values, lengths, or hashes).
 * ============================================================================
 */

import * as React from "react"
import { sealSecretValue, type SealedValue } from "@2hands/secret-broker/client"
import type { SecureInputRequest, SecureInputSubmissionReceipt } from "@2hands/types/v3"

import { cn } from "@/lib/utils"
import { SecureInputCard } from "@/components/v3/cards/secure-input-card"

type SecureInputFieldSpec = SecureInputRequest["fields"][number]

interface SecureInputChallengeDto {
  requestId: string
  publicKeyHex: string
  fields: SecureInputFieldSpec[]
  expiresAt: string
}

interface SealedFieldPayload {
  fieldId: string
  kind: SecureInputFieldSpec["kind"]
  sealed: SealedValue
  retain?: boolean
}

/** Default login field specs — matches the demo account provider flow. */
const DEFAULT_FIELDS: SecureInputFieldSpec[] = [
  { id: "email", kind: "email", label: "Email" },
  { id: "password", kind: "password", label: "Password", retainOption: true },
]

interface SecureInputFlowProps {
  authRunId: string
  /** Called with the safe receipt (opaque secretRefs only) after submission. */
  onComplete: (receipt: SecureInputSubmissionReceipt) => void
  onCancel?: () => void
  /** Field specs for the challenge. Defaults to email + password login. */
  fields?: SecureInputFieldSpec[]
  /** Human provider name to display; falls back to the run's providerId. */
  providerName?: string
  /** Exact origin the credentials are for, e.g. "https://demo.2hands.dev". */
  origin?: string
  title?: string
  description?: string
  className?: string
}

/** Unwrap the ApiSuccess/ApiFailure envelope; throws safe machine codes only. */
async function readEnvelope<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    | { ok: true; data: T }
    | { ok: false; error?: { code?: string } }
    | null
  if (!response.ok || !body || body.ok !== true) {
    const code = body && body.ok === false ? body.error?.code : undefined
    throw new Error(code ?? "request_failed")
  }
  return body.data
}

function SecureInputFlow({
  authRunId,
  onComplete,
  onCancel,
  fields,
  providerName,
  origin,
  title,
  description,
  className,
}: SecureInputFlowProps) {
  const [challenge, setChallenge] = React.useState<SecureInputChallengeDto | null>(null)
  const [providerId, setProviderId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // Field specs are captured once per mount — a new challenge is only minted
  // when the auth run changes, not on prop identity churn.
  const fieldsRef = React.useRef<SecureInputFieldSpec[]>(fields ?? DEFAULT_FIELDS)

  React.useEffect(() => {
    let cancelled = false
    const start = async () => {
      setChallenge(null)
      setError(null)
      try {
        const runData = await readEnvelope<{ authRun: { provider_id: string } }>(
          await fetch(`/api/auth-runs/${authRunId}`)
        )
        const challengeData = await readEnvelope<{ challenge: SecureInputChallengeDto }>(
          await fetch("/api/secure-input/challenge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ authRunId, fields: fieldsRef.current }),
          })
        )
        if (cancelled) return
        setProviderId(runData.authRun.provider_id)
        setChallenge(challengeData.challenge)
      } catch {
        // Safe generic copy only — never server or request detail.
        if (!cancelled) setError("Could not start the protected sign-in. Try again shortly.")
      }
    }
    void start()
    return () => {
      cancelled = true
    }
  }, [authRunId])

  const handleSubmitSecure = React.useCallback(
    async (plaintextValues: Record<string, string>, retain?: boolean) => {
      if (!challenge) throw new Error("challenge_not_ready")

      // SECURITY: seal EACH value to the challenge public key. The plaintext
      // map is overwritten immediately after sealing and the reference is
      // dropped — it never reaches state stores, logs, or any other fetch.
      let values: Record<string, string> | null = plaintextValues
      let sealedValues: SealedFieldPayload[]
      try {
        sealedValues = challenge.fields.map((field) => ({
          fieldId: field.id,
          kind: field.kind,
          sealed: sealSecretValue(values?.[field.id] ?? "", challenge.publicKeyHex),
          ...(field.retainOption && retain === true ? { retain: true } : {}),
        }))
      } finally {
        if (values) {
          for (const id of Object.keys(values)) values[id] = ""
        }
        values = null
      }

      // Ciphertext only from here on.
      const data = await readEnvelope<{ receipt: SecureInputSubmissionReceipt }>(
        await fetch("/api/secure-input/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: challenge.requestId, sealedValues }),
        })
      )
      onComplete(data.receipt)
    },
    [challenge, onComplete]
  )

  if (error) {
    return (
      <p role="status" className={cn("text-[13px] leading-[18px] text-[var(--color-error)]", className)}>
        {error}
      </p>
    )
  }

  if (!challenge) {
    return (
      <p role="status" className={cn("text-[13px] leading-[18px] text-muted-foreground", className)}>
        Preparing protected sign-in…
      </p>
    )
  }

  const request: SecureInputRequest = {
    id: challenge.requestId,
    authRunId,
    providerId: providerId ?? "",
    title: title ?? "Sign in securely",
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
      onCancel={onCancel}
      className={className}
    />
  )
}

export { SecureInputFlow }
export type { SecureInputFlowProps }
