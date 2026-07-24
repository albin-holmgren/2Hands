/**
 * Skill Loader — Progressive disclosure for 2Hands Skills
 *
 * Level 1: Metadata (always in system prompt — lightweight)
 * Level 2: Instructions (loaded when skill is triggered)
 * Level 3: Resources (loaded on-demand within skill execution)
 */

import type { AISkill, SkillMetadata, SkillResource } from './skill-registry'
import { getEnabledSkillsAdmin, loadSkillAdmin } from './skill-registry'

/**
 * Level 1: Build the skills metadata section for the system prompt.
 * This is lightweight — only name + description for each enabled skill.
 */
export function buildSkillsSystemPrompt(skills: SkillMetadata[]): string {
  if (skills.length === 0) return ''

  const lines = skills.map(s => `- ${s.name}: ${s.description}`)

  return `

=== INTERNAL CAPABILITIES (invisible to user) ===
You have specialized workflows that make you better at certain tasks. Use them AUTOMATICALLY — never ask the user "should I use the research skill?" Just use it and deliver great results.

Available:
${lines.join('\n')}

HOW TO USE SKILLS:
1. When a user request matches a skill, call run_skill IMMEDIATELY — don't ask permission
2. NEVER say "I'm going to use my deep-research skill" — just do the research and present findings
3. You may say brief natural phrases like "Let me dig into that..." or "Researching this now..." to show you're working
4. The user should experience RESULTS, not process. They should think "wow, this AI is really good at research" — not "oh, it used a skill"
5. If multiple skills match, use the most relevant one. Don't mention you're choosing between skills.
6. After getting skill instructions, follow them precisely but present output in a natural, conversational way — not as a rigid template

THE USER EXPERIENCE:
- User asks → AI immediately starts working (using skills behind the scenes)
- User sees brief activity indicators ("Researching competitors...", "Analyzing your data...")
- User gets polished, structured results that feel effortless
- User thinks: "This AI just gets things done"
`
}

/**
 * Build the dynamic run_skill tool definition based on enabled skills.
 */
export function buildRunSkillTool(skills: SkillMetadata[]): {
  name: string
  description: string
  input_schema: Record<string, unknown>
} | null {
  if (skills.length === 0) return null

  const modelSkills = skills.filter(s => s.model_invocable)
  if (modelSkills.length === 0) return null

  const skillList = modelSkills.map(s => `${s.name}: ${s.description}`).join('\n')

  return {
    name: 'run_skill',
    description: `Load a specialized internal workflow to handle the user's request with higher quality. Call this AUTOMATICALLY whenever you detect the task matches one of your capabilities — do NOT ask permission. The user will not see that you called this tool; they will only see your polished response.

Capabilities:
${skillList}

ALWAYS use this for tasks matching the above. Prefer this over ad-hoc answers.`,
    input_schema: {
      type: 'object',
      properties: {
        skill_name: {
          type: 'string',
          enum: modelSkills.map(s => s.name),
          description: 'Name of the skill to execute',
        },
        arguments: {
          type: 'string',
          description: 'What the user wants the skill to accomplish',
        },
        context: {
          type: 'string',
          description: 'Optional additional context for the skill execution',
        },
      },
      required: ['skill_name', 'arguments'],
    },
  }
}

/**
 * Level 2: Load full skill instructions for execution.
 * Returns the complete skill with instructions injected.
 */
export async function loadSkillForExecution(
  skillName: string,
  workspaceId: string
): Promise<AISkill | null> {
  return loadSkillAdmin(skillName, workspaceId)
}

/**
 * Build the execution prompt by combining skill instructions with user request.
 */
export function buildSkillExecutionPrompt(
  skill: AISkill,
  userArguments: string,
  additionalContext?: string
): string {
  let prompt = `[Internal: using ${skill.name} workflow]

${skill.instructions}

=== TASK ===
${userArguments}`

  if (additionalContext) {
    prompt += `\n\n=== ADDITIONAL CONTEXT ===\n${additionalContext}`
  }

  prompt += `\n\n=== EXECUTION GUIDELINES ===
- Follow the skill's workflow step by step
- Use only the tools listed in the skill's allowed tools when specified
- Provide structured output as described in the skill
- If something is unclear, state what you know and what needs clarification

=== MEMORY INTEGRATION ===
After completing the skill:
1. Save key findings/insights to a memory box using manage_memory_box (box category: "knowledge" or "projects")
2. If this is a recurring task (e.g., competitor analysis, weekly report), store the results so future runs can build on them
3. If the user provided preferences or corrections during execution, save those as "preference" memories for next time
This ensures cross-session learning — each skill run gets smarter by building on past results.

=== HONESTY CHECK ===
Before reporting results, verify:
- Did each tool call return success:true? If not, report the failure honestly.
- Are all data points from actual tool results, not fabricated?
- If a step was skipped or failed, say so explicitly.`

  return prompt
}

/**
 * Level 3: Resolve resource placeholders in skill instructions.
 * Replaces {{resources.name}} with actual resource content.
 */
export function resolveSkillResources(
  instructions: string,
  resources: SkillResource[]
): string {
  let resolved = instructions
  for (const resource of resources) {
    const placeholder = `{{resources.${resource.name}}}`
    resolved = resolved.replace(placeholder, resource.content)
  }
  return resolved
}

/**
 * Get a specific resource from a skill by name.
 */
export function getSkillResource(
  skill: AISkill,
  resourceName: string
): SkillResource | null {
  return skill.resources.find(r => r.name === resourceName) ?? null
}
