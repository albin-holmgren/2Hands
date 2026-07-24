import type { ProviderPack } from '../types'

export const gmailProviderPack: ProviderPack = {
  id: 'gmail',
  name: 'Gmail',
  description: 'Google Gmail email integration',
  icon: 'mail',
  oauth: {
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
    clientIdEnvVar: 'GOOGLE_CLIENT_ID',
    clientSecretEnvVar: 'GOOGLE_CLIENT_SECRET',
    pkce: true,
    extraAuthParams: {
      access_type: 'offline',
      prompt: 'consent',
    },
  },
  baseUrl: 'https://gmail.googleapis.com',
  openApiSpecUrl: 'https://gmail.googleapis.com/$discovery/rest?version=v1',
  eventSources: [
    {
      type: 'polling',
      intervalMs: 60000,
      endpoint: '/gmail/v1/users/me/messages?q=is:unread',
      paginationStrategy: 'cursor',
      eventTypeField: 'labelIds',
      threadIdField: 'threadId',
      messageTextField: 'snippet',
      timestampField: 'internalDate',
    },
  ],
  toolNaming: {
    prefix: 'gmail',
    operationIdTransform: 'snake_case',
    includeOperationIds: [
      'gmail.users.messages.list',
      'gmail.users.messages.get',
      'gmail.users.messages.send',
      'gmail.users.messages.modify',
      'gmail.users.messages.trash',
      'gmail.users.drafts.create',
      'gmail.users.drafts.send',
      'gmail.users.labels.list',
    ],
  },
  rateLimits: {
    requestsPerMinute: 250,
    requestsPerDay: 1000000,
  },
}
