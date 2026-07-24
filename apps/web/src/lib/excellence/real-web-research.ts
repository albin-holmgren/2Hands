/**
 * Real Web Research System
 * 
 * Performs actual web searches and fetches real content to make agents
 * truly "expert" at tools. Stores knowledge with citations and sources.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createNonStreamingMessageWithFallback, DEFAULT_MODEL, extractTextFromResponse } from '@/lib/ai/ai-client'

export interface ResearchSource {
  id: string
  url: string
  domain: string
  title: string
  source_type: 'official_docs' | 'help_center' | 'tutorial' | 'blog' | 'forum' | 'general'
  trust_score: number
  extracted_content?: string
  last_fetched_at?: string
}

export interface ResearchCitation {
  id: string
  tool_name: string
  knowledge_type: 'ui_element' | 'workflow' | 'error_solution' | 'best_practice' | 'keyboard_shortcut' | 'api_info'
  content: string
  source_url: string
  source_section?: string
  quote?: string
  confidence: number
  verified_by_usage: boolean
}

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

// Domain trust scores for different source types
const DOMAIN_TRUST_SCORES: Record<string, { type: ResearchSource['source_type']; score: number }> = {
  'support.google.com': { type: 'official_docs', score: 0.95 },
  'help.google.com': { type: 'help_center', score: 0.95 },
  'developers.google.com': { type: 'official_docs', score: 0.95 },
  'support.microsoft.com': { type: 'official_docs', score: 0.95 },
  'docs.microsoft.com': { type: 'official_docs', score: 0.95 },
  'help.linkedin.com': { type: 'help_center', score: 0.9 },
  'business.linkedin.com': { type: 'official_docs', score: 0.9 },
  'help.notion.so': { type: 'help_center', score: 0.9 },
  'notion.so/help': { type: 'help_center', score: 0.9 },
  'help.slack.com': { type: 'help_center', score: 0.9 },
  'api.slack.com': { type: 'official_docs', score: 0.9 },
  'help.shopify.com': { type: 'help_center', score: 0.9 },
  'docs.shopify.com': { type: 'official_docs', score: 0.9 },
  'support.stripe.com': { type: 'help_center', score: 0.9 },
  'stripe.com/docs': { type: 'official_docs', score: 0.95 },
  'docs.github.com': { type: 'official_docs', score: 0.95 },
  'support.atlassian.com': { type: 'help_center', score: 0.9 },
  'stackoverflow.com': { type: 'forum', score: 0.7 },
  'medium.com': { type: 'blog', score: 0.5 },
  'dev.to': { type: 'blog', score: 0.5 },
}

/**
 * Perform a web search using Brave Search API (preferred) or DuckDuckGo HTML fallback.
 */
export async function performWebSearch(
  query: string,
  options: { maxResults?: number; siteFilter?: string } = {}
): Promise<WebSearchResult[]> {
  const maxResults = options.maxResults || 5
  const searchQuery = options.siteFilter 
    ? `site:${options.siteFilter} ${query}`
    : query

  // Try Brave Search first (if API key is configured)
  const braveApiKey = process.env.BRAVE_SEARCH_API_KEY
  if (braveApiKey) {
    try {
      const results = await braveSearch(searchQuery, maxResults, braveApiKey)
      if (results.length > 0) return results
    } catch (error) {
      console.warn('[RealWebResearch] Brave Search failed, falling back:', error)
    }
  }

  // Fallback: DuckDuckGo HTML scraping
  try {
    const results = await duckDuckGoSearch(searchQuery, maxResults)
    if (results.length > 0) return results
  } catch (error) {
    console.warn('[RealWebResearch] DuckDuckGo search failed:', error)
  }

  return []
}

async function braveSearch(query: string, maxResults: number, apiKey: string): Promise<WebSearchResult[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
  })

  if (!response.ok) {
    throw new Error(`Brave Search HTTP ${response.status}`)
  }

  const data = await response.json() as {
    web?: { results?: Array<{ title: string; url: string; description: string }> }
  }

  return (data.web?.results || []).slice(0, maxResults).map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.description,
  }))
}

