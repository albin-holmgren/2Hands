"use client"

/**
 * v3 protected credential card — trusted VISUAL primitive (UX.md §6, AUTH_SECRETS).
 *
 * This is a compiled, trusted component. It is never model-generated HTML.
 *
 * ============================================================================
 * SECURITY CONTRACT — READ BEFORE WIRING
 * ----------------------------------------------------------------------------
 * Values typed into this card are PROTECTED SECRETS. They must NEVER be sent
 * to conversation endpoints (/api/chat, /api/conversations, /api/messages),
 * never placed in transcript state, zustand stores, analytics, logs, URLs,
 * or model context — in any form, including lengths, hashes, or previews.
 *
 * `onSubmitSecure` exists solely for the Slice 3 Secret Broker to wire to the
 * isolated `/api/secure-input/*` endpoint (no body logging, no analytics, no
 * model calls). The broker exchanges the raw values for opaque SecretReference
 * handles server-side; only those opaque refs may ever reach the conversation.
 * ============================================================================
 *
 * Trusted styling: double border, lock icon, "Protected by 2Hands" header,
 * provider name + exact origin, opaque (never glass) secret-field background.
 * After submit the local state is cleared and a "Supplied securely" status
 * replaces the form.
 */

import * as React from "react"
import { CheckIcon, EyeIcon, EyeOffIcon, LockIcon } from "lucide-react"
import type { SecureInputRequest } from "@2hands/types/v3"

import { cn } from "@/lib/utils"

type SecureInputField = SecureInputRequest["fields"][number]

interface SecureInputCardProps {
  request: SecureInputRequest
  /** Human provider name to display (falls back to request.providerId). */
  providerName?: string
  /** Exact origin the credentials are for, e.g. "https://claude.ai". */
  origin?: string
  /**
   * SECURITY: wire ONLY to the isolated secure-input broker endpoint.
   * Values must NEVER be sent to conversation endpoints or model context.
   * `retain` reflects the "Remember this login" checkbox (false by default).
   */
  onSubmitSecure: (values: Record<string, string>, retain?: boolean) => void | Promise<void>
  onCancel?: () => void
  className?: string
}

/** Native input semantics per secret kind — keeps password-manager autofill working. */
function fieldAttributes(field: SecureInputField): {
  type: React.HTMLInputTypeAttribute
  autoComplete: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
  maskable: boolean
} {
  switch (field.kind) {
    case "email":
      return { type: "email", autoComplete: field.autocomplete ?? "email", maskable: false }
    case "username":
      return { type: "text", autoComplete: field.autocomplete ?? "username", maskable: false }
    case "password":
      return {
        type: "password",
        autoComplete: field.autocomplete ?? "current-password",
        maskable: true,
      }
    case "otp":
      return {
        type: "text",
        autoComplete: field.autocomplete ?? "one-time-code",
        inputMode: "numeric",
        maskable: false,
      }
    case "api_key":
      return { type: "password", autoComplete: field.autocomplete ?? "off", maskable: true }
  }
}

