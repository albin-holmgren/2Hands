/** Original 2hands artwork. Platform renderers share the same geometry. */
export const brandMark = {
  viewBox: "0 0 64 64",
  paths: [
    "M8 55 5 48C3 44 2 41 2 37V27C2 24 6 24 6 27V33C6 34 8 34 8 33V19C8 16 12 16 12 19V31C12 32 14 32 14 31V13C14 10 18 10 18 13V31C18 32 20 32 20 31V17C20 14 24 14 24 17V36L26 33C28 30 31 32 29 35L24 46C22 49 22 51 22 55 22 56 20 57 18 57H12C10 57 9 56 8 55Z",
    "M56 55 59 48C61 44 62 41 62 37V27C62 24 58 24 58 27V33C58 34 56 34 56 33V19C56 16 52 16 52 19V31C52 32 50 32 50 31V13C50 10 46 10 46 13V31C46 32 44 32 44 31V17C44 14 40 14 40 17V36L38 33C36 30 33 32 35 35L40 46C42 49 42 51 42 55 42 56 44 57 46 57H52C54 57 55 56 56 55Z",
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
