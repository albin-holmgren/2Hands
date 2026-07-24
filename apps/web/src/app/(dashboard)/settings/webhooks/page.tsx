'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Webhook, Plus, Trash2, Loader2, CheckCircle2, XCircle,
  Clock, ChevronDown, ChevronUp, Copy, Check, AlertTriangle,
  Globe
} from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'

// ============================================================
// Types
// ============================================================

interface WebhookEntry {
  id: string
  url: string
  events: string[]
  isActive: boolean
  failureCount: number
  createdAt: string
}

interface WebhookDelivery {
  id: string
  webhookId: string
  event: string
  statusCode: number | null
  success: boolean
  deliveredAt: string
  error: string | null
}

const AVAILABLE_EVENTS = [
  { value: 'mission.tick_completed', label: 'Mission Tick Completed', desc: 'When a mission finishes a tick and posts a progress update', group: 'Mission Mode' },
  { value: 'mission.completed', label: 'Mission Completed', desc: 'When a mission achieves its goal and all projects are finished', group: 'Mission Mode' },
  { value: 'mission.blocked', label: 'Mission Blocked', desc: 'When a mission is blocked (e.g. out of credits or daily cap reached)', group: 'Mission Mode' },
  { value: 'agent.completed', label: 'Agent Completed', desc: 'When an agent finishes a task', group: 'Agents' },
  { value: 'agent.failed', label: 'Agent Failed', desc: 'When an agent run fails', group: 'Agents' },
  { value: 'agent.insight', label: 'Agent Insight', desc: 'When an agent reports a finding', group: 'Agents' },
  { value: 'agent.started', label: 'Agent Started', desc: 'When an agent begins running', group: 'Agents' },
  { value: 'workflow.completed', label: 'Workflow Completed', desc: 'When a workflow pipeline finishes', group: 'Workflows' },
  { value: 'workflow.failed', label: 'Workflow Failed', desc: 'When a workflow step fails', group: 'Workflows' },
]

