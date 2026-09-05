import { testDatabaseUrl } from "./test-database-url.js";

export const SANDBOX_CANARY_LIFETIME_MS = 180_000;
export type CanaryProvider = "all" | "e2b" | "box" | "openrouter";

export function canaryProvider(args: readonly string[]): CanaryProvider {
  const value =
    args.find((arg) => arg.startsWith("--provider="))?.slice("--provider=".length) ?? "all";
  if (!["all", "e2b", "box", "openrouter"].includes(value))
    throw new Error("--provider must be all, e2b, box, or openrouter");
  return value as CanaryProvider;
}

/** Never let a live provider check inherit production storage or unrelated services. */
export function providerCanaryEnv(
  source: NodeJS.ProcessEnv,
  provider: CanaryProvider,
  databaseUrl?: string,
) {
  const selected = (name: Exclude<CanaryProvider, "all">) =>
    provider === "all" || provider === name;
  return {
    ...source,
    RAKAZO_IGNORE_ENV_FILES: "1",
    VERIFY_PROVIDERS: "1",
    DATABASE_URL: databaseUrl,
    REALTIME_DATABASE_URL: databaseUrl,
    DATA_DIR: undefined,
    BILLING_ENABLED: "false",
    SANDBOX_PROVIDER: "fake",
    SANDBOX_IDLE_MS: String(SANDBOX_CANARY_LIFETIME_MS),
    SANDBOX_COMMAND_TIMEOUT_MS: "30000",
    AGENT_RUNTIME: "pi",
    WAKEUP_DRIVER: "memory",
    PI_DEFAULT_PROVIDER: "openrouter",
    PI_DEFAULT_MODEL: "deepseek/deepseek-v4-flash-0731",
    E2B_API_KEY: selected("e2b") ? source.E2B_API_KEY : undefined,
    BOX_API_KEY: selected("box") ? source.BOX_API_KEY : undefined,
    OPENROUTER_API_KEY: selected("openrouter") ? source.OPENROUTER_API_KEY : undefined,
    COMPOSIO_API_KEY: "",
    PIPEDREAM_CLIENT_ID: "",
    PIPEDREAM_CLIENT_SECRET: "",
    PIPEDREAM_PROJECT_ID: "",
    SMTP_URL: "",
    EMAIL_FROM: "",
    SLACK_BOT_TOKEN: "",
    SLACK_SIGNING_SECRET: "",
    TELEGRAM_BOT_TOKEN: "",
    WHATSAPP_ACCESS_TOKEN: "",
    SENDBLUE_API_KEY_ID: "",
    MESSAGING_OPEN_SIGNUP: "false",
    SIGNUPS_ENABLED: "true",
    SIGNUPS_LOCKED: "false",
    SIGNUP_ALLOWLIST: "",
  };
}

export function canaryDatabaseUrl(source: NodeJS.ProcessEnv) {
  return testDatabaseUrl(source.TEST_DATABASE_URL);
}

export function sandboxCanaryRequest(now = Date.now()) {
  return {
    botId: `synthetic-canary-${now}`,
    homePath: "/home/user/rakazo-home",
    expiresAt: new Date(now + SANDBOX_CANARY_LIFETIME_MS).toISOString(),
  };
}
