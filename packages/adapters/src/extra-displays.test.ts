import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { ComputerScreenUnavailableError } from "./computer-screens.js";
import {
  allocateExtraDisplayCommand,
  ensureExtraDisplayCommand,
  ensurePrimaryNovncCommand,
  extraDisplayControlStartCommand,
  extraDisplayControlStopCommand,
  extraDisplayLayout,
  parseAllocatedExtraDisplay,
  parseExtraDisplayViewPassword,
  parseReleasedExtraDisplay,
  releaseExtraDisplayCommand,
} from "./extra-displays.js";

describe("extra display ports", () => {
  it("keeps the vendor primary on index 0 and shifts extra screens by two", () => {
    expect(extraDisplayLayout(0, ":0")).toMatchObject({
      display: ":0",
      viewPort: 6080,
      controlPort: 6081,
      isPrimary: true,
    });
    expect(extraDisplayLayout(1, ":0")).toMatchObject({
      display: ":2",
      viewPort: 6082,
      controlPort: 6083,
      isPrimary: false,
    });
    expect(extraDisplayLayout(1, ":99")).toMatchObject({
      display: ":2",
      viewPort: 6082,
      controlPort: 6083,
    });
  });

  it("uses a locked sandbox registry for cross-process screen assignment", () => {
    const allocate = allocateExtraDisplayCommand("writer", "run-2:2");
    const release = releaseExtraDisplayCommand("writer", "run-2:2");
    expect(allocate).toContain("flock 9");
    expect(allocate).not.toContain("writer");
    expect(release).toContain("RAKAZO_SCREEN_RELEASE=stale");
    expect(release.indexOf("pkill -f")).toBeLessThan(release.indexOf('rm -f "$slot"'));
    expect(parseAllocatedExtraDisplay("RAKAZO_SCREEN_INDEX=3\n")).toBe(3);
    expect(parseReleasedExtraDisplay("RAKAZO_SCREEN_RELEASE=3\n")).toBe(3);
    expect(parseReleasedExtraDisplay("RAKAZO_SCREEN_RELEASE=stale\n")).toBeUndefined();
  });

  it("requires an authenticated password for view-only VNC", () => {
    expect(parseExtraDisplayViewPassword("RAKAZO_SCREEN_PASSWORD=sandbox_secret-1\n")).toBe(
      "sandbox_secret-1",
    );
    expect(() => parseExtraDisplayViewPassword("no password\n")).toThrow(
      ComputerScreenUnavailableError,
    );
  });

  it("starts primary noVNC with a hang-safe listen check instead of netstat", () => {
    const command = ensurePrimaryNovncCommand(":0", "view-key");
    expect(command).toContain('socket.create_connection(("127.0.0.1", 6080), 1)');
    expect(command).toContain('socket.create_connection(("127.0.0.1", 5900), 1)');
    expect(command).toContain("/proc/net/tcp");
    expect(command).toContain("command -v websockify");
    expect(command).toContain("./novnc_proxy --vnc localhost:5900");
    expect(command).toContain("/opt/noVNC/utils/websockify/run");
    expect(command).not.toContain("netstat");
    expect(command).not.toContain("pkill -x x11vnc");
    expect(command).not.toContain("/dev/tcp");
  });
});

describe("authenticated screen scripts", () => {
  it("confirms the old extra listener closed and the replacement is read-only before returning its password", () => {
    const command = ensureExtraDisplayCommand(
      extraDisplayLayout(1, ":0"),
      {
        homeDir: "/home/user",
        browserProfilesDir: "/home/user/profiles",
      },
      "view-key",
    );
    expect(command.indexOf("Screen listener did not stop")).toBeLessThan(
      command.indexOf("x11vnc -storepasswd"),
    );
    const finalWait = command.slice(command.lastIndexOf("for i in $(seq 1 50)"));
    expect(finalWait).toContain("pgrep -f");
    expect(finalWait).toContain("-viewonly -rfbauth");
    expect(finalWait).toContain("-noremote");
    expect(finalWait.indexOf("-noremote")).toBeLessThan(
      finalWait.indexOf("RAKAZO_SCREEN_PASSWORD"),
    );
  });

  it("uses permanent read-only auth, localhost RFB, and no inherited setup lock", () => {
    const command = ensurePrimaryNovncCommand(":0", "view-key");
    expect(command).toContain(
      "-viewonly -rfbauth /tmp/rakazo-view-0.vncpass -listen 127.0.0.1 -rfbport 5900 -noremote",
    );
    expect(command).toContain("7>&- 8>&-");
    expect(command).toContain("flock 8");
    expect(command).toContain("RAKAZO_SCREEN_PASSWORD=");
    expect(command).not.toContain("-nopw");
    expect(command).not.toContain("noviewonly");
    expect(command).not.toMatch(/if .*6080.*then exit 0; fi/);
  });
});

