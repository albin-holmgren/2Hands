/**
 * Pre-Execution Research System
 * 
 * Before executing a task, the agent researches the tools/services involved
 * to become an "expert" using internet knowledge.
 * 
 * This knowledge is cached and reused across executions.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createNonStreamingMessageWithFallback, DEFAULT_MODEL, DEFAULT_FALLBACK_MODELS } from '@/lib/ai/ai-client'

export interface ToolKnowledge {
  tool_name: string
  tool_category: string
  overview: string
  key_features: string[]
  common_workflows: Workflow[]
  best_practices: string[]
  common_errors: ErrorSolution[]
  ui_patterns: UIPatterns
  research_depth: 'basic' | 'moderate' | 'expert'
}

export interface Workflow {
  name: string
  description: string
  steps: string[]
  tips: string[]
}

export interface ErrorSolution {
  error: string
  solution: string
  prevention: string
}

export interface UIPatterns {
  navigation?: string[]
  button_labels?: string[]
  form_patterns?: string[]
  confirmation_texts?: string[]
}

export interface ResearchResult {
  task_description: string
  detected_tools: string[]
  tool_knowledge: Record<string, ToolKnowledge>
  research_summary: string
  recommended_approach: string
  potential_challenges: string[]
  backup_strategies: string[]
}

/**
 * Detect tools/services mentioned in a task description
 */
export function detectToolsInTask(taskDescription: string): string[] {
  const lower = taskDescription.toLowerCase()
  const detected: string[] = []
  
  const toolPatterns: Record<string, string[]> = {
    gmail: ['gmail', 'google mail', 'send email via google'],
    outlook: ['outlook', 'hotmail', 'microsoft mail'],
    linkedin: ['linkedin', 'professional network'],
    twitter: ['twitter', 'tweet', 'x.com'],
    instagram: ['instagram', 'insta', 'ig post'],
    facebook: ['facebook', 'fb', 'meta'],
    notion: ['notion', 'notion.so'],
    slack: ['slack', 'slack message', 'slack channel'],
    discord: ['discord', 'discord server'],
    github: ['github', 'git repo', 'repository'],
    shopify: ['shopify', 'shopify store', 'shopify admin'],
    stripe: ['stripe', 'stripe dashboard', 'payment'],
    'google-sheets': ['google sheets', 'spreadsheet', 'google spreadsheet'],
    'google-docs': ['google docs', 'google document'],
    'google-drive': ['google drive', 'gdrive'],
    'google-calendar': ['google calendar', 'gcal', 'calendar event'],
    trello: ['trello', 'trello board'],
    asana: ['asana', 'asana task'],
    jira: ['jira', 'jira ticket', 'jira issue'],
    hubspot: ['hubspot', 'hubspot crm'],
    salesforce: ['salesforce', 'sfdc'],
    quickbooks: ['quickbooks', 'qb', 'quickbooks online'],
    zoom: ['zoom', 'zoom meeting', 'video call'],
  }
  
  for (const [tool, patterns] of Object.entries(toolPatterns)) {
    if (patterns.some(p => lower.includes(p))) {
      detected.push(tool)
    }
  }
  
  // Detect generic web tasks
  if (lower.includes('website') || lower.includes('web page') || lower.includes('browse')) {
    detected.push('web-browser')
  }
  
  return [...new Set(detected)]
}

/**
 * Get tool category
 */
function getToolCategory(tool: string): string {
  const categories: Record<string, string> = {
    gmail: 'email',
    outlook: 'email',
    linkedin: 'social',
    twitter: 'social',
    instagram: 'social',
    facebook: 'social',
    notion: 'productivity',
    slack: 'communication',
    discord: 'communication',
    github: 'development',
    shopify: 'ecommerce',
    stripe: 'finance',
    'google-sheets': 'productivity',
    'google-docs': 'productivity',
    'google-drive': 'storage',
    'google-calendar': 'productivity',
    trello: 'project-management',
    asana: 'project-management',
    jira: 'project-management',
    hubspot: 'crm',
    salesforce: 'crm',
    quickbooks: 'finance',
    zoom: 'communication',
    'web-browser': 'general',
  }
  return categories[tool] || 'general'
}

