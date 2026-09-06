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

/** Explicit model selection for the real computer journey; no unrelated provider fallback. */
export function computerCanaryModel(source: NodeJS.ProcessEnv) {
  const provider = source.COMPUTER_E2E_PROVIDER?.trim() || "openrouter";
  if (provider !== "openrouter" && provider !== "vercel-gateway")
    throw new Error("COMPUTER_E2E_PROVIDER must be openrouter or vercel-gateway");
  const model = source.COMPUTER_E2E_MODEL?.trim();
  if (!model) throw new Error("COMPUTER_E2E_MODEL is required");
  const key =
    provider === "vercel-gateway"
      ? source.VERCEL_AI_GATEWAY_API_KEY?.trim() || source.AI_GATEWAY_API_KEY?.trim()
      : source.OPENROUTER_API_KEY?.trim();
  if (!key)
    throw new Error(
      `${provider === "vercel-gateway" ? "AI_GATEWAY_API_KEY" : "OPENROUTER_API_KEY"} is required`,
    );
  return { provider, model, key };
}

export function computerCanaryEnv(source: NodeJS.ProcessEnv, databaseUrl: string) {
  const { provider, model, key } = computerCanaryModel(source);
  if (!source.E2B_API_KEY?.trim()) throw new Error("E2B_API_KEY is required");
  return {
    ...providerCanaryEnv(source, "e2b", databaseUrl),
    RUN_COMPUTER_E2E: "1",
    SANDBOX_PROVIDER: "e2b",
    COMPUTER_E2E_PROVIDER: provider,
    COMPUTER_E2E_MODEL: model,
    PI_DEFAULT_PROVIDER: provider,
    PI_DEFAULT_MODEL: model,
    AI_GATEWAY_API_KEY: provider === "vercel-gateway" ? key : undefined,
    VERCEL_AI_GATEWAY_API_KEY: undefined,
    VERCEL_OIDC_TOKEN: undefined,
    OPENROUTER_API_KEY: provider === "openrouter" ? key : undefined,
    BILLING_ENABLED: "true",
    HOSTED_COMPUTER_USD_PER_HOUR: "0.15",
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    STRIPE_TEST_SECRET_KEY: "",
  };
}

export function sandboxCanaryRequest(now = Date.now()) {
  return {
    botId: `synthetic-canary-${now}`,
    homePath: "/home/user/rakazo-home",
    expiresAt: new Date(now + SANDBOX_CANARY_LIFETIME_MS).toISOString(),
  };
}
