import type { SandboxProvider } from "@rakazo/adapter-kit";
import { ensureOrganizationBilling, reserveUsage, settleUsage } from "@rakazo/db";
import { billingTestStore } from "@rakazo/db/testing/billing-store";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureComputerUsageCoverage,
  hostedComputerRate,
  releaseUnusedComputerUsage,
  settleComputerUsage,
  suspendComputerForBudget,
} from "./computer-usage.js";

const now = new Date("2026-09-04T12:00:00Z");
function fixture() {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("BILLING_ENABLED", "true");
  vi.stubEnv("HOSTED_COMPUTER_USD_PER_HOUR", "0.15");
  const store = billingTestStore();
  store.addComputer();
  store.state().computers.get("computer-1")!.state = "running";
  const stop = vi.fn(async () => undefined);
  const sandbox = {
    describe: () => ({ capabilities: { boundedLifetime: true } }),
    stop,
  } as unknown as SandboxProvider;
  return { ...store, sandbox, stop };
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("hosted computer usage", () => {
  it("releases unused new coverage without charging pre-dispatch elapsed time", async () => {
    const f = fixture();
    await ensureComputerUsageCoverage(f, "computer-1", now);
    await releaseUnusedComputerUsage(f.prisma, "computer-1", null, new Date(now.getTime() + 1000));
    expect(await ensureOrganizationBilling(f.prisma, "org-1", now)).toMatchObject({
      spentUsd: 0,
      reservedUsd: 0,
    });
    expect(f.state().computers.get("computer-1")?.billingReservationId).toBeNull();
  });

  it("retains an older uncertain reservation when a later attempt never dispatches", async () => {
    const f = fixture();
    await ensureComputerUsageCoverage(f, "computer-1", now);
    const previousId = f.state().computers.get("computer-1")!.billingReservationId!;
    await releaseUnusedComputerUsage(f.prisma, "computer-1", previousId);
    expect(f.state().computers.get("computer-1")?.billingReservationId).toBe(previousId);
    expect([...f.state().reservations.values()][0]?.status).toBe("reserved");
  });

  it("shares one prepaid coverage interval across simultaneous callers", async () => {
    const f = fixture();
    const [one, two] = await Promise.all([
      ensureComputerUsageCoverage(f, "computer-1", now),
      ensureComputerUsageCoverage(f, "computer-1", now),
    ]);
    expect(one).toBe("2026-09-04T12:05:00.000Z");
    expect(two).toBe(one);
    expect(f.state().reservations.size).toBe(1);
    expect(await ensureOrganizationBilling(f.prisma, "org-1", now)).toMatchObject({
      reservedUsd: 0.0125,
    });
  });

  it("enforces concurrent machines and settles confirmed stopped time once", async () => {
    const f = fixture();
    f.addComputer("computer-2");
    f.state().computers.get("computer-2")!.state = "booting";
    await ensureComputerUsageCoverage(f, "computer-1", now);
    await expect(ensureComputerUsageCoverage(f, "computer-2", now)).rejects.toThrow(
      /parallel computer/,
    );
    await settleComputerUsage(f.prisma, "computer-1", new Date(now.getTime() + 60_000));
    await settleComputerUsage(f.prisma, "computer-1", new Date(now.getTime() + 60_000));
    expect(await ensureOrganizationBilling(f.prisma, "org-1", now)).toMatchObject({
      spentUsd: 0.0025,
      reservedUsd: 0,
    });
    await expect(ensureComputerUsageCoverage(f, "computer-2", now)).resolves.toBeTruthy();
  });

  it("renews shared coverage atomically without double-counting the old interval", async () => {
    const f = fixture();
    await ensureComputerUsageCoverage(f, "computer-1", now);
    const renewal = new Date(now.getTime() + 280_000);
    await ensureComputerUsageCoverage(f, "computer-1", renewal);
    expect(f.state().reservations.size).toBe(2);
    expect(await ensureOrganizationBilling(f.prisma, "org-1", now)).toMatchObject({
      spentUsd: 0.011667,
      reservedUsd: 0.0125,
    });
  });

  it("does not extend the provider lifetime after usage exhaustion", async () => {
    const f = fixture();
    const usage = await reserveUsage(f.prisma, {
      organizationId: "org-1",
      spaceId: "space-1",
      userId: "user-1",
      operationKey: "spent",
      amountUsd: 1,
      kind: "ai",
      funding: "hosted",
      now,
    });
    await settleUsage(f.prisma, { reservationId: usage.id, actualAmountUsd: 1 });
    await expect(ensureComputerUsageCoverage(f, "computer-1", now)).rejects.toThrow(/used up/);
    expect(f.state().computers.get("computer-1")?.billingCoveredUntil).toBeNull();
  });

  it("retains coverage reservation when the stop outcome is unknown", async () => {
    const f = fixture();
    f.state().computers.get("computer-1")!.providerRef = "box-example";
    await ensureComputerUsageCoverage(f, "computer-1", now);
    f.stop.mockRejectedValue(new Error("unknown"));
    await expect(suspendComputerForBudget(f, "computer-1")).rejects.toThrow("unknown");
    expect(f.state().computers.get("computer-1")?.billingReservationId).toBeTruthy();
    expect([...f.state().reservations.values()][0]?.status).toBe("reserved");
  });

  it("retains an unknown provision without a provider handle until its hard deadline", async () => {
    const f = fixture();
    await ensureComputerUsageCoverage(f, "computer-1", now);
    await expect(suspendComputerForBudget(f, "computer-1")).rejects.toThrow(/outcome is unknown/);
    expect([...f.state().reservations.values()][0]?.status).toBe("reserved");
    vi.setSystemTime(new Date(now.getTime() + 300_000));
    await suspendComputerForBudget(f, "computer-1");
    expect(f.stop).not.toHaveBeenCalled();
    expect(await ensureOrganizationBilling(f.prisma, "org-1", now)).toMatchObject({
      spentUsd: 0.0125,
      reservedUsd: 0,
    });
  });

  it("requires configured prices and a provider-enforced lifetime", async () => {
    vi.stubEnv("HOSTED_COMPUTER_USD_PER_HOUR", "");
    for (const rate of [undefined, "0", "NaN", "-1"])
      expect(() => hostedComputerRate(rate)).toThrow();
    const f = fixture();
    const unsupported = { describe: () => ({ capabilities: {} }) } as unknown as SandboxProvider;
    await expect(
      ensureComputerUsageCoverage({ ...f, sandbox: unsupported }, "computer-1", now),
    ).rejects.toThrow(/cannot enforce/);
  });

  it("does not stop or settle newer coverage after reading a stale expiry snapshot", async () => {
    const f = fixture();
    f.state().computers.get("computer-1")!.providerRef = "old-box";
    await ensureComputerUsageCoverage(f, "computer-1", now);
    vi.setSystemTime(new Date(now.getTime() + 300_001));
    let resume!: () => void;
    let observed!: () => void;
    const snapshot = new Promise<void>((resolve) => {
      observed = resolve;
    });
    const barrier = new Promise<void>((resolve) => {
      resume = resolve;
    });
    vi.spyOn(f.prisma.space, "findUniqueOrThrow").mockImplementationOnce((async () => {
      observed();
      await barrier;
      return { organizationId: "org-1" } as never;
    }) as never);
    const expiry = suspendComputerForBudget(f, "computer-1");
    await snapshot;
    await ensureComputerUsageCoverage(f, "computer-1");
    const current = f.state().computers.get("computer-1")!;
    current.providerRef = "new-box";
    current.executionFence += 1;
    const reservation = current.billingReservationId;
    resume();
    await expiry;
    expect(f.stop).not.toHaveBeenCalled();
    expect(f.state().computers.get("computer-1")).toMatchObject({
      state: "running",
      providerRef: "new-box",
      billingReservationId: reservation,
    });
    expect(await ensureOrganizationBilling(f.prisma, "org-1")).toMatchObject({
      spentUsd: 0.0125,
      reservedUsd: 0.0125,
    });
  });

  it("keeps the reservation through stop and rejects a heartbeat queued behind suspension", async () => {
    const f = fixture();
    f.state().computers.get("computer-1")!.providerRef = "old-box";
    await ensureComputerUsageCoverage(f, "computer-1", now);
    vi.setSystemTime(new Date(now.getTime() + 300_001));
    let resume!: () => void;
    let stopping!: () => void;
    const started = new Promise<void>((resolve) => {
      stopping = resolve;
    });
    f.stop.mockImplementation(async () => {
      stopping();
      await new Promise<void>((resolve) => {
        resume = resolve;
      });
    });
    const expiry = suspendComputerForBudget(f, "computer-1");
    await started;
    expect(f.state().computers.get("computer-1")!.state).toBe("suspending");
    expect([...f.state().reservations.values()][0]!.status).toBe("reserved");
    const heartbeat = expect(ensureComputerUsageCoverage(f, "computer-1")).rejects.toThrow(
      "Start the computer",
    );
    resume();
    await Promise.all([expiry, heartbeat]);
    expect(f.state().computers.get("computer-1")).toMatchObject({
      state: "suspended",
      billingReservationId: null,
    });
    expect(f.state().reservations.size).toBe(1);
    expect(await ensureOrganizationBilling(f.prisma, "org-1")).toMatchObject({
      spentUsd: 0.0125,
      reservedUsd: 0,
    });
  });
});
