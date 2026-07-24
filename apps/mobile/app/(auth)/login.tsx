import { useState, useRef, useCallback } from 'react'
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, TextInput, Pressable, Image, LayoutAnimation, UIManager, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import { useTheme } from '@/lib/theme-context'
import * as Haptics from 'expo-haptics'
import { FadeInDownView, ScalePressable, ConfirmationModal } from '@/components/ui'
import Svg, { Path } from 'react-native-svg'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

type AuthStep = 'email' | 'signin' | 'signup'

function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </Svg>
  )
}


function ArrowLeftIcon({ size = 16, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 12H5" />
      <Path d="M12 19l-7-7 7-7" />
    </Svg>
  )
}

export default function LoginScreen() {
  const { isDark, colors } = useTheme()
  const { ref } = useLocalSearchParams<{ ref?: string }>()
  
  const { signIn, signUp, signInWithOAuth, resetPassword } = useAuth()
  const [step, setStep] = useState<AuthStep>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingEmail, setIsCheckingEmail] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const emailRef = useRef<TextInput>(null)
  const passwordRef = useRef<TextInput>(null)
  const nameRef = useRef<TextInput>(null)
  
  const [showResetModal, setShowResetModal] = useState(false)
  const [modalType, setModalType] = useState<'confirm' | 'result'>('confirm')
  const [modalContent, setModalContent] = useState({ title: '', message: '', isError: false })
  const [isSendingReset, setIsSendingReset] = useState(false)

  const animateTransition = () => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(300, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
    )
  }

  const handleOAuth = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    await signInWithOAuth('google')
  }, [signInWithOAuth])

  const handleEmailSubmit = useCallback(async () => {
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }

    setIsCheckingEmail(true)
    setError(null)

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || ''
      const res = await fetch(`${apiUrl}/api/auth/check-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const { exists } = await res.json()
      
      animateTransition()
      setStep(exists ? 'signin' : 'signup')
      
      setTimeout(() => {
        if (exists) {
          passwordRef.current?.focus()
        } else {
          nameRef.current?.focus()
        }
      }, 350)
    } catch {
      animateTransition()
      setStep('signin')
      setTimeout(() => passwordRef.current?.focus(), 350)
    } finally {
      setIsCheckingEmail(false)
    }
  }, [email])

  const handleSignIn = async () => {
    if (!email || !password) {
      setError('Please fill in all fields')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }

    setIsLoading(true)
    setError(null)

    const { error: signInError } = await signIn(email, password)

    if (signInError) {
      setError(signInError.message)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      router.replace('/(app)/(tabs)')
    }

    setIsLoading(false)
  }

  const handleSignUp = async () => {
    if (!fullName || !email || !password) {
      setError('Please fill in all fields')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }

    setIsLoading(true)
    setError(null)

    const { error: signUpError } = await signUp(email, password, fullName)

    if (signUpError) {
      setError(signUpError.message)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } else {
      if (ref) {
        try { await api.applyReferralCode(ref) } catch {}
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setModalType('result')
      setModalContent({
        title: 'Check your email',
        message: 'We\'ve sent you a confirmation email. Please check your inbox to verify your account.',
        isError: false
      })
      setShowResetModal(true)
      setStep('signin')
    }

    setIsLoading(false)
  }

  const goBack = () => {
    setPassword('')
    setFullName('')
    setError(null)
    animateTransition()
    setStep('email')
  }

  const getSubtitleText = () => {
    switch (step) {
      case 'email':
        return 'Sign in or sign up for free\nwith your work email'
      case 'signin':
        return 'Welcome back! Enter your password to sign in'
      case 'signup':
        return 'Create your account to get started'
      default:
        return ''
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSecondary }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={{ flex: 1, paddingHorizontal: 32, paddingBottom: 40, justifyContent: 'flex-end' }}>
              
              <FadeInDownView style={{ alignItems: 'center', marginBottom: 48 }}>
                <Image 
                  source={isDark ? require('../../assets/logo-white.png') : require('../../assets/logo-black.png')} 
                  style={{ width: 40, height: 40 }}
                  resizeMode="contain"
                />
              </FadeInDownView>

              <FadeInDownView delay={100} style={{ alignItems: 'center', marginBottom: 40 }}>
                <Text style={{ 
                  fontSize: 28, 
                  fontWeight: '700', 
                  color: colors.cardForeground, 
                  textAlign: 'center',
                  lineHeight: 36,
                }}>
                  Welcome to 2Hands
                </Text>
                <Text style={{ 
                  fontSize: 28, 
                  fontWeight: '700', 
                  color: colors.mutedForeground, 
                  textAlign: 'center',
                  lineHeight: 36,
                }}>
                  Hands on AI
                </Text>
              </FadeInDownView>

              <FadeInDownView delay={150} style={{ alignItems: 'center', marginBottom: 48 }}>
                <Text style={{ 
                  fontSize: 15, 
                  color: colors.mutedForeground, 
                  textAlign: 'center',
                  lineHeight: 22,
                }}>
                  {getSubtitleText()}
                </Text>
              </FadeInDownView>

              <View style={{ marginBottom: 32 }}>
                
                {error && (
                  <FadeInDownView>
                    <View style={{ 
                      backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                      borderWidth: 1, 
                      borderColor: 'rgba(239, 68, 68, 0.3)', 
                      borderRadius: 12, 
                      paddingHorizontal: 16, 
                      paddingVertical: 12, 
                      marginBottom: 16 
                    }}>
                      <Text style={{ color: '#ef4444', fontSize: 14, textAlign: 'center', fontWeight: '500' }}>{error}</Text>
                    </View>
                  </FadeInDownView>
                )}

                {step === 'email' && (
                  <FadeInDownView delay={200}>
                    <ScalePressable
                      onPress={handleOAuth}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.bgSecondary,
                        height: 44,
                        borderRadius: 22,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <GoogleIcon size={20} />
                      <Text style={{ 
                        marginLeft: 12,
                        color: colors.cardForeground, 
                        fontWeight: '500', 
                        fontSize: 14 
                      }}>
                        Continue with Google
                      </Text>
                    </ScalePressable>

                    <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 16 }}>
                      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                      <Text style={{ 
                        marginHorizontal: 12,
                        fontSize: 13, 
                        color: colors.mutedForeground,
                      }}>or</Text>
                      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                    </View>

                    <Pressable 
                      onPress={() => emailRef.current?.focus()}
                      style={{ 
                        backgroundColor: colors.bgSecondary, 
                        borderRadius: 24, 
                        paddingHorizontal: 20, 
                        height: 48,
                        borderWidth: 1,
                        borderColor: colors.border,
                        justifyContent: 'center',
                      }}
                    >
                      <TextInput
                        ref={emailRef}
                        placeholder="name@work-email.com"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        onSubmitEditing={handleEmailSubmit}
                        returnKeyType="next"
                        style={{ 
                          flex: 1, 
                          color: colors.cardForeground, 
                          fontSize: 14,
                        }}
                        placeholderTextColor={colors.placeholder}
                      />
                    </Pressable>

                    <ScalePressable
                      onPress={handleEmailSubmit}
                      disabled={!email.trim() || isCheckingEmail}
                      style={{
                        marginTop: 12,
                        height: 44,
                        borderRadius: 22,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: (!email.trim() || isCheckingEmail) ? colors.muted : colors.primary,
                      }}
                    >
                      {isCheckingEmail ? (
                        <ActivityIndicator color={colors.primaryForeground} size="small" />
                      ) : (
                        <Text style={{ 
                          color: (!email.trim() || isCheckingEmail) ? colors.mutedForeground : colors.primaryForeground, 
                          fontWeight: '700', 
                          fontSize: 14 
                        }}>
                          Enter your work email
                        </Text>
                      )}
                    </ScalePressable>
                  </FadeInDownView>
                )}

                {step === 'signin' && (
                  <FadeInDownView delay={200}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                      <ScalePressable onPress={goBack} style={{ padding: 8, marginLeft: -8 }}>
                        <ArrowLeftIcon size={16} color={colors.mutedForeground} />
                      </ScalePressable>
                      <Text style={{ flex: 1, fontSize: 14, color: colors.mutedForeground }}>{email}</Text>
                    </View>

                    <Pressable 
                      onPress={() => passwordRef.current?.focus()}
                      style={{ 
                        backgroundColor: colors.bgSecondary, 
                        borderRadius: 24, 
                        paddingHorizontal: 20, 
                        height: 48,
                        borderWidth: 1,
                        borderColor: colors.border,
                        justifyContent: 'center',
                      }}
                    >
                      <TextInput
                        ref={passwordRef}
                        placeholder="Password"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        autoCorrect={false}
                        onSubmitEditing={handleSignIn}
                        returnKeyType="done"
                        style={{ 
                          flex: 1, 
                          color: colors.cardForeground, 
                          fontSize: 14,
                        }}
                        placeholderTextColor={colors.placeholder}
                      />
                    </Pressable>

                    <ScalePressable
                      onPress={handleSignIn}
                      disabled={!password || isLoading}
                      style={{
                        marginTop: 12,
                        height: 44,
                        borderRadius: 22,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: (!password || isLoading) ? colors.muted : colors.primary,
                      }}
                    >
                      {isLoading ? (
                        <ActivityIndicator color={colors.primaryForeground} size="small" />
                      ) : (
                        <Text style={{ 
                          color: (!password || isLoading) ? colors.mutedForeground : colors.primaryForeground, 
                          fontWeight: '700', 
                          fontSize: 14 
                        }}>
                          Sign in
                        </Text>
                      )}
                    </ScalePressable>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
                      <ScalePressable onPress={() => setShowResetModal(true)}>
                        <Text style={{ fontSize: 13, color: colors.mutedForeground, textDecorationLine: 'underline' }}>
                          Forgot password?
                        </Text>
                      </ScalePressable>
                      <ScalePressable onPress={() => { setPassword(''); setStep('signup'); }}>
                        <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
                          Create account →
                        </Text>
                      </ScalePressable>
                    </View>
                  </FadeInDownView>
                )}

                {step === 'signup' && (
                  <FadeInDownView delay={200}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                      <ScalePressable onPress={goBack} style={{ padding: 8, marginLeft: -8 }}>
                        <ArrowLeftIcon size={16} color={colors.mutedForeground} />
                      </ScalePressable>
                      <Text style={{ flex: 1, fontSize: 14, color: colors.mutedForeground }}>{email}</Text>
                    </View>

                    <Pressable 
                      onPress={() => nameRef.current?.focus()}
                      style={{ 
                        backgroundColor: colors.bgSecondary, 
                        borderRadius: 24, 
                        paddingHorizontal: 20, 
                        height: 48,
                        borderWidth: 1,
                        borderColor: colors.border,
                        justifyContent: 'center',
                        marginBottom: 12,
                      }}
                    >
                      <TextInput
                        ref={nameRef}
                        placeholder="Full name"
                        value={fullName}
                        onChangeText={setFullName}
                        autoCapitalize="words"
                        autoCorrect={false}
                        onSubmitEditing={() => passwordRef.current?.focus()}
                        returnKeyType="next"
                        style={{ 
                          flex: 1, 
                          color: colors.cardForeground, 
                          fontSize: 14,
                        }}
                        placeholderTextColor={colors.placeholder}
                      />
                    </Pressable>

                    <Pressable 
                      onPress={() => passwordRef.current?.focus()}
                      style={{ 
                        backgroundColor: colors.bgSecondary, 
                        borderRadius: 24, 
                        paddingHorizontal: 20, 
                        height: 48,
                        borderWidth: 1,
                        borderColor: colors.border,
                        justifyContent: 'center',
                      }}
                    >
                      <TextInput
                        ref={passwordRef}
                        placeholder="Password (min 8 characters)"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        autoCorrect={false}
                        onSubmitEditing={handleSignUp}
                        returnKeyType="done"
                        style={{ 
                          flex: 1, 
                          color: colors.cardForeground, 
                          fontSize: 14,
                        }}
                        placeholderTextColor={colors.placeholder}
                      />
                    </Pressable>

                    <ScalePressable
                      onPress={handleSignUp}
                      disabled={!fullName || !password || password.length < 8 || isLoading}
                      style={{
                        marginTop: 12,
                        height: 44,
                        borderRadius: 22,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: (!fullName || !password || password.length < 8 || isLoading) ? colors.muted : colors.primary,
                      }}
                    >
                      {isLoading ? (
                        <ActivityIndicator color={colors.primaryForeground} size="small" />
                      ) : (
                        <Text style={{ 
                          color: (!fullName || !password || password.length < 8 || isLoading) ? colors.mutedForeground : colors.primaryForeground, 
                          fontWeight: '700', 
                          fontSize: 14 
                        }}>
                          Create account
                        </Text>
                      )}
                    </ScalePressable>

                    <ScalePressable 
                      onPress={() => { setPassword(''); setFullName(''); setStep('signin'); }}
                      style={{ marginTop: 16, alignItems: 'center' }}
                    >
                      <Text style={{ fontSize: 13, color: colors.mutedForeground }}>
                        ← Already have an account? Sign in
                      </Text>
                    </ScalePressable>
                  </FadeInDownView>
                )}

                <View style={{ marginTop: 24 }}>
                  <Text style={{ 
                    fontSize: 11, 
                    color: colors.mutedForeground,
                    textAlign: 'center',
                    lineHeight: 16,
                    opacity: 0.6,
                  }}>
                    By signing up to a free account or Team workspace, you agree to the MSA, Product Terms, Policies, Privacy Notice, and Cookie Notice.
                  </Text>
                </View>
              </View>

              <ConfirmationModal
                visible={showResetModal}
                onClose={() => setShowResetModal(false)}
                title={modalContent.title}
                message={modalContent.message}
                icon={
                  <View style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: modalType === 'confirm' ? 'rgba(59, 130, 246, 0.1)' : (modalContent.isError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)'),
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 24 }}>
                      {modalType === 'confirm' ? '🔐' : (modalContent.isError ? '⚠️' : '✉️')}
                    </Text>
                  </View>
                }
                primaryAction={
                  modalType === 'confirm' 
                    ? { 
                        label: 'Send Reset Link', 
                        onPress: async () => {
                          if (!email) return
                          setIsSendingReset(true)
                          const { error } = await resetPassword(email)
                          setIsSendingReset(false)
                          setShowResetModal(false)
                          if (error) {
                            setModalType('result')
                            setModalContent({ title: 'Error', message: error.message, isError: true })
                            setShowResetModal(true)
                          } else {
                            setModalType('result')
                            setModalContent({ 
                              title: 'Email Sent', 
                              message: 'Check your inbox for the password reset link.',
                              isError: false 
                            })
                            setShowResetModal(true)
                          }
                        },
                        loading: isSendingReset
                      }
                    : { 
                        label: 'OK', 
                        onPress: () => setShowResetModal(false) 
                      }
                }
                secondaryAction={
                  modalType === 'confirm' 
                    ? { 
                        label: 'Cancel', 
                        onPress: () => setShowResetModal(false) 
                      }
                    : undefined
                }
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  )
}
