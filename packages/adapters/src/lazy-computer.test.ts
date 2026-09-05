import type { ComputerRef, SandboxProvider } from "@rakazo/adapter-kit";
import { describe, expect, it, vi } from "vitest";
import { lazyComputer } from "./lazy-computer.js";

const initial: ComputerRef = { id: "computer", botId: "bot", kind: "fake", providerRef: "pending" };
describe("lazy computer", () => {
  it("does not provision for descriptors or an untouched conversation", () => {
    const provision = vi.fn();
    const sandbox = { describe: () => ({ id: "fake" }) } as SandboxProvider;
    const deferred = lazyComputer(sandbox, initial, provision);
    expect(deferred.sandbox.describe().id).toBe("fake");
    expect(deferred.isReady()).toBe(false);
    expect(provision).not.toHaveBeenCalled();
  });
  it("shares first allocation, uses the real reference, and renews before paid expiry", async () => {
    let allocations = 0;
    const provision = vi.fn(async () => ({
      ...initial,
      providerRef: `real-${++allocations}`,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    }));
    const readFile = vi.fn(async (ref: ComputerRef) => new TextEncoder().encode(ref.providerRef));
    const deferred = lazyComputer({ readFile } as unknown as SandboxProvider, initial, provision);
    const call = () => deferred.sandbox.readFile(deferred.computer, "file", {} as never);
    const values = await Promise.all([call(), call()]);
    expect(values.map((v) => new TextDecoder().decode(v))).toEqual(["real-1", "real-1"]);
    expect(provision).toHaveBeenCalledTimes(1);
    deferred.computer.expiresAt = new Date(Date.now() + 500).toISOString();
    expect(new TextDecoder().decode(await call())).toBe("real-2");
  });
  it("provisions when an execution iterator is consumed, never after failed admission", async () => {
    const execute = vi.fn();
    const provision = vi.fn(async () => {
      throw new Error("Allowance exhausted");
    });
    const deferred = lazyComputer({ execute } as unknown as SandboxProvider, initial, provision);
    const iterator = deferred.sandbox.execute(deferred.computer, { argv: ["pwd"] }, {} as never);
    expect(provision).not.toHaveBeenCalled();
    await expect(async () => {
      for await (const _event of iterator) {
        /* consume */
      }
    }).rejects.toThrow("Allowance exhausted");
    expect(execute).not.toHaveBeenCalled();
  });
});
