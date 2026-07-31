import { useState, useRef, useEffect } from 'react'
import { 
  View, 
  Text, 
  ScrollView,
  Alert,
  Animated,
  Image,
  ActivityIndicator,
  Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { X, Sparkles, Bot, Zap, Clock, Users, ShieldCheck } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { FadeInDownView, ScalePressable } from '@/components/ui'
import { useTheme } from '@/lib/theme-context'
import { supabase } from '@/lib/supabase'
import { useChatStore } from '@/store/chat-store'
import * as WebBrowser from 'expo-web-browser'

const features = [
  { icon: Sparkles, text: '50,000 credits per month' },
  { icon: Bot, text: 'Up to 15 AI agents' },
  { icon: Zap, text: 'Priority AI responses' },
  { icon: Clock, text: 'Higher concurrency' },
  { icon: Users, text: 'Advanced scheduling' },
  { icon: ShieldCheck, text: 'Priority support' },
]

const creditPacks = [
  { id: 'small', name: 'Small', credits: '2,500', price: '$10' },
  { id: 'medium', name: 'Medium', credits: '7,500', price: '$25', bestValue: true },
  { id: 'large', name: 'Large', credits: '20,000', price: '$60' },
  { id: 'xlarge', name: 'XL', credits: '45,000', price: '$120' },
]

export default function UpgradeScreen() {
  const { isDark, colors: theme } = useTheme()
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annually'>('monthly')
  const [activeTab, setActiveTab] = useState<'subscribe' | 'credits'>('subscribe')
  const [buyingPack, setBuyingPack] = useState<string | null>(null)
  const setCredits = useChatStore(s => s.setCredits)
  
  const contentOpacity = useRef(new Animated.Value(0)).current
  const contentScale = useRef(new Animated.Value(0.96)).current
  const radioScaleMonthly = useRef(new Animated.Value(selectedPlan === 'monthly' ? 1 : 0)).current
  const radioScaleAnnually = useRef(new Animated.Value(selectedPlan === 'annually' ? 1 : 0)).current
  const tabIndicatorPosition = useRef(new Animated.Value(0)).current
  
  useEffect(() => {
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(contentScale, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start()
  }, [])

  useEffect(() => {
    Animated.parallel([
      Animated.timing(radioScaleMonthly, {
        toValue: selectedPlan === 'monthly' ? 1 : 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(radioScaleAnnually, {
        toValue: selectedPlan === 'annually' ? 1 : 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start()
  }, [selectedPlan])

  useEffect(() => {
    Animated.timing(tabIndicatorPosition, {
      toValue: activeTab === 'subscribe' ? 0 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start()
  }, [activeTab])

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(contentScale, {
        toValue: 0.97,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      router.back()
    })
  }

  const refreshCreditsFromServer = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.id) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', user.id)
        .single()
      if (profile?.credits !== undefined) {
        setCredits(profile.credits)
      }
    } catch (e) {
      console.error('Failed to refresh credits:', e)
    }
  }

  const handleStartTrial = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        Alert.alert('Not signed in', 'Please sign in again to continue.')
        return
      }

      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://2hands.ai'
      const interval = selectedPlan === 'annually' ? 'yearly' : 'monthly'

      const res = await fetch(`${API_URL}/api/stripe/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          priceType: 'subscription',
          plan: 'pro',
          interval,
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.url) {
        const message = data?.error || 'Failed to start checkout'
        Alert.alert('Checkout error', message)
        return
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      await WebBrowser.openBrowserAsync(data.url)
      // Refresh credits after returning from checkout
      await refreshCreditsFromServer()
    } catch (e) {
      console.error('Checkout error:', e)
      Alert.alert('Checkout error', 'Something went wrong. Please try again.')
    }
  }

  const handleBuyCredits = async (packId: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      setBuyingPack(packId)

      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        Alert.alert('Not signed in', 'Please sign in again to continue.')
        return
      }

      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://2hands.ai'

      const res = await fetch(`${API_URL}/api/stripe/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          priceType: 'credits',
          packType: packId,
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.url) {
        const message = data?.error || 'Failed to start checkout'
        Alert.alert('Checkout error', message)
        return
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      await WebBrowser.openBrowserAsync(data.url)
      // Refresh credits after returning from checkout
      await refreshCreditsFromServer()
    } catch (e) {
      console.error('Checkout error:', e)
      Alert.alert('Checkout error', 'Something went wrong. Please try again.')
    } finally {
      setBuyingPack(null)
    }
  }

  const monthlyPrice = '$49'
  const annualPrice = '$490' // ~$40.83/month, save ~17%

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Animated.View style={{ 
        flex: 1,
        opacity: contentOpacity,
        transform: [{ scale: contentScale }],
      }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          {/* Close Button */}
          <View style={{ paddingHorizontal: 20, paddingVertical: 12, alignItems: 'flex-end' }}>
            <ScalePressable 
              onPress={handleClose}
              style={{
                width: 40,
                height: 40,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={24} color={theme.mutedForeground} strokeWidth={2} />
            </ScalePressable>
          </View>

          <ScrollView 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 }}
          >
            {/* Header */}
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <FadeInDownView delay={100}>
                <Image
                  source={require('../../assets/logo-terracotta.png')}
                  style={{ width: 72, height: 72, marginBottom: 16 }}
                  resizeMode="contain"
                />
              </FadeInDownView>
              
              <FadeInDownView delay={150}>
                <Text style={{ 
                  fontSize: 28, 
                  fontWeight: '600', 
                  color: theme.foreground, 
                  textAlign: 'center',
                  letterSpacing: -0.5,
                }}>
                  {activeTab === 'subscribe' ? 'Upgrade to Pro' : 'Buy Credits'}
                </Text>
              </FadeInDownView>
            </View>

            {/* Tab Switcher */}
            <FadeInDownView delay={200}>
              <View style={{ 
                flexDirection: 'row',
                alignSelf: 'center',
                backgroundColor: isDark ? '#1A1918' : '#F0EDE6',
                borderRadius: 24, 
                padding: 3, 
                marginBottom: 24,
                width: 260,
                position: 'relative',
              }}>
                {/* Animated background pill */}
                <Animated.View
                  style={{
                    position: 'absolute',
                    top: 3,
                    bottom: 3,
                    left: 3,
                    width: 125,
                    backgroundColor: isDark ? '#2C2B27' : '#FFFFFF',
                    borderRadius: 21,
                    borderWidth: 1,
                    borderColor: isDark ? '#4A4843' : '#D9D4CD',
                    transform: [{
                      translateX: tabIndicatorPosition.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 126]
                      })
                    }],
                  }}
                />
                
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    setActiveTab('subscribe')
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1,
                  }}
                >
                  <Text style={{ 
                    fontSize: 14, 
                    fontWeight: activeTab === 'subscribe' ? '600' : '500',
                    color: activeTab === 'subscribe' ? theme.foreground : theme.mutedForeground,
                  }}>
                    Subscribe
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    setActiveTab('credits')
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1,
                  }}
                >
                  <Text style={{ 
                    fontSize: 14, 
                    fontWeight: activeTab === 'credits' ? '600' : '500',
                    color: activeTab === 'credits' ? theme.foreground : theme.mutedForeground,
                  }}>
                    Buy Credits
                  </Text>
                </Pressable>
              </View>
            </FadeInDownView>

            {activeTab === 'subscribe' ? (
              <>
                {/* Features Card */}
                <FadeInDownView delay={250}>
                  <View style={{ 
                    backgroundColor: isDark ? '#2C2B27' : '#F5F3F0',
                    borderRadius: 16, 
                    padding: 16,
                    borderWidth: 1,
                    borderColor: theme.border,
                    marginBottom: 24,
                  }}>
                    {features.map((feature, index) => {
                      const FeatureIcon = feature.icon
                      return (
                        <View 
                          key={index} 
                          style={{ 
                            flexDirection: 'row', 
                            alignItems: 'center', 
                            gap: 14,
                            paddingVertical: 12,
                          }}
                        >
                          <FeatureIcon size={20} color={theme.foreground} strokeWidth={1.5} />
                          <Text style={{ 
                            color: theme.foreground, 
                            fontSize: 15, 
                            flex: 1,
                            fontWeight: '500',
                          }}>
                            {feature.text.includes('50,000') ? (
                              <>
                                <Text style={{ fontWeight: '600' }}>50,000</Text>
                                {' credits per month'}
                              </>
                            ) : feature.text}
                          </Text>
                        </View>
                      )
                    })}
                  </View>
                </FadeInDownView>

                {/* Plan Selection */}
                <View style={{ gap: 12, marginBottom: 24 }}>
                  {/* Monthly Option */}
                  <FadeInDownView delay={300}>
                    <ScalePressable 
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                        setSelectedPlan('monthly')
                      }}
                      style={{ 
                        flexDirection: 'row', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        backgroundColor: isDark ? '#2C2B27' : '#F5F3F0',
                        borderRadius: 16,
                        padding: 16,
                        borderWidth: 1,
                        borderColor: selectedPlan === 'monthly' ? theme.foreground : theme.border,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                        <View style={{ 
                          width: 22, 
                          height: 22, 
                          borderRadius: 11, 
                          borderWidth: 2, 
                          borderColor: selectedPlan === 'monthly' ? theme.foreground : theme.mutedForeground,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <Animated.View style={{ 
                            width: 10, 
                            height: 10, 
                            borderRadius: 5, 
                            backgroundColor: theme.foreground,
                            transform: [{ scale: radioScaleMonthly }]
                          }} />
                        </View>
                        <View>
                          <Text style={{ color: theme.foreground, fontSize: 16, fontWeight: '600' }}>Monthly</Text>
                          {selectedPlan === 'monthly' && (
                            <View style={{ 
                              backgroundColor: theme.foreground, 
                              paddingHorizontal: 8, 
                              paddingVertical: 2, 
                              borderRadius: 4,
                              marginTop: 4,
                              alignSelf: 'flex-start',
                            }}>
                              <Text style={{ 
                                color: isDark ? '#1A1918' : '#FFFFFF', 
                                fontSize: 10, 
                                fontWeight: '700', 
                                letterSpacing: 0.5 
                              }}>
                                7-DAY TRIAL
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <Text style={{ color: theme.foreground, fontSize: 17, fontWeight: '600' }}>
                        {monthlyPrice}
                      </Text>
                    </ScalePressable>
                  </FadeInDownView>

                  {/* Annual Option */}
                  <FadeInDownView delay={350}>
                    <ScalePressable 
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                        setSelectedPlan('annually')
                      }}
                      style={{ 
                        flexDirection: 'row', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        backgroundColor: isDark ? '#2C2B27' : '#F5F3F0',
                        borderRadius: 16,
                        padding: 16,
                        borderWidth: 1,
                        borderColor: selectedPlan === 'annually' ? theme.foreground : theme.border,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                        <View style={{ 
                          width: 22, 
                          height: 22, 
                          borderRadius: 11, 
                          borderWidth: 2, 
                          borderColor: selectedPlan === 'annually' ? theme.foreground : theme.mutedForeground,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <Animated.View style={{ 
                            width: 10, 
                            height: 10, 
                            borderRadius: 5, 
                            backgroundColor: theme.foreground,
                            transform: [{ scale: radioScaleAnnually }]
                          }} />
                        </View>
                        <View>
                          <Text style={{ color: theme.foreground, fontSize: 16, fontWeight: '600' }}>Annually</Text>
                          <Text style={{ color: theme.mutedForeground, fontSize: 13, marginTop: 2 }}>Save ~17% vs monthly</Text>
                        </View>
                      </View>
                      <Text style={{ color: theme.foreground, fontSize: 17, fontWeight: '600' }}>
                        {annualPrice}
                      </Text>
                    </ScalePressable>
                  </FadeInDownView>
                </View>

                {/* Pricing Note */}
                <FadeInDownView delay={400}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <ShieldCheck size={14} color={theme.mutedForeground} />
                    <Text style={{ color: theme.mutedForeground, fontSize: 13, fontWeight: '500' }}>
                      7-day free trial, then{' '}
                      <Text style={{ color: theme.foreground, fontWeight: '600' }}>
                        {selectedPlan === 'monthly' ? '$49/mo' : '~$40.83/mo'}
                      </Text>
                      /month.
                    </Text>
                  </View>
                </FadeInDownView>
              </>
            ) : (
              <>
                {/* Credit Packs Info */}
                <FadeInDownView delay={250}>
                  <Text style={{ 
                    color: theme.mutedForeground, 
                    fontSize: 14, 
                    fontWeight: '500', 
                    textAlign: 'center', 
                    marginBottom: 20 
                  }}>
                    One-time purchase. Credits never expire.
                  </Text>
                </FadeInDownView>

                <View style={{ gap: 12 }}>
                  {creditPacks.map((pack, index) => (
                    <FadeInDownView key={pack.id} delay={300 + index * 50}>
                      <ScalePressable
                        onPress={() => handleBuyCredits(pack.id)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          backgroundColor: isDark ? '#2C2B27' : '#F5F3F0',
                          borderRadius: 16,
                          padding: 16,
                          borderWidth: 1,
                          borderColor: pack.bestValue ? theme.foreground : theme.border,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ 
                              color: theme.foreground, 
                              fontSize: 16, 
                              fontWeight: '600' 
                            }}>
                              {pack.name}
                            </Text>
                            {pack.bestValue && (
                              <View style={{ 
                                backgroundColor: theme.foreground, 
                                paddingHorizontal: 8, 
                                paddingVertical: 2, 
                                borderRadius: 4,
                              }}>
                                <Text style={{ 
                                  color: isDark ? '#1A1918' : '#FFFFFF', 
                                  fontSize: 10, 
                                  fontWeight: '700', 
                                  letterSpacing: 0.5 
                                }}>
                                  BEST VALUE
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text style={{ 
                            color: theme.mutedForeground, 
                            fontSize: 14, 
                            marginTop: 2 
                          }}>
                            {pack.credits} credits
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          {buyingPack === pack.id ? (
                            <ActivityIndicator size="small" color={theme.foreground} />
                          ) : (
                            <Text style={{ 
                              color: theme.foreground, 
                              fontSize: 17, 
                              fontWeight: '600' 
                            }}>
                              {pack.price}
                            </Text>
                          )}
                        </View>
                      </ScalePressable>
                    </FadeInDownView>
                  ))}
                </View>

                <FadeInDownView delay={500}>
                  <View style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: 6, 
                    marginTop: 20 
                  }}>
                    <ShieldCheck size={14} color={theme.mutedForeground} />
                    <Text style={{ 
                      color: theme.mutedForeground, 
                      fontSize: 13, 
                      fontWeight: '500' 
                    }}>
                      Secure payment via Stripe
                    </Text>
                  </View>
                </FadeInDownView>
              </>
            )}
          </ScrollView>

          {/* Fixed Bottom Section - only show for subscribe tab */}
          {activeTab === 'subscribe' && (
            <View style={{ 
              paddingHorizontal: 24, 
              paddingBottom: 16, 
              backgroundColor: theme.background 
            }}>
              <FadeInDownView delay={450}>
                <ScalePressable 
                  onPress={handleStartTrial}
                  style={{ 
                    height: 52,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.primary,
                  }}
                >
                  <Text style={{ 
                    fontSize: 15, 
                    fontWeight: '600', 
                    color: theme.primaryForeground,
                  }}>
                    Start 7-day free trial
                  </Text>
                </ScalePressable>
              </FadeInDownView>
            </View>
          )}
        </SafeAreaView>
      </Animated.View>
    </View>
  )
}

