/**
 * Agent Templates — Pre-built Workforce Roles
 *
 * One-click deploy for common business tasks. Each template is a fully
 * configured agent that users can deploy instantly from the AI Manager
 * or the dashboard.
 *
 * Templates dramatically lower the barrier to getting value from 2Hands.
 * Instead of describing a task from scratch, users pick a role and go.
 */

export interface AgentTemplate {
  id: string
  name: string
  displayName: string
  category: TemplateCategory
  icon: string
  description: string
  shortDescription: string
  taskDescription: string
  agentType: 'web-research' | 'email-assistant' | 'data-analyst' | 'file-organizer' | 'custom'
  defaultSchedule: {
    type: 'once' | 'scheduled' | 'realtime'
    cron?: string
    label: string
  }
  requiresCredentials: boolean
  credentialServices: string[]
  requiredIntegrations: string[]
  estimatedCreditsPerRun: number
  setupQuestions: SetupQuestion[]
  tags: string[]
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  popular: boolean
}

export interface SetupQuestion {
  id: string
  question: string
  type: 'text' | 'select' | 'boolean'
  options?: string[]
  placeholder?: string
  required: boolean
  insertInto: 'description' // where to inject the answer in the task description
}

export type TemplateCategory =
  | 'customer_support'
  | 'sales'
  | 'marketing'
  | 'operations'
  | 'finance'
  | 'hr'
  | 'research'
  | 'productivity'

export const TEMPLATE_CATEGORIES: Record<TemplateCategory, { label: string; icon: string }> = {
  customer_support: { label: 'Customer Support', icon: '🎧' },
  sales: { label: 'Sales', icon: '📈' },
  marketing: { label: 'Marketing', icon: '📣' },
  operations: { label: 'Operations', icon: '⚙️' },
  finance: { label: 'Finance', icon: '💰' },
  hr: { label: 'HR & Recruiting', icon: '👥' },
  research: { label: 'Research', icon: '🔍' },
  productivity: { label: 'Productivity', icon: '⚡' },
}

// ============================================================
// Template Registry
// ============================================================

