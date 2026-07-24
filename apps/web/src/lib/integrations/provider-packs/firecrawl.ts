import type { ProviderPack } from '../types'

export const firecrawlProviderPack: ProviderPack = {
  id: 'firecrawl',
  name: 'Firecrawl',
  description: 'AI-powered web scraper, search and data extraction',
  icon: 'flame',
  apiKeyAuth: {
    headerName: 'Authorization',
    headerPrefix: 'Bearer ',
  },
  credentialKeyField: 'api_key',
  verifyEndpoint: {
    path: '/team/credit-usage',
    method: 'GET',
  },
  baseUrl: 'https://api.firecrawl.dev/v1',
  rateLimits: {
    requestsPerMinute: 20,
  },
}
