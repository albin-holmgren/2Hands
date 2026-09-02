import {
  createProvider,
  type Model,
  type MutableModels,
  type Provider,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type { ModelTier } from "@rakazo/core";

export const VERCEL_GATEWAY_PROVIDER_ID = "vercel-gateway";
export const VERCEL_GATEWAY_DEFAULT_URL = "https://ai-gateway.vercel.sh/v1";

export type GatewayCatalogModel = {
  id: string;
  name: string;
  tier: ModelTier;
  vision: boolean;
  reasoning: boolean;
};

/** Curated 2hands catalog. Not every Gateway model — only ones we meter and support. */
export const VERCEL_GATEWAY_CATALOG: GatewayCatalogModel[] = [
  {
    id: "openai/gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    tier: "cheap",
    vision: true,
    reasoning: false,
  },
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    tier: "cheap",
    vision: true,
    reasoning: false,
  },
  {
    id: "openai/gpt-4.1",
    name: "GPT-4.1",
    tier: "mid",
    vision: true,
    reasoning: false,
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    tier: "mid",
    vision: true,
    reasoning: true,
  },
  {
    id: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    tier: "mid",
    vision: true,
    reasoning: true,
  },
  {
    id: "openai/gpt-5",
    name: "GPT-5",
    tier: "frontier",
    vision: true,
    reasoning: true,
  },
  {
    id: "anthropic/claude-opus-4.6",
    name: "Claude Opus 4.6",
    tier: "frontier",
    vision: true,
    reasoning: true,
  },
  {
    id: "xai/grok-4",
    name: "Grok 4",
    tier: "ultra",
    vision: true,
    reasoning: true,
  },
];

export function vercelGatewayApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value =
    env.AI_GATEWAY_API_KEY?.trim() ||
    env.VERCEL_AI_GATEWAY_API_KEY?.trim() ||
    env.VERCEL_OIDC_TOKEN?.trim();
  return value || undefined;
}

export function vercelGatewayBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.VERCEL_AI_GATEWAY_URL?.trim() || VERCEL_GATEWAY_DEFAULT_URL;
  return value.replace(/\/+$/, "");
}

export function gatewayModelTier(modelId: string): ModelTier {
  return VERCEL_GATEWAY_CATALOG.find((entry) => entry.id === modelId)?.tier ?? "ultra";
}

function gatewayModel(entry: GatewayCatalogModel, baseUrl: string): Model<"openai-completions"> {
  return {
    id: entry.id,
    name: entry.name,
    api: "openai-completions",
    provider: VERCEL_GATEWAY_PROVIDER_ID,
    baseUrl,
    reasoning: entry.reasoning,
    input: entry.vision ? ["text", "image"] : ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200_000,
    maxTokens: 16_384,
  };
}

export function vercelGatewayProvider(env: NodeJS.ProcessEnv = process.env): Provider {
  const baseUrl = vercelGatewayBaseUrl(env);
  return createProvider({
    id: VERCEL_GATEWAY_PROVIDER_ID,
    name: "2hands (Vercel AI Gateway)",
    baseUrl,
    auth: {
      apiKey: {
        name: "Vercel AI Gateway",
        resolve: async () => {
          const apiKey = vercelGatewayApiKey(env);
          if (!apiKey) throw new Error("AI_GATEWAY_API_KEY is not configured");
          return {
            auth: { apiKey, baseUrl },
            source: "Vercel AI Gateway",
          };
        },
      },
    },
    models: VERCEL_GATEWAY_CATALOG.map((entry) => gatewayModel(entry, baseUrl)),
    api: openAICompletionsApi(),
  });
}

export function registerVercelGatewayProvider(models: MutableModels): MutableModels {
  const provider = vercelGatewayProvider();
  if (provider) models.setProvider(provider);
  return models;
}
