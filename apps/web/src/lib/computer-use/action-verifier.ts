/**
 * Action Verifier
 * 
 * Verification pass for high-risk milestones before executing side effects.
 * Uses a fast model (Haiku) to double-check critical actions.
 * 
 * This is the "two-person integrity" principle automated.
 */
import { PageState, getPageState } from './semantic-browser-tools'
import { createNonStreamingMessageWithFallback, DEFAULT_MODEL, DEFAULT_FALLBACK_MODELS } from '@/lib/ai/ai-client'
import { routeByPhase } from '@/lib/ai/model-routing'

// Phase-aware verification model selection:
// - Normal/medium-risk actions: cheap verifier (Kimi via 'verify' phase, preferCheap)
// - High/critical-risk actions: premium verifier (Sonnet 4.6 via 'judge' phase)
const getCheapVerifierModel = () => routeByPhase('verify', 'agent', { preferCheap: true }).model
const getPremiumVerifierModel = () => routeByPhase('judge', 'internal').model

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface ActionToVerify {
  type: string
  description: string
  params: Record<string, unknown>
  context: string
}

export interface VerificationResult {
  approved: boolean
  risk_level: RiskLevel
  concerns: string[]
  suggestions: string[]
  requires_human: boolean
  verification_reasoning: string
}

export interface VerificationPolicy {
  always_verify: string[]
  never_verify: string[]
  risk_thresholds: Record<string, RiskLevel>
  max_recipients?: number
  allowed_domains?: string[]
  max_amount?: number
}

const DEFAULT_POLICY: VerificationPolicy = {
  always_verify: [
    'send_email',
    'delete',
    'payment',
    'share',
    'publish',
    'submit_form',
    'purchase',
    'transfer',
  ],
  never_verify: [
    'screenshot',
    'scroll',
    'navigate',
    'get_state',
  ],
  risk_thresholds: {
    send_email: 'high',
    delete: 'critical',
    payment: 'critical',
    share: 'high',
    publish: 'high',
    submit_form: 'medium',
    click: 'low',
    type: 'low',
  },
}

/**
 * Determine if an action needs verification
 */
export function needsVerification(
  actionType: string,
  policy: VerificationPolicy = DEFAULT_POLICY
): boolean {
  if (policy.never_verify.some(a => actionType.includes(a))) {
    return false
  }
  
  if (policy.always_verify.some(a => actionType.includes(a))) {
    return true
  }
  
  return false
}

/**
 * Get the risk level for an action
 */
export function getActionRiskLevel(
  actionType: string,
  params: Record<string, unknown>,
  policy: VerificationPolicy = DEFAULT_POLICY
): RiskLevel {
  const baseRisk = policy.risk_thresholds[actionType] || 'low'
  
  // Elevate risk based on parameters
  if (actionType.includes('email')) {
    const recipients = params.recipients as string[] | undefined
    if (recipients && recipients.length > (policy.max_recipients || 5)) {
      return 'critical'
    }
  }
  
  if (actionType.includes('payment') || actionType.includes('transfer')) {
    const amount = params.amount as number | undefined
    if (amount && amount > (policy.max_amount || 100)) {
      return 'critical'
    }
  }
  
  if (actionType.includes('delete')) {
    const permanent = params.permanent as boolean | undefined
    if (permanent) {
      return 'critical'
    }
  }
  
  return baseRisk
}

/**
 * Verify an action before execution using LLM
 */
