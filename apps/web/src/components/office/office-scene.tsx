'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

export type OfficeIntent = 'blocked' | 'approval' | 'working' | 'idle' | 'completed' | 'failed'

export interface OfficeAgent {
  id: string
  name: string
  type: string
  status: 'initializing' | 'idle' | 'working' | 'completed' | 'failed' | 'terminated'
  last_active: string
  intent?: OfficeIntent
  intent_text?: string
  description?: string | null
  mission_id?: string | null
  active_run_task?: string | null
  last_progress?: { type: string; message: string; timestamp: string } | null
  last_tool?: { name: string | null; action_type: string | null; action_target: string | null; timestamp: string | null } | null
  approval?: { id: string; title: string; description: string; created_at: string } | null
  config?: Record<string, unknown> | null
}

export type OfficeManager = { intent: string; intent_text: string }

const W = 900
const H = 520
const R = 17
const PALETTE = ['#D97757','#8B6F5E','#5B7FA6','#6B8F71','#9B7BB8','#C4875A','#5E8A7A','#A67C9B']
const MGR_COLOR = '#D97757'

const DESKS = [
  { x: 55,  y: 52,  w: 88, h: 52 },{ x: 180, y: 52,  w: 88, h: 52 },
  { x: 305, y: 52,  w: 88, h: 52 },{ x: 430, y: 52,  w: 88, h: 52 },
  { x: 55,  y: 178, w: 88, h: 52 },{ x: 180, y: 178, w: 88, h: 52 },
  { x: 305, y: 178, w: 88, h: 52 },{ x: 430, y: 178, w: 88, h: 52 },
]
const DESK_SEATS = DESKS.map(d => ({ x: d.x + d.w / 2, y: d.y + d.h + 22 }))
const MGR_DESK = { x: 650, y: 42, w: 155, h: 72 }
const MGR_SEAT = { x: MGR_DESK.x + MGR_DESK.w / 2, y: MGR_DESK.y + MGR_DESK.h + 24 }
const MTG = { x: 200, y: 330, w: 200, h: 95 }
const MTG_SEATS = [
  { x: MTG.x + 35, y: MTG.y - 26 },{ x: MTG.x + 100, y: MTG.y - 26 },
  { x: MTG.x + 165, y: MTG.y - 26 },{ x: MTG.x + 35, y: MTG.y + MTG.h + 26 },
  { x: MTG.x + 100, y: MTG.y + MTG.h + 26 },
]
const APPR_ZONE = { x: 660, y: 328, w: 80, h: 58 }
const APPR_SEATS = [
  { x: 648, y: 373 },{ x: 682, y: 383 },{ x: 664, y: 405 },
]
const COFFEE_SPOTS = [
  { x: 832, y: 363 },{ x: 860, y: 375 },{ x: 846, y: 397 },
]

type Phase = 'at_desk' | 'walking' | 'at_meeting' | 'at_approval' | 'at_coffee' | 'returning'

interface Sprite {
  x: number; y: number
  tx: number; ty: number
  phase: Phase
  prevIntent: string
  nextPhaseCheckAt: number
  homeX: number; homeY: number
  seatIndex: number
  mtgSeatIdx: number
  apprSeatIdx: number
  coffeeSeatIdx: number
  bubble: string
  bubbleUntil: number
  nextBubbleAt: number
  typing: boolean
}

interface MgrSprite {
  x: number; y: number
  tx: number; ty: number
  phase: 'at_desk' | 'walking' | 'at_approval'
  bubble: string
  bubbleUntil: number
  nextPhaseCheckAt: number
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0
  return Math.abs(h)
}
function initials(name: string): string {
  const p = name.trim().split(/\s+/)
  if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}
function trunc(s: string, n = 36): string { return s.length > n ? s.slice(0, n - 1) + '\u2026' : s }

// No more generic bubbles — every bubble comes from real agent data

