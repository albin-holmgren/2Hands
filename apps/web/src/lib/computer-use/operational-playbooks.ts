/**
 * Operational Playbooks — Continuous Task Engine
 *
 * Classifies tasks into operational categories (support, outreach, lead gen,
 * accounting, etc.) and provides structured run playbooks with:
 *   - Step-by-step workflows for each run
 *   - State checkpointing between runs
 *   - Suggested schedules
 *   - Work summary templates
 */

// ============================================================
// Task Classification
// ============================================================

export type OperationalCategory =
  | 'email_support'
  | 'outreach'
  | 'lead_generation'
  | 'accounting'
  | 'social_media'
  | 'order_management'
  | 'data_entry'
  | 'monitoring'
  | 'reporting'
  | 'content_creation'
  | 'recruitment'
  | 'customer_success'
  | null // not an operational/recurring task

export interface TaskClassification {
  category: OperationalCategory
  confidence: number // 0-1
  isRecurring: boolean
  suggestedCron: string
  suggestedScheduleLabel: string
  playbook: OperationalPlaybook | null
}

export interface OperationalPlaybook {
  id: string
  name: string
  category: OperationalCategory
  description: string
  /** Step-by-step workflow the agent follows each run */
  runWorkflow: PlaybookStep[]
  /** What to persist between runs */
  checkpointFields: string[]
  /** Instructions for the agent at run start */
  runStartInstructions: string
  /** Template for the work summary at run end */
  summaryTemplate: string
  /** Safety guardrails for this category */
  guardrails: string[]
}

export interface PlaybookStep {
  order: number
  action: string
  details: string
  /** If true, the agent should report_insight after this step */
  reportAfter: boolean
}

// ============================================================
// Classification Logic
// ============================================================

interface CategoryPattern {
  category: OperationalCategory
  patterns: string[]
  weight: number // higher = stronger signal
}

const CATEGORY_PATTERNS: CategoryPattern[] = [
  {
    category: 'email_support',
    patterns: [
      'support email', 'customer support', 'help desk', 'respond to email',
      'answer email', 'reply to customer', 'handle ticket', 'support ticket',
      'inbox', 'customer email', 'support queue', 'email support',
      'customer service', 'handle inquir', 'respond to inquir',
      'act as support', 'be our support', 'manage support',
      'freshdesk', 'zendesk', 'intercom', 'helpdesk',
    ],
    weight: 2,
  },
  {
    category: 'outreach',
    patterns: [
      'outreach', 'reach out', 'contact lead', 'email lead',
      'cold email', 'follow up', 'follow-up', 'nurture',
      'drip campaign', 'sales email', 'prospect',
      'send message to lead', 'contact prospect', 'sales outreach',
      'linkedin outreach', 'email outreach', 'cold outreach',
      'message lead', 'engage lead',
    ],
    weight: 2,
  },
  {
    category: 'lead_generation',
    patterns: [
      'find lead', 'generate lead', 'new lead', 'lead gen',
      'find prospect', 'find customer', 'find client',
      'build list', 'prospect list', 'lead list',
      'scrape', 'find compan', 'find people', 'find contact',
      'apollo', 'hunter.io', 'linkedin sales',
      'identify potential', 'target audience',
    ],
    weight: 2,
  },
  {
    category: 'accounting',
    patterns: [
      'accounting', 'bookkeeping', 'invoice', 'expense',
      'reconcil', 'categorize transaction', 'bank transaction',
      'quickbooks', 'xero', 'freshbooks', 'wave accounting',
      'p&l', 'profit and loss', 'balance sheet',
      'accounts payable', 'accounts receivable', 'tax',
      'financial report', 'do my accounting', 'manage finance',
    ],
    weight: 2,
  },
  {
    category: 'social_media',
    patterns: [
      'social media', 'post on', 'schedule post',
      'instagram post', 'twitter post', 'linkedin post', 'facebook post',
      'manage social', 'social account', 'engage follower',
      'comment', 'reply to comment', 'moderate', 'community manag',
      'grow follower', 'engagement', 'social presence',
    ],
    weight: 1.5,
  },
  {
    category: 'order_management',
    patterns: [
      'order', 'fulfil', 'ship', 'inventory',
      'shopify order', 'process order', 'track order',
      'customer order', 'return', 'refund request',
      'stock level', 'restock', 'warehouse',
    ],
    weight: 2,
  },
  {
    category: 'data_entry',
    patterns: [
      'data entry', 'enter data', 'update spreadsheet', 'fill in',
      'update crm', 'log data', 'record data', 'input data',
      'update database', 'transfer data', 'migrate data',
      'copy from', 'move data', 'sync data',
      'into our crm', 'into the crm', 'contacts from', 'new contacts',
      'import data', 'upload data', 'spreadsheet into',
    ],
    weight: 1.5,
  },
  {
    category: 'monitoring',
    patterns: [
      'monitor', 'watch for', 'alert', 'check for change',
      'track price', 'track competitor', 'track mention',
      'brand mention', 'review monitoring', 'uptime',
      'keep an eye', 'notify me', 'watch',
    ],
    weight: 1.5,
  },
  {
    category: 'reporting',
    patterns: [
      'report', 'analytics', 'dashboard', 'metric',
      'kpi', 'weekly report', 'daily report', 'monthly report',
      'summary report', 'performance report', 'sales report',
      'compile report', 'gather metric', 'pull number',
    ],
    weight: 1.5,
  },
  {
    category: 'content_creation',
    patterns: [
      'write blog', 'create content', 'write article',
      'newsletter', 'email campaign', 'marketing email',
      'write copy', 'product description', 'seo content',
      'mailchimp', 'convertkit', 'substack',
      'blog post', 'content calendar', 'editorial',
    ],
    weight: 2,
  },
  {
    category: 'recruitment',
    patterns: [
      'recruit', 'hiring', 'candidate', 'resume screen',
      'job posting', 'interview schedule', 'applicant',
      'talent', 'source candidate', 'linkedin recruit',
      'job board', 'screen applicant',
    ],
    weight: 2,
  },
  {
    category: 'customer_success',
    patterns: [
      'customer success', 'onboard', 'check in with customer',
      'customer health', 'churn', 'retention',
      'nps', 'satisfaction', 'customer review',
      'upsell', 'cross-sell', 'renewal',
      'at-risk', 'at risk', 'check in', 'churn risk',
      'customer check', 'health score',
    ],
    weight: 2.5,
  },
]

