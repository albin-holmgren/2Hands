import { describe, expect, it } from "vitest";
import {
  gatewayModelTier,
  VERCEL_GATEWAY_CATALOG,
  vercelGatewayApiKey,
  vercelGatewayProvider,
} from "./vercel-gateway-provider.js";

describe("vercel gateway catalog", () => {
  it("labels curated models with a tier", () => {
    expect(gatewayModelTier("alibaba/qwen3.8-max")).toBe("cheap");
    expect(gatewayModelTier("openai/gpt-4.1-mini")).toBe("cheap");
    expect(gatewayModelTier("anthropic/claude-opus-4.6")).toBe("frontier");
    expect(gatewayModelTier("unknown/model")).toBe("ultra");
    expect(VERCEL_GATEWAY_CATALOG[0]).toMatchObject({
      id: "alibaba/qwen3.8-max",
      name: "Auto",
      tier: "cheap",
    });
    expect(VERCEL_GATEWAY_CATALOG.some((entry) => entry.vision)).toBe(true);
  });

  it("is unconfigured without a gateway key", () => {
    expect(vercelGatewayApiKey({})).toBeUndefined();
  });

  it("still lists the catalog without a key so the picker can render", () => {
    const provider = vercelGatewayProvider({});
    expect(provider.id).toBe("vercel-gateway");
    expect(provider.getModels().map((model) => model.id)).toContain("openai/gpt-4.1-mini");
  });
});
