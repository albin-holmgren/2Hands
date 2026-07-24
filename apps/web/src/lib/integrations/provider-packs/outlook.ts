import type { ProviderPack } from '../types'

export const outlookProviderPack: ProviderPack = {
  id: 'outlook',
  name: 'Outlook',
  description: 'Microsoft Outlook email integration',
  icon: 'mail',
  oauth: {
    authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: [
      'https://graph.microsoft.com/Mail.Read',
      'https://graph.microsoft.com/Mail.Send',
      'https://graph.microsoft.com/Mail.ReadWrite',
      'offline_access',
    ],
    clientIdEnvVar: 'MICROSOFT_CLIENT_ID',
    clientSecretEnvVar: 'MICROSOFT_CLIENT_SECRET',
    pkce: true,
  },
  baseUrl: 'https://graph.microsoft.com/v1.0',
  openApiSpecUrl: 'https://raw.githubusercontent.com/microsoftgraph/msgraph-metadata/master/openapi/v1.0/openapi.yaml',
  eventSources: [
    {
      type: 'polling',
      intervalMs: 60000,
      endpoint: '/me/mailFolders/inbox/messages?$filter=isRead eq false&$orderby=receivedDateTime desc&$top=20',
      paginationStrategy: 'cursor',
      eventTypeField: '@odata.type',
      threadIdField: 'conversationId',
      messageTextField: 'bodyPreview',
      timestampField: 'receivedDateTime',
    },
  ],
  toolNaming: {
    prefix: 'outlook',
    operationIdTransform: 'snake_case',
    includeOperationIds: [
      'me.messages.ListMessages',
      'me.messages.GetMessage',
      'me.sendMail',
      'me.messages.CreateReply',
      'me.messages.Send',
      'me.mailFolders.ListMailFolders',
    ],
  },
  rateLimits: {
    requestsPerMinute: 120,
  },
}
