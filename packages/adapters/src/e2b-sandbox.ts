import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { type CommandResult, Sandbox, TimeoutError } from "@e2b/desktop";
import type {
  AdapterContext,
  CommandRequest,
  ComputerAction,
  ComputerActionRequest,
  ComputerFileEntry,
  ComputerInput,
  ComputerObservation,
  ComputerRef,
  ControlLeaseRef,
  PortableFile,
  ProcessEvent,
  SandboxProvider,
  ScreenRequest,
  ScreenSession,
} from "@rakazo/adapter-kit";
import { boundedSandboxCommandTimeoutMs, hostedBillingEnabled, PlanLimitError } from "@rakazo/core";
import { sandboxIdleMs } from "./computer-idle.js";
import { ComputerScreenUnavailableError, screenSessionKey } from "./computer-screens.js";
import {
  boundedComputerActions,
  clampRounded,
  computerObservation,
  normalizeWorkspacePath,
  shellQuote,
  workspacePath,
} from "./computer-support.js";
import {
  PORTABLE_BROWSER_STOP_COMMAND,
  PORTABLE_TRANSFER_BATCH_BYTES,
  shouldSkipPortableWorkspaceFile,
} from "./computer-workspace.js";
import {
  allocateExtraDisplayCommand,
  ensureExtraDisplayCommand,
  ensurePrimaryNovncCommand,
  extraDisplayActionCommand,
  extraDisplayControlStartCommand,
  extraDisplayControlStopCommand,
  extraDisplayInputCommand,
  extraDisplayLayout,
  observeExtraDisplayCommand,
  parseAllocatedExtraDisplay,
  parseExtraDisplayObservation,
  parseExtraDisplayViewPassword,
  parseReleasedExtraDisplay,
  primaryStreamCleanupCommand,
  releaseExtraDisplayCommand,
} from "./extra-displays.js";

const E2B_WORKSPACE = "/home/user/rakazo-home";
const E2B_BROWSER_PROFILES = `${E2B_WORKSPACE}/.browser-profiles`;

export interface E2BSandboxSdk {
  create(options: ReturnType<typeof e2bCreateOptions>): Promise<Sandbox>;
  connect(id: string, options: { apiKey: string; timeoutMs: number }): Promise<Sandbox>;
  pause(id: string, options: { apiKey: string }): Promise<void>;
  kill(
    id: string,
    options: { apiKey: string; signal: AbortSignal; requestTimeoutMs: number },
  ): Promise<boolean>;
}

export function e2bLifetimeMs(expiresAt?: string, now = Date.now()): number {
  if (!expiresAt) {
    if (hostedBillingEnabled(process.env.BILLING_ENABLED))
      throw new Error("Hosted computers require prepaid lifetime coverage.");
    return sandboxIdleMs();
  }
  const remaining = Date.parse(expiresAt) - now;
  if (!Number.isFinite(remaining) || remaining <= 0)
    throw new PlanLimitError("Computer usage coverage has expired.");
  return Math.max(1, Math.min(sandboxIdleMs(), Math.floor(remaining)));
}

export function e2bCreateOptions(botId: string, apiKey: string, expiresAt?: string) {
  return {
    apiKey,
    timeoutMs: e2bLifetimeMs(expiresAt),
    metadata: { botId, rakazo: "computer" },
    resolution: [1280, 800] as [number, number],
    lifecycle: { onTimeout: "pause" as const, autoResume: false },
    network: { allowPublicTraffic: false },
  };
}

// A sandbox that has expired stops resolving as a host, so reaching it fails at the socket
// rather than with a 404. undici reports every one of those as a bare "fetch failed" and
// hides the errno on the cause chain. Used only by provision reconnect: replaceComputer must
// not treat these as permanent, or an update-mode checkpoint blip destroys the old box
// without committing workspace changes that exist only there.
const SANDBOX_UNREACHABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

export function isUnreachableTransportError(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && SANDBOX_UNREACHABLE_CODES.has(code)) return true;
    if (current.message === "fetch failed") return true;
  }
  return false;
}

/**
 * True when the sandbox is permanently gone (404 / killed / not found). Used by
 * replaceComputer to decide whether to swallow checkpoint/destroy failures.
 * Transient transport errors stay recoverable so update/reset can abort without
 * discarding an uncommitted workspace on a still-reachable box.
 */
export function isUnrecoverableSandboxError(error: unknown): boolean {
  if (LEGACY_GONE_MESSAGE.test(errorMessage(error))) return true;
  return isSandboxGoneError(error);
}

// How the E2B SDK words a sandbox that no longer exists. It does not always say "not found":
// an expired sandbox surfaces as a TimeoutError about the *sandbox* timeout (502 / Unavailable
// from envd), which used to read as a live sandbox and left every later call throwing forever.
const SANDBOX_GONE_MESSAGE =
  /probably not running anymore|likely due to sandbox timeout|killed or reached its end of life|sandbox [^:]{0,60}not found|sandbox [^:]{0,60}does not exist/i;
