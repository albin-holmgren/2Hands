import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useNativeTheme } from "../lib/theme";

type AskAction = { id: string; label: string };

export function AskActions({
  actions,
  disabled,
  onAnswer,
}: {
  actions: AskAction[];
  disabled?: boolean;
  onAnswer: (answer: string) => Promise<void>;
}) {
  const native = useNativeTheme();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const submitting = pendingAction !== null;

  async function submit(answer: string) {
    if (disabled || submitting) return;
    setPendingAction(answer);
    try {
      await onAnswer(answer);
    } catch (error) {
      Alert.alert(
        "Could not submit answer",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {actions.map((action) => (
        <Pressable
          key={action.id}
          accessibilityRole="button"
          disabled={disabled || submitting}
          onPress={() => void submit(action.id)}
          style={{
            borderRadius: 11,
            paddingHorizontal: 14,
            paddingVertical: 12,
            minHeight: 44,
            backgroundColor:
              action.id === "allow" || action.id === "always" ? native.cream : "transparent",
            borderWidth: action.id === "deny" ? 1 : 0,
            borderColor: native.hairlineStrong,
            opacity: disabled || submitting ? 0.5 : 1,
          }}
        >
          <Text
            style={{
              color:
                action.id === "allow" || action.id === "always" ? native.creamInk : native.muted,
              fontSize: 14,
              fontWeight: action.id === "allow" || action.id === "always" ? "600" : "400",
            }}
          >
            {pendingAction === action.id ? "Sending…" : action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
