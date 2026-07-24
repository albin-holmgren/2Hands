/**
 * Vercel Tools Pack
 *
 * Tools for interacting with Vercel deployments via the REST API.
 * Auth: Vercel API token stored as agent credential (apiKey).
 * Used by mission ticks to trigger deploys and check deployment status.
 */

import type { McpTool, McpToolResult } from '../types'

async function vercelApi(
  path: string,
  token: string,
  method: 'GET' | 'POST' | 'DELETE' = 'GET',
  body?: Record<string, unknown>
): Promise<McpToolResult> {
  const res = await fetch(`https://api.vercel.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!data) {
    return { success: false, error: 'Invalid response from Vercel API', statusCode: res.status }
  }
  if (!res.ok) {
    return {
      success: false,
      error: String(data.error ? (data.error as Record<string, unknown>).message ?? JSON.stringify(data.error) : JSON.stringify(data)),
      statusCode: res.status,
      data,
    }
  }
  return { success: true, data, statusCode: res.status }
}

export const vercelListDeployments: McpTool = {
  name: 'vercel_list_deployments',
  description: 'List recent Vercel deployments for a project.',
  inputSchema: {
    type: 'object',
    properties: {
      project_id: { type: 'string', description: 'Vercel project ID or project name.' },
      team_id: { type: 'string', description: 'Vercel team ID (optional, for team projects).' },
      limit: { type: 'number', description: 'Max results to return. Default: 10.' },
    },
    required: ['project_id'],
  },
  async execute(input, context): Promise<McpToolResult> {
    const token = context.credentials.apiKey
    if (!token) return { success: false, error: 'vercel_token (apiKey) credential required' }
    const { project_id, team_id, limit = 10 } = input as any
    const params = new URLSearchParams({ projectId: project_id, limit: String(limit) })
    if (team_id) params.set('teamId', team_id)
    const result = await vercelApi(`/v6/deployments?${params}`, token)
    if (!result.success) return result
    const deployments = ((result.data as Record<string, unknown>).deployments as any[]) ?? []
    return {
      success: true,
      data: {
        deployments: deployments.map(d => ({
          id: d.uid,
          url: d.url,
          state: d.state,
          created: d.createdAt,
          target: d.target,
          branch: d.meta?.githubCommitRef,
          commit: d.meta?.githubCommitMessage?.slice(0, 80),
        })),
      },
      statusCode: 200,
    }
  },
}

export const vercelGetDeployStatus: McpTool = {
  name: 'vercel_get_deploy_status',
  description: 'Get the current status of a specific Vercel deployment.',
  inputSchema: {
    type: 'object',
    properties: {
      deployment_id: { type: 'string', description: 'Vercel deployment ID (starts with dpl_).' },
      team_id: { type: 'string', description: 'Vercel team ID (optional).' },
    },
    required: ['deployment_id'],
  },
  async execute(input, context): Promise<McpToolResult> {
    const token = context.credentials.apiKey
    if (!token) return { success: false, error: 'vercel_token (apiKey) credential required' }
    const { deployment_id, team_id } = input as any
    const params = team_id ? `?teamId=${team_id}` : ''
    const result = await vercelApi(`/v13/deployments/${deployment_id}${params}`, token)
    if (!result.success) return result
    const d = result.data as Record<string, unknown>
    return {
      success: true,
      data: {
        id: d.id,
        url: d.url,
        state: d.readyState,
        error: d.errorMessage,
        created: d.createdAt,
        ready: d.readyAt,
        target: d.target,
        branch: (d.meta as Record<string, unknown>)?.githubCommitRef,
      },
      statusCode: 200,
    }
  },
}

export const vercelGetDeployLogs: McpTool = {
  name: 'vercel_get_deploy_logs',
  description: 'Get build logs for a Vercel deployment. Useful for debugging failed deployments.',
  inputSchema: {
    type: 'object',
    properties: {
      deployment_id: { type: 'string', description: 'Vercel deployment ID.' },
      team_id: { type: 'string', description: 'Vercel team ID (optional).' },
    },
    required: ['deployment_id'],
  },
  async execute(input, context): Promise<McpToolResult> {
    const token = context.credentials.apiKey
    if (!token) return { success: false, error: 'vercel_token (apiKey) credential required' }
    const { deployment_id, team_id } = input as any
    const params = team_id ? `?teamId=${team_id}` : ''
    const res = await fetch(`https://api.vercel.com/v2/deployments/${deployment_id}/events${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const text = await res.text()
    // Logs come back as NDJSON
    const lines = text.trim().split('\n').filter(Boolean).map(l => {
      try { return JSON.parse(l) } catch { return { text: l } }
    })
    const logText = lines
      .filter((l: any) => l.type === 'stdout' || l.type === 'stderr' || l.text)
      .map((l: any) => l.text || l.payload?.text || JSON.stringify(l))
      .slice(-100)
      .join('\n')
    return { success: true, data: { deployment_id, logs: logText }, statusCode: res.status }
  },
}

export const vercelTriggerDeploy: McpTool = {
  name: 'vercel_trigger_deploy',
  description: 'Trigger a new Vercel deployment for a project by creating a deploy hook request or re-deploying the latest.',
  inputSchema: {
    type: 'object',
    properties: {
      deploy_hook_url: { type: 'string', description: 'Vercel deploy hook URL (preferred method). Find this in Project Settings → Git → Deploy Hooks.' },
      project_id: { type: 'string', description: 'Project ID (used for re-deploy if no hook URL).' },
      team_id: { type: 'string', description: 'Vercel team ID (optional).' },
    },
    required: [],
  },
  async execute(input, context): Promise<McpToolResult> {
    const token = context.credentials.apiKey
    if (!token) return { success: false, error: 'vercel_token (apiKey) credential required' }
    const { deploy_hook_url, project_id, team_id } = input as any

    if (deploy_hook_url) {
      const res = await fetch(deploy_hook_url, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      return { success: res.ok, data, statusCode: res.status }
    }

    if (project_id) {
      const params = new URLSearchParams({ projectId: project_id, limit: '1' })
      if (team_id) params.set('teamId', team_id)
      const latest = await vercelApi(`/v6/deployments?${params}`, token)
      if (!latest.success) return { success: false, error: 'Could not fetch latest deployment to re-deploy' }
      const deployments = ((latest.data as Record<string, unknown>).deployments as any[]) ?? []
      if (!deployments[0]) return { success: false, error: 'No deployments found to re-deploy' }
      const teamParam = team_id ? `?teamId=${team_id}` : ''
      return vercelApi(`/v13/deployments/${deployments[0].uid}/redeploy${teamParam}`, token, 'POST')
    }

    return { success: false, error: 'Provide either deploy_hook_url or project_id' }
  },
}

export const VERCEL_TOOLS: McpTool[] = [
  vercelListDeployments,
  vercelGetDeployStatus,
  vercelGetDeployLogs,
  vercelTriggerDeploy,
]
