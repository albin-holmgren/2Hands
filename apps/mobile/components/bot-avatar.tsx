import type { AvatarStyle } from "@rakazo/contracts";
import { ACTIVE_RUN_STATUSES, avatarIdentitySeed } from "@rakazo/core";
import { assistantCharacter, assistantCharacters, assistantPalette } from "@rakazo/ui-tokens";
import { memo, useEffect, useId } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, G, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { workingAvatarDuration, workingAvatarFrame } from "../lib/avatar-motion";
import { useNativeTheme } from "../lib/theme";
import { useAvatarStyle } from "./avatar-style";
import { NativeSymbol } from "./native-symbol";

const AnimatedRect = Animated.createAnimatedComponent(Rect);

export const BotAvatar = memo(function BotAvatar({
  color,
  size = 54,
  status,
  identity,
  variant,
  muted = false,
}: {
  color: string;
  size?: number;
  status?: string;
  identity?: string;
  variant?: AvatarStyle;
  muted?: boolean;
}) {
  const native = useNativeTheme();
  const palette = assistantPalette(color);
  const isWorking = ACTIVE_RUN_STATUSES.some((activeStatus) => activeStatus === status);
  const { avatarStyle } = useAvatarStyle();
  const visorW = Math.round(size * 0.68);
  const visorH = Math.round(size * 0.44);
  const eyeW = Math.max(3, Math.round(size * 0.11));
  const eyeH = Math.max(4, Math.round(size * 0.17));
  const gap = Math.max(3, Math.round(size * 0.11));
  return (
    <View style={{ width: size, height: size }}>
      {(variant ?? avatarStyle) === "organic" ? (
        <OrganicAvatar color={color} identity={identity} size={size} isWorking={isWorking} />
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: palette.middle,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: visorW,
              height: visorH,
              borderRadius: Math.round(visorH * 0.52),
              backgroundColor: "#0C0C0E",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap,
            }}
          >
            {[0, 1].map((eye) => (
              <View
                key={eye}
                style={{
                  width: eyeW,
                  height: eyeH,
                  borderRadius: Math.max(2, Math.round(eyeW * 0.6)),
                  backgroundColor: "#fff",
                }}
              />
            ))}
          </View>
        </View>
      )}
      {isWorking ? (
        <View
          accessibilityLabel="Working"
          style={{
            position: "absolute",
            right: muted ? undefined : 0,
            left: muted ? 0 : undefined,
            bottom: 0,
            width: Math.max(6, Math.round(size * 0.18)),
            height: Math.max(6, Math.round(size * 0.18)),
            borderRadius: size,
            borderWidth: 2,
            borderColor: native.page,
            backgroundColor: native.accent,
          }}
        />
      ) : null}
      {muted ? (
        <View
          accessible
          accessibilityLabel="Notifications silenced"
          style={{
            position: "absolute",
            right: -2,
            bottom: -2,
            width: Math.max(14, Math.round(size * 0.34)),
            height: Math.max(14, Math.round(size * 0.34)),
            borderRadius: size,
            borderWidth: 2,
            borderColor: native.page,
            backgroundColor: native.surface2,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <NativeSymbol
            ios="bell.slash.fill"
            android="notifications-off"
            size={Math.max(8, Math.round(size * 0.17))}
            color={native.muted}
          />
        </View>
      ) : null}
    </View>
  );
});

function OrganicAvatar({
  color,
  identity,
  size,
  isWorking,
}: {
  color: string;
  identity?: string;
  size: number;
  isWorking: boolean;
}) {
  const seed = avatarIdentitySeed(identity || color || "#4B73FF");
  const character = assistantCharacter(seed);
  const palette = assistantPalette(color);
  const gradientId = `assistant-${useId().replace(/:/g, "")}`;
  const leftEye = character.eyes[0] ?? assistantCharacters[0].eyes[0];
  const rightEye = character.eyes[1] ?? assistantCharacters[0].eyes[1];
  const progress = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
    if (isWorking && !reducedMotion) {
      progress.value = withRepeat(
        withTiming(1, {
          duration: workingAvatarDuration(seed),
          easing: Easing.linear,
        }),
        -1,
      );
    }
    return () => cancelAnimation(progress);
  }, [isWorking, progress, reducedMotion, seed]);

  const bodyStyle = useAnimatedStyle(() => {
    if (!isWorking || reducedMotion) return { transform: [] };
    const frame = workingAvatarFrame(seed, progress.value);
    return {
      transform: [
        { translateX: (frame.translationX * size) / 120 },
        { translateY: (frame.translationY * size) / 120 },
        { rotate: `${frame.rotation}deg` },
        { scaleX: frame.scaleX },
        { scaleY: frame.scaleY },
      ],
    };
  });
  const leftEyeProps = useAnimatedProps(() => {
    const frame = workingAvatarFrame(seed, progress.value);
    return {
      x: leftEye.x + (isWorking && !reducedMotion ? frame.eyeOffsetX * 0.45 : 0),
      y: leftEye.y + (isWorking && !reducedMotion ? frame.eyeOffsetY * 0.45 : 0),
    };
  });
  const rightEyeProps = useAnimatedProps(() => {
    const frame = workingAvatarFrame(seed, progress.value);
    return {
      x: rightEye.x + (isWorking && !reducedMotion ? frame.eyeOffsetX * 0.45 : 0),
      y: rightEye.y + (isWorking && !reducedMotion ? frame.eyeOffsetY * 0.45 : 0),
    };
  });

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[{ width: size, height: size }, bodyStyle]}>
        <Svg width={size} height={size} viewBox="0 0 128 128">
          <Defs>
            <RadialGradient
              id={gradientId}
              cx={character.gradient.cx}
              cy={character.gradient.cy}
              r={character.gradient.r}
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset={0} stopColor={palette.start} />
              <Stop offset={character.gradient.middleOffset} stopColor={palette.middle} />
              <Stop offset={1} stopColor={palette.end} />
            </RadialGradient>
          </Defs>
          <Path d={character.path} fill={`url(#${gradientId})`} />
          <G fill={palette.eye}>
            <AnimatedRect
              animatedProps={leftEyeProps}
              width={leftEye.width}
              height={leftEye.height}
              rx={leftEye.rx}
            />
            <AnimatedRect
              animatedProps={rightEyeProps}
              width={rightEye.width}
              height={rightEye.height}
              rx={rightEye.rx}
            />
          </G>
        </Svg>
      </Animated.View>
    </View>
  );
}
