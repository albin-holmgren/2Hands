'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, ChevronLeft, Plus, ExternalLink, Trash2, Puzzle, Check, X } from 'lucide-react'
import { supportsChannelTrustProvider } from '@/lib/security/channel-trust'
import { getConnectorConfig } from '@/lib/integrations/connector-fields'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'

// ============================================================
// Types
// ============================================================

type IntegrationConnection = {
  id: string
  provider: string
  status: string
  config: Record<string, unknown>
  created_at: string
  updated_at?: string
}

type ChannelAccessPolicy = 'pairing' | 'allowlist' | 'open' | 'disabled'

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function readChannelAccessPolicy(config: Record<string, unknown>): ChannelAccessPolicy {
  const raw = typeof config.channel_access_policy === 'string'
    ? config.channel_access_policy.trim().toLowerCase()
    : ''

  if (raw === 'pairing' || raw === 'allowlist' || raw === 'open' || raw === 'disabled') {
    return raw
  }

  return 'pairing'
}

type Connector = {
  id: string
  name: string
  description: string
  overview: string
  category: string
  logoUrl: string
  logoBg: string
  docsUrl: string | null
  status: 'available' | 'coming_soon'
  hasOAuth: boolean
}

// ============================================================
// Brand Logo Component
// ============================================================

