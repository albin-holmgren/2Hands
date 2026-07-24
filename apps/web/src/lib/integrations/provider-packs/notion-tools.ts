/**
 * Notion MCP Tools
 *
 * Workspace operations: databases, pages, blocks, search.
 * Uses Notion API v1 with OAuth access token.
 */

import type { McpTool, McpExecutionContext, McpToolResult } from '../types'

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

async function notionGet(
  path: string,
  accessToken: string
): Promise<McpToolResult> {
  const res = await fetch(`${NOTION_API}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Notion-Version': NOTION_VERSION,
    },
  })
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !data) {
    return { success: false, error: `HTTP ${res.status}`, statusCode: res.status, data }
  }
  return { success: true, data, statusCode: res.status }
}

async function notionPost(
  path: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<McpToolResult> {
  const res = await fetch(`${NOTION_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !data) {
    return { success: false, error: `HTTP ${res.status}`, statusCode: res.status, data }
  }
  return { success: true, data, statusCode: res.status }
}

async function notionPatch(
  path: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<McpToolResult> {
  const res = await fetch(`${NOTION_API}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !data) {
    return { success: false, error: `HTTP ${res.status}`, statusCode: res.status, data }
  }
  return { success: true, data, statusCode: res.status }
}

export const notionTools: McpTool[] = [
  {
    name: 'notion_search',
    description: 'Search Notion workspace for pages and databases by title.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        filter: { type: 'string', description: 'Filter type: "page" or "database" (optional)' },
      },
      required: ['query'],
    },
    execute: async (input, ctx) => {
      const body: Record<string, unknown> = {
        query: String(input.query),
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: 10,
      }
      if (input.filter === 'page' || input.filter === 'database') {
        body.filter = { value: input.filter, property: 'object' }
      }
      return notionPost('/search', ctx.credentials.accessToken!, body)
    },
  },
  {
    name: 'notion_get_page',
    description: 'Get a Notion page by ID, including its properties.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Notion page ID' },
      },
      required: ['pageId'],
    },
    execute: async (input, ctx) => {
      return notionGet(`/pages/${input.pageId}`, ctx.credentials.accessToken!)
    },
  },
  {
    name: 'notion_get_page_content',
    description: 'Get the block content (body) of a Notion page.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Notion page ID' },
      },
      required: ['pageId'],
    },
    execute: async (input, ctx) => {
      return notionGet(`/blocks/${input.pageId}/children?page_size=100`, ctx.credentials.accessToken!)
    },
  },
  {
    name: 'notion_query_database',
    description: 'Query a Notion database with optional filters and sorts.',
    inputSchema: {
      type: 'object',
      properties: {
        databaseId: { type: 'string', description: 'Database ID' },
        filter: { type: 'object', description: 'Notion filter object (optional)' },
        sorts: { type: 'array', description: 'Sort array (optional)' },
        pageSize: { type: 'number', description: 'Results per page (default 20, max 100)' },
      },
      required: ['databaseId'],
    },
    execute: async (input, ctx) => {
      const body: Record<string, unknown> = {
        page_size: Math.min(Number(input.pageSize) || 20, 100),
      }
      if (input.filter) body.filter = input.filter
      if (input.sorts) body.sorts = input.sorts
      return notionPost(`/databases/${input.databaseId}/query`, ctx.credentials.accessToken!, body)
    },
  },
  {
    name: 'notion_create_page',
    description: 'Create a new page in a Notion database or as a child of another page.',
    inputSchema: {
      type: 'object',
      properties: {
        parentDatabaseId: { type: 'string', description: 'Parent database ID (use this OR parentPageId)' },
        parentPageId: { type: 'string', description: 'Parent page ID (use this OR parentDatabaseId)' },
        title: { type: 'string', description: 'Page title' },
        properties: { type: 'object', description: 'Database properties (if parent is a database)' },
        content: { type: 'string', description: 'Page body text (added as paragraph blocks)' },
      },
      required: ['title'],
    },
    execute: async (input, ctx) => {
      const parent = input.parentDatabaseId
        ? { database_id: String(input.parentDatabaseId) }
        : input.parentPageId
          ? { page_id: String(input.parentPageId) }
          : null

      if (!parent) {
        return { success: false, error: 'Either parentDatabaseId or parentPageId is required' }
      }

      const properties = (input.properties as Record<string, unknown>) || {}
      // If parent is a database, ensure title property is set
      if (input.parentDatabaseId && input.title) {
        properties.Name = properties.Name || { title: [{ text: { content: String(input.title) } }] }
      }

      const body: Record<string, unknown> = {
        parent,
        properties: Object.keys(properties).length > 0 ? properties : {
          title: { title: [{ text: { content: String(input.title) } }] },
        },
      }

      // Add content as paragraph blocks
      if (input.content) {
        const paragraphs = String(input.content).split('\n\n')
        body.children = paragraphs.map(p => ({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: p } }],
          },
        }))
      }

      return notionPost('/pages', ctx.credentials.accessToken!, body)
    },
  },
  {
    name: 'notion_update_page',
    description: 'Update properties of an existing Notion page.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Page ID to update' },
        properties: { type: 'object', description: 'Properties to update' },
        archived: { type: 'boolean', description: 'Set to true to archive the page' },
      },
      required: ['pageId'],
    },
    execute: async (input, ctx) => {
      const body: Record<string, unknown> = {}
      if (input.properties) body.properties = input.properties
      if (typeof input.archived === 'boolean') body.archived = input.archived
      return notionPatch(`/pages/${input.pageId}`, ctx.credentials.accessToken!, body)
    },
  },
  {
    name: 'notion_append_blocks',
    description: 'Append content blocks to a Notion page.',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string', description: 'Page ID to append to' },
        content: { type: 'string', description: 'Text content to append (paragraphs separated by double newlines)' },
      },
      required: ['pageId', 'content'],
    },
    execute: async (input, ctx) => {
      const paragraphs = String(input.content).split('\n\n')
      const children = paragraphs.map(p => ({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: p } }],
        },
      }))

      return notionPatch(`/blocks/${input.pageId}/children`, ctx.credentials.accessToken!, { children })
    },
  },
]
