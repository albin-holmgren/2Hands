import { describe, expect, it } from "vitest";
import {
  canonicalHostRedirect,
  publicRequestUrl,
  siblingWwwOrigin,
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
