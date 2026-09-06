import { describe, expect, it } from "vitest";
import { selectRunModel } from "./model-selection.js";

const base = {
  overrideCredential: null,
  defaultCredential: { provider: "other", defaultModel: "other-model", secretId: "private-key" },
  deployment: { provider: "hosted", model: "default-model", key: "fake-deployment-key" },
};
describe("model selection", () => {
  it("honors a deployment-funded override without using the workspace's other key", () => {
    expect(
      selectRunModel({ ...base, override: { modelProvider: "hosted", modelId: "chosen" } }),
    ).toMatchObject({ provider: "hosted", id: "chosen", credential: null, funding: "hosted" });
  });
  it("does not silently replace an unavailable explicit model", () => {
    expect(() =>
      selectRunModel({ ...base, override: { modelProvider: "missing", modelId: "chosen" } }),
    ).toThrow(/unavailable/);
  });
  it("keeps an existing run on its original funding even after a user adds a key", () => {
    expect(
      selectRunModel({
        ...base,
        funding: "hosted",
        override: { modelProvider: "hosted", modelId: "chosen" },
        overrideCredential: { provider: "hosted", defaultModel: "different", secretId: "new-key" },
      }),
    ).toMatchObject({ id: "chosen", credential: null, funding: "hosted" });
  });
  it("does not switch a resumed BYOK run to deployment spending after key removal", () => {
    expect(() =>
      selectRunModel({
        ...base,
        funding: "byok",
        override: { modelProvider: "hosted", modelId: "chosen" },
      }),
    ).toThrow(/Reconnect/);
  });
  it("keeps the workspace default provider/model/key together", () => {
    expect(selectRunModel(base)).toMatchObject({
      provider: "other",
      id: "other-model",
      funding: "byok",
    });
  });
});
