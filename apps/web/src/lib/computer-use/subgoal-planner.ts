/**
 * Subgoal Planner
 * 
 * Decomposes tasks into subgoals and tracks progress.
 * Prevents agents from wandering and increases success rates.
 * 
 * Hierarchical structure:
 *   GoalTree > Project[] > ProjectTask[]
 *   - GoalTree: The overall multi-session goal
 *   - Project: A session-level unit of work (one agent run)
 *   - ProjectTask: A concrete action within a project (maps to Subgoal)
 */

import { PageState } from './semantic-browser-tools'
import { createNonStreamingMessageWithFallback, normalizeModelForTransport, DEFAULT_MODEL } from '@/lib/ai/ai-client'
import { performWebSearch } from '@/lib/excellence/real-web-research'
import { routeByPhase } from '@/lib/ai/model-routing'

// Phase-aware model selection:
// - Plan generation uses the 'plan' phase (premium for first-run novel tasks)
// - Goal checking uses the 'verify' phase (cheap Kimi — runs every few steps)
// - Summarization uses the 'summarize' phase (cheapest available)
const getPlanGenerationModel = () => routeByPhase('plan', 'agent', { needsTools: false }).model
const getGoalCheckModel = () => routeByPhase('verify', 'agent', { preferCheap: true }).model
const PLANNING_MODEL = DEFAULT_MODEL

// ============================================================
// Hierarchical Goal Tree (multi-session planning)
// ============================================================

export interface ProjectTask {
  id: string
  description: string
  success_criteria: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'
  tools_needed?: string[]
  failure_reason?: string
  output?: string
}

export interface Project {
  id: string
  name: string
  description: string
  tasks: ProjectTask[]
  dependencies: string[]
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'
  tools_discovered?: string[]
  started_at?: string
  completed_at?: string
  failure_reason?: string
  session_handoff?: string
}

export interface GoalTree {
  id: string
  original_goal: string
  projects: Project[]
  current_project_id: string | null
  overall_status: 'planning' | 'executing' | 'completed' | 'failed'
  created_at: string
  updated_at: string
  tool_discoveries: Record<string, string>
  handoff_note?: string
}

// ============================================================
// Single-session planning (existing)
// ============================================================

export interface Subgoal {
  id: string
  description: string
  success_criteria: string
  estimated_steps: number
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked'
  dependencies: string[]
  started_at?: string
  completed_at?: string
  failure_reason?: string
}

export interface TaskPlan {
  task_id: string
  original_task: string
  subgoals: Subgoal[]
  current_subgoal_id: string | null
  created_at: string
  updated_at: string
  overall_status: 'planning' | 'executing' | 'completed' | 'failed'
  total_steps_taken: number
  max_steps_allowed: number
}

export interface GoalCheckResult {
  on_track: boolean
  progress_percentage: number
  current_subgoal_status: 'progressing' | 'stuck' | 'completed' | 'wrong_direction' | 'blocked'
  suggested_action?: string
  should_replan: boolean
  reasoning: string
}

/**
 * Generate a task plan with subgoals
 */
export async function generateTaskPlan(
  taskDescription: string,
  context: {
    skills?: string[]
    constraints?: string[]
    max_steps?: number
  } = {}
): Promise<TaskPlan> {
  const prompt = `You are a task planning assistant. Break down this task into clear subgoals.

TASK: ${taskDescription}

${context.skills?.length ? `AVAILABLE SKILLS: ${context.skills.join(', ')}` : ''}
${context.constraints?.length ? `CONSTRAINTS: ${context.constraints.join(', ')}` : ''}

Create a plan with 2-5 subgoals. Each subgoal should be:
- Specific and verifiable
- Achievable in a few browser actions
- Have clear success criteria

Respond in this exact JSON format:
{
  "subgoals": [
    {
      "id": "1",
      "description": "What to do",
      "success_criteria": "How to verify it's done",
      "estimated_steps": 3,
      "dependencies": []
    }
  ]
}

Keep it simple and focused. Don't over-decompose.`

  try {
    const { response } = await createNonStreamingMessageWithFallback({
      model: getPlanGenerationModel(),
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    })
    
    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')
    
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return createFallbackPlan(taskDescription, context.max_steps)
    }
    
    const parsed = JSON.parse(jsonMatch[0])
    const subgoals: Subgoal[] = (parsed.subgoals || []).map((sg: Partial<Subgoal>, i: number) => ({
      id: sg.id || String(i + 1),
      description: sg.description || 'Unknown step',
      success_criteria: sg.success_criteria || 'Verify completion',
      estimated_steps: sg.estimated_steps || 5,
      status: 'pending' as const,
      dependencies: sg.dependencies || [],
    }))
    
    return {
      task_id: generateId(),
      original_task: taskDescription,
      subgoals,
      current_subgoal_id: subgoals[0]?.id || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      overall_status: 'executing',
      total_steps_taken: 0,
      max_steps_allowed: context.max_steps || 30,
    }
  } catch (error) {
    console.error('[SubgoalPlanner] Failed to generate plan:', error)
    return createFallbackPlan(taskDescription, context.max_steps)
  }
}

