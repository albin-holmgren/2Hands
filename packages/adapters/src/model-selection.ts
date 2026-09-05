import type { AgentRunRequest } from "@rakazo/adapter-kit";
import { ExecutionError } from "@rakazo/core";

type Credential = { provider: string; defaultModel: string | null; secretId: string };
export type ModelSelectionInput = {
  override?: {
    modelProvider: string | null;
    modelId: string | null;
    thinkingLevel?: string | null;
  } | null;
  overrideCredential: Credential | null;
  defaultCredential: Credential | null;
  settings?: { defaultModelProvider: string | null; defaultModelId: string | null } | null;
  deployment?: { provider: string; model: string; key?: string } | null;
  funding?: string | null;
};

export class ModelUnavailableError extends ExecutionError {
  constructor(message: string) {
    super("MODEL_UNAVAILABLE", message);
    this.name = "ModelUnavailableError";
  }
}

/** Resolve the model and its funding together. An explicit choice never silently falls back. */
export function selectRunModel(input: ModelSelectionInput) {
  const override = input.override;
  let credential: Credential | null = null;
  let provider: string;
  let id: string;
  if (override?.modelProvider && override.modelId) {
    provider = override.modelProvider;
    id = override.modelId;
    credential = input.funding === "hosted" ? null : input.overrideCredential;
    if (credential && credential.provider !== provider) {
      throw new ModelUnavailableError("The selected model credential belongs to another provider.");
    }
    if (!credential && input.funding === "byok") {
      throw new ModelUnavailableError("Reconnect the key used by this run before resuming it.");
    }
    if (
      !credential &&
      provider !== "local" &&
      provider !== "scripted" &&
      !(input.deployment?.provider === provider && input.deployment.key)
    ) {
      throw new ModelUnavailableError(
        "The selected model is unavailable. Connect its provider or choose another model.",
      );
    }
  } else if (input.defaultCredential) {
    credential = input.defaultCredential;
    provider = credential.provider;
    const configured =
      input.settings?.defaultModelProvider === provider ? input.settings.defaultModelId : null;
    id =
      credential.defaultModel ??
      configured ??
      (input.deployment?.provider === provider ? input.deployment.model : undefined) ??
      "";
    if (!id) throw new ModelUnavailableError("Choose a default model for the connected provider.");
  } else {
    provider = input.settings?.defaultModelProvider ?? input.deployment?.provider ?? "scripted";
    id =
      input.settings?.defaultModelId ??
      (input.deployment?.provider === provider ? input.deployment.model : undefined) ??
      "scripted";
  }
  return {
    provider,
    id,
    credential,
    funding: credential ? ("byok" as const) : ("hosted" as const),
    thinkingLevel: (override?.thinkingLevel ?? null) as AgentRunRequest["model"]["thinkingLevel"],
  };
}
