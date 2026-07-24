/**
 * Semantic Browser Tools
 * 
 * High-level browser interaction tools that use text/selectors instead of coordinates.
 * This dramatically reduces LLM turns and increases reliability.
 * 
 * The VM server must support these operations via CDP (Chrome DevTools Protocol)
 * or accessibility tree inspection.
 */

export interface PageState {
  url: string
  title: string
  visible_text: string
  forms: FormField[]
  buttons: ClickableElement[]
  links: ClickableElement[]
  errors: string[]
  toasts: string[]
  focused_element: string | null
  loading: boolean
  login_detected: boolean
  captcha_detected: boolean
}

export interface FormField {
  label: string
  placeholder: string
  type: string
  value: string
  name: string
  id: string
  required: boolean
}

export interface ClickableElement {
  text: string
  role: string
  href?: string
  disabled: boolean
  visible: boolean
}

export interface SemanticActionResult {
  success: boolean
  error?: string
  state_before?: Partial<PageState>
  state_after?: Partial<PageState>
  screenshot_needed: boolean
  matched_element?: string
}

export interface BatchedAction {
  type: 'click_text' | 'click_role' | 'type_into' | 'key_press' | 'scroll' | 'wait_for_text' | 'navigate'
  args: Record<string, unknown>
}

export interface BatchResult {
  success: boolean
  actions_completed: number
  actions_total: number
  stopped_at?: string
  final_state: Partial<PageState>
  errors: string[]
  screenshot?: string
}

import { createHmac } from 'crypto'

function getVmSecret(): string {
  const secret = (process.env.VM_SECRET || '').trim()
  if (!secret) {
    throw new Error('VM_SECRET is required for VM HMAC authentication')
  }
  return secret
}

/**
 * Generate HMAC signature for VM authentication
 */
function generateVMSignature(body: string): string {
  return createHmac('sha256', getVmSecret())
    .update(body)
    .digest('hex')
}

/**
 * Execute a semantic browser action on the VM
 */
export async function executeSemanticAction(
  vmIp: string,
  action: string,
  params: Record<string, unknown>
): Promise<SemanticActionResult> {
  try {
    const ip = vmIp.trim()
    const body = JSON.stringify({ action, ...params })
    const signature = generateVMSignature(body)
    
    const response = await fetch(`http://${ip}:8080/browser`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Signature': signature
      },
      body,
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          error: 'VM semantic browser tools not supported (404). Use screenshots and /computer actions instead.',
          screenshot_needed: true,
        }
      }
      return {
        success: false,
        error: `VM browser action failed: ${response.status}`,
        screenshot_needed: true,
      }
    }

    const result = await response.json()
    return {
      success: result.success ?? true,
      error: result.error,
      state_before: result.state_before,
      state_after: result.state_after,
      screenshot_needed: result.screenshot_needed ?? false,
      matched_element: result.matched_element,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      screenshot_needed: true,
    }
  }
}

/**
 * Get current page state without screenshot (text-first perception)
 */
export async function getPageState(vmIp: string): Promise<PageState | null> {
  try {
    const ip = vmIp.trim()
    const body = JSON.stringify({ action: 'get_state' })
    const signature = generateVMSignature(body)
    
    const response = await fetch(`http://${ip}:8080/browser`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Signature': signature
      },
      body,
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      if (response.status !== 404) {
        console.error('[SemanticTools] Failed to get page state:', response.status)
      }
      return null
    }

    return await response.json()
  } catch (error) {
    console.error('[SemanticTools] Error getting page state:', error)
    return null
  }
}

/**
 * Click an element by its visible text
 */
export async function clickText(
  vmIp: string,
  text: string,
  options: { nth?: number; fuzzy?: boolean; timeout_ms?: number } = {}
): Promise<SemanticActionResult> {
  return executeSemanticAction(vmIp, 'click_text', {
    text,
    nth: options.nth ?? 0,
    fuzzy: options.fuzzy ?? true,
    timeout_ms: options.timeout_ms ?? 5000,
  })
}

/**
 * Click an element by its ARIA role and name
 */
export async function clickRole(
  vmIp: string,
  role: string,
  name: string,
  options: { nth?: number } = {}
): Promise<SemanticActionResult> {
  return executeSemanticAction(vmIp, 'click_role', {
    role,
    name,
    nth: options.nth ?? 0,
  })
}

/**
 * Type into a form field identified by label or placeholder
 */
export async function typeInto(
  vmIp: string,
  identifier: string,
  text: string,
  options: { clear_first?: boolean; submit?: boolean } = {}
): Promise<SemanticActionResult> {
  return executeSemanticAction(vmIp, 'type_into', {
    identifier,
    text,
    clear_first: options.clear_first ?? true,
    submit: options.submit ?? false,
  })
}

/**
 * Wait for specific text to appear on page
 */
export async function waitForText(
  vmIp: string,
  text: string,
  options: { timeout_ms?: number; contains?: boolean } = {}
): Promise<SemanticActionResult> {
  return executeSemanticAction(vmIp, 'wait_for_text', {
    text,
    timeout_ms: options.timeout_ms ?? 10000,
    contains: options.contains ?? true,
  })
}

/**
 * Navigate to a URL
 */