/**
 * Get cached tool knowledge from database
 */
export async function getCachedToolKnowledge(
  userId: string,
  toolName: string
): Promise<ToolKnowledge | null> {
  const supabase = createAdminClient()
  
  const { data } = await supabase
    .from('tool_knowledge_base')
    .select('*')
    .eq('user_id', userId)
    .eq('tool_name', toolName)
    .single()
  
  if (!data) return null
  
  // Check if knowledge is stale (older than 30 days)
  const typedData = data as {
    last_researched_at: string
    tool_name: string
    tool_category: string
    overview: string
    key_features: string[]
    common_workflows: Workflow[]
    best_practices: string[]
    common_errors: ErrorSolution[]
    ui_patterns: UIPatterns
    research_depth: 'basic' | 'moderate' | 'expert'
  }
  
  const lastResearched = new Date(typedData.last_researched_at)
  const daysSinceResearch = (Date.now() - lastResearched.getTime()) / (1000 * 60 * 60 * 24)
  
  if (daysSinceResearch > 30) {
    return null // Trigger refresh
  }
  
  return {
    tool_name: typedData.tool_name,
    tool_category: typedData.tool_category,
    overview: typedData.overview,
    key_features: typedData.key_features || [],
    common_workflows: typedData.common_workflows || [],
    best_practices: typedData.best_practices || [],
    common_errors: typedData.common_errors || [],
    ui_patterns: typedData.ui_patterns || {},
    research_depth: typedData.research_depth,
  }
}

/**
 * Research a tool using LLM (simulating web research)
 */
export async function researchTool(
  toolName: string,
  depth: 'basic' | 'moderate' | 'expert' = 'moderate'
): Promise<ToolKnowledge> {
  const category = getToolCategory(toolName)
  
  const depthInstructions = {
    basic: 'Provide a brief overview with key features.',
    moderate: 'Provide comprehensive knowledge including workflows, best practices, and common errors.',
    expert: 'Provide deep expertise including UI patterns, edge cases, advanced workflows, and troubleshooting.',
  }
  
  const { response } = await createNonStreamingMessageWithFallback({
    model: DEFAULT_MODEL,
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `You are an expert on ${toolName}. ${depthInstructions[depth]}

Provide your knowledge in this JSON format:
{
  "overview": "Brief description of what ${toolName} is",
  "key_features": ["feature1", "feature2", ...],
  "common_workflows": [
    {
      "name": "workflow name",
      "description": "what it achieves",
      "steps": ["step1", "step2", ...],
      "tips": ["tip1", "tip2"]
    }
  ],
  "best_practices": ["practice1", "practice2", ...],
  "common_errors": [
    {
      "error": "error description",
      "solution": "how to fix",
      "prevention": "how to prevent"
    }
  ],
  "ui_patterns": {
    "navigation": ["how to navigate the UI"],
    "button_labels": ["common button names to look for"],
    "form_patterns": ["common form field labels"],
    "confirmation_texts": ["texts that confirm success"]
  }
}

Focus on practical knowledge for browser automation. Be specific about button names, URLs, and UI elements.`
    }],
  })
  
  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')
  
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        tool_name: toolName,
        tool_category: category,
        overview: parsed.overview || '',
        key_features: parsed.key_features || [],
        common_workflows: parsed.common_workflows || [],
        best_practices: parsed.best_practices || [],
        common_errors: parsed.common_errors || [],
        ui_patterns: parsed.ui_patterns || {},
        research_depth: depth,
      }
    }
  } catch (error) {
    console.error('[PreExecutionResearch] Failed to parse research:', error)
  }
  
  // Fallback
  return {
    tool_name: toolName,
    tool_category: category,
    overview: `${toolName} is a ${category} tool`,
    key_features: [],
    common_workflows: [],
    best_practices: [],
    common_errors: [],
    ui_patterns: {},
    research_depth: 'basic',
  }
}

