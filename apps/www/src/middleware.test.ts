import { describe, expect, it } from "vitest";
import middleware from "../middleware";

describe("marketing site middleware", () => {
  it.each([
    ["/health", "*/*"],
    ["/health", "application/json"],
    ["/health", "text/markdown"],
    ["/api/auth/capabilities", "*/*"],
    ["/rpc/health", "application/json"],
    ["/novnc/example/vnc.html", "*/*"],
  ])("passes %s (%s) through to the app routes", (pathname, accept) => {
    for (const method of ["GET", "HEAD"]) {
      const response = middleware(
        new Request(`https://2hands.ai${pathname}`, {
          method,
          headers: { accept },
        }),
      );
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("content-type")).toBeNull();
      expect(response.headers.get("vary")).toBeNull();
    }
  });

  it("negotiates Markdown on the canonical page URL", async () => {
    const response = middleware(
      new Request("https://2hands.ai/", {
        headers: { accept: "text/markdown,text/html;q=0.8" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8",
    );
    expect(response.headers.get("vary")).toBe("Accept, Accept-Encoding");
    await expect(response.text()).resolves.toContain("# 2hands");
  });

  it("gives generic agent fetches a recoverable Markdown 404", async () => {
    const response = middleware(
      new Request("https://2hands.ai/does-not-exist", {
        headers: { accept: "*/*" },
      }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8",
    );
    await expect(response.text()).resolves.toContain(
      "https://2hands.ai/sitemap-index.xml",
    );
  });

  it("returns 406 for representations the site does not provide", async () => {
    const response = middleware(
      new Request("https://2hands.ai/", {
        headers: { accept: "application/json" },
      }),
    );

    expect(response.status).toBe(406);
    expect(response.headers.get("vary")).toBe("Accept, Accept-Encoding");
    await expect(response.text()).resolves.toContain(
      "text/html or text/markdown",
    );
  });

  it("continues browser requests with negotiation-safe response headers", () => {
    const response = middleware(
      new Request("https://2hands.ai/", {
        headers: { accept: "text/html" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("vary")).toBe("Accept, Accept-Encoding");
    expect(response.headers.get("link")).toContain("/index.md");
  });
});
