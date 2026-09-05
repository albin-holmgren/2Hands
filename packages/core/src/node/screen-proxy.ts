import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { validateHeaderName, validateHeaderValue } from "node:http";

const SCREEN_PROXY_TTL_MS = 60 * 60_000;
const SCREEN_PROXY_CIPHER = "aes-256-gcm";
const SCREEN_PROXY_REMOTE_PREFIX = "/novnc/remote";

// Forward only desktop HTTP/WebSocket protocol fields. A browser must never
// choose provider authentication, forwarding metadata or application credentials.
const ALLOWED_FORWARD_HEADERS = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "cache-control",
  "if-modified-since",
  "if-none-match",
  "range",
  "user-agent",
  "connection",
  "upgrade",
  "sec-websocket-key",
  "sec-websocket-version",
  "sec-websocket-protocol",
  "sec-websocket-extensions",
]);
const RESERVED_UPSTREAM_HEADERS = new Set([
  "host",
  "origin",
  "connection",
  "upgrade",
  "content-length",
  "transfer-encoding",
  "te",
  "trailer",
  "expect",
  "proxy-authorization",
  "proxy-authenticate",
]);
const SENSITIVE_RESPONSE_HEADERS = new Set([
  "location",
  "refresh",
  "clear-site-data",
  "set-cookie",
  "set-cookie2",
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
]);

export interface ScreenProxyOptions {
  /** Keep upstream credentials server-side and bind the provider's separate view/control stream. */
  proxyExternal?: boolean;
  upstreamHeaders?: Readonly<Record<string, string>>;
}

export function proxyExternalScreen(kind: string | null | undefined): boolean {
  return kind === "box" || kind === "e2b" || kind === "daytona";
}

export function addScreenProxyCapability(
  url: string,
  secret: string,
  proxyOrigin: string,
  now = Date.now(),
  options: ScreenProxyOptions = {},
): string {
  try {
    const parsed = new URL(url);
    if (options.proxyExternal || options.upstreamHeaders) {
      if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) {
        throw new Error("A secure upstream screen URL is required.");
      }
      const expiresAt = now + SCREEN_PROXY_TTL_MS;
      const policy = parsed.searchParams.get("view_only") === "false" ? "control" : "view";
      const token = sealScreenTarget(
        parsed.toString(),
        secret,
        policy,
        expiresAt,
        options.upstreamHeaders,
      );
      const origin = new URL(proxyOrigin).origin;
      const result = new URL(
        `${origin}${SCREEN_PROXY_REMOTE_PREFIX}/${policy}/${expiresAt}.${token}${parsed.pathname || "/"}`,
      );
      // noVNC performs RFB authentication in the browser. This is a scoped screen
      // password, never the provider-global access credential in upstreamHeaders.
      const password = parsed.searchParams.get("password");
      if (password) result.searchParams.set("password", password);
      for (const name of ["autoconnect", "resize"]) {
        const value = parsed.searchParams.get(name);
        if (value) result.searchParams.set(name, value);
      }
      result.searchParams.set("view_only", policy === "control" ? "false" : "true");
      return result.toString();
    }
    if (parsed.protocol !== "http:" || !parsed.hostname || !parsed.port) return url;
    const expiresAt = now + SCREEN_PROXY_TTL_MS;
    const target = Buffer.from(parsed.hostname).toString("base64url");
    const policy = parsed.searchParams.get("view_only") === "false" ? "control" : "view";
    const destination = `${parsed.pathname}${parsed.search}`;
    const signature = createHmac("sha256", secret)
      .update(`${parsed.hostname}:${parsed.port}:${policy}:${expiresAt}`)
      .digest("base64url");
    const origin = new URL(proxyOrigin).origin;
    return `${origin}/novnc/${target}/${parsed.port}/${policy}/${expiresAt}.${signature}${destination}`;
  } catch {
    if (options.proxyExternal || options.upstreamHeaders) {
      throw new Error("The secure computer viewer could not be created.");
    }
    return url;
  }
}

