/**
 * Execute-First Policy
 *
 * Single authoritative runtime module that classifies any request or action
 * into one of four execution modes:
 *
 *   direct_execute   – do it right now using a tool call (integration_*, github_*, etc.)
 *   background_agent – hand off to a long-running agent
 *   mission          – enqueue a multi-phase autonomous mission tick
 *   needs_confirmation – too risky / ambiguous; ask the user before proceeding
 *
 * And two risk bands:
 *
 *   safe             – no confirmation needed; execute or delegate immediately
 *   approval_required – dangerous/irreversible; pause and surface to user
 *
 * Import this module instead of scattering threshold checks across route files.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ExecutionMode =
  | 'direct_execute'
  | 'background_agent'
  | 'recurring_operation'
  | 'mission'
  | 'needs_confirmation'

export type RiskBand = 'safe' | 'approval_required'

export interface ExecutionClassification {
  mode: ExecutionMode
  risk: RiskBand
  reason: string
  /** True when the task can proceed without asking the user first. */
  canProceedImmediately: boolean
}

export interface ExecutionContext {
  /** Free-text description of what is about to happen. */
  taskDescription: string
  /** The raw tool or action name (e.g. 'integration_attio_create_deal'). */
  actionType?: string
  /** True when the action writes / mutates external state. */
  isWrite?: boolean
  /** True when the action cannot be undone. */
  isIrreversible?: boolean
  /** True when the action sends money. */
  isFinancial?: boolean
  /** True when the action sends a public message / email / post. */
  isCommunication?: boolean
  /** True when the action deletes records or bulk-mutates data. */
  isDestructive?: boolean
  /** How many times this exact action has already been retried this run. */
  retryCount?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Action types that ALWAYS need user approval, no exceptions. */
const ALWAYS_APPROVAL_REQUIRED: ReadonlySet<string> = new Set([
  'send_payment',
  'transfer_money',
  'make_purchase',
  'delete_account',
  'delete_data',
  'post_public',
  'send_bulk_email',
  'grant_access',
  'change_password',
])

/** Action types that are NEVER blocked by execution policy. */
const ALWAYS_SAFE: ReadonlySet<string> = new Set([
  'screenshot',
  'read_page',
  'scroll',
  'navigate',
  'search',
  'read_content',
  'click_navigation',
  'get_status',
  'inspect_workspace',
])

/**
 * Patterns that indicate a task is destructive/irreversible and MUST ask the user
 * for confirmation even when no explicit flag is set.
 * Domain-agnostic: covers CRM records, files, users, databases, accounts, and
 * financial/broadcast actions regardless of what domain the user works in.
 * Checked against the raw user message before any execution begins.
 */
export const DESTRUCTIVE_TEXT_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  // ── Bulk delete / wipe (any domain) ──
  { pattern: /\b(delete|remove|wipe|purge|nuke|clear|destroy|drop)\b.{0,40}\b(all|every|entire|everything|whole)\b/i, reason: 'Bulk delete/wipe of all items' },
  { pattern: /\bdelete\s+all\b/i, reason: 'Delete all items' },
  { pattern: /\b(delete|remove|wipe|purge|clear|erase|truncate)\b.{0,40}\b(deals?|contacts?|companies|leads?|records?|data|entries|rows|everything|users?|accounts?|files?|documents?|tables?|databases?|collections?|items?|messages?)\b/i, reason: 'Delete of data records' },
  // ── Database destructive operations ──
  { pattern: /\b(drop|truncate)\s+.{0,30}\b(table|database|db|collection|schema|index)\b/i, reason: 'Database destructive operation' },
  // ── Bulk / mass communication ──
  { pattern: /\bsend\s+(bulk\s+)?emails?\s+(to\s+)?(all|everyone|the\s+list|\d+)/i, reason: 'Bulk email send' },
  { pattern: /\b(blast|broadcast)\s+(an?\s+)?emails?\b/i, reason: 'Email blast/broadcast' },
  { pattern: /\b(post|publish|broadcast)\b.{0,30}\b(to\s+)?(everyone|all\s+(users?|subscribers?|followers?|customers?))/i, reason: 'Mass post/broadcast to all users' },
  // ── Financial transactions ──
  { pattern: /\b(spend|pay|charge|buy|purchase|transfer|withdraw)\s+\$?\d/i, reason: 'Financial transaction' },
  { pattern: /\b(spend|pay|charge|buy|purchase|transfer|withdraw)\b.{0,50}\$\d/i, reason: 'Financial transaction (verb + dollar amount)' },
  // ── Outbound email to a group / team ──
  // Catches "send email to team", "send an email to all staff", etc.
  // Does NOT catch "send me 5 leads" or "write a follow-up email to 3 prospects" (no group target).
  { pattern: /\bsend\s+(an?\s+)?e?-?mails?\s+(to\s+)(the\s+)?(team|company|whole\s+\w+|all\s+(of\s+(the|my)\s+)?(users?|customers?|clients?|staff|employees?|subscribers?|contacts?|people|leads?|members?))\b/i, reason: 'Sending email to a team or contact group' },
  // ── Subscription / recurring financial commitment ──
  { pattern: /\b(subscribe|sign\s+up)\b.{0,60}\b(plan|subscription|membership|tier)\b/i, reason: 'Subscription or recurring service commitment' },
  { pattern: /\$\d+[\.,]?\d*\s*\/\s*(month|year|mo|yr)\b/i, reason: 'Recurring payment amount ($N/month or $N/year)' },
  // ── Public posting / publishing to external channels ──
  // Catches "publish to blog", "post on LinkedIn", "share on Twitter", etc.
  // Does NOT catch drafting, creating a post object, or internal board posts.
  { pattern: /\b(publish|post)\s+(it\s+)?(to|on)\s+(the\s+)?(blog|linkedin|twitter|x\.com|instagram|facebook|social\s+media|website|homepage|medium|substack)\b/i, reason: 'Publishing content to a public channel' },
  { pattern: /\bshare\s+(this\s+|it\s+)?(to|on)\s+(linkedin|twitter|x|instagram|facebook|social\s+media)\b/i, reason: 'Sharing content on social media' },
  // ── Personalized outreach email preparation ──
  // Catches "draft personalized outreach emails", "prepare outreach campaign", etc.
  // Does NOT catch a single targeted follow-up draft.
  { pattern: /\b(draft|write|create|prepare)\s+(personalized\s+)?outreach\s+emails?\b/i, reason: 'Preparing personalized outreach emails for external sending' },
  { pattern: /\bpersonalized\s+outreach\s+(emails?|campaign|sequence|messages?)\b/i, reason: 'Personalized outreach campaign preparation' },
  // ── Generic publish-content (no channel keyword required) ──
  // Catches "publish article now", "publish the blog post", "publish this post"
  // Does NOT catch "create a post" or "draft a blog post".
  { pattern: /\bpublish\s+(the\s+|this\s+|an?\s+|my\s+)?(?:article|blog\s+post|post|content|piece|update|page|video)\b/i, reason: 'Publishing a content item to a public channel' },
  // ── Email drafts addressed to a group / team (with explicit audience) ──
  // Catches "draft email to team", "write email to all staff", "prepare email to leads"
  // Does NOT catch "write email draft" with no audience or a single named recipient.
  { pattern: /\b(draft|write|create|prepare)\s+(an?\s+)?e?-?mails?\s+(to|for)\s+(the\s+)?(team|company|whole\s+\w+|leads?|contacts?|prospects?|customers?|subscribers?|all\s+(of\s+(the|my)\s+)?(users?|customers?|clients?|staff|employees?|subscribers?|contacts?|people|leads?|members?))\b/i, reason: 'Email draft addressed to a group or team' },
]

