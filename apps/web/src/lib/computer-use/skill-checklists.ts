/**
 * Skill Checklists
 * 
 * Domain-specific invariants and verification rules for each skill.
 * These ensure agents complete tasks correctly and don't miss critical steps.
 */

import { PageState } from './semantic-browser-tools'

export interface SkillChecklist {
  skill: string
  preconditions: ChecklistItem[]
  invariants: ChecklistItem[]
  postconditions: ChecklistItem[]
  recovery_hints: Record<string, string>
}

export interface ChecklistItem {
  id: string
  description: string
  check_type: 'page_state' | 'url_pattern' | 'text_present' | 'text_absent' | 'form_filled' | 'custom'
  check_value: string | RegExp | ((state: PageState) => boolean)
  required: boolean
  error_message: string
}

export interface ChecklistResult {
  passed: boolean
  failed_items: {
    item: ChecklistItem
    actual_value?: string
  }[]
  warnings: string[]
}

/**
 * Skill checklists registry
 */
const SKILL_CHECKLISTS: Record<string, SkillChecklist> = {
  gmail: {
    skill: 'gmail',
    preconditions: [
      {
        id: 'gmail_logged_in',
        description: 'User is logged into Gmail',
        check_type: 'url_pattern',
        check_value: /mail\.google\.com/,
        required: true,
        error_message: 'Not on Gmail - need to navigate or log in',
      },
      {
        id: 'gmail_no_captcha',
        description: 'No CAPTCHA blocking access',
        check_type: 'custom',
        check_value: (state) => !state.captcha_detected,
        required: true,
        error_message: 'CAPTCHA detected - need human intervention',
      },
    ],
    invariants: [
      {
        id: 'gmail_compose_open',
        description: 'Compose window is open when drafting',
        check_type: 'text_present',
        check_value: 'New Message',
        required: false,
        error_message: 'Compose window not detected',
      },
    ],
    postconditions: [
      {
        id: 'gmail_sent_confirmation',
        description: 'Email was sent successfully',
        check_type: 'text_present',
        check_value: 'Message sent',
        required: true,
        error_message: 'No sent confirmation - email may not have been sent',
      },
    ],
    recovery_hints: {
      'gmail_logged_in': 'Navigate to mail.google.com and complete login flow',
      'gmail_no_captcha': 'Cannot proceed automatically - escalate to user',
      'gmail_sent_confirmation': 'Check Sent folder to verify, or retry sending',
    },
  },

  outlook: {
    skill: 'outlook',
    preconditions: [
      {
        id: 'outlook_logged_in',
        description: 'User is logged into Outlook',
        check_type: 'url_pattern',
        check_value: /outlook\.(live|office)\.com/,
        required: true,
        error_message: 'Not on Outlook - need to navigate or log in',
      },
    ],
    invariants: [],
    postconditions: [
      {
        id: 'outlook_sent_confirmation',
        description: 'Email was sent successfully',
        check_type: 'text_present',
        check_value: 'sent',
        required: true,
        error_message: 'No sent confirmation detected',
      },
    ],
    recovery_hints: {
      'outlook_logged_in': 'Navigate to outlook.com and complete login flow',
    },
  },

  linkedin: {
    skill: 'linkedin',
    preconditions: [
      {
        id: 'linkedin_logged_in',
        description: 'User is logged into LinkedIn',
        check_type: 'url_pattern',
        check_value: /linkedin\.com/,
        required: true,
        error_message: 'Not on LinkedIn',
      },
      {
        id: 'linkedin_session_valid',
        description: 'Session is valid (not showing login)',
        check_type: 'custom',
        check_value: (state) => !state.login_detected,
        required: true,
        error_message: 'LinkedIn session expired - need to log in again',
      },
    ],
    invariants: [
      {
        id: 'linkedin_rate_limit',
        description: 'Not rate limited',
        check_type: 'text_absent',
        check_value: 'rate limit',
        required: true,
        error_message: 'LinkedIn rate limit detected - wait before continuing',
      },
    ],
    postconditions: [],
    recovery_hints: {
      'linkedin_logged_in': 'Navigate to linkedin.com and log in with saved credentials',
      'linkedin_rate_limit': 'Wait 15-30 minutes before retrying',
    },
  },

  notion: {
    skill: 'notion',
    preconditions: [
      {
        id: 'notion_logged_in',
        description: 'User is logged into Notion',
        check_type: 'url_pattern',
        check_value: /notion\.so/,
        required: true,
        error_message: 'Not on Notion',
      },
    ],
    invariants: [
      {
        id: 'notion_workspace_loaded',
        description: 'Workspace content is loaded',
        check_type: 'custom',
        check_value: (state) => !state.loading,
        required: false,
        error_message: 'Notion is still loading',
      },
    ],
    postconditions: [
      {
        id: 'notion_saved',
        description: 'Changes are saved',
        check_type: 'text_absent',
        check_value: 'Saving...',
        required: true,
        error_message: 'Changes may not be saved yet',
      },
    ],
    recovery_hints: {
      'notion_logged_in': 'Navigate to notion.so and log in',
      'notion_saved': 'Wait for auto-save or manually trigger save',
    },
  },

  slack: {
    skill: 'slack',
    preconditions: [
      {
        id: 'slack_logged_in',
        description: 'User is logged into Slack',
        check_type: 'url_pattern',
        check_value: /app\.slack\.com/,
        required: true,
        error_message: 'Not on Slack',
      },
    ],
    invariants: [
      {
        id: 'slack_workspace_selected',
        description: 'Correct workspace is selected',
        check_type: 'custom',
        check_value: (state) => state.url.includes('/client/'),
        required: true,
        error_message: 'No workspace selected',
      },
    ],
    postconditions: [
      {
        id: 'slack_message_sent',
        description: 'Message was sent',
        check_type: 'custom',
        check_value: (state) => !state.errors.some(e => e.includes('failed')),
        required: true,
        error_message: 'Message may not have been sent',
      },
    ],
    recovery_hints: {
      'slack_workspace_selected': 'Select the correct workspace from sidebar',
    },
  },

  github: {
    skill: 'github',
    preconditions: [
      {
        id: 'github_logged_in',
        description: 'User is logged into GitHub',
        check_type: 'url_pattern',
        check_value: /github\.com/,
        required: true,
        error_message: 'Not on GitHub',
      },
    ],
    invariants: [
      {
        id: 'github_correct_repo',
        description: 'On the correct repository',
        check_type: 'custom',
        check_value: () => true, // Will be validated contextually
        required: false,
        error_message: 'May not be on the correct repository',
      },
    ],
    postconditions: [],
    recovery_hints: {
      'github_logged_in': 'Navigate to github.com and log in',
    },
  },

  'google-sheets': {
    skill: 'google-sheets',
    preconditions: [
      {
        id: 'sheets_logged_in',
        description: 'User is logged into Google',
        check_type: 'url_pattern',
        check_value: /docs\.google\.com\/spreadsheets/,
        required: true,
        error_message: 'Not on Google Sheets',
      },
    ],
    invariants: [],
    postconditions: [
      {
        id: 'sheets_saved',
        description: 'Changes saved to Drive',
        check_type: 'text_present',
        check_value: 'All changes saved',
        required: false,
        error_message: 'Changes may not be saved',
      },
    ],
    recovery_hints: {},
  },

  'web-research': {
    skill: 'web-research',
    preconditions: [],
    invariants: [
      {
        id: 'research_not_blocked',
        description: 'Not blocked by paywall or CAPTCHA',
        check_type: 'custom',
        check_value: (state) => !state.captcha_detected && 
          !state.visible_text.toLowerCase().includes('subscribe to continue'),
        required: false,
        error_message: 'Content may be blocked - try alternative source',
      },
    ],
    postconditions: [],
    recovery_hints: {
      'research_not_blocked': 'Try a different source or use cached version',
    },
  },

  shopify: {
    skill: 'shopify',
    preconditions: [
      {
        id: 'shopify_logged_in',
        description: 'Logged into Shopify admin',
        check_type: 'url_pattern',
        check_value: /admin\.shopify\.com|\.myshopify\.com\/admin/,
        required: true,
        error_message: 'Not in Shopify admin',
      },
    ],
    invariants: [
      {
        id: 'shopify_correct_store',
        description: 'On the correct store',
        check_type: 'custom',
        check_value: () => true, // Contextual
        required: true,
        error_message: 'Verify you are on the correct store',
      },
    ],
    postconditions: [
      {
        id: 'shopify_changes_saved',
        description: 'Changes were saved',
        check_type: 'text_absent',
        check_value: 'unsaved',
        required: true,
        error_message: 'There may be unsaved changes',
      },
    ],
    recovery_hints: {
      'shopify_logged_in': 'Navigate to Shopify admin and log in',
    },
  },

  stripe: {
    skill: 'stripe',
    preconditions: [
      {
        id: 'stripe_logged_in',
        description: 'Logged into Stripe Dashboard',
        check_type: 'url_pattern',
        check_value: /dashboard\.stripe\.com/,
        required: true,
        error_message: 'Not in Stripe Dashboard',
      },
      {
        id: 'stripe_correct_mode',
        description: 'In correct mode (test/live)',
        check_type: 'custom',
        check_value: () => true, // Will check contextually
        required: true,
        error_message: 'Verify test/live mode is correct',
      },
    ],
    invariants: [],
    postconditions: [],
    recovery_hints: {
      'stripe_logged_in': 'Navigate to dashboard.stripe.com and log in',
      'stripe_correct_mode': 'Toggle test/live mode in the dashboard header',
    },
  },
}

