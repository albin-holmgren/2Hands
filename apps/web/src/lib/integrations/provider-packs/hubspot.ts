import type { ProviderPack } from '../types'

export const hubspotProviderPack: ProviderPack = {
  id: 'hubspot',
  name: 'HubSpot',
  description: 'HubSpot CRM — contacts, companies, deals, notes',
  icon: 'building-2',
  oauth: {
    authorizationUrl: 'https://app.hubspot.com/oauth/authorize',
    tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
    scopes: [
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.objects.deals.read',
      'crm.objects.deals.write',
      'crm.objects.companies.read',
      'crm.objects.companies.write',
    ],
    clientIdEnvVar: 'HUBSPOT_CLIENT_ID',
    clientSecretEnvVar: 'HUBSPOT_CLIENT_SECRET',
  },
  baseUrl: 'https://api.hubapi.com',
  toolNaming: {
    prefix: 'hubspot',
    operationIdTransform: 'snake_case',
  },
  rateLimits: {
    requestsPerMinute: 100,
    requestsPerDay: 250000,
  },
}
