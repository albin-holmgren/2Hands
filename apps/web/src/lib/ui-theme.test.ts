import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { palettes } from "@rakazo/ui-tokens";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isUiThemePreference, readUiThemePreference, resolveUiTheme } from "./ui-theme";

afterEach(() => vi.unstubAllGlobals());

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

  it("defaults to the system preference when storage is empty, invalid or blocked", () => {
    for (const saved of [null, "sepia"]) {
      vi.stubGlobal("window", { localStorage: { getItem: () => saved } });
      expect(readUiThemePreference()).toBe("system");
    }
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readUiThemePreference()).toBe("system");
  });

  it.each([
    [null, true, "light"],
    [null, false, "dark"],
    ["light", false, "light"],
    ["dark", true, "dark"],
    ["system", true, "light"],
    ["sepia", true, "light"],
    ["blocked", true, "light"],
  ] as const)(
    "paints %s with OS light=%s before the renderer loads",
    (saved, prefersLight, expected) => {
      const source = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
      const bootstrap = source.match(/<script data-theme-bootstrap>([\s\S]*?)<\/script>/)?.[1];
      expect(bootstrap).toBeTruthy();
      const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
      const meta = { content: "" };
      runInNewContext(bootstrap!, {
        localStorage: {
          getItem: () => {
            if (saved === "blocked") throw new Error("blocked");
            return saved;
          },
        },
        window: { matchMedia: () => ({ matches: prefersLight }) },
        document: { documentElement: root, querySelector: () => meta },
      });
      expect(root.dataset.theme).toBe(expected);
      expect(root.style.colorScheme).toBe(expected);
      expect(root.style.backgroundColor?.toLowerCase()).toBe(palettes[expected].page.toLowerCase());
      expect(meta.content).toBe(root.style.backgroundColor);
    },
  );
});
