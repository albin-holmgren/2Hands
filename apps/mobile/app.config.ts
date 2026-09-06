import type { ConfigContext, ExpoConfig } from "expo/config";

function isNonproductionHost(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (/^(localhost|.+\.(localhost|local|test|invalid))$/.test(host)) return true;
  if (!host.includes(".") && !host.includes(":")) return true;
  if (host.includes(":")) {
    return /^(::(?:1)?$|::ffff:|f[cd]|fe[89ab])/.test(host);
  }
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  const [first = 0, second = 0] = host.split(".").map(Number);
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127)
  );
}

export function mobileBuildConfig(
  config: ExpoConfig,
  environment: Record<string, string | undefined>,
): ExpoConfig {
  const storeBuild = environment.EAS_BUILD_PROFILE === "production";
  const iosStoreBuild = storeBuild && environment.EAS_BUILD_PLATFORM !== "android";
  const androidStoreBuild = storeBuild && environment.EAS_BUILD_PLATFORM !== "ios";
  const production = storeBuild || environment.TWOHANDS_PRODUCTION_UPDATE === "1";
  const owner = environment.EAS_OWNER?.trim();
  const projectId = environment.EAS_PROJECT_ID?.trim();
  const iosId = environment.EAS_IOS_BUNDLE_IDENTIFIER?.trim();
  const androidId = environment.EAS_ANDROID_PACKAGE?.trim();
  if ((iosStoreBuild || iosId) && (!iosId || !/^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(iosId))) {
    throw new Error(
      "Set EAS_IOS_BUNDLE_IDENTIFIER to an iOS application identifier owned by the release operator.",
    );
  }
  if (
    (androidStoreBuild || androidId) &&
    (!androidId || !/^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(androidId))
  ) {
    throw new Error(
      "Set EAS_ANDROID_PACKAGE to an Android application identifier owned by the release operator.",
    );
  }
  if (production || owner || projectId) {
    if (!owner || !/^[a-zA-Z0-9_-]+$/.test(owner)) {
      throw new Error(
        "Set EAS_OWNER to the release operator's Expo account before building or publishing.",
      );
    }
    if (
      !projectId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)
    ) {
      throw new Error("Set EAS_PROJECT_ID to the release operator's Expo project UUID.");
    }
  }
  if (production) {
    const apiUrl = environment.EXPO_PUBLIC_API_URL;
    if (!apiUrl) {
      throw new Error("EXPO_PUBLIC_API_URL must be set before a production build or update.");
    }

    let parsed: URL;
    try {
      parsed = new URL(apiUrl);
    } catch {
      throw new Error("EXPO_PUBLIC_API_URL must be a valid URL.");
    }
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== "/" ||
      isNonproductionHost(parsed.hostname)
    ) {
      throw new Error(
        "EXPO_PUBLIC_API_URL must be a public HTTPS origin without credentials, paths, or query parameters.",
      );
    }
  }

  // An unlinked local build must never fetch executable OTA code from an upstream project.
  return {
    ...config,
    owner,
    ios: { ...config.ios, ...(iosId ? { bundleIdentifier: iosId } : {}) },
    android: { ...config.android, ...(androidId ? { package: androidId } : {}) },
    extra: { ...config.extra, eas: projectId ? { projectId } : undefined },
    updates: projectId
      ? { enabled: true, url: `https://u.expo.dev/${projectId}` }
      : { enabled: false },
  };
}

export default ({ config }: ConfigContext): ExpoConfig =>
  mobileBuildConfig(config as ExpoConfig, process.env);
