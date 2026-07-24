'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Shield, Loader2, Clock, User, ChevronLeft, ChevronRight,
  UserPlus, UserMinus, Settings2, Share2, Key, Bot
} from 'lucide-react'

// ============================================================
// Types
// ============================================================

interface AuditEntry {
  id: string
  userId: string
  userEmail: string | null
  action: string
  resource: string
  resourceId: string
  details: Record<string, unknown>
  createdAt: string
}

// ============================================================
// Page
// ============================================================

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const pageSize = 25

  const fetchEntries = useCallback(async (pageNum: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/teams?action=audit-log&page=${pageNum}&limit=${pageSize}`)
      if (res.ok) {
        const data = await res.json()
        setEntries(data.entries || [])
        setHasMore((data.entries || []).length === pageSize)
      }
    } catch (err) {
      console.error('Failed to fetch audit log:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchEntries(page) }, [page, fetchEntries])

  const getActionIcon = (action: string) => {
    if (action.includes('invite')) return <UserPlus className="w-3.5 h-3.5" />
    if (action.includes('remove')) return <UserMinus className="w-3.5 h-3.5" />
    if (action.includes('role') || action.includes('update')) return <Settings2 className="w-3.5 h-3.5" />
    if (action.includes('share')) return <Share2 className="w-3.5 h-3.5" />
    if (action.includes('key') || action.includes('api')) return <Key className="w-3.5 h-3.5" />
    if (action.includes('agent')) return <Bot className="w-3.5 h-3.5" />
    return <Shield className="w-3.5 h-3.5" />
  }

  const getActionColor = (action: string) => {
    if (action.includes('remove') || action.includes('delete') || action.includes('revoke'))
      return 'text-red-500 bg-red-500/10'
    if (action.includes('invite') || action.includes('create') || action.includes('share'))
      return 'text-emerald-500 bg-emerald-500/10'
    return 'text-muted-foreground bg-muted'
  }

  const formatAction = (action: string) => {
    return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Activity */}
      <section className="space-y-4">
        <h3 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider">Activity</h3>

        {loading && entries.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-dashed border-border">
            <Shield className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-[14px] font-medium text-foreground">No audit events yet</p>
            <p className="text-[12px] text-muted-foreground mt-1">
              Activity will appear here as your team members interact with the workspace.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {entries.map(entry => (
                <div key={entry.id} className="flex items-start gap-3 p-4 rounded-xl border border-border bg-sidebar">
                  <div className={`p-1.5 rounded-lg mt-0.5 ${getActionColor(entry.action)}`}>
                    {getActionIcon(entry.action)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium text-foreground">
                        {formatAction(entry.action)}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground">
                        {entry.resource}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[12px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {entry.userEmail || entry.userId.slice(0, 8)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(entry.createdAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {Object.keys(entry.details).length > 0 && (
                        <span className="text-[10px] text-muted-foreground/60">
                          {JSON.stringify(entry.details).slice(0, 60)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-muted-foreground">
                Page {page + 1}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={!hasMore}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