function ConnectorLogo({ connector, size = 40 }: { connector: Connector; size?: number }) {
  const [imgError, setImgError] = useState(false)
  const showImg = !!connector.logoUrl && !imgError
  return (
    <div
      className={`rounded-xl flex items-center justify-center overflow-hidden border border-border/60 ${connector.logoBg}`}
      style={{ width: size, height: size }}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={connector.logoUrl}
          alt={connector.name}
          width={size * 0.55}
          height={size * 0.55}
          className="object-contain"
          loading="lazy"
          onError={() => setImgError(true)}
        />
      ) : (
        <span style={{ fontSize: size * 0.35, fontWeight: 700, color: 'var(--muted-foreground)' }}>
          {connector.name.slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  )
}

// ============================================================
// Connector Registry — real brand logos
// ============================================================

const CONNECTORS: Connector[] = [
  {
    id: 'slack',
    name: 'Slack',
    description: 'Team messaging and notifications',
    overview: 'Connect Slack to let your AI agents send messages, respond to mentions, and automate team communication directly in your channels.',
    category: 'Communication',
    logoUrl: 'https://cdn.simpleicons.org/slack',
    logoBg: 'bg-muted',
    docsUrl: 'https://api.slack.com/apps',
    status: 'available',
    hasOAuth: true,
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Server and DM bot integration',
    overview: 'Connect Discord so your AI agents can moderate channels, respond in DMs, and automate community operations with trust policies.',
    category: 'Communication',
    logoUrl: 'https://cdn.simpleicons.org/discord/5865F2',
    logoBg: 'bg-muted',
    docsUrl: 'https://discord.com/developers/docs',
    status: 'available',
    hasOAuth: false,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Unlock powerful AI features',
    overview: 'Connect OpenAI to access GPT models, embeddings, and other AI capabilities directly through your agents.',
    category: 'AI',
    logoUrl: 'https://cdn.simpleicons.org/openai',
    logoBg: 'bg-muted',
    docsUrl: 'https://platform.openai.com/docs',
    status: 'available',
    hasOAuth: false,
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    description: 'AI-powered search and answer engine',
    overview: 'Integrate Perplexity for AI-powered search and answer engine capabilities in your application.',
    category: 'AI',
    logoUrl: '',
    logoBg: 'bg-muted',
    docsUrl: 'https://docs.perplexity.ai',
    status: 'available',
    hasOAuth: false,
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    description: 'AI-powered scraper, search and retrieval tool',
    overview: 'Connect Firecrawl for powerful web scraping, search, and data extraction. Let your agents gather structured data from any website.',
    category: 'AI',
    logoUrl: '',
    logoBg: 'bg-muted',
    docsUrl: 'https://docs.firecrawl.dev',
    status: 'available',
    hasOAuth: false,
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    description: 'AI voice generation, text-to-speech, and speech-to-text',
    overview: 'Integrate ElevenLabs for AI voice generation, text-to-speech, and speech-to-text capabilities in your agent workflows.',
    category: 'AI',
    logoUrl: '',
    logoBg: 'bg-muted',
    docsUrl: 'https://docs.elevenlabs.io',
    status: 'available',
    hasOAuth: false,
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Set up payments',
    overview: 'Integrate Stripe to monitor payments, manage subscriptions, handle refunds, and generate financial reports through your AI agents.',
    category: 'Finance',
    logoUrl: 'https://cdn.simpleicons.org/stripe',
    logoBg: 'bg-muted',
    docsUrl: 'https://docs.stripe.com',
    status: 'coming_soon',
    hasOAuth: false,
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Connect your own Supabase project',
    overview: 'Connect an external Supabase project to let agents query databases, manage auth users, and interact with your backend directly.',
    category: 'Database',
    logoUrl: 'https://cdn.simpleicons.org/supabase',
    logoBg: 'bg-muted',
    docsUrl: 'https://supabase.com/docs',
    status: 'coming_soon',
    hasOAuth: false,
  },
  {
    id: 'shopify',
    name: 'Shopify',
    description: 'Build an eCommerce store',
    overview: 'Connect Shopify to manage orders, products, inventory, and customers. Let your agents automate e-commerce operations and fulfillment.',
    category: 'E-Commerce',
    logoUrl: 'https://cdn.simpleicons.org/shopify',
    logoBg: 'bg-muted',
    docsUrl: 'https://shopify.dev/docs',
    status: 'coming_soon',
    hasOAuth: true,
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Repos, issues, and PRs',
    overview: 'Connect GitHub to let agents create branches, commit code, open pull requests, and automate your development workflow. Uses a Personal Access Token with repo scope.',
    category: 'Development',
    logoUrl: 'https://cdn.simpleicons.org/github',
    logoBg: 'bg-muted',
    docsUrl: 'https://docs.github.com',
    status: 'available',
    hasOAuth: false,
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Read and send emails',
    overview: 'Integrate Gmail to let agents read, compose, and manage emails on your behalf. Perfect for automating email workflows and customer communication.',
    category: 'Communication',
    logoUrl: 'https://cdn.simpleicons.org/gmail',
    logoBg: 'bg-muted',
    docsUrl: null,
    status: 'coming_soon',
    hasOAuth: true,
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Docs, databases, and wikis',
    overview: 'Connect Notion to search pages, query databases, create and update content, and manage your workspace programmatically through AI agents.',
    category: 'Productivity',
    logoUrl: 'https://cdn.simpleicons.org/notion',
    logoBg: 'bg-muted',
    docsUrl: null,
    status: 'coming_soon',
    hasOAuth: true,
  },
  {
    id: 'attio',
    name: 'Attio',
    description: 'CRM — people, companies, deals, and pipelines',
    overview: 'Connect Attio to let agents search and create people, companies, deals, pipeline entries, list entries, and notes directly in your CRM using your API key.',
    category: 'CRM',
    logoUrl: '',
    logoBg: 'bg-muted',
    docsUrl: 'https://attio.com/help/apps/other-apps/generating-an-api-key',
    status: 'available',
    hasOAuth: false,
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'CRM, contacts, and deals',
    overview: 'Integrate HubSpot to search contacts, create deals, manage companies, and automate your sales pipeline with AI-powered agents.',
    category: 'CRM',
    logoUrl: 'https://cdn.simpleicons.org/hubspot',
    logoBg: 'bg-muted',
    docsUrl: null,
    status: 'coming_soon',
    hasOAuth: true,
  },
  {
    id: 'zapier',
    name: 'Zapier',
    description: 'Connect 6,000+ apps',
    overview: 'Integrate Zapier to connect your agents with thousands of apps and automate workflows across your entire tool stack.',
    category: 'Automation',
    logoUrl: 'https://cdn.simpleicons.org/zapier',
    logoBg: 'bg-muted',
    docsUrl: 'https://zapier.com/help',
    status: 'coming_soon',
    hasOAuth: true,
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Schedule and manage events',
    overview: 'Integrate Google Calendar to let agents schedule meetings, check availability, send invitations, and manage your calendar automatically.',
    category: 'Productivity',
    logoUrl: 'https://cdn.simpleicons.org/googlecalendar',
    logoBg: 'bg-muted',
    docsUrl: null,
    status: 'coming_soon',
    hasOAuth: true,
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    description: 'Enterprise CRM platform',
    overview: 'Connect Salesforce to manage leads, opportunities, accounts, and automate your enterprise sales processes with AI agents.',
    category: 'CRM',
    logoUrl: 'https://cdn.simpleicons.org/salesforce',
    logoBg: 'bg-muted',
    docsUrl: null,
    status: 'coming_soon',
    hasOAuth: true,
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Project tracking and issues',
    overview: 'Integrate Jira to create and manage issues, track sprints, and automate project management tasks through your AI agents.',
    category: 'Development',
    logoUrl: 'https://cdn.simpleicons.org/jira',
    logoBg: 'bg-muted',
    docsUrl: null,
    status: 'coming_soon',
    hasOAuth: true,
  },
]

const CATEGORIES = ['All', ...Array.from(new Set(CONNECTORS.map(c => c.category)))]

// ============================================================
// Component
// ============================================================

export default function IntegrationsPage() {
  const [connections, setConnections] = useState<IntegrationConnection[]>([])
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [selectedConnector, setSelectedConnector] = useState<Connector | null>(null)

  const [connectorFieldValues, setConnectorFieldValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [deleteConnectionTargetId, setDeleteConnectionTargetId] = useState<string | null>(null)

  const origin = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return window.location.origin
  }, [])

  const formatRelativeDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    return date.toLocaleDateString()
  }

  const loadConnections = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/connections', { cache: 'no-store' })
      const data = (await res.json().catch(() => null)) as { connections?: IntegrationConnection[]; error?: string } | null
      if (res.ok) {
        setConnections(Array.isArray(data?.connections) ? data!.connections : [])
      }
    } catch {}
  }, [])

  useEffect(() => { loadConnections() }, [loadConnections])

  const connectorConnections = useCallback((connectorId: string) => {
    return connections.filter(c => c.provider === connectorId)
  }, [connections])

  const isEnabled = useCallback((connectorId: string) => {
    return connections.some(c => c.provider === connectorId && c.status === 'active')
  }, [connections])

  const hasConnection = useCallback((connectorId: string) => {
    return connections.some(c => c.provider === connectorId)
  }, [connections])

  // Filtered connectors
  const filteredConnectors = useMemo(() => {
    let result = CONNECTORS
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(c => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.category.toLowerCase().includes(q))
    }
    if (categoryFilter !== 'All') {
      result = result.filter(c => c.category === categoryFilter)
    }
    return result
  }, [searchQuery, categoryFilter])

  const enabledConnectors = filteredConnectors.filter(c => isEnabled(c.id) || hasConnection(c.id))
  const otherConnectors = filteredConnectors.filter(c => !isEnabled(c.id) && !hasConnection(c.id))

  const createConnection = async () => {
    if (!selectedConnector) return
    const connectorConfig = getConnectorConfig(selectedConnector.id)
    if (!connectorConfig || connectorConfig.fields.length === 0) {
      setError('This connector does not support manual credential setup yet')
      return
    }

    const config = connectorConfig.fields.reduce<Record<string, string>>((acc, field) => {
      acc[field.key] = (connectorFieldValues[field.key] || '').trim()
      return acc
    }, {})

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/integrations/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedConnector.id,
          config,
        }),
      })
      const data = (await res.json().catch(() => null)) as { connection?: IntegrationConnection; error?: string } | null
      if (!res.ok || !data?.connection) {
        setError(data?.error || 'Failed to create connection')
        return
      }
      setConnectorFieldValues({})
      await loadConnections()
    } catch { setError('Failed to create connection') } finally { setLoading(false) }
  }

  const deleteConnection = (connectionId: string) => {
    setDeleteConnectionTargetId(connectionId)
  }

  const confirmDeleteConnection = async () => {
    if (!deleteConnectionTargetId) return
    setDeleting(deleteConnectionTargetId)
    try {
      const res = await fetch(`/api/integrations/connections?id=${encodeURIComponent(deleteConnectionTargetId)}`, { method: 'DELETE' })
      if (res.ok) {
        setDeleteConnectionTargetId(null)
        await loadConnections()
      }
    } catch {
    } finally {
      setDeleting(null)
    }
  }

  const startSlackOAuth = (connectionId: string) => {
    const returnUrl = `${origin}/app`
    window.location.href = `/api/integrations/oauth/connect?provider=slack&connection_id=${encodeURIComponent(connectionId)}&return_url=${encodeURIComponent(returnUrl)}`
  }

  const updateConnectionConfig = async (
    connectionId: string,
    updates: {
      system_prompt?: string
      auto_respond?: boolean
      channel_access_policy?: ChannelAccessPolicy
      approve_external_user_id?: string
      revoke_external_user_id?: string
    }
  ) => {
    setSaving(connectionId)
    try {
      const res = await fetch('/api/integrations/connections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: connectionId, ...updates }),
      })
      if (res.ok) await loadConnections()
    } catch {} finally { setSaving(null) }
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(null), 2000) })
  }

  const deleteConnectionDialog = (
    <ConfirmationDialog
      open={Boolean(deleteConnectionTargetId)}
      onOpenChange={(open) => {
        if (!open) setDeleteConnectionTargetId(null)
      }}
      title="Delete connection"
      description="This will remove stored credentials and disconnect this integration immediately."
      confirmLabel="Delete connection"
      onConfirm={confirmDeleteConnection}
      isConfirming={Boolean(deleteConnectionTargetId && deleting === deleteConnectionTargetId)}
      destructive
    />
  )

  // ============================================================
  // Detail View
  // ============================================================
  if (selectedConnector) {
    const conns = connectorConnections(selectedConnector.id)
    const enabled = isEnabled(selectedConnector.id)
    const selectedConnectorConfig = getConnectorConfig(selectedConnector.id)
    const canCreateManualConnection = selectedConnectorConfig?.fields.length ? selectedConnectorConfig.fields.length > 0 : false

    return (
      <div className="space-y-8">
        {deleteConnectionDialog}

        {/* Back */}
        <button onClick={() => setSelectedConnector(null)} className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" /> Connectors
        </button>

        {/* Header */}
        <div className="flex items-center gap-4">
          <ConnectorLogo connector={selectedConnector} size={48} />
          <div className="flex-1">
            <h2 className="text-[18px] font-semibold text-foreground">{selectedConnector.name}</h2>
            <p className="text-[13px] text-muted-foreground">{selectedConnector.description}</p>
          </div>
          {enabled && (
            <span className="px-3 py-1 rounded-full text-[11px] font-semibold text-emerald-500 border border-emerald-500/30 bg-emerald-500/5">Enabled</span>
          )}
          {!enabled && selectedConnector.status === 'coming_soon' && (
            <span className="px-3 py-1 rounded-full text-[11px] font-medium text-muted-foreground border border-border">Coming Soon</span>
          )}
        </div>

        {/* Overview */}
        <div className="space-y-2">
          <h3 className="text-[15px] font-semibold text-foreground">Overview</h3>
          <p className="text-[13px] text-muted-foreground leading-relaxed">{selectedConnector.overview}</p>
        </div>

        {/* Connections Section — show if available OR has existing connections */}
        {(selectedConnector.status === 'available' || conns.length > 0) && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[16px] font-semibold text-foreground">Connections</h3>
                <p className="text-[13px] text-muted-foreground">Manage credentials for {selectedConnector.name}</p>
              </div>
              {selectedConnector.status === 'available' && canCreateManualConnection && (
                <button
                  onClick={() => setShowAddForm(prev => !prev)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-[13px] font-medium text-foreground hover:bg-foreground/5 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add connection
                </button>
              )}
            </div>

            {/* Add Connection Form */}
            {canCreateManualConnection && showAddForm && selectedConnectorConfig && (
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <p className="text-[13px] text-muted-foreground">
                  {selectedConnectorConfig.setupGuide}
                </p>
                <div className="grid gap-2.5">
                  {selectedConnectorConfig.fields.map((field) => (
                    <input
                      key={`field-${selectedConnector.id}-${field.key}`}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                      placeholder={field.placeholder || field.label}
                      type={field.type === 'password' ? 'password' : 'text'}
                      value={connectorFieldValues[field.key] || ''}
                      onChange={(e) => setConnectorFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      autoComplete="off"
                    />
                  ))}
                </div>
                <button
                  onClick={createConnection}
                  disabled={loading || selectedConnectorConfig.fields.some((field) => !(connectorFieldValues[field.key] || '').trim())}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" /> Create
                </button>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">{error}</div>
            )}

            {/* Connections Table */}
            {conns.length > 0 ? (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left px-4 py-3 text-[12px] font-medium text-muted-foreground">Name</th>
                      <th className="text-left px-4 py-3 text-[12px] font-medium text-muted-foreground">Used in projects</th>
                      <th className="text-left px-4 py-3 text-[12px] font-medium text-muted-foreground">Owner</th>
                      <th className="text-left px-4 py-3 text-[12px] font-medium text-muted-foreground">Updated</th>
                      <th className="text-right px-4 py-3 text-[12px] font-medium text-muted-foreground"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {conns.map(c => (
                      <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors group">
                        <td className="px-4 py-3.5">
                          <span className="text-[13px] font-medium text-foreground">{selectedConnector.name}</span>
                        </td>
                        <td className="px-4 py-3.5 text-[13px] text-muted-foreground">1</td>
                        <td className="px-4 py-3.5 text-[13px] text-muted-foreground">you</td>
                        <td className="px-4 py-3.5 text-[13px] text-muted-foreground">
                          {formatRelativeDate(c.updated_at || c.created_at)}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {selectedConnector.hasOAuth && c.status !== 'active' && (
                              <button onClick={() => startSlackOAuth(c.id)} className="px-3 py-1.5 rounded-lg bg-foreground text-background text-[12px] font-medium hover:opacity-90 transition-opacity">
                                Connect
                              </button>
                            )}
                            {selectedConnector.hasOAuth && c.status === 'active' && (
                              <button onClick={() => startSlackOAuth(c.id)} className="px-3 py-1.5 rounded-lg border border-border text-[12px] text-muted-foreground hover:text-foreground transition-colors">
                                Re-auth
                              </button>
                            )}
                            <button
                              onClick={() => deleteConnection(c.id)}
                              disabled={deleting === c.id}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-destructive/30 text-[12px] text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Disconnect
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center rounded-xl border border-dashed border-border">
                <Puzzle className="w-6 h-6 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-[13px] text-muted-foreground">No connections yet.</p>
              </div>
            )}

            {/* Active Connection Config */}
            {conns.filter(c => c.status === 'active').map(c => {
              const eventsUrl = `${origin}/api/integrations/slack/events?connection_id=${encodeURIComponent(c.id)}`
              const redirectUrl = `${origin}/api/integrations/oauth/callback`
              const isSlackConnection = c.provider === 'slack'
              const supportsChannelTrust = supportsChannelTrustProvider(c.provider)
              const channelAccessPolicy = readChannelAccessPolicy(c.config || {})
              const pendingExternalUsers = readStringArray(c.config?.pending_external_user_ids)
              const allowedExternalUsers = readStringArray(c.config?.allowed_external_user_ids)

              return (
                <div key={`config-${c.id}`} className="rounded-xl border border-border bg-card p-5 space-y-3">
                  <h4 className="text-[13px] font-semibold text-foreground">Configuration</h4>

                  {isSlackConnection && (
                    <div className="space-y-2.5">
                      <div className="text-[12px] text-muted-foreground">
                        <span className="font-medium text-foreground/80">Events URL</span>
                        <div className="mt-1.5 flex items-center gap-2">
                          <code className="flex-1 rounded-lg bg-background/50 border border-border px-3 py-2 font-mono text-[11px] break-all text-foreground/70">{eventsUrl}</code>
                          <button onClick={() => copyToClipboard(eventsUrl, `ev-${c.id}`)} className="shrink-0 px-3 py-1.5 rounded-lg border border-border text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                            {copied === `ev-${c.id}` ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                      </div>
                      <div className="text-[12px] text-muted-foreground">
                        <span className="font-medium text-foreground/80">Redirect URL</span>
                        <div className="mt-1.5 flex items-center gap-2">
                          <code className="flex-1 rounded-lg bg-background/50 border border-border px-3 py-2 font-mono text-[11px] break-all text-foreground/70">{redirectUrl}</code>
                          <button onClick={() => copyToClipboard(redirectUrl, `rd-${c.id}`)} className="shrink-0 px-3 py-1.5 rounded-lg border border-border text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                            {copied === `rd-${c.id}` ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="pt-3 space-y-3 border-t border-border">
                    <label className="flex items-center gap-2.5 text-[13px] text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={c.config?.auto_respond === true}
                        onChange={(e) => updateConnectionConfig(c.id, { auto_respond: e.target.checked })}
                        disabled={saving === c.id}
                        className="rounded border-border"
                      />
                      Auto-respond to all channel messages
                    </label>
                    {supportsChannelTrust && (
                      <div className="space-y-2">
                        <label className="text-[12px] font-medium text-foreground/80">Inbound access policy</label>
                        <select
                          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
                          value={channelAccessPolicy}
                          onChange={(e) => updateConnectionConfig(c.id, {
                            channel_access_policy: e.target.value as ChannelAccessPolicy,
                          })}
                          disabled={saving === c.id}
                        >
                          <option value="pairing">Pairing (default)</option>
                          <option value="allowlist">Allowlist only</option>
                          <option value="open">Open</option>
                          <option value="disabled">Disabled</option>
                        </select>
                        <p className="text-[11px] text-muted-foreground">
                          Pairing captures unknown external users as pending until approved.
                        </p>
                      </div>
                    )}

                    {supportsChannelTrust && pendingExternalUsers.length > 0 && (
                      <div className="space-y-2 rounded-lg border border-border bg-background/40 p-3">
                        <p className="text-[12px] font-medium text-foreground/90">Pending pairing requests</p>
                        <div className="space-y-1.5">
                          {pendingExternalUsers.map((userId) => (
                            <div key={`pending-${c.id}-${userId}`} className="flex items-center justify-between gap-2">
                              <code className="rounded bg-background px-2 py-1 font-mono text-[11px] text-foreground/80">{userId}</code>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => updateConnectionConfig(c.id, { approve_external_user_id: userId })}
                                  disabled={saving === c.id}
                                  className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 px-2 py-1 text-[11px] text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-50"
                                >
                                  <Check className="h-3 w-3" /> Approve
                                </button>
                                <button
                                  onClick={() => updateConnectionConfig(c.id, { revoke_external_user_id: userId })}
                                  disabled={saving === c.id}
                                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                                >
                                  <X className="h-3 w-3" /> Dismiss
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {supportsChannelTrust && allowedExternalUsers.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[12px] font-medium text-foreground/80">Approved external users</p>
                        <div className="flex flex-wrap gap-2">
                          {allowedExternalUsers.map((userId) => (
                            <button
                              key={`allowed-${c.id}-${userId}`}
                              onClick={() => updateConnectionConfig(c.id, { revoke_external_user_id: userId })}
                              disabled={saving === c.id}
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground/80 hover:text-foreground disabled:opacity-50"
                            >
                              {userId}
                              <X className="h-3 w-3" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="text-[12px] font-medium text-foreground/80">System prompt</label>
                      <textarea
                        className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[13px] text-foreground resize-y min-h-[60px] focus:outline-none focus:ring-1 focus:ring-foreground/20"
                        rows={3}
                        placeholder="You are a helpful assistant..."
                        defaultValue={typeof c.config?.system_prompt === 'string' ? c.config.system_prompt as string : ''}
                        onBlur={(e) => {
                          const current = typeof c.config?.system_prompt === 'string' ? c.config.system_prompt : ''
                          if (e.target.value.trim() !== current) updateConnectionConfig(c.id, { system_prompt: e.target.value })
                        }}
                        disabled={saving === c.id}
                      />
                    </div>
                    {saving === c.id && <p className="text-[11px] text-muted-foreground">Saving...</p>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Details */}
        <div className="space-y-3 pt-2 border-t border-border">
          <h3 className="text-[16px] font-semibold text-foreground">Details</h3>
          <div className="flex items-start gap-12 text-[13px]">
            <div>
              <span className="text-muted-foreground text-[12px]">Created by</span>
              <p className="text-foreground font-medium mt-0.5">{selectedConnector.name} <ExternalLink className="w-3 h-3 inline ml-0.5 opacity-50" /></p>
            </div>
            {selectedConnector.docsUrl && (
              <div>
                <span className="text-muted-foreground text-[12px]">Docs</span>
                <a href={selectedConnector.docsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-foreground font-medium mt-0.5 hover:underline underline-offset-2">
                  {selectedConnector.docsUrl.replace(/^https?:\/\//, '').slice(0, 50)} <ExternalLink className="w-3 h-3 opacity-50" />
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ============================================================
  // Grid View
  // ============================================================
  return (
    <div className="space-y-8">
      {deleteConnectionDialog}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
        <input
          type="text"
          placeholder="Search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-[14px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-shadow"
        />
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mt-2">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition-colors ${
              categoryFilter === cat
                ? 'bg-foreground/5 text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Shared / Connected Connectors */}
      {enabledConnectors.length > 0 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-[16px] font-semibold text-foreground">Shared connectors</h3>
            <p className="text-[13px] text-muted-foreground mt-0.5">Add functionality to your apps. Configured once by admins, available to everyone in your workspace.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {enabledConnectors.map(connector => (
              <button
                key={connector.id}
                onClick={() => setSelectedConnector(connector)}
                className="rounded-xl border border-border bg-card p-4 text-left hover:border-foreground/20 hover:bg-muted/50 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <ConnectorLogo connector={connector} size={40} />
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-emerald-400 bg-emerald-500/10">Enabled</span>
                </div>
                <h4 className="text-[14px] font-semibold text-foreground mt-1">{connector.name}</h4>
                <p className="text-[12px] text-muted-foreground mt-1 line-clamp-2">{connector.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Available Connectors */}
      {otherConnectors.length > 0 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-[16px] font-semibold text-foreground">
              {enabledConnectors.length > 0 ? 'Personal connectors' : 'Connectors'}
            </h3>
            <p className="text-[13px] text-muted-foreground mt-0.5">Add connectors that add context while you build.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {otherConnectors.map(connector => (
              <button
                key={connector.id}
                onClick={() => setSelectedConnector(connector)}
                className="rounded-xl border border-border bg-card p-4 text-left hover:border-foreground/20 hover:bg-muted/50 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <ConnectorLogo connector={connector} size={40} />
                  {connector.status === 'coming_soon' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium text-muted-foreground border border-border">Soon</span>
                  )}
                </div>
                <h4 className="text-[14px] font-semibold text-foreground mt-1">{connector.name}</h4>
                <p className="text-[12px] text-muted-foreground mt-1 line-clamp-2">{connector.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {filteredConnectors.length === 0 && (
        <div className="py-16 text-center">
          <Search className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-[13px] text-muted-foreground">No connectors match your search.</p>
        </div>
      )}
    </div>
  )
}
