/**
 * Redaction and canary scanning.
 *
 * The primary defense is architectural (plaintext never reaches model/log
 * paths); this layer is the tripwire. Given the set of live secret values in
 * a privileged scope, `scanForSecrets` detects exact occurrences and obvious
 * encodings (base64, hex, URL-encoding, whitespace-stripped) in any output
 * sink, and `redactText` scrubs command/browser output before it becomes a
 * safe event.
 */

export interface SecretScanHit {
  encoding: 'plain' | 'base64' | 'hex' | 'url' | 'stripped'
  /** Index of the matched secret in the input list — never the value. */
  secretIndex: number
}

function encodeVariants(value: string): Array<{ encoding: SecretScanHit['encoding']; needle: string }> {
  const variants: Array<{ encoding: SecretScanHit['encoding']; needle: string }> = [
    { encoding: 'plain', needle: value },
  ]
  try {
    variants.push({ encoding: 'base64', needle: btoa(value) })
  } catch {
    /* non-latin1 values: skip base64 variant */
  }
  variants.push({
    encoding: 'hex',
    needle: Array.from(new TextEncoder().encode(value))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(''),
  })
  variants.push({ encoding: 'url', needle: encodeURIComponent(value) })
  const stripped = value.replace(/\s+/g, '')
  if (stripped !== value && stripped.length >= 6) {
    variants.push({ encoding: 'stripped', needle: stripped })
  }
  // Dedupe: URL-safe values encode to themselves; keep the first (plain) hit.
  const seen = new Set<string>()
  return variants.filter((v) => {
    if (v.needle.length < 6) return false
    const key = v.needle.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Scan text for any secret value or obvious transformation of it. */
export function scanForSecrets(text: string, secretValues: string[]): SecretScanHit[] {
  const hits: SecretScanHit[] = []
  const lowered = text.toLowerCase()
  secretValues.forEach((value, secretIndex) => {
    if (!value || value.length < 6) return
    for (const { encoding, needle } of encodeVariants(value)) {
      if (lowered.includes(needle.toLowerCase())) {
        hits.push({ encoding, secretIndex })
      }
    }
  })
  return hits
}

/** Deep-scan any JSON-safe structure. Returns hits with JSON paths. */
export function scanObjectForSecrets(
  value: unknown,
  secretValues: string[],
  path = '$',
): Array<SecretScanHit & { path: string }> {
  const hits: Array<SecretScanHit & { path: string }> = []
  if (typeof value === 'string') {
    for (const hit of scanForSecrets(value, secretValues)) hits.push({ ...hit, path })
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => hits.push(...scanObjectForSecrets(item, secretValues, `${path}[${i}]`)))
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      // Keys can leak too.
      for (const hit of scanForSecrets(key, secretValues)) hits.push({ ...hit, path: `${path}.<key:${'*'.repeat(4)}>` })
      hits.push(...scanObjectForSecrets(child, secretValues, `${path}.${key}`))
    }
  }
  return hits
}

/** Replace secret occurrences (all encodings) with a fixed marker. */
export function redactText(text: string, secretValues: string[], marker = '[REDACTED]'): {
  text: string
  redactionsApplied: number
} {
  let out = text
  let count = 0
  for (const value of secretValues) {
    if (!value || value.length < 6) continue
    for (const { needle } of encodeVariants(value)) {
      if (!needle) continue
      // Case-insensitive literal replacement.
      let idx = out.toLowerCase().indexOf(needle.toLowerCase())
      while (idx !== -1) {
        out = out.slice(0, idx) + marker + out.slice(idx + needle.length)
        count++
        idx = out.toLowerCase().indexOf(needle.toLowerCase())
      }
    }
  }
  return { text: out, redactionsApplied: count }
}
