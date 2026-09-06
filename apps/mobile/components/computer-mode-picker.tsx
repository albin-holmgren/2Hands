import type { ComputerMode } from "@rakazo/contracts";
import { Pressable, Text, View } from "react-native";
import { useNativeTheme } from "../lib/theme";

export function ComputerModePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: ComputerMode | undefined;
  onChange: (mode: ComputerMode) => void;
  disabled?: boolean;
}) {
  const native = useNativeTheme();
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ color: native.muted, marginBottom: 8, fontSize: 14 }}>Computer</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["team", "dedicated"] as const).map((mode) => (
          <Pressable
            key={mode}
            accessibilityRole="button"
            accessibilityState={{ selected: value === mode, disabled }}
            disabled={disabled}
            onPress={() => onChange(mode)}
            style={{
              flex: 1,
              alignItems: "center",
              borderWidth: 1,
              borderColor: value === mode ? native.focusRing : native.hairline,
              backgroundColor: value === mode ? native.selected : native.surface,
              borderRadius: 12,
              minHeight: 44,
              paddingVertical: 12,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Text style={{ color: value === mode ? native.selectedInk : native.muted }}>
              {mode === "team" ? "Team" : "Private"}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