function sealScreenTarget(
  url: string,
  secret: string,
  policy: "view" | "control",
  expiresAt: number,
  upstreamHeaders?: Readonly<Record<string, string>>,
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(SCREEN_PROXY_CIPHER, screenProxyKey(secret), iv);
  cipher.setAAD(Buffer.from(`${policy}:${expiresAt}`));
  const payload = JSON.stringify({
    version: 1,
    url,
    upstreamHeaders: validatedUpstreamHeaders(upstreamHeaders),
  });
  const ciphertext = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

function screenProxyKey(secret: string) {
  return createHash("sha256").update(secret).digest();
}

export interface ScreenProxyTarget {
  protocol: string;
  hostname: string;
  port: number;
  path: string;
  interactive: boolean;
  upstreamHeaders?: Readonly<Record<string, string>>;
}

export function resolveNovncTarget(
  url: string | undefined,
  secret: string,
  now = Date.now(),
): ScreenProxyTarget | null {
  const match = url?.match(
    /^\/novnc\/([A-Za-z0-9_-]+)\/(\d+)\/(view|control)\/(\d+)\.([A-Za-z0-9_-]{43})(\/[^?]*)?(\?.*)?$/,
  );
  if (match) return resolveLocalTarget(match, secret, now);

  const remoteMatch = url?.match(
    /^\/novnc\/remote\/(view|control)\/(\d+)\.([A-Za-z0-9_-]+)(\/[^?]*)?(\?.*)?$/,
  );
  if (!remoteMatch) return null;
  const policy = remoteMatch[1]! as "view" | "control";
  const expiresAt = Number(remoteMatch[2]);
  if (!Number.isInteger(expiresAt) || expiresAt < now) return null;
  const opened = openScreenTarget(remoteMatch[3]!, secret, policy, expiresAt);
  if (!opened) return null;
  const target = opened.url;
  const requestedPath = `${remoteMatch[4] || target.pathname || "/"}${remoteMatch[5] || ""}`;
  return {
    protocol: target.protocol,
    hostname: target.hostname,
    port: Number(target.port || 443),
    path: screenPolicyPath(remoteTargetPath(target, requestedPath), policy === "control"),
    interactive: policy === "control",
    upstreamHeaders: opened.upstreamHeaders,
  };
}

function resolveLocalTarget(match: RegExpMatchArray, secret: string, now: number) {
  const hostname = Buffer.from(match[1]!, "base64url").toString("utf8");
  const port = Number(match[2]);
  const policy = match[3]! as "view" | "control";
  const expiresAt = Number(match[4]);
  const signature = match[5]!;
  const requestedPath = `${match[6] || "/"}${match[7] || ""}`;
  if (!isAllowedTargetName(hostname)) return null;
  if (!Number.isInteger(port) || port < 1024 || port > 65_535 || expiresAt < now) return null;
  const expected = createHmac("sha256", secret)
    .update(`${hostname}:${port}:${policy}:${expiresAt}`)
    .digest("base64url");
  const suppliedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    return null;
  }
  return {
    protocol: "http:",
    hostname,
    port,
    path: screenPolicyPath(requestedPath, policy === "control"),
    interactive: policy === "control",
  };
}

export function screenPolicyPath(requestedPath: string, interactive: boolean) {
  const parsed = new URL(requestedPath, "http://screen.invalid");
  if (parsed.pathname === "/embed.html" || parsed.pathname === "/vnc.html") {
    parsed.searchParams.set("view_only", interactive ? "false" : "true");
  }
  return `${parsed.pathname}${parsed.search}`;
}

function remoteTargetPath(target: URL, requestedPath: string) {
  const requested = new URL(requestedPath, "https://screen.invalid");
  const path = requested.pathname || target.pathname || "/";
  if (path === target.pathname || path === "/websockify") {
    return `${path}${target.search}`;
  }
  return `${path}${requested.search}`;
}

