import type { Sandbox } from "@e2b/desktop";
import { describe, expect, it, vi } from "vitest";
import { E2BSandboxProvider, type E2BSandboxSdk } from "./e2b-sandbox.js";

const context = {
  operationId: "screen-security",
  traceId: "screen-security",
  spaceId: "test-space",
  userId: "test-user",
  signal: new AbortController().signal,
};
const request = {
  botId: "test-bot",
  homePath: "/unused",
  providerRef: "synthetic-box",
  providerKind: "e2b" as const,
};
function fixture() {
  const run = vi.fn(async (command: string) => ({
    exitCode: 0,
    stderr: "",
    stdout: command.includes("RAKAZO_SCREEN_INDEX=")
      ? "RAKAZO_SCREEN_INDEX=0\n"
      : command.includes("RAKAZO_SCREEN_PASSWORD=")
        ? `RAKAZO_SCREEN_PASSWORD=${command.includes("control-password-") ? "ctrl-key" : "view-key"}\n`
        : "",
  }));
  const desktop = {
    sandboxId: "synthetic-box",
    display: ":0",
    trafficAccessToken: "synthetic-traffic-token",
    commands: { run },
    setTimeout: vi.fn(async (_ms: number) => undefined),
    getHost: (port: number) => `${port}-synthetic.example`,
  } as unknown as Sandbox;
  const sdk: E2BSandboxSdk = {
    create: vi.fn(async () => desktop),
    connect: vi.fn(async () => desktop),
    pause: vi.fn(),
    kill: vi.fn(async () => true),
  };
  return { desktop, sdk, run, provider: new E2BSandboxProvider("synthetic-key", sdk) };
}

