import { describe, expect, it } from "vitest";
import { isUiThemePreference, resolveUiTheme } from "./ui-theme";

describe("ui theme", () => {
  it("resolves system from the OS preference", () => {
    expect(resolveUiTheme("system", false)).toBe("dark");
    expect(resolveUiTheme("system", true)).toBe("light");
    expect(resolveUiTheme("dark", true)).toBe("dark");
    expect(resolveUiTheme("light", false)).toBe("light");
  });

  it("accepts only known preferences", () => {
    expect(isUiThemePreference("dark")).toBe(true);
    expect(isUiThemePreference("sepia")).toBe(false);
  });
});