/**
 * Save tool knowledge to database
 */
async function saveToolKnowledge(
  userId: string,
  knowledge: ToolKnowledge
): Promise<void> {
  const supabase = createAdminClient()
  
  await supabase
    .from('tool_knowledge_base')
    .upsert({
      user_id: userId,
      tool_name: knowledge.tool_name,
      tool_category: knowledge.tool_category,
      overview: knowledge.overview,
      key_features: knowledge.key_features,
      common_workflows: knowledge.common_workflows,
      best_practices: knowledge.best_practices,
      common_errors: knowledge.common_errors,
      ui_patterns: knowledge.ui_patterns,
      research_depth: knowledge.research_depth,
      last_researched_at: new Date().toISOString(),
    } as never, {
      onConflict: 'user_id,tool_name',
    })
}

/**
 * Perform comprehensive pre-execution research
 */
export async function performPreExecutionResearch(
  userId: string,
  agentId: string,
  taskDescription: string,
  options: {
    depth?: 'basic' | 'moderate' | 'expert'
    forceRefresh?: boolean
  } = {}
): Promise<ResearchResult> {
  const startTime = Date.now()
  const depth = options.depth || 'moderate'
  const detectedTools = detectToolsInTask(taskDescription)
  
  console.log('[PreExecutionResearch] Detected tools:', detectedTools)
  
  // Research each tool
  const toolKnowledge: Record<string, ToolKnowledge> = {}
  
  for (const tool of detectedTools) {
    // Check cache first
    if (!options.forceRefresh) {
      const cached = await getCachedToolKnowledge(userId, tool)
      if (cached) {
        console.log(`[PreExecutionResearch] Using cached knowledge for ${tool}`)
        toolKnowledge[tool] = cached
        continue
      }
    }
    
    // Research the tool
    console.log(`[PreExecutionResearch] Researching ${tool}...`)
    const knowledge = await researchTool(tool, depth)
    toolKnowledge[tool] = knowledge
    
    // Save to cache
    await saveToolKnowledge(userId, knowledge)
  }
  
  // Generate task-specific recommendations
  const recommendations = await generateTaskRecommendations(
    taskDescription,
    toolKnowledge
  )
  
  // Save research result
  const supabase = createAdminClient()
  await supabase.from('pre_execution_research').insert({
    agent_id: agentId,
    user_id: userId,
    task_description: taskDescription,
    detected_tools: detectedTools,
    detected_services: detectedTools,
    research_summary: recommendations.summary,
    tool_specific_tips: Object.fromEntries(
      Object.entries(toolKnowledge).map(([tool, k]) => [tool, k.best_practices])
    ),
    potential_challenges: recommendations.challenges,
    recommended_approach: recommendations.approach,
    backup_strategies: recommendations.backupStrategies,
    sources_consulted: [],
    research_duration_ms: Date.now() - startTime,
  } as never)
  
  return {
    task_description: taskDescription,
    detected_tools: detectedTools,
    tool_knowledge: toolKnowledge,
    research_summary: recommendations.summary,
    recommended_approach: recommendations.approach,
    potential_challenges: recommendations.challenges,
    backup_strategies: recommendations.backupStrategies,
  }
}

/**
 * Generate task-specific recommendations from tool knowledge
 */
