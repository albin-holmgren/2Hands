import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { JobPublisher } from "@rakazo/adapter-kit";
import type { PrismaClient, ThreadEvents } from "@rakazo/db";
import { billingTestStore } from "@rakazo/db/testing/billing-store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { provisionComputer, replaceComputer } from "./computer-lifecycle.js";
import { checkpointComputerWorkspace } from "./computer-workspace.js";
import { FakeSandboxProvider } from "./fake-sandbox.js";
import { LocalAgentHomeStore } from "./home.js";

const context = {
  operationId: "recovery-test",
  traceId: "recovery-test",
  spaceId: "space-test",
  userId: "user-test",
  botId: "bot-1",
  signal: new AbortController().signal,
};
afterEach(() => vi.unstubAllEnvs());

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "computer-reconnect-"));
  const home = new LocalAgentHomeStore(path.join(dir, "home"));
  const sandbox = new FakeSandboxProvider();
  const first = await sandbox.provision({ botId: "shared-home", homePath: dir }, context);
  await sandbox.writeFile(
    first,
    { path: "bots/bot-1/notes.txt", content: Buffer.from("durable-checkpoint") },
    context,
  );
  await checkpointComputerWorkspace(home, sandbox, "shared-home", first, context);
  const record = {
    id: "computer-1",
    homeKey: "shared-home",
    scope: "team",
    kind: "fake",
    providerRef: first.providerRef,
    state: "running",
    executionFence: 0,
    controlLeaseId: null,
    billingReservationId: null,
    userId: context.userId,
    spaceId: context.spaceId,
  };
  const prisma = {
    computer: {
      findUniqueOrThrow: vi.fn(async () => ({ ...record })),
      updateMany: vi.fn(async ({ where, data }) => {
        if (
          where.state &&
          (typeof where.state === "string"
            ? record.state !== where.state
            : where.state.in && !where.state.in.includes(record.state))
        )
          return { count: 0 };
        for (const key of ["providerRef", "kind", "executionFence"] as const)
          if (where[key] !== undefined && where[key] !== record[key]) return { count: 0 };
        Object.assign(record, data);
        return { count: 1 };
      }),
      update: vi.fn(async ({ data }) => Object.assign(record, data)),
    },
    bot: { findFirst: vi.fn(async () => ({ id: context.botId })) },
    run: { findFirst: vi.fn(async () => null) },
  } as unknown as PrismaClient;
  const deps = {
    prisma,
    sandbox,
    home,
    jobs: {} as JobPublisher,
    events: {} as ThreadEvents,
    dataDir: dir,
  };
  return { deps, record, first, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

describe("computer reconnect recovery", () => {
  it("restores a missing Team computer once when two bots reconnect together", async () => {
    const { deps, record, first, cleanup } = await fixture();
    try {
      await deps.sandbox.destroy(first, context);
      const original = deps.sandbox.provision.bind(deps.sandbox);
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const provision = vi.spyOn(deps.sandbox, "provision").mockImplementation(async (...args) => {
        await barrier;
        return original(...args);
      });
      const firstBoot = provisionComputer(deps, record.id, context);
      await vi.waitFor(() => expect(provision).toHaveBeenCalledOnce());
      const secondBoot = provisionComputer(deps, record.id, { ...context, botId: "bot-2" });
      release();
      const [one, two] = await Promise.all([firstBoot, secondBoot]);
      expect(provision).toHaveBeenCalledOnce();
      expect(one.providerRef).toBe(two.providerRef);
      expect(
        Buffer.from(await deps.sandbox.readFile(two, "bots/bot-1/notes.txt", context)).toString(),
      ).toBe("durable-checkpoint");
      expect(record).toMatchObject({ state: "running", executionFence: 1 });
    } finally {
      await cleanup();
    }
  });

  it("rejects a bot archived while it waits for another boot", async () => {
    const { deps, record, cleanup } = await fixture();
    try {
      vi.mocked(deps.prisma.computer.findUniqueOrThrow).mockResolvedValueOnce({
        ...record,
        state: "booting",
      } as never);
      vi.mocked(deps.prisma.bot.findFirst).mockResolvedValue(null);
      const provision = vi.spyOn(deps.sandbox, "provision");
      await expect(provisionComputer(deps, record.id, context)).rejects.toThrow("Computer is busy");
      expect(provision).not.toHaveBeenCalled();
      expect(deps.prisma.bot.findFirst).toHaveBeenCalledWith({
        where: { id: context.botId, computerId: record.id, archivedAt: null },
        select: { id: true },
      });
    } finally {
      await cleanup();
    }
  });

  it("destroys an incomplete replacement and retries from the intact checkpoint", async () => {
    const { deps, record, first, cleanup } = await fixture();
    try {
      await deps.sandbox.destroy(first, context);
      const imported = vi
        .spyOn(deps.sandbox, "importWorkspace")
        .mockRejectedValueOnce(new Error("transfer failed"));
      const destroyed = vi.spyOn(deps.sandbox, "destroy");
      await expect(provisionComputer(deps, record.id, context)).rejects.toThrow("transfer failed");
      expect(record.state).toBe("error");
      expect(destroyed).toHaveBeenCalledOnce();
      expect(deps.sandbox.boxes.size).toBe(0);
      imported.mockRestore();
      const ready = await provisionComputer(deps, record.id, context);
      expect(
        Buffer.from(await deps.sandbox.readFile(ready, "bots/bot-1/notes.txt", context)).toString(),
      ).toBe("durable-checkpoint");
    } finally {
      await cleanup();
    }
  });

  it("cannot activate or pause a newer boot when a stopped older boot finishes late", async () => {
    const { deps, record, cleanup } = await fixture();
    try {
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const prepare = vi.spyOn(deps.sandbox, "prepare").mockImplementationOnce(async () => barrier);
      const stopped = vi.spyOn(deps.sandbox, "stop");
      const oldBoot = provisionComputer(deps, record.id, context);
      const oldOutcome = expect(oldBoot).rejects.toThrow("Computer is busy");
      await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce());
      record.state = "stopped";
      const newer = await provisionComputer(deps, record.id, context);
      release();
      await oldOutcome;
      expect(record).toMatchObject({
        state: "running",
        executionFence: 2,
        providerRef: newer.providerRef,
      });
      expect(stopped).not.toHaveBeenCalled();
    } finally {
      await cleanup();
    }
  });

  it("suspends a running computer when prepaid coverage cannot be acquired", async () => {
    const { deps, record, cleanup } = await fixture();
    try {
      vi.stubEnv("BILLING_ENABLED", "true");
      const billing = billingTestStore();
      const computer = deps.prisma.computer;
      Object.assign(deps.prisma, {
        space: billing.prisma.space,
        $transaction: (operation: (tx: unknown) => Promise<unknown>) =>
          billing.prisma.$transaction(async (tx) => operation({ ...tx, computer })),
      });
      const stopped = vi.spyOn(deps.sandbox, "stop");
      const provision = vi.spyOn(deps.sandbox, "provision");
      await expect(provisionComputer(deps, record.id, context)).rejects.toThrow(
        "cannot enforce hosted usage limits",
      );
      expect(stopped).toHaveBeenCalledOnce();
      expect(provision).not.toHaveBeenCalled();
      expect(record.state).toBe("suspended");
    } finally {
      await cleanup();
    }
  });

  it("does not dispatch another create while the prior prepaid creation is unknown", async () => {
    const { deps, record, cleanup } = await fixture();
    try {
      Object.assign(record, {
        state: "stopped",
        providerRef: null,
        billingReservationId: "pending-hold",
        billingCoveredUntil: new Date(Date.now() + 60_000),
      });
      const provision = vi.spyOn(deps.sandbox, "provision");
      await expect(provisionComputer(deps, record.id, context)).rejects.toThrow("Computer is busy");
      expect(provision).not.toHaveBeenCalled();
      expect(deps.prisma.computer.updateMany).not.toHaveBeenCalled();
    } finally {
      await cleanup();
    }
  });

  it("keeps an unknown replacement creation fenced even when the old reference is present", async () => {
    const { deps, record, first, cleanup } = await fixture();
    try {
      await deps.sandbox.destroy(first, context);
      const provision = vi.spyOn(deps.sandbox, "provision").mockImplementation(async () => {
        Object.assign(record, {
          billingReservationId: "unknown-replacement-hold",
          billingCoveredUntil: new Date(Date.now() + 60_000),
        });
        throw new Error("create response lost");
      });
      await expect(provisionComputer(deps, record.id, context)).rejects.toThrow(
        "create response lost",
      );
      expect(record).toMatchObject({ state: "booting", providerRef: first.providerRef });
      await expect(replaceComputer(deps, record.id, "recover", context)).rejects.toThrow(
        "Computer is busy",
      );
      await expect(provisionComputer(deps, record.id, context)).rejects.toThrow("Computer is busy");
      expect(provision).toHaveBeenCalledOnce();
      expect(record).toMatchObject({
        billingReservationId: "unknown-replacement-hold",
        providerRef: first.providerRef,
      });
    } finally {
      await cleanup();
    }
  });

  it("retains a recoverable provider reference when its destruction is uncertain", async () => {
    const { deps, record, first, cleanup } = await fixture();
    try {
      vi.spyOn(deps.sandbox, "destroy").mockRejectedValue(new Error("fetch failed"));
      const provision = vi.spyOn(deps.sandbox, "provision");
      await expect(replaceComputer(deps, record.id, "recover", context)).rejects.toThrow(
        "fetch failed",
      );
      expect(record.providerRef).toBe(first.providerRef);
      expect(provision).not.toHaveBeenCalled();
      expect(deps.sandbox.boxes.size).toBe(1);
    } finally {
      await cleanup();
    }
  });
});