/**
 * Get checklist for a skill
 */
export function getSkillChecklist(skill: string): SkillChecklist | null {
  return SKILL_CHECKLISTS[skill] || null
}

/**
 * Run precondition checks for a skill
 */
export function checkPreconditions(
  skill: string,
  pageState: PageState
): ChecklistResult {
  const checklist = SKILL_CHECKLISTS[skill]
  if (!checklist) {
    return { passed: true, failed_items: [], warnings: ['No checklist defined for this skill'] }
  }
  
  return runChecks(checklist.preconditions, pageState)
}

/**
 * Run invariant checks for a skill
 */
export function checkInvariants(
  skill: string,
  pageState: PageState
): ChecklistResult {
  const checklist = SKILL_CHECKLISTS[skill]
  if (!checklist) {
    return { passed: true, failed_items: [], warnings: [] }
  }
  
  return runChecks(checklist.invariants, pageState)
}

/**
 * Run postcondition checks for a skill
 */
export function checkPostconditions(
  skill: string,
  pageState: PageState
): ChecklistResult {
  const checklist = SKILL_CHECKLISTS[skill]
  if (!checklist) {
    return { passed: true, failed_items: [], warnings: [] }
  }
  
  return runChecks(checklist.postconditions, pageState)
}

/**
 * Run a set of checks against page state
 */
