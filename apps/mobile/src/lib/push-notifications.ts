// Push notifications stub - feature disabled until expo-notifications is installed
// To enable: install expo-notifications, expo-device, and update Apple provisioning

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  return null
}

export async function savePushToken(_token: string): Promise<void> {
  return
}

export async function setupPushNotifications(): Promise<void> {
  return
}

export function addNotificationReceivedListener(_callback: (notification: any) => void) {
  return { remove: () => {} }
}

export function addNotificationResponseReceivedListener(_callback: (response: any) => void) {
  return { remove: () => {} }
}
