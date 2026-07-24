'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, Loader2, GripVertical, Bot, Target, Zap, AlertCircle, MoreHorizontal, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface KanbanCard {
  id: string
  title: string
  description: string | null
  status: string
  position: number
  agent_id: string | null
  mission_id: string | null
  created_at: string
}

const COLUMNS: { id: string; label: string; color: string; description: string }[] = [
  { id: 'inbox', label: 'Inbox', color: 'text-muted-foreground', description: 'New tasks to triage' },
  { id: 'up_next', label: 'Up Next', color: 'text-blue-500', description: 'Queued and ready' },
  { id: 'in_progress', label: 'In Progress', color: 'text-primary', description: 'Actively being worked on' },
  { id: 'in_review', label: 'In Review', color: 'text-amber-500', description: 'Waiting for approval' },
  { id: 'blocked', label: 'Blocked', color: 'text-red-500', description: 'Needs attention' },
  { id: 'done', label: 'Done', color: 'text-green-500', description: 'Completed' },
]

function CardMenu({ card, onDelete }: { card: KanbanCard; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-foreground/10 transition-all"
      >
        <MoreHorizontal size={12} className="text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-50 bg-card border border-border rounded-xl shadow-lg min-w-[140px] py-1">
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(card.id) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={12} />
            Delete card
          </button>
        </div>
      )}
    </div>
  )
}

function KanbanCard({
  card,
  onDragStart,
  onDelete,
  onClick,
}: {
  card: KanbanCard
  onDragStart: (e: React.DragEvent, card: KanbanCard) => void
  onDelete: (id: string) => void
  onClick: (card: KanbanCard) => void
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, card)}
      onClick={() => onClick(card)}
      className="group bg-card border border-border rounded-xl p-3 cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all select-none"
    >
      <div className="flex items-start gap-2">
        <GripVertical size={12} className="text-muted-foreground/30 mt-0.5 shrink-0 group-hover:text-muted-foreground/60 transition-colors" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <p className="text-[12.5px] font-medium text-foreground leading-snug flex-1">{card.title}</p>
            <CardMenu card={card} onDelete={onDelete} />
          </div>
          {card.description && (
            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{card.description}</p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {card.agent_id && (
              <span className={cn(
                "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full",
                card.status === 'in_progress' ? "text-primary bg-primary/10 animate-pulse" :
                card.status === 'done' ? "text-emerald-600 bg-emerald-500/10" :
                "text-primary bg-primary/10"
              )}>
                <Bot size={9} />
                {card.status === 'in_progress' ? 'Agent working' : card.status === 'done' ? 'Agent done' : 'Agent'}
              </span>
            )}
            {card.mission_id && !card.agent_id && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                <Target size={9} />
                Mission task
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AddCardForm({ columnId, onAdd, onCancel }: {
  columnId: string
  onAdd: (title: string, description: string) => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { titleRef.current?.focus() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    await onAdd(title.trim(), description.trim())
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-primary/30 rounded-xl p-3 space-y-2">
      <textarea
        ref={titleRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e as unknown as React.FormEvent) } }}
        placeholder="Card title…"
        rows={2}
        className="w-full text-[12.5px] bg-transparent resize-none focus:outline-none text-foreground placeholder:text-muted-foreground/50"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)…"
        rows={2}
        className="w-full text-[11px] bg-transparent resize-none focus:outline-none text-muted-foreground placeholder:text-muted-foreground/40 border-t border-border/50 pt-2"
      />
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={!title.trim() || saving}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? <Loader2 size={10} className="animate-spin" /> : null}
          Add card
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="p-1.5 rounded-lg hover:bg-foreground/5 transition-colors"
        >
          <X size={12} className="text-muted-foreground" />
        </button>
      </div>
    </form>
  )
}

