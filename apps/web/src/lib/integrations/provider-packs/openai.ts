import type { ProviderPack } from '../types'

export const openaiProviderPack: ProviderPack = {
  id: 'openai',
  name: 'OpenAI',
  description: 'GPT models, embeddings, and AI capabilities',
  icon: 'brain',
  apiKeyAuth: {
    headerName: 'Authorization',
    headerPrefix: 'Bearer ',
  },
  credentialKeyField: 'api_key',
  verifyEndpoint: {
    path: '/models',
    method: 'GET',
  },
  baseUrl: 'https://api.openai.com/v1',
  rateLimits: {
    requestsPerMinute: 60,
  },
}
