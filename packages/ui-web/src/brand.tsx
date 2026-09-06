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
        {brandMark.gradients.map((gradient, index) => (
          <linearGradient
            key={index}
            id={`${id}-${index}`}
            x1={gradient.x1}
            y1={gradient.y1}
            x2={gradient.x2}
            y2={gradient.y2}
            gradientUnits="userSpaceOnUse"
          >
            {gradient.stops.map(([offset, color]) => (
              <stop key={offset} offset={offset} stopColor={color} />
            ))}
          </linearGradient>
        ))}
      </defs>
      {brandMark.paths.map((path, index) => (
        <path key={index} d={path} fill={monochrome ? "currentColor" : `url(#${id}-${index})`} />
      ))}
    </svg>
  );
}
