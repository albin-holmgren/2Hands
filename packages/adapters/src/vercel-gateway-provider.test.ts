import { describe, expect, it } from "vitest";
import {
  gatewayModelTier,
  vercelGatewayApiKey,
  vercelGatewayProvider,
  VERCEL_GATEWAY_CATALOG,
} from "./vercel-gateway-provider.js";

describe("vercel gateway catalog", () => {
  it("labels curated models with a tier", () => {
    expect(gatewayModelTier("openai/gpt-4.1-mini")).toBe("cheap");
    expect(gatewayModelTier("anthropic/claude-opus-4.6")).toBe("frontier");
    expect(gatewayModelTier("unknown/model")).toBe("ultra");
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