export async function verifyAction(
  action: ActionToVerify,
  pageState: PageState | null,
  taskContext: string,
  policy: VerificationPolicy = DEFAULT_POLICY
): Promise<VerificationResult> {
  const riskLevel = getActionRiskLevel(action.type, action.params, policy)
  
  // Low risk actions auto-approve
  if (riskLevel === 'low') {
    return {
      approved: true,
      risk_level: 'low',
      concerns: [],
      suggestions: [],
      requires_human: false,
      verification_reasoning: 'Low-risk action auto-approved',
    }
  }
  
  // Build verification prompt
  const pageContext = pageState ? `
Current page state:
- URL: ${pageState.url}
- Title: ${pageState.title}
- Errors visible: ${pageState.errors.join(', ') || 'none'}
- Forms: ${pageState.forms.map(f => f.label || f.name).join(', ') || 'none'}
` : 'Page state unavailable'

  const prompt = `You are a safety verifier for an AI agent. Your job is to check if an action is safe to execute.

TASK CONTEXT:
${taskContext}

ACTION TO VERIFY:
Type: ${action.type}
Description: ${action.description}
Parameters: ${JSON.stringify(action.params, null, 2)}

${pageContext}

VERIFICATION CHECKLIST:
1. Does this action match what the user requested?
2. Are the recipients/targets correct?
3. Is any sensitive data being exposed?
4. Is this action reversible?
5. Are there any red flags (wrong domain, suspicious amounts, etc.)?

Respond in this exact format:
APPROVED: true/false
RISK_LEVEL: low/medium/high/critical
REQUIRES_HUMAN: true/false
CONCERNS: [list any concerns, one per line]
SUGGESTIONS: [list any suggestions, one per line]
REASONING: [brief explanation]`

  try {
    // Use premium verifier for high/critical risk, cheap verifier for medium
    const verifierModel = (riskLevel === 'high' || riskLevel === 'critical')
      ? getPremiumVerifierModel()
      : getCheapVerifierModel()
    const { response } = await createNonStreamingMessageWithFallback({
      model: verifierModel,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })
    
    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')
    
    return parseVerificationResponse(text, riskLevel)
  } catch (error) {
    console.error('[ActionVerifier] Verification failed:', error)
    // On error, be conservative
    return {
      approved: false,
      risk_level: riskLevel,
      concerns: ['Verification system error - defaulting to safe behavior'],
      suggestions: ['Retry the action or request human approval'],
      requires_human: riskLevel === 'critical',
      verification_reasoning: 'Verification failed, being conservative',
    }
  }
}

/**
 * Parse the verification response from LLM
 */
function parseVerificationResponse(text: string, fallbackRisk: RiskLevel): VerificationResult {
  const approvedMatch = text.match(/APPROVED:\s*(true|false)/i)
  const riskMatch = text.match(/RISK_LEVEL:\s*(low|medium|high|critical)/i)
  const humanMatch = text.match(/REQUIRES_HUMAN:\s*(true|false)/i)
  const reasoningMatch = text.match(/REASONING:\s*([\s\S]+?)(?=\n[A-Z]+:|$)/)
  
  // Extract concerns
  const concernsMatch = text.match(/CONCERNS:\s*([\s\S]+?)(?=\nSUGGESTIONS:|$)/)
  const concerns = concernsMatch
    ? concernsMatch[1].split('\n').filter(l => l.trim().startsWith('-') || l.trim().startsWith('•'))
        .map(l => l.replace(/^[-•]\s*/, '').trim())
        .filter(Boolean)
    : []
  
  // Extract suggestions
  const suggestionsMatch = text.match(/SUGGESTIONS:\s*([\s\S]+?)(?=\nREASONING:|$)/)
  const suggestions = suggestionsMatch
    ? suggestionsMatch[1].split('\n').filter(l => l.trim().startsWith('-') || l.trim().startsWith('•'))
        .map(l => l.replace(/^[-•]\s*/, '').trim())
        .filter(Boolean)
    : []
  
  const approved = approvedMatch ? approvedMatch[1].toLowerCase() === 'true' : false
  const riskLevel = (riskMatch ? riskMatch[1].toLowerCase() : fallbackRisk) as RiskLevel
  const requiresHuman = humanMatch ? humanMatch[1].toLowerCase() === 'true' : riskLevel === 'critical'
  
  return {
    approved,
    risk_level: riskLevel,
    concerns,
    suggestions,
    requires_human: requiresHuman,
    verification_reasoning: reasoningMatch ? reasoningMatch[1].trim() : 'No reasoning provided',
  }
}

/**
 * Verify email-specific parameters
 */
