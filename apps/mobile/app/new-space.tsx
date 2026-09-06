import type { Space } from "@rakazo/contracts";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { rpc, selectSpace } from "../lib/api";
import { nativeInputStyle, useNativeTheme } from "../lib/theme";

export default function NewSpace() {
  const native = useNativeTheme();
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    try {
      const space = await rpc<Space>("spaces/create", { name: trimmed });
      if (!(await selectSpace(space.id))) {
        Alert.alert("Workspace created", "It could not be opened. Try again from Workspaces.");
        router.dismissAll();
        router.replace("/");
        return;
      }
      router.dismissAll();
      router.replace("/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create workspace");
      setPending(false);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={{ color: native.accent, fontSize: 17 }}>Cancel</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        style={{ flex: 1, backgroundColor: native.page }}
        contentContainerStyle={{ padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            borderWidth: 1,
            borderColor: native.hairline,
            borderRadius: 16,
            backgroundColor: native.surface,
            padding: 18,
          }}
        >
          <Text style={{ color: native.ink, fontSize: 18, fontWeight: "600" }}>Workspace</Text>
          <Text style={{ color: native.muted, fontSize: 14, marginTop: 20 }}>Name</Text>
          <TextInput
            autoFocus
            value={name}
            maxLength={60}
            onChangeText={setName}
            onSubmitEditing={() => void create()}
            placeholder="Customer support"
            placeholderTextColor={native.muted}
            returnKeyType="done"
            style={{
              marginTop: 8,
              ...nativeInputStyle(native),
            }}
          />
          {error ? <Text style={{ color: native.danger, marginTop: 14 }}>{error}</Text> : null}
          <Pressable
            onPress={() => void create()}
            disabled={!name.trim() || pending}
            style={{
              marginTop: 20,
              backgroundColor: native.cream,
              borderRadius: 12,
              padding: 14,
              alignItems: "center",
              opacity: !name.trim() || pending ? 0.4 : 1,
            }}
          >
            <Text style={{ color: native.creamInk, fontSize: 16, fontWeight: "600" }}>
              {pending ? "Creating…" : "Create workspace"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </>
  );
}
