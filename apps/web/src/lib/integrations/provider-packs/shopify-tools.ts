/**
 * Shopify MCP Tools
 *
 * E-commerce operations: orders, products, customers, inventory.
 * Uses Shopify Admin REST API with OAuth access token.
 */

import type { McpTool, McpExecutionContext, McpToolResult } from '../types'

async function shopifyGet(
  shop: string,
  path: string,
  accessToken: string,
  params?: Record<string, string>
): Promise<McpToolResult> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const res = await fetch(`https://${shop}/admin/api/2024-01${path}${qs}`, {
    headers: { 'X-Shopify-Access-Token': accessToken },
  })
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !data) {
    return { success: false, error: `HTTP ${res.status}`, statusCode: res.status, data }
  }
  return { success: true, data, statusCode: res.status }
}

async function shopifyPost(
  shop: string,
  path: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<McpToolResult> {
  const res = await fetch(`https://${shop}/admin/api/2024-01${path}`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !data) {
    return { success: false, error: `HTTP ${res.status}`, statusCode: res.status, data }
  }
  return { success: true, data, statusCode: res.status }
}

function getShop(ctx: McpExecutionContext): string {
  // Shop domain stored in connection config or baseUrl
  return ctx.baseUrl.replace('https://', '').replace('/admin', '').replace(/\/$/, '')
}

export const shopifyTools: McpTool[] = [
  {
    name: 'shopify_list_orders',
    description: 'List recent Shopify orders with optional status filter.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter: open, closed, cancelled, any (default: open)' },
        limit: { type: 'number', description: 'Max results (default 20, max 250)' },
        since_id: { type: 'string', description: 'Show orders after this ID (for pagination)' },
      },
    },
    execute: async (input, ctx) => {
      const params: Record<string, string> = {
        status: String(input.status || 'open'),
        limit: String(Math.min(Number(input.limit) || 20, 250)),
      }
      if (input.since_id) params.since_id = String(input.since_id)
      return shopifyGet(getShop(ctx), '/orders.json', ctx.credentials.accessToken!, params)
    },
  },
  {
    name: 'shopify_get_order',
    description: 'Get details of a specific Shopify order by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Shopify order ID' },
      },
      required: ['orderId'],
    },
    execute: async (input, ctx) => {
      return shopifyGet(getShop(ctx), `/orders/${input.orderId}.json`, ctx.credentials.accessToken!)
    },
  },
  {
    name: 'shopify_list_products',
    description: 'List products from the Shopify store.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results (default 20)' },
        status: { type: 'string', description: 'Filter: active, archived, draft (default: active)' },
        title: { type: 'string', description: 'Filter by product title (partial match)' },
      },
    },
    execute: async (input, ctx) => {
      const params: Record<string, string> = {
        limit: String(Math.min(Number(input.limit) || 20, 250)),
        status: String(input.status || 'active'),
      }
      if (input.title) params.title = String(input.title)
      return shopifyGet(getShop(ctx), '/products.json', ctx.credentials.accessToken!, params)
    },
  },
  {
    name: 'shopify_get_inventory',
    description: 'Get inventory levels for a product variant or location.',
    inputSchema: {
      type: 'object',
      properties: {
        inventory_item_ids: { type: 'string', description: 'Comma-separated inventory item IDs' },
        location_ids: { type: 'string', description: 'Comma-separated location IDs (optional)' },
      },
      required: ['inventory_item_ids'],
    },
    execute: async (input, ctx) => {
      const params: Record<string, string> = {
        inventory_item_ids: String(input.inventory_item_ids),
      }
      if (input.location_ids) params.location_ids = String(input.location_ids)
      return shopifyGet(getShop(ctx), '/inventory_levels.json', ctx.credentials.accessToken!, params)
    },
  },
  {
    name: 'shopify_list_customers',
    description: 'List customers or search by email/name.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (email, name)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
    execute: async (input, ctx) => {
      const params: Record<string, string> = {
        limit: String(Math.min(Number(input.limit) || 20, 250)),
      }
      if (input.query) {
        // Shopify customer search uses a specific query format
        return shopifyGet(getShop(ctx), '/customers/search.json', ctx.credentials.accessToken!, {
          query: String(input.query),
          ...params,
        })
      }
      return shopifyGet(getShop(ctx), '/customers.json', ctx.credentials.accessToken!, params)
    },
  },
  {
    name: 'shopify_fulfill_order',
    description: 'Create a fulfillment for an order (mark items as shipped).',
    inputSchema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order ID to fulfill' },
        trackingNumber: { type: 'string', description: 'Shipping tracking number (optional)' },
        trackingCompany: { type: 'string', description: 'Shipping carrier (optional)' },
        notifyCustomer: { type: 'boolean', description: 'Send shipping notification email (default: true)' },
      },
      required: ['orderId'],
    },
    execute: async (input, ctx) => {
      const fulfillment: Record<string, unknown> = {
        notify_customer: input.notifyCustomer !== false,
      }
      if (input.trackingNumber) {
        fulfillment.tracking_info = {
          number: String(input.trackingNumber),
          company: input.trackingCompany ? String(input.trackingCompany) : undefined,
        }
      }
      return shopifyPost(
        getShop(ctx),
        `/orders/${input.orderId}/fulfillments.json`,
        ctx.credentials.accessToken!,
        { fulfillment }
      )
    },
  },
]
