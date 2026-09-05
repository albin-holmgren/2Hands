import type { ModelCatalogEntry, ModelCredential } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import {
  buildPickerModelOptions,
  modelOptionKey,
  pickerProviderRail,
  providerMark,
  thinkingLevelsForModel,
  thinkingPatchForModelChange,
} from "./bot-model-options";

function credential(
  partial: Partial<ModelCredential> & Pick<ModelCredential, "provider">,
): ModelCredential {
  return {
    id: partial.id ?? `cred-${partial.provider}`,
    provider: partial.provider,
    label: partial.label ?? partial.provider,
    hasKey: partial.hasKey ?? true,
    isDefault: partial.isDefault ?? false,
    modelId: partial.modelId,
    baseUrl: partial.baseUrl,
  };
}

function entry(
  partial: Pick<ModelCatalogEntry, "provider" | "id" | "label"> & Partial<ModelCatalogEntry>,
): ModelCatalogEntry {
  return {
    billing: "pay-as-you-go",
    ...partial,
  };
}

describe("buildPickerModelOptions", () => {
  it("expands a connected provider into catalog models and keeps hosted platform models", () => {
    const options = buildPickerModelOptions(
      [credential({ provider: "anthropic", label: "Anthropic" })],
      [
        entry({ provider: "anthropic", id: "claude-sonnet-4", label: "Claude Sonnet 4" }),
        entry({
          provider: "vercel-gateway",
          id: "deepseek/deepseek-v4-flash-0731",
          label: "DeepSeek V4 Flash",
          providerName: "2hands",
          platform: true,
        }),
        entry({
          provider: "anthropic",
          id: "placeholder",
          label: "Choose a model",
          placeholder: true,
        }),
      ],
    );
    expect(options.map((option) => option.key)).toEqual([
      modelOptionKey("anthropic", "claude-sonnet-4"),
      modelOptionKey("vercel-gateway", "deepseek/deepseek-v4-flash-0731"),
    ]);
    expect(pickerProviderRail(options)).toEqual([
      { provider: "anthropic", label: "Anthropic" },
      { provider: "vercel-gateway", label: "2hands" },
    ]);
  });

  it("keeps a free-form credential model that is not in the catalog", () => {
    const options = buildPickerModelOptions(
      [credential({ provider: "openai-compatible", label: "Local", modelId: "qwen3-4b" })],
      [],
    );
    expect(options).toEqual([
      {
        key: modelOptionKey("openai-compatible", "qwen3-4b"),
        provider: "openai-compatible",
        providerLabel: "Local",
        modelId: "qwen3-4b",
        label: "qwen3-4b",
      },
    ]);
  });
});

describe("thinkingLevelsForModel", () => {
  it("omits off and returns catalog thinking levels for a model", () => {
    expect(
      thinkingLevelsForModel(
        [
          entry({
            provider: "anthropic",
            id: "claude-sonnet-4",
            label: "Claude Sonnet 4",
            thinkingLevels: ["off", "low", "high"],
          }),
        ],
        "anthropic",
        "claude-sonnet-4",
      ),
    ).toEqual(["low", "high"]);
  });

  it("clears an override the next model cannot keep", () => {
    expect(thinkingPatchForModelChange("high", ["low"])).toEqual({ thinkingLevel: null });
    expect(thinkingPatchForModelChange("low", ["low", "high"])).toEqual({});
    expect(thinkingPatchForModelChange(null, ["high"])).toEqual({});
  });
});

describe("providerMark", () => {
  it("uses two initials when the label has multiple words", () => {
    expect(providerMark("OpenAI Compatible")).toBe("OC");
  });

  it("falls back to the first two characters", () => {
    expect(providerMark("Anthropic")).toBe("AN");
    expect(providerMark("")).toBe("?");
  });
});