export async function navigate(
  vmIp: string,
  url: string,
  options: { wait_for_load?: boolean } = {}
): Promise<SemanticActionResult> {
  return executeSemanticAction(vmIp, 'navigate', {
    url,
    wait_for_load: options.wait_for_load ?? true,
  })
}

/**
 * Execute a batch of actions in sequence (reduces LLM turns)
 */
export async function runActionBatch(
  vmIp: string,
  actions: BatchedAction[],
  options: {
    stop_on?: ('error' | 'captcha' | 'login_prompt' | 'confirmation')[]
    capture_screenshot?: 'final' | 'none' | 'each'
    timeout_ms?: number
  } = {}
): Promise<BatchResult> {
  try {
    const ip = vmIp.trim()
    const body = JSON.stringify({
      actions,
      stop_on: options.stop_on ?? ['error', 'captcha', 'login_prompt'],
      capture_screenshot: options.capture_screenshot ?? 'final',
      timeout_ms: options.timeout_ms ?? 60000,
    })
    const signature = generateVMSignature(body)
    
    const response = await fetch(`http://${ip}:8080/browser/batch`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Signature': signature
      },
      body,
      signal: AbortSignal.timeout(options.timeout_ms ?? 60000),
    })

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          actions_completed: 0,
          actions_total: actions.length,
          final_state: {},
          errors: ['VM batch endpoint not supported (404). Do not use run_actions; execute actions one-by-one.'],
        }
      }
      return {
        success: false,
        actions_completed: 0,
        actions_total: actions.length,
        final_state: {},
        errors: [`VM batch action failed: ${response.status}`],
      }
    }

    return await response.json()
  } catch (error) {
    return {
      success: false,
      actions_completed: 0,
      actions_total: actions.length,
      final_state: {},
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    }
  }
}

/**
 * Check if the VM supports semantic browser tools
 */
export async function checkSemanticSupport(vmIp: string): Promise<boolean> {
  let capabilitySaysYes = false

  try {
    const ip = vmIp.trim()
    const response = await fetch(`http://${ip}:8080/browser/capabilities`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })

    if (response.ok) {
      const capabilities = await response.json()
      capabilitySaysYes = capabilities.semantic_tools === true
    }
  } catch {
    capabilitySaysYes = false
  }

  try {
    const ip = vmIp.trim()
    const response = await fetch(`http://${ip}:8080/browser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_state' }),
      signal: AbortSignal.timeout(3000),
    })

    if (!response.ok) return false
    return capabilitySaysYes || true
  } catch {
    return false
  }
}

/**
 * Format page state for LLM context (compact representation)
 */
export function formatPageStateForPrompt(state: PageState): string {
  const lines: string[] = []
  
  lines.push(`URL: ${state.url}`)
  lines.push(`Title: ${state.title}`)
  
  if (state.loading) {
    lines.push('⏳ Page is loading...')
  }
  
  if (state.login_detected) {
    lines.push('🔐 Login form detected')
  }
  
  if (state.captcha_detected) {
    lines.push('⚠️ CAPTCHA detected - may need human intervention')
  }
  
  if (state.errors.length > 0) {
    lines.push(`\nErrors on page:\n${state.errors.map(e => `  - ${e}`).join('\n')}`)
  }
  
  if (state.toasts.length > 0) {
    lines.push(`\nNotifications:\n${state.toasts.map(t => `  - ${t}`).join('\n')}`)
  }
  
  if (state.forms.length > 0) {
    lines.push('\nForm fields:')
    for (const field of state.forms.slice(0, 10)) {
      const label = field.label || field.placeholder || field.name
      const filled = field.value ? '✓' : '○'
      const required = field.required ? '*' : ''
      lines.push(`  ${filled} ${label}${required} (${field.type})`)
    }
  }
  
  if (state.buttons.length > 0) {
    lines.push('\nButtons:')
    for (const btn of state.buttons.slice(0, 8)) {
      const disabled = btn.disabled ? ' [disabled]' : ''
      lines.push(`  • "${btn.text}"${disabled}`)
    }
  }
  
  if (state.focused_element) {
    lines.push(`\nFocused: ${state.focused_element}`)
  }
  
  // Truncated visible text
  if (state.visible_text) {
    const truncated = state.visible_text.slice(0, 500)
    lines.push(`\nVisible text (truncated):\n${truncated}${state.visible_text.length > 500 ? '...' : ''}`)
  }
  
  return lines.join('\n')
}

/**
 * Detect if page state indicates a blocking condition
 */
export function detectBlockingCondition(state: PageState): {
  blocked: boolean
  reason?: string
  recoverable: boolean
} {
  if (state.captcha_detected) {
    return { blocked: true, reason: 'captcha', recoverable: false }
  }
  
  if (state.login_detected) {
    return { blocked: true, reason: 'login_required', recoverable: true }
  }
  
  const errorKeywords = ['access denied', 'forbidden', 'unauthorized', 'session expired']
  for (const error of state.errors) {
    const lower = error.toLowerCase()
    if (errorKeywords.some(k => lower.includes(k))) {
      return { blocked: true, reason: 'access_error', recoverable: true }
    }
  }
  
  return { blocked: false, recoverable: true }
}
