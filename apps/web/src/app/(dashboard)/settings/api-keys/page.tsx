'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Key, Plus, Trash2, Copy, Check, Loader2,
  Shield, Clock, AlertTriangle, ExternalLink
} from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'

// ============================================================
// Types
// ============================================================

interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  permissions: string[]
  rateLimit: number
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
  isActive: boolean
}

// ============================================================
// Page
// ============================================================

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyPermissions, setNewKeyPermissions] = useState<string[]>(['agents:read', 'agents:write'])
  const [newKeyExpiry, setNewKeyExpiry] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [revokeTargetKeyId, setRevokeTargetKeyId] = useState<string | null>(null)
  const [revokingKey, setRevokingKey] = useState(false)

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/keys')
      if (res.ok) {
        const data = await res.json()
        setKeys(data.keys || [])
      }
    } catch (err) {
      console.error('Failed to fetch API keys:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchKeys() }, [fetchKeys])

  const handleCreate = async () => {
    if (!newKeyName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/v1/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newKeyName.trim(),
          permissions: newKeyPermissions,
          ...(newKeyExpiry ? { expiresInDays: newKeyExpiry } : {}),
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setRevealedKey(data.rawKey)
        toast.success('API key created — copy it now, it won\'t be shown again')
        setShowCreate(false)
        setNewKeyName('')
        fetchKeys()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to create API key')
      }
    } catch {
      toast.error('Failed to create API key')
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = (keyId: string) => {
    setRevokeTargetKeyId(keyId)
  }

  const confirmRevoke = async () => {
    if (!revokeTargetKeyId) return
    setRevokingKey(true)
    try {
      const res = await fetch(`/api/v1/keys?id=${revokeTargetKeyId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('API key revoked')
        setRevokeTargetKeyId(null)
        await fetchKeys()
      } else {
        toast.error('Failed to revoke key')
      }
    } catch {
      toast.error('Failed to revoke key')
    } finally {
      setRevokingKey(false)
    }
  }

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    toast.success('Copied to clipboard')
    setTimeout(() => setCopiedId(null), 2000)
  }

  const availablePermissions = [
    { value: 'agents:read', label: 'Read Agents' },
    { value: 'agents:write', label: 'Write Agents' },
    { value: 'agents:run', label: 'Run Agents' },
    { value: 'agents:delete', label: 'Delete Agents' },
    { value: 'workflows:read', label: 'Read Workflows' },
    { value: 'workflows:write', label: 'Write Workflows' },
    { value: 'analytics:read', label: 'Read Analytics' },
  ]

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-5 w-24 bg-foreground/8 rounded animate-pulse" />
            <div className="h-3.5 w-56 bg-foreground/8 rounded animate-pulse" />
          </div>
          <div className="h-9 w-28 bg-foreground/8 rounded-lg animate-pulse" />
        </div>
        <div className="rounded-xl border border-border overflow-hidden">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-0">
              <div className="w-2 h-2 rounded-full bg-foreground/8 animate-pulse" />
              <div className="h-3.5 w-32 bg-foreground/8 rounded animate-pulse" />
              <div className="h-3.5 w-20 bg-foreground/8 rounded animate-pulse" />
              <div className="ml-auto h-3.5 w-12 bg-foreground/8 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const expiryOptions = [
    { value: null, label: 'Never' },
    { value: 30, label: '30 days' },
    { value: 90, label: '90 days' },
    { value: 365, label: '1 year' },
  ] as const

  return (
    <div className="space-y-8">
      <ConfirmationDialog
        open={Boolean(revokeTargetKeyId)}
        onOpenChange={(open) => {
          if (!open) setRevokeTargetKeyId(null)
        }}
        title="Revoke API key"
        description="Any applications using this key will stop working immediately."
        confirmLabel="Revoke key"
        onConfirm={confirmRevoke}
        isConfirming={revokingKey}
        destructive
      />

      {/* Newly created key reveal */}
      {revealedKey && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-[14px] font-semibold text-amber-600 dark:text-amber-400 mb-1">
                Save your API key
              </h4>
              <p className="text-[13px] text-amber-600/80 dark:text-amber-400/80 mb-3">
                This key will only be shown once. Copy it now and store it securely.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2.5 rounded-lg bg-background border border-amber-500/20 text-[13px] font-mono text-foreground break-all">
                  {revealedKey}
                </code>
                <button
                  onClick={() => handleCopy(revealedKey, 'new-key')}
                  className="p-2.5 rounded-lg hover:bg-amber-500/10 transition-colors"
                >
                  {copiedId === 'new-key' ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4 text-amber-500" />
                  )}
                </button>
              </div>
              <button
                onClick={() => setRevealedKey(null)}
                className="mt-3 text-[12px] text-amber-600 dark:text-amber-400 hover:underline underline-offset-2"
              >
                I&apos;ve saved it — dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Your Keys */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[16px] font-semibold text-foreground">API Keys</h3>
            <p className="text-[13px] text-muted-foreground mt-0.5">Manage keys for programmatic access to the 2Hands REST API.</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-[13px] font-medium text-foreground hover:bg-foreground/5 transition-colors"
          >
            <Plus className="w-4 h-4" /> Create key
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="p-5 rounded-xl border border-border bg-card">
            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-foreground/80 mb-1.5">Key Name</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={e => setNewKeyName(e.target.value)}
                  placeholder="e.g. Production Server"
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-[13px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-foreground/80 mb-2">Permissions</label>
                <div className="flex flex-wrap gap-2">
                  {availablePermissions.map(perm => (
                    <button
                      key={perm.value}
                      onClick={() => {
                        setNewKeyPermissions(prev =>
                          prev.includes(perm.value)
                            ? prev.filter(p => p !== perm.value)
                            : [...prev, perm.value]
                        )
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                        newKeyPermissions.includes(perm.value)
                          ? 'bg-foreground text-background'
                          : 'bg-background/50 border border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {perm.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-foreground/80 mb-2">Expiration</label>
                <div className="flex gap-2">
                  {expiryOptions.map(opt => (
                    <button
                      key={String(opt.value)}
                      onClick={() => setNewKeyExpiry(opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                        newKeyExpiry === opt.value
                          ? 'bg-foreground text-background'
                          : 'bg-background/50 border border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleCreate}
                  disabled={creating || !newKeyName.trim() || newKeyPermissions.length === 0}
                  className="px-5 py-2 rounded-lg bg-foreground text-background text-[13px] font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create key'}
                </button>
                <button
                  onClick={() => { setShowCreate(false); setNewKeyName(''); setNewKeyExpiry(null) }}
                  className="px-4 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Keys list */}
        {keys.length === 0 && !showCreate ? (
          <div className="py-12 text-center rounded-xl border border-dashed border-border">
            <Key className="w-8 h-8 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-[14px] font-medium text-foreground">No API keys yet</p>
            <p className="text-[13px] text-muted-foreground mt-1">
              Create an API key to access 2Hands programmatically.
            </p>
          </div>
        ) : keys.length > 0 && (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-3 text-[12px] font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 text-[12px] font-medium text-muted-foreground">Key</th>
                  <th className="text-left px-4 py-3 text-[12px] font-medium text-muted-foreground">Permissions</th>
                  <th className="text-left px-4 py-3 text-[12px] font-medium text-muted-foreground">Last used</th>
                  <th className="text-right px-4 py-3 text-[12px] font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {keys.map(apiKey => (
                  <tr key={apiKey.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors group">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-2 h-2 rounded-full ${apiKey.isActive ? 'bg-emerald-500' : 'bg-red-400'}`} />
                        <span className="text-[13px] font-medium text-foreground">{apiKey.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <code className="text-[12px] px-2 py-1 rounded-md bg-background/50 border border-border text-muted-foreground font-mono">
                        {apiKey.keyPrefix}...
                      </code>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-[12px] text-muted-foreground flex items-center gap-1">
                        <Shield className="w-3 h-3" />
                        {apiKey.permissions.length}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-[12px] text-muted-foreground">
                      {apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => handleRevoke(apiKey.id)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/5 transition-colors opacity-0 group-hover:opacity-100"
                        title="Revoke key"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* API Reference */}
      <section className="space-y-4 pt-2 border-t border-border">
        <div>
          <h3 className="text-[16px] font-semibold text-foreground">API Reference</h3>
          <p className="text-[13px] text-muted-foreground mt-0.5">Use your API key to authenticate requests.</p>
        </div>
        <div className="p-5 rounded-xl border border-border bg-card space-y-4">
          <div>
            <span className="text-[12px] font-medium text-foreground/80">Base URL</span>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-lg bg-background/50 border border-border font-mono text-[12px] text-foreground/70">https://2hands.ai/api/v1</code>
            </div>
          </div>
          <div>
            <span className="text-[12px] font-medium text-foreground/80">Authentication</span>
            <div className="mt-1.5">
              <code className="block px-3 py-2 rounded-lg bg-background/50 border border-border font-mono text-[11px] text-foreground/70 whitespace-pre">{`curl https://2hands.ai/api/v1/agents \\\n  -H "Authorization: Bearer avt_your_key_here"`}</code>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
