import { useState, useEffect } from 'react'
import { View, Text, Share, ActivityIndicator, ScrollView, Image, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { ChevronLeft, Gift, Copy, Check, Zap, MessageCircle, Link as LinkIcon } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import * as Clipboard from 'expo-clipboard'
import { api } from '@/lib/api'
import { useTheme } from '@/lib/theme-context'
import type { ReferralInfo } from '@2hands/types'
import { FadeInDownView, ScalePressable } from '@/components/ui'

export default function ReferralScreen() {
  const { isDark, colors } = useTheme()
  const theme = {
    background: colors.background,
    card: colors.card,
    cardBorder: colors.border,
    text: colors.foreground,
    textSecondary: colors.textSecondary,
    textMuted: colors.mutedForeground,
    inputBg: colors.inputBg,
    buttonBg: colors.primary,
    buttonText: colors.primaryForeground,
    subtleBg: colors.surfaceHover,
  }

  const [referral, setReferral] = useState<ReferralInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchReferral()
  }, [])

  const fetchReferral = async () => {
    try {
      const response = await api.getReferralInfo()
      if (response.data) {
        setReferral(response.data)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = async () => {
    if (!referral?.referralUrl) return
    await Clipboard.setStringAsync(referral.referralUrl)
    setCopied(true)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareReferral = async () => {
    if (!referral?.referralUrl) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    await Share.share({
      message: `Join me on 2Hands - AI automation for everyone! Use my link to get 500 bonus credits: ${referral.referralUrl}`,
      url: referral.referralUrl,
    })
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' }}>
        <SafeAreaView>
          <ActivityIndicator size="large" color={theme.text} />
        </SafeAreaView>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' }}>
          <ScalePressable
            onPress={() => router.back()}
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronLeft size={24} color={theme.text} />
          </ScalePressable>
        </View>

        <ScrollView 
          style={{ flex: 1 }} 
          contentContainerStyle={{ paddingBottom: 40 }} 
          showsVerticalScrollIndicator={false}
        >
          <View style={{ paddingHorizontal: 24 }}>
            {/* Hero Section */}
            <FadeInDownView style={{ marginBottom: 32 }}>
              {/* Badge */}
              <View style={{ alignItems: 'flex-start', marginBottom: 16 }}>
                <View style={{ 
                  paddingHorizontal: 12, 
                  paddingVertical: 6, 
                  borderRadius: 20, 
                  backgroundColor: theme.subtleBg,
                  borderWidth: 1,
                  borderColor: theme.cardBorder,
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: theme.textSecondary, letterSpacing: 0.3 }}>
                    Earn 500+ credits
                  </Text>
                </View>
              </View>

              {/* Title + Logo Row */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, paddingRight: 16 }}>
                  <Text style={{ fontSize: 32, fontWeight: '700', color: theme.text, letterSpacing: -1, lineHeight: 38 }}>
                    Share the future
                  </Text>
                  <Text style={{ fontSize: 16, color: theme.textSecondary, marginTop: 4 }}>
                    and earn free credits
                  </Text>
                </View>
                <View style={{
                  width: 80,
                  height: 80,
                  borderRadius: 28,
                  backgroundColor: theme.card,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: theme.cardBorder,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.15,
                  shadowRadius: 24,
                  elevation: 8,
                }}>
                  <Image 
                    source={require('../../assets/icon.png')} 
                    style={{ width: 40, height: 40, opacity: isDark ? 0.9 : 1 }} 
                    resizeMode="contain"
                  />
                </View>
              </View>
            </FadeInDownView>

            {/* How it works */}
            <FadeInDownView delay={100} style={{ marginBottom: 32 }}>
              <Text style={{ 
                fontSize: 13, 
                fontWeight: '500', 
                color: theme.textMuted, 
                letterSpacing: 1, 
                textTransform: 'uppercase',
                marginBottom: 20 
              }}>
                How it works:
              </Text>

              <View style={{ gap: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  <View style={{ width: 20, alignItems: 'center' }}>
                    <Zap size={16} color={theme.textSecondary} />
                  </View>
                  <Text style={{ fontSize: 14, color: theme.textSecondary, fontWeight: '500' }}>
                    Share your invite link
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  <View style={{ width: 20, alignItems: 'center' }}>
                    <Gift size={16} color={theme.textSecondary} />
                  </View>
                  <Text style={{ fontSize: 14, color: theme.textSecondary }}>
                    They sign up and get <Text style={{ fontWeight: '600', color: theme.text }}>extra 500 credits</Text>
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  <View style={{ width: 20, alignItems: 'center' }}>
                    <MessageCircle size={16} color={theme.textSecondary} />
                  </View>
                  <Text style={{ fontSize: 14, color: theme.textSecondary }}>
                    You get <Text style={{ fontWeight: '600', color: theme.text }}>500 credits</Text> when they create their first agent
                  </Text>
                </View>
              </View>
            </FadeInDownView>

            {/* Stats & Link Section */}
            <FadeInDownView delay={200} style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: theme.textSecondary, marginBottom: 16 }}>
                Your invite link has been used by <Text style={{ fontWeight: '700', color: theme.text }}>{referral?.referralCount || 0}</Text> users
              </Text>

              {/* Link Display */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 14,
                paddingVertical: 14,
                backgroundColor: theme.inputBg,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.cardBorder,
                marginBottom: 12,
              }}>
                <LinkIcon size={14} color={theme.textMuted} />
                <Text 
                  style={{ fontSize: 13, color: theme.textSecondary, flex: 1 }} 
                  numberOfLines={1}
                >
                  {referral?.referralUrl || 'Loading...'}
                </Text>
              </View>

              {/* Copy Button */}
              <ScalePressable
                onPress={copyToClipboard}
                style={{
                  height: 48,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                  backgroundColor: copied 
                    ? (isDark ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)') 
                    : theme.buttonBg,
                  borderWidth: copied ? 1 : 0,
                  borderColor: copied ? 'rgba(34,197,94,0.3)' : 'transparent',
                }}
              >
                {copied ? (
                  <>
                    <Check size={16} color="#22C55E" />
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#22C55E' }}>
                      Copied to clipboard
                    </Text>
                  </>
                ) : (
                  <Text style={{ fontSize: 14, fontWeight: '600', color: theme.buttonText }}>
                    Copy link
                  </Text>
                )}
              </ScalePressable>
            </FadeInDownView>

            {/* Share Button */}
            <FadeInDownView delay={300}>
              <ScalePressable
                onPress={shareReferral}
                style={{
                  height: 52,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.subtleBg,
                  borderWidth: 1,
                  borderColor: theme.cardBorder,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>
                  Share with friends
                </Text>
              </ScalePressable>
            </FadeInDownView>

            {/* Terms */}
            <FadeInDownView delay={400} style={{ marginTop: 32, alignItems: 'center' }}>
              <ScalePressable
                onPress={() => {}} // Could open terms
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                }}
              >
                <Text style={{ fontSize: 11, color: theme.textMuted }}>
                  View Terms and Conditions
                </Text>
              </ScalePressable>
            </FadeInDownView>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