function openScreenTarget(
  token: string,
  secret: string,
  policy: "view" | "control",
  expiresAt: number,
) {
  try {
    const sealed = Buffer.from(token, "base64url");
    if (sealed.length <= 28) return null;
    const decipher = createDecipheriv(
      SCREEN_PROXY_CIPHER,
      screenProxyKey(secret),
      sealed.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from(`${policy}:${expiresAt}`));
    decipher.setAuthTag(sealed.subarray(12, 28));
    const payload = JSON.parse(
      Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]).toString("utf8"),
    );
    // Earlier capabilities could point at globally interactive provider ports.
    // Require this version so a deployment invalidates those legacy capabilities.
    if (payload?.version !== 1 || typeof payload.url !== "string") return null;
    const target = new URL(payload.url);
    if (!target.hostname || target.protocol !== "https:" || target.username || target.password)
      return null;
    return { url: target, upstreamHeaders: validatedUpstreamHeaders(payload.upstreamHeaders) };
  } catch {
    return null;
  }
}

function validatedUpstreamHeaders(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid screen headers");
  const entries = Object.entries(value);
  if (entries.length > 16) throw new Error("Too many screen headers");
  return Object.fromEntries(
    entries.map(([name, content]) => {
      const key = name.toLowerCase();
      if (
        RESERVED_UPSTREAM_HEADERS.has(key) ||
        key.startsWith("sec-") ||
        typeof content !== "string" ||
        content.length > 4096
      ) {
        throw new Error("Invalid screen header");
      }
      validateHeaderName(key);
      validateHeaderValue(key, content);
      return [key, content];
    }),
  );
}

function isAllowedTargetName(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    /^10\.(?:\d{1,3}\.){2}\d{1,3}$/.test(hostname) ||
    /^172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3})\.\d{1,3}$/.test(hostname) ||
    /^192\.168\.(?:\d{1,3})\.\d{1,3}$/.test(hostname) ||
    /^rakazo-bot-[a-zA-Z0-9_.-]+$/.test(hostname)
  );
}

export function safeProxyHeaders(headers: IncomingHttpHeaders) {
  return Object.fromEntries(
    Object.entries(headers).filter(([key, value]) => {
      return value != null && ALLOWED_FORWARD_HEADERS.has(key.toLowerCase());
    }),
  );
}

export function proxyUpstreamHost(target: { hostname: string; port: number; protocol: string }) {
  const defaultPort = target.protocol === "https:" ? 443 : 80;
  return target.port === defaultPort ? target.hostname : `${target.hostname}:${target.port}`;
}

/** Sandboxed noVNC iframes send Origin: null; upstream desktops often reject that. */
export function proxyUpstreamRequestHeaders(
  headers: IncomingHttpHeaders,
  target: {
    hostname: string;
    port: number;
    protocol: string;
    upstreamHeaders?: Readonly<Record<string, string>>;
  },
) {
  const host = proxyUpstreamHost(target);
  return {
    ...safeProxyHeaders(headers),
    ...validatedUpstreamHeaders(target.upstreamHeaders),
    host,
    origin: `${target.protocol}//${host}`,
  };
}

export function safeProxyResponseHeaders(
  headers: IncomingHttpHeaders,
  upstreamHeaders: Readonly<Record<string, string>> = {},
) {
  const sensitive = new Set([
    ...SENSITIVE_RESPONSE_HEADERS,
    ...Object.keys(upstreamHeaders).map((key) => key.toLowerCase()),
  ]);
  return Object.fromEntries(
    Object.entries(headers).filter(([key, value]) => {
      return value != null && !sensitive.has(key.toLowerCase());
    }),
  );
}

export function stripSensitiveHandshakeHeaders(
  response: Buffer,
  upstreamHeaders: Readonly<Record<string, string>> = {},
) {
  const sensitive = new Set([
    ...SENSITIVE_RESPONSE_HEADERS,
    ...Object.keys(upstreamHeaders).map((key) => key.toLowerCase()),
  ]);
  const end = response.indexOf("\r\n\r\n");
  if (end < 0) return null;
  const lines = response.subarray(0, end).toString("latin1").split("\r\n");
  const safeLines = lines.filter((line, index) => {
    if (index === 0) return true;
    const separator = line.indexOf(":");
    const name = separator < 0 ? line : line.slice(0, separator);
    return !sensitive.has(name.trim().toLowerCase());
  });
  return Buffer.concat([
    Buffer.from(`${safeLines.join("\r\n")}\r\n\r\n`, "latin1"),
    response.subarray(end + 4),
  ]);
}
