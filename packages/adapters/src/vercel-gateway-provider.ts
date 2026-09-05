import {
  createProvider,
  type Model,
  type MutableModels,
  type Provider,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { AUTO_MODEL_LABEL, type ModelTier } from "@rakazo/core";
import { HOSTED_DEFAULT_MODEL_ID } from "./deployment-model.js";
import snapshot from "./gateway-catalog.json" with { type: "json" };

export const VERCEL_GATEWAY_PROVIDER_ID = "vercel-gateway";
export const VERCEL_GATEWAY_DEFAULT_URL = "https://ai-gateway.vercel.sh/v1";

export type GatewayCatalogModel = {
  id: string;
  name: string;
  tier: ModelTier;
  vision: boolean;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
};

/** Reviewed public pricing snapshot; shared by the picker, request limits, and usage meter. */
export const VERCEL_GATEWAY_CATALOG: GatewayCatalogModel[] = snapshot.models.map((model) => ({
  ...model,
  name: model.id === HOSTED_DEFAULT_MODEL_ID ? AUTO_MODEL_LABEL : model.name,
  tier:
    model.cost.input <= 2 && model.cost.output <= 6
      ? "cheap"
      : model.cost.output >= 50
        ? "ultra"
        : model.cost.output >= 20
          ? "frontier"
          : "mid",
}));
export const GATEWAY_PRICING_UPDATED_AT = snapshot.retrievedAt;

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
    cost: entry.cost,
    contextWindow: entry.contextWindow,
    maxTokens: entry.maxTokens,
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
