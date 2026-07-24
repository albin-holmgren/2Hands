/**
 * Mission Intelligence Bank
 *
 * Cross-mission shared knowledge store. Every mission extracts structured
 * facts from agent completions and stores them here. Every tick reads the
 * bank so agents never repeat work done by other missions in the workspace.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createNonStreamingMessageWithFallback, normalizeModelForTransport } from '@/lib/ai/ai-client'

const EXTRACTION_MODEL = normalizeModelForTransport('google/gemini-2.5-flash')

export type IntelligenceCategory =
  | 'competitor'
  | 'customer'
  | 'market'
  | 'product'
  | 'metric'
  | 'tactic'
  | 'investor'
  | 'partner'
  | 'technology'
  | 'code'
  | 'other'

export interface IntelligenceFact {
  id: string
  workspace_id: string
  source_mission_id: string | null
  category: IntelligenceCategory
  fact: string
  confidence: number
  source_url: string | null
  tags: string[]
  discovered_at: string
}

/**
 * Extract structured facts from an agent completion summary and store them
 * in the cross-mission intelligence bank.
 */
export async function extractAndStoreFacts(
  workspaceId: string,
  missionId: string,
  missionGoal: string,
  agentSummary: string
): Promise<number> {
  if (!agentSummary || agentSummary.length < 50) return 0

  const prompt = `You are an intelligence analyst extracting key facts from an AI agent's research summary.

MISSION GOAL: "${missionGoal}"

AGENT SUMMARY:
${agentSummary.slice(0, 3000)}

Extract up to 5 discrete, specific facts that would be valuable for any future mission in this workspace.
Each fact must be:
- Specific and verifiable (names, numbers, URLs, concrete claims)
- Self-contained (understandable without the original context)
- Categorised correctly

Categories: competitor, customer, market, product, metric, tactic, investor, partner, technology, code, other

Respond ONLY with this JSON array (no markdown fences, no extra text):
[
  {
    "category": "competitor",
    "fact": "Manus.ai charges $29/mo for the Pro plan and focuses on consumer automation (source: manus.ai pricing page)",
    "confidence": 0.9,
    "source_url": "https://manus.ai/pricing",
    "tags": ["pricing", "competitor", "manus"]
  }
]

If there are no useful facts to extract, return an empty array: []`

  let facts: Array<{
    category: string
    fact: string
    confidence?: number
    source_url?: string
    tags?: string[]
  }> = []

  try {
    const { response } = await createNonStreamingMessageWithFallback({
      model: EXTRACTION_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = (response.content as Array<{ type: string; text?: string }>)
      .filter(b => b.type === 'text' && b.text)
      .map(b => b.text as string)
      .join('')
    const cleaned = text.replace(/^```(?:json)?\s*/gm, '').replace(/```\s*$/gm, '').trim()
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
    if (arrayMatch) {
      facts = JSON.parse(arrayMatch[0]) as typeof facts
    }
  } catch (err) {
    console.error('[MissionIntelligence] Extraction failed:', err)
    return 0
  }

  if (!facts.length) return 0

  const validCategories: IntelligenceCategory[] = [
    'competitor', 'customer', 'market', 'product', 'metric',
    'tactic', 'investor', 'partner', 'technology', 'code', 'other',
  ]

  const rows = facts
    .filter(f => f.fact && f.fact.length > 10)
    .map(f => ({
      workspace_id: workspaceId,
      source_mission_id: missionId,
      category: validCategories.includes(f.category as IntelligenceCategory)
        ? (f.category as IntelligenceCategory)
        : 'other',
      fact: f.fact.slice(0, 1000),
      confidence: Math.max(0, Math.min(1, f.confidence ?? 0.8)),
      source_url: f.source_url ?? null,
      tags: Array.isArray(f.tags) ? f.tags.slice(0, 10) : [],
      discovered_at: new Date().toISOString(),
    }))

  if (!rows.length) return 0

  const supabase = createAdminClient()
  const { error } = await supabase.from('mission_intelligence').insert(rows as never[])
  if (error) {
    console.error('[MissionIntelligence] Insert failed:', error.message)
    return 0
  }

  console.log(`[MissionIntelligence] Stored ${rows.length} facts for mission ${missionId}`)
  return rows.length
}

/**
 * Query the intelligence bank for facts relevant to a mission goal.
 * Returns the most recent, highest-confidence facts for the workspace.
 */
export async function getRelevantIntelligence(
  workspaceId: string,
  missionGoal: string,
  limit = 12
): Promise<IntelligenceFact[]> {
  const supabase = createAdminClient()

  // Pull recent facts across the workspace
  const { data, error } = await supabase
    .from('mission_intelligence')
    .select('*')
    .eq('workspace_id', workspaceId)
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .order('discovered_at', { ascending: false })
    .limit(limit * 3) // over-fetch then filter client-side

  if (error || !data) return []

  const facts = data as IntelligenceFact[]
  if (facts.length <= limit) return facts

  // Simple relevance filter: score by keyword overlap with mission goal
  const goalWords = new Set(
    missionGoal.toLowerCase().split(/\W+/).filter(w => w.length > 3)
  )
  const scored = facts.map(f => {
    const factWords = f.fact.toLowerCase().split(/\W+/)
    const overlap = factWords.filter(w => goalWords.has(w)).length
    return { fact: f, score: overlap + f.confidence }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map(s => s.fact)
}

/**
 * Format intelligence bank facts for injection into a mission tick prompt.
 */
export function formatIntelligenceForPrompt(facts: IntelligenceFact[]): string {
  if (!facts.length) return ''

  const byCategory = facts.reduce<Record<string, IntelligenceFact[]>>((acc, f) => {
    if (!acc[f.category]) acc[f.category] = []
    acc[f.category].push(f)
    return acc
  }, {})

  const lines: string[] = ['## SHARED INTELLIGENCE BANK (findings from all workspace missions — DO NOT repeat this research)']
  for (const [category, catFacts] of Object.entries(byCategory)) {
    lines.push(`\n**${category.toUpperCase()}:**`)
    for (const f of catFacts) {
      lines.push(`  • ${f.fact}${f.source_url ? ` [${f.source_url}]` : ''}`)
    }
  }
  lines.push('\nUse this intelligence to skip work already done and build on existing findings.')
  return lines.join('\n')
}
