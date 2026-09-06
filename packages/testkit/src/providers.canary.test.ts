import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { BoxSandboxProvider, E2BSandboxProvider, PiAgentRuntime } from "@rakazo/adapters";
import { afterAll, describe, expect, it } from "vitest";
import { sandboxCanaryRequest } from "./cli/provider-canary-env.js";
import { testDatabaseUrl } from "./cli/test-database-url.js";
import { sessionCookieHeader } from "./index.js";
import { CanaryRfbConnection } from "./rfb-canary.js";

const liveE2b = process.env.VERIFY_PROVIDERS === "1" && Boolean(process.env.E2B_API_KEY);
const liveBox = process.env.VERIFY_PROVIDERS === "1" && Boolean(process.env.BOX_API_KEY);
const livePi = process.env.VERIFY_PROVIDERS === "1" && Boolean(process.env.OPENROUTER_API_KEY);
const livePiApp = Boolean(livePi && process.env.DATABASE_URL);
if (livePiApp) testDatabaseUrl(process.env.DATABASE_URL);

const describeE2b = liveE2b ? describe : describe.skip;
const describeBox = liveBox ? describe : describe.skip;
const describePi = livePi ? describe : describe.skip;
const describePiApp = livePiApp ? describe : describe.skip;

describeE2b("live E2B canary", () => {
  it("checks desktop, files and pause/resume within a fixed lifetime, then destroys it", async () => {
    const sandbox = new E2BSandboxProvider(process.env.E2B_API_KEY!);
    const ctx = {
      operationId: "canary",
      traceId: "canary",
      spaceId: "canary",
      userId: "canary",
      signal: AbortSignal.timeout(150_000),
    };
    const request = sandboxCanaryRequest();
    let computer = await sandbox.provision(request, ctx);
    const failures: unknown[] = [];
    const connections: CanaryRfbConnection[] = [];
    let closeProxy: (() => Promise<void>) | undefined;
    try {
      await sandbox.prepare(computer, ctx);
      let stdout = "";
      for await (const event of sandbox.execute(computer, { argv: ["echo", "e2b-ok"] }, ctx)) {
        if (event.type === "stdout") stdout += event.data;
        if (event.type === "exit") expect(event.code).toBe(0);
      }
      expect(stdout).toContain("e2b-ok");
      await sandbox.writeFile(
        computer,
        { path: "canary.txt", content: new TextEncoder().encode("e2b-preserved") },
        ctx,
      );
      const observed = await sandbox.observe(computer, ctx);
      expect(observed.width).toBeGreaterThan(1);
      expect(observed.height).toBeGreaterThan(1);
      expect(observed.image.byteLength).toBeGreaterThan(100);
      const view = await sandbox.connectScreen(computer, { view: "stream" }, ctx);
      if (!view.url || !view.upstreamHeaders?.["e2b-traffic-access-token"]) {
        throw new Error("Computer must provide a private screen connection");
      }
      const direct = new URL(view.url);
      direct.search = "";
      const anonymous = await fetch(direct, {
        signal: AbortSignal.timeout(10_000),
        redirect: "manual",
      });
      expect([401, 403]).toContain(anonymous.status);
      await anonymous.body?.cancel();

      // Exercise the same sealed upstream header boundary used by the product.
      const { attachNovncProxy } = await import("../../../apps/api/src/novnc-proxy.js");
      const { addScreenProxyCapability } = await import("../../../apps/api/src/screen-proxy.js");
      const secret = randomBytes(32).toString("hex");
      const server = createServer((_req, res) => {
        res.writeHead(404);
        res.end();
      });
      const sockets = new Set<Socket>();
      server.on("connection", (socket) => {
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
      });
      attachNovncProxy(server, secret);
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      closeProxy = async () => {
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      };
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Canary proxy did not listen");
      const origin = `http://127.0.0.1:${address.port}`;
      const connect = async (screen: typeof view, password?: string) => {
        if (!screen.url) throw new Error("Screen URL missing");
        const proxy = new URL(
          addScreenProxyCapability(screen.url, secret, origin, Date.now(), {
            proxyExternal: true,
            upstreamHeaders: screen.upstreamHeaders,
          }),
        );
        proxy.protocol = "ws:";
        proxy.pathname = proxy.pathname.replace(/\/vnc.html$/, "/websockify");
        proxy.search = "";
        const connection = await CanaryRfbConnection.connect(
          proxy.toString(),
          password ?? new URL(screen.url).searchParams.get("password") ?? "",
        );
        connections.push(connection);
        return connection;
      };
      const viewer = await connect(view);
      await sandbox.act(
        computer,
        { actions: [{ kind: "pointer", type: "move", x: 100, y: 100 }], observe: false },
        ctx,
      );
      viewer.move(500, 500);
      await delay(250, undefined, { signal: ctx.signal });
      expect((await sandbox.observe(computer, ctx)).cursor).toEqual({ x: 100, y: 100 });
      const control = await sandbox.connectScreen(
        computer,
        { view: "stream", interactive: true, controlToken: "canary-control-1" },
        ctx,
      );
      const controller = await connect(control);
      controller.move(500, 500);
      await delay(250, undefined, { signal: ctx.signal });
      expect((await sandbox.observe(computer, ctx)).cursor).toEqual({ x: 500, y: 500 });
      // A view capability remains read-only while the separate control lease is active.
      viewer.move(200, 200);
      await delay(250, undefined, { signal: ctx.signal });
      expect((await sandbox.observe(computer, ctx)).cursor).toEqual({ x: 500, y: 500 });
      await sandbox.setScreenControl(computer, false, ctx, "canary-control-1");
      await controller.expectClosed();
      const replacement = await sandbox.connectScreen(
        computer,
        { view: "stream", interactive: true, controlToken: "canary-control-2" },
        ctx,
      );
      const oldPassword = new URL(control.url!).searchParams.get("password")!;
      await expect(connect(replacement, oldPassword)).rejects.toThrow("VNC authentication denied");
      const replacementController = await connect(replacement);
      await sandbox.setScreenControl(computer, false, ctx, "canary-control-2");
      await replacementController.expectClosed();
      viewer.close();
      await sandbox.stop(computer, ctx);
      // Reconnect the same handle. provision() could replace a missing sandbox;
      // this one-resource probe must fail without creating another.
      computer = { ...computer, fresh: false };
      await sandbox.prepare(computer, ctx);
      expect(new TextDecoder().decode(await sandbox.readFile(computer, "canary.txt", ctx))).toBe(
        "e2b-preserved",
      );
    } catch (error) {
      failures.push(error);
    }
    for (const connection of connections) connection.close();
    await closeProxy?.().catch((error) => failures.push(error));
    await sandbox
      .destroy(computer, { ...ctx, signal: AbortSignal.timeout(15_000) })
      .catch((error) => failures.push(error));
    if (failures.length) throw new AggregateError(failures, "Sandbox canary or cleanup failed");
  }, 170_000);
});