/**
 * Classify a task description into an operational category.
 */
export function classifyTask(taskDescription: string): TaskClassification {
  const lower = taskDescription.toLowerCase()

  let bestCategory: OperationalCategory = null
  let bestScore = 0

  for (const cp of CATEGORY_PATTERNS) {
    const matchCount = cp.patterns.filter(p => lower.includes(p)).length
    const score = matchCount * cp.weight
    if (score > bestScore) {
      bestScore = score
      bestCategory = cp.category
    }
  }

  // Confidence thresholds
  const confidence = Math.min(bestScore / 4, 1) // 4+ matches = 100%
  const isRecurring = confidence >= 0.25 // at least 1 match with weight 2, or 2 matches

  if (!isRecurring || !bestCategory) {
    return {
      category: null,
      confidence: 0,
      isRecurring: false,
      suggestedCron: '0 9 * * *',
      suggestedScheduleLabel: 'Daily at 9 AM',
      playbook: null,
    }
  }

  const schedule = SUGGESTED_SCHEDULES[bestCategory] || { cron: '0 9 * * *', label: 'Daily at 9 AM' }
  const playbook = PLAYBOOKS[bestCategory] || null

  return {
    category: bestCategory,
    confidence,
    isRecurring,
    suggestedCron: schedule.cron,
    suggestedScheduleLabel: schedule.label,
    playbook,
  }
}

// ============================================================
// Suggested Schedules
// ============================================================

const SUGGESTED_SCHEDULES: Record<NonNullable<OperationalCategory>, { cron: string; label: string }> = {
  email_support:    { cron: '*/30 * * * *', label: 'Every 30 minutes' },
  outreach:         { cron: '0 9 * * 1-5',  label: 'Weekdays at 9 AM' },
  lead_generation:  { cron: '0 9 * * 1-5',  label: 'Weekdays at 9 AM' },
  accounting:       { cron: '0 9 * * 1',    label: 'Weekly on Monday at 9 AM' },
  social_media:     { cron: '0 10 * * *',   label: 'Daily at 10 AM' },
  order_management: { cron: '0 8 * * *',    label: 'Daily at 8 AM' },
  data_entry:       { cron: '0 9 * * 1-5',  label: 'Weekdays at 9 AM' },
  monitoring:       { cron: '0 */4 * * *',  label: 'Every 4 hours' },
  reporting:        { cron: '0 8 * * 1',    label: 'Weekly on Monday at 8 AM' },
  content_creation: { cron: '0 10 * * 1,3,5', label: 'Mon/Wed/Fri at 10 AM' },
  recruitment:      { cron: '0 9 * * 1-5',  label: 'Weekdays at 9 AM' },
  customer_success: { cron: '0 9 * * 1-5',  label: 'Weekdays at 9 AM' },
}

// ============================================================
// Run Checkpoint — state between scheduled runs
// ============================================================