function CardDetailDrawer({ card, onClose, onStatusChange }: {
  card: KanbanCard
  onClose: () => void
  onStatusChange: (id: string, status: string) => Promise<void>
}) {
  const [moving, setMoving] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-sm bg-card border-l border-border flex flex-col h-full">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h3 className="text-[14px] font-semibold text-foreground">Card Detail</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-foreground/5 transition-colors">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Title</p>
            <p className="text-[15px] font-medium text-foreground">{card.title}</p>
          </div>
          {card.description && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Description</p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">{card.description}</p>
            </div>
          )}
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Move to column</p>
            <div className="grid grid-cols-2 gap-2">
              {COLUMNS.map((col) => (
                <button
                  key={col.id}
                  disabled={card.status === col.id || moving}
                  onClick={async () => {
                    setMoving(true)
                    await onStatusChange(card.id, col.id)
                    setMoving(false)
                    onClose()
                  }}
                  className={cn(
                    'px-3 py-2 rounded-xl text-[12px] font-medium border transition-colors text-left',
                    card.status === col.id
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-background border-border text-muted-foreground hover:border-primary/30 hover:text-foreground'
                  )}
                >
                  {col.label}
                </button>
              ))}
            </div>
          </div>
          {/* Source context */}
          {(card.mission_id || card.agent_id) && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Source</p>
              {card.mission_id && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/15">
                  <Target size={12} className="text-primary shrink-0" />
                  <span className="text-[12px] text-foreground font-medium">Mission task</span>
                  <a href="/app/mission" className="ml-auto text-[11px] text-primary hover:underline">View mission →</a>
                </div>
              )}
              {card.agent_id && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/15">
                  <Bot size={12} className="text-primary shrink-0" />
                  <span className="text-[12px] text-foreground font-medium">Assigned to agent</span>
                  <a href={`/app/agent/${card.agent_id}`} className="ml-auto text-[11px] text-primary hover:underline">View agent →</a>
                </div>
              )}
            </div>
          )}
          <div className="pt-2 border-t border-border/50 space-y-1">
            <p className="text-[11px] text-muted-foreground/60">
              Created {new Date(card.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function KanbanBoard() {
  const [cards, setCards] = useState<KanbanCard[]>([])
  const [loading, setLoading] = useState(true)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [dragging, setDragging] = useState<KanbanCard | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null)

  const hasSyncedRef = useRef(false)

  const fetchCards = useCallback(async () => {
    try {
      const res = await fetch('/api/boards')
      if (res.ok) {
        const data = await res.json()
        const fetched = data.cards ?? []
        setCards(fetched)

        // Auto-populate: if board is empty and we haven't tried yet, sync from missions
        if (fetched.length === 0 && !hasSyncedRef.current) {
          hasSyncedRef.current = true
          try {
            const syncRes = await fetch('/api/boards/sync', { method: 'POST' })
            if (syncRes.ok) {
              const syncData = await syncRes.json()
              if (syncData.created > 0) {
                // Re-fetch to show new cards
                const res2 = await fetch('/api/boards')
                if (res2.ok) {
                  const data2 = await res2.json()
                  setCards(data2.cards ?? [])
                }
              }
            }
          } catch { /* sync endpoint may not exist yet */ }
        }
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchCards()
  }, [fetchCards])

  // Realtime: refresh cards when mission_cards table changes
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('kanban-board-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mission_cards' }, () => {
        fetchCards()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchCards])

  const handleAddCard = async (columnId: string, title: string, description: string) => {
    try {
      const res = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: description || undefined, status: columnId }),
      })
      if (res.ok) {
        await fetchCards()
        setAddingTo(null)
      } else {
        toast.error('Failed to add card')
      }
    } catch {
      toast.error('Failed to add card')
    }
  }

  const handleStatusChange = useCallback(async (id: string, newStatus: string) => {
    const prev = cards.find(c => c.id === id)
    if (!prev) return

    setCards(cs => cs.map(c => c.id === id ? { ...c, status: newStatus } : c))

    try {
      const res = await fetch(`/api/boards/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        setCards(cs => cs.map(c => c.id === id ? { ...c, status: prev.status } : c))
        toast.error('Failed to move card')
      } else if (newStatus === 'in_progress' && prev.status !== 'in_progress') {
        toast.success('Card moved to In Progress' + (prev.agent_id ? ' — agent auto-run triggered' : ''))
      }
    } catch {
      setCards(cs => cs.map(c => c.id === id ? { ...c, status: prev.status } : c))
      toast.error('Failed to move card')
    }
  }, [cards])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this card?')) return
    setCards(cs => cs.filter(c => c.id !== id))
    try {
      await fetch(`/api/boards/${id}`, { method: 'DELETE' })
    } catch {}
  }

  const handleDragStart = (e: React.DragEvent, card: KanbanCard) => {
    setDragging(card)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverCol(colId)
  }

  const handleDrop = async (e: React.DragEvent, colId: string) => {
    e.preventDefault()
    setDragOverCol(null)
    if (!dragging || dragging.status === colId) { setDragging(null); return }
    await handleStatusChange(dragging.id, colId)
    setDragging(null)
  }

  if (loading) {
    return (
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-3 h-full p-4 min-w-max">
          {COLUMNS.map((col) => (
            <div key={col.id} className="flex flex-col w-[260px] shrink-0 rounded-2xl border border-border bg-[#F9F8F6]/50 dark:bg-[#1E1D1A]/50">
              <div className="flex items-center justify-between px-3 py-2.5">
                <div className="h-3 w-20 bg-foreground/8 rounded animate-pulse" />
                <div className="h-4 w-4 bg-foreground/8 rounded animate-pulse" />
              </div>
              <div className="flex-1 px-2 pb-2 space-y-2">
                {[...Array(col.id === 'inbox' ? 3 : col.id === 'in_progress' ? 2 : col.id === 'done' ? 1 : 0)].map((_, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card p-3 space-y-2">
                    <div className="h-3 bg-foreground/8 rounded animate-pulse" style={{ width: `${60 + (i * 13) % 35}%` }} />
                    <div className="h-2.5 w-3/4 bg-foreground/8 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-x-auto overflow-y-hidden">
      <div className="flex gap-3 h-full p-4 min-w-max">
        {COLUMNS.map((col) => {
          const colCards = cards.filter(c => c.status === col.id).sort((a, b) => a.position - b.position)
          const isOver = dragOverCol === col.id

          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={(e) => handleDrop(e, col.id)}
              className={cn(
                'flex flex-col w-[260px] shrink-0 rounded-2xl border transition-colors',
                isOver ? 'border-primary/40 bg-primary/[0.03]' : 'border-border bg-[#F9F8F6]/50 dark:bg-[#1E1D1A]/50'
              )}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-3 py-2.5 shrink-0">
                <div className="flex items-center gap-2">
                  <span className={cn('text-[12px] font-semibold', col.color)}>{col.label}</span>
                  <span className="text-[11px] text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded-full tabular-nums">
                    {colCards.length}
                  </span>
                </div>
                <button
                  onClick={() => setAddingTo(addingTo === col.id ? null : col.id)}
                  className="p-1 rounded-lg hover:bg-foreground/5 transition-colors"
                  title={`Add card to ${col.label}`}
                >
                  <Plus size={13} className="text-muted-foreground" />
                </button>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-[80px]">
                {addingTo === col.id && (
                  <AddCardForm
                    columnId={col.id}
                    onAdd={(title, desc) => handleAddCard(col.id, title, desc)}
                    onCancel={() => setAddingTo(null)}
                  />
                )}
                {colCards.map((card) => (
                  <KanbanCard
                    key={card.id}
                    card={card}
                    onDragStart={handleDragStart}
                    onDelete={handleDelete}
                    onClick={setSelectedCard}
                  />
                ))}
                {colCards.length === 0 && !addingTo && (
                  <div className="flex flex-col items-center justify-center h-20 text-center">
                    {col.id === 'in_progress' ? (
                      <Zap size={14} className="text-muted-foreground/20 mb-1" />
                    ) : col.id === 'blocked' ? (
                      <AlertCircle size={14} className="text-muted-foreground/20 mb-1" />
                    ) : null}
                    <p className="text-[11px] text-muted-foreground/40">{col.description}</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Card detail drawer */}
      {selectedCard && (
        <CardDetailDrawer
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onStatusChange={async (id, status) => {
            await handleStatusChange(id, status)
            setSelectedCard(prev => prev?.id === id ? { ...prev, status } : prev)
          }}
        />
      )}
    </div>
  )
}
