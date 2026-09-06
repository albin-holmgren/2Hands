import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, URL } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../metro.config.js", import.meta.url), "utf8");

function loadConfig(env: Record<string, string> = {}, version?: string) {
  const resolveRequest = vi.fn(
    (_context: { originModulePath?: string }, _moduleName: string, _platform: string) => ({
      type: "sourceFile",
      filePath: "/app/source.ts",
    }),
  );
  const config = { cacheVersion: version, resolver: { resolveRequest } };
  const module = { exports: config };
  runInNewContext(source, {
    __dirname: fileURLToPath(new URL("..", import.meta.url)),
    module,
    process: { env },
    require: (name: string) => {
      if (name === "expo/metro-config") return { getDefaultConfig: () => config };
      if (name === "./metro-resolver") return require("../metro-resolver.js");
      if (name === "node:crypto") return require(name);
      throw new Error(`Unexpected config dependency: ${name}`);
    },
  });
  return { config: module.exports, resolveRequest };
}

describe("mobile Metro endpoint cache", () => {
  it("separates fixture, production, and unset endpoint transforms in CI", () => {
    const versions = [undefined, "http://10.0.2.2:3100", "https://app.example.test"].map(
      (origin) =>
        loadConfig({ CI: "1", ...(origin ? { EXPO_PUBLIC_API_URL: origin } : {}) }).config
          .cacheVersion,
    );
    expect(new Set(versions).size).toBe(3);
  });

  it("retains Expo's cache version and changes when Expo's version changes", () => {
    const first = loadConfig({}, "expo-first").config.cacheVersion;
    const second = loadConfig({}, "expo-second").config.cacheVersion;
    expect(first).toMatch(/^expo-first:/);
    expect(second).toMatch(/^expo-second:/);
    expect(first).not.toBe(second);
  });

  it("is deterministic and ignores unrelated environment values", () => {
    const env = { EXPO_PUBLIC_API_URL: "https://app.example.test" };
    const first = loadConfig(env).config.cacheVersion;
    expect(loadConfig(env).config.cacheVersion).toBe(first);
    expect(loadConfig({ ...env, PRIVATE_TEST_VALUE: "unrelated" }).config.cacheVersion).toBe(first);
    expect(first).not.toContain(env.EXPO_PUBLIC_API_URL);
    expect(loadConfig({ EXPO_PUBLIC_API_URL: "" }).config.cacheVersion).toBe(
      loadConfig().config.cacheVersion,
    );
  });

  it("preserves the existing source resolver", () => {
    const { config, resolveRequest } = loadConfig();
    const context = { originModulePath: "/app/index.ts" };
    expect(config.resolver.resolveRequest(context, "./source.js", "ios")).toEqual({
      type: "sourceFile",
      filePath: "/app/source.ts",
    });
    expect(resolveRequest).toHaveBeenCalledWith(context, "./source", "ios");
  });
});
