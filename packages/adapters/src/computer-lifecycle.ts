import { mkdir } from "node:fs/promises";
import type {
  AdapterContext,
  AgentHomeStore,
  ComputerRef,
  JobPublisher,
  SandboxProvider,
} from "@rakazo/adapter-kit";
import { computerSleepJob } from "@rakazo/adapter-kit";
import { ACTIVE_RUN_STATUSES, screenLeaseId } from "@rakazo/core";
import { type PrismaClient, parseComputerMode, type ThreadEvents } from "@rakazo/db";
import { expireComputerControl, hasActiveComputerControl } from "./computer-control.js";
import { toComputerRef } from "./computer-support.js";
import {
  ensureComputerUsageCoverage,
  releaseUnusedComputerUsage,
  settleComputerUsage,
  suspendComputerForBudget,
} from "./computer-usage.js";
import {
  checkpointAndRecordComputerWorkspace,
  ensureComputerWorkspaceLayout,
  restoreComputerWorkspace,
} from "./computer-workspace.js";
import { isSandboxGoneError, isUnrecoverableSandboxError } from "./e2b-sandbox.js";
import { resolveAgentHomePath } from "./home.js";

const EXECUTION_LEASE_MS = 5 * 60_000;
const BOOT_WAIT_ATTEMPTS = 40;
const BOOT_WAIT_MS = 250;

export class ComputerBusyError extends Error {
  constructor() {
    super("Computer is busy");
    this.name = "ComputerBusyError";
  }
}

export { toComputerRef } from "./computer-support.js";

