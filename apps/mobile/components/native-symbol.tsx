import Ionicons from "@react-native-vector-icons/ionicons";
import { SymbolView } from "expo-symbols";
import type { ComponentProps } from "react";
import { useNativeTheme } from "../lib/theme";

export function NativeSymbol({
  ios,
  android,
  size = 18,
  color,
}: {
  ios: string;
  android: ComponentProps<typeof Ionicons>["name"];
  size?: number;
  color?: string;
}) {
  const native = useNativeTheme();
  return (
    <SymbolView
      name={ios as never}
      size={size}
      tintColor={color ?? native.ink}
      weight="medium"
      resizeMode="scaleAspectFit"
      fallback={<Ionicons name={android} size={size} color={color ?? native.ink} />}
    />
  );
}
