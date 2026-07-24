import React, { useState } from 'react'
import { KeyboardTypeOptions, Pressable, Text, TextInput, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Check, Lock, ShieldCheck } from 'lucide-react-native'
import type { SecureInputRequest } from '@2hands/types/v3'
import { colors as brand } from '@2hands/tailwind-config'
import { useTheme } from '@/lib/theme-context'

/**
 * Trusted credential input card (UX.md §6 protected input,
 * BRAND_GUIDELINES §13 protected authentication card). This is a
 * compiled, trusted component — NEVER model-generated markup. Visually
 * distinct from ordinary chat cards: double border, lock mark,
 * "Protected by 2Hands" chrome, provider + exact origin displayed.
 *
 * Values live ONLY in this card's local React state — no SecureStore,
 * no AsyncStorage, no store, no logging — and are cleared on submit.
 */

type SecureFieldKind = SecureInputRequest['fields'][number]['kind']

export interface SecureInputValue {
  fieldId: string
  value: string
  retain: boolean
}

export interface SecureInputCardProps {
  request: SecureInputRequest
  /** Display name for the provider; falls back to request.providerId. */
  providerName?: string
  /** Exact origin the credentials are for, e.g. "https://claude.ai". */
  origin: string
  /**
   * Submits the supplied values. Callers MUST post these ONLY to the
   * isolated secure-input endpoint (`/api/secure-input/*`) which has no
   * body logging, no analytics, and no model calls. NEVER send these
   * values to a conversation/chat/model endpoint, event stream, or
   * transcript — the conversation only ever sees the submission receipt.
   */
  onSubmitSecure: (values: SecureInputValue[]) => void | Promise<void>
  onCancel: () => void
}

const FIELD_INPUT_PROPS: Record<
  SecureFieldKind,
  {
    secureTextEntry: boolean
    textContentType: 'username' | 'emailAddress' | 'password' | 'oneTimeCode' | 'none'
    autoComplete: 'username' | 'email' | 'current-password' | 'one-time-code' | 'off'
    keyboardType: KeyboardTypeOptions
  }
> = {
  username: {
    secureTextEntry: false,
    textContentType: 'username',
    autoComplete: 'username',
    keyboardType: 'default',
  },
  email: {
    secureTextEntry: false,
    textContentType: 'emailAddress',
    autoComplete: 'email',
    keyboardType: 'email-address',
  },
  password: {
    secureTextEntry: true,
    textContentType: 'password',
    autoComplete: 'current-password',
    keyboardType: 'default',
  },
  otp: {
    secureTextEntry: false,
    textContentType: 'oneTimeCode',
    autoComplete: 'one-time-code',
    keyboardType: 'number-pad',
  },
  api_key: {
    secureTextEntry: true,
    textContentType: 'none',
    autoComplete: 'off',
    keyboardType: 'default',
  },
}

