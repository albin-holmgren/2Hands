// 2Hands Design Tokens (non-color)
// Values MUST stay in sync with ./design-tokens.json (canonical source of truth).
// Drift is enforced by ./tokens.test.ts — update both files together.
// Shared across web (Tailwind) and mobile (NativeWind).

/**
 * Border radii in px.
 * control = buttons (8), base = inputs (12), card = 16, sheet = 24,
 * full = orb/pills.
 */
export const radius = {
  small: 4,
  control: 8,
  base: 12,
  card: 16,
  sheet: 24,
  media: 30,
  large: 32,
  full: 9999,
} as const

/**
 * Motion durations in ms.
 * fast = hover (150), normal = sheets (200), slow = orb/theme (300).
 * Always respect prefers-reduced-motion.
 */
export const durationMs = {
  fast: 150,
  normal: 200,
  slow: 300,
  viewTransition: 220,
  fadeIn: 500,
} as const

/** Spacing scale in px, keyed by Tailwind step (1 = 4px, 2 = 8px, ...). */
export const spacePx = {
  1: 4,
  2: 8,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
} as const

/**
 * Typography.
 * ui = DM Sans, display = Newsreader (display/voice moments),
 * editorial = Playfair Display (marketing only), mono = Geist Mono.
 */
export const font = {
  ui: ['DM Sans', 'system-ui', 'sans-serif'],
  display: ['Newsreader', 'Georgia', 'serif'],
  editorial: ['Playfair Display', 'Georgia', 'serif'],
  mono: ['Geist Mono', 'ui-monospace', 'monospace'],
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  sizePx: {
    caption: 11,
    small: 13,
    compact: 14,
    body: 16,
    lead: 18,
    title: 24,
    displaySmall: 32,
    display: 40,
    heroDesktop: 60,
  },
} as const

/** Layout constraints in px. Mobile input font must be >= 16px (see font.sizePx.body). */
export const layout = {
  marketingMaxWidthPx: 1440,
  marketingGutterMobilePx: 34,
  marketingGutterDesktopPx: 60,
  conversationMaxWidthPx: 800,
  authSheetMaxWidthPx: 560,
  computerSheetMaxWidthPx: 680,
  productGutterMobilePx: 16,
  productGutterTabletPx: 24,
  productGutterDesktopPx: 32,
  minimumTouchTargetPx: 44,
} as const

/** Elevation shadows (warm-black tinted). */
export const shadows = {
  small: '0 1px 2px rgba(52, 50, 45, 0.05)',
  medium: '0 4px 6px rgba(52, 50, 45, 0.07)',
  large: '0 10px 15px rgba(52, 50, 45, 0.10)',
  popover: '0 8px 40px -8px rgba(0,0,0,0.12), 0 2px 8px -2px rgba(0,0,0,0.06)',
} as const

export type Radius = typeof radius
export type DurationMs = typeof durationMs
export type SpacePx = typeof spacePx
export type Font = typeof font
export type Layout = typeof layout
export type Shadows = typeof shadows