export interface RunCheckpoint {
  last_run_at: string
  last_run_summary: string
  /** Category-specific state */
  state: Record<string, unknown>
  /** Items processed in previous runs (to avoid re-processing) */
  processed_ids: string[]
  /** Running counters (e.g. emails_handled_today: 15) */
  counters: Record<string, number>
}

export function createEmptyCheckpoint(): RunCheckpoint {
  return {
    last_run_at: '',
    last_run_summary: '',
    state: {},
    processed_ids: [],
    counters: {},
  }
}

export function serializeCheckpoint(cp: RunCheckpoint): string {
  return JSON.stringify(cp)
}

export function deserializeCheckpoint(json: string): RunCheckpoint | null {
  try {
    return JSON.parse(json) as RunCheckpoint
  } catch {
    return null
  }
}

/**
 * Build checkpoint context for injection into the agent prompt.
 */
export function formatCheckpointForPrompt(cp: RunCheckpoint | null): string {
  if (!cp || !cp.last_run_at) return ''

  const parts: string[] = [
    '\n## Previous Run Context',
    `**Last run:** ${cp.last_run_at}`,
  ]

  if (cp.last_run_summary) {
    parts.push(`**Summary:** ${cp.last_run_summary}`)
  }

  if (cp.processed_ids.length > 0) {
    const recent = cp.processed_ids.slice(-20)
    parts.push(`**Already processed (skip these):** ${recent.join(', ')}`)
    if (cp.processed_ids.length > 20) {
      parts.push(`  (and ${cp.processed_ids.length - 20} more)`)
    }
  }

  if (Object.keys(cp.counters).length > 0) {
    parts.push('**Running totals:**')
    for (const [key, val] of Object.entries(cp.counters)) {
      parts.push(`  - ${key.replace(/_/g, ' ')}: ${val}`)
    }
  }

  if (Object.keys(cp.state).length > 0) {
    parts.push('**Saved state:**')
    for (const [key, val] of Object.entries(cp.state)) {
      parts.push(`  - ${key}: ${typeof val === 'string' ? val : JSON.stringify(val)}`)
    }
  }

  return parts.join('\n')
}

// ============================================================
// Operational Playbooks
// ============================================================

