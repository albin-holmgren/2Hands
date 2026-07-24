/**
 * @deprecated DORMANT — not wired into any live runtime path.
 *
 * The active execution policy is in:
 *   src/lib/execution/execute-first-policy.ts
 *
 * That module provides classifyExecution() and diagnoseIntegrationError()
 * which are the authoritative runtime decision points for:
 *   - direct_execute vs background_agent vs needs_confirmation
 *   - attempt → diagnose → retry on integration failures
 *
 * This file's assessConfidence() is called only from autonomy-gating.ts
 * which itself is called only by processApprovalResponse() in chat/route.ts
 * (a fire-and-forget that handles the "approve" / "reject" response path).
 * checkApprovalNeeded() is defined here but has no callers in the main run loop.
 *
 * Do NOT add new threshold logic here. Extend execute-first-policy.ts instead.
 */

export interface ConfidenceAssessment {
  overallConfidence: number // 0-1
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  shouldAskApproval: boolean
  reasoning: string
  suggestedAction: 'proceed' | 'ask_approval' | 'abort'
}

export interface ActionContext {
  actionType: string
  description: string
  isReversible: boolean
  affectsExternalSystems: boolean
  involvesFinancialTransaction: boolean
  involvesCommunication: boolean
  isFirstTimeAction: boolean
  previousAttempts: number
  userPreferences: UserAutonomyPreferences
}

export interface UserAutonomyPreferences {
  autonomyLevel: 'conservative' | 'balanced' | 'aggressive'
  alwaysAskFor: string[] // e.g., ['send_email', 'make_purchase']
  neverAskFor: string[] // e.g., ['screenshot', 'scroll']
  maxAutonomousSpend: number // USD
}

// Default preferences for new users
export const DEFAULT_AUTONOMY_PREFERENCES: UserAutonomyPreferences = {
  autonomyLevel: 'balanced',
  alwaysAskFor: [
    'send_email',
    'send_message',
    'make_purchase',
    'delete_data',
    'post_publicly',
    'transfer_money',
    'change_password',
    'grant_access',
  ],
  neverAskFor: [
    'screenshot',
    'scroll',
    'click_navigation',
    'read_content',
    'search',
    'login', // After initial credential approval
  ],
  maxAutonomousSpend: 0, // By default, always ask for any purchase
}

// Risk weights for different action types
const ACTION_RISK_WEIGHTS: Record<string, number> = {
  // Critical risk (always ask)
  transfer_money: 1.0,
  make_purchase: 0.95,
  delete_account: 1.0,
  change_password: 0.9,
  grant_access: 0.85,
  
  // High risk
  send_email: 0.7,
  post_publicly: 0.8,
  delete_data: 0.75,
  send_message: 0.65,
  submit_form: 0.6,
  
  // Medium risk
  edit_document: 0.4,
  update_record: 0.45,
  create_record: 0.35,
  schedule_meeting: 0.5,
  
  // Low risk
  read_content: 0.1,
  search: 0.05,
  navigate: 0.05,
  screenshot: 0.0,
  scroll: 0.0,
  click_navigation: 0.05,
  login: 0.2,
}

/**
 * Assess confidence and determine if approval is needed
 */
export function assessConfidence(context: ActionContext): ConfidenceAssessment {
  const {
    actionType,
    description,
    isReversible,
    affectsExternalSystems,
    involvesFinancialTransaction,
    involvesCommunication,
    isFirstTimeAction,
    previousAttempts,
    userPreferences,
  } = context
  
  // Check explicit user preferences first
  if (userPreferences.alwaysAskFor.includes(actionType)) {
    return {
      overallConfidence: 0.5,
      riskLevel: 'high',
      shouldAskApproval: true,
      reasoning: `User preference: always ask before ${actionType}`,
      suggestedAction: 'ask_approval',
    }
  }
  
  if (userPreferences.neverAskFor.includes(actionType)) {
    return {
      overallConfidence: 1.0,
      riskLevel: 'low',
      shouldAskApproval: false,
      reasoning: `User preference: proceed without asking for ${actionType}`,
      suggestedAction: 'proceed',
    }
  }
  
  // Calculate base risk from action type
  const baseRisk = ACTION_RISK_WEIGHTS[actionType] ?? 0.5
  
  // Adjust risk based on context
  let adjustedRisk = baseRisk
  
  // Irreversible actions are riskier
  if (!isReversible) {
    adjustedRisk = Math.min(1.0, adjustedRisk + 0.2)
  }
  
  // External system effects increase risk
  if (affectsExternalSystems) {
    adjustedRisk = Math.min(1.0, adjustedRisk + 0.15)
  }
  
  // Financial transactions always high risk
  if (involvesFinancialTransaction) {
    adjustedRisk = Math.min(1.0, adjustedRisk + 0.3)
  }
  
  // Communication can have lasting effects
  if (involvesCommunication) {
    adjustedRisk = Math.min(1.0, adjustedRisk + 0.2)
  }
  
  // First time actions slightly riskier
  if (isFirstTimeAction) {
    adjustedRisk = Math.min(1.0, adjustedRisk + 0.1)
  }
  
  // Multiple failed attempts suggest uncertainty
  if (previousAttempts > 0) {
    adjustedRisk = Math.min(1.0, adjustedRisk + (previousAttempts * 0.1))
  }
  
  // Adjust based on user's autonomy level preference
  const autonomyMultiplier = 
    userPreferences.autonomyLevel === 'aggressive' ? 0.7 :
    userPreferences.autonomyLevel === 'conservative' ? 1.3 : 1.0
  
  adjustedRisk = Math.min(1.0, adjustedRisk * autonomyMultiplier)
  
  // Determine risk level
  const riskLevel: ConfidenceAssessment['riskLevel'] = 
    adjustedRisk >= 0.8 ? 'critical' :
    adjustedRisk >= 0.6 ? 'high' :
    adjustedRisk >= 0.3 ? 'medium' : 'low'
  
  // Calculate confidence (inverse of risk, with some noise)
  const confidence = Math.max(0, 1 - adjustedRisk)
  
  // Determine if approval needed
  // Ask for approval if: high/critical risk OR low confidence
  const shouldAskApproval = riskLevel === 'critical' || 
                            riskLevel === 'high' || 
                            confidence < 0.5
  
  return {
    overallConfidence: confidence,
    riskLevel,
    shouldAskApproval,
    reasoning: buildReasoning(context, adjustedRisk, confidence),
    suggestedAction: shouldAskApproval ? 'ask_approval' : 'proceed',
  }
}