function SecureInputCard({
  request,
  providerName,
  origin,
  onSubmitSecure,
  onCancel,
  className,
}: SecureInputCardProps) {
  // Local-only state. Cleared immediately after a successful submit.
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [revealed, setRevealed] = React.useState<Record<string, boolean>>({})
  const [retain, setRetain] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [supplied, setSupplied] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [expired, setExpired] = React.useState(
    () => new Date(request.expiresAt).getTime() <= Date.now()
  )

  React.useEffect(() => {
    const check = () => setExpired(new Date(request.expiresAt).getTime() <= Date.now())
    check()
    const interval = window.setInterval(check, 1000)
    return () => window.clearInterval(interval)
  }, [request.expiresAt])

  const showRetainOption = request.fields.some((field) => field.retainOption)
  const allFilled = request.fields.every((field) => (values[field.id] ?? "").length > 0)
  const inactive = submitting || supplied || expired

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inactive || !allFilled) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      // SECURITY: `values` may go ONLY to the isolated secure-input endpoint.
      await onSubmitSecure({ ...values }, showRetainOption ? retain : undefined)
      // Clear all local secret state the moment the broker has the values.
      setValues({})
      setRevealed({})
      setSupplied(true)
    } catch {
      // Safe generic copy only — the broker never surfaces value-derived detail.
      setSubmitError("Something went wrong. Check the values and try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const displayName = providerName ?? request.providerId

  return (
    <section
      data-slot="secure-input-card"
      aria-label={`Protected sign-in for ${displayName}`}
      className={cn(
        // Double border: outer warm-black/terracotta-tinted ring + inner default border.
        "w-full rounded-[24px] border border-border bg-card p-1",
        "ring-1 ring-[var(--color-brand-black)]/25 ring-offset-0 dark:ring-[var(--border-strong)]",
        "shadow-[0_8px_40px_-8px_rgba(0,0,0,0.12),0_2px_8px_-2px_rgba(0,0,0,0.06)]",
        className
      )}
    >
      <div className="rounded-[20px] border border-[var(--border-subtle)] bg-card p-4">
        <header className="flex flex-col gap-1 pb-3">
          <p className="flex items-center gap-1.5 text-[11px] leading-4 font-medium tracking-wide uppercase text-muted-foreground">
            <LockIcon aria-hidden className="size-3.5 text-[var(--color-brand-terracotta)]" />
            Protected by 2Hands
          </p>
          <h3 className="text-base leading-6 font-medium text-foreground">{request.title}</h3>
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {displayName}
            {origin && (
              <>
                {" · "}
                <span className="font-mono text-[12px]">{origin}</span>
              </>
            )}
          </p>
          {request.description && (
            <p className="text-sm leading-5 text-muted-foreground">{request.description}</p>
          )}
        </header>

        {supplied ? (
          <p
            role="status"
            className="flex items-center gap-1.5 rounded-xl bg-secondary px-3 py-3 text-sm font-medium text-foreground"
          >
            <CheckIcon aria-hidden className="size-4 text-[#10B981]" />
            Supplied securely. The AI never saw these values.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3" autoComplete="on">
            {request.fields.map((field) => {
              const attrs = fieldAttributes(field)
              const isRevealed = revealed[field.id] === true
              return (
                <div key={field.id} className="flex flex-col gap-1">
                  <label
                    htmlFor={`secure-${request.id}-${field.id}`}
                    className="text-[13px] leading-[18px] font-medium text-foreground"
                  >
                    {field.label}
                  </label>
                  <div className="relative">
                    <input
                      id={`secure-${request.id}-${field.id}`}
                      name={field.id}
                      type={attrs.maskable && isRevealed ? "text" : attrs.type}
                      autoComplete={attrs.autoComplete}
                      inputMode={attrs.inputMode}
                      required
                      disabled={inactive}
                      value={values[field.id] ?? ""}
                      onChange={(event) =>
                        setValues((prev) => ({ ...prev, [field.id]: event.target.value }))
                      }
                      spellCheck={false}
                      className={cn(
                        // Opaque background — secret fields never use glass.
                        "h-11 w-full rounded-xl border border-[var(--input-border)] bg-[var(--bg-primary)] px-3",
                        attrs.maskable && "pr-11",
                        "text-base text-foreground placeholder:text-[var(--text-placeholder)]",
                        "transition-colors duration-150 hover:border-[var(--input-border-hover)]",
                        "focus:border-[var(--input-border-focus)] focus:outline-none",
                        "focus-visible:ring-ring/30 focus-visible:ring-[3px]",
                        "disabled:cursor-not-allowed disabled:opacity-50"
                      )}
                    />
                    {attrs.maskable && (
                      <button
                        type="button"
                        aria-label={isRevealed ? `Hide ${field.label}` : `Show ${field.label}`}
                        aria-pressed={isRevealed}
                        disabled={inactive}
                        onClick={() =>
                          setRevealed((prev) => ({ ...prev, [field.id]: !isRevealed }))
                        }
                        className={cn(
                          "absolute top-0 right-0 flex size-11 items-center justify-center rounded-xl text-muted-foreground",
                          "transition-colors duration-150 hover:text-foreground",
                          "focus-visible:ring-ring/30 focus-visible:ring-[3px] focus-visible:outline-none",
                          "disabled:pointer-events-none disabled:opacity-50"
                        )}
                      >
                        {isRevealed ? (
                          <EyeOffIcon aria-hidden className="size-4" />
                        ) : (
                          <EyeIcon aria-hidden className="size-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}

            {showRetainOption && (
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm leading-5 text-foreground">
                <input
                  type="checkbox"
                  checked={retain}
                  disabled={inactive}
                  onChange={(event) => setRetain(event.target.checked)}
                  className="size-4 shrink-0 rounded accent-[var(--color-brand-black)] dark:accent-[var(--color-brand-terracotta)]"
                />
                Remember this login
              </label>
            )}

            <p className="text-[13px] leading-[18px] text-muted-foreground">
              The AI cannot read these values. They go directly to a protected vault.
            </p>

            {submitError && (
              <p role="status" className="text-[13px] leading-[18px] text-[var(--color-error)]">
                {submitError}
              </p>
            )}

            {expired && (
              <p role="status" className="text-[13px] leading-[18px] text-[var(--color-error)]">
                This request expired. Ask 2Hands to restart the sign-in.
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              {onCancel && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={onCancel}
                  className={cn(
                    "flex h-11 items-center justify-center rounded-lg px-4 text-sm font-medium text-muted-foreground",
                    "transition-colors duration-150 hover:bg-accent hover:text-foreground",
                    "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
                    "disabled:pointer-events-none disabled:opacity-50"
                  )}
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                data-slot="secure-input-submit"
                disabled={inactive || !allFilled}
                className={cn(
                  "flex h-11 min-w-32 items-center justify-center gap-1.5 rounded-lg px-5",
                  "bg-[var(--color-brand-black)] text-sm font-medium text-white",
                  "transition-opacity duration-150 hover:opacity-85",
                  "dark:bg-[var(--color-brand-beige)] dark:text-[var(--color-brand-black)]",
                  "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
                  "disabled:pointer-events-none disabled:opacity-50"
                )}
              >
                <LockIcon aria-hidden className="size-4" />
                {submitting ? "Supplying…" : "Continue securely"}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  )
}

export { SecureInputCard }
export type { SecureInputCardProps }