function pickBubble(agent: OfficeAgent, phase: Phase, allAgents?: OfficeAgent[]): string {
  if (phase === 'at_meeting') {
    // Agent-to-agent discussion: reference peers by name
    if (allAgents && agent.mission_id) {
      const peers = allAgents.filter(a => a.id !== agent.id && a.mission_id === agent.mission_id && (a.status === 'working' || a.status === 'initializing'))
      if (peers.length > 0) {
        const peerName = peers[0].name.split(/\s+/)[0]
        const h = hash(agent.id + 'mtg')
        const phrases = [
          `Syncing with ${peerName}`,
          `Sharing findings with ${peerName}`,
          `Coordinating with ${peerName}`,
          `Discussing strategy with ${peerName}`,
        ]
        return phrases[h % phrases.length]
      }
    }
    return agent.intent_text ? trunc(agent.intent_text) : 'Collaborating'
  }
  if (phase === 'at_approval') {
    if (agent.approval?.title) return trunc(agent.approval.title)
    return agent.intent_text ? trunc(agent.intent_text) : 'Needs review'
  }
  if (phase === 'at_coffee') return '\u2615 Quick break'
  // Prioritize real-time data: tool action > active task > progress > intent > description
  const tool = agent.last_tool?.action_target || agent.last_tool?.action_type
  if (tool && (agent.status === 'working' || agent.status === 'initializing')) return trunc(tool)
  if (agent.last_progress?.message) return trunc(agent.last_progress.message)
  if (agent.active_run_task) return trunc(agent.active_run_task)
  const generic = new Set(['Working', 'Idle', 'Initializing', 'Starting up', ''])
  if (agent.intent_text && !generic.has(agent.intent_text)) return trunc(agent.intent_text)
  if (agent.description) return trunc(agent.description)
  // Status-based fallbacks with full name
  const name = agent.name.split(/\s+/)[0]
  if (agent.status === 'working') return `${name} is working…`
  if (agent.status === 'initializing') return `${name} starting up…`
  if (agent.status === 'idle') return `${name} on standby`
  if (agent.status === 'completed') return `${name} — task complete`
  if (agent.status === 'failed') return `${name} — needs attention`
  return ''
}

function pickMgrBubble(intent: string, intentText: string): string {
  if (intentText) return trunc(intentText)
  if (intent === 'triage_approvals') return 'Reviewing approvals'
  if (intent === 'unblock') return 'Unblocking agent'
  if (intent === 'plan') return 'Planning next steps'
  return 'Monitoring team'
}

function resolveTarget(
  agent: OfficeAgent, sprite: Sprite, allAgents: OfficeAgent[], now: number,
): { tx: number; ty: number; targetPhase: Phase } {
  const intent = agent.intent ?? 'idle'
  if (intent === 'blocked' || intent === 'approval') {
    const seat = APPR_SEATS[sprite.apprSeatIdx % APPR_SEATS.length]
    return { tx: seat.x, ty: seat.y, targetPhase: 'at_approval' }
  }
  if (intent === 'working' && agent.mission_id) {
    const peers = allAgents.filter(
      a => a.id !== agent.id && a.mission_id === agent.mission_id &&
        (a.status === 'working' || a.status === 'initializing')
    )
    if (peers.length > 0) {
      const window = 45000
      const offset = hash(agent.id + 'mtg') % window
      const elapsed = now % window
      if (elapsed >= offset && elapsed < offset + 12000) {
        const seat = MTG_SEATS[sprite.mtgSeatIdx % MTG_SEATS.length]
        return { tx: seat.x, ty: seat.y, targetPhase: 'at_meeting' }
      }
    }
  }
  // Resting agents (idle/completed/failed) belong in the break area, not at desks
  if (intent === 'idle' || intent === 'completed' || intent === 'failed') {
    const spot = COFFEE_SPOTS[sprite.coffeeSeatIdx % COFFEE_SPOTS.length]
    return { tx: spot.x, ty: spot.y, targetPhase: 'at_coffee' }
  }
  return { tx: sprite.homeX, ty: sprite.homeY, targetPhase: 'at_desk' }
}

