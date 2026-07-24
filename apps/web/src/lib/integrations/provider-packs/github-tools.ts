/**
 * GitHub Tools Pack
 *
 * Tools for interacting with a GitHub repository via the REST API.
 * Auth: GitHub Personal Access Token (stored as agent credential).
 * Used by mission ticks for code read/write, PR management, and issue tracking.
 */

import type { McpTool, McpToolResult } from '../types'

async function githubApi(
  path: string,
  pat: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
  body?: Record<string, unknown>
): Promise<McpToolResult> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  if (res.status === 204) return { success: true, data: {}, statusCode: 204 }

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!data) {
    return { success: false, error: 'Invalid response from GitHub API', statusCode: res.status }
  }
  if (!res.ok) {
    return {
      success: false,
      error: String(data.message || JSON.stringify(data)),
      statusCode: res.status,
      data,
    }
  }
  return { success: true, data, statusCode: res.status }
}

// ── Read ──────────────────────────────────────────────────────────────────────

export const githubReadFile: McpTool = {
  name: 'github_read_file',
  description: 'Read a file from a GitHub repository.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository owner (username or org).' },
      repo: { type: 'string', description: 'Repository name.' },
      path: { type: 'string', description: 'File path relative to repo root.' },
      ref: { type: 'string', description: 'Branch, tag, or commit SHA. Default: main.' },
    },
    required: ['owner', 'repo', 'path'],
  },
  async execute(input, context): Promise<McpToolResult> {
    const pat = context.credentials.apiKey
    if (!pat) return { success: false, error: 'github_pat (apiKey) credential required' }
    const { owner, repo, path, ref = 'main' } = input as any
    const result = await githubApi(`/repos/${owner}/${repo}/contents/${path}?ref=${ref}`, pat)
    if (!result.success) return result
    const content = (result.data as Record<string, unknown>).content
    if (typeof content === 'string') {
      const decoded = Buffer.from(content, 'base64').toString('utf-8')
      return { success: true, data: { path, content: decoded }, statusCode: 200 }
    }
    return result
  },
}

export const githubListDirectory: McpTool = {
  name: 'github_list_directory',
  description: 'List files and directories in a GitHub repository path.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string' },
      repo: { type: 'string' },
      path: { type: 'string', description: 'Directory path. Use "" for root.' },
      ref: { type: 'string', description: 'Branch or ref. Default: main.' },
    },
    required: ['owner', 'repo', 'path'],
  },
  async execute(input, context): Promise<McpToolResult> {
    const pat = context.credentials.apiKey
    if (!pat) return { success: false, error: 'github_pat (apiKey) credential required' }
    const { owner, repo, path, ref = 'main' } = input as any
    const encodedPath = path ? `/${path}` : ''
    const result = await githubApi(`/repos/${owner}/${repo}/contents${encodedPath}?ref=${ref}`, pat)
    if (!result.success) return result
    const items = Array.isArray(result.data) ? result.data : [result.data]
    return {
      success: true,
      data: { path, items: (items as any[]).map(i => ({ name: i.name, type: i.type, path: i.path, size: i.size })) },
      statusCode: 200,
    }
  },
}

// ── Write ─────────────────────────────────────────────────────────────────────

export const githubWriteFile: McpTool = {
  name: 'github_write_file',
  description: 'Create or update a file in a GitHub repository branch.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string' },
      repo: { type: 'string' },
      path: { type: 'string', description: 'File path relative to repo root.' },
      content: { type: 'string', description: 'File content (plain text, will be base64-encoded).' },
      message: { type: 'string', description: 'Commit message.' },
      branch: { type: 'string', description: 'Branch to write to.' },
    },
    required: ['owner', 'repo', 'path', 'content', 'message', 'branch'],
  },
  async execute(input, context): Promise<McpToolResult> {
    const pat = context.credentials.apiKey
    if (!pat) return { success: false, error: 'github_pat (apiKey) credential required' }
    const { owner, repo, path, content, message, branch } = input as any

    let sha: string | undefined
    const existing = await githubApi(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, pat)
    if (existing.success) {
      sha = (existing.data as Record<string, unknown>).sha as string | undefined
    }

    const encoded = Buffer.from(content as string, 'utf-8').toString('base64')
    return githubApi(`/repos/${owner}/${repo}/contents/${path}`, pat, 'PUT', {
      message,
      content: encoded,
      branch,
      ...(sha ? { sha } : {}),
    })
  },
}

// ── Branches ──────────────────────────────────────────────────────────────────

