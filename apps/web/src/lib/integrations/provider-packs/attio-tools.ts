/**
 * Attio MCP Tools
 *
 * CRM operations: people, companies, lists, list entries, notes, deals/pipeline.
 * Uses Attio v2 REST API with API key (Bearer token).
 */

import type { McpTool, McpExecutionContext, McpToolResult } from '../types'

const ATTIO_API = 'https://api.attio.com/v2'

function attioErrorMessage(status: number, body: Record<string, unknown> | null): string {
  if (body) {
    const msg = body.message || body.error || body.detail
    if (typeof msg === 'string' && msg.length > 0) return `HTTP ${status}: ${msg}`
    const errors = body.errors
    if (Array.isArray(errors) && errors.length > 0) {
      const parts = errors.map((e: Record<string, unknown>) => {
        const detail = e.message || e.detail || e.code
        const field = e.path || e.field || e.attribute
        return field ? `${field}: ${detail}` : String(detail || JSON.stringify(e))
      })
      return `HTTP ${status}: ${parts.join('; ')}`
    }
    // Surface validation_errors array if present (Attio v2 pattern)
    const valErrors = body.validation_errors
    if (Array.isArray(valErrors) && valErrors.length > 0) {
      const parts = valErrors.map((e: Record<string, unknown>) => {
        const detail = e.message || e.detail || e.code
        return String(detail || JSON.stringify(e))
      })
      return `HTTP ${status}: ${parts.join('; ')}`
    }
  }
  return `HTTP ${status}`
}

async function attioGet(
  path: string,
  apiKey: string,
  params?: Record<string, string>
): Promise<McpToolResult> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  const res = await fetch(`${ATTIO_API}${path}${qs}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !data) {
    return { success: false, error: attioErrorMessage(res.status, data), statusCode: res.status, data: data ?? undefined }
  }
  return { success: true, data, statusCode: res.status }
}

async function attioPost(
  path: string,
  apiKey: string,
  body: Record<string, unknown>
): Promise<McpToolResult> {
  const res = await fetch(`${ATTIO_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !data) {
    return { success: false, error: attioErrorMessage(res.status, data), statusCode: res.status, data: data ?? undefined }
  }
  return { success: true, data, statusCode: res.status }
}

async function attioPut(
  path: string,
  apiKey: string,
  body: Record<string, unknown>
): Promise<McpToolResult> {
  const res = await fetch(`${ATTIO_API}${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !data) {
    return { success: false, error: attioErrorMessage(res.status, data), statusCode: res.status, data: data ?? undefined }
  }
  return { success: true, data, statusCode: res.status }
}

async function attioPatch(
  path: string,
  apiKey: string,
  body: Record<string, unknown>
): Promise<McpToolResult> {
  const res = await fetch(`${ATTIO_API}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !data) {
    return { success: false, error: attioErrorMessage(res.status, data), statusCode: res.status, data: data ?? undefined }
  }
  return { success: true, data, statusCode: res.status }
}

function getApiKey(ctx: McpExecutionContext): string | null {
  return ctx.credentials.apiKey || null
}

function validateRecordResponse(result: McpToolResult, label: string): McpToolResult {
  if (!result.success) return result
  const body = result.data as { data?: { id?: { record_id?: string } } } | null
  const recordId = body?.data?.id?.record_id
  if (!recordId) {
    console.warn(`[Attio] ${label} create: success=true but no record_id in response. Shape: ${JSON.stringify(result.data)?.slice(0, 300)}`)
    return {
      success: false,
      error: `${label} was not confirmed created — no record_id returned by Attio. The workspace may have write restrictions or the request payload was rejected silently.`,
      statusCode: result.statusCode,
      data: result.data,
    }
  }
  // Hoist record_id to top level so detectVerifiedWrite and model reporting are unambiguous
  return {
    ...result,
    data: {
      ...(result.data as object),
      _confirmed_record_id: recordId,
    },
  }
}

/**
 * After a deal write (create or update), extract the confirmed stage title from the
 * API response and return a structured verification summary.
 */
