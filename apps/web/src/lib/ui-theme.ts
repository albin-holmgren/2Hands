export const UI_THEME_KEY = "rakazo.ui-theme";
export const UI_THEME_PREFERENCES = ["system", "dark", "light"] as const;
export type UiThemePreference = (typeof UI_THEME_PREFERENCES)[number];
export type UiResolvedTheme = "dark" | "light";

export function isUiThemePreference(value: string | null | undefined): value is UiThemePreference {
  return UI_THEME_PREFERENCES.some((preference) => preference === value);
}

export function readUiThemePreference(): UiThemePreference {
  try {
    const stored = window.localStorage.getItem(UI_THEME_KEY);
    if (isUiThemePreference(stored)) return stored;
  } catch {
    // Private mode / blocked storage — fall through to default.
  }
  return "system";
}

export function writeUiThemePreference(preference: UiThemePreference) {
  try {
    window.localStorage.setItem(UI_THEME_KEY, preference);
  } catch {
    // Keep the in-memory document theme if storage is blocked.
  }
}

export function resolveUiTheme(
  preference: UiThemePreference,
  prefersLight = false,
): UiResolvedTheme {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return prefersLight ? "light" : "dark";
}

export function systemPrefersLight() {
  return window.matchMedia("(prefers-color-scheme: light)").matches;
}

export function applyResolvedUiTheme(theme: UiResolvedTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.documentElement.style.backgroundColor = palettes[theme].page;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta instanceof HTMLMetaElement) {
    meta.content = palettes[theme].page;
  }
}

export function applyUiThemePreference(preference: UiThemePreference) {
  writeUiThemePreference(preference);
  applyResolvedUiTheme(resolveUiTheme(preference, systemPrefersLight()));
}

import { palettes } from "@rakazo/ui-tokens";
