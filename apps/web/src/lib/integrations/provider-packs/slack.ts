import type { ProviderPack } from '../types'

export const slackProviderPack: ProviderPack = {
  id: 'slack',
  name: 'Slack',
  description: 'Slack messaging integration',
  icon: 'message-square',
  oauth: {
    authorizationUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scopes: [
      'channels:history',
      'channels:read',
      'chat:write',
      'groups:history',
      'groups:read',
      'im:history',
      'im:read',
      'mpim:history',
      'mpim:read',
      'users:read',
      'reactions:write',
    ],
    clientIdEnvVar: 'SLACK_CLIENT_ID',
    clientSecretEnvVar: 'SLACK_CLIENT_SECRET',
    pkce: false,
  },
  baseUrl: 'https://slack.com/api',
  eventSources: [
    {
      type: 'webhook',
      path: '/api/integrations/slack/events',
      eventTypeField: 'event.type',
      threadIdField: 'event.channel',
      messageTextField: 'event.text',
      timestampField: 'event.ts',
    },
  ],
  toolNaming: {
    prefix: 'slack',
    operationIdTransform: 'snake_case',
  },
  rateLimits: {
    requestsPerMinute: 50,
  },
}
