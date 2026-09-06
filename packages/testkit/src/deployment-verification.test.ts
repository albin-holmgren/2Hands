import { describe, expect, it, vi } from "vitest";
import { verifyDeployment } from "../../../infra/fly/verify-deployment.mjs";

const revision = "a".repeat(40);
const health = {
  ok: true,
  revision,
  runtime: "pi",
  sandbox: "e2b",
  jobs: "graphile",
  realtime: "postgres",
  email: "smtp",
};
function transport(
  overrides: Record<string, unknown> = {},
  capabilities: unknown = { passwordReset: true, signupsEnabled: false },
) {
  return vi.fn(
    async (url: URL) =>
      new Response(
        url.pathname === "/health"
          ? JSON.stringify({ ...health, ...overrides })
          : url.pathname.endsWith("capabilities")
            ? JSON.stringify(capabilities)
            : '<html><div id="root"></div></html>',
      ),
  );
}

describe("deployed release verification", () => {
  it("verifies a controlled deployment without changing signup or creating an account", async () => {
    const request = transport();
    expect(
      await verifyDeployment({ origin: "https://example.test", revision, request }),
    ).toMatchObject({ ok: true, mode: "controlled" });
    expect(request).toHaveBeenCalledTimes(3);
    for (const call of request.mock.calls) expect(call[0].origin).toBe("https://example.test");
  });
  it.each([
    [{ revision: "b".repeat(40) }, "revision"],
    [{ runtime: "scripted" }, "runtime"],
    [{ sandbox: "none" }, "computer"],
    [{ jobs: "memory" }, "durability"],
    [{ email: null }, "email"],
  ])("rejects an incomplete production composition %j", async (overrides, failed) => {
    const report = await verifyDeployment({
      origin: "https://example.test",
      revision,
      request: transport(overrides as Record<string, unknown>),
    });
    expect(report.ok).toBe(false);
    expect(report.checks).toContainEqual(expect.objectContaining({ id: failed, passed: false }));
  });
  it("fails closed for the older capabilities endpoint and disabled recovery", async () => {
    const report = await verifyDeployment({
      origin: "https://example.test",
      revision,
      request: transport({}, { passwordReset: false }),
    });
    expect(
      report.checks
        .filter((item: { passed: boolean }) => !item.passed)
        .map((item: { id: string }) => item.id),
    ).toEqual(["password-recovery", "signup-policy"]);
  });
  it("requires an explicit open policy for the final public check", async () => {
    expect(
      (
        await verifyDeployment({
          origin: "https://example.test",
          revision,
          mode: "public",
          request: transport(),
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await verifyDeployment({
          origin: "https://example.test",
          revision,
          mode: "public",
          request: transport({}, { passwordReset: true, signupsEnabled: true }),
        })
      ).ok,
    ).toBe(true);
  });
  it("reports unavailable endpoints without printing response bodies or errors", async () => {
    const request = vi.fn().mockRejectedValue(new Error("private diagnostic"));
    const report = await verifyDeployment({ origin: "https://example.test", revision, request });
    expect(report.ok).toBe(false);
    expect(JSON.stringify(report)).not.toContain("private diagnostic");
  });
  it.each([
    "http://example.test",
    "https://secret@example.test",
    "https://example.test/?key=secret",
  ])("rejects unsafe origins before requesting %s", async (origin) => {
    const request = transport();
    await expect(verifyDeployment({ origin, revision, request })).rejects.toThrow(
      "canonical HTTPS",
    );
    expect(request).not.toHaveBeenCalled();
  });
  it("requires a full revision instead of treating a healthy old deployment as ready", async () => {
    await expect(
      verifyDeployment({ origin: "https://example.test", revision: "main", request: transport() }),
    ).rejects.toThrow("expected source revision");
  });
});
