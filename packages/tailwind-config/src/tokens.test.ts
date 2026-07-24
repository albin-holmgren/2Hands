#!/usr/bin/env npx tsx
// Token drift test: asserts colors.ts + tokens.ts match design-tokens.json
// (canonical source of truth). Run with: pnpm test (tsx src/tokens.test.ts)

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { colors } from './colors'
import { durationMs, font, layout, radius, shadows, spacePx } from './tokens'

interface DesignTokensJson {
  color: {
    brand: Record<string, string>
    light: Record<string, string>
    dark: Record<string, string>
  }
  font: {
    ui: string[]
    display: string[]
    editorial: string[]
    mono: string[]
    weight: Record<string, number>
    sizePx: Record<string, number>
  }
  spacePx: Record<string, number>
  radiusPx: Record<string, number>
  durationMs: Record<string, number>
  shadow: Record<string, string>
  layout: Record<string, number>
}

const tokens = JSON.parse(
  readFileSync(join(__dirname, 'design-tokens.json'), 'utf-8'),
) as DesignTokensJson

let passed = 0
let failed = 0

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++
    console.log(`  ✓ ${message}`)
  } else {
    failed++
    console.log(`  ✗ ${message}`)
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  assert(
    actual === expected,
    `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`,
  )
}

function assertRecordMatches(
  label: string,
  expected: Record<string, string | number>,
  actual: Record<string, string | number>,
): void {
  for (const key of Object.keys(expected)) {
    assertEqual(actual[key], expected[key], `${label}.${key}`)
  }
  const extra = Object.keys(actual).filter((key) => !(key in expected))
  assert(extra.length === 0, `${label} has no extra keys (${JSON.stringify(extra)})`)
}

console.log('\n🎨 Design Token Drift Tests\n')

// -- Brand hexes: design-tokens.json color.brand vs colors.ts ----------------
console.log('Brand colors (colors.ts vs design-tokens.json)')
assertEqual(colors.brand.black, tokens.color.brand.black, 'brand.black')
assertEqual(colors.brand.terracotta, tokens.color.brand.terracotta, 'brand.terracotta')
assertEqual(
  colors.brand['terracotta-dark'],
  tokens.color.brand.terracottaHover,
  'brand.terracotta-dark matches terracottaHover',
)
assertEqual(
  colors.brand['terracotta-light'],
  tokens.color.brand.terracottaLight,
  'brand.terracotta-light matches terracottaLight',
)
assertEqual(colors.brand.beige, tokens.color.brand.beige, 'brand.beige')
assertEqual(colors.brand.white, tokens.color.brand.white, 'brand.white')
assertEqual(
  colors.semanticTokens.dark['bg-primary'],
  tokens.color.brand.darkCanvas,
  'dark bg-primary matches darkCanvas',
)
assertEqual(
  colors.semanticTokens.dark['bg-secondary'],
  tokens.color.brand.darkSurface,
  'dark bg-secondary matches darkSurface',
)

// -- Semantic surfaces -------------------------------------------------------
console.log('\nSemantic surfaces')
assertEqual(
  colors.semanticTokens.dark['surface-hover'],
  tokens.color.dark.surfaceHover,
  'dark surface-hover',
)
assertEqual(
  colors.semanticTokens.dark['surface-active'],
  tokens.color.dark.surfaceActive,
  'dark surface-active',
)
assertEqual(
  colors.semanticTokens.light['surface-hover'],
  tokens.color.light.surfaceHover,
  'light surface-hover',
)
assertEqual(
  colors.semanticTokens.light['surface-active'],
  tokens.color.light.surfaceActive,
  'light surface-active',
)
assertEqual(
  colors.semanticTokens.light['text-primary'],
  tokens.color.light.textPrimary,
  'light text-primary',
)
assertEqual(
  colors.semanticTokens.dark['text-primary'],
  tokens.color.dark.textPrimary,
  'dark text-primary',
)
assertEqual(
  colors.semanticTokens.light['border-focus'],
  tokens.color.light.focus,
  'light focus',
)
assertEqual(
  colors.semanticTokens.dark['border-focus'],
  tokens.color.dark.focus,
  'dark focus',
)

// -- Radii -------------------------------------------------------------------
console.log('\nRadii (tokens.ts radius vs radiusPx)')
assertRecordMatches('radius', tokens.radiusPx, radius)

// -- Durations ---------------------------------------------------------------
console.log('\nDurations (tokens.ts durationMs vs durationMs)')
assertRecordMatches('durationMs', tokens.durationMs, durationMs)

// -- Spacing -----------------------------------------------------------------
console.log('\nSpacing (tokens.ts spacePx vs spacePx)')
assertRecordMatches('spacePx', tokens.spacePx, spacePx)

// -- Fonts -------------------------------------------------------------------
console.log('\nFonts (tokens.ts font vs font)')
for (const family of ['ui', 'display', 'editorial', 'mono'] as const) {
  assertEqual(
    JSON.stringify(font[family]),
    JSON.stringify(tokens.font[family]),
    `font.${family} stack`,
  )
}
assertRecordMatches('font.weight', tokens.font.weight, font.weight)
assertRecordMatches('font.sizePx', tokens.font.sizePx, font.sizePx)

// -- Shadows -----------------------------------------------------------------
console.log('\nShadows (tokens.ts shadows vs shadow)')
assertRecordMatches('shadows', tokens.shadow, shadows)

// -- Layout ------------------------------------------------------------------
console.log('\nLayout (tokens.ts layout vs layout)')
for (const key of Object.keys(tokens.layout)) {
  assertEqual(
    (layout as Record<string, number>)[key],
    tokens.layout[key],
    `layout.${key}`,
  )
}
// Frozen v3 sheet widths (IMPLEMENTATION_MAP §3.9) not yet in design-tokens.json layout
assertEqual(layout.authSheetMaxWidthPx, 560, 'layout.authSheetMaxWidthPx (frozen)')
assertEqual(layout.computerSheetMaxWidthPx, 680, 'layout.computerSheetMaxWidthPx (frozen)')
const knownExtras = ['authSheetMaxWidthPx', 'computerSheetMaxWidthPx']
const extraLayout = Object.keys(layout).filter(
  (key) => !(key in tokens.layout) && !knownExtras.includes(key),
)
assert(extraLayout.length === 0, `layout has no unknown extra keys (${JSON.stringify(extraLayout)})`)

console.log('\n' + '='.repeat(50))
console.log(`Results: ${passed} passed, ${failed} failed`)
console.log('='.repeat(50))

if (failed > 0) {
  process.exit(1)
}

process.exit(0)
