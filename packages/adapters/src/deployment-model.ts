export const HOSTED_DEFAULT_MODEL_ID = "alibaba/qwen3.8-max";

/**
 * The deployment-wide model default: which provider a run falls back to when no user
 * credential applies, and the key for that provider.
 *
 * Vendor env names and model ids live here, in the adapter layer, not in core.
 */
export function resolveDeploymentModel(env: NodeJS.ProcessEnv = process.env) {
  const gatewayKey = env.AI_GATEWAY_API_KEY?.trim() || env.VERCEL_AI_GATEWAY_API_KEY?.trim();
  const provider = env.PI_DEFAULT_PROVIDER?.trim() || "openrouter";
  const keys: Record<string, string | undefined> = {
    openrouter: env.OPENROUTER_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
    "vercel-gateway": gatewayKey,
  };
  const models: Record<string, string> = {
    openrouter: "deepseek/deepseek-v4-flash-0731",
    anthropic: "claude-sonnet-5",
    "vercel-gateway": HOSTED_DEFAULT_MODEL_ID,
  };
  return {
    provider,
    model: env.PI_DEFAULT_MODEL?.trim() || models[provider] || models.openrouter!,
    key: keys[provider],
  };
}
