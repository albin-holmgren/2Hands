import { describe, expect, it } from "vitest";
import {
  addScreenProxyCapability,
  proxyExternalScreen,
  proxyUpstreamHost,
  proxyUpstreamRequestHeaders,
  resolveNovncTarget,
  safeProxyResponseHeaders,
  stripSensitiveHandshakeHeaders,
} from "./screen-proxy.js";

describe("screen proxy capability", () => {
  it("signs loopback Docker screen URLs without changing their destination", () => {
    const result = new URL(
      addScreenProxyCapability(
        "http://127.0.0.1:49152/embed.html?view_only=true",
        "secret",
        "https://app.example",
        100,
      ),
    );
    expect(result.origin).toBe("https://app.example");
    expect(result.pathname).toMatch(
      /^\/novnc\/[\w-]+\/49152\/view\/3600100\.[\w-]{43}\/embed\.html$/,
    );
    expect(result.searchParams.get("view_only")).toBe("true");
  });

  it("does not modify managed-provider URLs", () => {
    const url = "https://sandbox.example/embed.html?token=provider-token";
    expect(addScreenProxyCapability(url, "secret", "https://app.example", 100)).toBe(url);
  });

  it("proxies E2B desktop URLs the same way as Box", () => {
    expect(proxyExternalScreen("e2b")).toBe(true);
    expect(proxyExternalScreen("box")).toBe(true);
    expect(proxyExternalScreen("daytona")).toBe(true);
    expect(proxyExternalScreen("docker")).toBe(false);
    const result = new URL(
      addScreenProxyCapability(
        "https://6080-desktop.e2b.app/vnc.html?view_only=true&authKey=secret",
        "secret",
        "https://app.example",
        100,
        { proxyExternal: true },
      ),
    );
    expect(result.origin).toBe("https://app.example");
    expect(result.pathname).toMatch(/^\/novnc\/remote\/view\/3600100\.[\w-]+\/vnc\.html$/);
    expect(result.toString()).not.toContain("authKey");
  });

  it("keeps external desktop secrets behind an encrypted, policy-bound capability", () => {
    const result = new URL(
      addScreenProxyCapability(
        "https://box.example/vnc.html?token=provider-token&view_only=true",
        "secret",
        "https://app.example",
        100,
        { proxyExternal: true },
      ),
    );
    expect(result.origin).toBe("https://app.example");
    expect(result.pathname).toMatch(/^\/novnc\/remote\/view\/3600100\.[\w-]+\/vnc\.html$/);
    expect(result.toString()).not.toContain("provider-token");
  });

  it("omits default ports from upstream Host headers", () => {
    expect(
      proxyUpstreamHost({ hostname: "6080-desktop.e2b.app", port: 443, protocol: "https:" }),
    ).toBe("6080-desktop.e2b.app");
    expect(proxyUpstreamHost({ hostname: "127.0.0.1", port: 6080, protocol: "http:" })).toBe(
      "127.0.0.1:6080",
    );
  });

  it("seals provider credentials for both HTTP and WebSocket requests", () => {
    const upstreamHeaders = { "screen-access-token": "provider-private-token" };
    const result = new URL(
      addScreenProxyCapability(
        "https://desktop.example/vnc.html?password=view-pass&view_only=true",
        "secret",
        "https://app.example",
        100,
        { proxyExternal: true, upstreamHeaders },
      ),
    );
    expect(result.toString()).not.toContain("provider-private-token");
    expect(result.searchParams.get("password")).toBe("view-pass");
    expect(result.searchParams.get("view_only")).toBe("true");
    for (const path of [
      result.pathname + result.search,
      result.pathname.replace("vnc.html", "websockify"),
    ]) {
      const target = resolveNovncTarget(path, "secret", 101)!;
      expect(target.upstreamHeaders).toEqual(upstreamHeaders);
      expect(
        proxyUpstreamRequestHeaders(
          {
            authorization: "Bearer app-session",
            cookie: "session=app-session",
            "screen-access-token": "attacker-token",
            "x-forwarded-host": "attacker.example",
            referer: result.toString(),
            upgrade: "websocket",
            "sec-websocket-key": "client-key",
          },
          target,
        ),
      ).toEqual({
        ...upstreamHeaders,
        upgrade: "websocket",
        "sec-websocket-key": "client-key",
        host: "desktop.example",
        origin: "https://desktop.example",
      });
      expect(resolveNovncTarget(path.replace("/view/", "/control/"), "secret", 101)).toBeNull();
    }
  });

  it("does not echo provider authentication headers back to a browser", () => {
    const upstreamHeaders = { "screen-access-token": "provider-private-token" };
    expect(
      safeProxyResponseHeaders(
        {
          "screen-access-token": "provider-private-token",
          "content-type": "text/html",
        },
        upstreamHeaders,
      ),
    ).toEqual({ "content-type": "text/html" });
    const handshake = Buffer.from(
      "HTTP/1.1 101 Switching Protocols\r\nScreen-Access-Token: provider-private-token\r\nUpgrade: websocket\r\n\r\nframe",
    );
    expect(stripSensitiveHandshakeHeaders(handshake, upstreamHeaders)?.toString()).toBe(
      "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n\r\nframe",
    );
  });

  it("invalidates legacy encrypted targets that could point to unsafe provider streams", () => {
    const iv = Buffer.alloc(12, 1);
    const cipher = createCipheriv(
      "aes-256-gcm",
      createHash("sha256").update("secret").digest(),
      iv,
    );
    cipher.setAAD(Buffer.from("view:2000"));
    const ciphertext = Buffer.concat([
      cipher.update("https://desktop.example/vnc.html"),
      cipher.final(),
    ]);
    const token = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
    expect(
      resolveNovncTarget(`/novnc/remote/view/2000.${token}/vnc.html`, "secret", 100),
    ).toBeNull();
  });

  it.each([
    { host: "other.example" },
    { origin: "https://other.example" },
    { "content-length": "42" },
    { "screen-token": "secret\r\nInjected: header" },
  ])(
    "fails closed instead of returning a direct provider URL for unsafe headers %j",
    (upstreamHeaders) => {
      expect(() =>
        addScreenProxyCapability(
          "https://desktop.example/vnc.html",
          "secret",
          "https://app.example",
          100,
          { proxyExternal: true, upstreamHeaders },
        ),
      ).toThrow("secure computer viewer");
    },
  );
});

import { createCipheriv, createHash } from "node:crypto";
