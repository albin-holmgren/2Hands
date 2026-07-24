import React from 'react'
import { Platform, Pressable, Text, View, ViewStyle } from 'react-native'
import type { OrbState } from '@2hands/types/v3'
import { useTheme } from '@/lib/theme-context'
import { Orb } from '@/components/v3/orb'

/**
 * Empty conversation state (UX.md §3): hero orb slightly above the vertical
 * midpoint with the Newsreader prompt "What should we get done?" and at most
 * three quiet examples.
 *
 * Newsreader is not loaded on mobile (app/_layout.tsx loads no custom fonts),
 * so this uses the platform serif (Georgia on iOS, serif on Android) until
 * the font ships with the app.
 */

const DISPLAY_SERIF = Platform.select({ ios: 'Georgia', default: 'serif' })

interface EmptyStateProps {
  orbState?: OrbState
  onOrbPress?: () => void
  /** At most three quiet examples; extras are ignored. */
  examples?: string[]
  onExamplePress?: (example: string) => void
  style?: ViewStyle
}

export function EmptyState({
  orbState = 'idle',
  onOrbPress,
  examples = [],
  onExamplePress,
  style,
}: EmptyStateProps) {
  const { colors } = useTheme()
  const visibleExamples = examples.slice(0, 3)

  return (
    <View
      style={[
        {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 32,
          // Orb sits slightly above the vertical midpoint.
          paddingBottom: 64,
        },
        style,
      ]}
    >
      <Orb state={orbState} size="hero" onPress={onOrbPress} />

      <Text
        style={{
          marginTop: 32,
          fontFamily: DISPLAY_SERIF,
          fontSize: 32,
          lineHeight: 40,
          color: colors.textPrimary,
          textAlign: 'center',
        }}
        accessibilityRole="header"
      >
        What should we get done?
      </Text>

      {visibleExamples.length > 0 && (
        <View style={{ marginTop: 24, alignItems: 'center', gap: 4 }}>
          {visibleExamples.map((example) => (
            <Pressable
              key={example}
              onPress={onExamplePress ? () => onExamplePress(example) : undefined}
              accessibilityRole="button"
              style={{
                minHeight: 44,
                justifyContent: 'center',
                paddingHorizontal: 16,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  lineHeight: 20,
                  color: colors.textSecondary,
                  textAlign: 'center',
                }}
              >
                {example}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}