export const githubCreateBranch: McpTool = {
  name: 'github_create_branch',
  description: 'Create a new branch in a GitHub repository.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string' },
      repo: { type: 'string' },
      branch: { type: 'string', description: 'New branch name.' },
      from: { type: 'string', description: 'Branch/ref to branch from. Default: main.' },
    },
    required: ['owner', 'repo', 'branch'],
  },
  async execute(input, context): Promise<McpToolResult> {
    const pat = context.credentials.apiKey
    if (!pat) return { success: false, error: 'github_pat (apiKey) credential required' }
    const { owner, repo, branch, from = 'main' } = input as any

    const refResult = await githubApi(`/repos/${owner}/${repo}/git/ref/heads/${from}`, pat)
    if (!refResult.success) return refResult
    const sha = ((refResult.data as Record<string, unknown>).object as Record<string, unknown>)?.sha as string
    if (!sha) return { success: false, error: `Could not get SHA for branch ${from}` }

    return githubApi(`/repos/${owner}/${repo}/git/refs`, pat, 'POST', {
      ref: `refs/heads/${branch}`,
      sha,
    })
  },
}

// ── Pull Requests ─────────────────────────────────────────────────────────────

export const githubCreatePr: McpTool = {
  name: 'github_create_pr',
  description: 'Open a Pull Request in a GitHub repository.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string' },
      repo: { type: 'string' },
      title: { type: 'string', description: 'PR title.' },
      body: { type: 'string', description: 'PR description.' },
      head: { type: 'string', description: 'Feature branch name.' },
      base: { type: 'string', description: 'Target branch. Default: main.' },
    },
    required: ['owner', 'repo', 'title', 'body', 'head'],
  },
  async execute(input, context): Promise<McpToolResult> {
    const pat = context.credentials.apiKey
    if (!pat) return { success: false, error: 'github_pat (apiKey) credential required' }
    const { owner, repo, title, body, head, base = 'main' } = input as any
    return githubApi(`/repos/${owner}/${repo}/pulls`, pat, 'POST', { title, body, head, base })
  },
}

export const githubGetPrStatus: McpTool = {
  name: 'github_get_pr_status',
  description: 'Get the status of a Pull Request — merge status, CI checks, review state.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string' },
      repo: { type: 'string' },
      pr_number: { type: 'number', description: 'Pull Request number.' },
    },
    required: ['owner', 'repo', 'pr_number'],
  },
  async execute(input, context): Promise<McpToolResult> {
    const pat = context.credentials.apiKey
    if (!pat) return { success: false, error: 'github_pat (apiKey) credential required' }
    const { owner, repo, pr_number } = input as any
    const pr = await githubApi(`/repos/${owner}/${repo}/pulls/${pr_number}`, pat)
    if (!pr.success) return pr
    const d = pr.data as Record<string, unknown>
    return {
      success: true,
      data: { number: pr_number, state: d.state, merged: d.merged, mergeable: d.mergeable, title: d.title, url: d.html_url },
      statusCode: 200,
    }
  },
}

// ── Issues ────────────────────────────────────────────────────────────────────

export const githubListIssues: McpTool = {
  name: 'github_list_issues',
  description: 'List issues in a GitHub repository.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string' },
      repo: { type: 'string' },
      state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Issue state filter. Default: open.' },
      label: { type: 'string', description: 'Filter by label (optional).' },
      per_page: { type: 'number', description: 'Max results. Default: 20.' },
    },
    required: ['owner', 'repo'],
  },
  async execute(input, context): Promise<McpToolResult> {
    const pat = context.credentials.apiKey
    if (!pat) return { success: false, error: 'github_pat (apiKey) credential required' }
    const { owner, repo, state = 'open', label, per_page = 20 } = input as any
    const params = new URLSearchParams({ state, per_page: String(per_page) })
    if (label) params.set('labels', label)
    const result = await githubApi(`/repos/${owner}/${repo}/issues?${params}`, pat)
    if (!result.success) return result
    const issues = Array.isArray(result.data) ? result.data : []
    return {
      success: true,
      data: { issues: (issues as any[]).map(i => ({ number: i.number, title: i.title, state: i.state, url: i.html_url, labels: i.labels?.map((l: any) => l.name) })) },
      statusCode: 200,
    }
  },
}

export const githubCreateIssue: McpTool = {
  name: 'github_create_issue',
  description: 'Create a new issue in a GitHub repository.',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string' },
      repo: { type: 'string' },
      title: { type: 'string' },
      body: { type: 'string' },
      labels: { type: 'array', items: { type: 'string' }, description: 'Issue labels (optional).' },
    },
    required: ['owner', 'repo', 'title', 'body'],
  },
  async execute(input, context): Promise<McpToolResult> {
    const pat = context.credentials.apiKey
    if (!pat) return { success: false, error: 'github_pat (apiKey) credential required' }
    const { owner, repo, title, body, labels } = input as any
    return githubApi(`/repos/${owner}/${repo}/issues`, pat, 'POST', { title, body, labels })
  },
}

export const GITHUB_TOOLS: McpTool[] = [
  githubReadFile,
  githubListDirectory,
  githubWriteFile,
  githubCreateBranch,
  githubCreatePr,
  githubGetPrStatus,
  githubListIssues,
  githubCreateIssue,
]
