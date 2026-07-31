import React, { useState } from 'react'
import { Platform, Pressable, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { ArrowUp, Mic } from 'lucide-react-native'
import type { OrbState } from '@2hands/types/v3'
import { colors as brand } from '@2hands/tailwind-config'
import { useTheme } from '@/lib/theme-context'
import { ScalePressable } from '@/components/ui'
import { Glass, concentricRadius } from '@/components/v3/glass'

/**
 * Bottom voice/text composer (UX.md §2, BRAND_GUIDELINES §13).
 * Glass shell on iOS via expo-blur; opaque warm surface on Android where
 * blur is expensive. Mic is the strongest control (44pt, terracotta);
 * send appears only when text is present. Mobile input text >= 16.
 */

/** Outer radius of the composer shell; inner controls stay concentric with it. */
const SHELL_RADIUS = 26

interface ComposerProps {
  onSend: (text: string) => void
  onMicPress: () => void
  orbState: OrbState
  disabled?: boolean
  placeholder?: string
}

export function Composer({
  onSend,
  onMicPress,
  orbState,
  disabled = false,
  placeholder = 'Assign a task or ask anything',
}: ComposerProps) {
  const { isDark, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const [text, setText] = useState('')

  const hasText = text.trim().length > 0
  const isListening = orbState === 'listening'

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onSend(trimmed)
    setText('')
  }

  const handleMicPress = () => {
    if (disabled) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onMicPress()
  }


  const inner = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 8,
        minHeight: 48,
        paddingVertical: 6,
        paddingLeft: 16,
        paddingRight: 6,
        // Transparent: Glass owns the tint. A second wash here would double up
        // and turn the blur into flat colour.
        backgroundColor: 'transparent',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={colors.textPlaceholder}
        selectionColor={colors.textSecondary}
        cursorColor={colors.textSecondary}
        multiline
        maxLength={4000}
        editable={!disabled}
        accessibilityLabel="Message 2Hands"
        style={{
          flex: 1,
          color: colors.textPrimary,
          fontSize: 16,
          lineHeight: 22,
          minHeight: 32,
          maxHeight: 120,
          paddingVertical: 5,
          backgroundColor: 'transparent',
          borderWidth: 0,
        }}
      />

      {/* Send — only with input */}
      {hasText && (
        <ScalePressable
          onPress={handleSend}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Send"
          style={{
            width: 44,
            height: 44,
            borderRadius: concentricRadius(SHELL_RADIUS, 6),
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: brand.brand.terracotta,
          }}
        >
          <ArrowUp size={20} color={brand.brand.white} strokeWidth={2.5} />
        </ScalePressable>
      )}

      {/* Mic — the strongest control, 44pt */}
      <ScalePressable
        onPress={handleMicPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={isListening ? 'Stop listening' : 'Speak'}
        style={{
          width: 44,
          height: 44,
          borderRadius: concentricRadius(SHELL_RADIUS, 6),
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: hasText
            ? isDark
              ? 'rgba(255,255,255,0.08)'
              : 'rgba(52,50,45,0.06)'
            : isListening
              ? brand.brand['terracotta-dark']
              : brand.brand.terracotta,
        }}
      >
        <Mic
          size={20}
          color={hasText ? colors.textSecondary : brand.brand.white}
          strokeWidth={2}
        />
      </ScalePressable>
    </View>
  )

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 16),
      }}
    >
      <Glass elevation="bar" radius={SHELL_RADIUS}>
        {inner}
      </Glass>
    </View>
  )
}
