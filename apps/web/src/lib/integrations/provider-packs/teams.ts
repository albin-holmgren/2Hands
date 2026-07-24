import type { ProviderPack } from '../types'

export const teamsProviderPack: ProviderPack = {
  id: 'teams',
  name: 'Microsoft Teams',
  description: 'Microsoft Teams messaging integration',
  icon: 'message-square',
  oauth: {
    authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: [
      'https://graph.microsoft.com/Chat.Read',
      'https://graph.microsoft.com/Chat.ReadWrite',
      'https://graph.microsoft.com/ChannelMessage.Read.All',
      'https://graph.microsoft.com/ChannelMessage.Send',
      'https://graph.microsoft.com/Team.ReadBasic.All',
      'https://graph.microsoft.com/Channel.ReadBasic.All',
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
      intervalMs: 30000,
      endpoint: '/me/chats?$expand=lastMessagePreview',
      paginationStrategy: 'cursor',
      eventTypeField: 'chatType',
      threadIdField: 'id',
      messageTextField: 'lastMessagePreview.body.content',
      timestampField: 'lastMessagePreview.createdDateTime',
    },
  ],
  toolNaming: {
    prefix: 'teams',
    operationIdTransform: 'snake_case',
    includeOperationIds: [
      'me.chats.ListChats',
      'chats.chat.ListMessages',
      'chats.chat.SendMessage',
      'teams.team.channels.ListChannels',
      'teams.team.channels.channel.messages.ListMessages',
      'teams.team.channels.channel.messages.CreateMessage',
    ],
  },
  rateLimits: {
    requestsPerMinute: 60,
  },
}
