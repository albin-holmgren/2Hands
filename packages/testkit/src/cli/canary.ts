import { execSync } from "node:child_process";
import path from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { canaryDatabaseUrl, canaryProvider, providerCanaryEnv } from "./provider-canary-env.js";

async function main() {
  const selected = providerCanaryEnv(process.env, canaryProvider(process.argv));
  const runOpenRouter = Boolean(selected.OPENROUTER_API_KEY);
  if (!selected.E2B_API_KEY && !selected.BOX_API_KEY && !runOpenRouter) {
    throw new Error(
      "E2B_API_KEY, BOX_API_KEY, or OPENROUTER_API_KEY is required for live provider canaries",
    );
  }

  const suppliedDatabase = runOpenRouter ? canaryDatabaseUrl(process.env) : undefined;
  const postgres =
    runOpenRouter && !suppliedDatabase
      ? await new PostgreSqlContainer("postgres:16-alpine")
          .withDatabase("provider_canary_test")
          .start()
      : undefined;
  try {
    const env = {
      ...providerCanaryEnv(
        process.env,
        canaryProvider(process.argv),
        suppliedDatabase ?? postgres?.getConnectionUri(),
      ),
      BETTER_AUTH_SECRET: "provider-canary-auth-secret-at-least-32-characters",
      ENCRYPTION_KEY: "provider-canary-encryption-key-at-least-32-characters",
      SANDBOX_SUPERVISOR_TOKEN: "provider-canary-supervisor-token-at-least-32-characters",
      SCREEN_PROXY_SECRET: "provider-canary-screen-proxy-secret-at-least-32-characters",
      BETTER_AUTH_URL: "http://127.0.0.1:5173",
      WEB_ORIGIN: "http://127.0.0.1:5173",
      SIGNUPS_ENABLED: "true",
      SIGNUP_ALLOWLIST: "",
      DATA_DIR: path.resolve("test-report/canary/data"),
    };
    if (runOpenRouter) {
      execSync("pnpm --filter @rakazo/db generate", { stdio: "inherit", env });
      execSync("pnpm --filter @rakazo/db exec prisma migrate deploy", {
        stdio: "inherit",
        env,
        cwd: path.resolve("packages/db"),
      });
    }
    execSync(
      "pnpm exec vitest run --no-file-parallelism packages/testkit/src/providers.canary.test.ts",
      { stdio: "inherit", env },
    );
  } finally {
    await postgres?.stop().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
