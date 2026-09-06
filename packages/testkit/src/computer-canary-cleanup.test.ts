import { describe, expect, it, vi } from "vitest";
import { cleanupComputerCanary } from "./computer-canary-cleanup.js";

describe("computer release gate cleanup", () => {
  it("stops execution before destroying the machine", async () => {
    const order: string[] = [];
    await cleanupComputerCanary({
      stopApp: async () => {
        order.push("stop");
      },
      destroyComputer: async () => {
        order.push("destroy");
      },
    });
    expect(order).toEqual(["stop", "destroy"]);
  });

  it("still destroys the machine after shutdown fails and fails the gate", async () => {
    const shutdownError = new Error("Shutdown failed");
    const destroyComputer = vi.fn(async () => undefined);
    await expect(
      cleanupComputerCanary({
        stopApp: async () => {
          throw shutdownError;
        },
        destroyComputer,
      }),
    ).rejects.toMatchObject({ errors: [shutdownError] });
    expect(destroyComputer).toHaveBeenCalledOnce();
  });

  it("cannot report success when provider destruction is unconfirmed", async () => {
    await expect(
      cleanupComputerCanary({
        destroyComputer: async () => {
          throw new Error("Provider request timed out");
        },
      }),
    ).rejects.toThrow("Computer canary cleanup failed");
  });
});