/**
 * Create a simple fallback plan when AI planning fails
 */
function createFallbackPlan(taskDescription: string, maxSteps?: number): TaskPlan {
  return {
    task_id: generateId(),
    original_task: taskDescription,
    subgoals: [
      {
        id: '1',
        description: 'Complete the task',
        success_criteria: 'Task is done',
        estimated_steps: 10,
        status: 'pending',
        dependencies: [],
      },
    ],
    current_subgoal_id: '1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    overall_status: 'executing',
    total_steps_taken: 0,
    max_steps_allowed: maxSteps || 30,
  }
}

/**
 * Check if we're making progress toward the current goal
 */
export async function checkGoalProgress(
  plan: TaskPlan,
  pageState: PageState | null,
  recentActions: string[],
  stepsSinceLastCheck: number
): Promise<GoalCheckResult> {
  const currentSubgoal = plan.subgoals.find(sg => sg.id === plan.current_subgoal_id)
  
  if (!currentSubgoal) {
    return {
      on_track: false,
      progress_percentage: 0,
      current_subgoal_status: 'stuck',
      should_replan: true,
      reasoning: 'No current subgoal found',
    }
  }
  
  // Quick heuristic checks first
  if (stepsSinceLastCheck > currentSubgoal.estimated_steps * 2) {
    return {
      on_track: false,
      progress_percentage: 50,
      current_subgoal_status: 'stuck',
      suggested_action: 'Consider a different approach or skip this subgoal',
      should_replan: true,
      reasoning: 'Taking too many steps for this subgoal',
    }
  }
  
  // Check for obvious stuck patterns
  if (recentActions.length >= 3) {
    const lastThree = recentActions.slice(-3)
    if (lastThree.every(a => a === lastThree[0])) {
      return {
        on_track: false,
        progress_percentage: 30,
        current_subgoal_status: 'stuck',
        suggested_action: 'Repeating the same action - try something different',
        should_replan: true,
        reasoning: 'Detected action loop',
      }
    }
  }
  
  // Check for blocking conditions
  if (pageState?.captcha_detected) {
    return {
      on_track: false,
      progress_percentage: 0,
      current_subgoal_status: 'blocked',
      suggested_action: 'Cannot proceed - CAPTCHA detected',
      should_replan: false,
      reasoning: 'Blocked by CAPTCHA',
    }
  }
  
  if (pageState?.login_detected && !currentSubgoal.description.toLowerCase().includes('login')) {
    return {
      on_track: false,
      progress_percentage: 20,
      current_subgoal_status: 'blocked',
      suggested_action: 'Need to complete login first',
      should_replan: false,
      reasoning: 'Unexpected login prompt',
    }
  }
  
  // Use LLM for more nuanced check (only if we have page state)
  if (pageState) {
    return await llmGoalCheck(currentSubgoal, pageState, recentActions)
  }
  
  // Default to optimistic if we can't check
  return {
    on_track: true,
    progress_percentage: 50,
    current_subgoal_status: 'progressing',
    should_replan: false,
    reasoning: 'Unable to verify progress, continuing',
  }
}

/**
 * Use LLM for nuanced goal progress check
 */
