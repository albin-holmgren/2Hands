import { themeTokens, type UiTheme } from "@rakazo/ui-tokens";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { Appearance, useColorScheme } from "react-native";

export type ThemePreference = "system" | UiTheme;
const KEY = "2hands.appearance";
let preference: ThemePreference = "system";
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export async function loadThemePreference() {
  try {
    const saved = await SecureStore.getItemAsync(KEY);
    if (saved === "light" || saved === "dark" || saved === "system") preference = saved;
  } catch {
    /* System appearance is available offline and before storage is ready. */
  }
  Appearance.setColorScheme(preference === "system" ? "unspecified" : preference);
  for (const listener of listeners) listener();
}
export async function setThemePreference(next: ThemePreference) {
  await SecureStore.setItemAsync(KEY, next);
  preference = next;
  Appearance.setColorScheme(next === "system" ? "unspecified" : next);
  for (const listener of listeners) listener();
}
export function useThemePreference() {
  return useSyncExternalStore(
    subscribe,
    () => preference,
    () => "system" as ThemePreference,
  );
}
export function nativeTheme(theme: UiTheme) {
  const palette = themeTokens(theme);
  return {
    ...palette,
    theme,
    fill: palette.surface2,
    fillPressed: palette.hairline,
    label: palette.ink,
    secondaryLabel: palette.muted,
    tertiaryLabel: palette.muted2,
  };
}
const nativePalettes = { light: nativeTheme("light"), dark: nativeTheme("dark") };
export type NativeTheme = ReturnType<typeof nativeTheme>;
export function useNativeTheme(): NativeTheme {
  const preferred = useThemePreference();
  const system = useColorScheme();
  return nativePalettes[
    preferred === "system" ? (system === "dark" ? "dark" : "light") : preferred
  ];
}
