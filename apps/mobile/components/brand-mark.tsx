import { brandMark } from "@rakazo/ui-tokens";
import { useId } from "react";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

/** Native rendering of the same original mark used by web and desktop. */
export function BrandMark({ size = 40 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <Svg width={size} height={size} viewBox={brandMark.viewBox} accessible={false}>
      <Defs>
        {brandMark.gradients.map((gradient, index) => (
          <LinearGradient
            key={index}
            id={`${id}-${index}`}
            x1={gradient.x1}
            y1={gradient.y1}
            x2={gradient.x2}
            y2={gradient.y2}
            gradientUnits="userSpaceOnUse"
          >
            {gradient.stops.map(([offset, color]) => (
              <Stop key={offset} offset={offset} stopColor={color} />
            ))}
          </LinearGradient>
        ))}
      </Defs>
      {brandMark.paths.map((path, index) => (
        <Path key={path} d={path} fill={`url(#${id}-${index})`} />
      ))}
    </Svg>
  );
}