export async function provisionComputer(
  deps: {
    prisma: PrismaClient;
    sandbox: SandboxProvider;
    home: AgentHomeStore;
    jobs: JobPublisher;
    events: ThreadEvents;
    dataDir?: string;
  },
  computerId: string,
  context: AdapterContext,
  controlHolder: "bot" | "none" = "none",
): Promise<ComputerRef> {
  let existing = await deps.prisma.computer.findUniqueOrThrow({ where: { id: computerId } });
  if (existing.controlLeaseId && !hasActiveComputerControl(existing)) {
    await expireComputerControl(deps, existing.id, existing.controlLeaseId);
    existing = await deps.prisma.computer.findUniqueOrThrow({ where: { id: computerId } });
    if (existing.controlLeaseId && !hasActiveComputerControl(existing)) {
      throw new Error("computer control revocation is still in progress");
    }
  }
  const homePath = resolveAgentHomePath(deps.home, existing.homeKey, deps.dataDir ?? "./data");
  await mkdir(homePath, { recursive: true });

  if (existing.state === "booting" || existing.state === "suspending") {
    const ready = await waitForComputerReady(deps.prisma, computerId, context);
    if (ready?.state === "running" && ready.providerRef) {
      return joinComputerBoot(deps, ready, context);
    }
    existing = await deps.prisma.computer.findUniqueOrThrow({ where: { id: computerId } });
  }

  // A prior create may still be running even if Stop/reset changed the saved
  // state before its provider reference arrived. Never spend the same hold twice.
  if (
    (!existing.providerRef || existing.state === "booting") &&
    existing.billingReservationId &&
    existing.billingCoveredUntil &&
    existing.billingCoveredUntil.getTime() > Date.now()
  ) {
    throw new ComputerBusyError();
  }

  const bootFence = (existing.executionFence ?? 0) + 1;
  const expiredUnknownBoot =
    existing.state === "booting" &&
    existing.billingCoveredUntil &&
    existing.billingCoveredUntil.getTime() <= Date.now();
  const claimed = await deps.prisma.computer.updateMany({
    where: {
      id: computerId,
      state: {
        in: [
          "running",
          "stopped",
          "suspended",
          "error",
          ...(expiredUnknownBoot ? ["booting"] : []),
        ],
      },
      providerRef: existing.providerRef,
      kind: existing.kind,
      executionFence: bootFence - 1,
      ...(context.botId ? { bots: { some: { id: context.botId, archivedAt: null } } } : {}),
    },
    data: { state: "booting", executionFence: bootFence },
  });
  if (claimed.count !== 1) {
    // Boot and reconnect share a computer-wide claim. Team bots must not each
    // allocate a replacement after observing the same missing provider reference.
    const ready = await waitForComputerReady(deps.prisma, computerId, context);
    if (ready.state === "running" && ready.providerRef) {
      return joinComputerBoot(deps, ready, context);
    }
    throw new ComputerBusyError();
  }
  let provisioned: ComputerRef | undefined;
  let dispatched = false;
  try {
    const expiresAt = await ensureComputerUsageCoverage(deps, computerId);
    if (expiresAt)
      await deps.jobs.enqueue(computerSleepJob(computerId, new Date(Date.now() + 60_000)));
    dispatched = true;
    const ref = await deps.sandbox.provision(
      {
        botId: existing.homeKey,
        homePath,
        providerRef: existing.providerRef ?? undefined,
        providerKind: existing.kind as ComputerRef["kind"],
        expiresAt,
      },
      context,
    );
    ref.expiresAt = expiresAt;
    provisioned = ref;
    await deps.sandbox.prepare(ref, context);
    const replacement =
      ref.fresh === true ||
      !existing.providerRef ||
      existing.providerRef !== ref.providerRef ||
      existing.kind !== ref.kind;
    if (replacement) {
      await restoreComputerWorkspace(deps.home, deps.sandbox, existing.homeKey, ref, context);
    }
    await ensureComputerWorkspaceLayout(
      deps.sandbox,
      ref,
      parseComputerMode(existing.scope),
      context.botId,
      context,
    );
    const activeControl = hasActiveComputerControl(existing);
    const activated = await deps.prisma.computer.updateMany({
      where: {
        id: computerId,
        state: "booting",
        executionFence: bootFence,
        ...(context.botId ? { bots: { some: { id: context.botId, archivedAt: null } } } : {}),
      },
      data: {
        state: "running",
        providerRef: ref.providerRef,
        kind: ref.kind,
        controlHolder: activeControl ? "user" : controlHolder,
        ...(!activeControl
          ? {
              controlLeaseId: null,
              controlLeaseExpiresAt: null,
              controlBotId: null,
              controlRunId: null,
            }
          : {}),
      },
    });
    if (activated.count !== 1) {
      throw new ComputerBusyError();
    }
    return ref;
  } catch (error) {
    const current = await deps.prisma.computer.findUniqueOrThrow({ where: { id: computerId } });
    const ownsClaim = (current.executionFence ?? bootFence) === bootFence;
    const unknownCreate =
      dispatched &&
      !provisioned &&
      current.billingReservationId &&
      current.billingCoveredUntil &&
      current.billingCoveredUntil.getTime() > Date.now();
    if (!dispatched && ownsClaim && existing.state === "running" && existing.providerRef) {
      await suspendComputerForBudget(deps, computerId);
      throw error;
    }
    const rollbackError =
      provisioned && (ownsClaim || current.providerRef !== provisioned.providerRef)
        ? await rollbackProvisionedComputer(deps.sandbox, provisioned, context, error)
        : undefined;
    if (!dispatched && ownsClaim)
      await releaseUnusedComputerUsage(
        deps.prisma,
        computerId,
        existing.billingReservationId ?? null,
      );
    else if (provisioned && !rollbackError && ownsClaim)
      await settleComputerUsage(deps.prisma, computerId);
    try {
      await deps.prisma.computer.updateMany({
        where: { id: computerId, state: "booting", executionFence: bootFence },
        data: {
          state: unknownCreate ? "booting" : "error",
          ...(rollbackError && provisioned
            ? { providerRef: provisioned.providerRef, kind: provisioned.kind }
            : {}),
        },
      });
    } catch (recordError) {
      throw new AggregateError(
        [error, ...(rollbackError ? [rollbackError] : []), recordError],
        "Computer provisioning failed and its failure could not be recorded",
      );
    }
    if (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Computer provisioning failed and its sandbox could not be rolled back",
      );
    }
    throw error;
  }
}

async function joinComputerBoot(
  deps: { sandbox: SandboxProvider; prisma: PrismaClient },
  computer: Parameters<typeof toComputerRef>[0] & { id: string; scope: string },
  context: AdapterContext,
): Promise<ComputerRef> {
  if (
    context.botId &&
    !(await deps.prisma.bot.findFirst({
      where: { id: context.botId, computerId: computer.id, archivedAt: null },
      select: { id: true },
    }))
  )
    throw new ComputerBusyError();
  const ref = toComputerRef(computer);
  await ensureComputerWorkspaceLayout(
    deps.sandbox,
    ref,
    parseComputerMode(computer.scope),
    context.botId,
    context,
  );
  return ref;
}

