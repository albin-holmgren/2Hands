import Animated, { 
  FadeIn, 
  FadeInDown, 
  useAnimatedStyle, 
  useSharedValue, 
  withRepeat,
  withSequence,
  withTiming,
  FadeInUp,
} from 'react-native-reanimated'
import React, { useEffect, forwardRef, useState } from 'react'
import { View, Text, TouchableOpacity, ViewProps, TextProps, Pressable, ActivityIndicator, TextInput, Modal as RNModal } from 'react-native'
import { cn } from '@/lib/utils'
import { useTheme } from '@/lib/theme-context'

export const FadeInView = ({ children, delay = 0, ...props }: ViewProps & { delay?: number }) => (
  <Animated.View 
    entering={FadeIn.delay(delay).duration(200)} 
    {...props}
  >
    {children}
  </Animated.View>
)

export const FadeInDownView = ({ children, delay = 0, ...props }: ViewProps & { delay?: number }) => (
  <Animated.View 
    entering={FadeInDown.delay(delay).duration(200)} 
    {...props}
  >
    {children}
  </Animated.View>
)

export const ScalePressable = forwardRef<View, any>(({ children, onPress, style, ...props }, ref) => {
  const scale = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  const handlePressIn = () => {
    scale.value = withTiming(0.97, { duration: 100 })
  }

  const handlePressOut = () => {
    scale.value = withTiming(1, { duration: 100 })
  }

  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      {...props}
    >
      <Animated.View style={[animatedStyle, style]}>
        {children}
      </Animated.View>
    </Pressable>
  )
})

export const PulseDot = ({ color = '#EF4444', size = 8, style }: { color?: string, size?: number, style?: any }) => {
  const opacity = useSharedValue(0.6)
  const scale = useSharedValue(1)

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1000 }),
        withTiming(0.6, { duration: 1000 })
      ),
      -1,
      true
    )
    scale.value = withRepeat(
      withSequence(
        withTiming(1.4, { duration: 1000 }),
        withTiming(1, { duration: 1000 })
      ),
      -1,
      true
    )
  }, [])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }))

  return (
    <View style={[{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }, style]}>
      <Animated.View 
        style={[
          { 
            position: 'absolute',
            width: size * 2, 
            height: size * 2, 
            borderRadius: size, 
            backgroundColor: color,
          }, 
          animatedStyle
        ]} 
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  )
}

export const NotificationBadge = ({ count = 0, style }: { count?: number, style?: any }) => {
  if (count <= 0) return null
  
  const displayCount = count > 99 ? '99+' : count.toString()
  const minWidth = count > 9 ? 18 : 16
  
  return (
    <View style={[{
      minWidth,
      height: 16,
      borderRadius: 8,
      backgroundColor: '#FBBF24',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    }, style]}>
      <Text style={{ 
        fontSize: 10, 
        fontWeight: '700', 
        color: '#000000',
        lineHeight: 12,
      }}>
        {displayCount}
      </Text>
    </View>
  )
}

export const TypingIndicator = ({ color = '#75736F', size = 6 }: { color?: string, size?: number }) => {
  const dotScale1 = useSharedValue(1)
  const dotOpacity1 = useSharedValue(0.4)
  const dotScale2 = useSharedValue(1)
  const dotOpacity2 = useSharedValue(0.4)
  const dotScale3 = useSharedValue(1)
  const dotOpacity3 = useSharedValue(0.4)

  const animateDot = (scale: any, opacity: any, delay: number) => {
    'worklet';
    scale.value = withRepeat(
      withSequence(
        withTiming(1.3, { duration: 400 }),
        withTiming(1, { duration: 400 })
      ),
      -1,
      true
    )
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0.4, { duration: 400 })
      ),
      -1,
      true
    )
  }

  useEffect(() => {
    const t1 = setTimeout(() => {
      dotScale1.value = withRepeat(withSequence(withTiming(1.3, { duration: 400 }), withTiming(1, { duration: 400 })), -1, true)
      dotOpacity1.value = withRepeat(withSequence(withTiming(1, { duration: 400 }), withTiming(0.4, { duration: 400 })), -1, true)
    }, 0)
    const t2 = setTimeout(() => {
      dotScale2.value = withRepeat(withSequence(withTiming(1.3, { duration: 400 }), withTiming(1, { duration: 400 })), -1, true)
      dotOpacity2.value = withRepeat(withSequence(withTiming(1, { duration: 400 }), withTiming(0.4, { duration: 400 })), -1, true)
    }, 200)
    const t3 = setTimeout(() => {
      dotScale3.value = withRepeat(withSequence(withTiming(1.3, { duration: 400 }), withTiming(1, { duration: 400 })), -1, true)
      dotOpacity3.value = withRepeat(withSequence(withTiming(1, { duration: 400 }), withTiming(0.4, { duration: 400 })), -1, true)
    }, 400)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [])

  const style1 = useAnimatedStyle(() => ({ transform: [{ scale: dotScale1.value }], opacity: dotOpacity1.value }))
  const style2 = useAnimatedStyle(() => ({ transform: [{ scale: dotScale2.value }], opacity: dotOpacity2.value }))
  const style3 = useAnimatedStyle(() => ({ transform: [{ scale: dotScale3.value }], opacity: dotOpacity3.value }))

  return (
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
      <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style1]} />
      <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style2]} />
      <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style3]} />
    </View>
  )
}

