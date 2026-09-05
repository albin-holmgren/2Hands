import type { ModelCatalogEntry, ModelCredential, ThinkingLevel } from "@rakazo/contracts";

export type PickerModelOption = {
  key: string;
  provider: string;
  providerLabel: string;
  modelId: string;
  label: string;
};

export function modelOptionKey(provider: string, modelId: string) {
  return `${provider}::${modelId}`;
}

export function buildPickerModelOptions(
  credentials: readonly ModelCredential[],
  catalog: readonly ModelCatalogEntry[],
): PickerModelOption[] {
  const options: PickerModelOption[] = [];
  const seen = new Set<string>();
  for (const credential of credentials) {
    const providerModels = catalog.filter(
      (entry) => entry.provider === credential.provider && !entry.placeholder,
    );
    const credentialInCatalog = Boolean(
      credential.modelId && providerModels.some((entry) => entry.id === credential.modelId),
    );
    const next =
      credential.modelId && !credentialInCatalog
        ? [
            {
              key: modelOptionKey(credential.provider, credential.modelId),
              provider: credential.provider,
              providerLabel: credential.label,
              modelId: credential.modelId,
              label: credential.modelId,
            },
          ]
        : providerModels.map((entry) => ({
            key: modelOptionKey(entry.provider, entry.id),
            provider: entry.provider,
            providerLabel: entry.providerName ?? credential.label,
            modelId: entry.id,
            label: entry.label,
          }));
    for (const option of next) {
      if (seen.has(option.key)) continue;
      seen.add(option.key);
      options.push(option);
    }
  }
  for (const entry of catalog.filter((item) => item.platform && !item.placeholder)) {
    const key = modelOptionKey(entry.provider, entry.id);
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      key,
      provider: entry.provider,
      providerLabel: entry.providerName ?? entry.provider,
      modelId: entry.id,
      label: entry.label,
    });
  }
  return options;
}

export function pickerProviderRail(options: readonly PickerModelOption[]) {
  const seen = new Set<string>();
  const rail: Array<{ provider: string; label: string }> = [];
  for (const option of options) {
    if (seen.has(option.provider)) continue;
    seen.add(option.provider);
    rail.push({ provider: option.provider, label: option.providerLabel });
  }
  return rail;
}

export function providerMark(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return "?";
  const words = trimmed.split(/[\s/_-]+/).filter(Boolean);
  if (words.length >= 2) return `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`.toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

export function thinkingLevelsForModel(
  catalog: readonly ModelCatalogEntry[],
  provider: string | null | undefined,
  modelId: string | null | undefined,
): ThinkingLevel[] {
  if (!provider || !modelId) return [];
  return (
    catalog.find((entry) => entry.provider === provider && entry.id === modelId)?.thinkingLevels ??
    []
  ).filter((level) => level !== "off");
}

export function thinkingPatchForModelChange(
  current: ThinkingLevel | null | undefined,
  nextLevels: readonly ThinkingLevel[],
): { thinkingLevel: ThinkingLevel | null } | Record<string, never> {
  if (!current) return {};
  if (nextLevels.includes(current)) return {};
  return { thinkingLevel: null };
}
