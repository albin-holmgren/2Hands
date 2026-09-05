import { type Sandbox, TimeoutError } from "@e2b/desktop";
import { describe, expect, it, vi } from "vitest";
import { ComputerScreenUnavailableError } from "./computer-screens.js";
import { shouldSkipPortableWorkspaceFile } from "./computer-workspace.js";
import {
  E2BSandboxProvider,
  type E2BSandboxSdk,
  e2bLifetimeMs,
  isNovncWaitError,
  isSandboxGoneError,
  isStreamAlreadyStartedError,
  isUnrecoverableSandboxError,
} from "./e2b-sandbox.js";

const context = {
  operationId: "e2b-test",
  traceId: "e2b-test",
  spaceId: "workspace",
  userId: "user",
  signal: new AbortController().signal,
};

function screenPasswordOutput(command: string) {
  const token = command.match(/printf %s '([^']+)' > \/tmp\/rakazo\/control-token-/)?.[1];
  return `RAKAZO_SCREEN_PASSWORD=${token ? `control-${token}` : "view-password"}\n`;
}

describe("E2B computer backend", () => {
  it("only filters transient cache files inside portable browser profiles", () => {
    expect(shouldSkipPortableWorkspaceFile("project/Cache/important.txt")).toBe(false);
    expect(shouldSkipPortableWorkspaceFile("project/lock")).toBe(false);
    expect(shouldSkipPortableWorkspaceFile(".browser-profiles/chromium/Cache/data")).toBe(true);
    expect(shouldSkipPortableWorkspaceFile(".browser-profiles/chromium/SingletonLock")).toBe(true);
  });

  it("boots a fresh sandbox when reconnecting to a dead one fails with fetch failed", async () => {
    const desktop = {
      sandboxId: "fresh-e2b-box",
      trafficAccessToken: "synthetic-traffic-token",
    } as unknown as Sandbox;
    const sdk: E2BSandboxSdk = {
      create: vi.fn(async () => desktop),
      connect: vi.fn(async () => {
        throw new Error("fetch failed", {
          cause: Object.assign(new Error("getaddrinfo ENOTFOUND dead-e2b-box.e2b.app"), {
            code: "ENOTFOUND",
          }),
        });
      }),
      pause: vi.fn(async () => undefined),
    };
    const provider = new E2BSandboxProvider("test-key", sdk);

    const computer = await provider.provision(
      { botId: "bot-1", homePath: "/unused", providerRef: "dead-e2b-box", providerKind: "e2b" },
      context,
    );

    expect(sdk.create).toHaveBeenCalledTimes(1);
    expect(computer.providerRef).toBe("fresh-e2b-box");
    expect(computer.fresh).toBe(true);
  });

  it("gives screen setup commands a real timeout and surfaces a failed one as unavailable", async () => {
    const run = vi.fn(async (_command: string, opts?: { timeoutMs?: number }) => {
      // The SDK throws on a non-zero exit rather than returning the result, and caps the
      // command at 60s unless a timeout is passed.
      if ((opts?.timeoutMs ?? 60_000) <= 60_000) {
        throw Object.assign(new Error("signal: terminated"), {
          name: "CommandExitError",
          result: { exitCode: -1, stdout: "", stderr: "", error: "signal: terminated" },
        });
      }
      throw Object.assign(new Error("boom"), {
        name: "CommandExitError",
        result: { exitCode: 1, stdout: "", stderr: "boom", error: "boom" },
      });
    });
    const desktop = {
      sandboxId: "screen-e2b-box",
      trafficAccessToken: "synthetic-traffic-token",
      display: ":0",
      commands: { run },
    } as unknown as Sandbox;
    const sdk: E2BSandboxSdk = {
      create: vi.fn(async () => desktop),
      connect: vi.fn(async () => desktop),
      pause: vi.fn(async () => undefined),
    };
    const provider = new E2BSandboxProvider("test-key", sdk);
    const computer = {
      id: "screen-e2b-box",
      botId: "bot-1",
      kind: "e2b" as const,
      providerRef: "screen-e2b-box",
      fresh: false,
    };

    await expect(provider.connectScreen(computer, { view: "stream" }, context)).rejects.toThrow(
      ComputerScreenUnavailableError,
    );
    expect(run.mock.calls[0]?.[1]?.timeoutMs).toBeGreaterThan(60_000);
  });

  it("surfaces a setup TimeoutError as ComputerScreenUnavailableError", async () => {
    const run = vi.fn(async () => {
      throw new TimeoutError("the operation timed out");
    });
    const desktop = {
      sandboxId: "timeout-e2b-box",
      trafficAccessToken: "synthetic-traffic-token",
      display: ":0",
      commands: { run },
    } as unknown as Sandbox;
    const sdk: E2BSandboxSdk = {
      create: vi.fn(async () => desktop),
      connect: vi.fn(async () => desktop),
      pause: vi.fn(async () => undefined),
    };
    const provider = new E2BSandboxProvider("test-key", sdk);
    const computer = {
      id: "timeout-e2b-box",
      botId: "bot-1",
      kind: "e2b" as const,
      providerRef: "timeout-e2b-box",
      fresh: false,
    };

    await expect(provider.connectScreen(computer, { view: "stream" }, context)).rejects.toThrow(
      ComputerScreenUnavailableError,
    );
  });

  it("prepares a reused computer idempotently", async () => {
    let profilesConfigured = false;
    const command = vi.fn(async (value: string) => {
      if (value.startsWith('test "$(readlink') && !profilesConfigured) {
        throw new Error("profiles are not configured");
      }
      if (value.includes("ln -s")) profilesConfigured = true;
      return {
        stdout: value.includes("RAKAZO_SCREEN_PASSWORD=") ? screenPasswordOutput(value) : "",
        stderr: "",
        exitCode: 0,
      };
    });
    const desktop = {
      sandboxId: "reused-e2b-box",
      trafficAccessToken: "synthetic-traffic-token",
      commands: { run: command },
      launch: vi.fn(async () => undefined),
      open: vi.fn(async () => undefined),
    } as unknown as Sandbox;
    const sdk: E2BSandboxSdk = {
      create: vi.fn(async () => desktop),
      connect: vi.fn(async () => desktop),
      pause: vi.fn(async () => undefined),
    };
    const provider = new E2BSandboxProvider("test-key", sdk);
    const computer = await provider.provision(
      {
        botId: "bot-1",
        homePath: "/unused",
        providerRef: "reused-e2b-box",
        providerKind: "e2b",
      },
      context,
    );

    await provider.prepare(computer, context);
    await provider.prepare(computer, context);

    expect(command.mock.calls.filter(([value]) => String(value).includes("ln -s"))).toHaveLength(1);
    expect(
      command.mock.calls.some(
        ([value]) =>
          String(value).includes("xdg-settings set default-web-browser google-chrome.desktop") &&
          String(value).includes("WebBrowser=google-chrome"),
      ),
    ).toBe(true);
    expect(desktop.launch).toHaveBeenCalledTimes(1);
  });

  it("opens http(s) URLs through the named browser launcher", async () => {
    const command = vi.fn(async (value: string) => {
      if (value.includes("RAKAZO_SCREEN_INDEX=")) {
        return { stdout: "RAKAZO_SCREEN_INDEX=0\n", stderr: "", exitCode: 0 };
      }
      if (value.startsWith("gtk-launch")) {
        if (value.includes("google-chrome")) return { stdout: "", stderr: "", exitCode: 0 };
        throw new Error("missing");
      }
      return {
        stdout: value.includes("RAKAZO_SCREEN_PASSWORD=") ? screenPasswordOutput(value) : "",
        stderr: "",
        exitCode: 0,
      };
    });
    const launch = vi.fn(async () => undefined);
    const open = vi.fn(async () => undefined);
    const desktop = {
      sandboxId: "e2b-open-url-box",
      trafficAccessToken: "synthetic-traffic-token",
      display: ":0",
      commands: { run: command },
      files: { makeDir: vi.fn(async () => undefined) },
      launch,
      open,
    } as unknown as Sandbox;
    const provider = new E2BSandboxProvider("test-key", {
      create: vi.fn(async () => desktop),
      connect: vi.fn(async () => desktop),
      pause: vi.fn(async () => undefined),
    });
    const computer = await provider.provision(
      { botId: "bot-1", homePath: "/unused", providerKind: "e2b" },
      context,
    );

    await provider.act(
      computer,
      { actions: [{ kind: "open", path: "https://example.com/docs" }], observe: false },
      context,
    );
    expect(command).toHaveBeenCalledWith("gtk-launch 'google-chrome' 'https://example.com/docs'");
    expect(launch).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();

    await provider.act(
      computer,
      { actions: [{ kind: "open", path: "notes/readme.md" }], observe: false },
      context,
    );
    expect(open).toHaveBeenCalledWith("/home/user/rakazo-home/notes/readme.md");
  });

  it("controls the desktop and exposes a portable workspace", async () => {
    const files = new Map<string, Uint8Array>();
    const leftClick = vi.fn(async () => undefined);
    const typeText = vi.fn(async () => undefined);
    const command = vi.fn(async (value: string, _options?: Record<string, unknown>) => {
      if (value.startsWith('test "$(readlink')) throw new Error("profiles are not configured");
      if (value.includes("RAKAZO_SCREEN_INDEX=")) {
        return { stdout: "RAKAZO_SCREEN_INDEX=0\n", stderr: "", exitCode: 0 };
      }
      if (value.includes("RAKAZO_SCREEN_RELEASE=")) {
        return {
          stdout: "RAKAZO_SCREEN_RELEASE=0\n",
          stderr: "",
          exitCode: 0,
        };
      }
      if (value.includes("hang")) {
        throw new TimeoutError("command timed out");
      }
      return {
        stdout: value.includes("RAKAZO_SCREEN_PASSWORD=") ? screenPasswordOutput(value) : "",
        stderr: "",
        exitCode: 0,
        disconnect: async () => undefined,
      };
    });
    const getStreamUrl = vi.fn(() => "https://desktop.test/vnc.html");
    const streamStart = vi.fn(async () => undefined);
    const streamStop = vi.fn(async () => undefined);
    const desktop = {
      sandboxId: "e2b-test-box",
      trafficAccessToken: "synthetic-traffic-token",
      display: ":0",
      getHost: (port: number) => `${port}-desktop.test`,
      commands: { run: command },
      files: {
        makeDir: vi.fn(async () => undefined),
        write: vi.fn(async (entries: Array<{ path: string; data: ArrayBuffer }>) => {
          for (const entry of entries) files.set(entry.path, new Uint8Array(entry.data));
        }),
        read: vi.fn(async (filePath: string) => {
          const content = files.get(filePath);
          if (!content) throw new Error("missing file");
          return content;
        }),
        list: vi.fn(async (directory: string) => {
          const prefix = `${directory.replace(/\/$/, "")}/`;
          return [...files.entries()]
            .filter(([filePath]) => filePath.startsWith(prefix))
            .map(([filePath, content]) => ({
              name: filePath.slice(prefix.length),
              type: "file" as const,
              size: content.byteLength,
              mode: 0o600,
            }));
        }),
      },
      stream: {
        start: streamStart,
        stop: streamStop,
        getAuthKey: () => "screen-key",
        getUrl: getStreamUrl,
      },
      launch: vi.fn(async () => undefined),
      open: vi.fn(async () => undefined),
      screenshot: vi.fn(async () => new Uint8Array([137, 80, 78, 71])),
      getScreenSize: vi.fn(async () => ({ width: 1280, height: 800 })),
      getCursorPosition: vi.fn(async () => ({ x: 10, y: 20 })),
      getCurrentWindowId: vi.fn(async () => "42"),
      getWindowTitle: vi.fn(async () => "Browser"),
      leftClick,
      rightClick: vi.fn(async () => undefined),
      moveMouse: vi.fn(async () => undefined),
      mousePress: vi.fn(async () => undefined),
      mouseRelease: vi.fn(async () => undefined),
      write: typeText,
      press: vi.fn(async () => undefined),
      scroll: vi.fn(async () => undefined),
      wait: vi.fn(async () => undefined),
      setTimeout: vi.fn(async () => undefined),
      pause: vi.fn(async () => undefined),
      kill: vi.fn(async () => undefined),
    } as unknown as Sandbox;
    const sdk: E2BSandboxSdk = {
      create: vi.fn(async () => desktop),
      connect: vi.fn(async () => desktop),
      pause: vi.fn(async () => undefined),
    };
    const provider = new E2BSandboxProvider("test-key", sdk);
    const computer = await provider.provision(
      {
        botId: "bot-1",
        homePath: "/unused",
        providerRef: "foreign-provider-machine",
        providerKind: "docker",
      },
      context,
    );
    expect(sdk.connect).not.toHaveBeenCalled();
    await provider.prepare(computer, context);
    await provider.importWorkspace(
      computer,
      (async function* () {
        // Empty durable home on first boot.
      })(),
      context,
    );

    const timeoutEvents = [];
    for await (const event of provider.execute(
      computer,
      { argv: ["hang"], timeoutMs: 42 },
      context,
    )) {
      timeoutEvents.push(event);
    }
    expect(timeoutEvents).toEqual([
      { type: "stderr", data: "command timed out after 42 ms\n" },
      { type: "exit", code: 124 },
    ]);
    expect(command).toHaveBeenCalledWith(
      "'hang'",
      expect.objectContaining({ timeoutMs: 42, signal: context.signal }),
    );

    await provider.writeFile(
      computer,
      {
        path: "notes/result.txt",
        content: new TextEncoder().encode("portable"),
      },
      context,
    );
    expect(
      new TextDecoder().decode(await provider.readFile(computer, "notes/result.txt", context)),
    ).toBe("portable");
    expect(await provider.listFiles(computer, "notes", context)).toEqual([
      { path: "notes/result.txt", kind: "file", size: 8 },
    ]);

    const result = await provider.act(
      computer,
      {
        actions: [
          { kind: "pointer", type: "click", x: 100, y: 120 },
          { kind: "clipboard", text: "hello" },
        ],
        observe: true,
      },
      context,
    );
    expect(desktop.moveMouse).toHaveBeenCalledWith(100, 120);
    expect(leftClick).toHaveBeenCalledWith();
    expect(typeText).toHaveBeenCalledWith("hello");
    expect(result.observation).toMatchObject({ width: 1280, height: 800 });
    expect(command.mock.calls.some(([value]) => String(value).includes(".browser-profiles"))).toBe(
      true,
    );
    expect(command.mock.calls.some(([value]) => String(value).includes("cp -a"))).toBe(false);
    const [screen] = await Promise.all([
      provider.connectScreen(computer, { view: "stream" }, context),
      provider.connectScreen(computer, { view: "stream" }, context),
    ]);
    expect(screen.url).toBe(
      "https://6080-desktop.test/vnc.html?autoconnect=true&resize=scale&view_only=true&password=view-password",
    );
    expect(desktop.stream.start).not.toHaveBeenCalled();
    expect(
      command.mock.calls.some(([value]) =>
        String(value).includes('socket.create_connection(("127.0.0.1", 6080), 1)'),
      ),
    ).toBe(true);
    expect(command.mock.calls.some(([value]) => value.includes("x11vnc -R"))).toBe(false);

    const control = await provider.connectScreen(
      computer,
      { view: "stream", interactive: true, controlToken: "lease-1" },
      context,
    );
    expect(control.url).toBe(
      "https://6081-desktop.test/vnc.html?autoconnect=true&resize=scale&view_only=false&password=control-lease-1",
    );
    expect(command.mock.calls.some(([value]) => value.includes("noviewonly"))).toBe(false);
    expect(
      command.mock.calls.some(
        ([value]) =>
          String(value).includes("novnc_proxy") && String(value).includes("-rfbport 5901"),
      ),
    ).toBe(true);

    await provider.connectScreen(computer, { view: "stream" }, context);
    const sameControl = await provider.connectScreen(
      computer,
      { view: "stream", interactive: true, controlToken: "lease-1" },
      context,
    );
    expect(sameControl.url).toBe(control.url);

    await provider.setScreenControl(computer, false, context, "lease-1");
    expect(command.mock.calls.some(([value]) => value.includes("x11vnc -R"))).toBe(false);
    const replacementControl = await provider.connectScreen(
      computer,
      { view: "stream", interactive: true, controlToken: "lease-2" },
      context,
    );
    expect(replacementControl.url).not.toBe(control.url);

    await provider.setScreenControl(computer, false, context, "lease-1");
    const stillCurrent = await provider.connectScreen(
      computer,
      { view: "stream", interactive: true, controlToken: "lease-2" },
      context,
    );
    expect(stillCurrent.url).toBe(replacementControl.url);

    await screen.close();
    await provider.releaseScreen(computer, context);
    let finishEnsure!: () => void;
    let ensureStarted = false;
    command.mockImplementation(async (value: string) => {
      if (
        value.includes("RAKAZO_SCREEN_PASSWORD=") &&
        value.includes('socket.create_connection(("127.0.0.1", 6080), 1)')
      ) {
        ensureStarted = true;
        return new Promise((resolve) => {
          finishEnsure = () =>
            resolve({ stdout: screenPasswordOutput(value), stderr: "", exitCode: 0 });
        });
      }
      if (value.includes("RAKAZO_SCREEN_INDEX=")) {
        return { stdout: "RAKAZO_SCREEN_INDEX=0\n", stderr: "", exitCode: 0 };
      }
      return {
        stdout: value.includes("RAKAZO_SCREEN_PASSWORD=") ? screenPasswordOutput(value) : "",
        stderr: "",
        exitCode: 0,
      };
    });
    const connecting = provider.connectScreen(computer, { view: "stream" }, context);
    await vi.waitFor(() => expect(ensureStarted).toBe(true));
    const stopping = provider.stop(computer, context);
    finishEnsure();
    await expect(connecting).rejects.toThrow(/teardown/);
    await stopping;
    expect(desktop.pause).toHaveBeenCalled();
    expect(
      command.mock.calls.some(([value]) => value.includes("Screen listener did not stop")),
    ).toBe(true);
  });

  it("reuses an already-started E2B stream instead of 500ing", async () => {
    const command = vi.fn(async (value: string) => {
      if (value.includes("RAKAZO_SCREEN_INDEX=")) {
        return { stdout: "RAKAZO_SCREEN_INDEX=0\n", stderr: "", exitCode: 0 };
      }
      return {
        stdout: value.includes("RAKAZO_SCREEN_PASSWORD=") ? screenPasswordOutput(value) : "",
        stderr: "",
        exitCode: 0,
      };
    });
    const desktop = {
      sandboxId: "e2b-restart-box",
      trafficAccessToken: "synthetic-traffic-token",
      display: ":0",
      getHost: (port: number) => `${port}-desktop.test`,
      commands: { run: command },
      stream: {
        start: vi.fn(async () => {
          throw Object.assign(new Error("409: Stream is already started"), { status: 409 });
        }),
        stop: vi.fn(async () => undefined),
        getAuthKey: () => "screen-key",
        getUrl: () => "https://desktop.test/vnc.html?existing=1",
      },
    } as unknown as Sandbox;
    const provider = new E2BSandboxProvider("test-key", {
      create: vi.fn(async () => desktop),
      connect: vi.fn(async () => desktop),
      pause: vi.fn(async () => undefined),
    });
    const computer = await provider.provision(
      { botId: "bot-1", homePath: "/unused", providerKind: "e2b" },
      context,
    );
    const screen = await provider.connectScreen(computer, { view: "stream" }, context);
    expect(screen.url).toBe(
      "https://6080-desktop.test/vnc.html?autoconnect=true&resize=scale&view_only=true&password=view-password",
    );
  });

  it("uses an authenticated control listener independently of the vendor stream", async () => {
    const command = vi.fn(async (value: string) => {
      if (value.includes("RAKAZO_SCREEN_INDEX=")) {
        return { stdout: "RAKAZO_SCREEN_INDEX=0\n", stderr: "", exitCode: 0 };
      }
      return {
        stdout: value.includes("RAKAZO_SCREEN_PASSWORD=") ? screenPasswordOutput(value) : "",
        stderr: "",
        exitCode: 0,
      };
    });
    const desktop = {
      sandboxId: "e2b-fallback-box",
      trafficAccessToken: "synthetic-traffic-token",
      display: ":0",
      getHost: (port: number) => `${port}-desktop.test`,
      commands: { run: command },
      stream: {
        start: vi.fn(async () => {
          throw new Error("Stream is already running");
        }),
        stop: vi.fn(async () => undefined),
        getAuthKey: () => {
          throw new Error("Unable to retrieve stream auth key");
        },
        getUrl: () => {
          throw new Error("Server is not running");
        },
      },
    } as unknown as Sandbox;
    const provider = new E2BSandboxProvider("test-key", {
      create: vi.fn(async () => desktop),
      connect: vi.fn(async () => desktop),
      pause: vi.fn(async () => undefined),
    });
    const computer = await provider.provision(
      { botId: "bot-1", homePath: "/unused", providerKind: "e2b" },
      context,
    );
    const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const control = await provider.connectScreen(
      computer,
      { view: "stream", interactive: true, controlToken: "lease-1" },
      context,
    );
    logError.mockRestore();
    expect(control.url).toBe(
      "https://6081-desktop.test/vnc.html?autoconnect=true&resize=scale&view_only=false&password=control-lease-1",
    );
    expect(command.mock.calls.some(([value]) => value.includes("noviewonly"))).toBe(false);
    expect(
      command.mock.calls.some(([value]) =>
        String(value).includes('socket.create_connection(("127.0.0.1", 6080), 1)'),
      ),
    ).toBe(true);
  });

  it("treats E2B deadline_exceeded as a failed stream setup instead of 500ing uncaught", async () => {
    const command = vi.fn(async (value: string) => {
      if (value.includes("RAKAZO_SCREEN_INDEX=")) {
        return { stdout: "RAKAZO_SCREEN_INDEX=0\n", stderr: "", exitCode: 0 };
      }
      if (value.includes('socket.create_connection(("127.0.0.1", 6080), 1)')) {
        throw new Error("[deadline_exceeded] Command timed out");
      }
      return {
        stdout: value.includes("RAKAZO_SCREEN_PASSWORD=") ? screenPasswordOutput(value) : "",
        stderr: "",
        exitCode: 0,
      };
    });
    const desktop = {
      sandboxId: "e2b-deadline-box",
      trafficAccessToken: "synthetic-traffic-token",
      display: ":0",
      getHost: (port: number) => `${port}-desktop.test`,
      commands: { run: command },
      stream: {
        start: vi.fn(async () => undefined),
        stop: vi.fn(async () => undefined),
        getAuthKey: () => "screen-key",
        getUrl: () => "https://desktop.test/vnc.html",
      },
    } as unknown as Sandbox;
    const provider = new E2BSandboxProvider("test-key", {
      create: vi.fn(async () => desktop),
      connect: vi.fn(async () => desktop),
      pause: vi.fn(async () => undefined),
    });
    const computer = await provider.provision(
      { botId: "bot-1", homePath: "/unused", providerKind: "e2b" },
      context,
    );
    await expect(provider.connectScreen(computer, { view: "stream" }, context)).rejects.toThrow(
      /desktop stream failed to start|deadline_exceeded/,
    );
  });

  it("gives Team bots distinct E2B screens and shared files", async () => {
    const files = new Map<string, Uint8Array>();
    const screenSlots = new Map<string, number>();
    const command = vi.fn(async (value: string) => {
      const screenKey = value.match(/slot="\$dir\/([a-f0-9]+)\.slot"/)?.[1];
      if (screenKey && value.includes("RAKAZO_SCREEN_INDEX=")) {
        let index = screenSlots.get(screenKey);
        if (index === undefined) {
          index = Array.from({ length: 8 }, (_, candidate) => candidate).find(
            (candidate) => ![...screenSlots.values()].includes(candidate),
          );
          if (index === undefined) return { stdout: "", stderr: "full", exitCode: 75 };
          screenSlots.set(screenKey, index);
        }
        return {
          stdout: `RAKAZO_SCREEN_INDEX=${index}\n`,
          stderr: "",
          exitCode: 0,
        };
      }
      if (screenKey && value.includes("RAKAZO_SCREEN_RELEASE=")) {
        const index = screenSlots.get(screenKey);
        if (index === undefined) {
          return {
            stdout: "RAKAZO_SCREEN_RELEASE=missing\n",
            stderr: "",
            exitCode: 0,
          };
        }
        screenSlots.delete(screenKey);
        return {
          stdout: `RAKAZO_SCREEN_RELEASE=${index}\n`,
          stderr: "",
          exitCode: 0,
        };
      }
      if (value.includes("command -v Xvfb")) return { stdout: "", stderr: "", exitCode: 0 };
      if (value.includes("RAKAZO_SCREEN_PASSWORD=")) {
        return {
          stdout: screenPasswordOutput(value),
          stderr: "",
          exitCode: 0,
        };
      }
      if (value.includes("scrot") || value.includes("import")) {
        return {
          stdout: `${Buffer.from([137, 80, 78, 71]).toString("base64")}\nCURSOR X=3 Y=4`,
          stderr: "",
          exitCode: 0,
        };
      }
      if (value.includes("xdotool")) return { stdout: "", stderr: "", exitCode: 0 };
      if (value.includes("pkill -x x11vnc")) {
        throw new Error("global x11vnc kill is forbidden");
      }
      return { stdout: "shell-ok\n", stderr: "", exitCode: 0 };
    });
    const desktop = {
      sandboxId: "e2b-shared",
      trafficAccessToken: "synthetic-traffic-token",
      display: ":0",
      getHost: (port: number) => `${port}-desktop.test`,
      commands: { run: command },
      files: {
        makeDir: vi.fn(async () => undefined),
        write: vi.fn(async (entries: Array<{ path: string; data: ArrayBuffer }>) => {
          for (const entry of entries) files.set(entry.path, new Uint8Array(entry.data));
        }),
        read: vi.fn(async (filePath: string) => {
          const content = files.get(filePath);
          if (!content) throw new Error("missing file");
          return content;
        }),
        list: vi.fn(async (directory: string) => {
          const prefix = `${directory.replace(/\/$/, "")}/`;
          return [...files.entries()]
            .filter(([filePath]) => filePath.startsWith(prefix))
            .map(([filePath, content]) => ({
              name: filePath.slice(prefix.length),
              type: "file" as const,
              size: content.byteLength,
              mode: 0o600,
            }));
        }),
      },
      stream: {
        start: vi.fn(async () => undefined),
        stop: vi.fn(async () => undefined),
        getAuthKey: () => "key",
        getUrl: () => "https://6080-desktop.test/vnc.html",
      },
      screenshot: vi.fn(async () => new Uint8Array([137, 80, 78, 71])),
      getScreenSize: vi.fn(async () => ({ width: 1280, height: 800 })),
      getCursorPosition: vi.fn(async () => ({ x: 1, y: 1 })),
      getCurrentWindowId: vi.fn(async () => "1"),
      getWindowTitle: vi.fn(async () => "Desk"),
      leftClick: vi.fn(async () => undefined),
      moveMouse: vi.fn(async () => undefined),
      write: vi.fn(async () => undefined),
      wait: vi.fn(async () => undefined),
    };
    const provider = new E2BSandboxProvider("e2b_test", {
      create: vi.fn(async () => desktop as never),
      connect: vi.fn(),
      pause: vi.fn(),
    } as unknown as E2BSandboxSdk);
    const computer = await provider.provision({ botId: "team-home", homePath: "/tmp" }, context);
    const writer = { ...context, botId: "writer" };
    const researcher = { ...context, botId: "researcher" };

    await provider.observe(computer, writer);
    await provider.observe(computer, researcher);
    const writerView = await provider.connectScreen(computer, { view: "stream" }, writer);
    const researcherView = await provider.connectScreen(computer, { view: "stream" }, researcher);
    expect(writerView.url).toContain("6080-desktop.test");
    expect(researcherView.url).toContain("6082-desktop.test");
    expect(researcherView.url).toContain("password=view-password");
    expect(writerView.url).not.toBe(researcherView.url);
    expect(command.mock.calls.some(([value]) => String(value).includes("Xvfb :2"))).toBe(true);
    expect(
      command.mock.calls.some(
        ([value]) =>
          String(value).includes("-viewonly -rfbauth") && !String(value).includes("-nopw"),
      ),
    ).toBe(true);
    expect(command.mock.calls.some(([value]) => String(value).includes("pkill -x x11vnc"))).toBe(
      false,
    );

    await provider.act(
      computer,
      {
        actions: [{ kind: "pointer", type: "click", x: 1, y: 2 }],
        observe: false,
      },
      researcher,
    );
    expect(command.mock.calls.some(([value]) => String(value).includes("DISPLAY=:2 xdotool"))).toBe(
      true,
    );
    expect(desktop.moveMouse).not.toHaveBeenCalled();

    const control = await provider.connectScreen(
      computer,
      { view: "stream", interactive: true, controlToken: "lease-1" },
      researcher,
    );
    expect(control.url).toMatch(/6083-desktop\.test/);
    const startControl = command.mock.calls
      .map(([value]) => String(value))
      .find((value) => value.includes("-rfbport 5903") && value.includes("novnc_proxy"));
    expect(startControl).toBeDefined();
    expect(startControl).toContain("pkill -f '(^|/)x11vnc .* -rfbport 5903([ ]|$)'");
    expect(startControl).toMatch(
      /for i in \$\(seq 1 50\); do \(echo >\/dev\/tcp\/127\.0\.0\.1\/5903\)[\s\S]*then exit 1; fi[\s\S]*x11vnc -storepasswd/,
    );
    expect(startControl).toMatch(
      /x11vnc -bg[\s\S]*-rfbport 5903[\s\S]*for i in \$\(seq 1 50\); do \(echo >\/dev\/tcp\/127\.0\.0\.1\/5903\)[\s\S]*then exit 1; fi[\s\S]*novnc_proxy/,
    );

    await provider.writeFile(
      computer,
      { path: "shared/note.txt", content: new TextEncoder().encode("office") },
      researcher,
    );
    expect(
      new TextDecoder().decode(await provider.readFile(computer, "shared/note.txt", writer)),
    ).toBe("office");

    await provider.releaseScreen(computer, writer);
    await expect(provider.observe(computer, researcher)).resolves.toMatchObject({
      width: 1280,
      height: 800,
    });
    expect(provider.describe().capabilities.multiScreen).toBe(true);

    for (let index = 0; index < 7; index += 1) {
      await provider.observe(computer, {
        ...context,
        botId: `bot-${index + 2}`,
      });
    }
    await expect(provider.observe(computer, { ...context, botId: "bot-9" })).rejects.toThrow(
      /does not support multiple screens/,
    );
  });
});