export function OfficeScene({
  manager, agents, loading, onDeploy, aiName,
}: {
  manager?: OfficeManager | null
  agents: OfficeAgent[]
  loading?: boolean
  onDeploy?: () => void
  aiName?: string
}) {
  "use no memo"
  const router       = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef     = useRef<HTMLDivElement>(null)
  const wrapperRefs  = useRef<Map<string, HTMLDivElement>>(new Map())
  const bubbleRefs   = useRef<Map<string, HTMLDivElement>>(new Map())
  const typingRefs   = useRef<Map<string, HTMLDivElement>>(new Map())
  const mgrWrapRef   = useRef<HTMLDivElement | null>(null)
  const mgrBubRef    = useRef<HTMLDivElement | null>(null)
  const spritesRef   = useRef<Map<string, Sprite>>(new Map())
  const mgrRef       = useRef<MgrSprite>({
    x: MGR_SEAT.x, y: MGR_SEAT.y, tx: MGR_SEAT.x, ty: MGR_SEAT.y,
    phase: 'at_desk', bubble: 'Monitoring team',
    bubbleUntil: 0, nextPhaseCheckAt: 0,
  })
  const agentsRef    = useRef(agents)
  const managerRef   = useRef(manager)
  const rafRef       = useRef<number>(0)
  const lastTRef     = useRef(0)

  useEffect(() => { agentsRef.current = agents }, [agents])
  useEffect(() => { managerRef.current = manager }, [manager])

  useEffect(() => {
    const now = performance.now()
    const seen = new Set(agents.map(a => a.id))
    agents.forEach((a, i) => {
      if (spritesRef.current.has(a.id)) return
      const h    = hash(a.id)
      const seat = i % DESKS.length
      const hx   = DESK_SEATS[seat].x
      const hy   = DESK_SEATS[seat].y
      const isResting = a.intent === 'idle' || a.intent === 'completed' || a.intent === 'failed'
      const coffeeIdx = h % COFFEE_SPOTS.length
      const startX = isResting ? COFFEE_SPOTS[coffeeIdx].x : hx
      const startY = isResting ? COFFEE_SPOTS[coffeeIdx].y : hy
      const startPhase: Phase = isResting ? 'at_coffee' : 'at_desk'
      const bubble = pickBubble(a, startPhase)
      spritesRef.current.set(a.id, {
        x: startX, y: startY, tx: startX, ty: startY,
        phase: startPhase,
        prevIntent: a.intent ?? '',
        nextPhaseCheckAt: now + 2000 + (h % 4000),
        homeX: hx, homeY: hy,
        seatIndex: seat,
        mtgSeatIdx: h % MTG_SEATS.length,
        apprSeatIdx: h % APPR_SEATS.length,
        coffeeSeatIdx: coffeeIdx,
        bubble,
        bubbleUntil: bubble ? now + 3200 : 0,
        nextBubbleAt: now + 5000 + (h % 6000),
        typing: a.status === 'working',
      })
    })
    spritesRef.current.forEach((_, id) => { if (!seen.has(id)) spritesRef.current.delete(id) })
  }, [agents])

  // Responsive scaling  centred in container
  useEffect(() => {
    const resize = () => {
      if (!containerRef.current || !sceneRef.current) return
      const { width, height } = containerRef.current.getBoundingClientRect()
      if (!width || !height) return
      const s  = Math.min(width / W, height / H, 1)
      const ox = Math.max(0, (width  - W * s) / 2)
      const oy = Math.max(0, (height - H * s) / 2)
      sceneRef.current.style.transform = `translate(${ox}px,${oy}px) scale(${s})`
      sceneRef.current.style.transformOrigin = 'top left'
    }
    const t  = setTimeout(resize, 40)
    const ro = new ResizeObserver(resize)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => { clearTimeout(t); ro.disconnect() }
  }, [])

  // Animation loop
  useEffect(() => {
    const SPEED = 80

    const tick = (t: number) => {
      const dt = Math.min((t - lastTRef.current) / 1000, 0.05)
      lastTRef.current = t
      const allAgents = agentsRef.current
      const agentMap  = new Map(allAgents.map(a => [a.id, a]))

      // ── Agent sprites ──────────────────────────────────────────────────────
      spritesRef.current.forEach((s, id) => {
        const agent = agentMap.get(id)
        if (!agent) return
        const active       = agent.status === 'working' || agent.status === 'initializing'
        const isWorking    = agent.status === 'working'
        const intent       = agent.intent ?? 'idle'
        const intentChanged = intent !== s.prevIntent

        // State machine: intent drives destination
        if (intentChanged || t > s.nextPhaseCheckAt) {
          s.prevIntent = intent

          if (s.phase === 'at_desk' || s.phase === 'returning' || intentChanged) {
            const dest = resolveTarget(agent, s, allAgents, t)
            if (dest.targetPhase !== 'at_desk') {
              s.phase = 'walking'
              s.tx = dest.tx; s.ty = dest.ty
              s.nextPhaseCheckAt = t + 999999
            } else {
              const jitter = hash(id + String(Math.floor(t / 10000))) % 7000
              s.nextPhaseCheckAt = t + (active ? 8000 : 14000) + jitter
              s.typing = isWorking
            }
          } else if (s.phase === 'at_approval') {
            // Stay until intent clears
            if (intent !== 'blocked' && intent !== 'approval') {
              s.phase = 'returning'; s.tx = s.homeX; s.ty = s.homeY
              s.nextPhaseCheckAt = t + 999999
            } else {
              s.nextPhaseCheckAt = t + 5000
            }
          } else if (s.phase === 'at_meeting') {
            const dest = resolveTarget(agent, s, allAgents, t)
            if (dest.targetPhase !== 'at_meeting') {
              s.phase = 'returning'; s.tx = s.homeX; s.ty = s.homeY
              s.nextPhaseCheckAt = t + 999999
            } else {
              s.nextPhaseCheckAt = t + 8000
            }
          } else if (s.phase === 'at_coffee') {
            // Resting agents stay at break until intent changes to working
            const stillResting = intent === 'idle' || intent === 'completed' || intent === 'failed'
            if (stillResting) {
              const jitter = hash(id + 'coffee') % 8000
              s.nextPhaseCheckAt = t + 20000 + jitter
            } else {
              s.phase = 'returning'; s.tx = s.homeX; s.ty = s.homeY
              s.nextPhaseCheckAt = t + 999999
            }
          }
        }

        // Movement
        const moving = s.phase === 'walking' || s.phase === 'returning'
        if (moving) {
          const dx = s.tx - s.x, dy = s.ty - s.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist > 2) {
            const step = Math.min(SPEED * dt, dist)
            s.x += (dx / dist) * step
            s.y += (dy / dist) * step
          } else {
            s.x = s.tx; s.y = s.ty
            if (s.phase === 'walking') {
              // Determine arrived phase
              const inAppr = APPR_SEATS.some(a => Math.abs(a.x - s.tx) < 8 && Math.abs(a.y - s.ty) < 8)
              const inMtg  = MTG_SEATS.some(m => Math.abs(m.x - s.tx) < 8 && Math.abs(m.y - s.ty) < 8)
              const arrived: Phase = inAppr ? 'at_approval' : inMtg ? 'at_meeting' : 'at_coffee'
              s.phase = arrived
              const jitter = hash(id + 'dwell') % 6000
              const restingAgent = agent.intent === 'idle' || agent.intent === 'completed' || agent.intent === 'failed'
              const coffeeDwell = restingAgent ? 25000 : 5000
              s.nextPhaseCheckAt = t + (arrived === 'at_approval' ? 999999 : arrived === 'at_meeting' ? 12000 : coffeeDwell) + jitter
              s.bubble = pickBubble(agent, arrived, allAgents)
              s.bubbleUntil = t + 3800
            } else {
              s.phase = 'at_desk'
              const jitter = hash(id + String(Math.floor(t / 10000))) % 7000
              s.nextPhaseCheckAt = t + (active ? 8000 : 14000) + jitter
              s.typing = isWorking
            }
          }
        }

        // Periodic bubbles (grounded in real intent_text)
        if (t > s.nextBubbleAt) {
          s.bubble = pickBubble(agent, s.phase, allAgents)
          if (s.bubble) {
            s.bubbleUntil = t + 3400
            const interval = active ? 10000 : 18000
            const jitter = hash(id + 'bub') % 8000
            s.nextBubbleAt = t + interval + jitter
          }
        }

        // DOM
        const w = wrapperRefs.current.get(id)
        if (w) w.style.transform = `translate(${Math.round(s.x - R)}px,${Math.round(s.y - R)}px)`
        const b = bubbleRefs.current.get(id)
        if (b) {
          b.style.opacity = t < s.bubbleUntil ? '1' : '0'
          if (t < s.bubbleUntil) b.textContent = s.bubble
        }
        const tp = typingRefs.current.get(id)
        if (tp) tp.style.opacity = s.typing && s.phase === 'at_desk' ? '1' : '0'
      })

      // ── Manager sprite ────────────────────────────────────────────────────
      const mgr = mgrRef.current
      const mgrData = managerRef.current
      if (t > mgr.nextPhaseCheckAt) {
        const mgrIntent = mgrData?.intent ?? 'idle'
        if ((mgrIntent === 'triage_approvals' || mgrIntent === 'unblock') && mgr.phase === 'at_desk') {
          mgr.phase = 'walking'
          mgr.tx = APPR_ZONE.x + APPR_ZONE.w / 2
          mgr.ty = APPR_ZONE.y - 20
          mgr.nextPhaseCheckAt = t + 999999
        } else if (mgr.phase === 'at_approval' && mgrIntent !== 'triage_approvals' && mgrIntent !== 'unblock') {
          mgr.phase = 'walking'
          mgr.tx = MGR_SEAT.x; mgr.ty = MGR_SEAT.y
          mgr.nextPhaseCheckAt = t + 999999
        } else {
          mgr.nextPhaseCheckAt = t + 5000
          mgr.bubble = pickMgrBubble(mgrData?.intent ?? 'idle', mgrData?.intent_text ?? '')
          mgr.bubbleUntil = t + 3400
        }
      }
      if (mgr.phase === 'walking') {
        const dx = mgr.tx - mgr.x, dy = mgr.ty - mgr.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 2) {
          const step = Math.min(SPEED * dt, dist)
          mgr.x += (dx / dist) * step
          mgr.y += (dy / dist) * step
        } else {
          mgr.x = mgr.tx; mgr.y = mgr.ty
          mgr.phase = (mgr.tx === MGR_SEAT.x && mgr.ty === MGR_SEAT.y) ? 'at_desk' : 'at_approval'
          mgr.nextPhaseCheckAt = t + 5000
          mgr.bubble = pickMgrBubble(mgrData?.intent ?? 'idle', mgrData?.intent_text ?? '')
          mgr.bubbleUntil = t + 4000
        }
      }
      const mw = mgrWrapRef.current
      if (mw) mw.style.transform = `translate(${Math.round(mgr.x - 17)}px,${Math.round(mgr.y - 17)}px)`
      const mb = mgrBubRef.current
      if (mb) {
        mb.style.opacity = t < mgr.bubbleUntil ? '1' : '0'
        if (t < mgr.bubbleUntil) mb.textContent = mgr.bubble
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    lastTRef.current = performance.now()
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  const showScene = !loading && agents.length > 0

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden bg-[var(--bg-secondary)]">

      {/* Loading */}
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 10 }}>
          <div style={{ width: 28, height: 28, border: '3px solid var(--border-default)', borderTopColor: MGR_COLOR, borderRadius: '50%', animation: 'office-spin 0.8s linear infinite' }} />
          <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500 }}>Assembling the team…</span>
          <style>{`@keyframes office-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Empty */}
      {!loading && agents.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 10 }}>
          <div style={{ fontSize: 44, opacity: 0.25 }}>🏢</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500 }}>No agents deployed yet</p>
          {onDeploy && (
            <button onClick={onDeploy} style={{ padding: '8px 20px', borderRadius: 12, background: MGR_COLOR, color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
              Deploy an agent
            </button>
          )}
        </div>
      )}

      {/* Scene */}
      <div
        ref={sceneRef}
        style={{ width: W, height: H, position: 'relative', transformOrigin: 'top left', visibility: showScene ? 'visible' : 'hidden' }}
      >
        {/* Floor dot grid */}
        <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-secondary)', backgroundImage: 'radial-gradient(circle, var(--border-default) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

        {/* Aisle separators */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 160, height: 1, background: 'var(--border-subtle)', opacity: 0.5 }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: 305, height: 1, background: 'var(--border-subtle)', opacity: 0.5 }} />
        <div style={{ position: 'absolute', left: 548, top: 0, bottom: 0, width: 1, background: 'var(--border-subtle)', opacity: 0.4 }} />

        {/* Zone: Workstations label */}
        <div style={{ position: 'absolute', left: 55, top: 30, fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Workstations</div>

        {/* Agent desks */}
        {DESKS.map((d, i) => (
          <div key={i} style={{ position: 'absolute', left: d.x, top: d.y, width: d.w, height: d.h, background: 'var(--surface-default)', border: '1.5px solid var(--border-default)', borderRadius: 8, boxShadow: '0 1px 4px rgba(52,50,45,0.07)' }}>
            <div style={{ position: 'absolute', top: 7, left: '50%', transform: 'translateX(-50%)', width: 38, height: 26, background: 'var(--bg-tertiary)', border: '1.5px solid var(--border-default)', borderRadius: 4 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '4px 5px' }}>
                <div style={{ height: 2, background: MGR_COLOR, opacity: 0.45, borderRadius: 1, width: '70%' }} />
                <div style={{ height: 2, background: 'var(--border-medium)', borderRadius: 1, width: '90%' }} />
                <div style={{ height: 2, background: 'var(--border-medium)', borderRadius: 1, width: '55%' }} />
              </div>
            </div>
            <div style={{ position: 'absolute', bottom: 5, left: '50%', transform: 'translateX(-50%)', width: 5, height: 8, background: 'var(--border-medium)', borderRadius: 2 }} />
          </div>
        ))}

        {/* Zone: Manager desk (top-right) */}
        <div style={{ position: 'absolute', left: MGR_DESK.x - 4, top: MGR_DESK.y - 18, fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: MGR_COLOR, textTransform: 'uppercase', opacity: 0.7 }}>AI Manager</div>
        <div style={{ position: 'absolute', left: MGR_DESK.x, top: MGR_DESK.y, width: MGR_DESK.w, height: MGR_DESK.h, background: `${MGR_COLOR}0d`, border: `2px solid ${MGR_COLOR}40`, borderRadius: 10, boxShadow: '0 2px 8px rgba(217,119,87,0.1)' }}>
          <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', width: 52, height: 34, background: 'var(--bg-tertiary)', border: `1.5px solid ${MGR_COLOR}30`, borderRadius: 5 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '5px 6px' }}>
              <div style={{ height: 2, background: MGR_COLOR, opacity: 0.6, borderRadius: 1, width: '80%' }} />
              <div style={{ height: 2, background: MGR_COLOR, opacity: 0.3, borderRadius: 1, width: '60%' }} />
              <div style={{ height: 2, background: MGR_COLOR, opacity: 0.3, borderRadius: 1, width: '75%' }} />
            </div>
          </div>
          <div style={{ position: 'absolute', bottom: 7, left: '50%', transform: 'translateX(-50%)', width: 6, height: 10, background: `${MGR_COLOR}50`, borderRadius: 2 }} />
        </div>

        {/* Zone: Meeting room */}
        <div style={{ position: 'absolute', left: MTG.x, top: MTG.y - 18, fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Meeting Room</div>
        <div style={{ position: 'absolute', left: MTG.x, top: MTG.y, width: MTG.w, height: MTG.h, background: 'var(--surface-default)', border: '1.5px solid var(--border-default)', borderRadius: 50, boxShadow: '0 2px 8px rgba(52,50,45,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 60, height: 3, background: 'var(--border-subtle)', borderRadius: 2 }} />
        </div>

        {/* Zone: Approval / Inbox */}
        <div style={{ position: 'absolute', left: APPR_ZONE.x, top: APPR_ZONE.y - 18, fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: '#F59E0B', textTransform: 'uppercase', opacity: 0.8 }}>Approvals</div>
        <div style={{ position: 'absolute', left: APPR_ZONE.x, top: APPR_ZONE.y, width: APPR_ZONE.w, height: APPR_ZONE.h, background: 'rgba(245,158,11,0.06)', border: '1.5px solid rgba(245,158,11,0.25)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
          📥
        </div>

        {/* Zone: Break area */}
        <div style={{ position: 'absolute', left: 818, top: 338, fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Break</div>
        <div style={{ position: 'absolute', left: 820, top: 355, width: 68, height: 52, background: 'var(--surface-default)', border: '1.5px solid var(--border-default)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>☕</div>

        {/* Agent sprites */}
        {agents.map((agent, i) => {
          const color = PALETTE[i % PALETTE.length]
          const active = agent.status === 'working' || agent.status === 'initializing'
          const failed = agent.status === 'failed'
          const blocked = agent.intent === 'blocked' || agent.intent === 'approval'
          const done = agent.status === 'completed'
          const abbr = initials(agent.name)
          const firstName = agent.name.split(/\s+/)[0].slice(0, 18)
          const dotColor = blocked ? '#F59E0B' : active ? '#10B981' : failed ? '#EF4444' : done ? '#5B7FA6' : 'var(--border-medium)'
          const ringColor = blocked ? '#F59E0B' : active ? '#10B981' : null

          return (
            <div key={agent.id} ref={el => { if (el) wrapperRefs.current.set(agent.id, el) }}
              style={{ position: 'absolute', willChange: 'transform', cursor: 'pointer', userSelect: 'none' }}
              onClick={() => router.push(`/app/agent/${agent.id}`)}
            >
              {/* Speech bubble */}
              <div ref={el => { if (el) bubbleRefs.current.set(agent.id, el) }}
                style={{ position: 'absolute', bottom: R * 2 + 18, left: '50%', transform: 'translateX(-50%)', background: 'var(--surface-default)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: 9.5, fontWeight: 500, lineHeight: 1.35, padding: '4px 8px', borderRadius: 8, whiteSpace: 'nowrap', opacity: 0, transition: 'opacity 0.35s ease', pointerEvents: 'none', boxShadow: '0 2px 8px rgba(52,50,45,0.12)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', zIndex: 20, fontFamily: 'var(--font-sans)' }}
              >
                <div style={{ position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid var(--border-default)' }} />
                <div style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '4px solid var(--surface-default)' }} />
              </div>

              {/* Pulse ring */}
              {ringColor && (
                <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: `2px solid ${ringColor}`, animation: 'office-pulse 2s ease-in-out infinite', opacity: 0.4 }} />
              )}

              {/* Avatar */}
              <div style={{ width: R * 2, height: R * 2, borderRadius: '50%', background: failed ? '#FEE2E2' : `${color}22`, border: `2px solid ${failed ? '#EF4444' : color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: failed ? '#EF4444' : color, fontFamily: 'var(--font-sans)', boxShadow: active ? `0 0 0 3px ${color}18, 0 2px 8px rgba(52,50,45,0.15)` : '0 1px 4px rgba(52,50,45,0.12)', opacity: agent.status === 'idle' ? 0.7 : 1, transition: 'opacity 0.3s', letterSpacing: 0.5 }}>
                {abbr}
              </div>

              {/* Typing dots */}
              <div ref={el => { if (el) typingRefs.current.set(agent.id, el) }}
                style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 2, opacity: 0, transition: 'opacity 0.3s', pointerEvents: 'none' }}
              >
                {[0, 1, 2].map(j => (
                  <div key={j} style={{ width: 4, height: 4, borderRadius: '50%', background: color, animation: 'office-dot 1.2s ease-in-out infinite', animationDelay: `${j * 0.2}s` }} />
                ))}
              </div>

              {/* Name */}
              <div style={{ position: 'absolute', top: R * 2 + 4, left: '50%', transform: 'translateX(-50%)', fontSize: 10, fontWeight: 700, color, whiteSpace: 'nowrap', pointerEvents: 'none', fontFamily: 'var(--font-sans)', opacity: 0.95, textShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                {firstName}
              </div>

              {/* Status dot */}
              <div style={{ position: 'absolute', bottom: 0, right: 0, width: 7, height: 7, borderRadius: '50%', border: '2px solid var(--bg-secondary)', background: dotColor }} />
            </div>
          )
        })}

        {/* AI Manager sprite */}
        <div ref={el => { mgrWrapRef.current = el }}
          style={{ position: 'absolute', willChange: 'transform', cursor: 'pointer', userSelect: 'none', zIndex: 10 }}
          onClick={() => router.push('/app')}
        >
          {/* Manager bubble */}
          <div ref={el => { mgrBubRef.current = el }}
            style={{ position: 'absolute', bottom: 38, left: '50%', transform: 'translateX(-50%)', background: `${MGR_COLOR}f2`, border: `1px solid ${MGR_COLOR}`, color: '#fff', fontSize: 9.5, fontWeight: 600, lineHeight: 1.35, padding: '4px 9px', borderRadius: 8, whiteSpace: 'nowrap', opacity: 0, transition: 'opacity 0.35s ease', pointerEvents: 'none', boxShadow: '0 3px 10px rgba(217,119,87,0.3)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', zIndex: 30, fontFamily: 'var(--font-sans)' }}
          >
            <div style={{ position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `5px solid ${MGR_COLOR}` }} />
          </div>

          {/* Manager pulse ring */}
          <div style={{ position: 'absolute', inset: -5, borderRadius: '50%', border: `2px solid ${MGR_COLOR}`, animation: 'office-pulse 2.5s ease-in-out infinite', opacity: 0.35 }} />

          {/* Manager avatar — slightly larger, terracotta */}
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: `${MGR_COLOR}22`, border: `2.5px solid ${MGR_COLOR}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: MGR_COLOR, fontFamily: 'var(--font-sans)', boxShadow: `0 0 0 3px ${MGR_COLOR}18, 0 2px 10px rgba(217,119,87,0.2)`, letterSpacing: 0.5 }}>
            {aiName ? initials(aiName) : 'AI'}
          </div>

          {/* Manager name */}
          <div style={{ position: 'absolute', top: 38, left: '50%', transform: 'translateX(-50%)', fontSize: 10, fontWeight: 700, color: MGR_COLOR, whiteSpace: 'nowrap', pointerEvents: 'none', fontFamily: 'var(--font-sans)' }}>
            {aiName || 'Manager'}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes office-pulse { 0%, 100% { transform: scale(1); opacity: 0.4; } 50% { transform: scale(1.7); opacity: 0; } }
        @keyframes office-dot { 0%, 80%, 100% { transform: translateY(0); opacity: 0.4; } 40% { transform: translateY(-4px); opacity: 1; } }
        @keyframes office-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}