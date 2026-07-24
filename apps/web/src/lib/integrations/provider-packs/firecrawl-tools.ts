import type { McpTool, McpToolResult } from '../types'

async function firecrawlApiCall(
  path: string,
  apiKey: string,
  body: Record<string, unknown>
): Promise<McpToolResult> {
  const res = await fetch(`https://api.firecrawl.dev/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!data) {
    return { success: false, error: 'Invalid response from Firecrawl', statusCode: res.status }
  }

  if (!res.ok) {
    return { success: false, error: String(data.error || JSON.stringify(data)), statusCode: res.status, data }
  }

  return { success: true, data, statusCode: res.status }
}

export const firecrawlScrape: McpTool = {
  name: 'firecrawl_scrape',
  description: 'Scrape a single URL and extract its content as clean markdown. Great for reading articles, documentation, or any web page.',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to scrape',
      },
      formats: {
        type: 'array',
        description: 'Output formats (default: ["markdown"]). Options: markdown, html, rawHtml, links, screenshot',
      },
    },
    required: ['url'],
  },
  execute: async (input, ctx) => {
    const apiKey = ctx.credentials.apiKey
    if (!apiKey) return { success: false, error: 'Firecrawl API key not configured' }

    return firecrawlApiCall('/scrape', apiKey, {
      url: String(input.url),
      formats: Array.isArray(input.formats) ? input.formats : ['markdown'],
    })
  },
}

export const firecrawlSearch: McpTool = {
  name: 'firecrawl_search',
  description: 'Search the web and return scraped content from top results. Combines search with scraping for rich data extraction.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query',
      },
      limit: {
        type: 'number',
        description: 'Number of results to return (default: 5, max: 10)',
      },
    },
    required: ['query'],
  },
  execute: async (input, ctx) => {
    const apiKey = ctx.credentials.apiKey
    if (!apiKey) return { success: false, error: 'Firecrawl API key not configured' }

    return firecrawlApiCall('/search', apiKey, {
      query: String(input.query),
      limit: Math.min(Number(input.limit) || 5, 10),
    })
  },
}

export const firecrawlTools: McpTool[] = [firecrawlScrape, firecrawlSearch]
