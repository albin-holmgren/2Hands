/**
 * Error Recovery Strategies
 * 
 * Pre-defined recovery patterns for common agent failures:
 * - Login failures → Retry with delay, then ask user
 * - CAPTCHA → Immediately ask user
 * - Session timeout → Auto re-login
 * - Element not found → Try alternative selectors
 * - Rate limiting → Exponential backoff
 * 
 * Best UX: Agents handle routine errors silently,
 * only escalate when truly stuck. Users see reliability.
 */

export interface ErrorContext {
  errorType: ErrorType
  errorMessage: string
  currentUrl?: string
  attemptCount: number
  lastSuccessfulAction?: string
  screenshotBase64?: string
}

export type ErrorType = 
  | 'login_failed'
  | 'captcha_detected'
  | 'session_expired'
  | 'element_not_found'
  | 'page_load_timeout'
  | 'rate_limited'
  | 'permission_denied'
  | 'network_error'
  | 'unexpected_popup'
  | 'verification_required'
  | 'two_factor_required'
  | 'account_locked'
  | 'service_unavailable'
  | 'unknown'

export interface RecoveryStrategy {
  errorType: ErrorType
  maxRetries: number
  backoffMs: number
  backoffMultiplier: number
  actions: RecoveryAction[]
  requiresUserIntervention: boolean
  userMessage?: string
}

export type RecoveryAction = 
  | { type: 'wait'; durationMs: number }
  | { type: 'refresh_page' }
  | { type: 'navigate'; url: string }
  | { type: 'clear_cookies' }
  | { type: 'retry_action' }
  | { type: 're_login' }
  | { type: 'screenshot_and_report' }
  | { type: 'ask_user'; message: string }
  | { type: 'try_alternative'; alternatives: string[] }
  | { type: 'abort'; reason: string }

// Pre-defined recovery strategies for common errors
const RECOVERY_STRATEGIES: Record<ErrorType, RecoveryStrategy> = {
  login_failed: {
    errorType: 'login_failed',
    maxRetries: 2,
    backoffMs: 3000,
    backoffMultiplier: 2,
    actions: [
      { type: 'wait', durationMs: 2000 },
      { type: 'refresh_page' },
      { type: 'retry_action' },
    ],
    requiresUserIntervention: false,
    userMessage: 'Login failed after multiple attempts. Please verify credentials are correct.',
  },
  
  captcha_detected: {
    errorType: 'captcha_detected',
    maxRetries: 0, // Don't retry, always ask user
    backoffMs: 0,
    backoffMultiplier: 1,
    actions: [
      { type: 'screenshot_and_report' },
      { type: 'ask_user', message: 'I encountered a CAPTCHA that I cannot solve. Please solve it manually and let me know when done.' },
    ],
    requiresUserIntervention: true,
  },
  
  session_expired: {
    errorType: 'session_expired',
    maxRetries: 3,
    backoffMs: 1000,
    backoffMultiplier: 1,
    actions: [
      { type: 're_login' },
      { type: 'retry_action' },
    ],
    requiresUserIntervention: false,
  },
  
  element_not_found: {
    errorType: 'element_not_found',
    maxRetries: 3,
    backoffMs: 2000,
    backoffMultiplier: 1.5,
    actions: [
      { type: 'wait', durationMs: 2000 }, // Wait for page to load
      { type: 'refresh_page' },
      { type: 'try_alternative', alternatives: ['scroll_down', 'scroll_up', 'wait_longer'] },
      { type: 'retry_action' },
    ],
    requiresUserIntervention: false,
    userMessage: 'Could not find the expected element on the page. The interface may have changed.',
  },
  
  page_load_timeout: {
    errorType: 'page_load_timeout',
    maxRetries: 3,
    backoffMs: 5000,
    backoffMultiplier: 2,
    actions: [
      { type: 'wait', durationMs: 3000 },
      { type: 'refresh_page' },
      { type: 'retry_action' },
    ],
    requiresUserIntervention: false,
  },
  
  rate_limited: {
    errorType: 'rate_limited',
    maxRetries: 5,
    backoffMs: 10000,
    backoffMultiplier: 2, // Exponential backoff: 10s, 20s, 40s, 80s, 160s
    actions: [
      { type: 'wait', durationMs: 10000 },
      { type: 'retry_action' },
    ],
    requiresUserIntervention: false,
    userMessage: 'The service is rate limiting requests. I\'ll slow down and retry.',
  },
  
  permission_denied: {
    errorType: 'permission_denied',
    maxRetries: 0,
    backoffMs: 0,
    backoffMultiplier: 1,
    actions: [
      { type: 'screenshot_and_report' },
      { type: 'ask_user', message: 'Access denied. You may not have permission to perform this action.' },
    ],
    requiresUserIntervention: true,
  },
  
  network_error: {
    errorType: 'network_error',
    maxRetries: 5,
    backoffMs: 3000,
    backoffMultiplier: 2,
    actions: [
      { type: 'wait', durationMs: 3000 },
      { type: 'retry_action' },
    ],
    requiresUserIntervention: false,
  },
  
  unexpected_popup: {
    errorType: 'unexpected_popup',
    maxRetries: 2,
    backoffMs: 1000,
    backoffMultiplier: 1,
    actions: [
      { type: 'screenshot_and_report' },
      { type: 'try_alternative', alternatives: ['click_dismiss', 'press_escape', 'click_outside'] },
      { type: 'retry_action' },
    ],
    requiresUserIntervention: false,
  },
  
  verification_required: {
    errorType: 'verification_required',
    maxRetries: 0,
    backoffMs: 0,
    backoffMultiplier: 1,
    actions: [
      { type: 'screenshot_and_report' },
      { type: 'ask_user', message: 'The service requires additional verification. Please complete it manually.' },
    ],
    requiresUserIntervention: true,
  },
  
  two_factor_required: {
    errorType: 'two_factor_required',
    maxRetries: 0,
    backoffMs: 0,
    backoffMultiplier: 1,
    actions: [
      { type: 'screenshot_and_report' },
      { type: 'ask_user', message: 'Two-factor authentication is required. Please enter the code.' },
    ],
    requiresUserIntervention: true,
  },
  
  account_locked: {
    errorType: 'account_locked',
    maxRetries: 0,
    backoffMs: 0,
    backoffMultiplier: 1,
    actions: [
      { type: 'screenshot_and_report' },
      { type: 'abort', reason: 'Account appears to be locked. Manual intervention required.' },
    ],
    requiresUserIntervention: true,
  },
  
  service_unavailable: {
    errorType: 'service_unavailable',
    maxRetries: 3,
    backoffMs: 30000, // 30 seconds
    backoffMultiplier: 2,
    actions: [
      { type: 'wait', durationMs: 30000 },
      { type: 'retry_action' },
    ],
    requiresUserIntervention: false,
    userMessage: 'The service is temporarily unavailable. I\'ll retry in a moment.',
  },
  
  unknown: {
    errorType: 'unknown',
    maxRetries: 2,
    backoffMs: 5000,
    backoffMultiplier: 2,
    actions: [
      { type: 'screenshot_and_report' },
      { type: 'retry_action' },
    ],
    requiresUserIntervention: false,
    userMessage: 'An unexpected error occurred. Attempting to recover.',
  },
}