async function llmGoalCheck(
  subgoal: Subgoal,
  pageState: PageState,
  recentActions: string[]
): Promise<GoalCheckResult> {
  const prompt = `You are checking if an AI agent is making progress on a task.

CURRENT GOAL: ${subgoal.description}
SUCCESS CRITERIA: ${subgoal.success_criteria}

CURRENT PAGE:
- URL: ${pageState.url}
- Title: ${pageState.title}
- Errors: ${pageState.errors.join(', ') || 'none'}
- Loading: ${pageState.loading}

RECENT ACTIONS (last 5):
${recentActions.slice(-5).map((a, i) => `${i + 1}. ${a}`).join('\n')}

Evaluate progress. Respond in this exact format:
ON_TRACK: true/false
PROGRESS: 0-100
STATUS: progressing/stuck/completed/wrong_direction
SUGGESTION: (optional advice)
REASONING: (brief explanation)`

  try {
    const { response } = await createNonStreamingMessageWithFallback({
      model: getGoalCheckModel(),
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })
    
    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')
    
    const onTrack = text.match(/ON_TRACK:\s*(true|false)/i)?.[1]?.toLowerCase() === 'true'
    const progress = parseInt(text.match(/PROGRESS:\s*(\d+)/)?.[1] || '50')
    const status = text.match(/STATUS:\s*(progressing|stuck|completed|wrong_direction)/i)?.[1]?.toLowerCase() as GoalCheckResult['current_subgoal_status'] || 'progressing'
    const suggestion = text.match(/SUGGESTION:\s*(.+?)(?=\n|$)/)?.[1]?.trim()
    const reasoning = text.match(/REASONING:\s*(.+)/)?.[1]?.trim() || 'No reasoning provided'
    
    return {
      on_track: onTrack,
      progress_percentage: Math.min(100, Math.max(0, progress)),
      current_subgoal_status: status,
      suggested_action: suggestion,
      should_replan: status === 'stuck' || status === 'wrong_direction',
      reasoning,
    }
  } catch (error) {
    console.error('[SubgoalPlanner] Goal check failed:', error)
    return {
      on_track: true,
      progress_percentage: 50,
      current_subgoal_status: 'progressing',
      should_replan: false,
      reasoning: 'Check failed, assuming progress',
    }
  }
}

/**
 * Mark a subgoal as completed and move to next
 */
export function advanceToNextSubgoal(plan: TaskPlan): TaskPlan {
  const currentIndex = plan.subgoals.findIndex(sg => sg.id === plan.current_subgoal_id)
  
  if (currentIndex >= 0) {
    plan.subgoals[currentIndex].status = 'completed'
    plan.subgoals[currentIndex].completed_at = new Date().toISOString()
  }
  
  // Find next pending subgoal
  const nextSubgoal = plan.subgoals.find(sg => sg.status === 'pending')
  
  if (nextSubgoal) {
    nextSubgoal.status = 'in_progress'
    nextSubgoal.started_at = new Date().toISOString()
    plan.current_subgoal_id = nextSubgoal.id
  } else {
    plan.current_subgoal_id = null
    plan.overall_status = 'completed'
  }
  
  plan.updated_at = new Date().toISOString()
  return plan
}

/**
 * Mark current subgoal as failed
 */
export function markSubgoalFailed(plan: TaskPlan, reason: string): TaskPlan {
  const current = plan.subgoals.find(sg => sg.id === plan.current_subgoal_id)
  
  if (current) {
    current.status = 'failed'
    current.failure_reason = reason
  }
  
  plan.updated_at = new Date().toISOString()
  return plan
}

/**
 * Format plan for agent prompt
 */
