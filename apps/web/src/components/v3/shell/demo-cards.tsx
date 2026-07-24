'use client'

/**
 * Dev-only demo rendering of the v3 trust cards (ApprovalCard +
 * SecureInputCard) so they are visually testable.
 *
 * Rendered ONLY when the page is opened with `?demo=cards` in non-production
 * builds. Handlers are inert: nothing is sent anywhere.
 *
 * NOTE (Slice 3): the SecureInputCard below stays as a purely VISUAL demo
 * with an inert handler. The wired production path is
 * `@/components/v3/cards/secure-input-flow` (SecureInputFlow), which mints a
 * challenge via the isolated /api/secure-input/* segment and submits sealed
 * ciphertext only — use that component for any real auth run.
 */

import * as React from 'react'
import type { Approval, SecureInputRequest } from '@2hands/types/v3'

import { ApprovalCard } from '@/components/v3/cards/approval-card'
import { SecureInputCard } from '@/components/v3/cards/secure-input-card'

type DemoApproval = Pick<
  Approval,
  | 'id'
  | 'title'
  | 'summary'
  | 'riskClass'
  | 'reversibility'
  | 'status'
  | 'expiresAt'
  | 'category'
  | 'estimatedMaxCostCredits'
>

/**
 * Demo data is built after mount (expiry is relative to "now"), which also
 * keeps the countdown out of server-rendered HTML — no hydration mismatch.
 */
function useDemoData() {
  const [data, setData] = React.useState<{
    approval: DemoApproval
    secureInput: SecureInputRequest
  } | null>(null)

  React.useEffect(() => {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    setData({
      approval: {
        id: 'demo-approval-1',
        title: 'Send email via Demo Gmail',
        summary: 'One email to one recipient, exactly as previewed below.',
        riskClass: 'r2_external_write',
        category: 'external_communication',
        reversibility: 'irreversible',
        estimatedMaxCostCredits: 2,
        status: 'pending',
        expiresAt,
      },
      secureInput: {
        id: 'demo-secure-input-1',
        authRunId: 'demo-auth-run-1',
        providerId: 'demo-account-provider',
        title: 'Sign in to Demo Account Provider',
        description: 'Your credentials go straight to the protected vault — never through the AI.',
        fields: [
          { id: 'email', kind: 'email', label: 'Email' },
          { id: 'password', kind: 'password', label: 'Password', retainOption: true },
        ],
        expiresAt,
      },
    })
  }, [])

  return data
}

export function DemoCards({ className }: { className?: string }) {
  const data = useDemoData()
  if (!data) return null

  return (
    <div className={className} data-slot="v3-demo-cards">
      <p className="pb-3 text-[11px] leading-4 font-medium tracking-wide uppercase text-muted-foreground">
        Demo cards — dev only
      </p>
      <div className="flex flex-col gap-4">
        <ApprovalCard
          approval={data.approval}
          rows={[
            { label: 'To', value: 'sam@example.com' },
            { label: 'Subject', value: 'Q3 numbers, as promised' },
            { label: 'Attachment', value: 'q3-summary.pdf (84 KB)', mono: true },
          ]}
          // Inert demo handlers — nothing leaves the page.
          onApprove={() => {}}
          onDeny={() => {}}
        />
        {/* Visual demo only — the wired path is SecureInputFlow (secure-input-flow.tsx). */}
        <SecureInputCard
          request={data.secureInput}
          providerName="Demo Account Provider"
          origin="https://demo.2hands.dev"
          // Inert demo handler — values are discarded, never transmitted.
          onSubmitSecure={() => {}}
        />
      </div>
    </div>
  )
}
