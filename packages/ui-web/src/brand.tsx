import { brandMark } from "@rakazo/ui-tokens";
import { useId } from "react";

export function BrandMark({
  size = 32,
  className,
  monochrome = false,
}: {
  size?: number;
  className?: string;
  monochrome?: boolean;
}) {
  const id = `twohands-${useId().replace(/[^a-zA-Z0-9-_]/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox={brandMark.viewBox}
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={{ flex: "none" }}
    >
      <defs>
        {brandMark.gradients.map(([start, end], index) => (
          <linearGradient
            key={index}
            id={`${id}-${index}`}
            x1="8"
            y1="8"
            x2="56"
            y2="56"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor={start} />
            <stop offset="1" stopColor={end} />
          </linearGradient>
        ))}
      </defs>
      {brandMark.paths.map((path, index) => (
        <path key={index} d={path} fill={monochrome ? "currentColor" : `url(#${id}-${index})`} />
      ))}
    </svg>
  );
}
