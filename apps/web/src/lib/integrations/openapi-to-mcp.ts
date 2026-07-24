/**
 * OpenAPI → MCP Tool Generator
 * 
 * Dynamically generates MCP tools from OpenAPI specifications.
 * This allows any service with an OpenAPI spec to be exposed as agent tools
 * without writing custom integration code.
 */

import type { McpTool, McpExecutionContext, McpToolResult, ProviderPack, ToolNamingRules } from './types'

interface OpenApiOperation {
  operationId?: string
  summary?: string
  description?: string
  tags?: string[]
  parameters?: OpenApiParameter[]
  requestBody?: {
    required?: boolean
    content?: Record<string, { schema?: Record<string, unknown> }>
  }
  responses?: Record<string, unknown>
}

interface OpenApiParameter {
  name: string
  in: 'query' | 'path' | 'header' | 'cookie'
  required?: boolean
  description?: string
  schema?: Record<string, unknown>
}

interface OpenApiSpec {
  openapi?: string
  info?: { title?: string; version?: string }
  servers?: Array<{ url: string }>
  paths?: Record<string, Record<string, OpenApiOperation>>
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[.\-\s]+/g, '_')
    .toLowerCase()
}

function toCamelCase(str: string): string {
  return str
    .replace(/[.\-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (c) => c.toLowerCase())
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[._\s]+/g, '-')
    .toLowerCase()
}

function transformOperationId(operationId: string, rules?: ToolNamingRules): string {
  const transform = rules?.operationIdTransform || 'snake_case'
  const prefix = rules?.prefix || ''

  let name: string
  switch (transform) {
    case 'camelCase':
      name = toCamelCase(operationId)
      break
    case 'kebab-case':
      name = toKebabCase(operationId)
      break
    case 'snake_case':
    default:
      name = toSnakeCase(operationId)
  }

  return prefix ? `${prefix}_${name}` : name
}

function shouldIncludeOperation(
  operationId: string,
  tags: string[] | undefined,
  rules?: ToolNamingRules
): boolean {
  if (rules?.includeOperationIds && rules.includeOperationIds.length > 0) {
    return rules.includeOperationIds.includes(operationId)
  }

  if (rules?.excludeOperationIds && rules.excludeOperationIds.includes(operationId)) {
    return false
  }

  if (rules?.tagFilter && rules.tagFilter.length > 0 && tags) {
    return tags.some((tag) => rules.tagFilter!.includes(tag))
  }

  return true
}

function buildInputSchema(
  parameters: OpenApiParameter[] | undefined,
  requestBody: OpenApiOperation['requestBody']
): { type: 'object'; properties: Record<string, unknown>; required?: string[] } {
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  if (parameters) {
    for (const param of parameters) {
      properties[param.name] = {
        ...param.schema,
        description: param.description,
      }
      if (param.required) {
        required.push(param.name)
      }
    }
  }

  if (requestBody?.content) {
    const jsonContent = requestBody.content['application/json']
    if (jsonContent?.schema) {
      properties['body'] = {
        ...jsonContent.schema,
        description: 'Request body',
      }
      if (requestBody.required) {
        required.push('body')
      }
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  }
}

function buildExecutor(
  method: string,
  pathTemplate: string,
  parameters: OpenApiParameter[] | undefined
): McpTool['execute'] {
  return async (
    input: Record<string, unknown>,
    context: McpExecutionContext
  ): Promise<McpToolResult> => {
    try {
      let path = pathTemplate
      const queryParams: Record<string, string> = {}
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (context.credentials.accessToken) {
        headers['Authorization'] = `Bearer ${context.credentials.accessToken}`
      } else if (context.credentials.apiKey) {
        const headerName = context.apiKeyAuth?.headerName || 'Authorization'
        const prefix = context.apiKeyAuth?.headerPrefix !== undefined
          ? context.apiKeyAuth.headerPrefix
          : (headerName === 'Authorization' ? 'Bearer ' : '')
        headers[headerName] = `${prefix}${context.credentials.apiKey}`
      }

      if (parameters) {
        for (const param of parameters) {
          const value = input[param.name]
          if (value !== undefined) {
            if (param.in === 'path') {
              path = path.replace(`{${param.name}}`, encodeURIComponent(String(value)))
            } else if (param.in === 'query') {
              queryParams[param.name] = String(value)
            } else if (param.in === 'header') {
              headers[param.name] = String(value)
            }
          }
        }
      }

      const queryString = Object.keys(queryParams).length > 0
        ? '?' + new URLSearchParams(queryParams).toString()
        : ''

      const url = `${context.baseUrl}${path}${queryString}`

      const fetchOptions: RequestInit = {
        method: method.toUpperCase(),
        headers,
      }

      if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) && input['body']) {
        fetchOptions.body = JSON.stringify(input['body'])
      }

      const response = await fetch(url, fetchOptions)
      const statusCode = response.status

      let data: unknown
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        data = await response.json()
      } else {
        data = await response.text()
      }

      if (response.ok) {
        return { success: true, data, statusCode }
      } else {
        return {
          success: false,
          error: typeof data === 'string' ? data : JSON.stringify(data),
          statusCode,
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

export function generateToolsFromOpenApi(
  spec: OpenApiSpec,
  providerPack: ProviderPack
): McpTool[] {
  const tools: McpTool[] = []

  if (!spec.paths) return tools

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!operation || typeof operation !== 'object') continue
      if (!('operationId' in operation) || !operation.operationId) continue

      const op = operation as OpenApiOperation

      if (!shouldIncludeOperation(op.operationId!, op.tags, providerPack.toolNaming)) {
        continue
      }

      const toolName = transformOperationId(op.operationId!, providerPack.toolNaming)
      const description = op.summary || op.description || `${method.toUpperCase()} ${path}`

      const tool: McpTool = {
        name: toolName,
        description,
        inputSchema: buildInputSchema(op.parameters, op.requestBody),
        execute: buildExecutor(method, path, op.parameters),
      }

      tools.push(tool)
    }
  }

  return tools
}

export async function fetchAndGenerateTools(providerPack: ProviderPack): Promise<McpTool[]> {
  if (providerPack.openApiSpec) {
    return generateToolsFromOpenApi(providerPack.openApiSpec as OpenApiSpec, providerPack)
  }

  if (!providerPack.openApiSpecUrl) {
    return []
  }

  try {
    const response = await fetch(providerPack.openApiSpecUrl)
    if (!response.ok) {
      console.error(`Failed to fetch OpenAPI spec from ${providerPack.openApiSpecUrl}: ${response.status}`)
      return []
    }

    const spec = await response.json() as OpenApiSpec
    return generateToolsFromOpenApi(spec, providerPack)
  } catch (error) {
    console.error(`Error fetching OpenAPI spec for ${providerPack.id}:`, error)
    return []
  }
}
