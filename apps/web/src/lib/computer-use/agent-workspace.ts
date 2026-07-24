/**
 * Agent Workspace — Per-agent task tracking, cross-agent data sharing,
 * and board reporting.
 *
 * Each agent has:
 * - A task checklist (persisted in workspace memory doc)
 * - A findings scratchpad (persisted in workspace memory doc)
 * - Ability to report milestones to the main workspace board
 * - Ability to read other agents' findings (cross-agent communication)
 *
 * Architecture:
 *   Agent Workspace (private)     →   Main Board (user sees)
 *   ├── Task Checklist            →   Completed milestones reported as cards
 *   ├── Findings/Data             →   Key findings saved to workspace memory
 *   └── Cross-agent reads         ←   Other agents' workspaces readable
 */

import { createAdminClient } from '@/lib/supabase/admin'
import {
  getMemoryDocument,
  updateMemoryDocument,
  appendToMemoryDocument,
  appendToDailyLog,
} from './structured-memory'

// ── Agent Task Checklist ──────────────────────────────────────────────

export interface AgentTask {
  id: string
  description: string
  status: 'pending' | 'in_progress' | 'done' | 'failed' | 'skipped'
  result?: string
  verified?: boolean
}

/**
 * Parse task checklist from workspace document.
 * Tasks are stored as markdown checklist in the WORKSPACE doc.
 */
