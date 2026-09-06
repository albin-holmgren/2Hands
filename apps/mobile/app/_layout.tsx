import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { AppState, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { AvatarStyleProvider } from "../components/avatar-style";
import {
  currentApiBase,
  loadApiBase,
  loadSessionToken,
  selectedSpaceId,
  subscribeSessionExpired,
} from "../lib/api";
import { initializeComposerDraftStorage } from "../lib/composer-draft-storage";
import { flushComposerDrafts } from "../lib/composer-drafts";
import {
  configureForegroundNotifications,
  resumeLiveNotifications,
} from "../lib/live-notifications";
import { loadThemePreference, useNativeTheme } from "../lib/theme";
import { applyMobileUiDirection } from "../lib/ui-direction";

applyMobileUiDirection();
configureForegroundNotifications();

export default function Layout() {
  const native = useNativeTheme();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(
    () =>
      subscribeSessionExpired(() => {
        if (router.canDismiss()) router.dismissAll();
        router.replace("/sign-in");
      }),
    [router],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") void flushComposerDrafts().catch(() => undefined);
    });
    void Promise.all([loadApiBase(), loadThemePreference(), initializeComposerDraftStorage()])
      .then(async () =>
        resumeLiveNotifications(
          currentApiBase(),
          await loadSessionToken(),
          selectedSpaceId() ?? "",
        ),
      )
      .catch(() => undefined)
      .finally(() => setReady(true));
    return () => {
      subscription.remove();
      void flushComposerDrafts().catch(() => undefined);
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        {ready ? (
          <AvatarStyleProvider>
            <ThemeProvider
              value={{
                ...(native.theme === "dark" ? DarkTheme : DefaultTheme),
                colors: {
                  ...(native.theme === "dark" ? DarkTheme.colors : DefaultTheme.colors),
                  background: native.page,
                  card: native.page,
                  text: native.ink,
                  border: native.hairline,
                  primary: native.accent,
                },
              }}
            >
              <StatusBar style={native.theme === "dark" ? "light" : "dark"} />
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: native.page },
                  headerTintColor: native.ink,
                  headerShadowVisible: false,
                  headerTitleStyle: { fontSize: 16, fontWeight: "600" },
                  headerBackButtonDisplayMode: "minimal",
                  contentStyle: { backgroundColor: native.page },
                }}
              >
                <Stack.Screen name="index" options={{ headerShown: false, title: "2hands" }} />
                <Stack.Screen name="sign-in" options={{ headerShown: false }} />
                <Stack.Screen name="account" options={{ title: "Account" }} />
                <Stack.Screen name="usage" options={{ title: "Usage & plan" }} />
                <Stack.Screen name="models" options={{ title: "Models" }} />
                <Stack.Screen name="voice" options={{ title: "Voice" }} />
                <Stack.Screen name="integrations" options={{ title: "Integrations" }} />
                <Stack.Screen
                  name="new"
                  options={{
                    title: "New bot",
                    headerTitleAlign: "center",
                    presentation: "modal",
                    gestureEnabled: true,
                    headerBackVisible: false,
                  }}
                />
                <Stack.Screen
                  name="new-group"
                  options={{
                    title: "New group",
                    presentation: "modal",
                    gestureEnabled: true,
                  }}
                />
                <Stack.Screen
                  name="new-space"
                  options={{
                    title: "New workspace",
                    headerTitleAlign: "center",
                    presentation: "modal",
                    gestureEnabled: true,
                    headerBackVisible: false,
                  }}
                />
                <Stack.Screen name="group-thread" options={{ title: "Group" }} />
                <Stack.Screen name="group-settings" options={{ title: "Group settings" }} />
                <Stack.Screen name="bot-settings" options={{ title: "Chat settings" }} />
                <Stack.Screen name="thread" options={{ title: "Thread" }} />
                <Stack.Screen name="routine" options={{ title: "Routine" }} />
                <Stack.Screen name="computer" options={{ title: "Computer" }} />
              </Stack>
            </ThemeProvider>
          </AvatarStyleProvider>
        ) : (
          <View style={{ flex: 1, backgroundColor: native.page }} />
        )}
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