describe("sandbox-gone detection", () => {
  // Verbatim wordings from @e2b/desktop 2.3.1 (e2b 2.38.3 dist).
  const gone = [
    new TimeoutError(
      "502: This error is likely due to sandbox timeout. You can modify the sandbox timeout by passing 'timeoutMs' when starting the sandbox or calling '.setTimeout' on the sandbox with the desired timeout.",
    ),
    Object.assign(new Error("Sandbox is probably not running anymore"), {
      name: "SandboxNotFoundError",
    }),
    new TimeoutError(
      "stream reset: The sandbox was killed or reached its end of life while the request was in flight.",
    ),
    Object.assign(new Error("Paused sandbox sandbox-ref-1 not found"), {
      name: "SandboxNotFoundError",
    }),
  ];
  const alive = [
    new Error("bash: x11vnc: command not found"),
    new Error("Path /home/user/rakazo-home/notes.md not found"),
    new Error("tar: /home/user/x: No such file or directory"),
    new TimeoutError(
      "canceled: This error is likely due to exceeding 'requestTimeoutMs'. You can pass the request timeout value as an option when making the request.",
    ),
    Object.assign(new Error("fetch failed"), { code: "ECONNRESET" }),
  ];

  it("recognises every sandbox-gone wording", () => {
    for (const error of gone) {
      expect(isSandboxGoneError(error), error.message).toBe(true);
      expect(isUnrecoverableSandboxError(error), error.message).toBe(true);
    }
  });

  it("never reads a live sandbox as gone", () => {
    for (const error of alive) {
      expect(isSandboxGoneError(error), error.message).toBe(false);
    }
  });

  it("treats an already-started stream as reusable", () => {
    expect(
      isStreamAlreadyStartedError(
        Object.assign(new Error("409: Stream is already started"), { status: 409 }),
      ),
    ).toBe(true);
    expect(isStreamAlreadyStartedError(new Error("stream is already running"))).toBe(true);
    expect(isStreamAlreadyStartedError(new Error("fetch failed"))).toBe(false);
    expect(isNovncWaitError(new Error("Could not start noVNC server"))).toBe(true);
    expect(isNovncWaitError(new Error("fetch failed"))).toBe(false);
  });

  it("leaves the transport split alone", () => {
    // a blip is handled by isUnreachableTransportError, and must never read as gone
    expect(isSandboxGoneError(new Error("fetch failed"))).toBe(false);
    expect(isUnrecoverableSandboxError(new Error("fetch failed"))).toBe(false);
  });

  it("drops a cached handle whose sandbox died and reconnects", async () => {
    const dead = {
      sandboxId: "box-1",
      trafficAccessToken: "synthetic-traffic-token",
      setTimeout: vi.fn(async () => {
        throw new TimeoutError("502: This error is likely due to sandbox timeout.");
      }),
    } as unknown as Sandbox;
    const revived = {
      sandboxId: "box-1",
      trafficAccessToken: "synthetic-traffic-token",
      setTimeout: vi.fn(async () => undefined),
    };
    const sdk: E2BSandboxSdk = {
      create: vi.fn(async () => dead),
      connect: vi.fn(async () => revived as unknown as Sandbox),
      pause: vi.fn(async () => undefined),
    };
    const provider = new E2BSandboxProvider("test-key", sdk);
    const ref = await provider.provision({ botId: "bot-1", homePath: "/unused" }, context);
    expect(ref.providerRef).toBe("box-1");

    vi.setSystemTime(Date.now() + 61_000);
    try {
      await provider.keepAlive?.(ref);
    } finally {
      vi.useRealTimers();
    }
    expect(dead.setTimeout).toHaveBeenCalledTimes(1);
    expect(sdk.connect).toHaveBeenCalledTimes(1);
  });

  it("forgets a dead handle on keepAlive before the 60s probe threshold", async () => {
    const dead = {
      sandboxId: "box-1",
      trafficAccessToken: "synthetic-traffic-token",
      setTimeout: vi.fn(async () => {
        throw new TimeoutError("502: This error is likely due to sandbox timeout.");
      }),
    } as unknown as Sandbox;
    const revived = {
      sandboxId: "box-1",
      trafficAccessToken: "synthetic-traffic-token",
      setTimeout: vi.fn(async () => undefined),
    };
    const sdk: E2BSandboxSdk = {
      create: vi.fn(async () => dead),
      connect: vi.fn(async () => revived as unknown as Sandbox),
      pause: vi.fn(async () => undefined),
    };
    const provider = new E2BSandboxProvider("test-key", sdk);
    const ref = await provider.provision({ botId: "bot-1", homePath: "/unused" }, context);

    // Still inside box()'s 60s cache window — keepAlive must not refresh lastTouchedAt
    // on a gone sandbox, or subsequent heartbeats would keep serving the dead handle.
    await provider.keepAlive?.(ref);
    expect(dead.setTimeout).toHaveBeenCalledTimes(1);
    expect(sdk.connect).not.toHaveBeenCalled();

    await provider.keepAlive?.(ref);
    expect(sdk.connect).toHaveBeenCalledTimes(1);
    expect(revived.setTimeout).toHaveBeenCalledTimes(1);
  });
});

describe("E2B hosted lifetime enforcement", () => {
  it("caps every timeout at the prepaid deadline and rejects expired coverage", () => {
    const now = Date.parse("2026-09-04T12:00:00Z");
    expect(e2bLifetimeMs("2026-09-04T12:00:30Z", now)).toBe(30_000);
    expect(() => e2bLifetimeMs("2026-09-04T12:00:00Z", now)).toThrow(/expired/);
    expect(() => e2bLifetimeMs("invalid", now)).toThrow(/expired/);
  });

  it("requires prepaid coverage in hosted mode", () => {
    vi.stubEnv("BILLING_ENABLED", "true");
    try {
      expect(() => e2bLifetimeMs()).toThrow(/prepaid/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
