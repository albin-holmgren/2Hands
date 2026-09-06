import { RPCHandler } from "@orpc/server/fetch";
import { ComputerBusyError } from "@rakazo/adapters";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRouter, type RouterDeps } from "./router.js";

const lifecycle = vi.hoisted(() => ({
  provision: vi.fn(),
  acquire: vi.fn(),
  release: vi.fn(),
  settle: vi.fn(),
  checkpoint: vi.fn(),
  stop: vi.fn(),
  publish: vi.fn(),
}));
vi.mock("@rakazo/adapters", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@rakazo/adapters")>()),
  provisionComputer: lifecycle.provision,
  settleComputerUsage: lifecycle.settle,
  checkpointAndRecordComputerWorkspace: lifecycle.checkpoint,
  acquireComputerExecutionLease: lifecycle.acquire,
  releaseComputerExecutionLease: lifecycle.release,
}));

beforeEach(() => {
  vi.resetAllMocks();
  lifecycle.acquire.mockResolvedValue(null);
  lifecycle.release.mockResolvedValue(undefined);
  lifecycle.provision.mockResolvedValue({ providerRef: "restored-provider" });
});

function boot(activeRun = false, procedure = "boot", state = "running") {
  const computer = {
    id: "computer-test",
    homeKey: "home-test",
    providerRef: "stale-provider",
    kind: "fake",
    scope: "team",
    state,
    homeRevision: "saved",
    controlLeaseId: null,
    controlHolder: "none",
  };
  const deps = {
    prisma: {
      bot: {
        findFirst: vi.fn(async () => ({
          id: "bot-test",
          name: "Assistant",
          computer,
          thread: { id: "thread-test" },
        })),
      },
      run: { findFirst: vi.fn(async () => (activeRun ? { id: "active-run" } : null)) },
      computer: {
        updateMany: vi.fn(async ({ where, data }) => {
          const count =
            where.state.notIn?.includes(computer.state) || where.state.not === computer.state
              ? 0
              : 1;
          if (count) Object.assign(computer, data);
          return { count };
        }),
        update: vi.fn(async ({ data }) => {
          lifecycle.publish(data.state);
          Object.assign(computer, data);
          return computer;
        }),
      },
      computerExecutionLease: {
        findUnique: vi.fn(async () => null),
        deleteMany: vi.fn(async () => ({ count: 1 })),
      },
    },
    jobs: { enqueue: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined) },
    sandbox: { stop: lifecycle.stop },
    env: { sandboxProvider: "fake", webOrigin: "http://127.0.0.1:5173" },
  } as unknown as RouterDeps;
  const handler = new RPCHandler(createRouter(deps));
  return handler.handle(
    new Request(`http://127.0.0.1/rpc/computer/${procedure}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: { botId: "bot-test" } }),
    }),
    {
      prefix: "/rpc",
      context: {
        actor: {
          spaceId: "space-test",
          userId: "user-test",
          email: "test@rakazo.test",
          isDeploymentOwner: true,
        },
      },
    },
  );
}

describe("computer Boot recovery", () => {
  it("refuses Stop while the provider creation is still in flight", async () => {
    const { response } = await boot(false, "stop", "booting");
    expect(response.status).toBe(409);
  });

  it("settles confirmed Stop before publishing the computer as stopped", async () => {
    const { response } = await boot(false, "stop");
    expect(response.status).toBe(200);
    expect(lifecycle.settle).toHaveBeenCalledWith(expect.anything(), "computer-test");
    expect(lifecycle.stop.mock.invocationCallOrder[0]).toBeLessThan(
      lifecycle.settle.mock.invocationCallOrder[0]!,
    );
    expect(lifecycle.settle.mock.invocationCallOrder[0]).toBeLessThan(
      lifecycle.publish.mock.invocationCallOrder[0]!,
    );
    expect(lifecycle.publish).toHaveBeenCalledWith("stopped");
  });

  it("retains the usage hold when Stop has an unknown provider outcome", async () => {
    lifecycle.stop.mockRejectedValue(new Error("pause outcome unknown"));
    const { response } = await boot(false, "stop");
    expect(response.status).toBe(500);
    expect(lifecycle.settle).not.toHaveBeenCalled();
    expect(lifecycle.publish).not.toHaveBeenCalled();
  });

  it("reconnects a saved running provider reference before returning success", async () => {
    const { response } = await boot();
    expect(response.status).toBe(200);
    expect(lifecycle.provision).toHaveBeenCalledWith(
      expect.anything(),
      "computer-test",
      expect.objectContaining({ botId: "bot-test" }),
    );
    expect(lifecycle.release).toHaveBeenCalledOnce();
  });
  it("surfaces failed recovery and releases the manual execution lease", async () => {
    lifecycle.provision.mockRejectedValue(new Error("provider unavailable"));
    const { response } = await boot();
    expect(response.status).toBe(500);
    expect(lifecycle.release).toHaveBeenCalledOnce();
  });
  it("keeps observation available while an active run owns provisioning", async () => {
    lifecycle.acquire.mockRejectedValue(new ComputerBusyError());
    const { response } = await boot(true);
    expect(response.status).toBe(200);
    expect(lifecycle.provision).not.toHaveBeenCalled();
    expect(lifecycle.release).not.toHaveBeenCalled();
  });
  it("does not hide a busy manual boot behind the stale running state", async () => {
    lifecycle.acquire.mockRejectedValue(new ComputerBusyError());
    const { response } = await boot();
    expect(response.status).toBe(409);
    expect(lifecycle.provision).not.toHaveBeenCalled();
  });
});
