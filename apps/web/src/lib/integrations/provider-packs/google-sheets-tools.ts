/**
 * Hardcoded Google Sheets MCP Tools
 *
 * These tools allow agents to read and write Google Sheets via the Sheets API v4.
 * Uses the same Google OAuth credentials as Gmail (requires spreadsheets scope).
 */

import type { McpTool, McpExecutionContext, McpToolResult } from '../types'

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'

async function sheetsGet(
  path: string,
  accessToken: string,
  params?: Record<string, string>
): Promise<McpToolResult> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const res = await fetch(`${SHEETS_API}${path}${qs}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !data) {
    return {
      success: false,
      error: typeof data?.error === 'object'
        ? JSON.stringify((data.error as Record<string, unknown>).message || data.error)
        : `HTTP ${res.status}`,
      statusCode: res.status,
    }
  }

  return { success: true, data, statusCode: res.status }
}

async function sheetsPost(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
  method: 'POST' | 'PUT' = 'POST'
): Promise<McpToolResult> {
  const res = await fetch(`${SHEETS_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !data) {
    return {
      success: false,
      error: typeof data?.error === 'object'
        ? JSON.stringify((data.error as Record<string, unknown>).message || data.error)
        : `HTTP ${res.status}`,
      statusCode: res.status,
    }
  }

  return { success: true, data, statusCode: res.status }
}

export const sheetsReadRange: McpTool = {
  name: 'sheets_read_range',
  description: 'Read data from a Google Sheets spreadsheet range (e.g. "Sheet1!A1:D10").',
  inputSchema: {
    type: 'object',
    properties: {
      spreadsheet_id: { type: 'string', description: 'The spreadsheet ID (from the URL)' },
      range: { type: 'string', description: 'A1 notation range (e.g. "Sheet1!A1:D10" or "Sheet1")' },
    },
    required: ['spreadsheet_id', 'range'],
  },
  execute: async (
    input: Record<string, unknown>,
    context: McpExecutionContext
  ): Promise<McpToolResult> => {
    const accessToken = context.credentials.accessToken
    if (!accessToken) return { success: false, error: 'Missing access token' }

    const spreadsheetId = typeof input.spreadsheet_id === 'string' ? input.spreadsheet_id.trim() : ''
    const range = typeof input.range === 'string' ? input.range.trim() : ''
    if (!spreadsheetId || !range) return { success: false, error: 'spreadsheet_id and range are required' }

    return sheetsGet(`/${spreadsheetId}/values/${encodeURIComponent(range)}`, accessToken)
  },
}

export const sheetsWriteRange: McpTool = {
  name: 'sheets_write_range',
  description: 'Write data to a Google Sheets spreadsheet range. Provide values as a 2D array of rows.',
  inputSchema: {
    type: 'object',
    properties: {
      spreadsheet_id: { type: 'string', description: 'The spreadsheet ID' },
      range: { type: 'string', description: 'A1 notation range to write to (e.g. "Sheet1!A1")' },
      values: {
        type: 'array',
        items: { type: 'array', items: { type: 'string' } },
        description: 'Row data as 2D array, e.g. [["Name","Age"],["Alice","30"]]',
      },
    },
    required: ['spreadsheet_id', 'range', 'values'],
  },
  execute: async (
    input: Record<string, unknown>,
    context: McpExecutionContext
  ): Promise<McpToolResult> => {
    const accessToken = context.credentials.accessToken
    if (!accessToken) return { success: false, error: 'Missing access token' }

    const spreadsheetId = typeof input.spreadsheet_id === 'string' ? input.spreadsheet_id.trim() : ''
    const range = typeof input.range === 'string' ? input.range.trim() : ''
    const values = Array.isArray(input.values) ? input.values : []
    if (!spreadsheetId || !range || values.length === 0) {
      return { success: false, error: 'spreadsheet_id, range, and values are required' }
    }

    const qs = '?valueInputOption=USER_ENTERED'
    const res = await fetch(`${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}${qs}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
    })

    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!res.ok || !data) {
      return {
        success: false,
        error: typeof data?.error === 'object'
          ? JSON.stringify((data.error as Record<string, unknown>).message || data.error)
          : `HTTP ${res.status}`,
        statusCode: res.status,
      }
    }

    return { success: true, data, statusCode: res.status }
  },
}

export const sheetsAppendRows: McpTool = {
  name: 'sheets_append_rows',
  description: 'Append rows to the end of a Google Sheets table.',
  inputSchema: {
    type: 'object',
    properties: {
      spreadsheet_id: { type: 'string', description: 'The spreadsheet ID' },
      range: { type: 'string', description: 'Sheet name or range to append to (e.g. "Sheet1")' },
      values: {
        type: 'array',
        items: { type: 'array', items: { type: 'string' } },
        description: 'Rows to append as 2D array',
      },
    },
    required: ['spreadsheet_id', 'range', 'values'],
  },
  execute: async (
    input: Record<string, unknown>,
    context: McpExecutionContext
  ): Promise<McpToolResult> => {
    const accessToken = context.credentials.accessToken
    if (!accessToken) return { success: false, error: 'Missing access token' }

    const spreadsheetId = typeof input.spreadsheet_id === 'string' ? input.spreadsheet_id.trim() : ''
    const range = typeof input.range === 'string' ? input.range.trim() : ''
    const values = Array.isArray(input.values) ? input.values : []
    if (!spreadsheetId || !range || values.length === 0) {
      return { success: false, error: 'spreadsheet_id, range, and values are required' }
    }

    const qs = '?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS'
    return sheetsPost(
      `/${spreadsheetId}/values/${encodeURIComponent(range)}:append${qs}`,
      accessToken,
      { range, majorDimension: 'ROWS', values }
    )
  },
}

export const sheetsGetSpreadsheet: McpTool = {
  name: 'sheets_get_spreadsheet',
  description: 'Get metadata about a Google Sheets spreadsheet (title, sheet names, etc.).',
  inputSchema: {
    type: 'object',
    properties: {
      spreadsheet_id: { type: 'string', description: 'The spreadsheet ID' },
    },
    required: ['spreadsheet_id'],
  },
  execute: async (
    input: Record<string, unknown>,
    context: McpExecutionContext
  ): Promise<McpToolResult> => {
    const accessToken = context.credentials.accessToken
    if (!accessToken) return { success: false, error: 'Missing access token' }

    const spreadsheetId = typeof input.spreadsheet_id === 'string' ? input.spreadsheet_id.trim() : ''
    if (!spreadsheetId) return { success: false, error: 'spreadsheet_id is required' }

    const result = await sheetsGet(`/${spreadsheetId}`, accessToken, {
      fields: 'spreadsheetId,properties.title,sheets.properties',
    })
    if (!result.success) return result

    const data = result.data as {
      spreadsheetId: string
      properties?: { title?: string }
      sheets?: Array<{ properties?: { title?: string; index?: number; sheetId?: number } }>
    }

    return {
      success: true,
      data: {
        spreadsheetId: data.spreadsheetId,
        title: data.properties?.title || '',
        sheets: (data.sheets || []).map(s => ({
          title: s.properties?.title || '',
          index: s.properties?.index ?? 0,
          sheetId: s.properties?.sheetId ?? 0,
        })),
      },
    }
  },
}

export const googleSheetsTools: McpTool[] = [
  sheetsReadRange,
  sheetsWriteRange,
  sheetsAppendRows,
  sheetsGetSpreadsheet,
]