async function duckDuckGoSearch(query: string, maxResults: number): Promise<WebSearchResult[]> {
  // DuckDuckGo HTML search — parse the lite version for results
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  })

  if (!response.ok) {
    throw new Error(`DuckDuckGo HTML search HTTP ${response.status}`)
  }

  const html = await response.text()
  const results: WebSearchResult[] = []

  // Parse result links: <a rel="nofollow" class="result__a" href="...">title</a>
  const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi

  const links: Array<{ url: string; title: string }> = []
  let linkMatch
  while ((linkMatch = linkRegex.exec(html)) !== null && links.length < maxResults) {
    let href = linkMatch[1]
    // DuckDuckGo wraps URLs in redirects — extract the real URL
    if (href.includes('uddg=')) {
      const uddgMatch = href.match(/uddg=([^&]+)/)
      if (uddgMatch) href = decodeURIComponent(uddgMatch[1])
    }
    const title = linkMatch[2].replace(/<[^>]*>/g, '').trim()
    if (href && title && href.startsWith('http')) {
      links.push({ url: href, title })
    }
  }

  const snippets: string[] = []
  let snippetMatch
  while ((snippetMatch = snippetRegex.exec(html)) !== null) {
    snippets.push(snippetMatch[1].replace(/<[^>]*>/g, '').trim())
  }

  for (let i = 0; i < links.length && i < maxResults; i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] || '',
    })
  }

  return results
}

/**
 * Fetch and extract content from a URL
 */
export async function fetchAndExtractContent(url: string): Promise<{
  title: string
  content: string
  headings: string[]
} | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; 2HandsBot/1.0; +https://2hands.ai)',
      },
    })
    
    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status}`)
    }
    
    const html = await response.text()
    
    // Basic HTML parsing (in production, use a proper HTML parser)
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim() : ''
    
    // Extract headings
    const headingMatches = html.matchAll(/<h[1-3][^>]*>([^<]+)<\/h[1-3]>/gi)
    const headings: string[] = []
    for (const match of headingMatches) {
      headings.push(match[1].trim())
    }
    
    // Extract main content (simplified - removes scripts, styles, tags)
    let content = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    
    // Limit content length
    content = content.slice(0, 10000)
    
    return { title, content, headings }
  } catch (error) {
    console.error('[RealWebResearch] Fetch error:', error)
    return null
  }
}

/**
 * Get domain trust info
 */
function getDomainTrust(url: string): { type: ResearchSource['source_type']; score: number } {
  try {
    const domain = new URL(url).hostname
    
    // Check exact matches
    for (const [pattern, trust] of Object.entries(DOMAIN_TRUST_SCORES)) {
      if (domain.includes(pattern) || url.includes(pattern)) {
        return trust
      }
    }
    
    // Default for unknown domains
    return { type: 'general', score: 0.4 }
  } catch {
    return { type: 'general', score: 0.3 }
  }
}

/**
 * Store or update a research source
 */
async function storeResearchSource(
  url: string,
  title: string,
  content: string
): Promise<string | null> {
  const supabase = createAdminClient()
  const trust = getDomainTrust(url)
  
  let domain = ''
  try {
    domain = new URL(url).hostname
  } catch {
    domain = url
  }
  
  const { data, error } = await supabase
    .from('research_sources')
    .upsert({
      url,
      domain,
      title,
      source_type: trust.type,
      trust_score: trust.score,
      extracted_content: content.slice(0, 50000),
      last_fetched_at: new Date().toISOString(),
      fetch_count: 1,
    } as never, {
      onConflict: 'url',
    })
    .select('id')
    .single()
  
  if (error) {
    console.error('[RealWebResearch] Store source error:', error)
    return null
  }
  
  return (data as { id: string })?.id || null
}

/**
 * Extract knowledge citations from content using LLM
 */
async function extractKnowledgeCitations(
  toolName: string,
  sourceUrl: string,
  content: string,
  headings: string[]
): Promise<Omit<ResearchCitation, 'id'>[]> {
  const prompt = `Extract actionable knowledge about ${toolName} from this content.

