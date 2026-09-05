export const dark = {
  page: "#050506",
  sidebar: "#0B0B0C",
  main: "#0D0D0E",
  panel: "#0A0A0B",
  hairline: "#171719",
  hairlineStrong: "#202023",
  surface: "#141416",
  surface2: "#1A1A1D",
  ink: "#ECECEE",
  body: "#DFDFE2",
  muted: "#85858A",
  muted2: "#6C6C70",
  cream: "#F1F1EF",
  creamInk: "#1A1A1A",
  accent: "#3EC5A8",
  danger: "#EF4444",
  dangerStrong: "#DC2626",
  dangerSoft: "#FCA5A5",
  dangerSurface: "#2A1717",
  success: "#30A24B",
  successSoft: "#4ECB71",
} as const;

export const light: Record<keyof typeof dark, string> = {
  page: "#F6F6F3",
  sidebar: "#EFEFE9",
  main: "#FAFAF7",
  panel: "#FFFFFF",
  hairline: "#E4E4DE",
  hairlineStrong: "#D4D4CC",
  surface: "#FFFFFF",
  surface2: "#F1F1EB",
  ink: "#141413",
  body: "#2C2C28",
  muted: "#6B6B66",
  muted2: "#76766F",
  cream: "#17171A",
  creamInk: "#F7F7F5",
  accent: "#1F8F78",
  danger: "#C93838",
  dangerStrong: "#AF2727",
  dangerSoft: "#9F2727",
  dangerSurface: "#FFF0EE",
  success: "#217B3A",
  successSoft: "#267C41",
};

export const palettes = { dark, light } as const;
export type UiTheme = keyof typeof palettes;
export const themeTokens = (theme: UiTheme) => palettes[theme];
/** Kept for consumers whose visual surface is explicitly dark. */
export const tokens = dark;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radii = { control: 10, card: 16, panel: 20 } as const;
export const motion = { fast: 120, normal: 180, slow: 220 } as const;

export const botColors = [
  "#3EC5A8",
  "#F5A03C",
  "#6A6BF5",
  "#9B5CF6",
  "#3B82F6",
  "#F2622A",
  "#D9508A",
] as const;
