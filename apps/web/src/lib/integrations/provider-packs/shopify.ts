import type { ProviderPack } from '../types'

export const shopifyProviderPack: ProviderPack = {
  id: 'shopify',
  name: 'Shopify',
  description: 'Shopify e-commerce — orders, products, customers, inventory',
  icon: 'shopping-bag',
  oauth: {
    authorizationUrl: 'https://{shop}.myshopify.com/admin/oauth/authorize',
    tokenUrl: 'https://{shop}.myshopify.com/admin/oauth/access_token',
    scopes: [
      'read_orders',
      'write_orders',
      'read_products',
      'write_products',
      'read_customers',
      'read_inventory',
      'write_inventory',
      'read_fulfillments',
      'write_fulfillments',
    ],
    clientIdEnvVar: 'SHOPIFY_CLIENT_ID',
    clientSecretEnvVar: 'SHOPIFY_CLIENT_SECRET',
  },
  baseUrl: 'https://{shop}.myshopify.com',
  toolNaming: {
    prefix: 'shopify',
    operationIdTransform: 'snake_case',
  },
  rateLimits: {
    requestsPerMinute: 40, // Shopify REST API: 2 requests/sec burst
  },
}