const PLAYBOOKS: Record<NonNullable<OperationalCategory>, OperationalPlaybook> = {
  email_support: {
    id: 'pb-email-support',
    name: 'Email/Ticket Support',
    category: 'email_support',
    description: 'Handle incoming support emails and tickets — triage, respond, escalate',
    runWorkflow: [
      { order: 1, action: 'Check inbox/queue', details: 'Navigate to the support inbox or ticket queue. Identify new, unread, or unresolved items since last run.', reportAfter: true },
      { order: 2, action: 'Triage & prioritize', details: 'Classify each item by urgency: critical (service down, billing error), high (feature broken), normal (question), low (feedback). Handle critical first.', reportAfter: true },
      { order: 3, action: 'Draft & send responses', details: 'For each item: read the full thread, draft a professional response, send it. For complex issues, escalate by flagging/assigning rather than guessing.', reportAfter: false },
      { order: 4, action: 'Escalate if needed', details: 'If an issue requires human judgment (refunds, account deletion, legal), flag it and report via insight. Do NOT take irreversible action.', reportAfter: true },
      { order: 5, action: 'Log & checkpoint', details: 'Use remember tool to save: how many handled, what was escalated, any patterns noticed.', reportAfter: false },
    ],
    checkpointFields: ['last_email_id', 'emails_handled', 'escalated_count', 'common_issues'],
    runStartInstructions: `You are a customer support agent. Your job is to handle incoming support emails/tickets efficiently and professionally.

WORKFLOW:
1. Go to the support inbox/tool
2. Find NEW items since your last run (check the "Already processed" list below)
3. For each new item:
   a. Read the full message/thread
   b. Classify urgency (critical/high/normal/low)
   c. Draft a helpful, professional response
   d. Send the response
   e. Note the item ID so you don't re-process it
4. Escalate anything you're unsure about — never guess on:
   - Refund/billing changes
   - Account deletion
   - Legal/compliance questions
   - Technical issues you can't diagnose
5. Report a summary of what you handled

TONE: Professional, empathetic, concise. Match the customer's language (formal/casual).
SPEED: Prioritize critical items. Aim to clear the queue each run.`,
    summaryTemplate: 'Handled {handled} support items. Escalated {escalated}. Top issues: {top_issues}.',
    guardrails: [
      'NEVER issue refunds or credits without explicit approval',
      'NEVER delete user accounts or data',
      'NEVER share internal information with customers',
      'ALWAYS escalate billing disputes',
      'ALWAYS verify customer identity before sharing account details',
    ],
  },

  outreach: {
    id: 'pb-outreach',
    name: 'Sales/Lead Outreach',
    category: 'outreach',
    description: 'Contact leads with personalized messages — email, LinkedIn, follow-ups',
    runWorkflow: [
      { order: 1, action: 'Load lead list', details: 'Navigate to CRM or lead list. Identify leads that need outreach (new leads, or leads due for follow-up). Skip already-contacted leads from checkpoint.', reportAfter: true },
      { order: 2, action: 'Research each lead', details: 'For each lead, check their company website, LinkedIn profile, recent news. Note personalization hooks (recent funding, product launch, hiring).', reportAfter: false },
      { order: 3, action: 'Craft personalized message', details: 'Write a short, personalized outreach message. Reference something specific about them. Keep it under 150 words. No generic templates.', reportAfter: false },
      { order: 4, action: 'Send message', details: 'Send via the appropriate channel (email, LinkedIn message). Log the outreach in CRM if available.', reportAfter: false },
      { order: 5, action: 'Check for replies', details: 'Check for any replies to previous outreach. Respond to interested leads, note unsubscribes/not-interested.', reportAfter: true },
      { order: 6, action: 'Log & checkpoint', details: 'Save: leads contacted this run, total contacted, replies received, meetings booked.', reportAfter: false },
    ],
    checkpointFields: ['contacted_leads', 'total_contacted', 'replies_received', 'meetings_booked', 'last_lead_index'],
    runStartInstructions: `You are a sales development rep doing personalized outreach. Your job is to contact leads with relevant, personalized messages.

WORKFLOW:
1. Go to the CRM or lead source
2. Find leads that need outreach (skip "Already processed" list)
3. For each lead (aim for 5-10 per run):
   a. Quickly research them (company, role, recent activity)
   b. Write a SHORT personalized message (under 150 words)
   c. Send via the right channel
   d. Log it
4. Check for replies to previous messages and respond
5. Report your results

OUTREACH RULES:
- ALWAYS personalize — never send generic templates
- Keep messages SHORT (3-5 sentences max)
- Reference something specific about the lead/company
- Include a clear, low-friction CTA (quick call, reply with thoughts)
- Don't be pushy — be helpful and relevant
- Respect unsubscribe/stop requests immediately`,
    summaryTemplate: 'Contacted {contacted} leads. Received {replies} replies. Booked {meetings} meetings.',
    guardrails: [
      'NEVER send more than 20 outreach messages per run',
      'ALWAYS personalize each message',
      'NEVER contact someone who asked to stop',
      'NEVER misrepresent who you are',
      'Log every outreach attempt',
    ],
  },

  lead_generation: {
    id: 'pb-lead-gen',
    name: 'Lead Generation',
    category: 'lead_generation',
    description: 'Find and qualify new leads — research, verify, enrich, add to pipeline',
    runWorkflow: [
      { order: 1, action: 'Define search criteria', details: 'Review the target criteria (industry, company size, role, geography). Check checkpoint for what was already searched.', reportAfter: false },
      { order: 2, action: 'Search for leads', details: 'Use LinkedIn, Apollo, Google, industry directories to find matching prospects. Collect: name, title, company, email/LinkedIn URL.', reportAfter: true },
      { order: 3, action: 'Verify & qualify', details: 'Check each lead: is the company a good fit? Is this the right person? Is contact info valid? Filter out poor matches.', reportAfter: false },
      { order: 4, action: 'Enrich data', details: 'For qualified leads, gather additional info: company size, funding, tech stack, recent news. This helps with personalized outreach later.', reportAfter: false },
      { order: 5, action: 'Add to pipeline', details: 'Add qualified leads to CRM/spreadsheet/list. Tag with source, date found, qualification notes.', reportAfter: true },
      { order: 6, action: 'Log & checkpoint', details: 'Save: leads found, leads qualified, sources searched, search criteria used.', reportAfter: false },
    ],
    checkpointFields: ['leads_found', 'leads_qualified', 'sources_searched', 'last_search_query'],
    runStartInstructions: `You are a lead generation specialist. Your job is to find qualified prospects that match the target profile.

WORKFLOW:
1. Review the target criteria and what was already found
2. Search using multiple sources (LinkedIn, Apollo, Google, directories)
3. For each potential lead:
   a. Verify they match the criteria
   b. Collect contact info
   c. Gather enrichment data (company info, recent news)
   d. Add to the pipeline/list
4. Report how many leads found and qualified

QUALITY RULES:
- Quality over quantity — 5 great leads > 20 bad ones
- Verify contact info when possible
- Note your confidence level for each lead
- Don't duplicate leads already in the pipeline
- Record your search methodology so it can be refined`,
    summaryTemplate: 'Found {found} potential leads. Qualified {qualified}. Added to pipeline: {added}. Sources: {sources}.',
    guardrails: [
      'NEVER scrape data in violation of site terms',
      'NEVER create fake accounts to access data',
      'Respect rate limits on search tools',
      'ALWAYS note the source of each lead',
    ],
  },

  accounting: {
    id: 'pb-accounting',
    name: 'Bookkeeping & Accounting',
    category: 'accounting',
    description: 'Categorize transactions, reconcile accounts, generate reports',
    runWorkflow: [
      { order: 1, action: 'Check for new transactions', details: 'Login to accounting tool (QuickBooks, Xero, etc.). Check for uncategorized or unreconciled transactions since last run.', reportAfter: true },
      { order: 2, action: 'Categorize transactions', details: 'Review each transaction. Assign correct category based on vendor, amount, and description. Use previous categorizations as reference.', reportAfter: false },
      { order: 3, action: 'Match & reconcile', details: 'Match bank transactions with invoices/bills. Flag any discrepancies or missing matches.', reportAfter: true },
      { order: 4, action: 'Flag anomalies', details: 'Report any unusual transactions, duplicate charges, or amounts that seem wrong. Do NOT modify — just flag for review.', reportAfter: true },
      { order: 5, action: 'Generate summary', details: 'Pull key metrics: total income, total expenses, outstanding invoices, bank balance. Report via insight.', reportAfter: true },
      { order: 6, action: 'Log & checkpoint', details: 'Save: transactions categorized, reconciled count, flagged items, date range processed.', reportAfter: false },
    ],
    checkpointFields: ['last_transaction_date', 'categorized_count', 'reconciled_count', 'flagged_items'],
    runStartInstructions: `You are a bookkeeper. Your job is to keep the books accurate and up-to-date.

WORKFLOW:
1. Login to the accounting tool
2. Find new/uncategorized transactions since your last run
3. For each transaction:
   a. Determine the correct category
   b. Match with invoice/bill if applicable
   c. Flag anything unusual
4. Report a summary of the financial state

ACCOUNTING RULES:
- NEVER modify or delete transactions without explicit approval
- NEVER create invoices or process payments without approval
- When unsure about categorization, flag it rather than guess
- Always double-check amounts before any changes
- Report any discrepancies immediately
- Keep notes on categorization decisions for consistency`,
    summaryTemplate: 'Processed {processed} transactions. Categorized {categorized}. Flagged {flagged} for review. Outstanding invoices: {outstanding}.',
    guardrails: [
      'NEVER create, modify, or void invoices without approval',
      'NEVER process payments or refunds',
      'NEVER change account settings or chart of accounts',
      'ALWAYS flag unusual transactions instead of categorizing them',
      'NEVER modify closed accounting periods',
    ],
  },

  social_media: {
    id: 'pb-social-media',
    name: 'Social Media Management',
    category: 'social_media',
    description: 'Manage social presence — post content, engage, monitor mentions',
    runWorkflow: [
      { order: 1, action: 'Check notifications', details: 'Login to social accounts. Check mentions, comments, DMs, and notifications since last run.', reportAfter: true },
      { order: 2, action: 'Respond to engagement', details: 'Reply to relevant comments and DMs. Like/acknowledge positive mentions. Flag negative feedback for review.', reportAfter: false },
      { order: 3, action: 'Post scheduled content', details: 'If content is queued/approved, post it. Follow the content calendar if one exists.', reportAfter: true },
      { order: 4, action: 'Monitor competitors', details: 'Quick check on competitor activity. Note any significant posts or campaigns.', reportAfter: false },
      { order: 5, action: 'Log & checkpoint', details: 'Save: notifications handled, posts made, engagement metrics.', reportAfter: false },
    ],
    checkpointFields: ['last_notification_check', 'posts_made', 'comments_replied', 'dms_handled'],
    runStartInstructions: `You are a social media manager. Your job is to maintain an active, engaging social presence.

WORKFLOW:
1. Check all social accounts for new activity
2. Respond to comments, DMs, and mentions
3. Post any scheduled/approved content
4. Note any trends or competitor activity
5. Report engagement summary

SOCIAL RULES:
- NEVER post content without prior approval (unless pre-approved in content calendar)
- NEVER engage in arguments or controversial topics
- Be on-brand: professional but approachable
- Report negative feedback/complaints for escalation
- Track what types of content get the most engagement`,
    summaryTemplate: 'Handled {notifications} notifications. Replied to {comments} comments, {dms} DMs. Posted {posts} items.',
    guardrails: [
      'NEVER post without approval unless content is pre-approved',
      'NEVER engage in controversial discussions',
      'NEVER delete comments without approval',
      'ALWAYS flag negative reviews/comments for human review',
      'Be mindful that all actions are public',
    ],
  },

  order_management: {
    id: 'pb-orders',
    name: 'Order Management',
    category: 'order_management',
    description: 'Process orders, track fulfillment, handle returns',
    runWorkflow: [
      { order: 1, action: 'Check new orders', details: 'Login to store admin. Check for new, unfulfilled orders since last run.', reportAfter: true },
      { order: 2, action: 'Process orders', details: 'For each new order: verify payment status, check inventory, prepare for fulfillment. Flag any issues.', reportAfter: false },
      { order: 3, action: 'Handle returns/refunds', details: 'Check for return requests or refund queries. Report these — do NOT process refunds without approval.', reportAfter: true },
      { order: 4, action: 'Update inventory', details: 'Check low-stock items. Report any items that need reordering.', reportAfter: true },
      { order: 5, action: 'Log & checkpoint', details: 'Save: orders processed, returns flagged, inventory alerts.', reportAfter: false },
    ],
    checkpointFields: ['last_order_id', 'orders_processed', 'returns_flagged', 'low_stock_items'],
    runStartInstructions: `You are an order management specialist. Your job is to keep orders moving smoothly.

WORKFLOW:
1. Check for new orders in the store admin
2. Verify and process each order
3. Handle any return/refund requests (flag for approval)
4. Check inventory levels
5. Report summary

ORDER RULES:
- NEVER process refunds without explicit approval
- NEVER cancel orders without confirmation
- Flag any suspicious orders (unusual amounts, addresses)
- Track inventory carefully
- Report any fulfillment delays`,
    summaryTemplate: 'Processed {processed} orders. Flagged {returns} returns. Low stock alerts: {low_stock}.',
    guardrails: [
      'NEVER process refunds without approval',
      'NEVER cancel orders without confirmation',
      'NEVER change product prices',
      'Flag suspicious orders for review',
    ],
  },

  data_entry: {
    id: 'pb-data-entry',
    name: 'Data Entry & CRM Updates',
    category: 'data_entry',
    description: 'Enter, update, and maintain data in CRM/spreadsheets',
    runWorkflow: [
      { order: 1, action: 'Identify pending data', details: 'Check for new data that needs entry — new contacts, updated records, imported files.', reportAfter: true },
      { order: 2, action: 'Enter/update data', details: 'Process each item: enter new records, update existing ones, validate fields.', reportAfter: false },
      { order: 3, action: 'Validate & clean', details: 'Check for duplicates, missing fields, incorrect formats. Fix what you can, flag what you can\'t.', reportAfter: true },
      { order: 4, action: 'Log & checkpoint', details: 'Save: records processed, errors found, records created vs updated.', reportAfter: false },
    ],
    checkpointFields: ['records_processed', 'records_created', 'records_updated', 'errors_found'],
    runStartInstructions: `You are a data entry specialist. Your job is to keep data accurate and complete.

WORKFLOW:
1. Find new data that needs to be entered
2. Enter or update records carefully
3. Validate data quality
4. Report any issues or anomalies

DATA RULES:
- NEVER delete records without approval
- Double-check all entries before saving
- Flag duplicates rather than deleting them
- Maintain consistent formatting
- Note any data quality issues`,
    summaryTemplate: 'Processed {processed} records ({created} new, {updated} updated). Found {errors} data issues.',
    guardrails: [
      'NEVER delete records without approval',
      'Double-check entries before saving',
      'Flag duplicates instead of deleting',
      'Report data quality issues',
    ],
  },

  monitoring: {
    id: 'pb-monitoring',
    name: 'Web Monitoring & Alerts',
    category: 'monitoring',
    description: 'Monitor websites, prices, mentions, competitors for changes',
    runWorkflow: [
      { order: 1, action: 'Check monitored items', details: 'Visit each monitored URL/source. Compare current state with last checkpoint.', reportAfter: false },
      { order: 2, action: 'Detect changes', details: 'Note any significant changes: price changes, new content, status changes, mentions.', reportAfter: true },
      { order: 3, action: 'Report findings', details: 'Report all detected changes via insight. Include before/after comparison.', reportAfter: true },
      { order: 4, action: 'Log & checkpoint', details: 'Save current state for next comparison. Record what was checked and when.', reportAfter: false },
    ],
    checkpointFields: ['last_check_results', 'changes_detected', 'urls_monitored'],
    runStartInstructions: `You are a monitoring agent. Your job is to detect and report changes in monitored targets.

WORKFLOW:
1. Visit each monitored target
2. Compare with previous state (see checkpoint below)
3. Report any significant changes immediately
4. Save current state for next run

MONITORING RULES:
- Report changes clearly with before/after comparison
- Don't report insignificant changes (cosmetic updates, timestamps)
- Flag any access issues (site down, login required)
- Be thorough — check all monitored items each run`,
    summaryTemplate: 'Checked {checked} targets. Detected {changes} changes. Details: {details}.',
    guardrails: [
      'Report changes factually — no speculation',
      'Don\'t interact with monitored sites beyond reading',
      'Flag any access problems immediately',
    ],
  },

  reporting: {
    id: 'pb-reporting',
    name: 'Business Reporting',
    category: 'reporting',
    description: 'Compile reports from multiple sources — metrics, KPIs, summaries',
    runWorkflow: [
      { order: 1, action: 'Gather data', details: 'Login to each data source (analytics, CRM, finance tool, etc.). Collect key metrics for the reporting period.', reportAfter: true },
      { order: 2, action: 'Compile report', details: 'Organize data into a structured report. Calculate trends, comparisons (vs last period, vs target).', reportAfter: false },
      { order: 3, action: 'Highlight insights', details: 'Call out notable trends: improvements, declines, anomalies, records. Use report_insight for each key finding.', reportAfter: true },
      { order: 4, action: 'Deliver report', details: 'Format the final report and deliver it (post in tool, send via email, etc.).', reportAfter: true },
      { order: 5, action: 'Log & checkpoint', details: 'Save: reporting period, key metrics, delivery confirmation.', reportAfter: false },
    ],
    checkpointFields: ['last_report_date', 'last_report_period', 'key_metrics'],
    runStartInstructions: `You are a business analyst. Your job is to compile accurate, insightful reports.

WORKFLOW:
1. Gather data from all relevant sources
2. Compile into a structured report
3. Highlight key insights and trends
4. Deliver the report

REPORTING RULES:
- Always cite data sources
- Compare with previous periods when possible
- Highlight both good and bad trends
- Use specific numbers, not vague descriptions
- Flag any data access issues`,
    summaryTemplate: 'Compiled report for {period}. Key metrics: {metrics}. Notable: {highlights}.',
    guardrails: [
      'Always cite data sources',
      'Report data accurately — never fabricate metrics',
      'Flag any data access issues',
    ],
  },

  content_creation: {
    id: 'pb-content',
    name: 'Content Creation',
    category: 'content_creation',
    description: 'Write blog posts, newsletters, marketing emails, social content',
    runWorkflow: [
      { order: 1, action: 'Check content calendar', details: 'Review what content is due. Check for any briefs, topics, or guidelines.', reportAfter: true },
      { order: 2, action: 'Research topic', details: 'Research the topic: check trending discussions, competitor content, relevant data.', reportAfter: false },
      { order: 3, action: 'Draft content', details: 'Write the content piece. Follow brand guidelines, tone, and format requirements.', reportAfter: true },
      { order: 4, action: 'Review & submit', details: 'Self-review the draft. Submit for approval — do NOT publish directly.', reportAfter: true },
      { order: 5, action: 'Log & checkpoint', details: 'Save: content created, topics covered, drafts submitted.', reportAfter: false },
    ],
    checkpointFields: ['content_created', 'topics_covered', 'drafts_pending'],
    runStartInstructions: `You are a content creator. Your job is to produce high-quality content on schedule.

WORKFLOW:
1. Check what content is due
2. Research the topic thoroughly
3. Write the content
4. Submit for review (do NOT publish)

CONTENT RULES:
- NEVER publish content without approval
- Follow brand voice and guidelines
- Research before writing — include real data/examples
- Keep to the appropriate length and format
- Draft first, then refine`,
    summaryTemplate: 'Created {created} content pieces. Topics: {topics}. Status: {status}.',
    guardrails: [
      'NEVER publish without approval',
      'Follow brand guidelines',
      'Include proper attribution for sources',
      'Don\'t plagiarize',
    ],
  },

  recruitment: {
    id: 'pb-recruitment',
    name: 'Recruitment & Sourcing',
    category: 'recruitment',
    description: 'Source candidates, screen resumes, schedule interviews',
    runWorkflow: [
      { order: 1, action: 'Check open positions', details: 'Review active job postings and hiring needs. Note required qualifications and priorities.', reportAfter: true },
      { order: 2, action: 'Source candidates', details: 'Search LinkedIn, job boards, and other sources for matching candidates. Skip already-reviewed candidates.', reportAfter: true },
      { order: 3, action: 'Screen candidates', details: 'Review each candidate: check experience, skills, qualifications against requirements. Rate fit.', reportAfter: false },
      { order: 4, action: 'Prepare shortlist', details: 'Compile top candidates with notes on why they fit. Report via insight.', reportAfter: true },
      { order: 5, action: 'Log & checkpoint', details: 'Save: candidates reviewed, shortlisted, positions filled.', reportAfter: false },
    ],
    checkpointFields: ['candidates_reviewed', 'candidates_shortlisted', 'positions_open'],
    runStartInstructions: `You are a recruiter. Your job is to find and screen qualified candidates.

WORKFLOW:
1. Review open positions and requirements
2. Search for matching candidates
3. Screen each candidate against requirements
4. Build a shortlist with notes
5. Report your findings

RECRUITMENT RULES:
- Focus on qualifications and experience
- Don't make decisions based on protected characteristics
- Note specific reasons for including/excluding candidates
- Respect candidate privacy
- Don't contact candidates without approval`,
    summaryTemplate: 'Reviewed {reviewed} candidates for {positions} positions. Shortlisted {shortlisted}.',
    guardrails: [
      'NEVER contact candidates without approval',
      'Base decisions on qualifications only',
      'Respect candidate privacy',
      'Document screening rationale',
    ],
  },

  customer_success: {
    id: 'pb-customer-success',
    name: 'Customer Success',
    category: 'customer_success',
    description: 'Monitor customer health, handle check-ins, identify churn risk',
    runWorkflow: [
      { order: 1, action: 'Check customer health', details: 'Review customer metrics: usage, support tickets, billing status. Identify at-risk accounts.', reportAfter: true },
      { order: 2, action: 'Prepare check-ins', details: 'For accounts due for check-in: review their history, prepare talking points, draft outreach message.', reportAfter: false },
      { order: 3, action: 'Send check-in messages', details: 'Reach out to accounts due for contact. Be genuinely helpful — ask about their experience, offer assistance.', reportAfter: true },
      { order: 4, action: 'Handle at-risk accounts', details: 'For at-risk accounts: flag for immediate attention, draft retention offers if appropriate.', reportAfter: true },
      { order: 5, action: 'Log & checkpoint', details: 'Save: accounts checked, at-risk flagged, check-ins sent.', reportAfter: false },
    ],
    checkpointFields: ['accounts_checked', 'at_risk_flagged', 'check_ins_sent', 'last_customer_id'],
    runStartInstructions: `You are a customer success manager. Your job is to keep customers happy and engaged.

WORKFLOW:
1. Review customer health metrics
2. Identify accounts needing attention
3. Send check-in messages to accounts due
4. Flag at-risk accounts for escalation
5. Report summary

CS RULES:
- Be genuinely helpful, not salesy
- Prioritize at-risk accounts
- Don't promise features or discounts without approval
- Track all customer interactions
- Report patterns (common complaints, feature requests)`,
    summaryTemplate: 'Checked {checked} accounts. Flagged {at_risk} at-risk. Sent {check_ins} check-ins.',
    guardrails: [
      'NEVER promise discounts or features without approval',
      'NEVER cancel accounts without confirmation',
      'Prioritize at-risk accounts',
      'Track all interactions',
    ],
  },
}

