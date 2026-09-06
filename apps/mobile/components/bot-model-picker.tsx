import type { Bot, ModelCatalogEntry, ModelCredential, ThinkingLevel } from "@rakazo/contracts";
import {
  buildPickerModelOptions,
  modelOptionKey,
  type PickerModelOption,
  thinkingLevelsForModel,
  thinkingPatchForModelChange,
} from "@rakazo/core";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { type MobileMe, rpc } from "../lib/api";
import { nativeInputStyle, useNativeTheme } from "../lib/theme";
import { NativeSheet } from "./native-sheet";

export function BotModelPicker({
  botId,
  onUpdate,
}: {
  botId: string;
  onUpdate: (bot: Bot) => void;
}) {
  const native = useNativeTheme();
  const router = useRouter();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<ModelCatalogEntry[]>([]);
  const [credentials, setCredentials] = useState<ModelCredential[]>([]);
  const [bot, setBot] = useState<Bot | null>(null);
  const [me, setMe] = useState<MobileMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      void Promise.all([
        rpc<Bot>("bots/get", { botId }),
        rpc<MobileMe>("me"),
        rpc<ModelCatalogEntry[]>("models/list"),
        rpc<ModelCredential[]>("models/credentials"),
      ])
        .then(([nextBot, nextMe, models, keys]) => {
          if (active) {
            setBot(nextBot);
            setMe(nextMe);
            setCatalog(models);
            setCredentials(keys);
            setError(null);
          }
        })
        .catch((cause) => {
          if (active) setError(cause instanceof Error ? cause.message : "Could not load models");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [botId, loadAttempt]),
  );
  const provider = bot?.modelProvider ?? me?.defaultProvider;
  const model = bot?.modelId ?? me?.defaultModel;
  const options = useMemo(
    () => buildPickerModelOptions(credentials, catalog),
    [credentials, catalog],
  );
  const selected = options.find(
    (entry) => entry.key === modelOptionKey(provider ?? "", model ?? ""),
  );
  const catalogLabel = catalog.find(
    (entry) => entry.provider === provider && entry.id === model,
  )?.label;
  const modelLabel =
    selected?.label ??
    catalogLabel ??
    (bot && !bot.modelProvider && !bot.modelId ? "Workspace default" : model) ??
    "Choose model";
  const defaultLabel = catalog.find(
    (entry) => entry.provider === me?.defaultProvider && entry.id === me?.defaultModel,
  )?.label;
  const visible = options.filter((entry) =>
    `${entry.label} ${entry.modelId} ${entry.providerLabel}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const levels = thinkingLevelsForModel(catalog, provider, model);
  async function update(patch: {
    modelProvider?: string | null;
    modelId?: string | null;
    thinkingLevel?: ThinkingLevel | null;
  }) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const next = await rpc<Bot>("bots/update", { botId, ...patch });
      setBot(next);
      onUpdate(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change model. Try again.");
    } finally {
      setPending(false);
    }
  }
  async function choose(option: PickerModelOption) {
    await update({
      modelProvider: option.provider,
      modelId: option.modelId,
      ...thinkingPatchForModelChange(
        bot?.thinkingLevel,
        thinkingLevelsForModel(catalog, option.provider, option.modelId),
      ),
    });
  }
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose model"
        testID="composer-model-picker"
        onPress={() => {
          setQuery("");
          setOpen(true);
        }}
        style={{
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          alignSelf: "flex-start",
          flexShrink: 1,
        }}
      >
        <Text numberOfLines={1} style={{ color: native.ink, fontSize: 14 }}>
          {modelLabel}
          {bot?.thinkingLevel ? ` · ${bot.thinkingLevel}` : ""} ⌄
        </Text>
      </Pressable>
      {open ? (
        <NativeSheet title="Models" onClose={() => setOpen(false)}>
          <TextInput
            autoFocus
            accessibilityLabel="Search models"
            placeholder="Search models or providers"
            placeholderTextColor={native.muted2}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardAppearance={native.theme}
            style={{
              ...nativeInputStyle(native),
              marginHorizontal: 20,
              marginBottom: 12,
            }}
          />
          {error ? (
            <Text
              accessibilityRole="alert"
              style={{ color: native.danger, marginHorizontal: 20, marginBottom: 12 }}
            >
              {error}
            </Text>
          ) : null}
          {error ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setLoadAttempt((value) => value + 1)}
              style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 20 }}
            >
              <Text style={{ color: native.ink }}>Retry</Text>
            </Pressable>
          ) : null}
          {loading ? <ActivityIndicator color={native.muted} /> : null}
          {!query.trim() && !loading && bot ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Use workspace default model"
              accessibilityState={{
                selected: !bot.modelProvider && !bot.modelId,
                disabled: pending,
              }}
              disabled={pending}
              onPress={() =>
                void update({ modelProvider: null, modelId: null, thinkingLevel: null })
              }
              style={{
                marginHorizontal: 20,
                padding: 14,
                marginBottom: 12,
                borderRadius: 12,
                backgroundColor: native.surface2,
              }}
            >
              <Text style={{ color: native.ink }}>
                Workspace default {!bot.modelProvider && !bot.modelId ? "✓" : ""}
              </Text>
              <Text style={{ color: native.muted, fontSize: 12, marginTop: 4 }}>
                {defaultLabel ?? me?.defaultModel ?? "Default model"}
              </Text>
            </Pressable>
          ) : null}
          {!query.trim() && levels.length ? (
            <View style={{ paddingHorizontal: 20, paddingBottom: 16, gap: 10 }}>
              <Text style={{ color: native.muted, fontSize: 12 }}>Thinking</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {([null, ...levels] as Array<ThinkingLevel | null>).map((level) => (
                  <Pressable
                    key={level ?? "default"}
                    accessibilityRole="button"
                    accessibilityLabel={`Thinking ${level ?? "default"}`}
                    accessibilityState={{
                      selected: bot?.thinkingLevel === level,
                      disabled: pending,
                    }}
                    disabled={pending}
                    onPress={() => void update({ thinkingLevel: level })}
                    style={{
                      minHeight: 44,
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      justifyContent: "center",
                      backgroundColor:
                        bot?.thinkingLevel === level ? native.selected : native.surface2,
                    }}
                  >
                    <Text
                      style={{
                        color: bot?.thinkingLevel === level ? native.selectedInk : native.ink,
                        textTransform: "capitalize",
                      }}
                    >
                      {level ?? "Default"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          <FlatList
            data={visible}
            keyExtractor={(item) => item.key}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
            ListEmptyComponent={
              !loading ? (
                <Text style={{ color: native.muted, paddingVertical: 24 }}>
                  {query ? "No matching models" : "Connect a model provider to get started."}
                </Text>
              ) : null
            }
            renderItem={({ item }) => {
              const entry = catalog.find(
                (candidate) =>
                  candidate.provider === item.provider && candidate.id === item.modelId,
              );
              const active = item.key === selected?.key;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label}, ${item.providerLabel}`}
                  accessibilityState={{ selected: active, disabled: pending }}
                  disabled={pending}
                  onPress={() => void choose(item)}
                  style={({ pressed }) => ({
                    padding: 14,
                    borderRadius: 14,
                    marginBottom: 6,
                    backgroundColor: active
                      ? native.selected
                      : pressed
                        ? native.surface2
                        : native.page,
                    borderWidth: 1,
                    borderColor: "transparent",
                    opacity: pending ? 0.6 : 1,
                  })}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <Text
                      style={{
                        color: active ? native.selectedInk : native.ink,
                        fontSize: 16,
                        fontWeight: "500",
                        flexShrink: 1,
                      }}
                    >
                      {item.label}
                    </Text>
                    {active ? <Text style={{ color: native.accent }}>✓</Text> : null}
                  </View>
                  <Text style={{ color: native.muted, fontSize: 12, marginTop: 5 }}>
                    {item.providerLabel} · {entry?.platform ? "Included usage" : "Your connection"}
                  </Text>
                  {entry?.inputUsdPerMillion != null && entry?.outputUsdPerMillion != null ? (
                    <Text style={{ color: native.muted, fontSize: 12, marginTop: 5 }}>
                      ${entry.inputUsdPerMillion} input · ${entry.outputUsdPerMillion} output / 1M
                      tokens
                    </Text>
                  ) : entry?.billing ? (
                    <Text style={{ color: native.muted, fontSize: 12, marginTop: 5 }}>
                      {entry.billing}
                    </Text>
                  ) : null}
                </Pressable>
              );
            }}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setOpen(false);
              router.push("/models");
            }}
            style={{
              minHeight: 52,
              alignItems: "center",
              justifyContent: "center",
              borderTopWidth: 1,
              borderColor: native.hairline,
            }}
          >
            <Text style={{ color: native.ink }}>Manage connections</Text>
          </Pressable>
        </NativeSheet>
      ) : null}
    </>
  );
}
