import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

const supervisors = new Set<ChildProcess>();
const supervisorUrl = new URL("../../../infra/fly/supervise.mjs", import.meta.url).href;
const serviceSource = `
  const name = process.argv[1];
  const timer = setInterval(() => {}, 1000);
  process.on('message', message => { if (message === 'crash') process.exit(17); });
  process.on('SIGTERM', () => {
    console.log(name + ':term');
    if (process.env.IGNORE_TERM === name) return;
    setTimeout(() => {
      if (process.env.FAIL_TERM === name) process.exit(23);
      console.log(name + ':closed');
      clearInterval(timer);
      process.disconnect();
    }, 75);
  });
  console.log(name + ':ready');
`;

function launch(options: { restartDelayMs?: number; ignoreTerm?: string; failTerm?: string } = {}) {
  const source = `
    import { spawn } from 'node:child_process';
    import { superviseServices } from ${JSON.stringify(supervisorUrl)};
    const children = new Map();
    process.on('message', message => {
      if (message.startsWith('crash:')) children.get(message.slice(6))?.send('crash');
    });
    const code = await superviseServices({
      restartDelayMs: ${options.restartDelayMs ?? 20},
      shutdownTimeoutMs: 600,
      start(name) {
        const child = spawn(process.execPath, ['--eval', ${JSON.stringify(serviceSource)}, name], {
          stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
          env: {
            ...process.env,
            IGNORE_TERM: ${JSON.stringify(options.ignoreTerm ?? "")},
            FAIL_TERM: ${JSON.stringify(options.failTerm ?? "")},
          },
        });
        children.set(name, child);
        return child;
      },
    });
    process.exitCode = code;
    process.disconnect();
  `;
  const child = spawn(process.execPath, ["--input-type=module", "--eval", source], {
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  supervisors.add(child);
  let output = "";
  const collect = (data: Buffer) => {
    output = (output + data.toString()).slice(-16_384);
  };
  child.stdout!.on("data", collect);
  child.stderr!.on("data", collect);
  const closed = once(child, "close").then(([code, signal]) => {
    supervisors.delete(child);
    return { code, signal };
  });
  return {
    child,
    closed,
    output: () => output,
    async ready() {
      await expect.poll(() => output, { timeout: 5_000 }).toContain("api:ready");
      await expect.poll(() => output, { timeout: 5_000 }).toContain("worker:ready");
    },
  };
}

afterEach(async () => {
  // Only our fixture processes; the supervisor owns and terminates its children.
  await Promise.all(
    [...supervisors].map(async (child) => {
      const closed = once(child, "close");
      child.kill("SIGTERM");
      await closed;
    }),
  );
});

describe("Fly shared-volume service supervision", () => {
  it("forwards SIGTERM to both direct children and waits for their cleanup", async () => {
    const fixture = launch();
    await fixture.ready();
    fixture.child.kill("SIGTERM");

    expect(await fixture.closed).toEqual({ code: 0, signal: null });
    for (const name of ["api", "worker"]) {
      expect(fixture.output()).toContain(`${name}:term`);
      expect(fixture.output()).toContain(`${name}:closed`);
      expect(fixture.output().match(new RegExp(`${name}:ready`, "g"))).toHaveLength(1);
    }
  });

  it("stops the worker and fails the Machine when the API exits unexpectedly", async () => {
    const fixture = launch();
    await fixture.ready();
    fixture.child.send("crash:api");

    expect(await fixture.closed).toEqual({ code: 1, signal: null });
    expect(fixture.output()).toContain("worker:closed");
    expect(fixture.output().match(/worker:ready/g)).toHaveLength(1);
  });

  it("restarts a crashed worker while keeping the API alive", async () => {
    const fixture = launch();
    await fixture.ready();
    fixture.child.send("crash:worker");
    await expect
      .poll(() => fixture.output().match(/worker:ready/g)?.length, { timeout: 5_000 })
      .toBe(2);
    fixture.child.kill("SIGTERM");

    expect(await fixture.closed).toEqual({ code: 0, signal: null });
    expect(fixture.output().match(/api:ready/g)).toHaveLength(1);
    expect(fixture.output()).toContain("worker:closed");
  });

  it("cancels a pending worker restart when shutdown begins", async () => {
    const fixture = launch({ restartDelayMs: 1_000 });
    await fixture.ready();
    fixture.child.send("crash:worker");
    await expect.poll(fixture.output).toContain("worker exited; retrying");
    fixture.child.kill("SIGTERM");

    expect(await fixture.closed).toEqual({ code: 0, signal: null });
    expect(fixture.output().match(/worker:ready/g)).toHaveLength(1);
    expect(fixture.output()).toContain("api:closed");
  });

  it("bounds an unresponsive child without reporting graceful success", async () => {
    const fixture = launch({ ignoreTerm: "worker" });
    await fixture.ready();
    fixture.child.kill("SIGTERM");

    expect(await fixture.closed).toEqual({ code: 1, signal: null });
    expect(fixture.output()).toContain("api:closed");
    expect(fixture.output()).toContain("worker:term");
    expect(fixture.output()).not.toContain("worker:closed");
    expect(fixture.output()).toContain("shutdown exceeded its deadline");
  });

  it("reports cleanup failures without restarting a service during shutdown", async () => {
    const fixture = launch({ failTerm: "worker" });
    await fixture.ready();
    fixture.child.kill("SIGTERM");

    expect(await fixture.closed).toEqual({ code: 1, signal: null });
    expect(fixture.output()).toContain("api:closed");
    expect(fixture.output()).toContain("worker:term");
    expect(fixture.output()).not.toContain("worker:closed");
    expect(fixture.output().match(/worker:ready/g)).toHaveLength(1);
  });

  it("gives the supervisor a longer Fly stop deadline and runs it as the main process", () => {
    const fly = readFileSync(new URL("../../../fly.toml", import.meta.url), "utf8");
    const start = readFileSync(new URL("../../../infra/fly/start.sh", import.meta.url), "utf8");
    expect(fly).toMatch(/^kill_signal = "SIGTERM"$/m);
    expect(fly).toMatch(/^kill_timeout = 60$/m);
    expect(start).toContain("exec node infra/fly/supervise.mjs");
    expect(start.indexOf("@rakazo/db migrate")).toBeLessThan(start.indexOf("exec node"));
  });

  it("keeps CI and documented updates on the existing volume-sharing topology", () => {
    const workflow = readFileSync(
      new URL("../../../.github/workflows/ci.yml", import.meta.url),
      "utf8",
    );
    const hosting = readFileSync(
      new URL("../../../docs/2hands-hosting.md", import.meta.url),
      "utf8",
    );
    const fly = readFileSync(new URL("../../../fly.toml", import.meta.url), "utf8");
    const commands = [
      workflow.split("\n").find((line) => line.trim().startsWith("flyctl deploy ")),
      hosting.split("\n").find((line) => line.startsWith("fly deploy ")),
    ];
    for (const command of commands) {
      expect(command).toBeDefined();
      expect(command).toContain("--ha=false");
      expect(command).toContain("--update-only");
      expect(command).toContain("--strategy rolling");
      expect(command).not.toContain("--skip-release-command");
      expect(command).not.toContain("--only-machines");
    }
    expect(fly).toMatch(/^ {2}release_command = "pnpm --filter @rakazo\/db migrate"$/m);
  });
});