export const AGENT_TEMPLATES: AgentTemplate[] = [
  // --- CUSTOMER SUPPORT ---
  {
    id: 'email-support-agent',
    name: 'Support',
    displayName: 'Email Support Agent',
    category: 'customer_support',
    icon: '📧',
    description: 'Monitors your support inbox, triages incoming emails by urgency, drafts professional responses, and flags issues that need human attention.',
    shortDescription: 'Triage & respond to support emails',
    taskDescription: 'Monitor the support email inbox. For each new email: (1) Classify urgency as critical/high/normal/low, (2) Draft a professional, helpful response, (3) Flag any emails that require human escalation. Provide a summary of all processed emails with counts by urgency level.{{CUSTOM}}',
    agentType: 'email-assistant',
    defaultSchedule: { type: 'scheduled', cron: '*/30 * * * *', label: 'Every 30 minutes' },
    requiresCredentials: true,
    credentialServices: ['email'],
    requiredIntegrations: [],
    estimatedCreditsPerRun: 150,
    setupQuestions: [
      { id: 'email', question: 'Which email address should I monitor?', type: 'text', placeholder: 'support@yourcompany.com', required: true, insertInto: 'description' },
      { id: 'tone', question: 'What tone should responses have?', type: 'select', options: ['Professional & formal', 'Friendly & casual', 'Technical & precise'], required: false, insertInto: 'description' },
    ],
    tags: ['email', 'support', 'customer service', 'triage'],
    difficulty: 'beginner',
    popular: true,
  },
  {
    id: 'ticket-monitor',
    name: 'Scout',
    displayName: 'Support Ticket Monitor',
    category: 'customer_support',
    icon: '🎫',
    description: 'Watches your support platform (Zendesk, Freshdesk, Intercom) for overdue tickets, SLA breaches, and trending issues.',
    shortDescription: 'Monitor support tickets & SLA breaches',
    taskDescription: 'Check the support ticketing system for: (1) Overdue tickets past SLA, (2) Tickets without a first response for over 2 hours, (3) Trending topics or repeated issues, (4) Customer sentiment trends. Report a summary with actionable items.{{CUSTOM}}',
    agentType: 'custom',
    defaultSchedule: { type: 'scheduled', cron: '0 */4 * * *', label: 'Every 4 hours' },
    requiresCredentials: true,
    credentialServices: ['support_platform'],
    requiredIntegrations: [],
    estimatedCreditsPerRun: 200,
    setupQuestions: [
      { id: 'platform', question: 'Which support platform do you use?', type: 'select', options: ['Zendesk', 'Freshdesk', 'Intercom', 'Help Scout', 'Other'], required: true, insertInto: 'description' },
    ],
    tags: ['tickets', 'sla', 'monitoring', 'support'],
    difficulty: 'beginner',
    popular: false,
  },

  // --- SALES ---
  {
    id: 'lead-gen-agent',
    name: 'Hunter',
    displayName: 'Lead Generation Agent',
    category: 'sales',
    icon: '🎯',
    description: 'Researches and finds potential leads matching your ideal customer profile. Gathers contact info, company details, and relevant insights.',
    shortDescription: 'Find & research qualified leads',
    taskDescription: 'Research and find potential leads matching this ideal customer profile: {{CUSTOM}}. For each lead, gather: (1) Company name and website, (2) Decision maker name and title, (3) Contact email if publicly available, (4) Company size and industry, (5) Why they might be a good fit. Find at least 10 qualified leads per run.',
    agentType: 'web-research',
    defaultSchedule: { type: 'scheduled', cron: '0 9 * * 1-5', label: 'Weekdays at 9 AM' },
    requiresCredentials: false,
    credentialServices: [],
    requiredIntegrations: [],
    estimatedCreditsPerRun: 300,
    setupQuestions: [
      { id: 'icp', question: 'Describe your ideal customer (industry, size, role, etc.)', type: 'text', placeholder: 'SaaS companies with 10-50 employees, targeting VP of Sales...', required: true, insertInto: 'description' },
      { id: 'region', question: 'Any geographic focus?', type: 'text', placeholder: 'e.g., US, Europe, UK', required: false, insertInto: 'description' },
    ],
    tags: ['leads', 'prospecting', 'research', 'sales'],
    difficulty: 'beginner',
    popular: true,
  },
  {
    id: 'crm-updater',
    name: 'Max',
    displayName: 'CRM Data Entry Agent',
    category: 'sales',
    icon: '📋',
    description: 'Keeps your CRM up to date by entering new contacts, updating deal stages, and logging activities from your email and calendar.',
    shortDescription: 'Auto-update CRM from emails & meetings',
    taskDescription: 'Log into the CRM and: (1) Check recent emails for new contacts to add, (2) Update existing contact records with new information, (3) Log any meeting notes or call summaries, (4) Update deal stages based on recent activity. Report what was updated.{{CUSTOM}}',
    agentType: 'custom',
    defaultSchedule: { type: 'scheduled', cron: '0 18 * * 1-5', label: 'Weekdays at 6 PM' },
    requiresCredentials: true,
    credentialServices: ['crm'],
    requiredIntegrations: [],
    estimatedCreditsPerRun: 250,
    setupQuestions: [
      { id: 'crm', question: 'Which CRM do you use?', type: 'select', options: ['HubSpot', 'Salesforce', 'Pipedrive', 'Close', 'Other'], required: true, insertInto: 'description' },
    ],
    tags: ['crm', 'data entry', 'contacts', 'sales'],
    difficulty: 'intermediate',
    popular: true,
  },
  {
    id: 'outreach-agent',
    name: 'Echo',
    displayName: 'Sales Outreach Agent',
    category: 'sales',
    icon: '✉️',
    description: 'Sends personalized outreach emails to leads, follows up on non-responses, and tracks engagement.',
    shortDescription: 'Personalized email outreach & follow-ups',
    taskDescription: 'Check the lead list and: (1) Send personalized outreach emails to new leads, (2) Follow up on leads who haven\'t responded in 3+ days, (3) Track which emails got opens/replies, (4) Report engagement metrics and any hot leads. Use a warm, professional tone.{{CUSTOM}}',
    agentType: 'email-assistant',
    defaultSchedule: { type: 'scheduled', cron: '0 9 * * 1-5', label: 'Weekdays at 9 AM' },
    requiresCredentials: true,
    credentialServices: ['email'],
    requiredIntegrations: [],
    estimatedCreditsPerRun: 200,
    setupQuestions: [
      { id: 'product', question: 'What are you selling? (brief description)', type: 'text', placeholder: 'AI-powered CRM for small businesses...', required: true, insertInto: 'description' },
    ],
    tags: ['outreach', 'email', 'follow-up', 'sales'],
    difficulty: 'intermediate',
    popular: true,
  },

  // --- MARKETING ---
  {
    id: 'social-media-agent',
    name: 'Buzz',
    displayName: 'Social Media Manager',
    category: 'marketing',
    icon: '📱',
    description: 'Manages your social media presence — drafts posts, schedules content, monitors engagement, and tracks competitor activity.',
    shortDescription: 'Draft posts, schedule, track engagement',
    taskDescription: 'Manage social media presence: (1) Check recent engagement and respond to important comments/mentions, (2) Draft 2-3 new posts based on trending topics in the industry, (3) Monitor competitor social activity for insights, (4) Report engagement metrics and recommendations.{{CUSTOM}}',
    agentType: 'custom',
    defaultSchedule: { type: 'scheduled', cron: '0 10 * * *', label: 'Daily at 10 AM' },
    requiresCredentials: true,
    credentialServices: ['social_media'],
    requiredIntegrations: [],
    estimatedCreditsPerRun: 250,
    setupQuestions: [
      { id: 'platforms', question: 'Which platforms? (select all)', type: 'text', placeholder: 'LinkedIn, Twitter/X, Instagram...', required: true, insertInto: 'description' },
      { id: 'brand_voice', question: 'Describe your brand voice', type: 'text', placeholder: 'Professional but approachable, B2B focused...', required: false, insertInto: 'description' },
    ],
    tags: ['social media', 'content', 'engagement', 'marketing'],
    difficulty: 'intermediate',
    popular: true,
  },
  {
    id: 'competitor-monitor',
    name: 'Radar',
    displayName: 'Competitor Intelligence Agent',
    category: 'marketing',
    icon: '📡',
    description: 'Tracks competitor websites, pricing changes, product launches, blog posts, and social media activity. Delivers weekly intel reports.',
    shortDescription: 'Track competitor activity & changes',
    taskDescription: 'Monitor competitors and report on: (1) Website changes (new features, pricing updates, landing pages), (2) New blog posts or content, (3) Social media activity and engagement, (4) Job postings (signal of growth areas), (5) News mentions and press releases. Competitors to track: {{CUSTOM}}',
    agentType: 'web-research',
    defaultSchedule: { type: 'scheduled', cron: '0 8 * * 1', label: 'Every Monday at 8 AM' },
    requiresCredentials: false,
    credentialServices: [],
    requiredIntegrations: [],
    estimatedCreditsPerRun: 350,
    setupQuestions: [
      { id: 'competitors', question: 'Which competitors should I track? (names or URLs)', type: 'text', placeholder: 'Competitor A (competitor-a.com), Competitor B...', required: true, insertInto: 'description' },
    ],
    tags: ['competitors', 'intelligence', 'monitoring', 'research'],
    difficulty: 'beginner',
    popular: true,
  },
  {
    id: 'content-writer',
    name: 'Sage',
    displayName: 'Blog Content Creator',
    category: 'marketing',
    icon: '✍️',
    description: 'Researches trending topics in your industry and drafts SEO-optimized blog posts with proper structure and calls to action.',
    shortDescription: 'Research & draft SEO blog posts',
    taskDescription: 'Create a new blog post: (1) Research trending topics in the industry, (2) Identify a high-potential keyword/topic, (3) Draft a 1000-1500 word SEO-optimized post with headers, intro, body, and CTA, (4) Suggest meta description and title tags. Industry/niche: {{CUSTOM}}',
    agentType: 'web-research',
    defaultSchedule: { type: 'scheduled', cron: '0 10 * * 1,3,5', label: 'Mon/Wed/Fri at 10 AM' },
    requiresCredentials: false,
    credentialServices: [],
    requiredIntegrations: [],
    estimatedCreditsPerRun: 300,
    setupQuestions: [
      { id: 'niche', question: 'What industry/niche do you write about?', type: 'text', placeholder: 'B2B SaaS, fintech, health & wellness...', required: true, insertInto: 'description' },
    ],
    tags: ['blog', 'content', 'seo', 'writing'],
    difficulty: 'beginner',
    popular: false,
  },

  // --- OPERATIONS ---
  {
    id: 'email-inbox-manager',
    name: 'Nova',
    displayName: 'Email Inbox Manager',
    category: 'productivity',
    icon: '📬',
    description: 'Reads your inbox, categorizes emails, drafts responses to routine messages, and creates a prioritized summary of what needs your attention.',
    shortDescription: 'Sort, prioritize & draft email replies',
    taskDescription: 'Process the email inbox: (1) Read all unread emails, (2) Categorize each as: urgent, needs response, FYI, or spam, (3) Draft responses for routine emails, (4) Create a prioritized summary of emails needing human attention, (5) Archive or label processed emails. Email: {{CUSTOM}}',
    agentType: 'email-assistant',
    defaultSchedule: { type: 'scheduled', cron: '0 8,12,17 * * 1-5', label: '3x daily (8AM, 12PM, 5PM)' },
    requiresCredentials: true,
    credentialServices: ['email'],
    requiredIntegrations: [],
    estimatedCreditsPerRun: 200,
    setupQuestions: [
      { id: 'email_provider', question: 'Which email provider?', type: 'select', options: ['Gmail', 'Outlook', 'Yahoo Mail', 'Other'], required: true, insertInto: 'description' },
    ],
    tags: ['email', 'inbox', 'productivity', 'triage'],
    difficulty: 'beginner',
    popular: true,
  },
  {
    id: 'order-processor',
    name: 'Bolt',
    displayName: 'Order Processing Agent',
    category: 'operations',
    icon: '📦',
    description: 'Processes incoming orders — verifies details, updates inventory, sends confirmation emails, and flags issues.',
    shortDescription: 'Process orders & update inventory',
    taskDescription: 'Process new orders: (1) Check for new incoming orders, (2) Verify order details and payment status, (3) Update inventory/stock levels, (4) Send order confirmation to customers, (5) Flag any orders with issues (payment failed, out of stock, address problems). Report summary.{{CUSTOM}}',
    agentType: 'custom',
    defaultSchedule: { type: 'scheduled', cron: '0 8 * * *', label: 'Daily at 8 AM' },
    requiresCredentials: true,
    credentialServices: ['ecommerce'],
    requiredIntegrations: [],
    estimatedCreditsPerRun: 250,
    setupQuestions: [
      { id: 'platform', question: 'Which e-commerce platform?', type: 'select', options: ['Shopify', 'WooCommerce', 'BigCommerce', 'Magento', 'Other'], required: true, insertInto: 'description' },
    ],
    tags: ['orders', 'fulfillment', 'inventory', 'ecommerce'],
    difficulty: 'intermediate',
    popular: false,
  },

  // --- FINANCE ---
  {
    id: 'bookkeeper-agent',
    name: 'Penny',
    displayName: 'Bookkeeping Agent',
    category: 'finance',
    icon: '📊',
    description: 'Categorizes transactions, reconciles accounts, flags unusual expenses, and prepares weekly financial summaries.',
    shortDescription: 'Categorize transactions & reconcile',
    taskDescription: 'Perform bookkeeping tasks: (1) Review recent transactions and categorize them, (2) Flag any unusual or duplicate charges, (3) Check for outstanding invoices, (4) Reconcile bank transactions with recorded entries, (5) Prepare a summary with totals by category. Accounting tool: {{CUSTOM}}',
    agentType: 'custom',
    defaultSchedule: { type: 'scheduled', cron: '0 9 * * 1', label: 'Every Monday at 9 AM' },
    requiresCredentials: true,
    credentialServices: ['accounting'],
    requiredIntegrations: [],
    estimatedCreditsPerRun: 250,
    setupQuestions: [
      { id: 'tool', question: 'Which accounting tool do you use?', type: 'select', options: ['QuickBooks', 'Xero', 'FreshBooks', 'Wave', 'Other'], required: true, insertInto: 'description' },
    ],
    tags: ['bookkeeping', 'accounting', 'finance', 'transactions'],
    difficulty: 'intermediate',
    popular: true,
  },
  {
    id: 'invoice-agent',
    name: 'Ledger',
    displayName: 'Invoice Processing Agent',
    category: 'finance',
    icon: '🧾',
    description: 'Processes incoming invoices — extracts data, matches to POs, flags discrepancies, and queues for payment.',
    shortDescription: 'Process invoices & match to POs',
    taskDescription: 'Process invoices: (1) Check email and shared folders for new invoices, (2) Extract key data (vendor, amount, due date, line items), (3) Match against purchase orders if applicable, (4) Flag any discrepancies or duplicates, (5) Queue approved invoices for payment. Report summary.{{CUSTOM}}',
    agentType: 'custom',
    defaultSchedule: { type: 'scheduled', cron: '0 9 * * 1-5', label: 'Weekdays at 9 AM' },
    requiresCredentials: true,
    credentialServices: ['email', 'accounting'],
    requiredIntegrations: [],
    estimatedCreditsPerRun: 200,
    setupQuestions: [],
    tags: ['invoices', 'accounts payable', 'finance'],
    difficulty: 'intermediate',
    popular: false,
  },

  // --- HR & RECRUITING ---
  {
    id: 'recruiter-agent',
    name: 'Talent',
    displayName: 'Talent Sourcing Agent',
    category: 'hr',
    icon: '🔎',
    description: 'Searches job boards and LinkedIn for candidates matching your job requirements. Compiles shortlists with profiles and contact info.',
    shortDescription: 'Source candidates from job boards & LinkedIn',
    taskDescription: 'Source candidates for this role: {{CUSTOM}}. (1) Search LinkedIn, job boards, and professional networks, (2) Find candidates matching the requirements, (3) For each candidate: name, current role, relevant experience, LinkedIn URL, (4) Score fit on a 1-5 scale with reasoning, (5) Compile a shortlist of top 10 candidates.',
    agentType: 'web-research',
    defaultSchedule: { type: 'scheduled', cron: '0 9 * * 1-5', label: 'Weekdays at 9 AM' },
    requiresCredentials: false,
    credentialServices: [],
    requiredIntegrations: [],
    estimatedCreditsPerRun: 350,
    setupQuestions: [
      { id: 'role', question: 'What role are you hiring for? (title, requirements, location)', type: 'text', placeholder: 'Senior Frontend Engineer, React/TypeScript, remote US...', required: true, insertInto: 'description' },
    ],
    tags: ['recruiting', 'sourcing', 'candidates', 'hiring'],
    difficulty: 'beginner',
    popular: true,
  },

  // --- RESEARCH ---
  {
    id: 'market-research-agent',
    name: 'Atlas',
    displayName: 'Market Research Agent',
    category: 'research',
    icon: '🌍',
    description: 'Researches market trends, industry reports, and emerging opportunities. Delivers structured reports with data and sources.',
    shortDescription: 'Research market trends & opportunities',
    taskDescription: 'Research the following market/topic: {{CUSTOM}}. Deliver a structured report including: (1) Market size and growth trends, (2) Key players and market share, (3) Emerging trends and opportunities, (4) Threats and challenges, (5) Relevant data points and statistics. Cite all sources.',
    agentType: 'web-research',
    defaultSchedule: { type: 'once', label: 'One-time research' },
    requiresCredentials: false,
    credentialServices: [],
    requiredIntegrations: [],
    estimatedCreditsPerRun: 400,
    setupQuestions: [
      { id: 'topic', question: 'What market or topic should I research?', type: 'text', placeholder: 'AI in healthcare, electric vehicle market in Europe...', required: true, insertInto: 'description' },
    ],
    tags: ['market research', 'trends', 'analysis', 'report'],
    difficulty: 'beginner',
    popular: true,
  },
  {
    id: 'news-monitor',
    name: 'Pulse',
    displayName: 'Industry News Monitor',
    category: 'research',
    icon: '📰',
    description: 'Monitors industry news, blog posts, and announcements. Delivers daily or weekly digests of what matters.',
    shortDescription: 'Daily digest of industry news',
    taskDescription: 'Monitor industry news for: {{CUSTOM}}. (1) Search major news sources, industry blogs, and social media, (2) Filter for relevant and important stories, (3) Summarize each story in 2-3 sentences, (4) Categorize as: breaking, important, interesting, or FYI, (5) Compile into a prioritized digest.',
    agentType: 'web-research',
    defaultSchedule: { type: 'scheduled', cron: '0 7 * * 1-5', label: 'Weekdays at 7 AM' },
    requiresCredentials: false,
    credentialServices: [],
    requiredIntegrations: [],
    estimatedCreditsPerRun: 200,
    setupQuestions: [
      { id: 'topics', question: 'What topics/industries should I monitor?', type: 'text', placeholder: 'AI, fintech, competitor names...', required: true, insertInto: 'description' },
    ],
    tags: ['news', 'monitoring', 'digest', 'industry'],
    difficulty: 'beginner',
    popular: true,
  },

  // --- PRODUCTIVITY ---
  {
    id: 'meeting-prep-agent',
    name: 'Brief',
    displayName: 'Meeting Prep Agent',
    category: 'productivity',
    icon: '📝',
    description: 'Prepares briefing documents before your meetings — researches attendees, compiles relevant context, and suggests talking points.',
    shortDescription: 'Research attendees & prep talking points',
    taskDescription: 'Prepare for upcoming meetings: (1) Check the calendar for meetings in the next 24 hours, (2) For each meeting: research attendees (LinkedIn, company info), (3) Compile relevant context and recent interactions, (4) Suggest key talking points and questions, (5) Deliver a concise briefing doc per meeting.{{CUSTOM}}',
    agentType: 'web-research',
    defaultSchedule: { type: 'scheduled', cron: '0 7 * * 1-5', label: 'Weekdays at 7 AM' },
    requiresCredentials: true,
    credentialServices: ['calendar'],
    requiredIntegrations: [],
    estimatedCreditsPerRun: 250,
    setupQuestions: [],
    tags: ['meetings', 'prep', 'research', 'briefing'],
    difficulty: 'beginner',
    popular: false,
  },
  {
    id: 'data-scraper',
    name: 'Harvest',
    displayName: 'Web Data Scraper',
    category: 'productivity',
    icon: '🕷️',
    description: 'Scrapes structured data from websites — product listings, directories, job boards, pricing pages — and delivers clean spreadsheets.',
    shortDescription: 'Scrape websites into clean spreadsheets',
    taskDescription: 'Scrape data from: {{CUSTOM}}. (1) Navigate to the target website(s), (2) Extract the requested data fields, (3) Clean and structure the data, (4) Compile into a spreadsheet format, (5) Report total records found and any issues encountered.',
    agentType: 'web-research',
    defaultSchedule: { type: 'once', label: 'One-time scrape' },
    requiresCredentials: false,
    credentialServices: [],
    requiredIntegrations: [],
    estimatedCreditsPerRun: 300,
    setupQuestions: [
      { id: 'target', question: 'What website and data do you want scraped?', type: 'text', placeholder: 'Product listings from example.com — name, price, rating...', required: true, insertInto: 'description' },
    ],
    tags: ['scraping', 'data', 'extraction', 'spreadsheet'],
    difficulty: 'intermediate',
    popular: false,
  },
]

