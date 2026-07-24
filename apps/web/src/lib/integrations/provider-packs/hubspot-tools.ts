/**
 * HubSpot MCP Tools
 *
 * CRM operations: contacts, companies, deals, notes, tasks.
 * Uses HubSpot v3 REST API with OAuth access token.
 */

import type { McpTool, McpExecutionContext, McpToolResult } from '../types'

const HUBSPOT_API = 'https://api.hubapi.com'

async function hubspotGet(
  path: string,
  accessToken: string,
  params?: Record<string, string>
): Promise<McpToolResult> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const res = await fetch(`${HUBSPOT_API}${path}${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !data) {
    return { success: false, error: `HTTP ${res.status}`, statusCode: res.status, data }
  }
  return { success: true, data, statusCode: res.status }
}

async function hubspotPost(
  path: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<McpToolResult> {
  const res = await fetch(`${HUBSPOT_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
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

async function hubspotPatch(
  path: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<McpToolResult> {
  const res = await fetch(`${HUBSPOT_API}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
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

export const hubspotTools: McpTool[] = [
  {
    name: 'hubspot_search_contacts',
    description: 'Search HubSpot contacts by name, email, or other properties.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (name, email, company)' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
    execute: async (input, ctx) => {
      return hubspotPost('/crm/v3/objects/contacts/search', ctx.credentials.accessToken!, {
        filterGroups: [{
          filters: [{
            propertyName: 'email',
            operator: 'CONTAINS_TOKEN',
            value: String(input.query),
          }],
        }],
        properties: ['firstname', 'lastname', 'email', 'phone', 'company', 'lifecyclestage'],
        limit: Number(input.limit) || 10,
      })
    },
  },
  {
    name: 'hubspot_create_contact',
    description: 'Create a new contact in HubSpot CRM.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Contact email (required)' },
        firstname: { type: 'string', description: 'First name' },
        lastname: { type: 'string', description: 'Last name' },
        phone: { type: 'string', description: 'Phone number' },
        company: { type: 'string', description: 'Company name' },
      },
      required: ['email'],
    },
    execute: async (input, ctx) => {
      const properties: Record<string, string> = { email: String(input.email) }
      if (input.firstname) properties.firstname = String(input.firstname)
      if (input.lastname) properties.lastname = String(input.lastname)
      if (input.phone) properties.phone = String(input.phone)
      if (input.company) properties.company = String(input.company)

      return hubspotPost('/crm/v3/objects/contacts', ctx.credentials.accessToken!, { properties })
    },
  },
  {
    name: 'hubspot_update_contact',
    description: 'Update an existing HubSpot contact by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'HubSpot contact ID' },
        properties: { type: 'object', description: 'Properties to update (e.g. { "phone": "555-1234" })' },
      },
      required: ['contactId', 'properties'],
    },
    execute: async (input, ctx) => {
      return hubspotPatch(
        `/crm/v3/objects/contacts/${input.contactId}`,
        ctx.credentials.accessToken!,
        { properties: input.properties as Record<string, unknown> }
      )
    },
  },
  {
    name: 'hubspot_list_deals',
    description: 'List deals from HubSpot CRM with optional stage filter.',
    inputSchema: {
      type: 'object',
      properties: {
        stage: { type: 'string', description: 'Filter by deal stage (e.g. "appointmentscheduled", "qualifiedtobuy", "closedwon")' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
    execute: async (input, ctx) => {
      if (input.stage) {
        return hubspotPost('/crm/v3/objects/deals/search', ctx.credentials.accessToken!, {
          filterGroups: [{
            filters: [{
              propertyName: 'dealstage',
              operator: 'EQ',
              value: String(input.stage),
            }],
          }],
          properties: ['dealname', 'amount', 'dealstage', 'closedate', 'pipeline'],
          limit: Number(input.limit) || 20,
        })
      }
      return hubspotGet('/crm/v3/objects/deals', ctx.credentials.accessToken!, {
        limit: String(Number(input.limit) || 20),
        properties: 'dealname,amount,dealstage,closedate,pipeline',
      })
    },
  },
  {
    name: 'hubspot_create_deal',
    description: 'Create a new deal in HubSpot CRM.',
    inputSchema: {
      type: 'object',
      properties: {
        dealname: { type: 'string', description: 'Deal name' },
        amount: { type: 'string', description: 'Deal amount' },
        dealstage: { type: 'string', description: 'Deal stage ID' },
        pipeline: { type: 'string', description: 'Pipeline ID (default: "default")' },
        closedate: { type: 'string', description: 'Expected close date (YYYY-MM-DD)' },
      },
      required: ['dealname'],
    },
    execute: async (input, ctx) => {
      const properties: Record<string, string> = { dealname: String(input.dealname) }
      if (input.amount) properties.amount = String(input.amount)
      if (input.dealstage) properties.dealstage = String(input.dealstage)
      if (input.pipeline) properties.pipeline = String(input.pipeline)
      if (input.closedate) properties.closedate = String(input.closedate)

      return hubspotPost('/crm/v3/objects/deals', ctx.credentials.accessToken!, { properties })
    },
  },
  {
    name: 'hubspot_create_note',
    description: 'Create a note/engagement on a contact or deal.',
    inputSchema: {
      type: 'object',
      properties: {
        body: { type: 'string', description: 'Note content' },
        contactId: { type: 'string', description: 'Associated contact ID (optional)' },
        dealId: { type: 'string', description: 'Associated deal ID (optional)' },
      },
      required: ['body'],
    },
    execute: async (input, ctx) => {
      const associations: Array<Record<string, unknown>> = []
      if (input.contactId) {
        associations.push({
          to: { id: String(input.contactId) },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
        })
      }
      if (input.dealId) {
        associations.push({
          to: { id: String(input.dealId) },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }],
        })
      }

      return hubspotPost('/crm/v3/objects/notes', ctx.credentials.accessToken!, {
        properties: {
          hs_note_body: String(input.body),
          hs_timestamp: new Date().toISOString(),
        },
        associations,
      })
    },
  },
]