// The same words from a live sandbox: a missing binary or a missing file inside it.
const SHELL_MISSING_TARGET = /command not found|no such file|^path .* not found/i;
const LEGACY_GONE_MESSAGE =
  /not found|does not exist|404|not_found|killed|doesn't exist|sandbox not found/i;

/**
 * Narrower than isUnrecoverableSandboxError: the provider itself said this sandbox is gone.
 * A missing binary or a missing file inside a live sandbox is not proof of death, so callers
 * that persist "the sandbox is gone" must use this one.
 */
export function isSandboxGoneError(error: unknown): boolean {
  const message = errorMessage(error);
  if (SHELL_MISSING_TARGET.test(message)) return false;
  if (SANDBOX_GONE_MESSAGE.test(message)) return true;
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    if (current.name === "SandboxNotFoundError") return true;
  }
  return false;
}

/** E2B returns 409 when stream.start runs against a sandbox that already has a stream. */
export function isStreamAlreadyStartedError(error: unknown): boolean {
  if (errorHttpStatus(error) === 409) return true;
  return /already (?:started|running)|stream is already/i.test(errorMessage(error));
}

/** E2B waits with `netstat`, which desktop images often lack, then throws even if noVNC is up. */
export function isNovncWaitError(error: unknown): boolean {
  return /could not start novnc/i.test(errorMessage(error));
}