SOURCE: ${sourceUrl}
HEADINGS: ${headings.slice(0, 10).join(', ')}

CONTENT:
${content.slice(0, 5000)}

Extract knowledge useful for browser automation:
- UI elements (button names, form labels, menu items)
- Workflows (step-by-step processes)
- Error solutions (common errors and fixes)
- Best practices
- Keyboard shortcuts

Respond in JSON:
{
  "citations": [
    {
      "knowledge_type": "ui_element|workflow|error_solution|best_practice|keyboard_shortcut",
      "content": "the specific knowledge",
      "section": "which heading/section it came from",
      "quote": "exact quote from source if available",
      "confidence": 0.7-1.0
    }
  ]
}

Only include knowledge that is specific and actionable. Skip generic information.`

  try {
    const { response } = await createNonStreamingMessageWithFallback({
      model: DEFAULT_MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })
    
    const text = extractTextFromResponse(response)
    
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return (parsed.citations || []).map((c: {
        knowledge_type?: string
        content?: string
        section?: string
        quote?: string
        confidence?: number
      }) => ({
        tool_name: toolName,
        knowledge_type: c.knowledge_type || 'best_practice',
        content: c.content || '',
        source_url: sourceUrl,
        source_section: c.section,
        quote: c.quote,
        confidence: c.confidence || 0.7,
        verified_by_usage: false,
      }))
    }
  } catch (error) {
    console.error('[RealWebResearch] Extract error:', error)
  }
  
  return []
}

/**
 * Store research citations
 */
async function storeResearchCitations(
  userId: string,
  sourceId: string,
  citations: Omit<ResearchCitation, 'id'>[]
): Promise<number> {
  const supabase = createAdminClient()
  let stored = 0
  
  for (const citation of citations) {
    const { error } = await supabase
      .from('research_citations')
      .insert({
        source_id: sourceId,
        user_id: userId,
        tool_name: citation.tool_name,
        knowledge_type: citation.knowledge_type,
        content: citation.content,
        source_url: citation.source_url,
        source_section: citation.source_section,
        quote: citation.quote,
        confidence: citation.confidence,
        verified_by_usage: false,
      } as never)
    
    if (!error) stored++
  }
  
  return stored
}

/**
 * Perform comprehensive research on a tool
 */
export async function researchTool(
  userId: string,
  toolName: string,
  options: {
    queries?: string[]
    maxSources?: number
    officialDocsOnly?: boolean
  } = {}
): Promise<{
  sourcesResearched: number
  citationsExtracted: number
  topCitations: ResearchCitation[]
}> {
  const maxSources = options.maxSources || 5
  
  // Default search queries
  const defaultQueries = [
    `${toolName} how to use guide`,
    `${toolName} UI tutorial`,
    `${toolName} common errors solutions`,
    `${toolName} keyboard shortcuts`,
    `${toolName} best practices`,
  ]
  
  const queries = options.queries || defaultQueries.slice(0, 3)
  
  // Known official doc sites for tools
  const officialSites: Record<string, string> = {
    gmail: 'support.google.com',
    'google-sheets': 'support.google.com',
    'google-docs': 'support.google.com',
    'google-drive': 'support.google.com',
    linkedin: 'help.linkedin.com',
    notion: 'notion.so/help',
    slack: 'help.slack.com',
    shopify: 'help.shopify.com',
    stripe: 'stripe.com/docs',
    github: 'docs.github.com',
  }
  
  const siteFilter = options.officialDocsOnly ? officialSites[toolName] : undefined
  
  let sourcesResearched = 0
  let citationsExtracted = 0
  const allCitations: ResearchCitation[] = []
  
  for (const query of queries) {
    if (sourcesResearched >= maxSources) break
    
    // Search
    const results = await performWebSearch(query, { maxResults: 3, siteFilter })
    
    for (const result of results) {
      if (sourcesResearched >= maxSources) break
      
      // Skip low-trust sources if only official docs requested
      const trust = getDomainTrust(result.url)
      if (options.officialDocsOnly && trust.score < 0.8) continue
      
      // Fetch content
      const content = await fetchAndExtractContent(result.url)
      if (!content || content.content.length < 200) continue
      
      // Store source
      const sourceId = await storeResearchSource(result.url, content.title, content.content)
      if (!sourceId) continue
      
      sourcesResearched++
      
      // Extract citations
      const citations = await extractKnowledgeCitations(
        toolName,
        result.url,
        content.content,
        content.headings
      )
      
      // Store citations
      const stored = await storeResearchCitations(userId, sourceId, citations)
      citationsExtracted += stored
      
      // Add to results
      for (const c of citations) {
        allCitations.push({ ...c, id: '' } as ResearchCitation)
      }
    }
  }
  
  // Return top citations by confidence
  const topCitations = allCitations
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10)
  
  return {
    sourcesResearched,
    citationsExtracted,
    topCitations,
  }
}

/**
 * Get cached research citations for a tool
 */
export async function getCachedResearch(
  userId: string,
  toolName: string
): Promise<ResearchCitation[]> {
  const supabase = createAdminClient()
  
  const { data } = await supabase
    .from('research_citations')
    .select('*')
    .eq('user_id', userId)
    .eq('tool_name', toolName)
    .gte('expires_at', new Date().toISOString())
    .order('confidence', { ascending: false })
    .limit(20)
  
  return (data as ResearchCitation[]) || []
}

/**
 * Format research citations for agent prompt
 */
export function formatResearchCitationsForPrompt(citations: ResearchCitation[]): string {
  if (citations.length === 0) return ''
  
  let output = '\n## Verified Research (with sources)\n\n'
  
  // Group by knowledge type
  const byType: Record<string, ResearchCitation[]> = {}
  for (const c of citations) {
    if (!byType[c.knowledge_type]) byType[c.knowledge_type] = []
    byType[c.knowledge_type].push(c)
  }
  
  const typeLabels: Record<string, string> = {
    ui_element: 'UI Elements',
    workflow: 'Workflows',
    error_solution: 'Error Solutions',
    best_practice: 'Best Practices',
    keyboard_shortcut: 'Keyboard Shortcuts',
    api_info: 'API Info',
  }
  
  for (const [type, items] of Object.entries(byType)) {
    output += `### ${typeLabels[type] || type}\n`
    for (const item of items.slice(0, 5)) {
      const verified = item.verified_by_usage ? '✓' : ''
      output += `${verified} ${item.content}\n`
      if (item.quote) {
        output += `  _"${item.quote.slice(0, 100)}..."_\n`
      }
      output += `  [Source](${item.source_url})\n`
    }
    output += '\n'
  }
  
  return output
}

/**
 * Mark a citation as verified by successful usage
 */
export async function verifyCitationByUsage(
  citationId: string,
  success: boolean
): Promise<void> {
  const supabase = createAdminClient()
  
  const { data } = await supabase
    .from('research_citations')
    .select('usage_count, success_count')
    .eq('id', citationId)
    .single()
  
  if (!data) return
  
  const typed = data as { usage_count: number; success_count: number }
  
  await supabase
    .from('research_citations')
    .update({
      usage_count: typed.usage_count + 1,
      success_count: success ? typed.success_count + 1 : typed.success_count,
      verified_by_usage: success,
      confidence: success 
        ? Math.min(1, typed.usage_count > 0 ? (typed.success_count + 1) / (typed.usage_count + 1) : 0.8)
        : typed.usage_count > 0 ? typed.success_count / (typed.usage_count + 1) : 0.5,
    } as never)
    .eq('id', citationId)
}
