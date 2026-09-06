import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

function startService(name) {
  // Direct Node children receive our signals themselves. A pnpm/tsx shell
  // wrapper can otherwise leave the actual worker running during replacement.
  return spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: fileURLToPath(new URL(`../../apps/${name}/`, import.meta.url)),
    stdio: "inherit",
    env: process.env,
  });
}

/** Keep the volume-sharing services together through startup, crashes and shutdown. */
export function superviseServices({
  start = startService,
  restartDelayMs = 2_000,
  shutdownTimeoutMs = 55_000,
  signals = process,
  log = console.error,
} = {}) {
  return new Promise((resolve) => {
    const children = new Set();
    let stopping = false;
    let exitCode = 0;
    let restartTimer;
    let shutdownTimer;

    const finish = () => {
      if (!stopping || children.size > 0) return;
      clearTimeout(restartTimer);
      clearTimeout(shutdownTimer);
      signals.off("SIGTERM", onSignal);
      signals.off("SIGINT", onSignal);
      resolve(exitCode);
    };

    const shutdown = (code) => {
      if (stopping) return;
      stopping = true;
      exitCode = code;
      clearTimeout(restartTimer);
      log("stopping api and worker");
      for (const child of children) child.kill("SIGTERM");
      shutdownTimer = setTimeout(() => {
        log("service shutdown exceeded its deadline");
        exitCode = 1;
        for (const child of children) child.kill("SIGKILL");
      }, shutdownTimeoutMs);
      finish();
    };
    const onSignal = () => shutdown(0);
    signals.on("SIGTERM", onSignal);
    signals.on("SIGINT", onSignal);

    const launch = (name) => {
      if (stopping) return;
      let child;
      try {
        child = start(name);
      } catch {
        log(`${name} could not start`);
        shutdown(1);
        return;
      }
      children.add(child);
      child.once("error", () => log(`${name} process error`));
      child.once("close", (code, signal) => {
        children.delete(child);
        if (stopping) {
          if ((code !== null && code !== 0) || (signal && signal !== "SIGTERM")) exitCode = 1;
          finish();
        } else if (name === "api") {
          // Fly restarts the entire Machine if the serving process disappears.
          shutdown(1);
        } else {
          log("worker exited; retrying in 2s");
          restartTimer = setTimeout(() => launch("worker"), restartDelayMs);
        }
      });
    };
    launch("worker");
    launch("api");
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await superviseServices();
}