async function waitForComputerReady(
  prisma: PrismaClient,
  computerId: string,
  context: AdapterContext,
) {
  for (let attempt = 0; attempt < BOOT_WAIT_ATTEMPTS; attempt += 1) {
    const current = await prisma.computer.findUniqueOrThrow({ where: { id: computerId } });
    if (current.state === "running" && current.providerRef) return current;
    if (current.state !== "booting" && current.state !== "suspending") return current;
    await new Promise((resolve) => setTimeout(resolve, BOOT_WAIT_MS));
    if (context.signal.aborted) {
      throw context.signal.reason ?? new Error("computer boot aborted");
    }
  }
  return prisma.computer.findUniqueOrThrow({ where: { id: computerId } });
}

async function rollbackProvisionedComputer(
  sandbox: SandboxProvider,
  computer: ComputerRef,
  context: AdapterContext,
  cause: unknown,
): Promise<unknown | undefined> {
  try {
    await sandbox.releaseScreen?.(computer, context).catch(() => undefined);
    if (computer.fresh) {
      await sandbox.destroy(computer, context);
    } else if (cause instanceof ComputerBusyError) {
      try {
        await sandbox.stop(computer, context);
      } catch {
        await sandbox.destroy(computer, context);
      }
    } else {
      await sandbox.stop(computer, context);
    }
    return undefined;
  } catch (error) {
    return error;
  }
}

export interface ComputerExecutionLease {
  computerId: string;
  botId: string;
  runId: string;
  fence: number;
}

export function screenLeaseIdForRun(
  lease: Pick<ComputerExecutionLease, "runId" | "fence"> | null,
  runId: string,
  fence = 0,
): string {
  return screenLeaseId(lease?.runId ?? runId, lease?.fence ?? fence);
}