// ============================================================
// Build full operational instructions for the agent
// ============================================================

/**
 * Build the complete operational context to inject into the agent prompt.
 * Includes: playbook workflow, checkpoint state, guardrails.
 */
export function buildOperationalInstructions(
  classification: TaskClassification,
  checkpoint: RunCheckpoint | null,
): string {
  if (!classification.isRecurring || !classification.playbook) return ''

  const pb = classification.playbook
  const parts: string[] = [
    `\n## Operational Playbook: ${pb.name}`,
    pb.runStartInstructions,
    '',
    '### Run Workflow:',
  ]

  for (const step of pb.runWorkflow) {
    parts.push(`${step.order}. **${step.action}** — ${step.details}`)
  }

  parts.push('', '### Safety Guardrails:')
  for (const g of pb.guardrails) {
    parts.push(`- ⚠️ ${g}`)
  }

  // Inject checkpoint context
  const checkpointContext = formatCheckpointForPrompt(checkpoint)
  if (checkpointContext) {
    parts.push(checkpointContext)
  }

  parts.push('', `### Run Summary Template:`)
  parts.push(`When you call task_complete, include a summary following this pattern: "${pb.summaryTemplate}"`)

  parts.push('', '### Checkpoint Instructions:')
  parts.push('Before calling task_complete, use the `remember` tool to save your run state:')
  for (const field of pb.checkpointFields) {
    parts.push(`- ${field.replace(/_/g, ' ')}`)
  }
  parts.push('This ensures your next run picks up where you left off.')

  return parts.join('\n')
}

/**
 * Get the suggested schedule for a task (for UI display or auto-configuration).
 */
export function getSuggestedSchedule(taskDescription: string): { cron: string; label: string; category: OperationalCategory } {
  const classification = classifyTask(taskDescription)
  return {
    cron: classification.suggestedCron,
    label: classification.suggestedScheduleLabel,
    category: classification.category,
  }
}