describeBox("live Box canary", () => {
  it("provisions a desktop, observes it, preserves a file across stop/resume, and destroys it", async () => {
    const sandbox = new BoxSandboxProvider({
      apiKey: process.env.BOX_API_KEY!,
      apiUrl: process.env.BOX_API_URL ?? process.env.BOX_BASE_URL,
    });
    const ctx = {
      operationId: "box-canary",
      traceId: "box-canary",
      spaceId: "box-canary",
      userId: "box-canary",
      signal: new AbortController().signal,
    };
    const request = { botId: "box-canary", homePath: "/home/user/rakazo-home" };
    let computer = await sandbox.provision(request, ctx);
    try {
      await sandbox.prepare(computer, ctx);
      let stdout = "";
      for await (const event of sandbox.execute(computer, { argv: ["echo", "box-ok"] }, ctx)) {
        if (event.type === "stdout") stdout += event.data;
        if (event.type === "exit") expect(event.code).toBe(0);
      }
      expect(stdout).toContain("box-ok");
      await sandbox.writeFile(
        computer,
        { path: "canary.txt", content: new TextEncoder().encode("preserved") },
        ctx,
      );
      expect((await sandbox.observe(computer, ctx)).image.byteLength).toBeGreaterThan(0);

      await sandbox.stop(computer, ctx);
      computer = await sandbox.provision(
        { ...request, providerRef: computer.providerRef, providerKind: computer.kind },
        ctx,
      );
      expect(computer.fresh).toBe(false);
      await sandbox.prepare(computer, ctx);
      expect(new TextDecoder().decode(await sandbox.readFile(computer, "canary.txt", ctx))).toBe(
        "preserved",
      );
    } finally {
      await sandbox.destroy(computer, ctx);
    }
  }, 240_000);
});

