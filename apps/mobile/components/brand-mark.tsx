import { brandMark } from "@rakazo/ui-tokens";
import { useId } from "react";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

/** Native rendering of the same original mark used by web and desktop. */
export function BrandMark({ size = 40 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <Svg width={size} height={size} viewBox={brandMark.viewBox} accessible={false}>
      <Defs>
        {brandMark.gradients.map((colors, index) => (
          <LinearGradient
            key={colors[0]}
            id={`${id}-${index}`}
            x1={8}
            y1={8}
            x2={56}
            y2={56}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset={0} stopColor={colors[0]} />
            <Stop offset={1} stopColor={colors[1]} />
          </LinearGradient>
        ))}
      </Defs>
      {brandMark.paths.map((path, index) => (
        <Path key={path} d={path} fill={`url(#${id}-${index})`} />
      ))}
    </Svg>
  );
}