export async function acquireComputerExecutionLease(
  prisma: PrismaClient,
  input: {
    computerId: string;
    runId: string;
    botId: string;
    resumeHeldLease?: boolean;
  },
): Promise<ComputerExecutionLease | null> {
  const computer = await prisma.computer.findUniqueOrThrow({ where: { id: input.computerId } });
  if (computer.scope !== "team") return null;
  if (computer.state === "suspending") throw new ComputerBusyError();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + EXECUTION_LEASE_MS);
  const [reclaimed] = await prisma.computerExecutionLease.updateManyAndReturn({
    where: {
      computerId: input.computerId,
      botId: input.botId,
      OR: [{ expiresAt: { lt: now } }, ...(input.resumeHeldLease ? [{ runId: input.runId }] : [])],
    },
    data: {
      runId: input.runId,
      expiresAt,
      fence: { increment: 1 },
    },
    select: { fence: true },
  });
  if (reclaimed) {
    return validateAcquiredComputerLease(prisma, {
      computerId: input.computerId,
      botId: input.botId,
      runId: input.runId,
      fence: reclaimed.fence,
    });
  }
  try {
    const created = await prisma.computerExecutionLease.create({
      data: {
        computerId: input.computerId,
        botId: input.botId,
        runId: input.runId,
        fence: 1,
        expiresAt,
      },
      select: { fence: true },
    });
    return validateAcquiredComputerLease(prisma, {
      computerId: input.computerId,
      botId: input.botId,
      runId: input.runId,
      fence: created.fence,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new ComputerBusyError();
    throw error;
  }
}

async function validateAcquiredComputerLease(
  prisma: PrismaClient,
  lease: ComputerExecutionLease,
): Promise<ComputerExecutionLease> {
  const computer = await prisma.computer.findUniqueOrThrow({
    where: { id: lease.computerId },
    select: { state: true },
  });
  if (computer.state !== "suspending") return lease;
  await releaseComputerExecutionLease(prisma, lease);
  throw new ComputerBusyError();
}

export async function renewComputerExecutionLease(
  prisma: PrismaClient,
  lease: ComputerExecutionLease | null,
): Promise<boolean> {
  if (!lease) return true;
  const renewed = await prisma.computerExecutionLease.updateMany({
    where: {
      computerId: lease.computerId,
      botId: lease.botId,
      runId: lease.runId,
      fence: lease.fence,
    },
    data: { expiresAt: new Date(Date.now() + EXECUTION_LEASE_MS) },
  });
  return renewed.count === 1;
}

export async function holdComputerExecutionLeaseForTakeover(
  prisma: PrismaClient,
  lease: ComputerExecutionLease | null,
): Promise<boolean> {
  if (!lease) return true;
  const held = await prisma.computerExecutionLease.updateMany({
    where: {
      computerId: lease.computerId,
      botId: lease.botId,
      runId: lease.runId,
      fence: lease.fence,
    },
    data: { expiresAt: new Date(Date.now() + 24 * 60 * 60_000) },
  });
  return held.count === 1;
}

export async function releaseComputerExecutionLease(
  prisma: PrismaClient,
  lease: ComputerExecutionLease | null,
): Promise<void> {
  if (!lease) return;
  await prisma.computerExecutionLease.deleteMany({
    where: {
      computerId: lease.computerId,
      botId: lease.botId,
      runId: lease.runId,
      fence: lease.fence,
    },
  });
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

export type ComputerReplaceMode = "recover" | "reset" | "update";

export function computerSupportsUpdate(kind: string): boolean {
  return kind !== "desktop";
}

export async function replaceComputer(
  deps: {
    prisma: PrismaClient;
    sandbox: SandboxProvider;
    home: AgentHomeStore;
    jobs: JobPublisher;
    events: ThreadEvents;
    dataDir?: string;
  },
  computerId: string,
  mode: ComputerReplaceMode,
  context: AdapterContext,
  controlHolder: "bot" | "none" = "none",
): Promise<ComputerRef> {
  let existing = await deps.prisma.computer.findUniqueOrThrow({ where: { id: computerId } });
  if (existing.controlLeaseId && !hasActiveComputerControl(existing)) {
    await expireComputerControl(deps, existing.id, existing.controlLeaseId);
    existing = await deps.prisma.computer.findUniqueOrThrow({ where: { id: computerId } });
    if (existing.controlLeaseId && !hasActiveComputerControl(existing)) {
      throw new Error("computer control revocation is still in progress");
    }
  }
  const botId = context.botId;
  if (!botId) throw new Error("computer replacement requires a bot id");
  if (hasActiveComputerControl(existing)) {
    throw new ComputerBusyError();
  }
  if (
    (existing.state === "booting" &&
      !(existing.billingCoveredUntil && existing.billingCoveredUntil.getTime() <= Date.now())) ||
    existing.state === "suspending"
  ) {
    throw new ComputerBusyError();
  }

  const previousState = existing.state;
  const now = new Date();
  const claimed = await deps.prisma.computer.updateMany({
    where: {
      id: computerId,
      state: previousState,
      executionLeases: { none: { botId: { not: botId }, expiresAt: { gt: now } } },
      OR: [
        { controlHolder: { not: "user" } },
        { controlLeaseId: null },
        { controlLeaseExpiresAt: null },
        { controlLeaseExpiresAt: { lte: now } },
      ],
    },
    data: { state: "suspending" },
  });
  if (claimed.count !== 1) throw new ComputerBusyError();
  const activeRun = await deps.prisma.run.findFirst({
    where: {
      status: { in: [...ACTIVE_RUN_STATUSES] },
      bot: { computerId },
    },
    select: { id: true },
  });
  if (activeRun) {
    await deps.prisma.computer.updateMany({
      where: { id: computerId, state: "suspending" },
      data: { state: previousState },
    });
    throw new ComputerBusyError();
  }

  const oldRef = existing.providerRef ? toComputerRef(existing) : null;
  try {
    if (oldRef && existing.state === "running" && mode !== "reset") {
      try {
        await checkpointAndRecordComputerWorkspace(deps, existing, oldRef, context);
      } catch (error) {
        if (mode !== "recover" && !isUnrecoverableSandboxError(error)) throw error;
      }
    }
    if (oldRef) {
      await deps.sandbox.releaseScreen?.(oldRef, context).catch(() => undefined);
      try {
        await deps.sandbox.destroy(oldRef, context);
        await settleComputerUsage(deps.prisma, computerId);
      } catch (error) {
        if (!isSandboxGoneError(error)) throw error;
        await settleComputerUsage(deps.prisma, computerId);
      }
    }
    await deps.prisma.computer.update({
      where: { id: computerId },
      data: {
        state: "stopped",
        providerRef: null,
        controlHolder: "none",
        controlLeaseId: null,
        controlLeaseExpiresAt: null,
        controlBotId: null,
        controlRunId: null,
      },
    });
    return provisionComputer(deps, computerId, context, controlHolder);
  } catch (error) {
    await deps.prisma.computer
      .updateMany({
        where: { id: computerId },
        data: { state: "error" },
      })
      .catch(() => undefined);
    throw error;
  }
}
