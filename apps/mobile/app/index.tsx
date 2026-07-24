import { Redirect } from 'expo-router'
import { useAuth } from '@/lib/auth-context'
import { View, ActivityIndicator } from 'react-native'

export default function Index() {
  const { session, isLoading } = useAuth()

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-dark-background">
        <ActivityIndicator size="large" color="#D97757" />
      </View>
    )
  }

  if (session) {
    return <Redirect href="/(app)/(tabs)" />
  }

  return <Redirect href="/(auth)/login" />
}