function errorHttpStatus(error: unknown): number | undefined {
  for (let current: unknown = error; current && typeof current === "object"; ) {
    const record = current as { status?: unknown; statusCode?: unknown; cause?: unknown };
    const status = Number(record.status ?? record.statusCode);
    if (Number.isInteger(status) && status > 0) return status;
    current = record.cause;
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const E2B_BROWSER_APPS = ["google-chrome", "firefox", "chromium"] as const;

type E2BDesktopBrowser = {
  launch: (application: string, uri?: string) => Promise<void>;
  open: (fileOrUrl: string) => Promise<void>;
};

type E2BDesktopCommands = {
  run: (cmd: string) => Promise<{ exitCode?: number }>;
};

export async function openDesktopBrowser(desktop: E2BDesktopBrowser): Promise<void> {
  for (const app of E2B_BROWSER_APPS) {
    try {
      await desktop.launch(app);
      return;
    } catch {
      // try the next installed browser
    }
  }
  await desktop.open("https://www.google.com").catch(() => undefined);
}

/** Open an http(s) URL via a named browser — avoids the broken default-browser association. */
export async function openDesktopUrl(
  desktop: E2BDesktopBrowser & { commands: E2BDesktopCommands },
  url: string,
): Promise<void> {
  for (const app of E2B_BROWSER_APPS) {
    // Prefer a foreground gtk-launch so missing desktop entries / launch failures reject
    // and we can try the next browser. desktop.launch backgrounds and always resolves.
    const launched = await desktop.commands
      .run(`gtk-launch ${shellQuote(app)} ${shellQuote(url)}`)
      .then(
        (result) => (result.exitCode ?? 0) === 0,
        () => false,
      );
    if (launched) return;
  }
  await desktop.open(url);
}

export class E2BSandboxProvider implements SandboxProvider {
  private readonly boxes = new Map<string, Sandbox>();
  private readonly lastTouchedAt = new Map<string, number>();
  private readonly streamReady = new Map<string, string>();
  private readonly streamStarts = new Map<string, Promise<void>>();

  constructor(
    private readonly apiKey: string,
    private readonly sdk: E2BSandboxSdk = Sandbox as unknown as E2BSandboxSdk,
  ) {}

  describe() {
    return {
      id: "e2b",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: {
        graphical: true,
        pty: true,
        snapshots: true,
        takeover: true,
        persistentHome: true,
        multiScreen: true,
        boundedLifetime: true,
      },
    };
  }

  private async box(computer: ComputerRef): Promise<Sandbox> {
    const timeoutMs = e2bLifetimeMs(computer.expiresAt);
    const id = computer.providerRef || computer.id;
    const existing = this.boxes.get(id);
    if (existing) {
      const lastTouched = this.lastTouchedAt.get(id) ?? 0;
      if (Date.now() - lastTouched < 60_000) return existing;
      // A cached handle to a sandbox E2B already killed keeps throwing on every call, and the
      // process never reconnects. The keepalive is the cheapest place to notice and drop it.
      const gone = await existing.setTimeout(timeoutMs).then(
        () => false,
        (error: unknown) => {
          if (computer.expiresAt && !isSandboxGoneError(error)) throw error;
          return isSandboxGoneError(error);
        },
      );
      if (!gone) {
        this.lastTouchedAt.set(id, Date.now());
        return existing;
      }
      this.forget(id);
    }
    const connected = await this.sdk.connect(id, {
      apiKey: this.apiKey,
      timeoutMs,
    });
    await this.hardenReconnect(connected, computer.expiresAt);
    this.boxes.set(connected.sandboxId, connected);
    this.lastTouchedAt.set(connected.sandboxId, Date.now());
    return connected;
  }

  private async startStream(desktop: Sandbox) {
    if (this.boxes.get(desktop.sandboxId) !== desktop) {
      throw new Error("screen stream stopped during computer teardown");
    }
    if (this.streamReady.has(desktop.sandboxId)) return;
    const pending = this.streamStarts.get(desktop.sandboxId);
    if (pending) return pending;
    let start!: Promise<void>;
    start = this.initializeStream(desktop).finally(() => {
      if (this.streamStarts.get(desktop.sandboxId) === start) {
        this.streamStarts.delete(desktop.sandboxId);
      }
    });
    this.streamStarts.set(desktop.sandboxId, start);
    return start;
  }

  private async initializeStream(desktop: Sandbox) {
    // Do not call E2B `stream.start()`: it waits with `netstat` (often missing) and can
    // 409 without setting `this.url`. Start noVNC ourselves and build the URL from getHost(6080).
    const password = await this.ensurePrimaryView(desktop);
    const current = this.boxes.get(desktop.sandboxId);
    if (current !== desktop) {
      if (!current) await desktop.commands.run(primaryStreamCleanupCommand());
      throw new Error("screen stream stopped during computer teardown");
    }
    this.streamReady.set(desktop.sandboxId, password);
  }

  private async ensurePrimaryView(desktop: Sandbox): Promise<string> {
    const ensured = await this.runSetupCommand(
      desktop,
      ensurePrimaryNovncCommand(desktop.display ?? ":0", randomBytes(6).toString("base64url")),
      undefined,
      45_000,
    );
    if (ensured.exitCode !== 0) {
      const detail = [ensured.stderr, ensured.stdout]
        .filter((value) => value?.trim())
        .join("\n")
        .trim();
      throw new Error(detail || `desktop stream failed to start (exit ${ensured.exitCode})`);
    }
    return parseExtraDisplayViewPassword(ensured.stdout);
  }

  private async hardenReconnect(desktop: Sandbox, expiresAt?: string): Promise<void> {
    // connect() only extends running deadlines; explicitly shorten to prepaid coverage.
    if (expiresAt) await desktop.setTimeout(e2bLifetimeMs(expiresAt));
    if (desktop.trafficAccessToken) return;
    // Legacy public machines must be safe before any caller can reuse the handle.
    // Preserve the machine/files; never replace a computer after an unknown outcome.
    const stopped = await this.runSetupCommand(
      desktop,
      extraDisplayControlStopCommand(extraDisplayLayout(0, desktop.display ?? ":0")),
    );
    if (stopped.exitCode !== 0) throw new Error("Legacy computer control could not be revoked");
    const password = await this.ensurePrimaryView(desktop);
    this.streamReady.set(desktop.sandboxId, password);
  }

  private screenSession(
    desktop: Sandbox,
    layout: ReturnType<typeof extraDisplayLayout>,
    password: string,
    interactive: boolean,
  ): ScreenSession {
    const url = new URL(
      `https://${desktop.getHost(interactive ? layout.controlPort : layout.viewPort)}/vnc.html`,
    );
    url.searchParams.set("autoconnect", "true");
    url.searchParams.set("resize", "scale");
    url.searchParams.set("view_only", interactive ? "false" : "true");
    url.searchParams.set("password", password);
    return {
      url: url.toString(),
      mimeType: "text/html",
      ...(desktop.trafficAccessToken
        ? { upstreamHeaders: { "e2b-traffic-access-token": desktop.trafficAccessToken } }
        : {}),
      close: async () => undefined,
    };
  }

  async provision(
    request: {
      botId: string;
      homePath: string;
      providerRef?: string;
      providerKind?: ComputerRef["kind"];
      expiresAt?: string;
    },
    _context: AdapterContext,
  ): Promise<ComputerRef> {
    if (request.providerRef && request.providerKind === "e2b") {
      let desktop: Sandbox | undefined;
      try {
        desktop = await this.sdk.connect(request.providerRef, {
          apiKey: this.apiKey,
          timeoutMs: e2bLifetimeMs(request.expiresAt),
        });
      } catch (error) {
        this.forget(request.providerRef);
        // Never allocate a second paid machine while the first machine's outcome is unknown.
        const gone = request.expiresAt
          ? isSandboxGoneError(error)
          : isUnrecoverableSandboxError(error) || isUnreachableTransportError(error);
        if (!gone) throw error;
      }
      if (desktop) {
        try {
          await this.hardenReconnect(desktop, request.expiresAt);
        } catch (error) {
          this.forget(request.providerRef);
          throw error;
        }
        this.boxes.set(desktop.sandboxId, desktop);
        this.lastTouchedAt.set(desktop.sandboxId, Date.now());
        return {
          id: desktop.sandboxId,
          botId: request.botId,
          kind: "e2b",
          providerRef: desktop.sandboxId,
          fresh: false,
          ...(request.expiresAt ? { expiresAt: request.expiresAt } : {}),
        };
      }
    }
    const desktop = await this.sdk.create(
      e2bCreateOptions(request.botId, this.apiKey, request.expiresAt),
    );
    if (!desktop.trafficAccessToken) {
      await desktop.kill();
      throw new Error("Computer private networking could not be confirmed");
    }
    this.boxes.set(desktop.sandboxId, desktop);
    this.lastTouchedAt.set(desktop.sandboxId, Date.now());
    return {
      id: desktop.sandboxId,
      botId: request.botId,
      kind: "e2b",
      providerRef: desktop.sandboxId,
      fresh: true,
      ...(request.expiresAt ? { expiresAt: request.expiresAt } : {}),
    };
  }

  async prepare(computer: ComputerRef, _context: AdapterContext): Promise<void> {
    const desktop = await this.box(computer);
    if (computer.fresh) await desktop.files.makeDir(E2B_WORKSPACE);
    const profilesChanged = await configurePortableBrowserProfiles(desktop);
    await configureDefaultWebBrowser(desktop);
    if (!computer.fresh && profilesChanged) await openDesktopBrowser(desktop);
  }

  async *execute(
    computer: ComputerRef,
    request: CommandRequest,
    context: AdapterContext,
  ): AsyncIterable<ProcessEvent> {
    const desktop = await this.box(computer);
    const cmd = request.argv.map(shellQuote).join(" ");
    const timeoutMs = boundedSandboxCommandTimeoutMs(request.timeoutMs);
    try {
      const result = await desktop.commands.run(cmd, {
        cwd: e2bCwd(request.cwd),
        envs: request.env,
        signal: context.signal,
        timeoutMs,
      });
      if (result.stdout) yield { type: "stdout", data: result.stdout };
      if (result.stderr) yield { type: "stderr", data: result.stderr };
      yield { type: "exit", code: result.exitCode ?? 0 };
    } catch (error) {
      if (error instanceof TimeoutError) {
        yield {
          type: "stderr",
          data: `command timed out after ${timeoutMs} ms\n`,
        };
        yield { type: "exit", code: 124 };
        return;
      }
      throw error;
    }
  }

  async connectScreen(
    computer: ComputerRef,
    request: ScreenRequest,
    context: AdapterContext,
  ): Promise<ScreenSession> {
    if (request.interactive && !request.controlToken) {
      throw new Error("interactive screen requires a control token");
    }
    const desktop = await this.box(computer);
    const screenKey = screenSessionKey(context);
    const layout = await this.resolveLayout(desktop, screenKey, context.screenLeaseId);
    const viewPassword = await this.ensureViewStream(desktop, layout, context);
    if (request.interactive) {
      const password = await this.startControlStream(
        desktop,
        request.controlToken!,
        screenKey,
        layout,
      );
      return this.screenSession(desktop, layout, password, true);
    }
    return this.screenSession(desktop, layout, viewPassword, false);
  }

  async setScreenControl(
    computer: ComputerRef,
    interactive: boolean,
    context: AdapterContext,
    controlToken?: string,
  ): Promise<void> {
    if (interactive && !controlToken)
      throw new Error("interactive screen requires a control token");
    const desktop = await this.box(computer);
    const screenKey = screenSessionKey(context);
    const layout = await this.resolveLayout(desktop, screenKey, context.screenLeaseId);
    if (interactive) {
      await this.ensureViewStream(desktop, layout, context);
      await this.startControlStream(desktop, controlToken!, screenKey, layout);
    } else {
      await this.stopControlStream(desktop, controlToken, screenKey, layout);
    }
  }

  private async ensureViewStream(
    desktop: Sandbox,
    layout: ReturnType<typeof extraDisplayLayout>,
    context: AdapterContext,
  ): Promise<string> {
    if (!layout.isPrimary) return this.ensureExtraDisplay(desktop, layout, context);
    await this.startStream(desktop);
    const password = this.streamReady.get(desktop.sandboxId);
    if (!password) throw new ComputerScreenUnavailableError();
    return password;
  }

  async sendInput(
    computer: ComputerRef,
    input: ComputerInput,
    _lease: ControlLeaseRef,
    context: AdapterContext,
  ): Promise<void> {
    const desktop = await this.box(computer);
    const layout = await this.resolveLayout(
      desktop,
      screenSessionKey(context),
      context.screenLeaseId,
    );
    if (layout.isPrimary) {
      await applyE2BAction(desktop, input);
      return;
    }
    await this.ensureExtraDisplay(desktop, layout, context);
    const result = await desktop.commands.run(extraDisplayInputCommand(layout, input), {
      signal: context.signal,
    });
    if (result.exitCode !== 0) throw new Error(result.stderr || "extra display input failed");
  }

  async observe(computer: ComputerRef, context: AdapterContext): Promise<ComputerObservation> {
    const desktop = await this.box(computer);
    const layout = await this.resolveLayout(
      desktop,
      screenSessionKey(context),
      context.screenLeaseId,
    );
    if (layout.isPrimary) return observeE2BDesktop(desktop, context);
    await this.ensureExtraDisplay(desktop, layout, context);
    const result = await desktop.commands.run(observeExtraDisplayCommand(layout), {
      signal: context.signal,
    });
    if (result.exitCode !== 0) throw new Error(result.stderr || "extra display observation failed");
    const parsed = parseExtraDisplayObservation(result.stdout);
    return computerObservation(parsed.image, {
      mimeType: "image/png",
      width: 1280,
      height: 800,
      cursor: parsed.cursor,
    });
  }

  async act(computer: ComputerRef, request: ComputerActionRequest, context: AdapterContext) {
    const desktop = await this.box(computer);
    const layout = await this.resolveLayout(
      desktop,
      screenSessionKey(context),
      context.screenLeaseId,
    );
    const actions = boundedComputerActions(request.actions);
    let completed = 0;
    if (!layout.isPrimary) await this.ensureExtraDisplay(desktop, layout, context);
    for (const action of actions) {
      if (context.signal.aborted)
        throw context.signal.reason ?? new Error("computer action aborted");
      if (layout.isPrimary) await applyE2BAction(desktop, action);
      else {
        const result = await desktop.commands.run(extraDisplayActionCommand(layout, action), {
          signal: context.signal,
        });
        if (result.exitCode !== 0) throw new Error(result.stderr || "extra display action failed");
      }
      completed += 1;
    }
    if (request.settleMs) await desktop.wait(clampRounded(request.settleMs, 0, 5_000));
    return {
      completed,
      ...(request.observe === false ? {} : { observation: await this.observe(computer, context) }),
    };
  }

  async listFiles(
    computer: ComputerRef,
    directory: string,
    context: AdapterContext,
  ): Promise<ComputerFileEntry[]> {
    const desktop = await this.box(computer);
    const relative = normalizeWorkspacePath(directory);
    const entries = await desktop.files.list(workspacePath(E2B_WORKSPACE, relative), {
      signal: context.signal,
    });
    return entries.flatMap((entry) => {
      if (entry.type !== "file" && entry.type !== "dir") return [];
      return [
        {
          path: normalizeWorkspacePath(relative ? `${relative}/${entry.name}` : entry.name),
          kind: entry.type,
          size: entry.size,
          ...(entry.type === "file" && entry.mode & 0o100 ? { executable: true } : {}),
        },
      ];
    });
  }

  async readFile(
    computer: ComputerRef,
    filePath: string,
    context: AdapterContext,
    options?: { maxBytes?: number },
  ) {
    const desktop = await this.box(computer);
    const target = workspacePath(E2B_WORKSPACE, filePath);
    if (options?.maxBytes !== undefined) {
      const info = await desktop.files.getInfo(target, {
        signal: context.signal,
      });
      if (info.size > options.maxBytes) {
        throw new Error(`computer file exceeds ${options.maxBytes} bytes`);
      }
    }
    return desktop.files.read(target, {
      format: "bytes",
      signal: context.signal,
    });
  }

  async writeFile(computer: ComputerRef, file: PortableFile, context: AdapterContext) {
    const desktop = await this.box(computer);
    await writeE2BFiles(desktop, [file], context);
  }

  async *exportWorkspace(
    computer: ComputerRef,
    context: AdapterContext,
  ): AsyncIterable<PortableFile> {
    const desktop = await this.box(computer);
    await stopDesktopBrowsers(desktop);
    try {
      yield* walkE2BWorkspace(desktop, "", context);
    } finally {
      if (context.operationId !== "stop" && context.operationId !== "computer.sleep") {
        await openDesktopBrowser(desktop);
      }
    }
  }

  async importWorkspace(
    computer: ComputerRef,
    files: AsyncIterable<PortableFile>,
    context: AdapterContext,
  ): Promise<void> {
    const desktop = await this.box(computer);
    await stopDesktopBrowsers(desktop);
    let batch: PortableFile[] = [];
    let batchBytes = 0;
    const flush = async () => {
      if (!batch.length) return;
      await writeE2BFiles(desktop, batch, context);
      batch = [];
      batchBytes = 0;
    };
    for await (const file of files) {
      if (
        batch.length >= 32 ||
        batchBytes + file.content.byteLength > PORTABLE_TRANSFER_BATCH_BYTES
      ) {
        await flush();
      }
      batch.push(file);
      batchBytes += file.content.byteLength;
    }
    await flush();
    await openDesktopBrowser(desktop);
  }

  async snapshot(computer: ComputerRef, _context: AdapterContext) {
    const observation = await this.observe(computer, _context);
    return { id: observation.frameId, createdAt: observation.capturedAt };
  }

  async keepAlive(computer: ComputerRef, options?: { expiresAt?: string }): Promise<void> {
    const covered = options?.expiresAt ? { ...computer, expiresAt: options.expiresAt } : computer;
    const desktop = await this.box(covered);
    try {
      await desktop.setTimeout(e2bLifetimeMs(covered.expiresAt));
    } catch (error) {
      if (covered.expiresAt) throw error;
      // Heartbeats refresh lastTouchedAt; if we swallow a gone error here, box() never
      // reaches its 60s probe and keeps handing back the dead cached handle.
      if (isSandboxGoneError(error)) {
        this.forget(desktop.sandboxId);
        return;
      }
    }
    this.lastTouchedAt.set(desktop.sandboxId, Date.now());
  }

  async releaseScreen(computer: ComputerRef, context: AdapterContext): Promise<void> {
    const id = computer.providerRef || computer.id;
    const screenKey = screenSessionKey(context);
    const desktop = this.boxes.get(id) ?? (await this.box(computer).catch(() => undefined));
    if (!desktop) return;
    const released = await this.runSetupCommand(
      desktop,
      releaseExtraDisplayCommand(screenKey, context.screenLeaseId, desktop.display ?? ":0"),
    );
    if (released.exitCode !== 0) throw new ComputerScreenUnavailableError();
    const index = parseReleasedExtraDisplay(released.stdout);
    if (index === undefined) return;
    if (index === 0) this.streamReady.delete(id);
    // Non-primary teardown runs inside the registry lock before the slot is reusable.
  }

  async stop(computer: ComputerRef, _context: AdapterContext): Promise<void> {
    const id = computer.providerRef || computer.id;
    const pending = this.streamStarts.get(id);
    const desktop = this.boxes.get(id);
    this.forget(id);
    await settleForTeardown(pending);
    if (computer.expiresAt) {
      const timeout = new AbortController();
      try {
        await Promise.race([
          desktop ? desktop.pause() : this.sdk.pause(id, { apiKey: this.apiKey }),
          delay(10_000, undefined, { signal: timeout.signal, ref: false }).then(() => {
            throw new Error("Computer pause outcome is unknown");
          }),
        ]);
      } finally {
        timeout.abort();
      }
      return;
    }
    if (desktop) {
      await Promise.race([
        desktop.pause().catch(() => undefined),
        delay(10_000, undefined, { ref: false }),
      ]);
      return;
    }
    await Promise.race([
      this.sdk.pause(id, { apiKey: this.apiKey }).catch(() => undefined),
      delay(10_000, undefined, { ref: false }),
    ]);
  }

  async destroy(computer: ComputerRef, context: AdapterContext): Promise<void> {
    const id = computer.providerRef || computer.id;
    const pending = this.streamStarts.get(id);
    this.forget(id);
    await settleForTeardown(pending);
    // Delete through the provider API without reconnecting/resuming an expired
    // computer. The SDK returns false only for confirmed 404; other errors reject.
    await this.sdk.kill(id, {
      apiKey: this.apiKey,
      signal: context.signal,
      requestTimeoutMs: 10_000,
    });
  }

  private forget(id: string): void {
    this.boxes.delete(id);
    this.lastTouchedAt.delete(id);
    this.streamReady.delete(id);
    this.streamStarts.delete(id);
  }

  /** Apply the deployment timeout (SDK default is 60s) and return failed results instead of throwing. */
  private async runSetupCommand(
    desktop: Sandbox,
    command: string,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<CommandResult> {
    try {
      // The SDK uses login bash. Keep `set -e` in a non-login child so a
      // template's .bash_logout (e.g. clear_console without a TTY) cannot
      // turn a successful setup into a failed command when the shell exits.
      return await desktop.commands.run(`bash -c ${shellQuote(command)}`, {
        ...(signal ? { signal } : {}),
        timeoutMs: boundedSandboxCommandTimeoutMs(timeoutMs),
      });
    } catch (error) {
      if (error instanceof TimeoutError || /deadline_exceeded/i.test(errorMessage(error))) {
        return {
          exitCode: 124,
          stdout: "",
          stderr: errorMessage(error),
        };
      }
      const result = (error as { result?: CommandResult }).result;
      if (result) return result;
      throw error;
    }
  }

  private async resolveLayout(desktop: Sandbox, screenKey: string, leaseId?: string) {
    const allocation = await this.runSetupCommand(
      desktop,
      allocateExtraDisplayCommand(screenKey, leaseId),
    );
    if (allocation.exitCode !== 0) throw new ComputerScreenUnavailableError();
    const index = parseAllocatedExtraDisplay(allocation.stdout);
    return extraDisplayLayout(index, desktop.display ?? ":0");
  }

  private async ensureExtraDisplay(
    desktop: Sandbox,
    layout: ReturnType<typeof extraDisplayLayout>,
    context: AdapterContext,
  ): Promise<string> {
    if (layout.isPrimary) throw new Error("primary display does not use an extra view password");
    const result = await this.runSetupCommand(
      desktop,
      ensureExtraDisplayCommand(
        layout,
        {
          homeDir: "/home/user",
          browserProfilesDir: E2B_BROWSER_PROFILES,
        },
        randomBytes(6).toString("base64url"),
      ),
      context.signal,
    );
    if (result.exitCode !== 0) throw new ComputerScreenUnavailableError();
    return parseExtraDisplayViewPassword(result.stdout);
  }

  private async startControlStream(
    desktop: Sandbox,
    controlToken: string,
    _screenKey: string,
    layout = extraDisplayLayout(0, desktop.display ?? ":0"),
  ): Promise<string> {
    const password = randomBytes(6).toString("base64url");
    const result = await this.runSetupCommand(
      desktop,
      extraDisplayControlStartCommand(layout, controlToken, password),
    );
    if (result.exitCode !== 0) throw new Error(result.stderr || "control stream failed to start");
    return parseExtraDisplayViewPassword(result.stdout);
  }

  private async stopControlStream(
    desktop: Sandbox,
    controlToken: string | undefined,
    _screenKey: string,
    layout = extraDisplayLayout(0, desktop.display ?? ":0"),
  ): Promise<void> {
    const stopped = await this.runSetupCommand(
      desktop,
      extraDisplayControlStopCommand(layout, controlToken),
    );
    if (stopped.exitCode !== 0) throw new Error("Computer control could not be revoked");
  }
}

async function settleForTeardown(pending: Promise<void> | undefined): Promise<void> {
  if (!pending) return;
  await Promise.race([pending.catch(() => undefined), delay(5_000, undefined, { ref: false })]);
}

async function observeE2BDesktop(
  desktop: Sandbox,
  context: AdapterContext,
): Promise<ComputerObservation> {
  const [image, size, cursor, windowId] = await Promise.all([
    desktop.screenshot("bytes"),
    desktop.getScreenSize().catch(() => ({ width: 1280, height: 800 })),
    desktop.getCursorPosition().catch(() => undefined),
    desktop.getCurrentWindowId().catch(() => undefined),
  ]);
  if (context.signal.aborted)
    throw context.signal.reason ?? new Error("computer observation aborted");
  const title = windowId
    ? await desktop.getWindowTitle(windowId).catch(() => undefined)
    : undefined;
  return computerObservation(image, {
    mimeType: "image/png",
    width: size.width,
    height: size.height,
    cursor,
    activeWindow: windowId ? { id: windowId, title } : undefined,
  });
}

async function writeE2BFiles(
  desktop: Sandbox,
  files: readonly PortableFile[],
  context: AdapterContext,
) {
  if (!files.length) return;
  await desktop.files.write(
    files.map((file) => ({
      path: workspacePath(E2B_WORKSPACE, file.path),
      data: toArrayBuffer(file.content),
    })),
    { signal: context.signal },
  );
  const executable = files
    .filter((file) => file.executable)
    .map((file) => shellQuote(workspacePath(E2B_WORKSPACE, file.path)));
  if (executable.length) {
    await desktop.commands.run(`chmod 700 -- ${executable.join(" ")}`, {
      signal: context.signal,
    });
  }
}

async function configurePortableBrowserProfiles(desktop: Sandbox): Promise<boolean> {
  const chromium = `${E2B_BROWSER_PROFILES}/chromium`;
  const chrome = chromium;
  const firefox = `${E2B_BROWSER_PROFILES}/firefox`;
  const configured = await desktop.commands
    .run(
      [
        `test "$(readlink -f /home/user/.config/google-chrome 2>/dev/null)" = ${shellQuote(chrome)}`,
        `test "$(readlink -f /home/user/.config/chromium 2>/dev/null)" = ${shellQuote(chromium)}`,
        `test "$(readlink -f /home/user/.mozilla 2>/dev/null)" = ${shellQuote(firefox)}`,
      ].join(" && "),
    )
    .then(
      () => true,
      () => false,
    );
  if (configured) return false;
  await stopDesktopBrowsers(desktop);
  await desktop.commands.run(
    [
      `mkdir -p ${shellQuote(chrome)} ${shellQuote(chromium)} ${shellQuote(firefox)} /home/user/.config`,
      "rm -rf /home/user/.config/google-chrome /home/user/.config/chromium /home/user/.mozilla",
      `ln -s ${shellQuote(chrome)} /home/user/.config/google-chrome`,
      `ln -s ${shellQuote(chromium)} /home/user/.config/chromium`,
      `ln -s ${shellQuote(firefox)} /home/user/.mozilla`,
    ].join(" && "),
  );
  return true;
}

// Some desktop templates omit the URL field from Chrome's launcher. gtk-launch
// then opens a blank tab when Chrome is already running. Preserve the vendor's
// flags in a user-level override; do not replace an existing user customization.
export const E2B_DEFAULT_BROWSER_SETUP_COMMAND = [
  "command -v google-chrome >/dev/null 2>&1 || exit 0",
  'mkdir -p "$HOME/.config/xfce4" "$HOME/.local/share/applications"',
  'if [ ! -f "$HOME/.local/share/applications/google-chrome.desktop" ] && [ -f /usr/share/applications/google-chrome.desktop ]; then ' +
    'awk \'/^\\[/ { main = ($0 == "[Desktop Entry]") } main && /^Exec=/ && $0 !~ /%[uUfF]/ { $0 = $0 " %U" } { print }\' ' +
    '/usr/share/applications/google-chrome.desktop > "$HOME/.local/share/applications/google-chrome.desktop"; fi',
  "printf 'WebBrowser=google-chrome\\n' > \"$HOME/.config/xfce4/helpers.rc\"",
  "xdg-settings set default-web-browser google-chrome.desktop",
].join(" && ");

/** Point xdg-open / XFCE exo-open at Chrome. Lives outside the checkpointed workspace. */
async function configureDefaultWebBrowser(desktop: Sandbox): Promise<void> {
  await desktop.commands.run(E2B_DEFAULT_BROWSER_SETUP_COMMAND).catch(() => undefined);
}

async function stopDesktopBrowsers(desktop: Sandbox): Promise<void> {
  await desktop.commands.run(PORTABLE_BROWSER_STOP_COMMAND).catch(() => undefined);
}

async function applyE2BAction(desktop: Sandbox, action: ComputerAction): Promise<void> {
  if (action.kind === "key") {
    await desktop.press([...(action.modifiers ?? []), action.key]);
    return;
  }
  if (action.kind === "pointer") {
    if (action.type === "move") await desktop.moveMouse(action.x, action.y);
    else if (action.type === "down") {
      await desktop.moveMouse(action.x, action.y);
      await desktop.mousePress(action.button ?? "left");
    } else if (action.type === "up") {
      await desktop.moveMouse(action.x, action.y);
      await desktop.mouseRelease(action.button ?? "left");
    } else {
      await desktop.moveMouse(action.x, action.y);
      if (action.button === "right") await desktop.rightClick();
      else await desktop.leftClick();
    }
    return;
  }
  if (action.kind === "clipboard") {
    await desktop.write(action.text);
    return;
  }
  if (action.kind === "scroll") {
    await desktop.scroll(action.direction, clampRounded(action.amount ?? 3, 1, 20));
    return;
  }
  if (action.kind === "wait") {
    await desktop.wait(clampRounded(action.ms, 0, 5_000));
    return;
  }
  if (action.kind === "open") {
    if (/^https?:\/\//i.test(action.path)) {
      await openDesktopUrl(desktop, action.path);
      return;
    }
    await desktop.open(workspacePath(E2B_WORKSPACE, action.path));
    return;
  }
  await desktop.launch(action.application, action.uri);
}

async function* walkE2BWorkspace(
  desktop: Sandbox,
  directory: string,
  context: AdapterContext,
): AsyncIterable<PortableFile> {
  const entries = await desktop.files.list(workspacePath(E2B_WORKSPACE, directory), {
    signal: context.signal,
  });
  const files: Array<{ relative: string; mode: number }> = [];
  const directories: string[] = [];
  for (const entry of entries) {
    const relative = normalizeWorkspacePath(directory ? `${directory}/${entry.name}` : entry.name);
    if (shouldSkipPortableWorkspaceFile(relative)) continue;
    if (entry.type === "dir") directories.push(relative);
    else if (entry.type === "file") files.push({ relative, mode: entry.mode });
  }
  for (let index = 0; index < files.length; index += 8) {
    const batch = await Promise.all(
      files.slice(index, index + 8).map(async ({ relative, mode }) => {
        const content = await desktop.files
          .read(workspacePath(E2B_WORKSPACE, relative), {
            format: "bytes",
            signal: context.signal,
          })
          .catch((error) => {
            if (relative.startsWith(".browser-profiles/")) return undefined;
            throw error;
          });
        if (!content) return undefined;
        return { path: relative, content, executable: Boolean(mode & 0o100) };
      }),
    );
    for (const file of batch) {
      if (file) yield file;
    }
  }
  for (const relative of directories) yield* walkE2BWorkspace(desktop, relative, context);
}

function e2bCwd(cwd: string | undefined): string {
  if (
    !cwd ||
    cwd === "." ||
    cwd === "/" ||
    cwd === "/home/rakazo" ||
    cwd === "/home/user" ||
    cwd === E2B_WORKSPACE
  ) {
    return E2B_WORKSPACE;
  }
  const relative = cwd.startsWith(`${E2B_WORKSPACE}/`)
    ? cwd.slice(E2B_WORKSPACE.length + 1)
    : cwd.startsWith("/home/rakazo/")
      ? cwd.slice("/home/rakazo/".length)
      : cwd;
  return workspacePath(E2B_WORKSPACE, relative);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
