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
      <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
      <Stack.Screen name="agent/[id]" options={{ animation: 'none' }} />
      <Stack.Screen name="referral" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
  )
}
