import type { ProviderPack } from '../types'

export const attioProviderPack: ProviderPack = {
  id: 'attio',
  name: 'Attio',
  description: 'Attio CRM — people, companies, deals, pipelines, lists, and notes',
  icon: 'building-2',
  apiKeyAuth: {
    headerName: 'Authorization',
    headerPrefix: 'Bearer ',
  },
  credentialKeyField: 'api_key',
  verifyEndpoint: {
    path: '/self',
    method: 'GET',
    workspacePath: 'data.name',
  },
  baseUrl: 'https://api.attio.com/v2',
  toolNaming: {
    prefix: 'attio',
    operationIdTransform: 'snake_case',
  },
  rateLimits: {
    requestsPerMinute: 60,
    requestsPerDay: 10000,
  },
}
