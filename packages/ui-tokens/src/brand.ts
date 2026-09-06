/** Original 2hands artwork. Platform renderers share the same geometry. */
export const brandMark = {
  viewBox: "0 0 64 64",
  // The original paired three-stroke gesture, with one color for each hand.
  paths: [
    "M5.5 21a3.5 3.5 0 0 1 3.5 3.5v22a3.5 3.5 0 0 1-7 0v-22a3.5 3.5 0 0 1 3.5-3.5ZM15.5 16a3.5 3.5 0 0 1 3.5 3.5v22a3.5 3.5 0 0 1-7 0v-22a3.5 3.5 0 0 1 3.5-3.5ZM25.5 21a3.5 3.5 0 0 1 3.5 3.5v22a3.5 3.5 0 0 1-7 0v-22a3.5 3.5 0 0 1 3.5-3.5Z",
    "M38.5 21a3.5 3.5 0 0 1 3.5 3.5v22a3.5 3.5 0 0 1-7 0v-22a3.5 3.5 0 0 1 3.5-3.5ZM48.5 16a3.5 3.5 0 0 1 3.5 3.5v22a3.5 3.5 0 0 1-7 0v-22a3.5 3.5 0 0 1 3.5-3.5ZM58.5 21a3.5 3.5 0 0 1 3.5 3.5v22a3.5 3.5 0 0 1-7 0v-22a3.5 3.5 0 0 1 3.5-3.5Z",
  ],
  gradients: [
    ["#4E93FF", "#6968DF"],
    ["#F5A58D", "#DB6B83"],
  ],
} as const;

export type AssistantPalette = { start: string; middle: string; end: string; eye: string };
export type AssistantCharacter = {
  name: string;
  path: string;
  gradient: { cx: number; cy: number; r: number; middleOffset: number };
  eyes: readonly { x: number; y: number; width: number; height: number; rx: number }[];
  palette: AssistantPalette;
};

export const assistantCharacters = [
  {
    name: "Pip",
    path: "M64 12c30 0 52 21 52 51 0 31-20 51-49 51h-8C31 114 12 95 12 67c0-31 22-55 52-55Z",
    gradient: { cx: 26, cy: 16, r: 116, middleOffset: 0.3 },
    eyes: [
      { x: 48, y: 47, width: 11, height: 20, rx: 5.5 },
      { x: 75, y: 47, width: 11, height: 20, rx: 5.5 },
    ],
    palette: { start: "#9BB8FF", middle: "#4B73FF", end: "#5F66D8", eye: "#FAF8F5" },
  },
  {
    name: "Scout",
    path: "M54 14c6-4 14-4 20 0l31 18c6 4 10 10 10 18v29c0 8-4 14-10 18l-31 18c-6 4-14 4-20 0L23 97c-6-4-10-10-10-18V50c0-8 4-14 10-18l31-18Z",
    gradient: { cx: 25, cy: 14, r: 118, middleOffset: 0.3 },
    eyes: [
      { x: 48, y: 46, width: 11, height: 20, rx: 5.5 },
      { x: 75, y: 44, width: 11, height: 20, rx: 5.5 },
    ],
    palette: { start: "#C8C4FF", middle: "#8876DC", end: "#7066BD", eye: "#FAF8F5" },
  },
  {
    name: "Kit",
    path: "M43 14h42c19 0 29 10 29 29v42c0 19-10 29-29 29H43c-19 0-29-10-29-29V43c0-19 10-29 29-29Z",
    gradient: { cx: 26, cy: 15, r: 119, middleOffset: 0.3 },
    eyes: [
      { x: 45, y: 48, width: 11, height: 20, rx: 5.5 },
      { x: 72, y: 48, width: 11, height: 20, rx: 5.5 },
    ],
    palette: { start: "#FFC19D", middle: "#DB6B70", end: "#C86982", eye: "#FAF8F5" },
  },
] as const satisfies readonly AssistantCharacter[];

export function assistantCharacter(seed: number): AssistantCharacter {
  const index = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) % assistantCharacters.length : 0;
  return assistantCharacters[index] ?? assistantCharacters[0];
}

/** Existing default bot colors migrate visually; custom colors remain recognizable. */
export function assistantPalette(color: string): AssistantPalette {
  const normalized = color.toUpperCase();
  const known = assistantCharacters.find((character) => character.palette.middle === normalized);
  if (known) return known.palette;
  const legacy: Record<string, number> = {
    "#3EC5A8": 0,
    "#34C759": 0,
    "#3B82F6": 0,
    "#6A6BF5": 1,
    "#9B5CF6": 1,
    "#F5A03C": 2,
    "#F2622A": 2,
    "#D9508A": 2,
    "#D97757": 2,
  };
  const mapped = legacy[normalized];
  if (mapped !== undefined) return assistantCharacter(mapped).palette;
  if (!/^#[0-9A-F]{6}$/.test(normalized)) return assistantCharacters[0].palette;
  const rgb = [1, 3, 5].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16));
  const mix = (target: number, amount: number) =>
    `#${rgb
      .map((value) =>
        Math.round(value + (target - value) * amount)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
  const linear = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    (linear[0] ?? 0) * 0.2126 + (linear[1] ?? 0) * 0.7152 + (linear[2] ?? 0) * 0.0722;
  return {
    start: mix(255, 0.35),
    middle: normalized,
    end: mix(0, 0.12),
    eye: luminance > 0.27 ? "#252529" : "#FAF8F5",
  };
}
