import React, { useEffect, useRef } from 'react'
import { View, Animated, StyleSheet, DimensionValue } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

interface SkeletonProps {
  width?: DimensionValue
  height?: number
  borderRadius?: number
  variant?: 'text' | 'avatar' | 'card' | 'button' | 'image' | 'custom'
  animated?: boolean
  style?: any
}

export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = 8,
  variant = 'custom',
  animated = true,
  style,
}: SkeletonProps) {
  const shimmerAnim = useRef(new Animated.Value(-1)).current

  useEffect(() => {
    if (!animated) return

    const animation = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      })
    )
    animation.start()

    return () => animation.stop()
  }, [animated])

  const getVariantStyles = () => {
    switch (variant) {
      case 'text':
        return { height: 16, borderRadius: 4 }
      case 'avatar':
        return { width: 40, height: 40, borderRadius: 20 }
      case 'card':
        return { height: 120, borderRadius: 16 }
      case 'button':
        return { height: 48, borderRadius: 12 }
      case 'image':
        return { height: 200, borderRadius: 12 }
      default:
        return { height, borderRadius }
    }
  }

  const variantStyles = getVariantStyles()

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: [-200, 200],
  })

  return (
    <View
      style={[
        styles.container,
        {
          width: variantStyles.width || width,
          height: variantStyles.height,
          borderRadius: variantStyles.borderRadius,
        },
        style,
      ]}
    >
      <View style={styles.base} />
      {animated && (
        <Animated.View
          style={[
            styles.shimmer,
            { transform: [{ translateX: shimmerTranslate }] },
          ]}
        >
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.15)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: 'rgba(120, 120, 120, 0.12)',
  },
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(120, 120, 120, 0.08)',
  },
  shimmer: {
    ...StyleSheet.absoluteFillObject,
    width: 100,
  },
})