export function SecureInputCard({
  request,
  providerName,
  origin,
  onSubmitSecure,
  onCancel,
}: SecureInputCardProps) {
  const { isDark, colors } = useTheme()

  // Secret values held ONLY in local state; cleared after submit.
  const [values, setValues] = useState<Record<string, string>>({})
  const [retain, setRetain] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [supplied, setSupplied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const expired = Date.parse(request.expiresAt) <= Date.now()
  const displayName = providerName ?? request.providerId
  const canSubmit =
    !expired &&
    !submitting &&
    request.fields.every((field) => (values[field.id] ?? '').trim().length > 0)

  const clearValues = () => {
    setValues({})
    setRetain({})
  }

  const handleSubmit = async () => {
    if (!canSubmit) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setSubmitting(true)
    setError(null)
    const payload: SecureInputValue[] = request.fields.map((field) => ({
      fieldId: field.id,
      value: (values[field.id] ?? '').trim(),
      retain: field.retainOption ? (retain[field.id] ?? false) : false,
    }))
    try {
      await onSubmitSecure(payload)
      setSupplied(true)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch {
      setError('Something went wrong. Enter the values again.')
    } finally {
      // Cleared no matter the outcome — secrets never linger in state.
      clearValues()
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    clearValues()
    onCancel()
  }

  const outerBorder = brand.brand.terracotta + (isDark ? '66' : '55')

  return (
    <View
      accessibilityLabel={`Protected sign-in for ${displayName}`}
      style={{
        borderRadius: 24,
        borderWidth: 1.5,
        borderColor: outerBorder,
        padding: 3,
        backgroundColor: isDark ? 'rgba(217,119,87,0.06)' : 'rgba(217,119,87,0.04)',
      }}
    >
      <View
        style={{
          borderRadius: 20,
          borderWidth: 1,
          borderColor: colors.borderDefault,
          // Opaque secret-field surface — never glass.
          backgroundColor: colors.bgPrimary,
          padding: 16,
          gap: 14,
        }}
      >
        {/* Trusted chrome */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 9999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: brand.brand.terracotta + '1F',
            }}
          >
            <Lock size={14} color={brand.brand.terracotta} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.4, color: brand.brand.terracotta }}>
              PROTECTED BY 2HANDS
            </Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>
              {displayName}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 13, color: colors.textSecondary }}>
              {origin}
            </Text>
          </View>
        </View>

        {supplied ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
            <Check size={16} color={brand.functional.success} />
            <Text style={{ fontSize: 14, fontWeight: '500', color: colors.textPrimary }}>
              Supplied securely
            </Text>
          </View>
        ) : expired ? (
          <Text style={{ fontSize: 14, color: colors.textSecondary, paddingVertical: 8 }}>
            This request expired. Ask 2Hands to try again.
          </Text>
        ) : (
          <>
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>
                {request.title}
              </Text>
              {request.description ? (
                <Text style={{ fontSize: 13, lineHeight: 18, color: colors.textSecondary }}>
                  {request.description}
                </Text>
              ) : null}
            </View>

            {/* Fields */}
            {request.fields.map((field) => {
              const inputProps = FIELD_INPUT_PROPS[field.kind]
              return (
                <View key={field.id} style={{ gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary }}>
                    {field.label}
                  </Text>
                  <TextInput
                    value={values[field.id] ?? ''}
                    onChangeText={(text) =>
                      setValues((prev) => ({ ...prev, [field.id]: text }))
                    }
                    secureTextEntry={inputProps.secureTextEntry}
                    textContentType={inputProps.textContentType}
                    autoComplete={inputProps.autoComplete}
                    keyboardType={inputProps.keyboardType}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                    editable={!submitting}
                    accessibilityLabel={field.label}
                    placeholderTextColor={colors.placeholder}
                    style={{
                      minHeight: 48,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.borderDefault,
                      backgroundColor: colors.inputBg,
                      paddingHorizontal: 14,
                      fontSize: 16, // mobile input text >= 16
                      color: colors.textPrimary,
                    }}
                  />
                  {field.retainOption ? (
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                        setRetain((prev) => ({ ...prev, [field.id]: !prev[field.id] }))
                      }}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: retain[field.id] ?? false }}
                      accessibilityLabel={`Remember ${field.label.toLowerCase()} for next time`}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        minHeight: 44,
                      }}
                    >
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 4,
                          borderWidth: 1.5,
                          borderColor: (retain[field.id] ?? false)
                            ? brand.brand.terracotta
                            : colors.borderDefault,
                          backgroundColor: (retain[field.id] ?? false)
                            ? brand.brand.terracotta
                            : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {(retain[field.id] ?? false) ? (
                          <Check size={13} color={brand.brand.white} />
                        ) : null}
                      </View>
                      <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                        Remember for next time
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              )
            })}

            {error ? (
              <Text style={{ fontSize: 13, color: brand.functional.error }}>{error}</Text>
            ) : null}

            {/* Actions — >= 44pt */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={handleCancel}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                accessibilityState={{ disabled: submitting }}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: colors.borderDefault,
                  backgroundColor: pressed ? colors.surfaceHover : 'transparent',
                  opacity: submitting ? 0.5 : 1,
                })}
              >
                <Text style={{ fontSize: 15, fontWeight: '500', color: colors.textSecondary }}>
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={handleSubmit}
                disabled={!canSubmit}
                accessibilityRole="button"
                accessibilityLabel="Continue"
                accessibilityState={{ disabled: !canSubmit }}
                style={({ pressed }) => ({
                  flex: 1.4,
                  minHeight: 44,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isDark ? brand.brand.beige : brand.brand.black,
                  opacity: !canSubmit ? 0.5 : pressed ? 0.85 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: '600',
                    color: isDark ? brand.brand.black : brand.brand.white,
                  }}
                >
                  {submitting ? 'Supplying…' : 'Continue'}
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {/* Persistent trust note */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ShieldCheck size={13} color={colors.textSecondary} />
          <Text style={{ fontSize: 12, color: colors.textSecondary, flexShrink: 1 }}>
            The AI cannot read these values. They go only to {displayName}.
          </Text>
        </View>
      </View>
    </View>
  )
}