// ============================================================
// Page
// ============================================================

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [newEvents, setNewEvents] = useState<string[]>(['agent.completed'])
  const [creating, setCreating] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deliveries, setDeliveries] = useState<Record<string, WebhookDelivery[]>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null)
  const [deleteWebhookId, setDeleteWebhookId] = useState<string | null>(null)
  const [deletingWebhook, setDeletingWebhook] = useState(false)

  const fetchWebhooks = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/webhooks')
      if (res.ok) {
        const data = await res.json()
        setWebhooks(data.webhooks || [])
      }
    } catch (err) {
      console.error('Failed to fetch webhooks:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchWebhooks() }, [fetchWebhooks])

  const handleCreate = async () => {
    if (!newUrl.trim() || newEvents.length === 0) return
    setCreating(true)
    try {
      const res = await fetch('/api/v1/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newUrl.trim(), events: newEvents }),
      })
      if (res.ok) {
        const data = await res.json()
        setRevealedSecret(data.secret || null)
        toast.success('Webhook created — save the signing secret now')
        setShowCreate(false)
        setNewUrl('')
        setNewEvents(['agent.completed'])
        fetchWebhooks()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to create webhook')
      }
    } catch {
      toast.error('Failed to create webhook')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = (webhookId: string) => {
    setDeleteWebhookId(webhookId)
  }

  const confirmDelete = async () => {
    if (!deleteWebhookId) return
    setDeletingWebhook(true)
    try {
      const res = await fetch(`/api/v1/webhooks?webhookId=${deleteWebhookId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Webhook deleted')
        setDeleteWebhookId(null)
        await fetchWebhooks()
      } else {
        toast.error('Failed to delete webhook')
      }
    } catch {
      toast.error('Failed to delete webhook')
    } finally {
      setDeletingWebhook(false)
    }
  }

  const fetchDeliveries = async (webhookId: string) => {
    try {
      const res = await fetch(`/api/v1/webhooks?webhookId=${webhookId}&action=deliveries`)
      if (res.ok) {
        const data = await res.json()
        setDeliveries(prev => ({ ...prev, [webhookId]: data.deliveries || [] }))
      }
    } catch (err) {
      console.error('Failed to fetch deliveries:', err)
    }
  }

  const toggleExpand = (webhookId: string) => {
    if (expandedId === webhookId) {
      setExpandedId(null)
    } else {
      setExpandedId(webhookId)
      if (!deliveries[webhookId]) {
        fetchDeliveries(webhookId)
      }
    }
  }

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-5 w-36 bg-foreground/8 rounded animate-pulse" />
            <div className="h-3.5 w-64 bg-foreground/8 rounded animate-pulse" />
          </div>
          <div className="h-9 w-32 bg-foreground/8 rounded-lg animate-pulse" />
        </div>
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-foreground/8 animate-pulse" />
                <div className="h-3.5 w-48 bg-foreground/8 rounded animate-pulse" />
                <div className="ml-auto h-3.5 w-16 bg-foreground/8 rounded animate-pulse" />
              </div>
              <div className="flex gap-1.5 mt-2 ml-5">
                <div className="h-5 w-24 bg-foreground/8 rounded animate-pulse" />
                <div className="h-5 w-20 bg-foreground/8 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <ConfirmationDialog
        open={Boolean(deleteWebhookId)}
        onOpenChange={(open) => {
          if (!open) setDeleteWebhookId(null)
        }}
        title="Delete webhook"
        description="It will stop receiving events immediately."
        confirmLabel="Delete webhook"
        onConfirm={confirmDelete}
        isConfirming={deletingWebhook}
        destructive
      />

      {/* Signing secret reveal */}
      {revealedSecret && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-[14px] font-semibold text-amber-600 dark:text-amber-400 mb-1">
                Save your signing secret
              </h4>
              <p className="text-[13px] text-amber-600/80 dark:text-amber-400/80 mb-3">
                This secret will only be shown once. Use it to verify the <code className="px-1 py-0.5 rounded bg-amber-500/10 font-mono text-[11px]">X-2Hands-Signature</code> header.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2.5 rounded-lg bg-background border border-amber-500/20 text-[13px] font-mono text-foreground break-all">
                  {revealedSecret}
                </code>
                <button
                  onClick={() => { handleCopy(revealedSecret, 'new-secret'); toast.success('Copied to clipboard') }}
                  className="p-2.5 rounded-lg hover:bg-amber-500/10 transition-colors"
                >
                  {copiedId === 'new-secret' ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-amber-500" />
                  )}
                </button>
              </div>
              <button
                onClick={() => setRevealedSecret(null)}
                className="mt-3 text-[12px] text-amber-600 dark:text-amber-400 hover:underline underline-offset-2"
              >
                I&apos;ve saved it — dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Endpoints */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[16px] font-semibold text-foreground">Webhook Endpoints</h3>
            <p className="text-[13px] text-muted-foreground mt-0.5">Receive real-time HTTP notifications when events occur.</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-[13px] font-medium text-foreground hover:bg-foreground/5 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add endpoint
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="p-5 rounded-xl border border-border bg-card">
            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-foreground/80 mb-1.5">Endpoint URL</label>
                <input
                  type="url"
                  value={newUrl}
                  onChange={e => setNewUrl(e.target.value)}
                  placeholder="https://your-server.com/webhook"
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-foreground/80 mb-2">Events</label>
                <div className="space-y-1">
                  {AVAILABLE_EVENTS.map(evt => (
                    <label
                      key={evt.value}
                      className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-background/30 transition-colors cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={newEvents.includes(evt.value)}
                        onChange={() => {
                          setNewEvents(prev =>
                            prev.includes(evt.value)
                              ? prev.filter(e => e !== evt.value)
                              : [...prev, evt.value]
                          )
                        }}
                        className="mt-0.5 rounded border-border"
                      />
                      <div>
                        <div className="text-[13px] font-medium text-foreground">{evt.label}</div>
                        <div className="text-[11px] text-muted-foreground">{evt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleCreate}
                  disabled={creating || !newUrl.trim() || newEvents.length === 0}
                  className="px-5 py-2 rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create webhook'}
                </button>
                <button
                  onClick={() => { setShowCreate(false); setNewUrl('') }}
                  className="px-4 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Webhooks list */}
        {webhooks.length === 0 && !showCreate ? (
          <div className="py-12 text-center rounded-xl border border-dashed border-border">
            <Globe className="w-8 h-8 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-[14px] font-medium text-foreground">No webhooks yet</p>
            <p className="text-[13px] text-muted-foreground mt-1">
              Add an endpoint to receive event notifications.
            </p>
          </div>
        ) : webhooks.length > 0 && (
          <div className="space-y-2">
            {webhooks.map(wh => (
              <div
                key={wh.id}
                className="rounded-xl border border-border bg-card overflow-hidden"
              >
                {/* Webhook header */}
                <div className="flex items-center justify-between p-4 group">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${wh.isActive ? 'bg-emerald-500' : 'bg-red-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-[13px] font-mono text-foreground truncate">
                          {wh.url}
                        </code>
                        <button
                          onClick={() => handleCopy(wh.url, wh.id)}
                          className="p-1 rounded hover:bg-foreground/5 transition-colors flex-shrink-0"
                        >
                          {copiedId === wh.id ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex gap-1 flex-wrap">
                          {wh.events.map(evt => (
                            <span key={evt} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-background/50 border border-border text-muted-foreground">
                              {evt}
                            </span>
                          ))}
                        </div>
                        {wh.failureCount > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-amber-500">
                            <AlertTriangle className="w-3 h-3" />
                            {wh.failureCount} failures
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleExpand(wh.id)}
                      className="p-2 rounded-lg hover:bg-foreground/5 text-muted-foreground transition-colors"
                      title="View deliveries"
                    >
                      {expandedId === wh.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleDelete(wh.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/5 transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete webhook"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Delivery history */}
                {expandedId === wh.id && (
                  <div className="border-t border-border">
                    <div className="px-4 py-2.5 bg-muted/50">
                      <span className="text-[12px] font-medium text-muted-foreground">Recent Deliveries</span>
                    </div>
                    {(!deliveries[wh.id] || deliveries[wh.id].length === 0) ? (
                      <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">
                        No deliveries yet
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {deliveries[wh.id].slice(0, 10).map(d => (
                          <div key={d.id} className="flex items-center justify-between px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              {d.success ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5 text-red-500" />
                              )}
                              <span className="text-[12px] font-medium text-foreground">
                                {d.event}
                              </span>
                              {d.statusCode && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                  d.statusCode < 300 ? 'bg-emerald-500/10 text-emerald-600' :
                                  d.statusCode < 500 ? 'bg-amber-500/10 text-amber-600' :
                                  'bg-red-500/10 text-red-600'
                                }`}>
                                  {d.statusCode}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              {d.error && (
                                <span className="text-red-400 truncate max-w-[150px]">{d.error}</span>
                              )}
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(d.deliveredAt).toLocaleString(undefined, {
                                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                })}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Security info */}
      <section className="space-y-4 pt-2 border-t border-border">
        <div>
          <h3 className="text-[16px] font-semibold text-foreground">Signature Verification</h3>
          <p className="text-[13px] text-muted-foreground mt-0.5">Verify webhook authenticity using HMAC-SHA256.</p>
        </div>
        <div className="p-5 rounded-xl border border-border bg-card space-y-4">
          <div>
            <span className="text-[12px] font-medium text-foreground/80">Headers sent with each delivery</span>
            <div className="mt-1.5 space-y-1">
              <code className="block px-3 py-1.5 rounded-lg bg-background/50 border border-border font-mono text-[11px] text-foreground/70">X-2Hands-Signature: &lt;hmac-sha256-hex&gt;</code>
              <code className="block px-3 py-1.5 rounded-lg bg-background/50 border border-border font-mono text-[11px] text-foreground/70">X-2Hands-Timestamp: &lt;unix-seconds&gt;</code>
              <code className="block px-3 py-1.5 rounded-lg bg-background/50 border border-border font-mono text-[11px] text-foreground/70">X-2Hands-Event: &lt;event-type&gt;</code>
            </div>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Compute <code className="px-1 py-0.5 rounded bg-background/50 font-mono text-[11px]">HMAC-SHA256(timestamp + &quot;.&quot; + body, secret)</code> and compare to the signature header. Webhooks are auto-disabled after 10 consecutive failures.
          </p>
        </div>
      </section>
    </div>
  )
}
