import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ComputerRef, SandboxProvider } from "@rakazo/adapter-kit";
import { resolveBotWorkspacePath, teamBotWorkspaceDirectory } from "@rakazo/adapters";
import type { Billing } from "@rakazo/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computerCanaryModel } from "./cli/provider-canary-env.js";
import { testDatabaseUrl } from "./cli/test-database-url.js";
import { cleanupComputerCanary } from "./computer-canary-cleanup.js";
import { sessionCookieHeader } from "./index.js";

const live = process.env.RUN_COMPUTER_E2E === "1";
const describeLive = live ? describe : describe.skip;

describeLive("real model and E2B computer journey", () => {
  let dataDir: string | undefined;
  let handles: Awaited<ReturnType<typeof import("../../../apps/api/src/app.ts")["createApp"]>>;
  let computer: ComputerRef | undefined;

  beforeAll(async () => {
    for (const key of ["DATABASE_URL", "E2B_API_KEY"]) {
      if (!process.env[key]) throw new Error(`${key} is required for pnpm test:computer`);
    }
    if (process.env.BILLING_ENABLED !== "true")
      throw new Error("The computer canary requires the $1 Free allowance enforcement");
    const model = computerCanaryModel(process.env);
    testDatabaseUrl(process.env.DATABASE_URL);
    dataDir = mkdtempSync(path.join(tmpdir(), "rakazo-computer-e2e-"));
    const { createApp } = await import("../../../apps/api/src/app.ts");
    handles = await createApp({
      databaseUrl: process.env.DATABASE_URL!,
      dataDir,
      sandboxProvider: "e2b",
      agentRuntime: "pi",
      e2bApiKey: process.env.E2B_API_KEY,
      deploymentModelKey: model.key,
      defaultProvider: model.provider,
      defaultModel: model.model,
      wakeupDriver: "memory",
    });
    await handles.prisma.deploymentSettings.update({
      where: { id: "default" },
      data: {
        defaultModelProvider: model.provider,
        defaultModelId: model.model,
      },
    });
  }, 120_000);

  afterAll(async () => {
    const currentComputer = computer;
    try {
      await cleanupComputerCanary({
        stopApp: handles ? () => handles.stop() : undefined,
        destroyComputer: currentComputer
          ? () => handles.sandbox.destroy(currentComputer, testContext(currentComputer.botId))
          : undefined,
      });
    } finally {
      if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("observes and clicks a real browser, then uses terminal and files", async () => {
    const stamp = Date.now();
    const signup = await handles.app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:5173" },
      body: JSON.stringify({
        email: `computer-${stamp}@rakazo.test`,
        password: "password12",
        name: "Computer E2E",
      }),
    });
    expect(signup.status).toBeLessThan(400);
    const cookie = sessionCookieHeader(signup);
    const before = await rpc<Billing>(handles.app, cookie, "billing/get", {});
    expect(before.allowanceUsd).toBe(1);
    expect(before.spentUsd).toBe(0);
    const bot = await rpc<{ id: string }>(handles.app, cookie, "bots/create", {
      name: "Operator",
      title: "Computer acceptance test",
      description: "Uses the visible desktop and its tools.",
      instructions:
        "This is an acceptance test. Follow the requested computer tool sequence exactly and do not claim a visual action succeeded until its result is visible.",
      notifyOnFinish: false,
      computerMode: "team",
    });
    await rpc(handles.app, cookie, "computer/boot", { botId: bot.id });
    const storedBot = await handles.prisma.bot.findUniqueOrThrow({
      where: { id: bot.id },
      include: { computer: true },
    });
    const stored = storedBot.computer!;
    computer = {
      id: stored.providerRef!,
      providerRef: stored.providerRef!,
      botId: stored.homeKey,
      kind: "e2b",
      expiresAt: stored.billingCoveredUntil!.toISOString(),
    };
    await installVisualFixture(handles.sandbox, computer, bot.id);

    const sent = await rpc<{ runId: string }>(handles.app, cookie, "threads/send", {
      botId: bot.id,
      text: [
        "Open http://127.0.0.1:8765 using open_path.",
        "Call computer_observe, locate the large CLICK TO PASS button visually, and click it with computer_act.",
        "Re-observe until the page visibly says VISUAL E2E PASSED.",
        "Then use shell to read results/visual-click.txt.",
        "Finally use write_file to create results/llm-confirmed.txt containing exactly visual-e2e-ok.",
      ].join(" "),
    });
    const completedRun = await waitForRun(
      () =>
        handles.prisma.run.findUnique({
          where: { id: sent.runId },
          select: { status: true, error: true },
        }),
      120_000,
    );
    expect(completedRun.status, completedRun.error ?? undefined).toBe("completed");
    const model = computerCanaryModel(process.env);
    const savedRun = await handles.prisma.run.findUniqueOrThrow({ where: { id: sent.runId } });
    expect(savedRun).toMatchObject({
      modelProvider: model.provider,
      modelId: model.model,
      modelFunding: "hosted",
    });
    const after = await rpc<Billing>(handles.app, cookie, "billing/get", {});
    expect(after.spentUsd).toBeGreaterThan(0);
    expect(after.spentUsd + after.reservedUsd).toBeLessThanOrEqual(1);

    const clickMarker = new TextDecoder().decode(
      await handles.sandbox.readFile(
        computer,
        resolveBotWorkspacePath("team", bot.id, "results/visual-click.txt"),
        testContext(bot.id),
      ),
    );
    expect(clickMarker).toBe("visual-click-ok");
    const confirmed = await rpc<{ content: string }>(handles.app, cookie, "computer/readFile", {
      botId: bot.id,
      path: "results/llm-confirmed.txt",
    });
    expect(confirmed.content).toBe("visual-e2e-ok");

    const toolEvents = await handles.prisma.event.findMany({
      where: { runId: sent.runId },
      select: { type: true, payload: true },
    });
    const used = new Set(
      toolEvents.flatMap((event) => {
        if (
          event.type !== "agent.tool.called" ||
          !event.payload ||
          typeof event.payload !== "object"
        ) {
          return [];
        }
        const name = "name" in event.payload ? event.payload.name : undefined;
        return typeof name === "string" ? [name] : [];
      }),
    );
    for (const required of [
      "open_path",
      "computer_observe",
      "computer_act",
      "shell",
      "write_file",
    ]) {
      expect(used).toContain(required);
    }

    const originalRef = computer.providerRef;
    await handles.sandbox.destroy(computer, testContext(bot.id));
    await rpc(handles.app, cookie, "computer/boot", { botId: bot.id });
    const replacementBot = await handles.prisma.bot.findUniqueOrThrow({
      where: { id: bot.id },
      include: { computer: true },
    });
    const replacement = replacementBot.computer!;
    computer = {
      id: replacement.providerRef!,
      providerRef: replacement.providerRef!,
      botId: replacement.homeKey,
      kind: "e2b",
      expiresAt: replacement.billingCoveredUntil!.toISOString(),
    };
    expect(computer.providerRef).not.toBe(originalRef);
    const restored = await rpc<{ content: string }>(handles.app, cookie, "computer/readFile", {
      botId: bot.id,
      path: "results/llm-confirmed.txt",
    });
    expect(restored.content).toBe("visual-e2e-ok");
    await rpc(handles.app, cookie, "computer/stop", { botId: bot.id });
    const stopped = await rpc<Billing>(handles.app, cookie, "billing/get", {});
    expect(stopped.reservedUsd).toBe(0);
    expect(stopped.spentUsd).toBeGreaterThan(0);
    expect(stopped.spentUsd).toBeLessThanOrEqual(1);
  }, 170_000);
});

async function installVisualFixture(
  sandbox: SandboxProvider,
  computer: ComputerRef,
  botId: string,
) {
  const source = `
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

PAGE = b'''<!doctype html><meta charset="utf-8"><title>Rakazo visual test</title>
<style>body{font-family:sans-serif;text-align:center;padding-top:120px}button{width:760px;height:300px;font-size:58px;background:#2563eb;color:white;border:0;border-radius:24px}</style>
<button onclick="fetch('/passed',{method:'POST'}).then(()=>document.body.innerHTML='<h1 style=font-size:72px>VISUAL E2E PASSED</h1>')">CLICK TO PASS</button>'''

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def do_GET(self):
        self.send_response(200); self.send_header('Content-Type', 'text/html'); self.end_headers(); self.wfile.write(PAGE)
    def do_POST(self):
        Path('results').mkdir(exist_ok=True)
        Path('results/visual-click.txt').write_text('visual-click-ok')
        self.send_response(204); self.end_headers()

HTTPServer(('127.0.0.1', 8765), Handler).serve_forever()
`;
  const context = testContext(botId);
  const cwd = teamBotWorkspaceDirectory(botId);
  await sandbox.writeFile(
    computer,
    { path: `${cwd}/visual_server.py`, content: new TextEncoder().encode(source) },
    context,
  );
  for await (const event of sandbox.execute(
    computer,
    {
      cwd,
      argv: ["bash", "-c", "nohup python3 visual_server.py </dev/null > visual-server.log 2>&1 &"],
    },
    context,
  )) {
    if (event.type === "exit" && event.code !== 0)
      throw new Error("fixture server failed to start");
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let ready = false;
    for await (const event of sandbox.execute(
      computer,
      { cwd, argv: ["bash", "-c", "curl -fsS http://127.0.0.1:8765 >/dev/null"] },
      context,
    )) {
      if (event.type === "exit") ready = event.code === 0;
    }
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("visual fixture did not become ready");
}

function testContext(botId: string) {
  return {
    operationId: "computer-e2e",
    traceId: "computer-e2e",
    spaceId: "computer-e2e",
    userId: "computer-e2e",
    botId,
    signal: new AbortController().signal,
  };
}

type App = { request: (input: string, init?: RequestInit) => Promise<Response> };
type RunState = { status: string; error: string | null };

async function rpc<T>(app: App, cookie: string, procedure: string, body: unknown): Promise<T> {
  const response = await app.request(`/rpc/${procedure}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: "http://127.0.0.1:5173" },
    body: JSON.stringify({ json: body }),
  });
  const parsed = (await response.json()) as { json?: T; error?: { message?: string } };
  if (!response.ok || parsed.error) {
    throw new Error(`${procedure} ${response.status}: ${parsed.error?.message ?? "failed"}`);
  }
  return parsed.json as T;
}

async function waitForRun(load: () => Promise<RunState | null>, timeoutMs: number) {
  const started = Date.now();
  let run: RunState | null = null;
  while (Date.now() - started < timeoutMs) {
    run = await load();
    if (run && ["completed", "failed", "cancelled"].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`computer E2E timed out with status ${run?.status ?? "unknown"}`);
}
