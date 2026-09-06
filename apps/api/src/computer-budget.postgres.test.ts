import { randomUUID } from "node:crypto";
import type { SandboxProvider } from "@rakazo/adapter-kit";
import { createDb, ensureOrganizationBilling } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import {
  ensureComputerUsageCoverage,
  suspendComputerForBudget,
} from "../../../packages/adapters/src/computer-usage.js";
import { testDatabaseUrl } from "../../../packages/testkit/src/cli/test-database-url.js";

(process.env.VERIFY_DATABASE === "1" ? describe : describe.skip)(
  "computer expiry fencing (PostgreSQL)",
  () => {
    it("blocks a Boot claim during stop, settles the old hold, then permits newly funded Boot", async () => {
      const url = testDatabaseUrl(process.env.DATABASE_URL);
      if (!url) throw new Error("Disposable test database required");
      const { prisma, pool } = createDb(url);
      const suffix = randomUUID();
      const organizationId = `budget-org-${suffix}`;
      const userId = `budget-user-${suffix}`;
      const spaceId = `budget-space-${suffix}`;
      const computerId = `budget-computer-${suffix}`;
      let releaseStop!: () => void;
      let stopEntered!: () => void;
      const stopping = new Promise<void>((resolve) => {
        stopEntered = resolve;
      });
      const barrier = new Promise<void>((resolve) => {
        releaseStop = resolve;
      });
      const stop = vi.fn(async () => {
        stopEntered();
        await barrier;
      });
      const sandbox = {
        describe: () => ({ capabilities: { boundedLifetime: true } }),
        stop,
      } as unknown as SandboxProvider;
      const deps = { prisma, sandbox };
      let expiry: Promise<void> | undefined;
      let boot: Promise<unknown> | undefined;
      vi.stubEnv("BILLING_ENABLED", "true");
      vi.stubEnv("HOSTED_COMPUTER_USD_PER_HOUR", "0.15");
      try {
        const now = new Date();
        await prisma.user.create({
          data: { id: userId, name: "Budget Test", email: `${userId}@example.test` },
        });
        await prisma.organization.create({
          data: { id: organizationId, name: "Budget Test", slug: organizationId, createdAt: now },
        });
        await prisma.member.create({
          data: { id: randomUUID(), organizationId, userId, role: "owner", createdAt: now },
        });
        await prisma.space.create({ data: { id: spaceId, organizationId, name: "Budget Test" } });
        await prisma.spaceMember.create({
          data: {
            id: randomUUID(),
            organizationId,
            spaceId,
            userId,
            role: "owner",
            createdAt: now,
          },
        });
        await prisma.computer.create({
          data: {
            id: computerId,
            spaceId,
            userId,
            scopeKey: computerId,
            homeKey: computerId,
            state: "running",
            providerRef: "fake-old-computer",
            kind: "fake",
          },
        });
        await ensureComputerUsageCoverage(deps, computerId, new Date(now.getTime() - 301_000));
        const original = await prisma.computer.findUniqueOrThrow({ where: { id: computerId } });
        expiry = suspendComputerForBudget(deps, computerId);
        await stopping;
        let bootFinished = false;
        // This is the production Boot's generation-checked UPDATE. PostgreSQL must
        // recheck it only after expiry's row lock and settlement have committed.
        boot = prisma.computer
          .updateMany({
            where: {
              id: computerId,
              state: { in: ["running", "stopped", "suspended", "error"] },
              executionFence: original.executionFence,
              providerRef: original.providerRef,
            },
            data: { state: "booting", executionFence: { increment: 1 } },
          })
          .then((result) => {
            bootFinished = true;
            return result;
          });
        await vi.waitFor(
          async () => {
            const waiting = await pool.query<{ count: string }>(
              "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE '%UPDATE%computers%'",
            );
            expect(Number(waiting.rows[0]!.count)).toBeGreaterThan(0);
          },
          { timeout: 3000, interval: 20 },
        );
        expect(bootFinished).toBe(false);
        expect(
          (
            await prisma.usageReservation.findUniqueOrThrow({
              where: { id: original.billingReservationId! },
            })
          ).status,
        ).toBe("reserved");
        releaseStop();
        await expiry;
        expect(await boot).toEqual({ count: 1 });
        expect(
          (
            await prisma.usageReservation.findUniqueOrThrow({
              where: { id: original.billingReservationId! },
            })
          ).status,
        ).toBe("settled");
        await ensureComputerUsageCoverage(deps, computerId);
        const current = await prisma.computer.findUniqueOrThrow({ where: { id: computerId } });
        expect(current.state).toBe("booting");
        expect(current.executionFence).toBe(original.executionFence + 1);
        expect(current.billingReservationId).not.toBe(original.billingReservationId);
        expect(await ensureOrganizationBilling(prisma, organizationId)).toMatchObject({
          spentUsd: 0.0125,
          reservedUsd: 0.0125,
        });
        expect(stop).toHaveBeenCalledOnce();
      } finally {
        releaseStop?.();
        await Promise.allSettled([expiry, boot]);
        vi.unstubAllEnvs();
        await prisma.organization.deleteMany({ where: { id: organizationId } });
        await prisma.user.deleteMany({ where: { id: userId } });
        await prisma.$disconnect();
        await pool.end();
      }
    }, 15_000);
  },
);
