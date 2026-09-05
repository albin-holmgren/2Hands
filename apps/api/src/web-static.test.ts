import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  acceptsHtmlNavigation,
  resolveServeWeb,
  webDistRoot,
  webStaticCandidates,
  webStaticResponse,
} from "./web-static.js";

const origin = "https://2hands-computers.fly.dev";

describe("resolveServeWeb", () => {
  it("stays off for local Vite so :5173 / :3100 keep their split", () => {
    expect(resolveServeWeb({ NODE_ENV: "development" })).toBe(false);
    expect(resolveServeWeb({ NODE_ENV: "test" })).toBe(false);
    expect(resolveServeWeb({ NODE_ENV: "production" })).toBe(false);
  });

  it("turns on for Fly production or an explicit flag", () => {
    expect(resolveServeWeb({ NODE_ENV: "production", FLY_APP_NAME: "2hands-computers" })).toBe(
      true,
    );
    expect(resolveServeWeb({ NODE_ENV: "development", SERVE_WEB: "1" })).toBe(true);
    expect(
      resolveServeWeb({
        NODE_ENV: "production",
        FLY_APP_NAME: "2hands-computers",
        SERVE_WEB: "0",
      }),
    ).toBe(false);
  });
});

describe("web static", () => {
  let root = "";

  afterEach(async () => {
    if (root) await rm(root, { force: true, recursive: true });
    root = "";
  });

  async function dist(files: Record<string, string>) {
    root = await mkdtemp(path.join(os.tmpdir(), "rakazo-web-static-"));
    for (const [relative, contents] of Object.entries(files)) {
      const file = path.join(root, relative);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, contents);
    }
    return root;
  }

  it("requires index.html before serving", async () => {
    const empty = await mkdtemp(path.join(os.tmpdir(), "rakazo-web-empty-"));
    expect(webDistRoot(empty)).toBeUndefined();
    await rm(empty, { force: true, recursive: true });
    const built = await dist({ "index.html": "<html>app</html>" });
    expect(webDistRoot(built)).toBe(built);
  });

  it("serves hashed assets and falls back to index.html for app routes", async () => {
    const built = await dist({
      "index.html": "<html>spa</html>",
      "assets/app-123.js": "console.log(1)",
    });
    expect(webStaticCandidates(built, `${origin}/assets/app-123.js`, false)).toEqual([
      path.join(built, "assets/app-123.js"),
    ]);
    expect(webStaticCandidates(built, `${origin}/sign-in`, true)).toEqual([
      path.join(built, "sign-in"),
      path.join(built, "index.html"),
    ]);
    expect(webStaticCandidates(built, `${origin}/app/bot-1`, true)).toEqual([
      path.join(built, "app/bot-1"),
      path.join(built, "index.html"),
    ]);
  });

  it("leaves APIs, RPC, health, and screen proxying alone", () => {
    for (const pathname of ["/api/auth/session", "/rpc/bots", "/novnc/socket", "/health"]) {
      expect(webStaticCandidates("/tmp/dist", `${origin}${pathname}`, true)).toBeNull();
    }
  });

  it("does not resolve traversal outside the web dist", () => {
    expect(webStaticCandidates("/tmp/dist", `${origin}/%2e%2e%2fsecret.txt`, false)).toBeNull();
    expect(webStaticCandidates("/tmp/dist", `${origin}/bad%00name.js`, false)).toBeNull();
  });

  it("treats browser and curl navigations as HTML, but not hashed assets", () => {
    expect(
      acceptsHtmlNavigation(new Request(`${origin}/sign-in`, { headers: { accept: "text/html" } })),
    ).toBe(true);
    expect(acceptsHtmlNavigation(new Request(`${origin}/sign-in`))).toBe(true);
    expect(acceptsHtmlNavigation(new Request(`${origin}/assets/app-123.js`))).toBe(false);
  });

  it("returns the SPA document for /sign-in and 404s missing assets", async () => {
    const built = await dist({
      "index.html": "<html>spa</html>",
      "assets/app-123.js": "console.log(1)",
    });
    const signIn = await webStaticResponse(built, new Request(`${origin}/sign-in`));
    expect(signIn?.status).toBe(200);
    expect(signIn?.headers.get("content-type")).toContain("text/html");
    expect(await signIn?.text()).toBe("<html>spa</html>");

    const asset = await webStaticResponse(built, new Request(`${origin}/assets/app-123.js`));
    expect(asset?.headers.get("cache-control")).toContain("immutable");
    expect(await asset?.text()).toBe("console.log(1)");

    const missing = await webStaticResponse(built, new Request(`${origin}/assets/missing.js`));
    expect(missing).toBeNull();
  });
});
