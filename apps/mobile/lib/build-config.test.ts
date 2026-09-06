import { describe, expect, it } from "vitest";
import { mobileBuildConfig } from "../app.config.js";

const config = { name: "2hands", slug: "rakazo" };
const release = {
  EAS_OWNER: "example-team",
  EAS_PROJECT_ID: "11111111-1111-4111-8111-111111111111",
  EXPO_PUBLIC_API_URL: "https://app.example.com",
  EAS_BUILD_PROFILE: "production",
  EAS_IOS_BUNDLE_IDENTIFIER: "com.example.twohands",
  EAS_ANDROID_PACKAGE: "com.example.twohands",
};

describe("mobile distribution identity", () => {
  it("keeps unlinked local builds independent from another operator's OTA code", () => {
    const result = mobileBuildConfig(config, {});
    expect(result.owner).toBeUndefined();
    expect(result.extra?.eas).toBeUndefined();
    expect(result.updates).toEqual({ enabled: false });
  });
  it("requires the operator's Expo identity for production builds and OTA", () => {
    expect(() => mobileBuildConfig(config, { EAS_BUILD_PROFILE: "production" })).toThrow(
      "EAS_IOS_BUNDLE_IDENTIFIER",
    );
    expect(() => mobileBuildConfig(config, { TWOHANDS_PRODUCTION_UPDATE: "1" })).toThrow(
      "EAS_OWNER",
    );
    expect(() => mobileBuildConfig(config, { EAS_OWNER: "example-team" })).toThrow(
      "EAS_PROJECT_ID",
    );
    expect(() => mobileBuildConfig(config, { ...release, EAS_PROJECT_ID: "bad" })).toThrow("UUID");
  });
  it("requires the owned identifier only for the selected store platform", () => {
    expect(
      mobileBuildConfig(config, {
        ...release,
        EAS_BUILD_PLATFORM: "ios",
        EAS_ANDROID_PACKAGE: undefined,
      }).ios?.bundleIdentifier,
    ).toBe(release.EAS_IOS_BUNDLE_IDENTIFIER);
    expect(
      mobileBuildConfig(config, {
        ...release,
        EAS_BUILD_PLATFORM: "android",
        EAS_IOS_BUNDLE_IDENTIFIER: undefined,
      }).android?.package,
    ).toBe(release.EAS_ANDROID_PACKAGE);
    expect(() =>
      mobileBuildConfig(config, {
        ...release,
        EAS_BUILD_PLATFORM: "ios",
        EAS_IOS_BUNDLE_IDENTIFIER: undefined,
      }),
    ).toThrow("EAS_IOS_BUNDLE_IDENTIFIER");
  });
  it("pins the update project to the configured operator", () => {
    expect(mobileBuildConfig(config, release)).toMatchObject({
      owner: release.EAS_OWNER,
      ios: { bundleIdentifier: release.EAS_IOS_BUNDLE_IDENTIFIER },
      android: { package: release.EAS_ANDROID_PACKAGE },
      extra: { eas: { projectId: release.EAS_PROJECT_ID } },
      updates: { enabled: true, url: `https://u.expo.dev/${release.EAS_PROJECT_ID}` },
    });
  });
  it("preserves installed local IDs while requiring explicit identities for store builds", () => {
    const local = {
      ...config,
      ios: { bundleIdentifier: "com.rakazo.app" },
      android: { package: "com.rakazo.app" },
    };
    expect(mobileBuildConfig(local, {})).toMatchObject({ ios: local.ios, android: local.android });
    expect(() => mobileBuildConfig(local, { ...release, EAS_IOS_BUNDLE_IDENTIFIER: "" })).toThrow(
      "EAS_IOS_BUNDLE_IDENTIFIER",
    );
    expect(() => mobileBuildConfig(local, { ...release, EAS_ANDROID_PACKAGE: "" })).toThrow(
      "EAS_ANDROID_PACKAGE",
    );
    expect(() =>
      mobileBuildConfig(local, { ...release, EAS_ANDROID_PACKAGE: "com.example.two-hands" }),
    ).toThrow("EAS_ANDROID_PACKAGE");
  });
  it.each([
    undefined,
    "not a URL",
    "http://app.example.test",
    "https://user:password@app.example.test",
    "https://app.example.test/api",
    "https://app.example.test/?token=value",
    "https://localhost",
    "https://localhost.",
    "https://preview.local",
    "https://fixture.example.test",
    "https://127.0.0.1",
    "https://10.0.2.2",
    "https://192.168.1.1",
    "https://172.16.0.1",
    "https://100.64.0.1",
    "https://169.254.1.1",
    "https://[::1]",
    "https://[fd00::1]",
    "https://[::ffff:127.0.0.1]",
  ])("rejects unsafe production API configuration: %s", (url) => {
    expect(() => mobileBuildConfig(config, { ...release, EXPO_PUBLIC_API_URL: url })).toThrow(
      "EXPO_PUBLIC_API_URL",
    );
  });
});