function verifyDealWrite(
  result: McpToolResult,
  requestedStage: string | undefined,
  operation: 'created' | 'updated'
): McpToolResult {
  if (!result.success) return result

  const body = result.data as {
    data?: {
      id?: { record_id?: string }
      values?: { stage?: Array<{ status?: { title?: string } }>; name?: Array<{ value?: string }> }
    }
  } | null

  const recordId = body?.data?.id?.record_id
  if (!recordId) {
    return {
      success: false,
      error: `Deal was not confirmed ${operation} — no record_id returned by Attio. The workspace may have write restrictions or the request payload was rejected silently.`,
      statusCode: result.statusCode,
      data: result.data,
    }
  }

  const confirmedStage = body?.data?.values?.stage?.[0]?.status?.title ?? null
  const confirmedName = body?.data?.values?.name?.[0]?.value ?? null

  if (requestedStage && confirmedStage && confirmedStage.toLowerCase() !== requestedStage.toLowerCase()) {
    // Deal WAS created — returning success:false here would cause duplicate creation on retry.
    // Return success:true with stage_mismatch flag so the model uses update_deal to fix the stage.
    console.warn(`[Attio] Deal ${operation} record_id=${recordId} but stage mismatch: requested="${requestedStage}" confirmed="${confirmedStage}"`)
    return {
      success: true,
      data: {
        ...(result.data as object),
        _verification: {
          operation,
          record_id: recordId,
          confirmed_name: confirmedName,
          confirmed_stage: confirmedStage,
          stage_mismatch: true,
          stage_mismatch_action: `Deal was ${operation} (record_id: ${recordId}). Stage was set to "${confirmedStage}" instead of "${requestedStage}". Call integration_attio_update_deal with record_id "${recordId}" and the correct stage from attio_get_deal_stages — do NOT create another deal.`,
        },
      },
      statusCode: result.statusCode,
    }
  }

  return {
    success: true,
    data: {
      ...(result.data as object),
      _verification: {
        operation,
        record_id: recordId,
        confirmed_name: confirmedName,
        confirmed_stage: confirmedStage,
        stage_verified: requestedStage ? confirmedStage !== null : null,
      },
    },
    statusCode: result.statusCode,
  }
}

function validateEntryResponse(result: McpToolResult, label: string): McpToolResult {
  if (!result.success) return result
  const body = result.data as { data?: { id?: { entry_id?: string } } } | null
  const entryId = body?.data?.id?.entry_id
  if (!entryId) {
    console.warn(`[Attio] ${label} add: success=true but no entry_id in response. Shape: ${JSON.stringify(result.data)?.slice(0, 300)}`)
    return {
      success: false,
      error: `${label} was not confirmed added — no entry_id returned by Attio. Check that the list_id is correct, the record exists, and the API key has write access.`,
      statusCode: result.statusCode,
      data: result.data,
    }
  }
  // Hoist entry_id to top level for model clarity
  return {
    ...result,
    data: {
      ...(result.data as object),
      _confirmed_entry_id: entryId,
    },
  }
}