export function formatPlanForPrompt(plan: TaskPlan): string {
  let output = '## Task Plan\n\n'
  
  output += `**Original Task:** ${plan.original_task}\n\n`
  output += `**Progress:** ${plan.total_steps_taken}/${plan.max_steps_allowed} steps\n\n`
  
  output += '**Subgoals:**\n'
  for (const sg of plan.subgoals) {
    const statusEmoji = {
      pending: '○',
      in_progress: '▶',
      completed: '✓',
      failed: '✗',
      blocked: '⚠',
    }[sg.status]
    
    const isCurrent = sg.id === plan.current_subgoal_id
    const marker = isCurrent ? `**${statusEmoji}**` : statusEmoji
    
    output += `${marker} ${sg.description}`
    if (isCurrent) {
      output += ' ← CURRENT'
    }
    if (sg.failure_reason) {
      output += ` (${sg.failure_reason})`
    }
    output += '\n'
  }
  
  const currentSubgoal = plan.subgoals.find(sg => sg.id === plan.current_subgoal_id)
  if (currentSubgoal) {
    output += `\n**Current Focus:** ${currentSubgoal.description}\n`
    output += `**Success Criteria:** ${currentSubgoal.success_criteria}\n`
  }
  
  return output
}

/**
 * Format goal check result for agent context
 */
export function formatGoalCheckForPrompt(result: GoalCheckResult): string {
  const statusEmoji = {
    progressing: '✓',
    stuck: '⚠',
    completed: '🎉',
    wrong_direction: '↩',
    blocked: '🚫',
  }[result.current_subgoal_status]
  
  let output = `\n## Progress Check ${statusEmoji}\n`
  output += `Progress: ${result.progress_percentage}%\n`
  output += `Status: ${result.current_subgoal_status}\n`
  
  if (result.suggested_action) {
    output += `Suggestion: ${result.suggested_action}\n`
  }
  
  if (result.should_replan) {
    output += '\n⚠️ Consider adjusting approach or skipping this step.\n'
  }
  
  return output
}

/**
 * Check if the plan should terminate early
 */
