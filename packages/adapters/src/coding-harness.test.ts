import type { AdapterContext, ComputerRef, SandboxProvider } from "@rakazo/adapter-kit";
import { describe, expect, it, vi } from "vitest";
import { runCodingHarness } from "./coding-harness.js";

const context: AdapterContext = {
  operationId: "op",
  traceId: "trace",
  spaceId: "space",
  userId: "user",
  signal: new AbortController().signal,
};
const computer: ComputerRef = { id: "vm", botId: "bot", kind: "e2b", providerRef: "vm" };
function execution(code = 0) {
  const execute = vi.fn(async function* () {
    yield { type: "stdout" as const, data: "Updated app.ts" };
    yield { type: "exit" as const, code };
  });
  return { execute, sandbox: { execute } as unknown as SandboxProvider, context, computer };
}
describe("sandboxed coding agents", () => {
  it("requires a prompt and an isolated workspace", async () => {
    expect((await runCodingHarness({ harness: "codex", prompt: " " })).summary).toMatch(/prompt/);
    expect((await runCodingHarness({ harness: "codex", prompt: "Update app" })).code).toBe(
      "HARNESS_UNAVAILABLE",
    );
    const target = execution();
    const result = await runCodingHarness(
      { harness: "codex", prompt: "Update app", cwd: "bots/bot" },
      { ...target, computer: { ...computer, kind: "desktop" } },
    );
    expect(result.ok).toBe(false);
    expect(target.execute).not.toHaveBeenCalled();
  });
  it("passes literal arguments and only the selected user's compatible key to the sandbox", async () => {
    const target = execution();
    const prompt = "Fix `app.ts`; $(touch /tmp/never)";
    const result = await runCodingHarness(
      { harness: "codex", prompt, cwd: "bots/bot" },
      { ...target, credential: { provider: "openai", apiKey: "fake-user-key" } },
    );
    expect(result.ok).toBe(true);
    expect(target.execute).toHaveBeenCalledWith(
      computer,
      expect.objectContaining({
        argv: ["codex", "exec", "--skip-git-repo-check", prompt],
        cwd: "bots/bot",
        env: { OPENAI_API_KEY: "fake-user-key" },
        timeoutMs: 600000,
      }),
      expect.anything(),
    );
  });
  it("does not substitute a text response when a CLI is missing", async () => {
    const result = await runCodingHarness(
      { harness: "claude", prompt: "Update app", cwd: "bots/bot" },
      execution(127),
    );
    expect(result).toMatchObject({ ok: false, code: "HARNESS_UNAVAILABLE" });
  });
  it("never executes an already-canceled task", async () => {
    const target = execution();
    const controller = new AbortController();
    controller.abort();
    const result = await runCodingHarness(
      { harness: "claude", prompt: "Update app", cwd: "bots/bot" },
      { ...target, context: { ...context, signal: controller.signal } },
    );
    expect(result.code).toBe("CANCELED");
    expect(target.execute).not.toHaveBeenCalled();
  });
  it("refuses host execution when lazy provisioning changes the computer kind", async () => {
    const target = execution();
    target.computer = { ...computer, kind: "docker" };
    const result = await runCodingHarness(
      { harness: "codex", prompt: "Update app", cwd: "bots/bot" },
      {
        ...target,
        prepareComputer: async () => {
          target.computer.kind = "desktop";
        },
      },
    );
    expect(result).toMatchObject({ ok: false, code: "HARNESS_UNAVAILABLE" });
    expect(target.execute).not.toHaveBeenCalled();
  });
  it("does not dispatch if the request is canceled during computer preparation", async () => {
    const target = execution();
    const controller = new AbortController();
    const result = await runCodingHarness(
      { harness: "codex", prompt: "Update app", cwd: "bots/bot" },
      {
        ...target,
        context: { ...context, signal: controller.signal },
        prepareComputer: async () => controller.abort(),
      },
    );
    expect(result.code).toBe("CANCELED");
    expect(target.execute).not.toHaveBeenCalled();
  });
  it("keeps the admitted isolated reference when another operation updates the lazy computer", async () => {
    const sharedComputer = { ...computer, kind: "docker" as ComputerRef["kind"] };
    let dispatchedKind: ComputerRef["kind"] | undefined;
    const execute = vi.fn(async function* (prepared: ComputerRef) {
      // A concurrent operation can update the shared lazy reference after preparation.
      sharedComputer.kind = "desktop";
      dispatchedKind = prepared.kind;
      yield { type: "exit" as const, code: 0 };
    });
    const result = await runCodingHarness(
      { harness: "codex", prompt: "Update app", cwd: "bots/bot" },
      {
        sandbox: { execute } as unknown as SandboxProvider,
        computer: sharedComputer,
        context,
      },
    );
    expect(result.ok).toBe(true);
    expect(dispatchedKind).toBe("docker");
  });
});