describePi("live OpenRouter / Pi canary", () => {
  it("streams a reply from deepseek/deepseek-v4-flash-0731", async () => {
    const runtime = new PiAgentRuntime();
    let text = "";
    for await (const event of runtime.run(
      {
        botId: "canary",
        threadId: "canary",
        runId: `pi-${Date.now()}`,
        prompt: "Reply with exactly the word pong and nothing else.",
        instructions: "You are a concise test bot. Do not call tools.",
        history: [],
        tools: [],
        model: {
          provider: "openrouter",
          id: "deepseek/deepseek-v4-flash-0731",
          apiKey: process.env.OPENROUTER_API_KEY,
        },
      },
      {
        operationId: "canary",
        traceId: "canary",
        spaceId: "canary",
        userId: "canary",
        signal: new AbortController().signal,
      },
    )) {
      if (event.type === "text") text += event.text;
      if (event.type === "done" && event.text && !text) text = event.text;
    }
    expect(text.toLowerCase()).toMatch(/pong/);
    expect(text).not.toMatch(/sk-or-|OPENROUTER_API_KEY/i);
  }, 90_000);
});

describePiApp("live OpenRouter product journey", () => {
  let stop: (() => Promise<void>) | undefined;

  afterAll(async () => {
    await stop?.();
  });

  it("completes a bot turn through the API with the live model", async () => {
    const { createApp } = await import("../../../apps/api/src/app.ts");
    const dataDir = mkdtempSync(path.join(tmpdir(), "rakazo-pi-"));
    const handles = await createApp({
      databaseUrl: process.env.DATABASE_URL!,
      dataDir,
      sandboxProvider: "fake",
      agentRuntime: "pi",
    });
    stop = handles.stop;
    const stamp = Date.now();
    const email = `pi-${stamp}@rakazo.test`;
    const signup = await handles.app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:5173" },
      body: JSON.stringify({ email, password: "password12", name: "Pi Canary" }),
    });
    expect(signup.status).toBeLessThan(400);
    const cookie = sessionCookieHeader(signup);
    const botRes = await rpc<{ id: string }>(handles.app, cookie, "bots/create", {
      name: "Chief",
      title: "Chief of staff",
      description: "Canary",
      instructions: "Reply briefly. Prefer the write_file tool when asked to write a file.",
      notifyOnFinish: true,
    });
    const sent = await rpc<{ runId: string }>(handles.app, cookie, "threads/send", {
      botId: botRes.id,
      text: "Use write_file to save notes/result.txt containing exactly openrouter-ok",
    });
    // Bot snapshots omit completed runs. Follow the exact durable run rather than
    // mistaking an idle snapshot for completion or expecting a terminal UI run.
    await expect
      .poll(
        () =>
          handles.prisma.run.findUnique({
            where: { id: sent.runId },
            select: { status: true },
          }),
        { timeout: 90_000 },
      )
      .toMatchObject({ status: "completed" });
    const snap = await rpc(handles.app, cookie, "threads/get", { botId: botRes.id });
    const blob = JSON.stringify(snap);
    expect(blob).not.toMatch(/sk-or-/i);
    const file = await rpc<{ content: string }>(handles.app, cookie, "computer/readFile", {
      botId: botRes.id,
      path: "notes/result.txt",
    });
    expect(file.content).toBe("openrouter-ok");
  }, 120_000);
});

type App = { request: (input: string, init?: RequestInit) => Promise<Response> };

async function rpc<T>(app: App, cookie: string, proc: string, body: unknown = {}): Promise<T> {
  const res = await app.request(`/rpc/${proc}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: "http://127.0.0.1:5173" },
    body: JSON.stringify({ json: body }),
  });
  const parsed = (await res.json()) as { json?: T; error?: { message?: string } };
  if (res.status >= 400 || parsed.error)
    throw new Error(`${proc} ${res.status}: ${parsed.error?.message ?? "failed"}`);
  return parsed.json as T;
}