/**
 * Detect error type from error message and context
 */
export function detectErrorType(errorMessage: string, context?: Partial<ErrorContext>): ErrorType {
  const msg = errorMessage.toLowerCase()
  const url = context?.currentUrl?.toLowerCase() || ''
  
  // CAPTCHA detection
  if (msg.includes('captcha') || msg.includes('recaptcha') || msg.includes('hcaptcha') ||
      msg.includes('verify you are human') || msg.includes('robot')) {
    return 'captcha_detected'
  }
  
  // 2FA detection
  if (msg.includes('two-factor') || msg.includes('2fa') || msg.includes('verification code') ||
      msg.includes('authenticator') || msg.includes('sms code')) {
    return 'two_factor_required'
  }
  
  // Login failures
  if (msg.includes('invalid password') || msg.includes('incorrect password') ||
      msg.includes('login failed') || msg.includes('authentication failed') ||
      msg.includes('wrong password') || msg.includes('invalid credentials')) {
    return 'login_failed'
  }
  
  // Session issues
  if (msg.includes('session expired') || msg.includes('logged out') ||
      msg.includes('session timeout') || msg.includes('please log in again')) {
    return 'session_expired'
  }
  
  // Rate limiting
  if (msg.includes('rate limit') || msg.includes('too many requests') ||
      msg.includes('slow down') || msg.includes('try again later') ||
      msg.includes('429')) {
    return 'rate_limited'
  }
  
  // Permission issues
  if (msg.includes('access denied') || msg.includes('permission denied') ||
      msg.includes('forbidden') || msg.includes('403') ||
      msg.includes('not authorized')) {
    return 'permission_denied'
  }
  
  // Element not found
  if (msg.includes('element not found') || msg.includes('no such element') ||
      msg.includes('could not find') || msg.includes('not visible') ||
      msg.includes('timed out waiting for')) {
    return 'element_not_found'
  }
  
  // Page load issues
  if (msg.includes('timeout') || msg.includes('page load') ||
      msg.includes('navigation failed')) {
    return 'page_load_timeout'
  }
  
  // Network issues
  if (msg.includes('network') || msg.includes('connection') ||
      msg.includes('fetch failed') || msg.includes('econnrefused')) {
    return 'network_error'
  }
  
  // Account locked
  if (msg.includes('account locked') || msg.includes('account suspended') ||
      msg.includes('account disabled') || msg.includes('too many attempts')) {
    return 'account_locked'
  }
  
  // Service unavailable
  if (msg.includes('service unavailable') || msg.includes('503') ||
      msg.includes('maintenance') || msg.includes('temporarily unavailable')) {
    return 'service_unavailable'
  }
  
  // Verification required
  if (msg.includes('verify') || msg.includes('verification required') ||
      msg.includes('confirm your identity') || msg.includes('security check')) {
    return 'verification_required'
  }
  
  return 'unknown'
}

