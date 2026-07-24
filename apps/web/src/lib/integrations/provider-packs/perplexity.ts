import type { ProviderPack } from '../types'

export const perplexityProviderPack: ProviderPack = {
  id: 'perplexity',
  name: 'Perplexity',
  description: 'AI-powered search and answer engine',
  icon: 'search',
  apiKeyAuth: {
    headerName: 'Authorization',
    headerPrefix: 'Bearer ',
  },
  credentialKeyField: 'api_key',
  baseUrl: 'https://api.perplexity.ai',
  rateLimits: {
    requestsPerMinute: 20,
  },
}
