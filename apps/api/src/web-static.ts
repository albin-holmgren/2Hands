import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import type { Hono } from "hono";

const PASSTHROUGH_PATHS = ["/api", "/rpc", "/novnc", "/health"];

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function defaultWebDist(): string {
  return fileURLToPath(new URL("../../../apps/web/dist", import.meta.url));
}

export function resolveServeWeb(source: NodeJS.ProcessEnv = process.env): boolean {
  const raw = source.SERVE_WEB?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  if (raw === "1" || raw === "true" || raw === "on") return true;
  return Boolean(source.FLY_APP_NAME?.trim()) && source.NODE_ENV === "production";
}

export function webDistRoot(explicit?: string): string | undefined {
  const root = explicit?.trim() || defaultWebDist();
  return existsSync(path.join(root, "index.html")) ? root : undefined;
}

export function webStaticCandidates(root: string, requestUrl: string, acceptsHtml: boolean) {
  const url = new URL(requestUrl, "http://web.invalid");
  if (PASSTHROUGH_PATHS.some((prefix) => matchesPrefix(url.pathname, prefix))) return null;

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (pathname.includes("\0")) return null;

  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const candidate = safeChild(root, requested);
  if (!candidate) return null;
  return acceptsHtml ? [candidate, path.join(root, "index.html")] : [candidate];
}

export function acceptsHtmlNavigation(request: Request): boolean {
  const pathname = new URL(request.url, "http://web.invalid").pathname;
  const accept = request.headers.get("accept");
  if (accept?.includes("text/html")) return true;
  const last = pathname === "/" ? "" : (pathname.split("/").pop() ?? "");
  const hasAssetExtension = last.includes(".");
  if (hasAssetExtension) return false;
  return !accept || accept.includes("*/*");
}

export async function webStaticResponse(root: string, request: Request): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const candidates = webStaticCandidates(root, request.url, acceptsHtmlNavigation(request));
  if (!candidates) return null;

  for (const file of candidates) {
    try {
      const info = await stat(file);
      if (!info.isFile()) continue;
      const headers = new Headers({
        "content-type": contentType(file),
        "cache-control": immutableAsset(file) ? "public, max-age=31536000, immutable" : "no-cache",
        "content-length": String(info.size),
      });
      if (request.method === "HEAD") return new Response(null, { status: 200, headers });
      const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
      return new Response(body, { status: 200, headers });
    } catch (error) {
      if (isMiss(error)) continue;
      throw error;
    }
  }
  return null;
}

export function mountWebStatic(app: Hono, root: string) {
  app.all("*", async (c, next) => {
    const response = await webStaticResponse(root, c.req.raw);
    if (response) return response;
    await next();
  });
}

function contentType(file: string) {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

function immutableAsset(file: string) {
  return path.basename(path.dirname(file)) === "assets";
}

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function safeChild(root: string, requested: string) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, requested);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return resolved;
}

function isMiss(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  return code === "ENOENT" || code === "EISDIR" || code === "ENOTDIR";
}
