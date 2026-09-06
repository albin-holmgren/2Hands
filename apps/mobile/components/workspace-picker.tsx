import { useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import type { MobileSpace } from "../lib/api";
import { nativeInputStyle, useNativeTheme } from "../lib/theme";
import { NativeSheet } from "./native-sheet";

export function WorkspacePicker({
  spaces,
  selectedId,
  onSelect,
  onCreate,
  onClose,
}: {
  spaces: MobileSpace[];
  selectedId?: string;
  onSelect: (id: string) => Promise<void>;
  onCreate: () => void;
  onClose: () => void;
}) {
  const native = useNativeTheme();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function choose(id: string) {
    if (pending) return;
    setPending(id);
    setError(null);
    try {
      await onSelect(id);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not switch workspace");
    } finally {
      setPending(null);
    }
  }
  return (
    <NativeSheet title="Workspaces" onClose={onClose}>
      <TextInput
        autoFocus
        accessibilityLabel="Search workspaces"
        placeholder="Search workspaces"
        placeholderTextColor={native.muted2}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        autoCapitalize="none"
        keyboardAppearance={native.theme}
        style={{
          ...nativeInputStyle(native),
          marginHorizontal: 20,
          marginBottom: 12,
        }}
      />
      {error ? (
        <Text accessibilityRole="alert" style={{ color: native.danger, marginHorizontal: 20 }}>
          {error}
        </Text>
      ) : null}
      <FlatList
        data={spaces.filter((space) =>
          space.name.toLowerCase().includes(query.trim().toLowerCase()),
        )}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        ListEmptyComponent={
          <Text style={{ color: native.muted, paddingVertical: 24 }}>No matching workspaces</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Switch to ${item.name}`}
            accessibilityState={{ selected: item.id === selectedId, disabled: Boolean(pending) }}
            disabled={Boolean(pending)}
            onPress={() => void choose(item.id)}
            style={({ pressed }) => ({
              padding: 14,
              minHeight: 64,
              borderRadius: 12,
              marginBottom: 6,
              backgroundColor:
                item.id === selectedId ? native.selected : pressed ? native.surface2 : native.page,
              opacity: pending && pending !== item.id ? 0.5 : 1,
            })}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <Text
                style={{
                  color: item.id === selectedId ? native.selectedInk : native.ink,
                  fontSize: 16,
                  fontWeight: "500",
                  flexShrink: 1,
                }}
              >
                {item.name}
              </Text>
              <Text style={{ color: native.accent }}>
                {pending === item.id ? "…" : item.id === selectedId ? "✓" : ""}
              </Text>
            </View>
            <Text style={{ color: native.muted, fontSize: 13, marginTop: 5 }}>
              {item.bots.length + item.groups.length === 0
                ? "No conversations yet"
                : item.bots.length + item.groups.length === 1
                  ? "1 conversation"
                  : `${item.bots.length + item.groups.length} conversations`}
            </Text>
          </Pressable>
        )}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create workspace"
        onPress={onCreate}
        style={{
          minHeight: 56,
          alignItems: "center",
          justifyContent: "center",
          borderTopWidth: 1,
          borderColor: native.hairline,
        }}
      >
        <Text style={{ color: native.ink, fontSize: 14, fontWeight: "600" }}>New workspace</Text>
      </Pressable>
    </NativeSheet>
  );
}