export function shouldTerminatePlan(plan: TaskPlan): {
  should_terminate: boolean
  reason?: string
} {
  // Check step limit
  if (plan.total_steps_taken >= plan.max_steps_allowed) {
    return {
      should_terminate: true,
      reason: 'Maximum steps reached',
    }
  }
  
  // Check if all subgoals are done or failed
  const allDone = plan.subgoals.every(sg => 
    sg.status === 'completed' || sg.status === 'failed'
  )
  
  if (allDone) {
    const anySuccess = plan.subgoals.some(sg => sg.status === 'completed')
    return {
      should_terminate: true,
      reason: anySuccess ? 'All subgoals processed' : 'All subgoals failed',
    }
  }
  
  // Check for too many consecutive failures
  const consecutiveFailures = plan.subgoals
    .slice()
    .reverse()
    .findIndex(sg => sg.status !== 'failed')
  
  if (consecutiveFailures >= 3) {
    return {
      should_terminate: true,
      reason: 'Too many consecutive failures',
    }
  }
  
  return { should_terminate: false }
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Build planning instructions for agent prompt
 */
export function buildPlanningInstructions(): string {
  return `
## Task Execution Protocol

You have a plan with subgoals. Follow these rules:

1. **Focus on current subgoal** - Don't jump ahead or go back
2. **Verify before moving on** - Check success criteria before marking done
3. **Report completion** - Use task_complete when the subgoal's success criteria are met
4. **Ask for help** - If stuck for more than 5 steps on same subgoal, try a different approach or report blocker

When you complete a subgoal's success criteria, briefly confirm what was accomplished.
`
}

// ============================================================
// Hierarchical Goal Tree — Multi-session planning engine
// ============================================================

/**
 * Determine if a task is "big" enough to warrant a full goal tree
 * vs a simple single-session plan.
 */
export function needsGoalTree(taskDescription: string): boolean {
  const lower = taskDescription.toLowerCase()
  const bigTaskIndicators = [
    // Action verbs
    'build', 'launch', 'deploy', 'set up', 'create a',
    'develop', 'design and', 'implement',
    // Business indicators
    'company', 'business', 'startup', 'start-up', 'saas',
    'ecommerce', 'e-commerce', 'dropship', 'store',
    'brand', 'agency', 'consulting',
    // Money/revenue
    'money', 'revenue', 'income', 'profit', 'monetize',
    'monetise', 'subscribers', 'customers', 'payments',
    // Competition
    'rivals', 'compete', 'replace', 'disrupt',
    // Scale indicators
    'automate', 'scale', 'grow', 'from scratch',
    'end to end', 'complete solution', 'full stack',
    // Ambition markers
    'as much as possible', 'as fast as possible',
    'product hunt', 'app store',
  ]
  const matchCount = bigTaskIndicators.filter(ind => lower.includes(ind)).length
  // 1 match = probably big; also trigger for very long descriptions
  return matchCount >= 1 || taskDescription.length > 300
}

/**
 * Generate a hierarchical goal tree from a big task description.
 * Decomposes into Projects (session-level) > Tasks (action-level).
 */
export async function generateGoalTree(
  goalDescription: string,
  context?: { handoff_note?: string; previous_discoveries?: Record<string, string> }
): Promise<GoalTree> {
  const handoffContext = context?.handoff_note
    ? `\n\nPREVIOUS SESSION HANDOFF:\n${context.handoff_note}`
    : ''
  const discoveryContext = context?.previous_discoveries && Object.keys(context.previous_discoveries).length > 0
    ? `\n\nPREVIOUSLY DISCOVERED TOOLS:\n${Object.entries(context.previous_discoveries).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`
    : ''

  const prompt = `You are a strategic project planner for an AI Mission system. You break down long-term goals into concrete, measurable projects and tasks.

GOAL: ${goalDescription}
${handoffContext}${discoveryContext}

Break this goal into 3-6 SEQUENTIAL PROJECTS. Each project represents a major milestone or phase.
Each project has 3-6 concrete TASKS that move the project toward completion.

IMPORTANT RULES:
- Projects must be in logical dependency order (research before execution, strategy before outreach)
- Each project name should be a clear milestone: "Market Research", "Competitor Analysis", "Outreach Campaign", "Product Launch", etc.
- Tasks must be SPECIFIC and ACTIONABLE — name real tools, websites, data sources, or actions
- Tasks should have clear success criteria (what "done" looks like)
- Reference real tools: for research (Google, LinkedIn, Apollo, SimilarWeb, Crunchbase), for content (Canva, Notion, Google Docs), for outreach (email, LinkedIn, Twitter/X), for dev (GitHub, Vercel, Lovable.dev)
- Avoid vague tasks like "research competitors" — instead: "Find top 5 competitors on G2/Capterra, extract pricing and key features"
- First project should usually be research/discovery; last project should be measurable outcome delivery

Respond ONLY with this JSON (keep descriptions concise, under 25 words):
{
  "projects": [
    {
      "id": "p1",
      "name": "Short milestone name (2-4 words)",
      "description": "What this phase accomplishes and the concrete deliverable",
      "dependencies": [],
      "tasks": [
        {
          "id": "p1-t1",
          "description": "Specific action: tool/website to use + what to do + output format",
          "success_criteria": "Concrete, measurable completion signal",
          "tools_needed": ["tool-name-or-url"]
        }
      ]
    }
  ]
}`

  try {
    const { response } = await createNonStreamingMessageWithFallback({
      model: getPlanGenerationModel(),
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    })

    let text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    // Strip markdown code fences (```json ... ```)
    text = text.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '')

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn('[GoalTree] Failed to parse LLM response, using fallback')
      return createFallbackGoalTree(goalDescription)
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      projects?: Array<{
        id?: string
        name?: string
        description?: string
        dependencies?: string[]
        tasks?: Array<{
          id?: string
          description?: string
          success_criteria?: string
          tools_needed?: string[]
        }>
      }>
    }

    const projects: Project[] = (parsed.projects || []).map((p, pi) => ({
      id: p.id || `p${pi + 1}`,
      name: p.name || `Project ${pi + 1}`,
      description: p.description || '',
      dependencies: p.dependencies || [],
      status: 'pending' as const,
      tasks: (p.tasks || []).map((t, ti) => ({
        id: t.id || `p${pi + 1}-t${ti + 1}`,
        description: t.description || '',
        success_criteria: t.success_criteria || 'Verify completion',
        status: 'pending' as const,
        tools_needed: t.tools_needed || [],
      })),
    }))

    if (projects.length === 0) {
      return createFallbackGoalTree(goalDescription)
    }

    const tree: GoalTree = {
      id: generateId(),
      original_goal: goalDescription,
      projects,
      current_project_id: projects[0]?.id || null,
      overall_status: 'executing',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      tool_discoveries: context?.previous_discoveries || {},
    }

    console.log('[GoalTree] Generated goal tree with', projects.length, 'projects,',
      projects.reduce((sum, p) => sum + p.tasks.length, 0), 'total tasks')

    return tree
  } catch (error) {
    console.error('[GoalTree] Failed to generate goal tree:', error)
    return createFallbackGoalTree(goalDescription)
  }
}