function buildReasoning(context: ActionContext, risk: number, confidence: number): string {
  const factors: string[] = []
  
  if (!context.isReversible) factors.push('irreversible action')
  if (context.affectsExternalSystems) factors.push('affects external systems')
  if (context.involvesFinancialTransaction) factors.push('financial transaction')
  if (context.involvesCommunication) factors.push('communication involved')
  if (context.isFirstTimeAction) factors.push('first time performing this')
  if (context.previousAttempts > 0) factors.push(`${context.previousAttempts} previous attempts`)
  
  if (factors.length === 0) {
    return `Low risk action (${context.actionType}), confidence: ${(confidence * 100).toFixed(0)}%`
  }
  
  return `Risk factors: ${factors.join(', ')}. Confidence: ${(confidence * 100).toFixed(0)}%`
}

/**
 * Format approval request for user
 * Best UX: Clear, concise, with one-click approve/deny
 */
export function formatApprovalRequest(
  assessment: ConfidenceAssessment,
  actionDescription: string
): string {
  const urgencyEmoji = 
    assessment.riskLevel === 'critical' ? '🚨' :
    assessment.riskLevel === 'high' ? '⚠️' :
    assessment.riskLevel === 'medium' ? '❓' : '💬'
  
  return `${urgencyEmoji} **Approval Needed**

I'm about to: **${actionDescription}**

Risk level: ${assessment.riskLevel.toUpperCase()}
${assessment.reasoning}

Reply "approve" to proceed or "deny" to cancel.`
}

/**
 * Detect action type from tool use
 */
export function detectActionType(toolName: string, toolInput: Record<string, unknown>): string {
  // Map tool names to action types
  const toolActionMap: Record<string, string> = {
    click: detectClickAction(toolInput),
    type: detectTypeAction(toolInput),
    screenshot: 'screenshot',
    scroll: 'scroll',
    key_press: detectKeyAction(toolInput),
  }
  
  return toolActionMap[toolName] || 'unknown_action'
}

function detectClickAction(input: Record<string, unknown>): string {
  // Analyze click coordinates or element context
  // This would be enhanced with actual screen analysis
  return 'click_navigation'
}

function detectTypeAction(input: Record<string, unknown>): string {
  const text = (input.text as string || '').toLowerCase()
  
  // Detect if typing in email/message context
  if (text.includes('@') && text.includes('.')) {
    return 'send_email' // Likely typing email address
  }
  
  return 'type_content'
}

function detectKeyAction(input: Record<string, unknown>): string {
  const key = (input.key as string || '').toLowerCase()
  
  if (key === 'enter') {
    return 'submit_form' // Could be submitting something
  }
  
  return 'key_press'
}

/**
 * Build action context from current execution state
 */
export function buildActionContext(
  actionType: string,
  description: string,
  executionState: {
    isFirstRun: boolean
    attemptCount: number
    currentUrl?: string
    lastActions: string[]
  },
  preferences: UserAutonomyPreferences = DEFAULT_AUTONOMY_PREFERENCES
): ActionContext {
  return {
    actionType,
    description,
    isReversible: isActionReversible(actionType),
    affectsExternalSystems: doesAffectExternalSystems(actionType, executionState.currentUrl),
    involvesFinancialTransaction: isFinancialAction(actionType, executionState.currentUrl),
    involvesCommunication: isCommunicationAction(actionType),
    isFirstTimeAction: executionState.isFirstRun,
    previousAttempts: executionState.attemptCount,
    userPreferences: preferences,
  }
}

function isActionReversible(actionType: string): boolean {
  const irreversibleActions = [
    'send_email', 'send_message', 'post_publicly', 'transfer_money',
    'make_purchase', 'delete_data', 'delete_account'
  ]
  return !irreversibleActions.includes(actionType)
}

function doesAffectExternalSystems(actionType: string, url?: string): boolean {
  const externalActions = [
    'send_email', 'send_message', 'post_publicly', 'submit_form',
    'create_record', 'update_record', 'schedule_meeting'
  ]
  return externalActions.includes(actionType)
}

function isFinancialAction(actionType: string, url?: string): boolean {
  if (['transfer_money', 'make_purchase'].includes(actionType)) {
    return true
  }
  
  // Check if on financial site
  const financialDomains = [
    'stripe.com', 'paypal.com', 'quickbooks.com', 'bank', 
    'checkout', 'payment', 'billing'
  ]
  
  if (url) {
    return financialDomains.some(domain => url.toLowerCase().includes(domain))
  }
  
  return false
}

function isCommunicationAction(actionType: string): boolean {
  return ['send_email', 'send_message', 'post_publicly', 'comment'].includes(actionType)
}
