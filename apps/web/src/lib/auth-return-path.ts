/** Only restore known in-app routes; never turn account entry into an open redirect. */
export function authReturnPath(state: unknown): string {
  const value = state && typeof state === "object" && "returnTo" in state ? state.returnTo : null;
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/app";
  try {
    const url = new URL(value, "https://local.invalid");
    if (url.origin !== "https://local.invalid") return "/app";
    if (
      !/^\/app(?:\/[^/]+(?:\/[^/]+)?)?\/?$/.test(url.pathname) &&
      !["/onboarding", "/mcp/oauth/callback"].includes(url.pathname)
    ) {
      return "/app";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/app";
  }
}