function runChecks(items: ChecklistItem[], pageState: PageState): ChecklistResult {
  const failed_items: { item: ChecklistItem; actual_value?: string }[] = []
  const warnings: string[] = []
  
  for (const item of items) {
    const result = evaluateCheck(item, pageState)
    
    if (!result.passed) {
      if (item.required) {
        failed_items.push({ item, actual_value: result.actual_value })
      } else {
        warnings.push(item.error_message)
      }
    }
  }
  
  return {
    passed: failed_items.length === 0,
    failed_items,
    warnings,
  }
}

/**
 * Evaluate a single check
 */
function evaluateCheck(
  item: ChecklistItem,
  pageState: PageState
): { passed: boolean; actual_value?: string } {
  switch (item.check_type) {
    case 'url_pattern': {
      const pattern = item.check_value as RegExp
      const passed = pattern.test(pageState.url)
      return { passed, actual_value: pageState.url }
    }
    
    case 'text_present': {
      const text = item.check_value as string
      const passed = pageState.visible_text.toLowerCase().includes(text.toLowerCase())
      return { passed }
    }
    
    case 'text_absent': {
      const text = item.check_value as string
      const passed = !pageState.visible_text.toLowerCase().includes(text.toLowerCase())
      return { passed }
    }
    
    case 'form_filled': {
      const fieldName = item.check_value as string
      const field = pageState.forms.find(f => 
        f.name === fieldName || f.label === fieldName || f.id === fieldName
      )
      const passed = field ? !!field.value : false
      return { passed, actual_value: field?.value }
    }
    
    case 'page_state': {
      const key = item.check_value as keyof PageState
      const value = pageState[key]
      const passed = !!value
      return { passed, actual_value: String(value) }
    }
    
    case 'custom': {
      const fn = item.check_value as (state: PageState) => boolean
      const passed = fn(pageState)
      return { passed }
    }
    
    default:
      return { passed: true }
  }
}

/**
 * Get recovery hint for a failed check
 */
export function getRecoveryHint(skill: string, checkId: string): string | null {
  const checklist = SKILL_CHECKLISTS[skill]
  if (!checklist) return null
  
  return checklist.recovery_hints[checkId] || null
}

/**
 * Build checklist instructions for agent prompt
 */
export function buildChecklistInstructions(skills: string[]): string {
  const relevantChecklists = skills
    .map(s => SKILL_CHECKLISTS[s])
    .filter(Boolean)
  
  if (relevantChecklists.length === 0) {
    return ''
  }
  
  let instructions = '\n## Task Verification Checklists\n\n'
  
  for (const checklist of relevantChecklists) {
    instructions += `### ${checklist.skill.toUpperCase()}\n`
    
    if (checklist.preconditions.length > 0) {
      instructions += 'Before starting:\n'
      for (const item of checklist.preconditions) {
        const marker = item.required ? '✓' : '○'
        instructions += `  ${marker} ${item.description}\n`
      }
    }
    
    if (checklist.postconditions.length > 0) {
      instructions += 'Before completing:\n'
      for (const item of checklist.postconditions) {
        const marker = item.required ? '✓' : '○'
        instructions += `  ${marker} ${item.description}\n`
      }
    }
    
    instructions += '\n'
  }
  
  return instructions
}

/**
 * Format checklist result for agent context
 */
export function formatChecklistResultForPrompt(
  checkType: 'preconditions' | 'invariants' | 'postconditions',
  result: ChecklistResult
): string {
  if (result.passed && result.warnings.length === 0) {
    return `✓ All ${checkType} passed`
  }
  
  let output = ''
  
  if (result.failed_items.length > 0) {
    output += `❌ Failed ${checkType}:\n`
    for (const { item, actual_value } of result.failed_items) {
      output += `  - ${item.error_message}`
      if (actual_value) {
        output += ` (got: ${actual_value})`
      }
      output += '\n'
    }
  }
  
  if (result.warnings.length > 0) {
    output += `⚠️ Warnings:\n`
    for (const warning of result.warnings) {
      output += `  - ${warning}\n`
    }
  }
  
  return output
}