export const attioTools: McpTool[] = [
  {
    name: 'attio_search_people',
    description: 'Search Attio CRM for people/contacts by name, email, or company.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name, email, or company to search for' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
    execute: async (input, ctx) => {
      const apiKey = getApiKey(ctx)
      if (!apiKey) return { success: false, error: 'Attio API key not configured' }

      const q = String(input.query)
      return attioPost('/objects/people/records/query', apiKey, {
        filter: {
          $or: [
            { name: { '$contains': q } },
            { email_addresses: { '$contains': q } },
          ],
        },
        limit: Number(input.limit) || 10,
      })
    },
  },
  {
    name: 'attio_create_person',
    description: 'Create a new person/contact record in Attio CRM.',
    inputSchema: {
      type: 'object',
      properties: {
        first_name: { type: 'string', description: 'First name' },
        last_name: { type: 'string', description: 'Last name' },
        email: { type: 'string', description: 'Email address' },
        phone: { type: 'string', description: 'Phone number (optional)' },
        company_name: { type: 'string', description: 'Company name (optional)' },
      },
    },
    execute: async (input, ctx) => {
      const apiKey = getApiKey(ctx)
      if (!apiKey) return { success: false, error: 'Attio API key not configured' }

      const values: Record<string, unknown> = {}
      if (input.first_name || input.last_name) {
        values.name = [{
          first_name: input.first_name ? String(input.first_name) : undefined,
          last_name: input.last_name ? String(input.last_name) : undefined,
        }]
      }
      if (input.email) {
        values.email_addresses = [String(input.email)]
      }
      if (input.phone) {
        values.phone_numbers = [{ original_phone_number: String(input.phone) }]
      }

      return validateRecordResponse(
        await attioPost('/objects/people/records', apiKey, { data: { values } }),
        'Person'
      )
    },
  },
  {
    name: 'attio_search_companies',
    description: 'Search Attio CRM for companies by name or domain.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Company name or domain to search for' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
    execute: async (input, ctx) => {
      const apiKey = getApiKey(ctx)
      if (!apiKey) return { success: false, error: 'Attio API key not configured' }

      const q = String(input.query)
      return attioPost('/objects/companies/records/query', apiKey, {
        filter: {
          $or: [
            { name: { '$contains': q } },
            { domains: { '$contains': q } },
          ],
        },
        limit: Number(input.limit) || 10,
      })
    },
  },
  {
    name: 'attio_create_company',
    description: 'Create a new company record in Attio CRM.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Company name (required)' },
        domain: { type: 'string', description: 'Company website domain (e.g. acme.com)' },
        description: { type: 'string', description: 'Short description of the company (optional)' },
      },
      required: ['name'],
    },
    execute: async (input, ctx) => {
      const apiKey = getApiKey(ctx)
      if (!apiKey) return { success: false, error: 'Attio API key not configured' }

      const values: Record<string, unknown> = {
        name: String(input.name),
      }
      if (input.domain) {
        values.domains = [String(input.domain)]
      }
      if (input.description) {
        values.description = String(input.description)
      }

      return validateRecordResponse(
        await attioPost('/objects/companies/records', apiKey, { data: { values } }),
        'Company'
      )
    },
  },
  {
    name: 'attio_create_note',
    description: 'Add a note to a person or company record in Attio CRM.',
    inputSchema: {
      type: 'object',
      properties: {
        parent_object: { type: 'string', description: 'Object type: "people" or "companies"' },
        parent_record_id: { type: 'string', description: 'The Attio record ID to attach the note to' },
        title: { type: 'string', description: 'Note title' },
        content: { type: 'string', description: 'Note content/body' },
      },
      required: ['parent_object', 'parent_record_id', 'title', 'content'],
    },
    execute: async (input, ctx) => {
      const apiKey = getApiKey(ctx)
      if (!apiKey) return { success: false, error: 'Attio API key not configured' }

      return attioPost('/notes', apiKey, {
        data: {
          parent_object: String(input.parent_object),
          parent_record_id: String(input.parent_record_id),
          title: String(input.title),
          content: String(input.content),
          format: 'plaintext',
        },
      })
    },
  },
  {
    name: 'attio_list_lists',
    description: 'List all CRM lists in Attio (e.g. pipeline stages, lead lists).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute: async (input, ctx) => {
      const apiKey = getApiKey(ctx)
      if (!apiKey) return { success: false, error: 'Attio API key not configured' }

      return attioGet('/lists', apiKey)
    },
  },
  {
    name: 'attio_add_to_list',
    description: 'Add a person or company record to an Attio list.',
    inputSchema: {
      type: 'object',
      properties: {
        list_id: { type: 'string', description: 'The Attio list ID' },
        record_id: { type: 'string', description: 'The Attio record ID (person or company)' },
        parent_object: { type: 'string', description: 'Object type: "people" or "companies"' },
      },
      required: ['list_id', 'record_id', 'parent_object'],
    },
    execute: async (input, ctx) => {
      const apiKey = getApiKey(ctx)
      if (!apiKey) return { success: false, error: 'Attio API key not configured' }

      return validateEntryResponse(
        await attioPost(`/lists/${String(input.list_id)}/entries`, apiKey, {
          data: {
            parent_object: String(input.parent_object),
            parent_record_id: String(input.record_id),
          },
        }),
        'Record'
      )
    },
  },
  {
    name: 'attio_verify',
    description: 'Verify Attio connection by fetching workspace info.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute: async (input, ctx) => {
      const apiKey = getApiKey(ctx)
      if (!apiKey) return { success: false, error: 'Attio API key not configured' }

      return attioGet('/self', apiKey)
    },
  },
  {
    name: 'attio_search_deals',
    description: 'Search Attio CRM for deal records by name or associated company/person.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Deal name or keyword to search for' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
    },
    execute: async (input, ctx) => {
      const apiKey = getApiKey(ctx)
      if (!apiKey) return { success: false, error: 'Attio API key not configured' }

      const q = String(input.query)
      return attioPost('/objects/deals/records/query', apiKey, {
        filter: {
          name: { '$contains': q },
        },
        limit: Number(input.limit) || 10,
      })
    },
  },
  {
    name: 'attio_create_deal',
    description: 'Create a new deal in Attio CRM with an optional pipeline stage. The `stage` field sets the deal stage directly on the deal record (e.g. "Lead", "In Progress", "Won 🎉", "Lost") — this is the correct, primary way to place a deal in a pipeline. Do NOT use attio_add_to_pipeline as the default path for deals; use this `stage` field instead. Returns a verified record_id and confirmed stage name. IMPORTANT: Use exact stage titles from attio_inspect_workspace or attio_get_deal_stages — never guess. If the deal requires an owner, get the workspace_member_id from attio_inspect_workspace and pass it as owner_actor_id.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Deal name (required)' },
        stage: { type: 'string', description: 'Pipeline stage to assign immediately, e.g. "Lead", "In Progress", "Won 🎉", "Lost". Use exact stage title from attio_inspect_workspace or attio_get_deal_stages. Never guess.' },
        value: { type: 'number', description: 'Deal monetary value (optional)' },
        currency: { type: 'string', description: 'Currency code for value, e.g. USD, EUR (optional, defaults to USD)' },
        associated_company_id: { type: 'string', description: 'Attio company record_id to link to this deal. Use plural object slug "companies". Get the record_id from attio_create_company or attio_search_companies.' },
        associated_person_id: { type: 'string', description: 'Attio person record_id to link to this deal. Get the record_id from attio_create_person or attio_search_people.' },
        owner_actor_id: { type: 'string', description: 'Workspace member actor ID to set as deal owner (optional but recommended). Get this from attio_inspect_workspace result field workspace_members[0].actor_id.' },
      },
      required: ['name'],
    },
    execute: async (input, ctx) => {
      const apiKey = getApiKey(ctx)
      if (!apiKey) return { success: false, error: 'Attio API key not configured' }

      const values: Record<string, unknown> = {
        name: [{ value: String(input.name) }],
      }
      if (input.stage) {
        // Attio accepts stage as a plain string title in write requests
        values.stage = String(input.stage)
      }
      if (input.value !== undefined) {
        values.value = [{ currency_value: Number(input.value), currency_code: input.currency ? String(input.currency) : 'USD' }]
      }
      // associated_company must use the plural object slug "companies" and wrap in array
      if (input.associated_company_id) {
        values.associated_company = [{ target_object: 'companies', target_record_id: String(input.associated_company_id) }]
      }
      if (input.associated_person_id) {
        values.associated_people = [{ target_object: 'people', target_record_id: String(input.associated_person_id) }]
      }
      // owner: workspace-member actor reference
      if (input.owner_actor_id) {
        values.owner = [{ referenced_actor_type: 'workspace-member', referenced_actor_id: String(input.owner_actor_id) }]
      }

      const raw = await attioPost('/objects/deals/records', apiKey, { data: { values } })

      // If the array-wrapped name format fails, retry with the simpler string format Attio also accepts
      if (!raw.success && raw.statusCode === 400) {
        const fallbackValues: Record<string, unknown> = { name: String(input.name) }
        if (input.stage) fallbackValues.stage = String(input.stage)
        if (input.value !== undefined) fallbackValues.value = Number(input.value)
        if (input.associated_company_id) {
          fallbackValues.associated_company = [{ target_object: 'companies', target_record_id: String(input.associated_company_id) }]
        }
        if (input.associated_person_id) {
          fallbackValues.associated_people = [{ target_object: 'people', target_record_id: String(input.associated_person_id) }]
        }
        if (input.owner_actor_id) {
          fallbackValues.owner = [{ referenced_actor_type: 'workspace-member', referenced_actor_id: String(input.owner_actor_id) }]
        }
        const fallback = await attioPost('/objects/deals/records', apiKey, { data: { values: fallbackValues } })
        return verifyDealWrite(fallback, input.stage ? String(input.stage) : undefined, 'created')
      }

      return verifyDealWrite(raw, input.stage ? String(input.stage) : undefined, 'created')
    },
  },
  {
    name: 'attio_update_deal',
    description: 'Update an existing Attio deal — move it to a different pipeline stage, rename it, or change its value. Use this to change a deal stage (e.g. move from "Lead" to "In Progress"). Always call attio_search_deals first to get the record_id. Returns a verified confirmation with confirmed stage name. Use exact stage titles from attio_inspect_workspace — never guess.',
    inputSchema: {
      type: 'object',
      properties: {
        record_id: { type: 'string', description: 'The Attio deal record_id (from attio_search_deals or attio_create_deal)' },
        stage: { type: 'string', description: 'New pipeline stage title. Must match exactly — get valid titles from attio_inspect_workspace or attio_get_deal_stages.' },
        name: { type: 'string', description: 'New deal name (optional)' },
        value: { type: 'number', description: 'Updated deal value (optional)' },
        currency: { type: 'string', description: 'Currency code, e.g. USD, EUR (optional)' },
        owner_actor_id: { type: 'string', description: 'Workspace member actor ID to reassign as deal owner (optional). Get from attio_inspect_workspace workspace_members.' },
      },
      required: ['record_id'],
    },
    execute: async (input, ctx) => {
      const apiKey = getApiKey(ctx)
      if (!apiKey) return { success: false, error: 'Attio API key not configured' }
      if (!input.stage && !input.name && input.value === undefined && !input.owner_actor_id) {
        return { success: false, error: 'Provide at least one field to update: stage, name, value, or owner_actor_id.' }
      }

      const values: Record<string, unknown> = {}
      if (input.stage) {
        values.stage = String(input.stage)
      }
      if (input.name) {
        values.name = String(input.name)
      }
      if (input.value !== undefined) {
        values.value = Number(input.value)
      }
      if (input.owner_actor_id) {
        values.owner = [{ referenced_actor_type: 'workspace-member', referenced_actor_id: String(input.owner_actor_id) }]
      }

      const raw = await attioPatch(`/objects/deals/records/${String(input.record_id)}`, apiKey, { data: { values } })
      return verifyDealWrite(raw, input.stage ? String(input.stage) : undefined, 'updated')
    },
  },
  {
    name: 'attio_get_pipeline_stages',
    description: 'List all Attio lists/pipelines and their metadata. Use this ONLY when you need a list_id for attio_add_to_pipeline (the list-entry approach for non-deal objects). For deal stage management, use attio_create_deal or attio_update_deal with a `stage` field instead.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute: async (input, ctx) => {
      const apiKey = getApiKey(ctx)
      if (!apiKey) return { success: false, error: 'Attio API key not configured' }

      return attioGet('/lists', apiKey)
    },
  },
  {
    name: 'attio_get_deal_stages',
    description: 'ALWAYS call this before creating or updating a deal stage. Returns the exact stage titles available in this Attio workspace (e.g. "Lead", "In Progress", "Won 🎉", "Lost"). These can be renamed per workspace — never guess stage names. The result includes `available_stage_titles` you must use verbatim when calling attio_create_deal or attio_update_deal.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute: async (input, ctx) => {
      const apiKey = getApiKey(ctx)
      if (!apiKey) return { success: false, error: 'Attio API key not configured' }

      const result = await attioGet('/objects/deals/attributes/stage', apiKey)
      if (!result.success) {
        // Fallback: try listing all deal attributes and find the stage one
        const allAttrs = await attioGet('/objects/deals/attributes', apiKey)
        if (!allAttrs.success) return allAttrs

        const attrs = (allAttrs.data as { data?: Array<{ api_slug?: string; title?: string; config?: { statuses?: Array<{ title?: string; id?: { status_id?: string } }> }; type?: string }> } | null)?.data || []
        const stageAttr = attrs.find(a => a.api_slug === 'stage' || a.title?.toLowerCase() === 'stage')
        if (!stageAttr) {
          return {
            success: true,
            data: {
              available_stage_titles: ['Lead', 'In Progress', 'Won 🎉', 'Lost'],
              note: 'Could not find stage attribute — showing Attio defaults. If these fail, check your workspace stage configuration.',
            },
          }
        }

        const titles = (stageAttr.config?.statuses || []).map(s => s.title).filter(Boolean)
        return {
          success: true,
          data: {
            available_stage_titles: titles.length > 0 ? titles : ['Lead', 'In Progress', 'Won 🎉', 'Lost'],
            raw_attribute: stageAttr,
          },
        }
      }

      const stageAttr = result.data as { data?: { config?: { statuses?: Array<{ title?: string; id?: { status_id?: string } }> } } } | null
      const statuses = stageAttr?.data?.config?.statuses || []
      const titles = statuses.map(s => s.title).filter(Boolean)

      return {
        success: true,
        data: {
          available_stage_titles: titles.length > 0 ? titles : ['Lead', 'In Progress', 'Won 🎉', 'Lost'],
          raw_statuses: statuses,
        },
      }
    },
  },
  {
    name: 'attio_inspect_workspace',
    description: 'Get a complete overview of this Attio workspace before taking any action: workspace name, deal count, available deal stages, available lists, and workspace members (needed for the owner field on deals). ALWAYS call this first in any Attio session. The workspace_members field gives you valid actor IDs to use as owner_actor_id when creating deals.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute: async (input, ctx) => {
      const apiKey = getApiKey(ctx)
      if (!apiKey) return { success: false, error: 'Attio API key not configured' }

      const [selfResult, dealsResult, listsResult, stageAttrResult, membersResult] = await Promise.all([
        attioGet('/self', apiKey),
        attioPost('/objects/deals/records/query', apiKey, { limit: 1 }),
        attioGet('/lists', apiKey),
        attioGet('/objects/deals/attributes/stage', apiKey).catch(() => null),
        attioGet('/workspace-members', apiKey).catch(() => null),
      ])

      const workspace = (selfResult.data as { data?: { name?: string; id?: { workspace_id?: string } } } | null)?.data
      const dealTotal = (dealsResult.data as { total?: number } | null)?.total ?? 'unknown'
      const lists = ((listsResult.data as { data?: Array<{ id?: { list_id?: string }; name?: string; api_slug?: string }> } | null)?.data || [])
        .map(l => ({ list_id: l?.id?.list_id, name: l?.name, api_slug: l?.api_slug }))

      let availableStages: string[] = []
      if (stageAttrResult?.success) {
        const statuses = (stageAttrResult.data as { data?: { config?: { statuses?: Array<{ title?: string }> } } } | null)?.data?.config?.statuses || []
        availableStages = statuses.map(s => s.title).filter((t): t is string => !!t)
      }
      if (availableStages.length === 0) {
        availableStages = ['Lead', 'In Progress', 'Won 🎉', 'Lost']
      }

      // Extract workspace members for owner field usage
      type RawMember = { id?: { workspace_member_id?: string; actor_id?: string }; name?: Array<{ first_name?: string; last_name?: string; full_name?: string; value?: string }>; email_addresses?: Array<{ email_address?: string }> }
      const rawMembers = ((membersResult?.data as { data?: RawMember[] } | null)?.data || []) as RawMember[]
      const workspaceMembers = rawMembers.map(m => ({
        actor_id: m?.id?.workspace_member_id ?? m?.id?.actor_id ?? 'unknown',
        name: (m?.name?.[0]?.full_name ?? `${m?.name?.[0]?.first_name ?? ''} ${m?.name?.[0]?.last_name ?? ''}`.trim()) || (m?.name?.[0]?.value ?? 'unknown'),
        email: m?.email_addresses?.[0]?.email_address ?? 'unknown',
      }))

      return {
        success: true,
        data: {
          workspace_name: workspace?.name ?? 'unknown',
          workspace_id: workspace?.id?.workspace_id ?? 'unknown',
          deal_count: dealTotal,
          available_deal_stages: availableStages,
          lists,
          workspace_members: workspaceMembers,
          instructions: [
            'Use available_deal_stages verbatim when calling attio_create_deal or attio_update_deal. Never guess stage names.',
            'For creating deals: pass owner_actor_id using one of the workspace_members[].actor_id values.',
            'For associated_company: use the company record_id from attio_create_company or attio_search_companies.',
            'Object slugs in Attio are always PLURAL: "companies", "people", "deals" — never singular.',
          ].join(' '),
        },
      }
    },
  },
  {
    name: 'attio_get_workspace_members',
    description: 'List workspace members in Attio. Use this when you need a valid actor_id for the owner field when creating or updating deals. Each member has an actor_id, name, and email. Pass actor_id as owner_actor_id in attio_create_deal.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    execute: async (input, ctx) => {
      const apiKey = getApiKey(ctx)
      if (!apiKey) return { success: false, error: 'Attio API key not configured' }

      const result = await attioGet('/workspace-members', apiKey)
      if (!result.success) return result

      type RawMember = { id?: { workspace_member_id?: string; actor_id?: string }; name?: Array<{ first_name?: string; last_name?: string; full_name?: string; value?: string }>; email_addresses?: Array<{ email_address?: string }>; is_admin?: boolean }
      const members = ((result.data as { data?: RawMember[] } | null)?.data || []) as RawMember[]
      return {
        success: true,
        data: {
          members: members.map(m => ({
            actor_id: m?.id?.workspace_member_id ?? m?.id?.actor_id ?? 'unknown',
            name: (m?.name?.[0]?.full_name ?? `${m?.name?.[0]?.first_name ?? ''} ${m?.name?.[0]?.last_name ?? ''}`.trim()) || (m?.name?.[0]?.value ?? 'unknown'),
            email: m?.email_addresses?.[0]?.email_address ?? 'unknown',
            is_admin: m?.is_admin ?? false,
          })),
          usage_hint: 'Use actor_id as owner_actor_id when calling attio_create_deal or attio_update_deal.',
        },
      }
    },
  },
  {
    name: 'attio_add_to_pipeline',
    description: 'Add a record to an Attio list/pipeline via the list-entry API. NOTE: For deals specifically, prefer attio_create_deal (with `stage`) or attio_update_deal instead — those set stage directly on the deal record which is the primary deal pipeline model. This tool is best suited for adding people or companies to list-based views, or for workspaces where deals are managed purely through lists.',
    inputSchema: {
      type: 'object',
      properties: {
        list_id: { type: 'string', description: 'The Attio list/pipeline ID (from attio_get_pipeline_stages)' },
        parent_object: { type: 'string', description: 'Object type: "deals", "people", or "companies"' },
        parent_record_id: { type: 'string', description: 'The Attio record ID to add to the pipeline' },
        stage: { type: 'string', description: 'Pipeline stage name, e.g. "Lead", "Qualified", "Closed Won" (optional — uses pipeline default if omitted)' },
      },
      required: ['list_id', 'parent_object', 'parent_record_id'],
    },
    execute: async (input, ctx) => {
      const apiKey = getApiKey(ctx)
      if (!apiKey) return { success: false, error: 'Attio API key not configured' }

      const entryData: Record<string, unknown> = {
        parent_object: String(input.parent_object),
        parent_record_id: String(input.parent_record_id),
      }

      const entryValues: Record<string, unknown> = {}
      if (input.stage) {
        entryValues.stage = [{ value: String(input.stage) }]
      }

      return validateEntryResponse(
        await attioPost(`/lists/${String(input.list_id)}/entries`, apiKey, {
          data: {
            ...entryData,
            ...(Object.keys(entryValues).length > 0 ? { entry_values: entryValues } : {}),
          },
        }),
        'Pipeline entry'
      )
    },
  },
]