function createFallbackGoalTree(goal: string): GoalTree {
  return {
    id: generateId(),
    original_goal: goal,
    projects: [{
      id: 'p1',
      name: 'Execute task',
      description: goal,
      tasks: [{
        id: 'p1-t1',
        description: goal,
        success_criteria: 'Task is accomplished',
        status: 'pending',
      }],
      dependencies: [],
      status: 'pending',
    }],
    current_project_id: 'p1',
    overall_status: 'executing',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    tool_discoveries: {},
  }
}

// ============================================================
// Tool Discovery
// ============================================================

/**
 * Discover the best web tools for a project by searching the web.
 * Returns tool URLs keyed by category.
 */
export async function discoverToolsForProject(
  project: Project
): Promise<string[]> {
  const toolsNeeded = new Set<string>()
  for (const task of project.tasks) {
    for (const tool of (task.tools_needed || [])) {
      toolsNeeded.add(tool)
    }
  }

  if (toolsNeeded.size === 0) {
    // Infer from project description
    const query = `best free online tool for: ${project.description.slice(0, 100)}`
    try {
      const results = await performWebSearch(query, { maxResults: 3 })
      return results.map(r => r.url).slice(0, 3)
    } catch {
      return []
    }
  }

  return Array.from(toolsNeeded)
}

// ============================================================
// Project Management
// ============================================================

/**
 * Get the current executable project from a goal tree.
 * Respects dependencies — only returns a project whose deps are all completed.
 */
export function getCurrentProject(tree: GoalTree): Project | null {
  if (tree.current_project_id) {
    const current = tree.projects.find(p => p.id === tree.current_project_id)
    if (current && (current.status === 'pending' || current.status === 'in_progress')) {
      return current
    }
  }

  // Find next executable project (all deps completed)
  for (const project of tree.projects) {
    if (project.status !== 'pending') continue
    const depsCompleted = project.dependencies.every(depId =>
      tree.projects.find(p => p.id === depId)?.status === 'completed'
    )
    if (depsCompleted) return project
  }

  return null
}

/**
 * Mark a project as started.
 */
export function startProject(tree: GoalTree, projectId: string): GoalTree {
  const project = tree.projects.find(p => p.id === projectId)
  if (project) {
    project.status = 'in_progress'
    project.started_at = new Date().toISOString()
    tree.current_project_id = projectId
    // Start the first task
    const firstTask = project.tasks.find(t => t.status === 'pending')
    if (firstTask) firstTask.status = 'in_progress'
  }
  tree.updated_at = new Date().toISOString()
  return tree
}

/**
 * Mark current project as completed and advance to next.
 */
export function advanceToNextProject(tree: GoalTree, handoffNote?: string): GoalTree {
  const current = tree.projects.find(p => p.id === tree.current_project_id)
  if (current) {
    current.status = 'completed'
    current.completed_at = new Date().toISOString()
    if (handoffNote) current.session_handoff = handoffNote
  }

  // Find next project
  const next = getCurrentProject({ ...tree, current_project_id: null })
  if (next) {
    tree.current_project_id = next.id
  } else {
    tree.current_project_id = null
    const allDone = tree.projects.every(p => p.status === 'completed' || p.status === 'failed' || p.status === 'skipped')
    if (allDone) tree.overall_status = 'completed'
  }

  tree.updated_at = new Date().toISOString()
  return tree
}

/**
 * Mark current project as failed.
 */
export function markProjectFailed(tree: GoalTree, reason: string): GoalTree {
  const current = tree.projects.find(p => p.id === tree.current_project_id)
  if (current) {
    current.status = 'failed'
    current.failure_reason = reason
    current.completed_at = new Date().toISOString()
  }
  tree.updated_at = new Date().toISOString()
  return tree
}

