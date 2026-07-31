import React, { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import {
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  Text,
  View,
  ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useTheme } from '@/lib/theme-context'
import { Glass } from '@/components/v3/glass'

/**
 * Bottom sheet primitive (UX.md §17, BRAND_GUIDELINES §8/§14).
 * 24px top radius, drag handle, dimmed backdrop, 200ms enter/exit
 * (ease-out in / ease-in out). Honors reduced motion. Content is
 * caller-provided; callers supply their own ScrollView when needed.
 */

/** Sheets sit above the composer, so they round harder. */
const SHEET_RADIUS = 32

const SCREEN_HEIGHT = Dimensions.get('window').height
const SHEET_DURATION_MS = 200
const DISMISS_DRAG_PX = 100
const DISMISS_VELOCITY = 0.5

export interface BottomSheetProps {
  visible: boolean
  /** Requests dismissal — parent flips `visible`; exit animates from there. */
  onClose: () => void
  children: ReactNode
  title?: string
  /** Fraction of the window the sheet may occupy. Default 0.88. */
  maxHeightRatio?: number
  contentStyle?: ViewStyle
  testID?: string
}

export function BottomSheet({
  visible,
  onClose,
  children,
  title,
  maxHeightRatio = 0.88,
  contentStyle,
  testID,
}: BottomSheetProps) {
  const { isDark, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const reduceMotion = useReducedMotion()

  // Keep the Modal mounted while the exit animation plays.
  const [mounted, setMounted] = useState(visible)
  const translateY = useSharedValue(SCREEN_HEIGHT)
  const backdrop = useSharedValue(0)

  const duration = reduceMotion ? 0 : SHEET_DURATION_MS

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const requestClose = useCallback(() => {
    onCloseRef.current()
  }, [])

  useEffect(() => {
    if (visible) {
      setMounted(true)
      backdrop.value = withTiming(1, { duration, easing: Easing.out(Easing.cubic) })
      translateY.value = withTiming(0, { duration, easing: Easing.out(Easing.cubic) })
    } else {
      backdrop.value = withTiming(0, { duration, easing: Easing.in(Easing.cubic) })
      translateY.value = withTiming(
        SCREEN_HEIGHT,
        { duration, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false)
        }
      )
    }
  }, [visible, duration, backdrop, translateY])

  // Drag-to-dismiss from the handle/header region.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_evt, gesture) => {
        translateY.value = Math.max(0, gesture.dy)
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dy > DISMISS_DRAG_PX || gesture.vy > DISMISS_VELOCITY) {
          onCloseRef.current()
        } else {
          translateY.value = withTiming(0, {
            duration: SHEET_DURATION_MS,
            easing: Easing.out(Easing.cubic),
          })
        }
      },
    })
  ).current

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }))
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }))

  if (!mounted) return null

  return (
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={requestClose}
      testID={testID}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* Backdrop */}
        <Animated.View
          style={[
            { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
            backdropStyle,
          ]}
        >
          <Pressable
            style={{ flex: 1 }}
            onPress={requestClose}
            accessibilityRole="button"
            accessibilityLabel="Close sheet"
          />
        </Animated.View>

        {/* Sheet — 24px top radius */}
        <Animated.View
          accessibilityViewIsModal
          style={[
            {
              maxHeight: SCREEN_HEIGHT * maxHeightRatio,
              // The sheet is glass, so it must not paint an opaque background
              // — the point is that the conversation stays visible behind it.
              // A larger radius than the composer reads as sitting closer to
              // the viewer, which is how the stack conveys depth.
              borderTopLeftRadius: SHEET_RADIUS,
              borderTopRightRadius: SHEET_RADIUS,
              paddingBottom: Math.max(insets.bottom, 16),
              overflow: 'hidden',
            },
            sheetStyle,
          ]}
        >
          <Glass elevation="sheet" radius={SHEET_RADIUS} style={{ flexShrink: 1 }}>
          {/* Drag handle + optional title (pan region) */}
          <View {...panResponder.panHandlers}>
            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: title ? 4 : 10 }}>
              <View
                accessibilityLabel="Drag down to close"
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 9999,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.25)' : colors.borderDefault,
                }}
              />
            </View>
            {title ? (
              <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
                <Text
                  accessibilityRole="header"
                  style={{ fontSize: 18, fontWeight: '600', color: colors.textPrimary }}
                >
                  {title}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={[{ flexShrink: 1 }, contentStyle]}>{children}</View>
          </Glass>
        </Animated.View>
      </View>
    </Modal>
  )
}
