export function siblingWwwOrigin(origin: string): string | undefined {
  try {
    const url = new URL(origin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1") {
      return undefined;
    }
    if (!url.hostname.includes(".")) return undefined;
    const host = url.hostname.startsWith("www.") ? url.hostname.slice(4) : `www.${url.hostname}`;
    return `${url.protocol}//${host}`;
  } catch {
    return undefined;
  }
}

export function trustedBrowserOrigins(env: {
  webOrigin: string;
  apiUrl: string;
  authUrl: string;
  trustedWebOrigins?: string[];
}): string[] {
  const origins = new Set([env.webOrigin, env.apiUrl, env.authUrl].filter(Boolean));
  for (const origin of [...origins]) {
    const sibling = siblingWwwOrigin(origin);
    if (sibling) origins.add(sibling);
  }
  origins.add("https://2hands-computers.fly.dev");
  for (const origin of env.trustedWebOrigins ?? []) origins.add(origin);
  return [...origins];
}

export function canonicalHostRedirect(
  requestUrl: string,
  canonicalOrigin: string,
): string | undefined {
  try {
    const url = new URL(requestUrl);
    const canonical = new URL(canonicalOrigin);
    if (!canonical.hostname || canonical.hostname.startsWith("www.")) return undefined;
    if (url.hostname !== `www.${canonical.hostname}`) return undefined;
    return `${canonical.origin}${url.pathname}${url.search}`;
  } catch {
    return undefined;
  }
}

export function publicRequestUrl(request: Request): string {
  const incoming = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? incoming.host;
  const proto =
    request.headers.get("x-forwarded-proto") ?? incoming.protocol.replace(":", "") ?? "https";
  return `${proto}://${host}${incoming.pathname}${incoming.search}`;
}

/** Development runtimes are trusted only by development/test deployments. */
export function trustedAuthOrigins(env: {
  webOrigin: string;
  apiUrl: string;
  authUrl: string;
  nodeEnv: string;
  trustedWebOrigins?: string[];
}): string[] {
  return [
    ...new Set([
      ...trustedBrowserOrigins(env),
      "rakazo://",
      "2hands://",
      ...(["development", "test"].includes(env.nodeEnv)
        ? [
            "exp://",
            "exp://*",
            "http://localhost:8081",
            "http://127.0.0.1:8081",
            "http://localhost:19006",
            "http://127.0.0.1:19006",
          ]
        : []),
    ]),
  ];
}
