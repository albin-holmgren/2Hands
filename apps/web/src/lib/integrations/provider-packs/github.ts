import type { ProviderPack } from '../types'

export const githubProviderPack: ProviderPack = {
  id: 'github',
  name: 'GitHub',
  description: 'Repos, issues, and pull requests',
  icon: 'github',
  apiKeyAuth: {
    headerName: 'Authorization',
    headerPrefix: 'Bearer ',
  },
  credentialKeyField: 'personal_access_token',
  verifyEndpoint: {
    path: '/user',
    method: 'GET',
  },
  baseUrl: 'https://api.github.com',
  toolNaming: {
    prefix: 'github',
    operationIdTransform: 'snake_case',
  },
  rateLimits: {
    requestsPerMinute: 30,
  },
}
