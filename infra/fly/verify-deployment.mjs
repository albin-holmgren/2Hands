import path from "node:path";
import { fileURLToPath } from "node:url";

/** Read-only HTTP checks. Provider, payment and native journeys are separate release gates. */
export async function verifyDeployment({ origin, revision, mode = "controlled", request = fetch }) {
  const url = new URL(origin);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Use the canonical HTTPS origin without credentials, paths or query strings.");
  }
  if (!/^[a-f0-9]{40}$/.test(revision ?? "")) {
    throw new Error("An exact 40-character expected source revision is required.");
  }
  if (!["controlled", "public"].includes(mode))
    throw new Error("Mode must be controlled or public.");
  const checks = [];
  function check(id, passed, detail) {
    checks.push({ id, passed: Boolean(passed), detail });
  }
  async function read(route, json) {
    try {
      const response = await request(new URL(route, url), {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error("HTTP response was not successful");
      return json ? await response.json() : await response.text();
    } catch {
      check(route, false, "Endpoint failed, redirected or returned an invalid response.");
      return null;
    }
  }
  const [health, capabilities, html] = await Promise.all([
    read("/health", true),
    read("/api/auth/capabilities", true),
    read("/sign-in", false),
  ]);
  check(
    "revision",
    health?.revision === revision,
    "The running image must match the verified source revision.",
  );
  check(
    "runtime",
    health?.ok === true && health?.runtime === "pi",
    "Hosted inference must use the real runtime.",
  );
  check(
    "computer",
    ["e2b", "daytona", "box", "docker"].includes(health?.sandbox),
    "An isolated computer provider must be configured; its live canary must also pass.",
  );
  check(
    "durability",
    health?.jobs === "graphile" && health?.realtime === "postgres",
    "Background work and realtime must use durable production services.",
  );
  check(
    "email",
    typeof health?.email === "string" &&
      health.email.trim().length > 0 &&
      !["fake", "emulator"].includes(health.email),
    "A production email provider must be configured.",
  );
  check(
    "password-recovery",
    capabilities?.passwordReset === true,
    "Password recovery must be available to users.",
  );
  check(
    "signup-policy",
    capabilities?.signupsEnabled === (mode === "public"),
    `Signup must be explicitly ${mode === "public" ? "open" : "controlled"}; missing policy metadata fails closed.`,
  );
  check(
    "web",
    typeof html === "string" && /<div\b[^>]*\bid=["']root["']/i.test(html),
    "The same-origin web application must be served.",
  );
  return {
    ok: checks.every((entry) => entry.passed),
    scope: "HTTP deployment smoke checks",
    mode,
    revision,
    checks,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (name) => args[args.indexOf(name) + 1];
  try {
    const report = await verifyDeployment({
      origin: args.includes("--origin") ? value("--origin") : "https://app.2hands.ai",
      revision: args.includes("--revision") ? value("--revision") : undefined,
      mode: args.includes("--mode") ? value("--mode") : "controlled",
    });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Deployment verification failed.");
    process.exitCode = 1;
  }
}