interface ButtonProps {
  onPress?: () => void
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  disabled?: boolean
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export const Button = ({
  onPress,
  children,
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  loading,
  leftIcon,
  rightIcon,
}: ButtonProps) => {
  const { colors } = useTheme()

  const getVariantStyle = () => {
    switch (variant) {
      case 'primary':
        return { backgroundColor: colors.primary }
      case 'secondary':
        return { backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border }
      case 'outline':
        return { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }
      case 'ghost':
        return { backgroundColor: 'transparent' }
      case 'destructive':
        return { backgroundColor: colors.destructive + '10', borderWidth: 1, borderColor: colors.destructive + '20' }
      default:
        return { backgroundColor: colors.primary }
    }
  }

  const getTextColor = () => {
    switch (variant) {
      case 'primary':
        return colors.primaryForeground
      case 'secondary':
        return colors.secondaryForeground
      case 'outline':
      case 'ghost':
        return colors.foreground
      case 'destructive':
        return colors.destructive
      default:
        return colors.primaryForeground
    }
  }

  const sizes = {
    sm: 'px-3 py-2 rounded-lg',
    md: 'px-4 py-3 rounded-xl',
    lg: 'px-6 py-4 rounded-2xl',
    xl: 'px-8 py-5 rounded-[24px]',
  }

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm font-semibold',
    lg: 'text-base font-semibold',
    xl: 'text-lg font-bold',
  }

  return (
    <ScalePressable
      onPress={onPress}
      disabled={disabled || loading}
      style={getVariantStyle()}
      className={cn(
        'flex-row items-center justify-center gap-2 overflow-hidden',
        sizes[size],
        (disabled || loading) && 'opacity-50',
        className
      )}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
      ) : (
        <>
          {leftIcon}
          <Text style={{ color: getTextColor() }} className={cn(textSizes[size])}>
            {children}
          </Text>
          {rightIcon}
        </>
      )}
    </ScalePressable>
  )
}

export const Card = ({ children, className, ...props }: ViewProps) => {
  const { colors } = useTheme()
  return (
    <View 
      className={cn('rounded-[32px] p-5 shadow-sm', className)}
      style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }}
      {...props}
    >
      {children}
    </View>
  )
}

export const Input = ({ 
  label, 
  error, 
  className,
  ...props 
}: any) => {
  const { colors } = useTheme()
  return (
    <View className="space-y-2">
      {label && (
        <Text style={{ color: colors.mutedForeground }} className="text-sm font-medium ml-1">
          {label}
        </Text>
      )}
      <TextInput
        placeholderTextColor={colors.mutedForeground}
        style={{ 
          backgroundColor: colors.card, 
          borderColor: error ? colors.destructive : colors.border,
          color: colors.foreground 
        }}
        className={cn(
          'border rounded-2xl px-4 py-4 text-base',
          className
        )}
        {...props}
      />
      {error && (
        <Text style={{ color: colors.destructive }} className="text-xs ml-1">{error}</Text>
      )}
    </View>
  )
}

interface ConfirmationModalProps {
  visible: boolean
  onClose: () => void
  title: string
  message: string
  icon?: React.ReactNode
  primaryAction?: {
    label: string
    onPress: () => void
    loading?: boolean
  }
  secondaryAction?: {
    label: string
    onPress: () => void
  }
}

export const ConfirmationModal = ({
  visible,
  onClose,
  title,
  message,
  icon,
  primaryAction,
  secondaryAction,
}: ConfirmationModalProps) => {
  const { colors } = useTheme()

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View 
        style={{ 
          flex: 1, 
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
      >
        <Animated.View
          entering={FadeInUp.duration(250)}
          style={{
            backgroundColor: colors.card,
            borderRadius: 24,
            padding: 24,
            width: '100%',
            maxWidth: 320,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 20,
            elevation: 10,
          }}
        >
          {/* Icon */}
          {icon && (
            <View style={{ marginBottom: 16 }}>
              {icon}
            </View>
          )}

          {/* Title */}
          <Text 
            style={{ 
              fontSize: 18, 
              fontWeight: '600', 
              color: colors.cardForeground,
              textAlign: 'center',
              marginBottom: 8,
            }}
          >
            {title}
          </Text>

          {/* Message */}
          <Text 
            style={{ 
              fontSize: 14, 
              fontWeight: '400', 
              color: colors.mutedForeground,
              textAlign: 'center',
              lineHeight: 20,
              marginBottom: 24,
            }}
          >
            {message}
          </Text>

          {/* Actions */}
          <View style={{ width: '100%', gap: 10 }}>
            {primaryAction && (
              <ScalePressable
                onPress={primaryAction.onPress}
                disabled={primaryAction.loading}
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 16,
                  height: 48,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: primaryAction.loading ? 0.7 : 1,
                }}
              >
                {primaryAction.loading ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <Text 
                    style={{ 
                      color: colors.primaryForeground, 
                      fontSize: 16, 
                      fontWeight: '600' 
                    }}
                  >
                    {primaryAction.label}
                  </Text>
                )}
              </ScalePressable>
            )}
            
            {secondaryAction && (
              <ScalePressable
                onPress={secondaryAction.onPress}
                style={{
                  backgroundColor: 'transparent',
                  borderRadius: 16,
                  height: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text 
                  style={{ 
                    color: colors.mutedForeground, 
                    fontSize: 15, 
                    fontWeight: '500' 
                  }}
                >
                  {secondaryAction.label}
                </Text>
              </ScalePressable>
            )}
          </View>
        </Animated.View>
      </View>
    </RNModal>
  )
}

export { Skeleton } from './ui/skeleton'
