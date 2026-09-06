export const dark = {
  page: "#121316",
  sidebar: "#15161A",
  main: "#191A1E",
  panel: "#202126",
  hairline: "#2D2E35",
  hairlineStrong: "#3D3E47",
  surface: "#23242B",
  surface2: "#2A2B33",
  ink: "#F3F3F5",
  body: "#E0E0E5",
  muted: "#ABABB6",
  muted2: "#91919F",
  cream: "#F4F4F6",
  creamInk: "#202126",
  accent: "#9AAEFF",
  userMessage: "#282930",
  userMessageInk: "#F0F0F4",
  userMessageBorder: "#393A44",
  selected: "#302D46",
  selectedInk: "#DDD7FF",
  focusRing: "#9AAEFF",
  danger: "#F47777",
  dangerStrong: "#EF6262",
  dangerSoft: "#FFC0C0",
  dangerSurface: "#382329",
  success: "#65C894",
  successSoft: "#91DAB2",
} as const;

export const light: Record<keyof typeof dark, string> = {
  page: "#FAFAFC",
  sidebar: "#F6F6F8",
  main: "#FAFAFC",
  panel: "#FFFFFF",
  hairline: "#E8E8ED",
  hairlineStrong: "#D8D8E1",
  surface: "#FFFFFF",
  surface2: "#F0F0F4",
  ink: "#252529",
  body: "#3F3F46",
  muted: "#686873",
  muted2: "#6F6F7B",
  cream: "#252529",
  creamInk: "#FFFFFF",
  accent: "#4B66CE",
  userMessage: "#FFFFFF",
  userMessageInk: "#252529",
  userMessageBorder: "#E3E3E9",
  selected: "#F0EDFF",
  selectedInk: "#6251A4",
  focusRing: "#5874DF",
  danger: "#C43C47",
  dangerStrong: "#AD2D38",
  dangerSoft: "#992F3A",
  dangerSurface: "#FFF0F1",
  success: "#267A4D",
  successSoft: "#2A7A50",
};

export const palettes = { dark, light } as const;
export type UiTheme = keyof typeof palettes;
export const themeTokens = (theme: UiTheme) => palettes[theme];
/** Kept for consumers whose visual surface is explicitly dark. */
export const tokens = dark;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radii = {
  control: 10,
  card: 16,
  panel: 20,
  composer: 24,
  message: 24,
  sheet: 24,
} as const;
export const fontSizes = {
  caption: 12,
  label: 13,
  ui: 14,
  body: 16,
  title: 20,
  heading: 28,
} as const;
export const lineHeights = {
  caption: 16,
  label: 18,
  ui: 20,
  body: 24,
  title: 28,
  heading: 34,
} as const;
export const motion = { fast: 120, normal: 180, slow: 220 } as const;
export const botColors = [
  "#4B73FF",
  "#8876DC",
  "#DB6B70",
  "#7397D8",
  "#AD78BC",
  "#CA8662",
  "#CB7193",
] as const;
export type { AssistantCharacter, AssistantPalette } from "./brand.js";
export { assistantCharacter, assistantCharacters, assistantPalette, brandMark } from "./brand.js";