describe("screen command execution", () => {
  it.each([
    ["primary", ensurePrimaryNovncCommand(":0", "synthetic-view")],
    [
      "extra",
      ensureExtraDisplayCommand(
        extraDisplayLayout(1, ":0"),
        { homeDir: "/home/user", browserProfilesDir: "/home/user/profiles" },
        "synthetic-view",
      ),
    ],
    [
      "control",
      extraDisplayControlStartCommand(extraDisplayLayout(0, ":0"), "lease", "synthetic-control"),
    ],
  ])("releases the %s setup command's pipes while noVNC remains running", async (_name, script) => {
    const dir = mkdtempSync(path.join(tmpdir(), "screen-detach-test-"));
    const ready = path.join(dir, "ready");
    const gate = path.join(dir, "stop");
    const done = path.join(dir, "done");
    writeFileSync(
      path.join(dir, "novnc_proxy"),
      `#!/bin/sh\nprintf ready > '${ready}'\nwhile [ ! -f '${gate}' ]; do sleep 0.01; done\nprintf done > '${done}'\n`,
      { mode: 0o700 },
    );
    const launch = script
      .split("\n")
      .find((line) => line.includes("cd /opt/noVNC/utils"))!
      .replace("/opt/noVNC/utils", dir)
      .replace(/>\/tmp\/[^ ]+/, `>${path.join(dir, "output.log")}`);
    const completed = new Promise<void>((resolve, reject) => {
      execFile("bash", ["-c", launch], (error) => (error ? reject(error) : resolve()));
    });
    void completed.catch(() => undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = Date.now() + 5_000;
      while (!existsSync(ready) && Date.now() < deadline) await delay(10);
      expect(existsSync(ready)).toBe(true);
      // Model the SDK waiting for stdout/stderr EOF. The daemon cannot exit
      // until finally releases it, so retaining its wrapper pipes fails here.
      await Promise.race([
        completed,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("noVNC retained the setup pipes")), 2_000);
        }),
      ]);
      expect(existsSync(done)).toBe(false);
    } finally {
      clearTimeout(timer);
      writeFileSync(gate, "stop");
      await completed.catch(() => undefined);
      const deadline = Date.now() + 1_000;
      while (existsSync(ready) && !existsSync(done) && Date.now() < deadline) await delay(10);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("parses every generated primary/extra setup, release, and control script as bash", () => {
    const primary = extraDisplayLayout(0, ":0");
    const extra = extraDisplayLayout(1, ":0");
    for (const command of [
      ensurePrimaryNovncCommand(":0", "synthetic-view"),
      ensureExtraDisplayCommand(
        extra,
        { homeDir: "/home/user", browserProfilesDir: "/home/user/profiles" },
        "synthetic-view",
      ),
      releaseExtraDisplayCommand("writer", "run:2", ":0"),
      extraDisplayControlStartCommand(primary, "lease-2", "synthetic-control"),
      extraDisplayControlStartCommand(extra, "lease-2", "synthetic-control"),
      extraDisplayControlStopCommand(primary, "lease-2"),
    ])
      expect(() => execFileSync("bash", ["-n"], { input: command, stdio: "pipe" })).not.toThrow();
  });

  it("fences stale control revocation and rejects listeners that remain open", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "screen-script-test-"));
    const runtime = path.join(dir, "rakazo");
    const log = path.join(dir, "calls");
    const bin = path.join(dir, "bin");
    mkdirSync(bin);
    mkdirSync(runtime);
    const stub = (name: string, body: string) =>
      writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o700 });
    stub("flock", "exit 0");
    stub("sleep", "exit 0");
    stub("awk", "exit 1");
    stub("pkill", `printf '%s\\n' "$*" >> '${log}'; exit 0`);
    stub("python3", "exit 1");
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
    const stop = (token: string) =>
      extraDisplayControlStopCommand(extraDisplayLayout(0, ":0"), token).replaceAll(
        "/tmp/rakazo",
        runtime,
      );
    try {
      writeFileSync(path.join(runtime, "control-token-0"), "new-lease");
      expect(() =>
        execFileSync("bash", ["-c", stop("old-lease")], { env, stdio: "pipe" }),
      ).not.toThrow();
      expect(readFileSync(path.join(runtime, "control-token-0"), "utf8")).toBe("new-lease");
      expect(() => readFileSync(log)).toThrow();
      // A provider that cannot stop the listener must not report control as revoked.
      stub("python3", "exit 0");
      expect(() =>
        execFileSync("bash", ["-c", stop("new-lease")], { env, stdio: "pipe" }),
      ).toThrow();
      expect(readFileSync(path.join(runtime, "control-token-0"), "utf8")).toBe("new-lease");
      stub("python3", "exit 1");
      expect(() =>
        execFileSync("bash", ["-c", stop("new-lease")], { env, stdio: "pipe" }),
      ).not.toThrow();
      expect(() => readFileSync(path.join(runtime, "control-token-0"))).toThrow();
      expect(readFileSync(log, "utf8")).toContain("5901");
      expect(readFileSync(log, "utf8")).not.toContain("5900");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