/**
 * Get recovery strategy for an error
 */
export function getRecoveryStrategy(errorType: ErrorType): RecoveryStrategy {
  return RECOVERY_STRATEGIES[errorType] || RECOVERY_STRATEGIES.unknown
}

/**
 * Execute recovery strategy
 * Returns true if recovery was successful, false if needs user intervention
 */
export interface RecoveryResult {
  success: boolean
  action: RecoveryAction
  shouldContinue: boolean
  userMessage?: string
  waitMs?: number
}

export function planRecovery(
  context: ErrorContext
): RecoveryResult {
  const strategy = getRecoveryStrategy(context.errorType)
  
  // Check if we've exceeded max retries
  if (context.attemptCount >= strategy.maxRetries) {
    if (strategy.requiresUserIntervention) {
      return {
        success: false,
        action: { type: 'ask_user', message: strategy.userMessage || 'I need your help to continue.' },
        shouldContinue: false,
        userMessage: strategy.userMessage,
      }
    } else {
      return {
        success: false,
        action: { type: 'abort', reason: `Failed after ${context.attemptCount} attempts` },
        shouldContinue: false,
        userMessage: strategy.userMessage,
      }
    }
  }
  
  // Calculate backoff time
  const waitMs = strategy.backoffMs * Math.pow(strategy.backoffMultiplier, context.attemptCount)
  
  // Get next recovery action
  const actionIndex = Math.min(context.attemptCount, strategy.actions.length - 1)
  const action = strategy.actions[actionIndex]
  
  return {
    success: true,
    action,
    shouldContinue: !strategy.requiresUserIntervention,
    waitMs,
    userMessage: action.type === 'ask_user' ? action.message : undefined,
  }
}

/**
 * Format error message for user notification
 * Best UX: Informative but not alarming, with clear next steps
 */
export function formatErrorForUser(
  context: ErrorContext,
  recovery: RecoveryResult
): string {
  const strategy = getRecoveryStrategy(context.errorType)
  
  if (recovery.shouldContinue) {
    // Agent is handling it - brief notification
    return `⚡ Encountered ${context.errorType.replace(/_/g, ' ')}. Recovering automatically...`
  }
  
  // Needs user intervention - detailed message
  return `⚠️ **${context.errorType.replace(/_/g, ' ').toUpperCase()}**

${context.errorMessage}

${recovery.userMessage || 'I need your help to proceed.'}

${strategy.requiresUserIntervention ? 
  'Please resolve this issue and let me know when I can continue.' : 
  'I\'ve tried multiple recovery attempts without success.'}`
}

/**
 * Analyze screenshot for error indicators
 * Used when error message is not clear
 */
export function analyzeScreenshotForErrors(screenshotContext: string): ErrorType {
  const ctx = screenshotContext.toLowerCase()
  
  // Common UI patterns that indicate errors
  if (ctx.includes('captcha') || ctx.includes('i\'m not a robot')) {
    return 'captcha_detected'
  }
  
  if (ctx.includes('enter code') || ctx.includes('verification code')) {
    return 'two_factor_required'
  }
  
  if (ctx.includes('sign in') && ctx.includes('error')) {
    return 'login_failed'
  }
  
  if (ctx.includes('access denied') || ctx.includes('403')) {
    return 'permission_denied'
  }
  
  return 'unknown'
}

/**
 * Build recovery instructions for the agent prompt
 */
export function buildRecoveryInstructions(): string {
  return `
=== ERROR RECOVERY PROTOCOLS ===

When encountering errors, follow these protocols:

1. **Login Failures**: Wait 2s, refresh, retry. After 2 failures, report to user.

2. **CAPTCHA/Verification**: Immediately report to user with screenshot. Do NOT attempt to solve.

3. **Session Expired**: Automatically re-login with stored credentials, then continue.

4. **Element Not Found**: Wait for page load, scroll to find, try alternative selectors.

5. **Rate Limited**: Wait with exponential backoff (10s, 20s, 40s...). Report if persists.

6. **2FA Required**: Report to user immediately. Wait for their code.

7. **Network Errors**: Retry with backoff. Report after 5 failures.

8. **Permission Denied**: Report immediately. Do not retry.

Always report errors via report_insight so the user stays informed.
Do NOT get stuck in retry loops - if 3 attempts fail, move on and report.
`
}
