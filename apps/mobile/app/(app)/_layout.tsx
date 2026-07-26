import { Stack } from 'expo-router'

export default function AppLayout() {
  return (
    <Stack 
      screenOptions={{ 
        headerShown: false, 
        animation: 'none',
        gestureEnabled: false,
      }}
    >
      {/* v3 is the app. The (tabs) stack below is the previous product, kept
          reachable at /(app)/(tabs) for reference but no longer the home
          screen — mirroring the web, where APP_HOME is /app/v3 and the old
          surface lives on at /app/legacy. */}
      <Stack.Screen name="v3" options={{ animation: 'none' }} />
      <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
      <Stack.Screen name="agent/[id]" options={{ animation: 'none' }} />
      <Stack.Screen name="upgrade" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="referral" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
  )
}
