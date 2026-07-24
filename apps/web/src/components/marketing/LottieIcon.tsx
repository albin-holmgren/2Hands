"use client";

import { useEffect, useRef } from "react";

type LottieIconProps = {
  src: string;
  className?: string;
  width?: number | string;
  height?: number | string;
};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "dotlottie-player": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          autoplay?: boolean | string;
          loop?: boolean | string;
          style?: React.CSSProperties;
        },
        HTMLElement
      >;
    }
  }
}

export const LottieIcon = ({ src, className, width = "100%", height = "100%" }: LottieIconProps) => {
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const s = document.createElement("script");
    s.type = "module";
    s.src = "https://cdn.jsdelivr.net/npm/@dotlottie/player-component@2/dist/dotlottie-player.mjs";
    document.head.appendChild(s);
  }, []);

  return (
    <dotlottie-player
      src={src}
      autoplay
      loop
      style={{ width, height, display: "block" }}
      className={className}
    />
  );
};
