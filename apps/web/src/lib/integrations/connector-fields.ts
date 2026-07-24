// Connector field definitions + setup guides for in-chat integration setup
// Shared by: chat tool handler, system prompt, and Settings Connectors page

export type ConnectorFieldType = 'text' | 'password'

export interface ConnectorField {
  key: string
  label: string
  type: ConnectorFieldType
  placeholder?: string
}

export interface ConnectorConfig {
  id: string
  name: string
  description: string
  category: string
  fields: ConnectorField[]
  setupGuide: string
  docsUrl: string | null
  status: 'available' | 'coming_soon'
  logoUrl?: string
}

export const CONNECTOR_CONFIGS: Record<string, ConnectorConfig> = {
  slack: {
    id: 'slack',
    name: 'Slack',
    description: 'Team messaging and notifications',
    category: 'Communication',
    fields: [
      { key: 'slack_client_id', label: 'Client ID', type: 'text', placeholder: 'e.g. 1234567890.1234567890' },
      { key: 'slack_client_secret', label: 'Client Secret', type: 'password', placeholder: 'e.g. abc123def456...' },
      { key: 'slack_signing_secret', label: 'Signing Secret', type: 'password', placeholder: 'e.g. abc123def456...' },
    ],
    setupGuide: `1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Name your app and select your workspace
4. Go to **Basic Information** → scroll to **App Credentials**
5. Copy **Client ID**, **Client Secret**, and **Signing Secret**
6. Under **OAuth & Permissions**, add the redirect URL shown after connecting`,
    docsUrl: 'https://api.slack.com/apps',
    status: 'available',
    logoUrl: 'https://cdn.simpleicons.org/slack',
  },

  discord: {
    id: 'discord',
    name: 'Discord',
    description: 'Server and DM bot integration',
    category: 'Communication',
    fields: [
      { key: 'discord_bot_token', label: 'Bot Token', type: 'password', placeholder: 'e.g. MTAx...' },
    ],
    setupGuide: `1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Create an application (or select an existing one)
3. Open **Bot** in the left sidebar and click **Reset Token** if needed
4. Copy the bot token and paste it here
5. Under **Privileged Gateway Intents**, enable the intents your bot requires`,
    docsUrl: 'https://discord.com/developers/docs',
    status: 'available',
    logoUrl: 'https://cdn.simpleicons.org/discord/5865F2',
  },

  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT models and AI capabilities',
    category: 'AI',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'sk-...' },
    ],
    setupGuide: `1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Click **Create new secret key**
3. Give it a name (e.g. "2Hands") and click **Create**
4. Copy the key immediately — you won't be able to see it again`,
    docsUrl: 'https://platform.openai.com/docs',
    status: 'available',
    logoUrl: 'https://cdn.simpleicons.org/openai',
  },

  perplexity: {
    id: 'perplexity',
    name: 'Perplexity',
    description: 'AI-powered search and answers',
    category: 'AI',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'pplx-...' },
    ],
    setupGuide: `1. Go to [perplexity.ai/settings/api](https://www.perplexity.ai/settings/api)
2. Click * 2Hands-hosted MCP host + universal OpenAPI→MCP server. Copy the key — it starts with \`pplx-\``,
    docsUrl: 'https://docs.perplexity.ai',
    status: 'available',
  },

  firecrawl: {
    id: 'firecrawl',
    name: 'Firecrawl',
    description: 'AI-powered web scraper and data extraction',
    category: 'AI',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'fc-...' },
    ],
    setupGuide: `1. Go to [firecrawl.dev](https://www.firecrawl.dev) and sign in
2. Open the **Dashboard** → **API Keys**
3. Click **Create API Key**
4. Copy the key — it starts with \`fc-\``,
    docsUrl: 'https://docs.firecrawl.dev',
    status: 'available',
  },

  elevenlabs: {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    description: 'AI voice generation and text-to-speech',
    category: 'AI',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'xi-...' },
    ],
    setupGuide: `1. Go to [elevenlabs.io](https://elevenlabs.io) and sign in
2. Click your **profile icon** (bottom-left) → **Profile + API key**
3. Click the **eye icon** next to your API key to reveal it
4. Copy the key`,
    docsUrl: 'https://docs.elevenlabs.io',
    status: 'available',
  },

  stripe: {
    id: 'stripe',
    name: 'Stripe',
    description: 'Payments and subscriptions',
    category: 'Finance',
    fields: [
      { key: 'secret_key', label: 'Secret Key', type: 'password', placeholder: 'sk_live_... or sk_test_...' },
    ],
    setupGuide: `1. Go to [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys)
2. Under **Standard keys**, find your **Secret key**
3. Click **Reveal live key** (or use test key for development)
4. Copy the key — it starts with \`sk_live_\` or \`sk_test_\``,
    docsUrl: 'https://docs.stripe.com',
    status: 'coming_soon',
    logoUrl: 'https://cdn.simpleicons.org/stripe',
  },

  supabase: {
    id: 'supabase',
    name: 'Supabase',
    description: 'Connect your own Supabase project',
    category: 'Database',
    fields: [
      { key: 'project_url', label: 'Project URL', type: 'text', placeholder: 'https://xxxx.supabase.co' },
      { key: 'anon_key', label: 'Anon Key', type: 'password', placeholder: 'eyJhbGciOi...' },
      { key: 'service_role_key', label: 'Service Role Key (optional)', type: 'password', placeholder: 'eyJhbGciOi...' },
    ],
    setupGuide: `1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and open your project
2. Go to **Project Settings** → **API**
3. Copy the **Project URL** (e.g. \`https://xxxx.supabase.co\`)
4. Copy the **anon public** key
5. Optionally copy the **service_role** key (for admin access)`,
    docsUrl: 'https://supabase.com/docs',
    status: 'coming_soon',
    logoUrl: 'https://cdn.simpleicons.org/supabase',
  },

  github: {
    id: 'github',
    name: 'GitHub',
    description: 'Repos, issues, and pull requests',
    category: 'Development',
    fields: [
      { key: 'personal_access_token', label: 'Personal Access Token', type: 'password', placeholder: 'ghp_...' },
    ],
    setupGuide: `1. Go to [github.com/settings/tokens](https://github.com/settings/tokens) (classic tokens work best for private repos)
2. Click **Generate new token (classic)**
3. Set a name and expiration
4. Check the **repo** scope (full control of private repos)
5. Click **Generate token** — copy it immediately (starts with \`ghp_\`)`,
    docsUrl: 'https://docs.github.com',
    status: 'available',
    logoUrl: 'https://cdn.simpleicons.org/github',
  },

  gmail: {
    id: 'gmail',
    name: 'Gmail',
    description: 'Read and send emails',
    category: 'Communication',
    fields: [],
    setupGuide: 'Gmail uses OAuth — click Connect and sign in with your Google account.',
    docsUrl: null,
    status: 'coming_soon',
    logoUrl: 'https://cdn.simpleicons.org/gmail',
  },

  hubspot: {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'CRM, contacts, and deals',
    category: 'CRM',
    fields: [
      { key: 'api_key', label: 'Private App Access Token', type: 'password', placeholder: 'pat-...' },
    ],
    setupGuide: `1. Go to your HubSpot account → **Settings** (gear icon)
2. Navigate to **Integrations** → **Private Apps**
3. Click **Create a private app**
4. Name it, select the scopes you need
5. Click **Create app** → copy the **Access token**`,
    docsUrl: 'https://developers.hubspot.com/docs',
    status: 'coming_soon',
    logoUrl: 'https://cdn.simpleicons.org/hubspot',
  },

  shopify: {
    id: 'shopify',
    name: 'Shopify',
    description: 'E-commerce store management',
    category: 'E-Commerce',
    fields: [
      { key: 'store_url', label: 'Store URL', type: 'text', placeholder: 'your-store.myshopify.com' },
      { key: 'admin_api_token', label: 'Admin API Access Token', type: 'password', placeholder: 'shpat_...' },
    ],
    setupGuide: `1. Go to your Shopify admin → **Settings** → **Apps and sales channels**
2. Click **Develop apps** → **Create an app**
3. Configure **Admin API scopes** you need
4. Click **Install app** → copy the **Admin API access token**`,
    docsUrl: 'https://shopify.dev/docs',
    status: 'coming_soon',
    logoUrl: 'https://cdn.simpleicons.org/shopify',
  },

  zapier: {
    id: 'zapier',
    name: 'Zapier',
    description: 'Connect 6,000+ apps via automation',
    category: 'Automation',
    fields: [
      { key: 'webhook_url', label: 'Webhook URL', type: 'text', placeholder: 'https://hooks.zapier.com/...' },
    ],
    setupGuide: `1. Go to [zapier.com](https://zapier.com) and create a new Zap
2. Set the trigger to **Webhooks by Zapier** → **Catch Hook**
3. Copy the **webhook URL** provided
4. Set up the action (what should happen when data arrives)`,
    docsUrl: 'https://zapier.com/help',
    status: 'coming_soon',
    logoUrl: 'https://cdn.simpleicons.org/zapier',
  },

  attio: {
    id: 'attio',
    name: 'Attio',
    description: 'CRM — people, companies, lists, and notes',
    category: 'CRM',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'Paste your Attio API key here' },
    ],
    setupGuide: `1. Open your Attio workspace and click **Settings** (gear icon, bottom-left)
2. Go to **Developers** → **API keys**
3. Click **Create API key**, give it a name (e.g. "2Hands")
4. Select the scopes you need (read/write for People, Companies, and Lists is recommended)
5. Copy the key and paste it here — it is stored encrypted and never shared`,
    docsUrl: 'https://attio.com/help/apps/other-apps/generating-an-api-key',
    status: 'available',
  },
}

// Get all available connectors for system prompt context
export function getConnectorSummaryForPrompt(connectedIds: string[]): string {
  const lines = Object.values(CONNECTOR_CONFIGS).map(c => {
    const connected = connectedIds.includes(c.id)
    const status = connected ? '✅ Connected' : c.status === 'available' ? '🔌 Available' : '🔜 Coming soon'
    return `- **${c.name}** (${c.category}): ${c.description} [${status}]`
  })
  return lines.join('\n')
}

// Get setup guide for a specific connector
export function getConnectorGuide(connectorId: string): string | null {
  const config = CONNECTOR_CONFIGS[connectorId]
  if (!config) return null
  return config.setupGuide
}

// Get connector config by ID
export function getConnectorConfig(connectorId: string): ConnectorConfig | null {
  return CONNECTOR_CONFIGS[connectorId] || null
}
