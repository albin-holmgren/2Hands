import '../global.css'
import { useEffect, useState } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { View, ActivityIndicator } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import { AuthProvider } from '@/lib/auth-context'
import { ThemeProvider, useTheme } from '@/lib/theme-context'
import { KeyboardProvider } from 'react-native-keyboard-controller'

SplashScreen.preventAutoHideAsync()

function AppContent() {
  const { isDark, colors } = useTheme()

  return (
    <AuthProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: colors.background,
          },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  )
}

export default function RootLayout() {
  const [appReady, setAppReady] = useState(false)

  useEffect(() => {
    async function prepare() {
      try {
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (e) {
        console.warn('App init error:', e)
      } finally {
        setAppReady(true)
        await SplashScreen.hideAsync()
      }
    }
    prepare()
  }, [])

  if (!appReady) {
    return (
      <View style={{ flex: 1, backgroundColor: '#1A1918', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#D97757" />
      </View>
    )
  }

  return (
    <KeyboardProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </KeyboardProvider>
  )
}