/**
 * Patterns that indicate a recurring / scheduled request.
 * These must be routed through compile_operation, NOT direct inline execution.
 * Checked BEFORE DIRECT_EXECUTION_PATTERNS so "find 10 leads per day" is NOT treated as direct.
 */
export const RECURRING_TEXT_PATTERNS: ReadonlyArray<RegExp> = [
  /\b(daily|weekly|monthly|hourly)\b/i,
  /\bper\s+(day|week|month|hour)\b/i,
  /\bevery\s+(day|week|month|morning|evening|night|hour|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|\d+\s*(hours?|days?|weeks?))\b/i,
  /\bevery\s+\w+\s+(morning|evening|night|at\s+\d)\b/i,
  /\beach\s+(day|week|morning|evening|Monday|Tuesday|Wednesday|Thursday|Friday)\b/i,
  /\b(ongoing|recurring|on\s+a\s+schedule|on\s+repeat|automatically\s+(each|every))\b/i,
  // ── One-shot scheduling / follow-up phrases ──
  // "Schedule a follow-up", "schedule follow-up in 3 days", "remind me in 2 days"
  /\bschedule\s+(a\s+)?follow.?up\b/i,
  /\bfollow.?up\s+(in|after)\s+\d+\s+(days?|weeks?|hours?)\b/i,
  /\bremind\s+(me\s+)(in|after)\s+\d+\s+(days?|weeks?|hours?|minutes?)\b/i,
  // ── Relative-time follow-up / reminder phrases (no numeric qualifier needed) ──
  // "remind me next week", "follow up tomorrow", "check back next Monday"
  /\bremind\s+me\s+(next\s+(week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|tomorrow|later\s+today)\b/i,
  /\bfollow.?up\s+(next\s+(week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|tomorrow|later\s+today)\b/i,
  // ── "Check again / check back in N hours" ──
  // "check again in 1 hour", "look back in 2 days"
  /\b(check\s+(again|back)|look\s+(again|back))\s+(in|after)\s+\d+\s+(hours?|days?|weeks?|minutes?)\b/i,
]

/**
 * Patterns that indicate a task is a bounded, directly-executable action.
 * Domain-agnostic: covers any object type at a small scale (≤25 items).
 * Matched case-insensitively against task description.
 */
const DIRECT_EXECUTION_PATTERNS: RegExp[] = [
  // ── Single-record writes (any common object type) ──
  /create\s+(a\s+)?(company|deal|contact|record|lead|ticket|issue|task|event|file|note|pr|pull.request|branch|repo|post|draft)\b/i,
  /add\s+(a\s+)?(company|deal|contact|record|lead|ticket|issue|task|event|entry|note)\b/i,
  /update\s+(a\s+)?(record|deal|contact|stage|field|task|ticket|issue|item|status|note)\b/i,
  /move\s+(a\s+)?(deal|record|card|task|ticket)\s+(to|into)\b/i,
  // ── Integration / connection checks ──
  /verify\s+(the\s+)?(connection|integration|connector|api)\b/i,
  /test\s+(the\s+)?(connection|integration|connector|api)\b/i,
  /check\s+(the\s+)?(pipeline|balance|status|connection|integration|health)\b/i,
  /list\s+(all\s+)?(deals|contacts|companies|records|tasks|issues|tickets|files|repos|branches|users)\b/i,
  /(?:read|fetch)\s+from\s+(attio|hubspot|github|slack|stripe|airtable|notion|jira|linear)\b/i,
  /get\s+(my\s+)?(deals|contacts|leads|pipeline|tasks|issues|repos|branches)\b/i,
  // ── Bounded-count tasks (1–25 items, ANY domain) ──
  // "find 5 leads", "create 10 GitHub issues", "summarize 3 articles", "fix 8 bugs"
  // Range: 1-9 (single digit) | 10-25 (two-digit up to 25: 1[0-9] or 2[0-5])
  /\b(?:find|get|fetch|source|add|create|summarize|analyze|review|write|send|fix|close|resolve|process)\s+(?:me\s+)?(?:the\s+)?([1-9]|1\d|2[0-5])\s+\w+/i,
]

/**
 * Patterns that indicate a task is clearly large-batch, unbounded, or complex background work.
 * Domain-agnostic: detects by SCALE and COMPLEXITY, not by domain-specific nouns.
 * Threshold: 26+ items for simple verbs; 11+ items for intensive research/audit verbs;
 * OR explicit depth/intensity qualifier; OR browser-heavy work; OR open-ended research.
 * Note: recurring/scheduling patterns are handled separately by RECURRING_TEXT_PATTERNS.
 */
const BACKGROUND_AGENT_PATTERNS: RegExp[] = [
  // ── Large-batch scale (26+ items, broad verb set) ──
  // Note: DIRECT_EXECUTION_PATTERNS checks ≤25 first, so this only fires for 26+ after DIRECT fails.
  // "find 100 companies", "process 500 invoices", "generate 26 reports", "archive 100 old emails"
  /\b(?:find|get|fetch|source|add|create|process|analyze|scrape|collect|extract|send|generate|review|fix|resolve|archive|migrate|convert|export|import|backup|scan|label|tag|index|sort|clean)\s+(?:me\s+)?\d{2,}\s+\w+/i,
  // ── Research / audit verb + any count ≥2 digits (e.g. "research 50 companies") ──
  // Intensive verbs warrant background delegation even at medium counts.
  /\b(?:research|investigate|audit|study)\s+(?:me\s+)?\d{2,}\s+\w+/i,
  // ── Research / analysis with a depth or intensity qualifier (any count or none) ──
  // "Research market deeply", "analyze in depth", "thoroughly investigate the sector"
  /\b(research|investigate|analyze|audit|study)\b.{0,80}\b(deeply|in\s+depth|thoroughly|extensively|comprehensively|in\s+detail)\b/i,
  /\b(deeply|in\s+depth|thoroughly|extensively|comprehensively)\b.{0,80}\b(research|investigate|analyze|audit|study)\b/i,
  // ── Open-ended market / industry / competition research (no count needed) ──
  // "Research the market", "analyze competition", "audit the landscape"
  /\b(research|investigate|analyze|audit)\s+(the\s+)?(market|industry|competition|competitors?|landscape|sector|space|domain|field)\b/i,
  // ── Open-ended / deep research (long free-form) ──
  /\bresearch\s+.{30,}/i,
  /\bdeep\s+(?:dive|research|analysis|investigate|look|audit)\b/i,
  /\bcomprehensive\s+(?:analysis|research|audit|review|report)\b/i,
  // ── Browser-heavy operations ──
  /\bbrowse\s+\d+\s+pages?\b/i,
  /\bscrape\b/i,
  /\bcrawl\b/i,
  // ── Bulk outreach (large, not small personal sends) ──
  /\bsend\s+emails?\s+to\s+\d+\b/i,
  /\boutreach\s+(campaign|blast|sequence|program)\b/i,
  // ── Long-form content creation ──
  // Explicit word count 500+ words: "write 1500 word article", "write a 2000-word blog post"
  /\bwrite\b.{0,30}\b(?:[5-9]\d{2}|\d{4,})\s*[- ]?words?\b/i,
  // Explicitly large content type with quality/length qualifier
  /\bwrite\s+(a\s+)?(?:comprehensive|full.?length|in.?depth|detailed|exhaustive)\s+(?:blog\s+post|article|guide|report|essay|whitepaper|ebook)\b/i,
  /\blong.?form\s+(?:content|article|blog\s+post|piece|essay|guide|report|copy)\b/i,
  // ── High-count lead/contact qualifiers ──
  // "(500+)" parenthetical count: "find enterprise leads (500+)"
  /\b(?:leads?|contacts?|prospects?|companies|people|customers?)\b.{0,25}\(\s*\d{3,}\s*\+\s*\)/i,
  // "hundreds of leads", "thousands of prospects"
  /\b(hundreds?|thousands?)\s+of\s+(?:leads?|contacts?|prospects?|companies|people|customers?)\b/i,
]

// ─────────────────────────────────────────────────────────────────────────────
// Core classifier
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify an intended action into an execution mode and risk band.
 *
 * @example
 * const cls = classifyExecution({ taskDescription: 'create a deal in Attio', actionType: 'integration_attio_create_deal' })
 * // → { mode: 'direct_execute', risk: 'safe', canProceedImmediately: true, reason: '...' }
 */
export function classifyExecution(ctx: ExecutionContext): ExecutionClassification {
  const { taskDescription, actionType = '', retryCount = 0 } = ctx
  const lower = taskDescription.toLowerCase()

  // ── Risk assessment ──────────────────────────────────────────────────────

  const isAlwaysBlocked = ALWAYS_APPROVAL_REQUIRED.has(actionType)
  const isAlwaysSafe    = ALWAYS_SAFE.has(actionType)

  const needsApproval =
    isAlwaysBlocked ||
    ctx.isFinancial === true ||
    ctx.isDestructive === true ||
    (ctx.isCommunication === true && ctx.isIrreversible === true)

  const risk: RiskBand = needsApproval ? 'approval_required' : 'safe'

  if (needsApproval) {
    return {
      mode: 'needs_confirmation',
      risk,
      reason: isAlwaysBlocked
        ? `Action type "${actionType}" always requires user approval`
        : 'Dangerous/irreversible operation — user confirmation required',
      canProceedImmediately: false,
    }
  }

  // Text-based destructive detection (catches "delete all deals" even without explicit flags)
  const destructiveMatch = DESTRUCTIVE_TEXT_PATTERNS.find(({ pattern }) => pattern.test(taskDescription))
  if (destructiveMatch) {
    return {
      mode: 'needs_confirmation',
      risk: 'approval_required',
      reason: `Destructive request detected: ${destructiveMatch.reason}`,
      canProceedImmediately: false,
    }
  }

  if (isAlwaysSafe) {
    return {
      mode: 'direct_execute',
      risk: 'safe',
      reason: `"${actionType}" is a read-only / navigation action — execute immediately`,
      canProceedImmediately: true,
    }
  }

  // ── Mode selection ────────────────────────────────────────────────────────

  // Integration/CRM direct-execute
  if (
    actionType.startsWith('integration_') ||
    actionType.startsWith('github_') ||
    actionType === 'integration_call'
  ) {
    return {
      mode: 'direct_execute',
      risk: 'safe',
      reason: `Integration tool "${actionType}" — execute directly; handle errors inline`,
      canProceedImmediately: true,
    }
  }

  // Recurring / scheduled requests → compile_operation path, NOT direct inline or create_agent
  const isRecurring = RECURRING_TEXT_PATTERNS.some(p => p.test(taskDescription))
  if (isRecurring) {
    return {
      mode: 'recurring_operation',
      risk: 'safe',
      reason: 'Recurring/scheduled task — route through compile_operation, do not execute inline or create_agent immediately',
      canProceedImmediately: true,
    }
  }

  // Pattern-match against description
  const isDirectByDescription = DIRECT_EXECUTION_PATTERNS.some(p => p.test(lower))
  if (isDirectByDescription && retryCount < 2) {
    return {
      mode: 'direct_execute',
      risk: 'safe',
      reason: 'Task matches direct-execute pattern — call integration tools inline',
      canProceedImmediately: true,
    }
  }

  const isBackgroundByDescription = BACKGROUND_AGENT_PATTERNS.some(p => p.test(lower))
  if (isBackgroundByDescription) {
    return {
      mode: 'background_agent',
      risk: 'safe',
      reason: 'Task is long-running or multi-step — delegate to background agent',
      canProceedImmediately: true,
    }
  }

  // Default: direct execute for routine work
  return {
    mode: 'direct_execute',
    risk: 'safe',
    reason: 'Default: execute directly; escalate only on repeated failure',
    canProceedImmediately: true,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Integration error diagnosis
// ─────────────────────────────────────────────────────────────────────────────

export interface ErrorDiagnosis {
  /** Human-readable root cause. */
  cause: string
  /** Suggested correction to apply before retrying. */
  fix: string
  /** Whether automatic retry makes sense. */
  shouldRetry: boolean
  /** Whether the error is terminal (user must intervene). */
  isTerminal: boolean
}

/**
 * Parse a raw integration tool error and return a structured diagnosis.
 * Used by the attempt→diagnose→retry loop.
 */
export function diagnoseIntegrationError(rawError: string): ErrorDiagnosis {
  const e = rawError.toLowerCase()

  if (/4[0-9]{2}.*plural|singular|slug|format/i.test(rawError) || /invalid.*slug/i.test(rawError)) {
    return {
      cause: 'Wrong attribute slug format (likely singular instead of plural, or incorrect casing)',
      fix: 'Call inspect_workspace to get canonical attribute slugs, then retry with the corrected slug',
      shouldRetry: true,
      isTerminal: false,
    }
  }

  if (/400|bad.request|validation.error|missing.required/i.test(rawError)) {
    return {
      cause: 'HTTP 400 — invalid or missing field in the request body',
      fix: 'Read the exact error message for which field is wrong, then fix the value and retry',
      shouldRetry: true,
      isTerminal: false,
    }
  }

  if (/invalid.*stage|stage.not.found|unknown.*status/i.test(rawError)) {
    return {
      cause: 'Stage/status name not recognised by the workspace',
      fix: 'Call inspect_workspace or get_deal_stages to list valid stage names, then retry',
      shouldRetry: true,
      isTerminal: false,
    }
  }

  if (/record.not.found|404|not.found/i.test(rawError)) {
    return {
      cause: 'Referenced record ID does not exist',
      fix: 'Fetch the record list first to obtain a valid record ID, then retry',
      shouldRetry: true,
      isTerminal: false,
    }
  }

  if (/401|403|unauthorized|forbidden|api.key|invalid.key/i.test(rawError)) {
    return {
      cause: 'Authentication failure — API key is missing, revoked, or lacks required scope',
      fix: 'User must reconnect the integration via Settings → Integrations',
      shouldRetry: false,
      isTerminal: true,
    }
  }

  if (/rate.limit|429|too.many.request/i.test(rawError)) {
    return {
      cause: 'Rate limit hit',
      fix: 'Wait 30–60 s and retry',
      shouldRetry: true,
      isTerminal: false,
    }
  }

  if (/timeout|network|econnreset|econnrefused|etimedout/i.test(rawError)) {
    return {
      cause: 'Network/connectivity error',
      fix: 'Retry immediately — this is likely transient',
      shouldRetry: true,
      isTerminal: false,
    }
  }

  if (/500|502|503|internal.server/i.test(rawError)) {
    return {
      cause: 'Server-side error from the integration provider',
      fix: 'Retry once after a short delay',
      shouldRetry: true,
      isTerminal: false,
    }
  }

  return {
    cause: 'Unknown error — inspect raw error message',
    fix: 'Read the exact error returned by the tool, fix the most likely field issue, retry once',
    shouldRetry: true,
    isTerminal: false,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress message formatter
// ─────────────────────────────────────────────────────────────────────────────

export type ProgressStepStatus = 'running' | 'done' | 'failed' | 'blocked' | 'retrying'

export interface ProgressStep {
  index: number
  total: number
  label: string
  status: ProgressStepStatus
  detail?: string
}

/**
 * Format a progress step into a concise, consistent user-facing string.
 *
 * @example
 * formatProgressStep({ index: 1, total: 3, label: 'Searching for leads', status: 'done', detail: 'Found 14' })
 * // → "✅ Step 1/3: Searching for leads — Found 14"
 */
export function formatProgressStep(step: ProgressStep): string {
  const prefix = {
    running: `🔍 Step ${step.index}/${step.total}:`,
    done:    `✅ Step ${step.index}/${step.total}:`,
    failed:  `❌ Step ${step.index}/${step.total}:`,
    blocked: `⚠️ Step ${step.index}/${step.total}:`,
    retrying:`🔄 Step ${step.index}/${step.total}:`,
  }[step.status]

  return step.detail
    ? `${prefix} ${step.label} — ${step.detail}`
    : `${prefix} ${step.label}`
}

/**
 * Format a terminal summary after a multi-step operation.
 *
 * @example
 * formatRunSummary({ done: 8, failed: 2, total: 10, entity: 'deal' })
 * // → "📊 Done: 8/10 deals created. 2 failed."
 */
export function formatRunSummary(opts: {
  done: number
  failed: number
  total: number
  entity: string
}): string {
  const { done, failed, total, entity } = opts
  const plural = total === 1 ? entity : `${entity}s`
  if (failed === 0) return `📊 Done: ${done}/${total} ${plural} created.`
  return `📊 Done: ${done}/${total} ${plural} created. ${failed} failed.`
}
