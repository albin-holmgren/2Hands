import { describe, expect, it, vi } from "vitest";
import { createRunExecutor } from "./executor.js";

const leases = vi.hoisted(() => ({
  acquireComputerExecutionLease: vi.fn(async () => ({ id: "computer-lease" })),
  releaseComputerExecutionLease: vi.fn(async () => {}),
}));
vi.mock("./computer-lifecycle.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ...leases,
}));

describe("run model snapshot fence", () => {
  it("requeues a claim that completes after shutdown without dispatching or changing its model", async () => {
    let releaseClaim!: () => void;
    let claimed!: () => void;
    const started = new Promise<void>((resolve) => {
      claimed = resolve;
    });
    const claim = new Promise<void>((resolve) => {
      releaseClaim = resolve;
    });
    const updateMany = vi
      .fn()
      .mockImplementationOnce(async () => {
        claimed();
        await claim;
        return { count: 1 };
      })
      .mockResolvedValue({ count: 1 });
    const runtime = { abort: vi.fn(async () => {}), run: vi.fn() };
    const prisma = {
      run: {
        findUnique: vi.fn(async () => ({
          id: "run",
          status: "queued",
          leaseFence: 4,
          checkpoint: "takeover",
        })),
        updateMany,
      },
    };
    const executor = createRunExecutor({ prisma, runtime, web: {} } as never);
    const running = executor.continueRun("run", "worker");
    await started;
    await executor.shutdown();
    releaseClaim();
    await running;
    expect(runtime.abort).toHaveBeenCalledWith("run");
    expect(runtime.run).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenLastCalledWith({
      where: {
        id: "run",
        status: { in: ["leased", "running"] },
        leaseOwner: "worker",
        leaseFence: 5,
      },
      data: {
        status: "queued",
        error: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        checkpoint: "takeover",
      },
    });
    await executor.continueRun("next-run", "worker");
    expect(prisma.run.findUnique).toHaveBeenCalledOnce();
  });

  it("does not dispatch or provision after losing the lease before saving model selection", async () => {
    const run = {
      id: "run",
      status: "queued",
      leaseFence: 0,
      botId: "bot",
      threadId: "thread",
      taskId: "task",
      userId: "user",
      spaceId: "space",
      trigger: "user",
      modelProvider: "local",
      modelId: "chosen",
      modelFunding: "hosted",
      modelThinkingLevel: null,
    };
    const updateRun = vi.fn().mockResolvedValue({ count: 1 });
    updateRun
      .mockResolvedValueOnce({ count: 1 }) // Claim lease.
      .mockResolvedValueOnce({ count: 1 }) // Start attempt.
      .mockResolvedValueOnce({ count: 0 }); // Another worker now owns the fence.
    const prisma = {
      run: {
        findUnique: vi.fn(async () => run),
        findUniqueOrThrow: vi.fn(async () => ({ ...run, status: "leased" })),
        updateMany: updateRun,
      },
      bot: {
        findUniqueOrThrow: vi.fn(async () => ({ id: "bot", computerId: "computer" })),
      },
      attempt: {
        create: vi.fn(async () => ({ id: "attempt" })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      thread: { findUniqueOrThrow: vi.fn(async () => ({ id: "thread" })) },
      task: { findUniqueOrThrow: vi.fn(async () => ({ prompt: "Hello" })) },
      message: { findMany: vi.fn(async () => []) },
      connection: { findMany: vi.fn(async () => []) },
      spaceModelPreference: { findFirst: vi.fn(async () => null) },
      userModelCredential: { findFirst: vi.fn(async () => null) },
      deploymentSettings: { findUnique: vi.fn(async () => null) },
      taughtSkill: { findMany: vi.fn(async () => []) },
      agentSkill: { findMany: vi.fn(async () => []) },
    };
    const runtime = { run: vi.fn() };
    const sandbox = { provision: vi.fn() };
    const events = { append: vi.fn(), finalizeRun: vi.fn() };
    const executor = createRunExecutor({
      prisma,
      runtime,
      sandbox,
      events,
      web: {},
      memoryProviders: { resolve: vi.fn(async () => null) },
      secrets: [],
    } as never);

    await expect(executor.continueRun("run", "worker")).resolves.toBeUndefined();
    expect(updateRun).toHaveBeenCalledTimes(3);
    expect(updateRun).toHaveBeenLastCalledWith({
      where: { id: "run", status: "running", leaseOwner: "worker", leaseFence: 1 },
      data: {
        modelProvider: "local",
        modelId: "chosen",
        modelFunding: "hosted",
        modelThinkingLevel: null,
      },
    });
    expect(runtime.run).not.toHaveBeenCalled();
    expect(sandbox.provision).not.toHaveBeenCalled();
    expect(events.append).not.toHaveBeenCalled();
    expect(events.finalizeRun).not.toHaveBeenCalled();
    expect(leases.releaseComputerExecutionLease).toHaveBeenCalledOnce();
    expect(prisma.attempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "attempt", status: "running" },
        data: { status: "interrupted", finishedAt: expect.any(Date) },
      }),
    );
  });
});