async function generateTaskRecommendations(
  taskDescription: string,
  toolKnowledge: Record<string, ToolKnowledge>
): Promise<{
  summary: string
  approach: string
  challenges: string[]
  backupStrategies: string[]
}> {
  const toolSummaries = Object.entries(toolKnowledge)
    .map(([tool, k]) => `${tool}: ${k.overview}\nBest practices: ${k.best_practices.slice(0, 3).join(', ')}`)
    .join('\n\n')
  
  const { response } = await createNonStreamingMessageWithFallback({
    model: DEFAULT_MODEL,
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `Given this task and tool knowledge, provide execution recommendations.

TASK: ${taskDescription}

TOOL KNOWLEDGE:
${toolSummaries}

Respond in JSON:
{
  "summary": "Brief summary of research findings",
  "approach": "Recommended step-by-step approach",
  "challenges": ["potential challenge 1", "challenge 2"],
  "backup_strategies": ["if X fails, try Y", "alternative approach"]
}`
    }],
  })
  
  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')
  
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        summary: parsed.summary || '',
        approach: parsed.approach || '',
        challenges: parsed.challenges || [],
        backupStrategies: parsed.backup_strategies || [],
      }
    }
  } catch (error) {
    console.error('[PreExecutionResearch] Failed to parse recommendations:', error)
  }
  
  return {
    summary: 'Research completed for detected tools.',
    approach: 'Follow standard workflows for each tool.',
    challenges: [],
    backupStrategies: [],
  }
}

/**
 * Format research results for agent prompt
 */
export async function formatResearchForPrompt(
  research: ResearchResult
): Promise<string> {
  let output = '\n## Pre-Execution Research\n\n'
  output += `*Researched ${research.detected_tools.length} tool(s): ${research.detected_tools.join(', ')}*\n\n`
  
  output += `### Summary\n${research.research_summary}\n\n`
  output += `### Recommended Approach\n${research.recommended_approach}\n\n`
  
  if (research.potential_challenges.length > 0) {
    output += '### Potential Challenges\n'
    for (const challenge of research.potential_challenges) {
      output += `⚠ ${challenge}\n`
    }
    output += '\n'
  }
  
  if (research.backup_strategies.length > 0) {
    output += '### Backup Strategies\n'
    for (const strategy of research.backup_strategies) {
      output += `↩ ${strategy}\n`
    }
    output += '\n'
  }
  
  // Add tool-specific knowledge
  for (const [tool, knowledge] of Object.entries(research.tool_knowledge)) {
    output += `### ${tool.toUpperCase()} Tips\n`
    
    if (knowledge.best_practices.length > 0) {
      output += 'Best practices:\n'
      for (const practice of knowledge.best_practices.slice(0, 3)) {
        output += `✓ ${practice}\n`
      }
    }
    
    if (knowledge.common_errors.length > 0) {
      output += 'Common errors to avoid:\n'
      for (const error of knowledge.common_errors.slice(0, 2)) {
        output += `✗ ${error.error} → ${error.solution}\n`
      }
    }
    
    const buttonLabels = knowledge.ui_patterns?.button_labels
    if (buttonLabels && buttonLabels.length > 0) {
      output += `Look for buttons: ${buttonLabels.slice(0, 5).join(', ')}\n`
    }
    
    const confirmTexts = knowledge.ui_patterns?.confirmation_texts
    if (confirmTexts && confirmTexts.length > 0) {
      output += `Success indicators: ${confirmTexts.slice(0, 3).join(', ')}\n`
    }
    
    output += '\n'
  }
  
  return output
}

/**
 * Quick research check - should we research before this task?
 */
export function shouldPerformResearch(
  taskDescription: string,
  existingKnowledge: number
): boolean {
  const detectedTools = detectToolsInTask(taskDescription)
  
  // Always research if new tools detected
  if (detectedTools.length > existingKnowledge) {
    return true
  }
  
  // Research for complex tasks
  const complexityIndicators = [
    'multiple', 'several', 'complex', 'integrate', 'automate',
    'workflow', 'series of', 'then', 'after that', 'finally'
  ]
  
  const lower = taskDescription.toLowerCase()
  if (complexityIndicators.some(i => lower.includes(i))) {
    return true
  }
  
  return false
}
