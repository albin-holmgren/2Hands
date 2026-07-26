import { useEffect, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/lib/theme-context'

export default function AuthCallback() {
  const { colors: theme } = useTheme()

  const { code, error, error_description } = useLocalSearchParams<{
    code?: string | string[]
    error?: string | string[]
    error_description?: string | string[]
  }>()

  const [statusText, setStatusText] = useState('Signing you in…')

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const err = Array.isArray(error) ? error[0] : error
      const errDesc = Array.isArray(error_description) ? error_description[0] : error_description

      if (typeof err === 'string' && err.length > 0) {
        setStatusText(errDesc || err)
        return
      }

      const codeValue = Array.isArray(code) ? code[0] : code
      if (!codeValue) {
        setStatusText('Missing OAuth code')
        return
      }

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(codeValue)
      if (cancelled) return

      if (exchangeError) {
        setStatusText(exchangeError.message)
        return
      }

      router.replace('/(app)/v3')
    }

    run()

    return () => {
      cancelled = true
    }
  }, [code, error, error_description])

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background, paddingHorizontal: 24 }}>
      <ActivityIndicator size="large" color={theme.primary} />
      <Text style={{ marginTop: 16, color: theme.mutedForeground, fontSize: 14, textAlign: 'center' }}>
        {statusText}
      </Text>
    </View>
  )
}