/**
 * Advance to the next task within the current project.
 */
export function advanceProjectTask(tree: GoalTree): { tree: GoalTree; projectCompleted: boolean } {
  const project = tree.projects.find(p => p.id === tree.current_project_id)
  if (!project) return { tree, projectCompleted: false }

  // Mark current task as completed
  const currentTask = project.tasks.find(t => t.status === 'in_progress')
  if (currentTask) {
    currentTask.status = 'completed'
  }

  // Find next pending task
  const nextTask = project.tasks.find(t => t.status === 'pending')
  if (nextTask) {
    nextTask.status = 'in_progress'
    tree.updated_at = new Date().toISOString()
    return { tree, projectCompleted: false }
  }

  // All tasks done — project is complete
  return { tree, projectCompleted: true }
}

/**
 * Convert the current project into a TaskPlan for the existing single-session system.
 * This bridges the hierarchical system with the existing subgoal execution.
 */
export function projectToTaskPlan(project: Project, maxSteps: number): TaskPlan {
  const subgoals: Subgoal[] = project.tasks.map(task => ({
    id: task.id,
    description: task.description + (task.tools_needed?.length ? ` (use: ${task.tools_needed.join(', ')})` : ''),
    success_criteria: task.success_criteria,
    estimated_steps: 10,
    status: task.status === 'in_progress' ? 'in_progress' as const : task.status === 'completed' ? 'completed' as const : task.status === 'failed' ? 'failed' as const : 'pending' as const,
    dependencies: [],
  }))

  const currentTask = project.tasks.find(t => t.status === 'in_progress') || project.tasks.find(t => t.status === 'pending')

  return {
    task_id: project.id,
    original_task: project.description,
    subgoals,
    current_subgoal_id: currentTask?.id || null,
    created_at: project.started_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    overall_status: 'executing',
    total_steps_taken: 0,
    max_steps_allowed: maxSteps,
  }
}

// ============================================================
// Session Handoff
// ============================================================

/**
 * Generate a handoff note summarizing what was accomplished and what's next.
 */
export async function generateSessionHandoff(
  tree: GoalTree,
  accomplishments: string[],
  blockers: string[]
): Promise<string> {
  const currentProject = tree.projects.find(p => p.id === tree.current_project_id)
  const completedProjects = tree.projects.filter(p => p.status === 'completed')
  const pendingProjects = tree.projects.filter(p => p.status === 'pending')

  const lines: string[] = [
    `## Session Handoff — ${new Date().toISOString().split('T')[0]}`,
    '',
    `**Goal:** ${tree.original_goal}`,
    '',
    `**Progress:** ${completedProjects.length}/${tree.projects.length} projects completed`,
    '',
  ]

  if (accomplishments.length > 0) {
    lines.push('**Accomplished this session:**')
    for (const a of accomplishments) lines.push(`- ${a}`)
    lines.push('')
  }

  if (blockers.length > 0) {
    lines.push('**Blockers encountered:**')
    for (const b of blockers) lines.push(`- ${b}`)
    lines.push('')
  }

  if (currentProject) {
    const doneTasks = currentProject.tasks.filter(t => t.status === 'completed').length
    lines.push(`**Current project:** ${currentProject.name} (${doneTasks}/${currentProject.tasks.length} tasks done)`)
    const nextTask = currentProject.tasks.find(t => t.status === 'pending' || t.status === 'in_progress')
    if (nextTask) {
      lines.push(`**Next task:** ${nextTask.description}`)
    }
    lines.push('')
  }

  if (pendingProjects.length > 0) {
    lines.push('**Upcoming projects:**')
    for (const p of pendingProjects.slice(0, 3)) {
      lines.push(`- ${p.name}: ${p.description.slice(0, 100)}`)
    }
    lines.push('')
  }

  if (Object.keys(tree.tool_discoveries).length > 0) {
    lines.push('**Tools discovered:**')
    for (const [category, tool] of Object.entries(tree.tool_discoveries)) {
      lines.push(`- ${category}: ${tool}`)
    }
  }

  return lines.join('\n')
}

