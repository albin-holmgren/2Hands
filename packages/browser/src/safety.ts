/**
 * Pure security helpers for BrowserProvider implementations.
 *
 * No playwright imports — everything here is deterministic, side-effect free,
 * and unit-testable without launching a browser. `local-playwright.ts` calls
 * these at every trust boundary so the enforcement logic itself is covered by
 * plain unit tests.
 */
import { normalizeOrigin } from '@2hands/secret-broker'
import type { ObservedSemantic, PageKind, SafeObservation } from './types'

/** The only semantics a SafeObservation may carry as field descriptors. */
export const OBSERVED_SEMANTICS: readonly ObservedSemantic[] = ['username', 'email', 'password', 'otp']

const MAX_SAFE_TEXTS = 40
const MAX_SAFE_TEXT_LENGTH = 200

/**
 * Normalize an origin allowlist. Fails closed: any malformed entry (path,
 * query, hash, or unparsable) throws so a session can never start with a
 * looser-than-intended allowlist.
 */
export function normalizeAllowedOrigins(origins: string[]): string[] {
  if (origins.length === 0) throw new Error('allowedOrigins must not be empty')
  return [...new Set(origins.map(normalizeOrigin))].sort()
}

/** Bare lowercase origin of a URL, or null when unparsable (fail closed). */
export function originOf(url: string): string | null {
  try {
    return new URL(url).origin.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Exact-origin allowlist check for a full URL. Unparsable URLs and opaque
 * origins (`about:blank` → "null") are never allowed; malformed allowlist
 * entries are skipped rather than matched (fail closed on both sides).
 */
export function isUrlOriginAllowed(url: string, allowedOrigins: string[]): boolean {
  const origin = originOf(url)
  if (!origin || origin === 'null') return false
  for (const allowed of allowedOrigins) {
    try {
      if (normalizeOrigin(allowed) === origin) return true
    } catch {
      // malformed allowlist entry — never treat as a match
    }
  }
  return false
}

export type FieldMatchDecision =
  | { ok: true }
  | { ok: false; safeErrorCode: 'ambiguous_field' }

/**
 * Deterministic field-resolution rule for secret injection: exactly one
 * `[data-semantic]` match is required. Zero matches and multiple matches are
 * both ambiguous — the injector aborts rather than guessing (a page showing
 * duplicate password fields is exactly the prompt-injection/overlay case).
 */
export function fieldMatchDecision(matchCount: number): FieldMatchDecision {
  if (matchCount === 1) return { ok: true }
  return { ok: false, safeErrorCode: 'ambiguous_field' }
}

/** Valid `data-action` target names; anything else is rejected before selector use. */
export function isValidActionTarget(target: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(target)
}

/**
 * Reduce raw `data-semantic` attribute values to the allowed descriptor set:
 * unknown semantics are dropped, duplicates collapse, order is stable.
 * Descriptors are structurally empty — `present: true` and nothing else.
 */
export function sanitizeSemanticFields(raw: Array<string | null | undefined>): SafeObservation['semanticFields'] {
  const seen = new Set<ObservedSemantic>()
  for (const value of raw) {
    if (value && (OBSERVED_SEMANTICS as readonly string[]).includes(value)) {
      seen.add(value as ObservedSemantic)
    }
  }
  return OBSERVED_SEMANTICS.filter((semantic) => seen.has(semantic)).map((semantic) => ({
    semantic,
    present: true as const,
  }))
}

/**
 * Sanitize collected page texts: trim, drop empties, collapse whitespace,
 * dedupe, and cap count/length. The collector in the provider only ever reads
 * non-form-control text, so no input value can appear here by construction —
 * this function additionally bounds what does.
 */
export function sanitizeSafeTexts(raw: Array<string | null | undefined>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of raw) {
    if (!value) continue
    const text = value.replace(/\s+/g, ' ').trim().slice(0, MAX_SAFE_TEXT_LENGTH)
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push(text)
    if (out.length >= MAX_SAFE_TEXTS) break
  }
  return out
}

/** Assemble a SafeObservation from already-collected raw page data. */
export function buildSafeObservation(input: {
  url: string
  pageKind: PageKind
  rawSemantics: Array<string | null | undefined>
  rawTexts: Array<string | null | undefined>
}): SafeObservation {
  return {
    url: input.url,
    origin: originOf(input.url) ?? 'null',
    pageKind: input.pageKind,
    semanticFields: sanitizeSemanticFields(input.rawSemantics),
    safeTexts: sanitizeSafeTexts(input.rawTexts),
  }
}