export function parseTaskChecklist(workspaceContent: string): AgentTask[] {
  const tasks: AgentTask[] = []
  const checklistMatch = workspaceContent.match(/## Task Checklist\n([\s\S]*?)(?=\n## |$)/)
  if (!checklistMatch) return tasks

  const lines = checklistMatch[1].split('\n').filter(l => l.trim())
  for (const line of lines) {
    const match = line.match(/^- \[([ xX!~])\] (?:\[(\w+)\] )?(.+?)(?:\s*→\s*(.+))?$/)
    if (!match) continue

    const [, check, id, desc, result] = match
    const status: AgentTask['status'] =
      check === 'x' || check === 'X' ? 'done' :
      check === '!' ? 'failed' :
      check === '~' ? 'skipped' : 'pending'

    tasks.push({
      id: id || `task-${tasks.length}`,
      description: desc.trim(),
      status,
      result: result?.trim(),
      verified: line.includes('✓verified'),
    })
  }
  return tasks
}

/**
 * Serialize task checklist back to markdown for storage.
 */
export function serializeTaskChecklist(tasks: AgentTask[]): string {
  const lines = tasks.map(t => {
    const check = t.status === 'done' ? 'x' : t.status === 'failed' ? '!' : t.status === 'skipped' ? '~' : ' '
    const verified = t.verified ? ' ✓verified' : ''
    const result = t.result ? ` → ${t.result}` : ''
    return `- [${check}] [${t.id}] ${t.description}${result}${verified}`
  })
  return `## Task Checklist\n${lines.join('\n')}`
}

/**
 * Initialize a task checklist for an agent from a task description.
 * The AI Manager can call this when creating an agent to pre-populate subtasks.
 */
export async function initializeAgentChecklist(
  agentId: string,
  tasks: Array<{ id: string; description: string }>
): Promise<boolean> {
  const checklist: AgentTask[] = tasks.map(t => ({
    id: t.id,
    description: t.description,
    status: 'pending',
  }))

  const content = serializeTaskChecklist(checklist)
  return appendToMemoryDocument(agentId, 'workspace', 'Task Checklist', content.replace('## Task Checklist\n', ''))
}

/**
 * Update a task's status in the agent's workspace.
 */
export async function updateAgentTask(
  agentId: string,
  taskId: string,
  status: AgentTask['status'],
  result?: string
): Promise<boolean> {
  const workspace = await getMemoryDocument(agentId, 'workspace')
  const tasks = parseTaskChecklist(workspace)

  const task = tasks.find(t => t.id === taskId)
  if (!task) return false

  task.status = status
  if (result) task.result = result

  // Replace checklist section in workspace
  const checklistSection = serializeTaskChecklist(tasks)
  const newWorkspace = workspace.includes('## Task Checklist')
    ? workspace.replace(/## Task Checklist\n[\s\S]*?(?=\n## |$)/, checklistSection)
    : workspace + '\n\n' + checklistSection

  return updateMemoryDocument(agentId, 'workspace', newWorkspace)
}

// ── Agent-to-Board Reporting ──────────────────────────────────────────

/**
 * Report a completed milestone to the main workspace board.
 * This is how agents push their work UP to the user-visible board.
 */
export async function reportToMainBoard(
  workspaceId: string,
  agentId: string,
  agentName: string,
  params: {
    title: string
    description: string
    column?: string // default 'done'
  }
): Promise<string | null> {
  const supabase = createAdminClient()

  // Get the highest position in the target column
  const col = params.column ?? 'done'
  const { data: existing } = await supabase
    .from('mission_cards')
    .select('position')
    .eq('workspace_id', workspaceId)
    .eq('status', col)
    .order('position', { ascending: false })
    .limit(1) as { data: { position: number }[] | null }

  const nextPos = existing && existing.length > 0 ? existing[0].position + 1000 : 0

  const { data: card, error } = await supabase
    .from('mission_cards')
    .insert({
      workspace_id: workspaceId,
      title: `[${agentName}] ${params.title}`,
      description: params.description.slice(0, 2000),
      status: col,
      position: nextPos,
      agent_id: agentId,
    } as never)
    .select('id')
    .single()

  if (error) {
    console.error('[AgentWorkspace] reportToMainBoard error:', error)
    return null
  }

  return (card as { id: string })?.id ?? null
}

// ── Cross-Agent Communication ─────────────────────────────────────────

/**
 * Read another agent's workspace and findings.
 * Used when Agent 2 needs data from Agent 1.
 */
export async function readAgentFindings(
  agentId: string
): Promise<{ workspace: string; lastRunSummary: string | null; dailyLog: string }> {
  const supabase = createAdminClient()

  // Get workspace content
  const workspace = await getMemoryDocument(agentId, 'workspace')

  // Get last run summary from agent config
  const { data: agent } = await supabase
    .from('agents')
    .select('config, name')
    .eq('id', agentId)
    .single()

  const lastRunSummary = (agent as { config: Record<string, unknown> } | null)?.config?.last_run_summary as string | null

  // Get today's daily log
  const { data: logs } = await supabase
    .from('agent_daily_logs')
    .select('content')
    .eq('agent_id', agentId)
    .order('log_date', { ascending: false })
    .limit(1)

  const dailyLog = (logs as { content: string }[] | null)?.[0]?.content ?? ''

  return { workspace, lastRunSummary, dailyLog }
}

/**
 * Find related agents in the same workspace that might have useful data.
 * Called during agent execution to discover what other agents have found.
 */
export async function findRelatedAgents(
  workspaceId: string,
  currentAgentId: string,
  taskDescription: string
): Promise<Array<{ id: string; name: string; description: string; lastSummary: string | null }>> {
  const supabase = createAdminClient()

  const { data: agents } = await supabase
    .from('agents')
    .select('id, name, config')
    .eq('workspace_id', workspaceId)
    .neq('id', currentAgentId)
    .in('status', ['idle', 'working', 'completed'])
    .limit(10)

  if (!agents) return []

  return (agents as Array<{ id: string; name: string; config: Record<string, unknown> }>)
    .filter(a => a.config?.last_run_summary) // only agents that have reported findings
    .map(a => ({
      id: a.id,
      name: a.name,
      description: (a.config?.description as string) ?? '',
      lastSummary: (a.config?.last_run_summary as string) ?? null,
    }))
}

// ── Verification ──────────────────────────────────────────────────────

/**
 * Generate a verification summary for an agent's run.
 * Checks task checklist completion and flags unfinished items.
 */
export async function generateVerificationReport(
  agentId: string
): Promise<{
  totalTasks: number
  completed: number
  failed: number
  pending: number
  completionRate: number
  unfinishedItems: string[]
}> {
  const workspace = await getMemoryDocument(agentId, 'workspace')
  const tasks = parseTaskChecklist(workspace)

  const completed = tasks.filter(t => t.status === 'done').length
  const failed = tasks.filter(t => t.status === 'failed').length
  const pending = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length

  return {
    totalTasks: tasks.length,
    completed,
    failed,
    pending,
    completionRate: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0,
    unfinishedItems: tasks
      .filter(t => t.status === 'pending' || t.status === 'in_progress')
      .map(t => t.description),
  }
}
