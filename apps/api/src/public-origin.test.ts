import { describe, expect, it } from "vitest";
import {
  canonicalHostRedirect,
  publicRequestUrl,
  siblingWwwOrigin,
  trustedAuthOrigins,
  trustedBrowserOrigins,
} from "./public-origin.js";

describe("public origin", () => {
  it("pairs apex and www for the same host", () => {
    expect(siblingWwwOrigin("https://2hands.ai")).toBe("https://www.2hands.ai");
    expect(siblingWwwOrigin("https://www.2hands.ai")).toBe("https://2hands.ai");
    expect(siblingWwwOrigin("http://127.0.0.1:5173")).toBeUndefined();
  });

  it("trusts apex, www, and the previous Fly origin", () => {
    expect(
      trustedBrowserOrigins({
        webOrigin: "https://2hands.ai",
        apiUrl: "https://2hands.ai",
        authUrl: "https://2hands.ai",
      }),
    ).toEqual(["https://2hands.ai", "https://www.2hands.ai", "https://2hands-computers.fly.dev"]);
  });

  it("redirects www to the canonical apex", () => {
    expect(canonicalHostRedirect("https://www.2hands.ai/sign-in?next=1", "https://2hands.ai")).toBe(
      "https://2hands.ai/sign-in?next=1",
    );
    expect(canonicalHostRedirect("https://2hands.ai/sign-in", "https://2hands.ai")).toBeUndefined();
    expect(
      canonicalHostRedirect("https://2hands-computers.fly.dev/sign-in", "https://2hands.ai"),
    ).toBeUndefined();
  });

  it("rebuilds the public URL from forwarded host headers", () => {
    expect(
      publicRequestUrl(
        new Request("http://127.0.0.1:3100/sign-in", {
          headers: { host: "www.2hands.ai", "x-forwarded-proto": "https" },
        }),
      ),
    ).toBe("https://www.2hands.ai/sign-in");
  });
});

describe("authentication runtime origins", () => {
  const config = {
    webOrigin: "https://workspace.example.test",
    apiUrl: "https://workspace.example.test",
    authUrl: "https://workspace.example.test",
  };
  it("keeps product protocols and configured origins while excluding development runtimes in production", () => {
    const origins = trustedAuthOrigins({ ...config, nodeEnv: "production" });
    expect(origins).toContain(config.webOrigin);
    expect(origins).toContain("2hands://");
    expect(origins).toContain("rakazo://");
    expect(origins).not.toContain("exp://*");
    expect(
      origins.some((origin) => origin.includes("localhost") || origin.includes("127.0.0.1")),
    ).toBe(false);
  });
  it("allows local native runtimes only in development/test", () => {
    for (const nodeEnv of ["development", "test"]) {
      expect(trustedAuthOrigins({ ...config, nodeEnv })).toContain("http://127.0.0.1:8081");
      expect(trustedAuthOrigins({ ...config, nodeEnv })).toContain("exp://*");
    }
  });
});

it("retains only explicitly configured previous web origins", () => {
  const env = {
    webOrigin: "https://app.example.test",
    apiUrl: "https://app.example.test",
    authUrl: "https://app.example.test",
    nodeEnv: "production",
  };
  expect(trustedAuthOrigins(env)).not.toContain("https://example.test");
  expect(
    trustedAuthOrigins({
      ...env,
      trustedWebOrigins: ["https://example.test", "https://www.example.test"],
    }),
  ).toEqual(expect.arrayContaining(["https://example.test", "https://www.example.test"]));
  expect(trustedAuthOrigins(env)).not.toContain("https://other.example.test");
});
