import type { ProviderPack } from '../types'

export const notionProviderPack: ProviderPack = {
  id: 'notion',
  name: 'Notion',
  description: 'Notion workspace — pages, databases, blocks, search',
  icon: 'book-open',
  oauth: {
    authorizationUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    scopes: [],
    clientIdEnvVar: 'NOTION_CLIENT_ID',
    clientSecretEnvVar: 'NOTION_CLIENT_SECRET',
  },
  baseUrl: 'https://api.notion.com',
  toolNaming: {
    prefix: 'notion',
    operationIdTransform: 'snake_case',
  },
  rateLimits: {
    requestsPerMinute: 180, // Notion: 3 requests/sec
  },
}
