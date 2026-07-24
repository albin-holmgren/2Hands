import React, { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Check, ShieldAlert, X } from 'lucide-react-native'
import type { Approval, ApprovalCategory, RiskClass } from '@2hands/types/v3'
import { colors as brand } from '@2hands/tailwind-config'
import { useTheme } from '@/lib/theme-context'

/**
 * Approval card (UX.md §13, BRAND_GUIDELINES §13). Matches the web
 * approval-card contract: 16px radius, opaque surface, 1px border,
 * exact action + affected resource + reversibility/cost metadata.
 * Approve is the warm-black primary; Deny is a ghost button — the two
 * differ by text, icon AND position, never color alone. Buttons >= 44pt.
 * Haptic feedback fires on respond.
 */

export type ApprovalDecision = 'approve' | 'deny'

const CATEGORY_LABELS: Record<ApprovalCategory, string> = {
  external_communication: 'External communication',
  publication: 'Publication',
  financial: 'Financial',
  account_security: 'Account security',
  destructive: 'Destructive',
  legal: 'Legal',
}

const RISK_LABELS: Record<RiskClass, string> = {
  r0_read: 'Read-only',
  r1_reversible: 'Reversible internal change',
  r2_external_write: 'External change',
  r3_high_impact: 'High impact',
  r4_blocked: 'Blocked',
}

const REVERSIBILITY_LABELS: Record<Approval['reversibility'], string> = {
  reversible: 'Reversible',
  partially_reversible: 'Partially reversible',
  irreversible: 'Not reversible',
}

const RESOLVED_LABELS: Record<Exclude<Approval['status'], 'pending'>, string> = {
  approved: 'Approved',
  denied: 'Denied',
  expired: 'Expired',
  cancelled: 'Cancelled',
  consumed: 'Approved · used',
}

export interface ApprovalCardProps {
  approval: Approval
  /**
   * Responds to the approval. The server requires challenge + canonical
   * action hash + idempotency key; callers wire this to the approvals
   * respond endpoint — never to a model/conversation path.
   */
  onRespond: (decision: ApprovalDecision) => void | Promise<void>
  disabled?: boolean
}

function MetaRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme()
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ fontSize: 13, color: colors.textSecondary }}>{label}</Text>
      <Text
        numberOfLines={1}
        style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary, flexShrink: 1 }}
      >
        {value}
      </Text>
    </View>
  )
}

export function ApprovalCard({ approval, onRespond, disabled = false }: ApprovalCardProps) {
  const { isDark, colors } = useTheme()
  const [responding, setResponding] = useState<ApprovalDecision | null>(null)

  const pending = approval.status === 'pending'
  const busy = responding !== null
  const highImpact = approval.riskClass === 'r3_high_impact'
  const [armed, setArmed] = useState(false)

  const respond = async (decision: ApprovalDecision) => {
    if (disabled || busy || !pending) return
    // High-impact approval requires a second deliberate confirmation.
    if (decision === 'approve' && highImpact && !armed) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      setArmed(true)
      return
    }
    if (decision === 'approve') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    }
    setResponding(decision)
    try {
      await onRespond(decision)
    } finally {
      setResponding(null)
      setArmed(false)
    }
  }

  // Warm black carries approval authority in light mode; invert in dark.
  const approveBg = isDark ? brand.brand.beige : brand.brand.black
  const approveFg = isDark ? brand.brand.black : brand.brand.white

  return (
    <View
      accessibilityLabel={`Needs your approval: ${approval.title}`}
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.borderDefault,
        backgroundColor: colors.card,
        padding: 16,
        gap: 12,
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ShieldAlert size={16} color={brand.brand.terracotta} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>
          Needs your approval
        </Text>
        {approval.category ? (
          <View
            style={{
              borderRadius: 9999,
              paddingHorizontal: 8,
              paddingVertical: 2,
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.bgSecondary,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '500', color: colors.textSecondary }}>
              {CATEGORY_LABELS[approval.category]}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Exact action */}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textPrimary }}>
          {approval.title}
        </Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: colors.textSecondary }}>
          {approval.summary}
        </Text>
      </View>

      {/* Metadata: reversibility, cost, risk */}
      <View
        style={{
          gap: 6,
          borderRadius: 12,
          padding: 12,
          backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.bgSecondary,
        }}
      >
        <MetaRow label="Risk" value={RISK_LABELS[approval.riskClass]} />
        <MetaRow label="Reversibility" value={REVERSIBILITY_LABELS[approval.reversibility]} />
        {typeof approval.estimatedMaxCostCredits === 'number' ? (
          <MetaRow label="Max cost" value={`${approval.estimatedMaxCostCredits} work credits`} />
        ) : null}
      </View>

      {approval.status === 'pending' ? (
        <>
          {/* Deny ghost (left) / Approve primary (right) — text + icon + position differ */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => respond('deny')}
              disabled={disabled || busy}
              accessibilityRole="button"
              accessibilityLabel={`Deny: ${approval.title}`}
              accessibilityState={{ disabled: disabled || busy }}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 44,
                borderRadius: 8,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                borderWidth: 1,
                borderColor: colors.borderDefault,
                backgroundColor: pressed ? colors.surfaceHover : 'transparent',
                opacity: disabled || busy ? 0.5 : 1,
              })}
            >
              <X size={16} color={colors.textSecondary} />
              <Text style={{ fontSize: 15, fontWeight: '500', color: colors.textSecondary }}>
                {responding === 'deny' ? 'Denying…' : 'Deny'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => respond('approve')}
              disabled={disabled || busy}
              accessibilityRole="button"
              accessibilityLabel={`Approve: ${approval.title}`}
              accessibilityState={{ disabled: disabled || busy }}
              style={({ pressed }) => ({
                flex: 1.4,
                minHeight: 44,
                borderRadius: 8,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                backgroundColor: armed ? brand.brand.terracotta : approveBg,
                opacity: disabled || busy ? 0.5 : pressed ? 0.85 : 1,
              })}
            >
              <Check size={16} color={armed ? brand.brand.white : approveFg} />
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '600',
                  color: armed ? brand.brand.white : approveFg,
                }}
              >
                {responding === 'approve'
                  ? 'Approving…'
                  : armed
                    ? 'Confirm approval'
                    : 'Approve'}
              </Text>
            </Pressable>
          </View>
          {armed ? (
            <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center' }}>
              High-impact action — tap again to confirm.
            </Text>
          ) : null}
        </>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {approval.status === 'approved' || approval.status === 'consumed' ? (
            <Check size={14} color={brand.functional.success} />
          ) : (
            <X size={14} color={colors.textSecondary} />
          )}
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>
            {RESOLVED_LABELS[approval.status]}
          </Text>
        </View>
      )}
    </View>
  )
}