// ============================================================
// Utility Functions
// ============================================================

/**
 * Get all templates, optionally filtered by category.
 */
export function getTemplates(category?: TemplateCategory): AgentTemplate[] {
  if (category) {
    return AGENT_TEMPLATES.filter(t => t.category === category)
  }
  return AGENT_TEMPLATES
}

/**
 * Get popular/featured templates for onboarding.
 */
export function getPopularTemplates(limit: number = 6): AgentTemplate[] {
  return AGENT_TEMPLATES.filter(t => t.popular).slice(0, limit)
}

/**
 * Get a template by ID.
 */
export function getTemplateById(id: string): AgentTemplate | undefined {
  return AGENT_TEMPLATES.find(t => t.id === id)
}

/**
 * Search templates by keyword.
 */
export function searchTemplates(query: string): AgentTemplate[] {
  const lower = query.toLowerCase()
  return AGENT_TEMPLATES.filter(t =>
    t.displayName.toLowerCase().includes(lower) ||
    t.description.toLowerCase().includes(lower) ||
    t.tags.some(tag => tag.includes(lower)) ||
    t.shortDescription.toLowerCase().includes(lower)
  )
}

/**
 * Build a task description from a template + user answers.
 */
export function buildTaskFromTemplate(
  template: AgentTemplate,
  answers: Record<string, string>
): string {
  let task = template.taskDescription

  // Build custom section from answers
  const customParts: string[] = []
  for (const q of template.setupQuestions) {
    const answer = answers[q.id]
    if (answer) {
      customParts.push(`${q.question} ${answer}`)
    }
  }

  const customSection = customParts.length > 0
    ? `\n\nAdditional context:\n${customParts.join('\n')}`
    : ''

  task = task.replace('{{CUSTOM}}', customSection)
  return task
}

/**
 * Format templates for the AI Manager's system prompt so it can suggest them.
 */
export function formatTemplatesForPrompt(): string {
  const popular = getPopularTemplates(8)
  if (popular.length === 0) return ''

  const lines = popular.map(t =>
    `- **${t.displayName}** (${t.icon} ${t.id}): ${t.shortDescription} [${t.defaultSchedule.label}]`
  )

  return `
AGENT TEMPLATES (suggest these when relevant — users can deploy instantly):
${lines.join('\n')}
When a user describes a task that matches a template, suggest it: "I have a ${popular[0].displayName} template that can handle this — want me to set it up?"
If they want to customize, use the template as a starting point and adjust.
To deploy a template, use create_agent with the template's pre-configured settings.`
}