describe("E2B screen isolation", () => {
  it("creates a private sandbox and gives view/control distinct authenticated listeners", async () => {
    const { provider, sdk, run } = fixture();
    const computer = await provider.provision(
      { botId: request.botId, homePath: request.homePath },
      context,
    );
    expect(sdk.create).toHaveBeenCalledWith(
      expect.objectContaining({ network: { allowPublicTraffic: false } }),
    );
    const view = await provider.connectScreen(computer, { view: "stream" }, context);
    const control = await provider.connectScreen(
      computer,
      { view: "stream", interactive: true, controlToken: "lease-1" },
      context,
    );
    const viewUrl = new URL(view.url!);
    const controlUrl = new URL(control.url!);
    expect(viewUrl.hostname).toBe("6080-synthetic.example");
    expect(controlUrl.hostname).toBe("6081-synthetic.example");
    expect(viewUrl.searchParams.get("password")).toBe("view-key");
    expect(controlUrl.searchParams.get("password")).toBe("ctrl-key");
    expect(controlUrl.searchParams.get("view_only")).toBe("false");
    expect(view.upstreamHeaders).toEqual({ "e2b-traffic-access-token": "synthetic-traffic-token" });
    expect(view.url).not.toContain("synthetic-traffic-token");
    expect(
      run.mock.calls.some(
        ([command]) => command.includes("-viewonly -rfbauth") && command.includes("-noremote"),
      ),
    ).toBe(true);
    expect(
      run.mock.calls.some(
        ([command]) =>
          command.includes("-nopw") ||
          command.includes("noviewonly") ||
          command.includes("x11vnc -R"),
      ),
    ).toBe(false);
    await provider.setScreenControl(computer, false, context, "lease-1");
    const stop = run.mock.calls.at(-1)![0];
    expect(stop).toContain("control-token-0");
    expect(stop).toContain("Screen listener did not stop");
    expect(stop).toContain("-rfbport 5901");
    expect(stop).not.toContain("-rfbport 5900");
  });

  it("rejects tokenless takeover before connecting or changing screen state", async () => {
    const { provider, sdk, run } = fixture();
    const computer = {
      id: request.providerRef,
      botId: request.botId,
      kind: "e2b" as const,
      providerRef: request.providerRef,
    };
    await expect(
      provider.connectScreen(computer, { view: "stream", interactive: true }, context),
    ).rejects.toThrow(/control token/);
    await expect(provider.setScreenControl(computer, true, context)).rejects.toThrow(
      /control token/,
    );
    expect(sdk.connect).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("never substitutes the primary desktop when an isolated screen fails", async () => {
    const { provider, run } = fixture();
    run.mockImplementation(async (command) =>
      command.includes("RAKAZO_SCREEN_INDEX=")
        ? { exitCode: 0, stderr: "", stdout: "RAKAZO_SCREEN_INDEX=1\n" }
        : { exitCode: 1, stderr: "isolated display unavailable", stdout: "" },
    );
    const computer = await provider.provision(request, context);
    await expect(provider.connectScreen(computer, { view: "stream" }, context)).rejects.toThrow();
    expect(run.mock.calls.some(([command]) => command.includes("-rfbport 5900"))).toBe(false);
  });

  it("fails closed when view authentication or control revocation is unconfirmed", async () => {
    const { provider, run } = fixture();
    const computer = await provider.provision(request, context);
    run.mockImplementation(async (command) => ({
      exitCode: 0,
      stderr: "",
      stdout: command.includes("RAKAZO_SCREEN_INDEX=") ? "RAKAZO_SCREEN_INDEX=0\n" : "",
    }));
    await expect(provider.connectScreen(computer, { view: "stream" }, context)).rejects.toThrow();
    run.mockImplementation(async (command) =>
      command.includes("RAKAZO_SCREEN_INDEX=")
        ? { exitCode: 0, stderr: "", stdout: "RAKAZO_SCREEN_INDEX=0\n" }
        : { exitCode: 1, stderr: "listener still open", stdout: "" },
    );
    await expect(provider.setScreenControl(computer, false, context, "lease-1")).rejects.toThrow(
      /could not be revoked/,
    );
  });
});

describe("E2B prepaid reconnect", () => {
  it("shortens an existing provider deadline before returning the reusable handle", async () => {
    const { provider, desktop, sdk } = fixture();
    let providerDeadline = Date.now() + 600_000;
    const expiresAt = new Date(Date.now() + 120_000).toISOString();
    vi.mocked(sdk.connect).mockImplementation(async (_id, options) => {
      providerDeadline = Math.max(providerDeadline, Date.now() + options.timeoutMs);
      return desktop;
    });
    vi.mocked(desktop.setTimeout).mockImplementation(async (ms) => {
      providerDeadline = Date.now() + ms;
    });
    const computer = await provider.provision({ ...request, expiresAt }, context);
    expect(computer.fresh).toBe(false);
    expect(desktop.setTimeout).toHaveBeenCalledOnce();
    expect(providerDeadline).toBeLessThanOrEqual(Date.parse(expiresAt) + 10);
    expect(sdk.create).not.toHaveBeenCalled();
  });

  it.each(["ECONNRESET", "EAI_AGAIN"])(
    "never replaces a prepaid machine after uncertain %s",
    async (code) => {
      const { provider, sdk } = fixture();
      vi.mocked(sdk.connect).mockRejectedValue(Object.assign(new Error("fetch failed"), { code }));
      await expect(
        provider.provision(
          { ...request, expiresAt: new Date(Date.now() + 120_000).toISOString() },
          context,
        ),
      ).rejects.toThrow("fetch failed");
      expect(sdk.create).not.toHaveBeenCalled();
    },
  );

  it("replaces a prepaid machine only after a confirmed provider not-found result", async () => {
    const { provider, sdk } = fixture();
    vi.mocked(sdk.connect).mockRejectedValue(
      Object.assign(new Error("sandbox gone"), { name: "SandboxNotFoundError" }),
    );
    const computer = await provider.provision(
      { ...request, expiresAt: new Date(Date.now() + 120_000).toISOString() },
      context,
    );
    expect(computer.fresh).toBe(true);
    expect(sdk.create).toHaveBeenCalledOnce();
  });

  it("does not cache or replace a handle whose prepaid timeout could not be confirmed", async () => {
    const { provider, sdk, desktop } = fixture();
    vi.mocked(desktop.setTimeout).mockRejectedValue(new Error("deadline update unavailable"));
    const covered = { ...request, expiresAt: new Date(Date.now() + 120_000).toISOString() };
    await expect(provider.provision(covered, context)).rejects.toThrow(
      /deadline update unavailable/,
    );
    await expect(provider.provision(covered, context)).rejects.toThrow(
      /deadline update unavailable/,
    );
    expect(sdk.connect).toHaveBeenCalledTimes(2);
    expect(sdk.create).not.toHaveBeenCalled();
  });
});

describe("legacy E2B migration", () => {
  it("revokes legacy control and authenticates viewing before returning an existing public machine", async () => {
    const { provider, desktop, sdk, run } = fixture();
    Object.assign(desktop, { trafficAccessToken: undefined });
    const computer = await provider.provision(request, context);
    expect(computer.fresh).toBe(false);
    expect(computer.providerRef).toBe(request.providerRef);
    expect(run.mock.calls[0]![0]).toContain("control-token-0");
    expect(run.mock.calls[1]![0]).toContain("-viewonly -rfbauth");
    expect(sdk.create).not.toHaveBeenCalled();
    const view = await provider.connectScreen(computer, { view: "stream" }, context);
    expect(new URL(view.url!).searchParams.get("password")).toBe("view-key");
  });

  it("never replaces an existing machine when security hardening fails", async () => {
    const { provider, desktop, sdk, run } = fixture();
    Object.assign(desktop, { trafficAccessToken: undefined });
    run.mockRejectedValue(new Error("command not found"));
    await expect(provider.provision(request, context)).rejects.toThrow("command not found");
    expect(sdk.create).not.toHaveBeenCalled();
  });

  it("destroys a newly created machine if private networking is unconfirmed", async () => {
    const { provider, desktop } = fixture();
    const kill = vi.fn(async () => undefined);
    Object.assign(desktop, { trafficAccessToken: undefined, kill });
    await expect(
      provider.provision({ botId: request.botId, homePath: request.homePath }, context),
    ).rejects.toThrow(/private networking could not be confirmed/);
    expect(kill).toHaveBeenCalledOnce();
  });
});
