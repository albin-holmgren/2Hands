/**
 * Skill Importer — Parse and import skills from URLs or raw SKILL.md content
 *
 * Supports:
 * - Raw SKILL.md markdown with YAML frontmatter
 * - GitHub URLs (raw or blob) pointing to SKILL.md files
 * - SkillsMP or any URL serving SKILL.md content
 */

import type { SkillCategory } from './skill-registry'

export interface ParsedSkill {
  name: string
  description: string
  instructions: string
  category: SkillCategory
  icon: string
  allowed_tools: string[]
  source_url?: string
}

/**
 * Parse a SKILL.md string into a structured skill definition.
 * Handles YAML frontmatter (--- delimited) + markdown body.
 */
export function parseSkillMd(content: string): ParsedSkill | { error: string } {
  const trimmed = content.trim()

  // Extract YAML frontmatter
  if (!trimmed.startsWith('---')) {
    return { error: 'Missing YAML frontmatter. Content must start with ---' }
  }

  const endIndex = trimmed.indexOf('---', 3)
  if (endIndex === -1) {
    return { error: 'Unclosed YAML frontmatter. Missing closing ---' }
  }

  const frontmatter = trimmed.slice(3, endIndex).trim()
  const body = trimmed.slice(endIndex + 3).trim()

  // Parse YAML frontmatter (simple key: value pairs)
  const meta: Record<string, string> = {}
  for (const line of frontmatter.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()
    // Remove quotes if present
    meta[key] = value.replace(/^["']|["']$/g, '')
  }

  if (!meta.name) return { error: 'Missing required field: name' }
  if (!meta.description) return { error: 'Missing required field: description' }

  // Validate name format
  const name = meta.name.toLowerCase().replace(/\s+/g, '-')
  if (!/^[a-z0-9-]+$/.test(name)) {
    return { error: `Invalid name format: "${name}". Must be lowercase letters, numbers, and hyphens only.` }
  }

  if (!body) return { error: 'Missing skill instructions (body content after frontmatter)' }

  // Detect category from content or metadata
  const category = detectCategory(meta.category || meta.tags || '', body)

  // Parse allowed-tools if present
  const allowedTools = meta['allowed-tools']
    ? meta['allowed-tools'].split(/[,\s]+/).filter(Boolean).map(t => t.trim())
    : detectTools(body)

  return {
    name,
    description: meta.description,
    instructions: body,
    category,
    icon: detectIcon(category),
    allowed_tools: mapToInternalTools(allowedTools),
  }
}

/**
 * Fetch and parse a skill from a URL.
 * Handles GitHub URLs, raw URLs, and SkillsMP links.
 */
export async function importSkillFromUrl(url: string): Promise<ParsedSkill | { error: string }> {
  // Convert GitHub blob URLs to raw URLs
  let rawUrl = url
  if (url.includes('github.com') && url.includes('/blob/')) {
    rawUrl = url
      .replace('github.com', 'raw.githubusercontent.com')
      .replace('/blob/', '/')
  }

  try {
    const response = await fetch(rawUrl, {
      headers: { 'Accept': 'text/plain, text/markdown, */*' },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      return { error: `Failed to fetch: HTTP ${response.status} ${response.statusText}` }
    }

    const content = await response.text()
    if (content.length > 50000) {
      return { error: 'Skill content too large (>50KB). Skills should be concise.' }
    }

    const result = parseSkillMd(content)
    if ('error' in result) return result

    return { ...result, source_url: url }
  } catch (err) {
    return { error: `Failed to fetch skill: ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function detectCategory(hint: string, body: string): SkillCategory {
  const text = (hint + ' ' + body).toLowerCase()
  if (/research|investigat|analyz|audit|competitor|market/.test(text)) return 'research'
  if (/code|debug|test|api|deploy|refactor|review|incident/.test(text)) return 'coding'
  if (/writ|email|content|copy|social|blog|document|brand/.test(text)) return 'writing'
  if (/data|metric|financ|pricing|model|forecast|analy/.test(text)) return 'analysis'
  if (/product|onboard|user stor|sprint|meeting|standup|roadmap/.test(text)) return 'product'
  return 'custom'
}

function detectIcon(category: SkillCategory): string {
  const icons: Record<SkillCategory, string> = {
    research: '🔍',
    coding: '💻',
    writing: '📝',
    analysis: '📊',
    product: '📋',
    custom: '⚙️',
  }
  return icons[category] ?? '⚙️'
}

function detectTools(body: string): string[] {
  const tools: string[] = []
  if (/web.?search|search.*web|look.?up|find.*online/i.test(body)) tools.push('web_search')
  if (/analyz.*url|fetch.*page|read.*website|scrape/i.test(body)) tools.push('analyze_url')
  if (/memory|remember|store.*fact|save.*insight/i.test(body)) tools.push('manage_memory_box')
  if (/board|card|kanban|task.*track/i.test(body)) tools.push('manage_board')
  if (/calculat|math|formula|comput/i.test(body)) tools.push('calculate')
  return tools
}

/**
 * Map external tool names (from Anthropic/SkillsMP format) to our internal tool names.
 */
function mapToInternalTools(tools: string[]): string[] {
  const mapping: Record<string, string> = {
    'web_search': 'web_search',
    'analyze_url': 'analyze_url',
    'manage_memory_box': 'manage_memory_box',
    'manage_board': 'manage_board',
    'calculate': 'calculate',
    'manage_recurring_task': 'manage_recurring_task',
    'create_visual_report': 'create_visual_report',
    // External tool names → our equivalents
    'Bash': 'web_search', // fallback
    'Read': 'analyze_url',
    'Grep': 'web_search',
    'WebSearch': 'web_search',
  }

  return tools
    .map(t => mapping[t] || null)
    .filter((t): t is string => t !== null)
}
