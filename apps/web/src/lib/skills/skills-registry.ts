/**
 * Skills Registry
 * 
 * A library of pre-defined skills that agents can use.
 * Each skill provides:
 * - Best practices for interacting with a service
 * - Common workflows and patterns
 * - Known pitfalls and solutions
 * - Login flow instructions
 * 
 * Inspired by Moltbot's skills system but adapted for 2Hands'
 * remote VM architecture.
 */

export interface Skill {
  id: string
  name: string
  category: SkillCategory
  description: string
  services: string[] // e.g., ['gmail', 'google']
  requiresCredentials: boolean
  riskLevel: 'low' | 'medium' | 'high'
  instructions: string // Markdown instructions for the agent
  commonTasks: string[]
  knownIssues: SkillIssue[]
  version: string
}

export interface SkillIssue {
  problem: string
  solution: string
  severity: 'minor' | 'major' | 'critical'
}

export type SkillCategory = 
  | 'email'
  | 'social'
  | 'ecommerce'
  | 'calendar'
  | 'productivity'
  | 'finance'
  | 'crm'
  | 'development'
  | 'research'
  | 'communication'

// Built-in skills registry
const SKILLS: Skill[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    category: 'email',
    description: 'Manage Gmail inbox, compose emails, search messages',
    services: ['gmail', 'google'],
    requiresCredentials: true,
    riskLevel: 'medium',
    instructions: `# Gmail Skill

## Login Flow
1. Navigate to gmail.com
2. Enter email address, click Next
3. Enter password, click Next
4. Handle 2FA if prompted (report to user and wait)
5. Wait for inbox to fully load before proceeding

## Common Operations

### Reading Emails
- Use search bar for specific queries (from:, subject:, has:attachment)
- Click email to open, scroll to read full content
- Note sender, date, and any attachments

### Composing Emails
- Click "Compose" button (usually top-left)
- Fill in To, Subject, then body
- For important emails: Draft first, use report_insight to confirm content
- Click Send only after confirmation

### Managing Inbox
- Use checkboxes to select multiple emails
- Archive, Delete, or Label as needed
- Star important emails for follow-up

## Known Issues
- Gmail may show "Unusual activity" warning - proceed normally
- Loading can be slow - wait for spinner to disappear
- Rich text formatting may not work - use plain text when possible

## Safety Rules
- NEVER send emails without explicit approval for new recipients
- Always verify email addresses before sending
- Report any suspicious security prompts`,
    commonTasks: [
      'Check for new emails',
      'Reply to specific email',
      'Forward email to someone',
      'Search for emails from sender',
      'Delete spam emails',
      'Create email draft',
    ],
    knownIssues: [
      {
        problem: 'Gmail shows "Verify it\'s you" prompt',
        solution: 'Report to user via insight and wait for guidance. Do not attempt to bypass.',
        severity: 'major',
      },
      {
        problem: 'Compose button not visible',
        solution: 'The sidebar may be collapsed. Look for hamburger menu or try scrolling up.',
        severity: 'minor',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    category: 'social',
    description: 'Manage LinkedIn profile, connections, messages, and posts',
    services: ['linkedin'],
    requiresCredentials: true,
    riskLevel: 'medium',
    instructions: `# LinkedIn Skill

## Login Flow
1. Navigate to linkedin.com
2. Enter email/phone and password
3. Click "Sign in"
4. Handle verification if prompted (report to user)
5. Wait for feed to load

## Common Operations

### Checking Messages
- Click Messages icon in top nav
- Read and respond to messages
- Use report_insight for important messages

### Viewing Profile
- Click "Me" in top nav, then "View Profile"
- Note any profile completion suggestions

### Searching
- Use search bar for people, jobs, companies
- Apply filters for better results

### Posting
- Use "Start a post" on home feed
- Draft content first, report for approval
- Add images/links as needed

## Safety Rules
- Never send connection requests without approval
- Never post publicly without user confirmation
- Be careful with endorsements and recommendations`,
    commonTasks: [
      'Check new messages',
      'Accept connection requests',
      'Search for people by company',
      'View profile views',
      'Draft a post',
    ],
    knownIssues: [
      {
        problem: 'LinkedIn asks for phone verification',
        solution: 'Report to user immediately - requires their phone access.',
        severity: 'critical',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'shopify',
    name: 'Shopify Admin',
    category: 'ecommerce',
    description: 'Manage Shopify store, orders, products, and customers',
    services: ['shopify'],
    requiresCredentials: true,
    riskLevel: 'high',
    instructions: `# Shopify Admin Skill

## Login Flow
1. Navigate to [store-name].myshopify.com/admin
2. Enter email address
3. Enter password
4. Handle 2FA if enabled (report to user)
5. Wait for dashboard to load

## Common Operations

### Checking Orders
- Click "Orders" in left sidebar
- Use filters for unfulfilled, unpaid, etc.
- Click order to see details

### Managing Products
- Click "Products" in sidebar
- Use search or filters
- Click product to edit

### Viewing Analytics
- Click "Analytics" for reports
- Use date pickers for specific periods

### Customer Management
- Click "Customers" in sidebar
- Search by name or email
- View order history

## Safety Rules
- NEVER process refunds without explicit approval
- NEVER change prices without confirmation
- Report any unusual order patterns
- Double-check order fulfillment before confirming`,
    commonTasks: [
      'Check new orders',
      'View order details',
      'Update inventory',
      'Check sales analytics',
      'Find customer by email',
    ],
    knownIssues: [
      {
        problem: 'Session expires during task',
        solution: 'Re-login using saved credentials and continue.',
        severity: 'minor',
      },
      {
        problem: 'Admin page very slow to load',
        solution: 'Wait up to 30 seconds. If still not loaded, try refreshing once.',
        severity: 'minor',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    category: 'calendar',
    description: 'View and manage Google Calendar events',
    services: ['google', 'google-calendar'],
    requiresCredentials: true,
    riskLevel: 'low',
    instructions: `# Google Calendar Skill

## Login Flow
1. Navigate to calendar.google.com
2. Sign in with Google account if not already
3. Wait for calendar to fully load

## Common Operations

### Viewing Events
- Default view shows current week
- Use arrows to navigate dates
- Click event for details

### Creating Events
- Click on desired time slot, or use "Create" button
- Fill in title, time, location, description
- Add guests if needed
- Click "Save"

### Managing Events
- Click event to open details
- Edit or delete as needed
- For recurring events, choose "this event" or "all events"

## Safety Rules
- Verify time zones before creating events
- Double-check attendee emails
- Report any scheduling conflicts`,
    commonTasks: [
      'Check today\'s schedule',
      'Find next free slot',
      'Create meeting',
      'Check specific date',
      'View upcoming events',
    ],
    knownIssues: [
      {
        problem: 'Calendar shows wrong timezone',
        solution: 'Check Settings > Time zone and report to user if incorrect.',
        severity: 'major',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'twitter',
    name: 'Twitter/X',
    category: 'social',
    description: 'Manage Twitter/X account, tweets, and messages',
    services: ['twitter', 'x'],
    requiresCredentials: true,
    riskLevel: 'high',
    instructions: `# Twitter/X Skill

## Login Flow
1. Navigate to twitter.com or x.com
2. Click "Sign in"
3. Enter username/email
4. Enter password
5. Handle 2FA if enabled (report to user)

## Common Operations

### Checking Notifications
- Click bell icon in sidebar
- Review mentions, likes, retweets
- Report important mentions via insight

### Viewing Messages
- Click envelope icon for DMs
- Read and respond as needed

### Posting Tweets
- ALWAYS draft first and get approval
- Click "Post" or use compose button
- Add media if needed
- Double-check before posting

### Searching
- Use search bar for keywords, accounts, hashtags
- Apply filters for latest, people, photos

## Safety Rules
- NEVER post tweets without explicit approval
- NEVER send DMs without confirmation
- Be aware that actions are PUBLIC
- Report any unusual account activity`,
    commonTasks: [
      'Check notifications',
      'Read DMs',
      'Search for topic',
      'Draft a tweet',
      'View profile analytics',
    ],
    knownIssues: [
      {
        problem: 'Twitter shows "suspicious activity" warning',
        solution: 'Report to user immediately. Do not attempt to bypass.',
        severity: 'critical',
      },
      {
        problem: 'Tweet button disabled',
        solution: 'Check character count (max 280). Remove excess characters.',
        severity: 'minor',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'web-research',
    name: 'Web Research',
    category: 'research',
    description: 'General web research and information gathering',
    services: ['web', 'google', 'search'],
    requiresCredentials: false,
    riskLevel: 'low',
    instructions: `# Web Research Skill

## Best Practices

### Effective Searching
- Use specific, targeted search queries
- Add site: operator to search within specific sites
- Use quotes for exact phrases
- Try multiple search engines if needed

### Gathering Information
- Take notes on key findings
- Note sources for attribution
- Cross-reference important facts
- Report findings via report_insight as you go

### Navigating Websites
- Look for navigation menus
- Use site search when available
- Scroll to find relevant content
- Handle cookie popups by accepting or dismissing

## Safety Rules
- Don't submit forms on untrusted sites
- Don't download files unless explicitly asked
- Report any paywalls or access restrictions
- Verify information from multiple sources when possible`,
    commonTasks: [
      'Research a topic',
      'Find contact information',
      'Compare products',
      'Find recent news',
      'Locate specific data',
    ],
    knownIssues: [
      {
        problem: 'Website requires login',
        solution: 'Report the access restriction. Do not attempt to create accounts.',
        severity: 'major',
      },
      {
        problem: 'Content behind paywall',
        solution: 'Report to user and try alternative sources.',
        severity: 'minor',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'notion',
    name: 'Notion',
    category: 'productivity',
    description: 'Manage Notion workspaces, pages, databases, and content',
    services: ['notion'],
    requiresCredentials: true,
    riskLevel: 'low',
    instructions: `# Notion Skill

## Login Flow
1. Navigate to notion.so
2. Click "Log in"
3. Enter email, then password (or use Google/Apple SSO)
4. Wait for workspace to fully load

## Common Operations

### Navigating
- Use sidebar for page navigation
- Use search (Cmd/Ctrl+P) for quick find
- Breadcrumbs show current location

### Reading Content
- Scroll through pages
- Expand toggles to see hidden content
- Click database entries to view details

### Editing Content
- Click to place cursor, type to edit
- Use "/" for block commands
- Drag blocks to reorder

### Database Operations
- Click filters to narrow view
- Sort by clicking column headers
- Add new entries with "+ New" button

## Safety Rules
- Be careful with delete operations
- Verify before making bulk changes
- Report any permission issues`,
    commonTasks: [
      'Find a page',
      'Update page content',
      'Add to database',
      'Search for information',
      'Check recent changes',
    ],
    knownIssues: [
      {
        problem: 'Page loads slowly or shows spinner',
        solution: 'Wait up to 15 seconds. Notion can be slow with large pages.',
        severity: 'minor',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'slack',
    name: 'Slack',
    category: 'communication',
    description: 'Manage Slack messages, channels, and notifications',
    services: ['slack'],
    requiresCredentials: true,
    riskLevel: 'medium',
    instructions: `# Slack Skill

## Login Flow
1. Navigate to [workspace].slack.com or app.slack.com
2. Enter email and password
3. Handle 2FA if enabled (report to user)
4. Wait for workspace to load

## Common Operations

### Reading Messages
- Check channels in left sidebar
- Scroll to read history
- Look for unread indicators (bold, badges)
- Check threads for context

### Sending Messages
- Click channel or DM
- Type in message box at bottom
- Use @ to mention users
- ALWAYS draft important messages first

### Managing Channels
- Use search to find channels
- Star important channels
- Check notifications settings

## Safety Rules
- NEVER send messages to channels without approval
- Be careful with @channel and @here mentions
- Verify recipient before sending DMs
- Report any messages that need user attention`,
    commonTasks: [
      'Check unread messages',
      'Read specific channel',
      'Send message to user',
      'Search for message',
      'Check notifications',
    ],
    knownIssues: [
      {
        problem: 'Workspace requires SSO login',
        solution: 'Report to user - may need different credentials or SSO flow.',
        severity: 'major',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'discord',
    name: 'Discord',
    category: 'communication',
    description: 'Manage Discord servers, channels, and messages',
    services: ['discord'],
    requiresCredentials: true,
    riskLevel: 'medium',
    instructions: `# Discord Skill

## Login Flow
1. Navigate to discord.com/app
2. Enter email and password
3. Handle 2FA if enabled
4. Wait for servers to load in left sidebar

## Common Operations

### Navigating
- Servers shown as icons on far left
- Channels listed under each server
- DMs accessible via top icon

### Reading Messages
- Click channel to view messages
- Scroll up for history
- Check pinned messages (pin icon)

### Sending Messages
- Type in message box at bottom
- Use @ for mentions
- Use # for channel links
- Reactions via emoji picker

## Safety Rules
- NEVER post in public channels without approval
- Be careful with @everyone and @here
- Verify server rules before posting
- Draft important messages first`,
    commonTasks: [
      'Check notifications',
      'Read channel messages',
      'Send DM to user',
      'Search for message',
      'Check server',
    ],
    knownIssues: [
      {
        problem: 'Discord shows CAPTCHA',
        solution: 'Report to user immediately - cannot proceed without human solving it.',
        severity: 'critical',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'github',
    name: 'GitHub',
    category: 'development',
    description: 'Manage GitHub repositories, issues, PRs, and code',
    services: ['github'],
    requiresCredentials: true,
    riskLevel: 'medium',
    instructions: `# GitHub Skill

## Login Flow
1. Navigate to github.com
2. Click "Sign in"
3. Enter username/email and password
4. Handle 2FA if enabled (report to user)
5. Wait for dashboard to load

## Common Operations

### Repositories
- Use search bar for repos
- Click repo name to enter
- Check README for project info

### Issues
- Click "Issues" tab in repo
- Use filters for open/closed/assigned
- Click issue to view details
- Comment at bottom of issue

### Pull Requests
- Click "Pull requests" tab
- Review files changed, commits
- Check CI status (green/red checks)

### Code
- Browse files in repo
- Use "Go to file" for quick navigation
- View blame/history for context

## Safety Rules
- NEVER merge PRs without approval
- Be careful with issue labels and assignments
- Don't close issues without confirmation
- Report security-related findings immediately`,
    commonTasks: [
      'Check repository',
      'View open issues',
      'Review pull request',
      'Search for code',
      'Check CI status',
    ],
    knownIssues: [
      {
        problem: 'Repository is private and access denied',
        solution: 'Report to user - may need different credentials or access request.',
        severity: 'major',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    category: 'crm',
    description: 'Manage HubSpot CRM contacts, deals, and activities',
    services: ['hubspot'],
    requiresCredentials: true,
    riskLevel: 'medium',
    instructions: `# HubSpot Skill

## Login Flow
1. Navigate to app.hubspot.com
2. Enter email and password
3. Select account if multiple available
4. Wait for dashboard to load

## Common Operations

### Contacts
- Search contacts in top bar
- Click contact for full profile
- View associated deals, tickets, activities

### Deals
- Navigate to Sales > Deals
- Use pipeline view or list view
- Click deal for details
- Update stage by dragging or editing

### Activities
- Log calls, emails, meetings
- Check activity timeline on records
- Create tasks and reminders

### Reports
- Navigate to Reports
- Use dashboards for overview
- Filter by date range, owner, etc.

## Safety Rules
- NEVER delete contacts without approval
- Be careful updating deal stages
- Verify before sending emails through HubSpot
- Report any data discrepancies`,
    commonTasks: [
      'Find contact',
      'Check deal pipeline',
      'Log activity',
      'Search for company',
      'View recent activities',
    ],
    knownIssues: [
      {
        problem: 'Access restricted to certain features',
        solution: 'Report to user - may need upgraded HubSpot plan or permissions.',
        severity: 'major',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    category: 'crm',
    description: 'Manage Salesforce CRM leads, opportunities, and accounts',
    services: ['salesforce'],
    requiresCredentials: true,
    riskLevel: 'high',
    instructions: `# Salesforce Skill

## Login Flow
1. Navigate to login.salesforce.com or custom domain
2. Enter username (often email) and password
3. Handle 2FA/verification if required
4. Wait for Lightning Experience to load

## Common Operations

### Navigation
- Use App Launcher (9-dot grid) for apps
- Use global search for any record
- Check tabs for Leads, Opportunities, Accounts

### Records
- Click record name to view details
- Check Related tab for associations
- View Activity timeline

### Updates
- Click Edit or pencil icons to modify
- Save changes explicitly
- Check validation rules if save fails

### Reports & Dashboards
- Navigate to Reports tab
- Run existing reports
- Check dashboards for overview

## Safety Rules
- NEVER delete records without explicit approval
- Be careful with mass updates
- Verify opportunity stages before changing
- Report any workflow/automation triggers`,
    commonTasks: [
      'Find lead or opportunity',
      'Update record',
      'Check pipeline',
      'Run report',
      'Log activity',
    ],
    knownIssues: [
      {
        problem: 'Validation rule prevents save',
        solution: 'Check error message for required fields. Report to user if unclear.',
        severity: 'major',
      },
      {
        problem: 'Session expired',
        solution: 'Re-login using credentials and continue.',
        severity: 'minor',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    category: 'productivity',
    description: 'Manage Google Drive files, folders, and sharing',
    services: ['google', 'drive', 'google-drive'],
    requiresCredentials: true,
    riskLevel: 'low',
    instructions: `# Google Drive Skill

## Login Flow
1. Navigate to drive.google.com
2. Sign in with Google account if needed
3. Wait for file list to load

## Common Operations

### Navigation
- Use left sidebar for My Drive, Shared, Recent
- Double-click folders to open
- Use search bar for finding files

### Files
- Click file to select, double-click to open
- Right-click for options (share, download, etc.)
- Preview with single click, edit with double-click

### Organization
- Create folders via New button
- Drag files to move
- Star important files

### Sharing
- Right-click > Share
- Enter email addresses
- Set permissions (view/edit)

## Safety Rules
- Be careful with sharing permissions
- Verify before moving files to trash
- Don't modify shared files without approval`,
    commonTasks: [
      'Find file',
      'Download document',
      'Check shared files',
      'Create folder',
      'Share file',
    ],
    knownIssues: [
      {
        problem: 'File too large to preview',
        solution: 'Download the file or report to user.',
        severity: 'minor',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'google-docs',
    name: 'Google Docs',
    category: 'productivity',
    description: 'Create and edit Google Docs documents',
    services: ['google', 'docs', 'google-docs'],
    requiresCredentials: true,
    riskLevel: 'low',
    instructions: `# Google Docs Skill

## Login Flow
1. Navigate to docs.google.com or open from Drive
2. Sign in with Google account if needed
3. Wait for document to load

## Common Operations

### Reading
- Scroll through document
- Use Outline (View > Show outline) for navigation
- Check comments in right margin

### Editing
- Click to place cursor
- Type to add text
- Use toolbar for formatting
- Use Ctrl/Cmd+Z to undo

### Comments
- Highlight text, click comment icon
- Reply to existing comments
- Resolve comments when addressed

### Sharing
- Click Share button (top right)
- Add people or get shareable link

## Safety Rules
- Changes save automatically
- Be careful with deletions
- Check document history if needed
- Report any permission issues`,
    commonTasks: [
      'Read document',
      'Edit content',
      'Add comment',
      'Check comments',
      'Share document',
    ],
    knownIssues: [
      {
        problem: 'Document is view-only',
        solution: 'Report to user - may need edit access.',
        severity: 'major',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    category: 'productivity',
    description: 'Create and edit Google Sheets spreadsheets',
    services: ['google', 'sheets', 'google-sheets'],
    requiresCredentials: true,
    riskLevel: 'medium',
    instructions: `# Google Sheets Skill

## Login Flow
1. Navigate to sheets.google.com or open from Drive
2. Sign in with Google account if needed
3. Wait for spreadsheet to load

## Common Operations

### Reading Data
- Navigate sheets via tabs at bottom
- Scroll or use Ctrl+End to find data extent
- Use filters for large datasets

### Editing
- Click cell to select, type to edit
- Use formulas starting with =
- Copy/paste for bulk operations

### Formatting
- Select cells, use toolbar
- Conditional formatting for highlights
- Number formatting for currencies, dates

### Data Operations
- Sort via Data menu
- Filter to show specific rows
- Create charts for visualization

## Safety Rules
- Changes save automatically
- Be very careful with bulk operations
- Check formulas before modifying
- Report any formula errors`,
    commonTasks: [
      'Find data',
      'Update cells',
      'Add rows',
      'Sort data',
      'Export data',
    ],
    knownIssues: [
      {
        problem: 'Formula error (#REF!, #VALUE!, etc.)',
        solution: 'Report the error. Do not attempt to fix without understanding context.',
        severity: 'major',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'trello',
    name: 'Trello',
    category: 'productivity',
    description: 'Manage Trello boards, lists, and cards',
    services: ['trello'],
    requiresCredentials: true,
    riskLevel: 'low',
    instructions: `# Trello Skill

## Login Flow
1. Navigate to trello.com
2. Click "Log in"
3. Enter email and password (or use Google/etc.)
4. Wait for boards to load

## Common Operations

### Navigation
- Boards shown on home page
- Click board to open
- Lists are columns, cards are items

### Cards
- Click card to open details
- Check description, comments, attachments
- View due dates and labels

### Updates
- Drag cards between lists
- Click to edit title
- Add comments at bottom of card

### Creating
- Click "+ Add a card" at list bottom
- Click "+ Add another list" for new lists

## Safety Rules
- Be careful moving cards to Done/Archive
- Verify before deleting cards
- Check card members before assigning`,
    commonTasks: [
      'Check board',
      'Update card',
      'Move card',
      'Add comment',
      'Find card',
    ],
    knownIssues: [],
    version: '1.0.0',
  },
  {
    id: 'asana',
    name: 'Asana',
    category: 'productivity',
    description: 'Manage Asana projects, tasks, and workflows',
    services: ['asana'],
    requiresCredentials: true,
    riskLevel: 'low',
    instructions: `# Asana Skill

## Login Flow
1. Navigate to app.asana.com
2. Enter email and password
3. Wait for workspace to load

## Common Operations

### Navigation
- Projects in left sidebar
- Use search for quick find
- Check Inbox for updates

### Tasks
- Click task to open details
- Check subtasks, comments, attachments
- View assignee, due date, project

### Updates
- Click fields to edit
- Mark complete with checkmark
- Add comments for context

### Projects
- View as list, board, or timeline
- Use filters to narrow view
- Check project status

## Safety Rules
- Be careful marking tasks complete
- Verify assignees before changing
- Check due dates before modifying`,
    commonTasks: [
      'Check project',
      'Update task',
      'Mark complete',
      'Search for task',
      'Check inbox',
    ],
    knownIssues: [],
    version: '1.0.0',
  },
  {
    id: 'jira',
    name: 'Jira',
    category: 'development',
    description: 'Manage Jira issues, sprints, and projects',
    services: ['jira', 'atlassian'],
    requiresCredentials: true,
    riskLevel: 'medium',
    instructions: `# Jira Skill

## Login Flow
1. Navigate to [instance].atlassian.net
2. Enter email and password
3. Handle 2FA if enabled
4. Wait for dashboard to load

## Common Operations

### Navigation
- Use left sidebar for projects
- Use search for issues (JQL or quick search)
- Check boards for sprint view

### Issues
- Click issue key to open
- Check status, assignee, priority
- View comments and activity

### Updates
- Click fields to edit inline
- Transition status via workflow
- Add comments for updates

### Boards & Sprints
- Check backlog for upcoming work
- View active sprint board
- Check sprint burndown

## Safety Rules
- Be careful with status transitions
- Verify before closing issues
- Don't modify sprint assignments without approval
- Report blockers immediately`,
    commonTasks: [
      'Find issue',
      'Update issue',
      'Check sprint',
      'Add comment',
      'Search by filter',
    ],
    knownIssues: [
      {
        problem: 'Workflow transition not available',
        solution: 'Check issue status - may need different transition path.',
        severity: 'minor',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'outlook',
    name: 'Outlook',
    category: 'email',
    description: 'Manage Outlook email, calendar, and contacts',
    services: ['outlook', 'microsoft', 'office365'],
    requiresCredentials: true,
    riskLevel: 'medium',
    instructions: `# Outlook Skill

## Login Flow
1. Navigate to outlook.office.com or outlook.com
2. Enter email address
3. Enter password
4. Handle 2FA if enabled
5. Wait for inbox to load

## Common Operations

### Email
- Read emails in main pane
- Use folders in left sidebar
- Search with top search bar

### Composing
- Click "New message"
- Add recipients, subject, body
- Use formatting toolbar
- ALWAYS draft important emails first

### Calendar
- Switch to Calendar via left icons
- View day/week/month
- Click to create events

### Contacts
- Access via People icon
- Search for contacts
- View contact details

## Safety Rules
- NEVER send emails without approval
- Be careful with meeting invites
- Verify recipients before sending
- Report any security prompts`,
    commonTasks: [
      'Check inbox',
      'Reply to email',
      'Check calendar',
      'Create meeting',
      'Find contact',
    ],
    knownIssues: [
      {
        problem: 'Organization requires additional verification',
        solution: 'Report to user - may need their interaction.',
        severity: 'major',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'quickbooks',
    name: 'QuickBooks',
    category: 'finance',
    description: 'Manage QuickBooks accounting, invoices, and reports',
    services: ['quickbooks', 'intuit'],
    requiresCredentials: true,
    riskLevel: 'high',
    instructions: `# QuickBooks Skill

## Login Flow
1. Navigate to quickbooks.intuit.com
2. Sign in with Intuit account
3. Select company if multiple
4. Wait for dashboard to load

## Common Operations

### Navigation
- Use left sidebar for sections
- Dashboard shows key metrics
- Search bar for transactions

### Invoices
- Sales > Invoices
- View status (paid/unpaid)
- Click to view details

### Expenses
- Expenses section
- Review and categorize
- Match with bank transactions

### Reports
- Reports section
- Run P&L, Balance Sheet, etc.
- Customize date ranges

## Safety Rules
- NEVER create invoices without approval
- Be careful with payment recording
- Don't modify closed periods
- Report any discrepancies immediately
- Verify amounts before any updates`,
    commonTasks: [
      'Check invoices',
      'View expenses',
      'Run report',
      'Find transaction',
      'Check dashboard',
    ],
    knownIssues: [
      {
        problem: 'Company file locked',
        solution: 'Another user may have it open. Report to user.',
        severity: 'major',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'stripe-dashboard',
    name: 'Stripe Dashboard',
    category: 'finance',
    description: 'Manage Stripe payments, subscriptions, and customers',
    services: ['stripe'],
    requiresCredentials: true,
    riskLevel: 'high',
    instructions: `# Stripe Dashboard Skill

## Login Flow
1. Navigate to dashboard.stripe.com
2. Enter email and password
3. Handle 2FA (usually required)
4. Wait for dashboard to load

## Common Operations

### Payments
- View recent payments on home
- Click payment for details
- Check status (succeeded/failed)

### Customers
- Customers section
- Search by email or name
- View subscriptions and payment history

### Subscriptions
- Billing > Subscriptions
- Check status (active/canceled)
- View upcoming invoices

### Reports
- Reports section for analytics
- Check revenue, MRR, churn

## Safety Rules
- NEVER issue refunds without explicit approval
- Don't cancel subscriptions without confirmation
- Be very careful with any financial operations
- Report any unusual activity immediately`,
    commonTasks: [
      'Check payment',
      'Find customer',
      'View subscription',
      'Check revenue',
      'Find transaction',
    ],
    knownIssues: [
      {
        problem: 'Test mode vs Live mode confusion',
        solution: 'Check toggle at top - ensure in correct mode.',
        severity: 'critical',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    category: 'social',
    description: 'Manage Instagram posts, stories, and messages',
    services: ['instagram'],
    requiresCredentials: true,
    riskLevel: 'high',
    instructions: `# Instagram Skill

## Login Flow
1. Navigate to instagram.com
2. Enter username/email and password
3. Handle 2FA if enabled
4. Dismiss any app download prompts

## Common Operations

### Feed
- Scroll to view posts
- Check notifications (heart icon)
- View stories at top

### Profile
- Click profile icon
- View posts, followers, following
- Check insights if business account

### Messages
- Click DM icon (paper plane)
- Read and respond to messages
- Be careful with responses

### Posting
- NEVER post without explicit approval
- Use Creator Studio for scheduled posts if available

## Safety Rules
- NEVER post content without approval
- NEVER send DMs without confirmation
- Be aware all actions may be visible
- Report any suspicious activity
- Handle with extreme care - public account`,
    commonTasks: [
      'Check notifications',
      'Read DMs',
      'View profile stats',
      'Check comments',
      'Search for account',
    ],
    knownIssues: [
      {
        problem: 'Suspicious login attempt blocked',
        solution: 'Report to user immediately - requires their verification.',
        severity: 'critical',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    category: 'social',
    description: 'Manage Facebook page, posts, and messages',
    services: ['facebook', 'meta'],
    requiresCredentials: true,
    riskLevel: 'high',
    instructions: `# Facebook Skill

## Login Flow
1. Navigate to facebook.com
2. Enter email/phone and password
3. Handle 2FA if enabled
4. Wait for feed to load

## Common Operations

### Personal vs Page
- Switch to Page via top dropdown
- Use Business Suite for page management
- Check which context you're in

### Notifications
- Check bell icon
- Review page notifications separately

### Messages
- Messenger or Page inbox
- Read and respond carefully
- Note response time requirements

### Posts
- NEVER post without approval
- Check post performance in insights

## Safety Rules
- ALWAYS verify if personal or page context
- NEVER post without explicit approval
- Be careful with comments and reactions
- Report any security alerts immediately`,
    commonTasks: [
      'Check page notifications',
      'Read page messages',
      'View page insights',
      'Check comments',
      'Review posts',
    ],
    knownIssues: [
      {
        problem: 'Account checkpoint/verification',
        solution: 'Report to user - requires their action.',
        severity: 'critical',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'zoom',
    name: 'Zoom',
    category: 'communication',
    description: 'Manage Zoom meetings, recordings, and settings',
    services: ['zoom'],
    requiresCredentials: true,
    riskLevel: 'low',
    instructions: `# Zoom Skill

## Login Flow
1. Navigate to zoom.us and click "Sign In"
2. Enter email and password
3. Handle 2FA if enabled
4. Wait for dashboard to load

## Common Operations

### Meetings
- View upcoming meetings on home
- Check meeting details (ID, password)
- View past meetings and recordings

### Scheduling
- Click "Schedule" to create meeting
- Set date, time, duration
- Configure waiting room, password

### Recordings
- Check cloud recordings
- View and share recordings
- Download if needed

## Safety Rules
- Be careful with meeting passwords
- Verify meeting settings before sharing
- Check recording permissions`,
    commonTasks: [
      'Check upcoming meetings',
      'Get meeting link',
      'Find recording',
      'Schedule meeting',
      'Check settings',
    ],
    knownIssues: [],
    version: '1.0.0',
  },
  {
    id: 'zendesk',
    name: 'Zendesk',
    category: 'communication',
    description: 'Manage Zendesk support tickets, customers, and knowledge base',
    services: ['zendesk'],
    requiresCredentials: true,
    riskLevel: 'medium',
    instructions: `# Zendesk Skill

## Login Flow
1. Navigate to [subdomain].zendesk.com/agent
2. Enter email and password
3. Handle 2FA if enabled
4. Wait for Agent Workspace to load

## Common Operations

### Tickets
- Views in left sidebar (My Open, Unassigned, etc.)
- Click ticket to open
- Use internal/public comment tabs
- Update status, assignee, priority via sidebar fields

### Customers
- Click requester name to view profile
- Check previous tickets, org membership

### Macros
- Apply macros for common responses
- Use search to find the right macro

### Knowledge Base
- Guide section for help center articles
- Search existing articles before writing replies

## Safety Rules
- NEVER close tickets without proper resolution
- Verify public vs internal note before submitting
- Be careful with ticket merging
- Report any SLA breaches immediately`,
    commonTasks: [
      'Check open tickets',
      'Reply to ticket',
      'Assign ticket',
      'Search tickets',
      'Check SLA status',
    ],
    knownIssues: [
      {
        problem: 'Agent Workspace slow to load',
        solution: 'Wait up to 20 seconds. Zendesk can be slow with large ticket volumes.',
        severity: 'minor',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'freshdesk',
    name: 'Freshdesk',
    category: 'communication',
    description: 'Manage Freshdesk support tickets and customer conversations',
    services: ['freshdesk', 'freshworks'],
    requiresCredentials: true,
    riskLevel: 'medium',
    instructions: `# Freshdesk Skill

## Login Flow
1. Navigate to [subdomain].freshdesk.com
2. Enter email and password
3. Wait for dashboard to load

## Common Operations

### Tickets
- Dashboard shows ticket overview
- Use filters: Open, Pending, Resolved, Closed
- Click ticket to view/respond
- Reply, forward, or add note

### Views
- Use saved views for common filters
- Sort by priority, created date, SLA

### Canned Responses
- Use canned responses for common queries
- Personalize before sending

## Safety Rules
- Verify public vs private reply
- NEVER delete tickets without approval
- Check SLA before prioritizing
- Report spam tickets instead of deleting`,
    commonTasks: [
      'Check open tickets',
      'Reply to customer',
      'Update ticket status',
      'Search for ticket',
      'Check dashboard',
    ],
    knownIssues: [],
    version: '1.0.0',
  },
  {
    id: 'intercom',
    name: 'Intercom',
    category: 'communication',
    description: 'Manage Intercom conversations, customers, and help center',
    services: ['intercom'],
    requiresCredentials: true,
    riskLevel: 'medium',
    instructions: `# Intercom Skill

## Login Flow
1. Navigate to app.intercom.com
2. Enter email and password
3. Select workspace if multiple
4. Wait for inbox to load

## Common Operations

### Inbox
- Conversations sorted by assignment, status
- Click conversation to open
- Reply, snooze, or close
- Use saved replies for common responses

### Customers
- People section for customer profiles
- View conversation history, events, attributes
- Filter by segment

### Articles
- Help Center for knowledge base
- Search existing articles

## Safety Rules
- Verify if sending to user or internal note
- NEVER close conversations without resolution
- Be mindful of live chat response times
- Report bot handoff failures`,
    commonTasks: [
      'Check inbox',
      'Reply to conversation',
      'Close conversation',
      'Find customer',
      'Check unassigned',
    ],
    knownIssues: [
      {
        problem: 'Conversation not loading',
        solution: 'Try refreshing the page. Intercom can lag with heavy inboxes.',
        severity: 'minor',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'pipedrive',
    name: 'Pipedrive',
    category: 'crm',
    description: 'Manage Pipedrive deals, contacts, and sales pipeline',
    services: ['pipedrive'],
    requiresCredentials: true,
    riskLevel: 'medium',
    instructions: `# Pipedrive Skill

## Login Flow
1. Navigate to app.pipedrive.com
2. Enter email and password
3. Wait for pipeline to load

## Common Operations

### Pipeline
- Default view shows deal pipeline
- Drag deals between stages
- Click deal for details

### Contacts
- People and Organizations sections
- Search by name, email, company
- View linked deals and activities

### Activities
- Calendar for scheduled activities
- Log calls, meetings, emails
- Mark activities as done

### Reports
- Insights section for reports
- Revenue forecasting, deal metrics

## Safety Rules
- NEVER delete deals without approval
- Be careful updating deal values
- Verify before moving deals to Won/Lost
- Log all customer interactions`,
    commonTasks: [
      'Check pipeline',
      'Update deal',
      'Log activity',
      'Find contact',
      'Check activities due',
    ],
    knownIssues: [],
    version: '1.0.0',
  },
  {
    id: 'xero',
    name: 'Xero',
    category: 'finance',
    description: 'Manage Xero accounting, invoices, bank reconciliation',
    services: ['xero'],
    requiresCredentials: true,
    riskLevel: 'high',
    instructions: `# Xero Skill

## Login Flow
1. Navigate to login.xero.com
2. Enter email and password
3. Handle 2FA (usually required)
4. Select organization if multiple
5. Wait for dashboard to load

## Common Operations

### Dashboard
- Key metrics: bank balance, invoices, bills
- Cash flow overview

### Bank Reconciliation
- Bank Accounts > Reconcile
- Match transactions with invoices/bills
- Create rules for recurring items

### Invoices
- Sales > Invoices
- View drafts, awaiting payment, overdue
- Click to view/edit

### Bills
- Purchases > Bills to Pay
- Review and approve bills

### Reports
- Accounting > Reports
- P&L, Balance Sheet, Aged Receivables

## Safety Rules
- NEVER approve bills or payments without explicit approval
- NEVER create or void invoices without confirmation
- Be extremely careful with bank reconciliation
- Don't modify locked periods
- Report any discrepancies immediately`,
    commonTasks: [
      'Reconcile bank transactions',
      'Check invoices',
      'View dashboard',
      'Run report',
      'Check bills to pay',
    ],
    knownIssues: [
      {
        problem: '2FA required every login',
        solution: 'Report to user if 2FA prompt appears - requires their authenticator.',
        severity: 'major',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'mailchimp',
    name: 'Mailchimp',
    category: 'communication',
    description: 'Manage Mailchimp email campaigns, audiences, and automations',
    services: ['mailchimp'],
    requiresCredentials: true,
    riskLevel: 'high',
    instructions: `# Mailchimp Skill

## Login Flow
1. Navigate to login.mailchimp.com
2. Enter username and password
3. Wait for dashboard to load

## Common Operations

### Campaigns
- Campaigns section for email campaigns
- View drafts, sent, scheduled
- Click to edit or view reports

### Audiences
- Audience section for subscriber lists
- Search for contacts, view segments
- Check growth and engagement

### Automations
- Automations for email sequences
- View active automations and performance

### Reports
- Campaign reports for opens, clicks, etc.
- Audience growth reports

## Safety Rules
- NEVER send campaigns without explicit approval
- ALWAYS preview before sending
- Be careful with audience/list operations
- Don't modify running automations without approval
- Verify sender info and subject lines`,
    commonTasks: [
      'Check campaign stats',
      'View audience',
      'Search contacts',
      'Check automation',
      'View reports',
    ],
    knownIssues: [
      {
        problem: 'Campaign editor slow',
        solution: 'Wait for full load. Don\'t click while editor is loading.',
        severity: 'minor',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'apollo',
    name: 'Apollo.io',
    category: 'crm',
    description: 'Find leads, verify emails, and manage outreach with Apollo.io',
    services: ['apollo', 'apollo.io'],
    requiresCredentials: true,
    riskLevel: 'medium',
    instructions: `# Apollo.io Skill

## Login Flow
1. Navigate to app.apollo.io
2. Enter email and password
3. Wait for dashboard to load

## Common Operations

### People Search
- Use search filters: title, company, industry, location
- Save searches for reuse
- View contact details and email status

### Company Search
- Search by industry, size, technology, revenue
- View company profiles and employees

### Sequences
- Outreach sequences for email campaigns
- View active sequences and performance
- Add contacts to sequences

### Enrichment
- Verify emails before outreach
- Enrich contact data with company info

## Safety Rules
- Respect daily email/search limits
- Verify email validity before sending
- Don't export more data than needed
- Follow anti-spam guidelines for outreach
- Log all outreach in the platform`,
    commonTasks: [
      'Search for leads',
      'Find contacts at company',
      'Verify email addresses',
      'Add to sequence',
      'Check sequence stats',
    ],
    knownIssues: [
      {
        problem: 'Credit limits reached',
        solution: 'Report to user - may need plan upgrade or wait for reset.',
        severity: 'major',
      },
    ],
    version: '1.0.0',
  },
  {
    id: 'linkedin-sales-navigator',
    name: 'LinkedIn Sales Navigator',
    category: 'crm',
    description: 'Advanced LinkedIn search, lead tracking, and InMail',
    services: ['linkedin', 'sales-navigator'],
    requiresCredentials: true,
    riskLevel: 'high',
    instructions: `# LinkedIn Sales Navigator Skill

## Login Flow
1. Navigate to linkedin.com/sales
2. Sign in with LinkedIn credentials
3. Wait for Sales Navigator to load

## Common Operations

### Lead Search
- Advanced filters: title, company, industry, geography, seniority
- Save searches for alerts
- Save leads to lists

### Account Search
- Search companies by size, industry, growth
- View company insights and employees

### InMail
- Send InMail to leads (limited per month)
- Keep messages short and personalized
- Track open/response rates

### Lead Lists
- Organize leads into lists
- Track engagement and activity
- Set alerts for lead changes

## Safety Rules
- Don't exceed daily connection/InMail limits
- ALWAYS personalize outreach messages
- Never send bulk identical messages
- Respect profile privacy settings
- Log all interactions for the team`,
    commonTasks: [
      'Search for leads',
      'Save lead to list',
      'Send InMail',
      'Check lead updates',
      'Search companies',
    ],
    knownIssues: [
      {
        problem: 'Daily limit reached for InMail',
        solution: 'Report to user - limits reset daily. Use connection requests instead.',
        severity: 'major',
      },
      {
        problem: 'Sales Navigator not accessible',
        solution: 'Check if subscription is active. Report to user.',
        severity: 'critical',
      },
    ],
    version: '1.0.0',
  },
]

/**
 * Get all available skills
 */
export function getAllSkills(): Skill[] {
  return SKILLS
}

/**
 * Get a skill by ID
 */
export function getSkillById(id: string): Skill | undefined {
  return SKILLS.find(s => s.id === id)
}

/**
 * Get skills by category
 */
export function getSkillsByCategory(category: SkillCategory): Skill[] {
  return SKILLS.filter(s => s.category === category)
}

/**
 * Find skills that match a service
 */
export function findSkillsForService(service: string): Skill[] {
  const lowerService = service.toLowerCase()
  return SKILLS.filter(s => 
    s.services.some(svc => svc.toLowerCase().includes(lowerService)) ||
    s.name.toLowerCase().includes(lowerService)
  )
}

/**
 * Detect skills needed for a task description
 */
export function detectSkillsForTask(taskDescription: string): Skill[] {
  const lowerTask = taskDescription.toLowerCase()
  const matchedSkills: Skill[] = []
  
  for (const skill of SKILLS) {
    // Check if task mentions the skill's services or name
    const matches = skill.services.some(svc => lowerTask.includes(svc)) ||
                    lowerTask.includes(skill.name.toLowerCase()) ||
                    skill.commonTasks.some(task => 
                      lowerTask.includes(task.toLowerCase().slice(0, 10))
                    )
    
    if (matches && !matchedSkills.includes(skill)) {
      matchedSkills.push(skill)
    }
  }
  
  // If no specific skills matched, include web research as fallback
  if (matchedSkills.length === 0) {
    const webResearch = getSkillById('web-research')
    if (webResearch) matchedSkills.push(webResearch)
  }
  
  return matchedSkills
}

/**
 * Build skill instructions for injection into agent prompt
 */
export function buildSkillInstructions(skills: Skill[]): string {
  if (skills.length === 0) return ''
  
  const sections: string[] = ['=== SKILL INSTRUCTIONS ===\n']
  
  for (const skill of skills) {
    sections.push(`## ${skill.name}\n${skill.instructions}\n`)
    
    if (skill.knownIssues.length > 0) {
      sections.push('### Troubleshooting')
      for (const issue of skill.knownIssues) {
        sections.push(`- **${issue.problem}**: ${issue.solution}`)
      }
      sections.push('')
    }
  }
  
  return sections.join('\n')
}

/**
 * Get credential requirements for skills
 */
export function getRequiredCredentials(skills: Skill[]): string[] {
  const credentials: Set<string> = new Set()
  
  for (const skill of skills) {
    if (skill.requiresCredentials) {
      for (const service of skill.services) {
        credentials.add(service)
      }
    }
  }
  
  return Array.from(credentials)
}

/**
 * Get the highest risk level from a set of skills
 */
export function getHighestRiskLevel(skills: Skill[]): 'low' | 'medium' | 'high' {
  const levels = skills.map(s => s.riskLevel)
  if (levels.includes('high')) return 'high'
  if (levels.includes('medium')) return 'medium'
  return 'low'
}
