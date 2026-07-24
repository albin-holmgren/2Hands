/**
 * Skill Executor — Runs skills within the chat context
 *
 * Handles the execution lifecycle:
 * 1. Load skill instructions (Level 2)
 * 2. Resolve resources (Level 3)
 * 3. Build execution prompt
 * 4. Track run in DB
 */

import {
  loadSkillAdmin,
  recordSkillRunAdmin,
  completeSkillRunAdmin,
  incrementSkillUsageAdmin,
  type AISkill,
} from './skill-registry'
import {
  buildSkillExecutionPrompt,
  resolveSkillResources,
} from './skill-loader'

export interface SkillExecutionRequest {
  skillName: string
  arguments: string
  context?: string
  userId: string
  workspaceId: string
  conversationId?: string
  triggerType: 'user' | 'model' | 'scheduled' | 'chained'
}

export interface SkillExecutionResult {
  success: boolean
  skillId: string
  runId: string | null
  executionPrompt: string | null
  allowedTools: string[]
  error?: string
}

/**
 * Prepare a skill for execution.
 * Returns the execution prompt and allowed tools.
 * The actual AI call is done by the chat route handler.
 */
export async function prepareSkillExecution(
  request: SkillExecutionRequest
): Promise<SkillExecutionResult> {
  const startTime = Date.now()

  // Level 2: Load full skill
  const skill = await loadSkillAdmin(request.skillName, request.workspaceId)
  if (!skill) {
    return {
      success: false,
      skillId: '',
      runId: null,
      executionPrompt: null,
      allowedTools: [],
      error: `Skill "${request.skillName}" not found or disabled`,
    }
  }

  // Level 3: Resolve resource placeholders
  let instructions = skill.instructions
  if (skill.resources.length > 0) {
    instructions = resolveSkillResources(instructions, skill.resources)
  }

  // Build the execution prompt
  const enrichedSkill = { ...skill, instructions }
  const executionPrompt = buildSkillExecutionPrompt(
    enrichedSkill,
    request.arguments,
    request.context
  )

  // Record skill run
  const runId = await recordSkillRunAdmin({
    skill_id: skill.id,
    conversation_id: request.conversationId,
    user_id: request.userId,
    workspace_id: request.workspaceId,
    trigger_type: request.triggerType,
    arguments: request.arguments,
  })

  // Increment usage counter
  await incrementSkillUsageAdmin(skill.id)

  return {
    success: true,
    skillId: skill.id,
    runId,
    executionPrompt,
    allowedTools: skill.allowed_tools as string[],
  }
}

/**
 * Mark a skill run as completed.
 */
export async function finalizeSkillRun(
  runId: string,
  result: {
    success: boolean
    output?: string
    error?: string
    tokensInput?: number
    tokensOutput?: number
    durationMs?: number
  }
): Promise<void> {
  await completeSkillRunAdmin(runId, {
    status: result.success ? 'completed' : 'failed',
    output: result.output,
    error_message: result.error,
    tokens_input: result.tokensInput,
    tokens_output: result.tokensOutput,
    duration_ms: result.durationMs,
  })
}
