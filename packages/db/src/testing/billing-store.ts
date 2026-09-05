import type {
  BillingPeriod,
  Computer,
  OrganizationBilling,
  PrismaClient,
  UsageReservation,
} from "../client.js";

type State = {
  billing: OrganizationBilling;
  computers: Map<string, Computer>;
  periods: Map<string, BillingPeriod>;
  reservations: Map<string, UsageReservation>;
  events: Map<string, { id: string; organizationId: string; occurredAt: Date }>;
};

/** Offline transactional double: transactions serialize only when the code acquires its SQL lock. */
export function billingTestStore(overrides: Partial<OrganizationBilling> = {}) {
  let state: State = {
    billing: {
      organizationId: "org-1",
      plan: "free",
      status: "active",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      lastProviderEventAt: null,
      usageAllowanceStartsAt: null,
      computerSecondsUsed: 0,
      inputTokensUsed: 0,
      outputTokensUsed: 0,
      usagePeriodStart: new Date("2026-09-01T00:00:00Z"),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    },
    computers: new Map(),
    periods: new Map(),
    reservations: new Map(),
    events: new Map(),
  };
  let nextId = 0;
  let tail = Promise.resolve();
  const copy = <T>(value: T): T => structuredClone(value);
  const tables = () => ({
    space: { findUniqueOrThrow: async () => ({ organizationId: "org-1" }) },
    computer: {
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const row = state.computers.get(where.id);
        if (!row) throw new Error("Computer missing");
        return copy(row);
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Computer> }) => {
        const row = state.computers.get(where.id)!;
        Object.assign(row, data);
        return copy(row);
      },
      count: async ({
        where,
      }: {
        where: { id: { not: string }; billingCoveredUntil: { gt: Date } };
      }) =>
        [...state.computers.values()].filter(
          (row) =>
            row.id !== where.id.not &&
            row.billingCoveredUntil &&
            row.billingCoveredUntil > where.billingCoveredUntil.gt,
        ).length,
    },
    organizationBilling: {
      upsert: async () => copy(state.billing),
      findUnique: async ({ where }: { where: { stripeCustomerId?: string } }) =>
        where.stripeCustomerId && where.stripeCustomerId !== state.billing.stripeCustomerId
          ? null
          : copy(state.billing),
      findUniqueOrThrow: async () => copy(state.billing),
      update: async ({ data }: { data: Partial<OrganizationBilling> }) => {
        for (const [key, value] of Object.entries(data)) {
          if (value && typeof value === "object" && "increment" in value) {
            const field = key as "inputTokensUsed" | "outputTokensUsed" | "computerSecondsUsed";
            state.billing[field] += Number(value.increment);
          } else Object.assign(state.billing, { [key]: value });
        }
        return copy(state.billing);
      },
    },
    spaceMember: {
      findUnique: async ({
        where,
      }: {
        where: { spaceId_userId: { userId: string; spaceId: string } };
      }) =>
        where.spaceId_userId.spaceId === "space-1" && where.spaceId_userId.userId === "user-1"
          ? { organizationId: "org-1" }
          : null,
    },
    run: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        where.id === "run-1" ? { id: "run-1" } : null,
    },
    billingPeriod: {
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { organizationId_startsAt: { startsAt: Date } };
        create: Partial<BillingPeriod>;
        update: Partial<BillingPeriod>;
      }) => {
        const key = where.organizationId_startsAt.startsAt.toISOString();
        const old = state.periods.get(key);
        const row = old
          ? { ...old, ...update }
          : ({
              id: `period-${++nextId}`,
              spentMicros: 0n,
              reservedMicros: 0n,
              createdAt: new Date(),
              ...create,
            } as BillingPeriod);
        state.periods.set(key, row);
        return copy(row);
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: {
          spentMicros?: { increment: bigint };
          reservedMicros?: { increment?: bigint; decrement?: bigint };
        };
      }) => {
        const row = [...state.periods.values()].find((item) => item.id === where.id)!;
        row.spentMicros += data.spentMicros?.increment ?? 0n;
        row.reservedMicros +=
          (data.reservedMicros?.increment ?? 0n) - (data.reservedMicros?.decrement ?? 0n);
        if (row.reservedMicros < 0n) throw new Error("negative reservation invariant");
        return copy(row);
      },
    },
    usageReservation: {
      findMany: async ({ where }: { where: { periodId: string; status: string } }) =>
        copy(
          [...state.reservations.values()].filter(
            (row) => row.periodId === where.periodId && row.status === where.status,
          ),
        ),
      findUnique: async ({
        where,
      }: {
        where: { organizationId_operationKey: { operationKey: string } };
      }) =>
        copy(
          [...state.reservations.values()].find(
            (item) => item.operationKey === where.organizationId_operationKey.operationKey,
          ) ?? null,
        ),
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const row = state.reservations.get(where.id);
        if (!row) throw new Error("Reservation missing");
        return copy(row);
      },
      create: async ({ data }: { data: Partial<UsageReservation> }) => {
        const row = {
          id: `usage-${++nextId}`,
          runId: null,
          status: "reserved",
          settledMicros: null,
          metadata: null,
          createdAt: new Date(),
          settledAt: null,
          releasedAt: null,
          ...data,
        } as UsageReservation;
        if (row.runId === undefined) row.runId = null;
        state.reservations.set(row.id, row);
        return copy(row);
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<UsageReservation>;
      }) => {
        const row = state.reservations.get(where.id)!;
        for (const [key, value] of Object.entries(data))
          if (value !== undefined) Object.assign(row, { [key]: value });
        return copy(row);
      },
    },
    billingProviderEvent: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        copy(state.events.get(where.id) ?? null),
      create: async ({
        data,
      }: {
        data: { id: string; organizationId: string; occurredAt: Date };
      }) => {
        state.events.set(data.id, copy(data));
        return copy(data);
      },
    },
  });
  const prisma = {
    ...tables(),
    $transaction: async (operation: (tx: unknown) => Promise<unknown>) => {
      let unlock: (() => void) | undefined;
      let before: State | undefined;
      const tx = {
        ...tables(),
        $executeRaw: async () => 0,
        $queryRaw: async () => {
          const previous = tail;
          tail = new Promise<void>((resolve) => {
            unlock = resolve;
          });
          await previous;
          before = copy(state);
          return [];
        },
      };
      try {
        return await operation(tx);
      } catch (error) {
        if (before) state = before;
        throw error;
      } finally {
        unlock?.();
      }
    },
  };
  return {
    prisma: prisma as unknown as PrismaClient,
    state: () => state,
    addComputer: (id = "computer-1") => {
      const row = {
        id,
        spaceId: "space-1",
        userId: "user-1",
        homeKey: id,
        state: "stopped",
        providerRef: null,
        kind: "example",
        billingReservationId: null,
        billingStartedAt: null,
        billingCoveredUntil: null,
        billingRateMicrosPerHour: null,
      } as Computer;
      state.computers.set(id, row);
      return row;
    },
  };
}
