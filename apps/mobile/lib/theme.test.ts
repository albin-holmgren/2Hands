import { themeTokens } from "@rakazo/ui-tokens";
import * as SecureStore from "expo-secure-store";
import { Appearance } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadThemePreference, nativeTheme, setThemePreference } from "./theme";

vi.mock("expo-secure-store", () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn() }));
vi.mock("react-native", () => ({
  Appearance: { setColorScheme: vi.fn() },
  useColorScheme: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());
describe("native appearance", () => {
  it("restores a saved preference and uses the native system override", async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue("dark");
    await loadThemePreference();
    expect(Appearance.setColorScheme).toHaveBeenLastCalledWith("dark");
    await setThemePreference("system");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("2hands.appearance", "system");
    expect(Appearance.setColorScheme).toHaveBeenLastCalledWith("unspecified");
  });
  it("keeps the active appearance when saving the new preference fails", async () => {
    vi.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error("Device locked"));
    await expect(setThemePreference("light")).rejects.toThrow("Device locked");
    expect(Appearance.setColorScheme).not.toHaveBeenCalled();
  });
  it("uses shared readable semantic colors in both themes", () => {
    for (const theme of ["light", "dark"] as const) {
      expect(nativeTheme(theme).label).toBe(themeTokens(theme).ink);
      expect(nativeTheme(theme).fill).toBe(themeTokens(theme).surface2);
      expect(nativeTheme(theme).page).not.toBe(nativeTheme(theme).ink);
    }
  });
});