export async function verifyEmailAction(
  recipients: string[],
  subject: string,
  bodyPreview: string,
  pageState: PageState | null,
  policy: VerificationPolicy = DEFAULT_POLICY
): Promise<VerificationResult> {
  const concerns: string[] = []
  const suggestions: string[] = []
  
  // Check recipient count
  if (recipients.length > (policy.max_recipients || 5)) {
    concerns.push(`Sending to ${recipients.length} recipients (threshold: ${policy.max_recipients || 5})`)
  }
  
  // Check for external domains
  if (policy.allowed_domains) {
    const externalRecipients = recipients.filter(r => {
      const domain = r.split('@')[1]?.toLowerCase()
      return domain && !policy.allowed_domains!.some(d => domain.endsWith(d))
    })
    
    if (externalRecipients.length > 0) {
      concerns.push(`External recipients detected: ${externalRecipients.join(', ')}`)
    }
  }
  
  // Check for sensitive content indicators
  const sensitivePatterns = [
    /password/i,
    /ssn|social security/i,
    /credit card/i,
    /bank account/i,
    /api[_\s]?key/i,
    /secret/i,
  ]
  
  for (const pattern of sensitivePatterns) {
    if (pattern.test(bodyPreview)) {
      concerns.push(`Potential sensitive content detected: ${pattern.source}`)
    }
  }
  
  // If page state shows errors, flag it
  if (pageState?.errors.length) {
    concerns.push(`Page has errors that may affect sending: ${pageState.errors.join(', ')}`)
  }
  
  const riskLevel: RiskLevel = concerns.length > 2 ? 'critical' : concerns.length > 0 ? 'high' : 'medium'
  
  return {
    approved: concerns.length === 0,
    risk_level: riskLevel,
    concerns,
    suggestions,
    requires_human: riskLevel === 'critical',
    verification_reasoning: concerns.length === 0 
      ? 'Email parameters look safe' 
      : `Found ${concerns.length} concern(s) that need review`,
  }
}

/**
 * Verify payment/financial action
 */
export async function verifyPaymentAction(
  amount: number,
  currency: string,
  recipient: string,
  pageState: PageState | null,
  policy: VerificationPolicy = DEFAULT_POLICY
): Promise<VerificationResult> {
  const concerns: string[] = []
  
  // Amount threshold
  const maxAmount = policy.max_amount || 100
  if (amount > maxAmount) {
    concerns.push(`Amount ${amount} ${currency} exceeds threshold (${maxAmount})`)
  }
  
  // Always flag payments for human review
  return {
    approved: false,
    risk_level: 'critical',
    concerns: concerns.length > 0 ? concerns : ['Payment actions always require human approval'],
    suggestions: ['Verify recipient details', 'Confirm amount is correct'],
    requires_human: true,
    verification_reasoning: 'Financial transactions require human approval',
  }
}

/**
 * Verify delete action
 */
export async function verifyDeleteAction(
  target: string,
  permanent: boolean,
  pageState: PageState | null
): Promise<VerificationResult> {
  const concerns: string[] = []
  
  if (permanent) {
    concerns.push('This is a permanent deletion - cannot be undone')
  }
  
  // Check if the page shows any confirmation
  if (pageState && !pageState.visible_text.toLowerCase().includes('confirm')) {
    concerns.push('No confirmation dialog visible on page')
  }
  
  return {
    approved: !permanent,
    risk_level: permanent ? 'critical' : 'high',
    concerns,
    suggestions: permanent ? ['Consider moving to trash instead'] : [],
    requires_human: permanent,
    verification_reasoning: permanent 
      ? 'Permanent deletion requires human approval' 
      : 'Soft delete approved, can be recovered',
  }
}

/**
 * Build verification context for injection into agent prompt
 */
export function buildVerificationInstructions(): string {
  return `
## Action Verification Protocol

Before executing HIGH-RISK actions, you must verify:

### Email Actions
- Confirm recipient addresses are correct
- Check that subject and content match the task
- Flag if sending to many recipients or external domains
- Never include passwords, API keys, or sensitive data

### Delete Actions
- Confirm the target is correct
- Prefer trash/archive over permanent delete
- Verify you're not deleting the wrong item

### Payment/Financial Actions
- ALWAYS require human approval
- Double-check amounts and recipients
- Verify the page shows expected payment form

### Sharing/Publishing Actions
- Confirm visibility settings (public vs private)
- Verify the content is ready to share
- Check for sensitive information

If uncertain, use the \`request_verification\` tool to pause and ask for human review.
`
}