// ============================================================
// Serialization (for persistence in workspace memory)
// ============================================================

export function serializeGoalTree(tree: GoalTree): string {
  return JSON.stringify(tree)
}

export function deserializeGoalTree(json: string): GoalTree | null {
  try {
    const parsed = JSON.parse(json) as GoalTree
    if (!parsed.id || !parsed.projects || !Array.isArray(parsed.projects)) return null
    return parsed
  } catch {
    return null
  }
}

// ============================================================
// Prompt Formatting
// ============================================================

/**
 * Format the goal tree for injection into the agent's prompt.
 * Shows the big picture and highlights the current project/task.
 */
export function formatGoalTreeForPrompt(tree: GoalTree): string {
  const lines: string[] = [
    '## Multi-Session Goal Plan',
    '',
    `**Overall Goal:** ${tree.original_goal}`,
    '',
    '**Projects:**',
  ]

  for (const project of tree.projects) {
    const statusIcon = {
      pending: '○',
      in_progress: '▶',
      completed: '✓',
      failed: '✗',
      skipped: '⊘',
    }[project.status]

    const isCurrent = project.id === tree.current_project_id
    const label = isCurrent ? `**${statusIcon} ${project.name}** ← THIS SESSION` : `${statusIcon} ${project.name}`
    lines.push(label)

    if (isCurrent) {
      for (const task of project.tasks) {
        const taskIcon = {
          pending: '  ○',
          in_progress: '  **▶**',
          completed: '  ✓',
          failed: '  ✗',
          skipped: '  ⊘',
        }[task.status]
        const toolHint = task.tools_needed?.length ? ` → use ${task.tools_needed.join(', ')}` : ''
        lines.push(`${taskIcon} ${task.description}${toolHint}`)
      }
    }

    if (project.session_handoff && !isCurrent) {
      lines.push(`  _Handoff: ${project.session_handoff.slice(0, 100)}_`)
    }
  }

  if (tree.handoff_note) {
    lines.push('')
    lines.push('**Previous Session Notes:**')
    lines.push(tree.handoff_note.slice(0, 500))
  }

  const currentProject = tree.projects.find(p => p.id === tree.current_project_id)
  if (currentProject) {
    const currentTask = currentProject.tasks.find(t => t.status === 'in_progress' || t.status === 'pending')
    if (currentTask) {
      lines.push('')
      lines.push(`**YOUR CURRENT FOCUS:** ${currentTask.description}`)
      lines.push(`**SUCCESS CRITERIA:** ${currentTask.success_criteria}`)
      if (currentTask.tools_needed?.length) {
        lines.push(`**USE THESE TOOLS:** ${currentTask.tools_needed.join(', ')}`)
      }
    }
  }

  lines.push('')
  lines.push('When you finish the current task, move to the next one. When all tasks in this project are done, call task_complete with a summary of what was accomplished.')

  return lines.join('\n')
}

/**
 * Build enhanced planning instructions for multi-session goals.
 */
export function buildGoalTreeInstructions(): string {
  return `
## Multi-Session Goal Execution Protocol

You are working on a large goal that spans multiple sessions.
Each session focuses on ONE project from the goal tree.

RULES:
1. **Focus on the current project only** — don't try to do everything in one session
2. **Use existing web tools** — navigate to websites, sign up, and use them via the browser
3. **Discover tools dynamically** — if you need a tool, search the web for the best one
4. **Store credentials** — when you create accounts, use the remember tool to save login info
5. **Report progress** — use report_insight for each major milestone
6. **Complete the project** — when all tasks in the current project are done, call task_complete
7. **Write handoff notes** — include what you accomplished and what the next session should do

TOOL DISCOVERY:
- For coding tasks: try lovable.dev, bolt.new, replit.com, v0.dev
- For payments: stripe.com dashboard, paypal.com
- For domains: namecheap.com, cloudflare.com
- For design: canva.com, figma.com
- For marketing: producthunt.com, twitter.com, reddit.com
- For documents: docs.google.com, notion.so
- If unsure, use web_search to find the best tool for the job
`
}
