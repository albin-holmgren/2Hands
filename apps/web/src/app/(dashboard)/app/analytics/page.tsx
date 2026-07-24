'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, Zap, CheckCircle2, XCircle, Bot, BarChart3, Target } from 'lucide-react'
import type { UserAnalytics, AgentPerformance, DayMetric } from '@/lib/analytics/user-analytics'

type Period = 'week' | 'month'

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<UserAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('month')

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/agents/analytics?period=${period}`, { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          setAnalytics(data)
        }
      } catch {
        // silent
      } finally {
        setLoading(false)
      }
    }
    fetchAnalytics()
  }, [period])

  if (loading) {
    return (
      <div className="min-h-full bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Period toggle skeleton */}
          <div className="flex items-center justify-between">
            <div className="h-5 w-24 bg-foreground/8 rounded-lg animate-pulse" />
            <div className="h-8 w-32 bg-foreground/8 rounded-lg animate-pulse" />
          </div>
          {/* Stat cards skeleton */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-foreground/8 animate-pulse" />
                  <div className="h-3 w-20 bg-foreground/8 rounded animate-pulse" />
                </div>
                <div className="h-7 w-16 bg-foreground/8 rounded animate-pulse" />
                <div className="h-3 w-24 bg-foreground/8 rounded animate-pulse" />
              </div>
            ))}
          </div>
          {/* Chart skeleton */}
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="h-4 w-20 bg-foreground/8 rounded animate-pulse mb-4" />
            <div className="flex items-end gap-1 h-32">
              {[...Array(30)].map((_, i) => (
                <div key={i} className="flex-1 bg-foreground/8 rounded-t animate-pulse" style={{ height: `${20 + Math.sin(i * 0.8) * 15 + 15}%` }} />
              ))}
            </div>
          </div>
          {/* Table skeleton */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <div className="h-4 w-36 bg-foreground/8 rounded animate-pulse" />
            </div>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3 border-b border-border/50 last:border-0">
                <div className="w-2 h-2 rounded-full bg-foreground/8 animate-pulse" />
                <div className="h-4 w-40 bg-foreground/8 rounded animate-pulse" />
                <div className="ml-auto h-4 w-12 bg-foreground/8 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!analytics) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <p className="text-muted-foreground">Failed to load analytics</p>
      </div>
    )
  }

  const { overview, agents, trends, roi, missions } = analytics

  return (
    <div className="min-h-full bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Inline header row */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[17px] font-semibold text-foreground tracking-tight leading-none flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Analytics
            </h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">How your agents are performing</p>
          </div>
          <div className="flex gap-1 bg-muted rounded-lg p-0.5">
            {(['week', 'month'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  period === p
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {p === 'week' ? '7 days' : '30 days'}
              </button>
            ))}
          </div>
        </div>
        {/* Overview Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
            label="Tasks Completed"
            value={overview.successfulRuns.toString()}
            subtext={`${overview.successRate}% success rate`}
          />
          <StatCard
            icon={<Zap className="w-4 h-4 text-amber-500" />}
            label="Credits Used"
            value={formatNumber(overview.totalCreditsUsed)}
            subtext={`${overview.totalAgentRuns} total runs`}
          />
          <StatCard
            icon={<Bot className="w-4 h-4 text-purple-500" />}
            label="Active Agents"
            value={overview.activeAgents.toString()}
            subtext={`${overview.totalAgents} total`}
          />
        </div>

        {/* Activity Chart */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Activity
          </h3>
          <MiniBarChart data={trends.daily} />
        </div>

        {/* Agent Performance Table */}
        {agents.length > 0 && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Bot className="w-4 h-4" />
                Agent Performance
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="px-5 py-3 font-medium">Agent</th>
                    <th className="px-5 py-3 font-medium">Runs</th>
                    <th className="px-5 py-3 font-medium">Success</th>
                    <th className="px-5 py-3 font-medium">Credits</th>
                    <th className="px-5 py-3 font-medium">Last Run</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map(agent => (
                    <AgentRow key={agent.id} agent={agent} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Mission Mode Stats */}
        {missions.totalMissions > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Mission Mode
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-card rounded-xl border border-border p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{missions.totalMissions}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Total missions</p>
              </div>
              <div className="bg-card rounded-xl border border-border p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{missions.totalTicks}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Ticks run</p>
              </div>
              <div className="bg-card rounded-xl border border-border p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{missions.totalAgentsSpawned}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Agents spawned</p>
              </div>
              <div className="bg-card rounded-xl border border-border p-4 text-center">
                <p className="text-2xl font-bold text-emerald-600">{missions.totalFindings}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Findings</p>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="px-5 py-3 font-medium">Mission</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Progress</th>
                    <th className="px-5 py-3 font-medium">Ticks</th>
                    <th className="px-5 py-3 font-medium">Findings</th>
                  </tr>
                </thead>
                <tbody>
                  {missions.missions.map((m: { id: string; goal: string; status: string; tickCount: number; findingsCount: number; progressPct: number }) => (
                    <tr key={m.id} className="border-b border-border/50 last:border-0 hover:bg-accent/30 transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-sm font-medium text-foreground line-clamp-1">{m.goal}</p>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-md capitalize ${
                          m.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                          m.status === 'completed' ? 'bg-primary/10 text-primary' :
                          m.status === 'paused' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                          'bg-muted text-muted-foreground'
                        }`}>{m.status}</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full rounded-full ${m.progressPct === 100 ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${m.progressPct}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground">{m.progressPct}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">{m.tickCount}</td>
                      <td className="px-5 py-3 text-sm text-emerald-600">{m.findingsCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {agents.length === 0 && (
          <div className="text-center py-16">
            <Bot className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="font-semibold text-foreground mb-1">No agents yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first agent to start seeing analytics</p>
            <a
              href="/app"
              className="inline-block text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
            >
              Go to AI Manager
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Sub-components
// ============================================================

function StatCard({ icon, label, value, subtext }: {
  icon: React.ReactNode
  label: string
  value: string
  subtext: string
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{subtext}</div>
    </div>
  )
}

function AgentRow({ agent }: { agent: AgentPerformance }) {
  const statusColors: Record<string, string> = {
    idle: 'bg-gray-400',
    working: 'bg-primary animate-pulse',
    completed: 'bg-emerald-500',
    failed: 'bg-red-500',
  }

  return (
    <tr className="border-b border-border/50 hover:bg-muted transition-colors">
      <td className="px-5 py-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${statusColors[agent.status] || 'bg-gray-400'}`} />
          <span className="font-medium text-foreground">{agent.name}</span>
          <span className="text-xs text-muted-foreground">{agent.type}</span>
        </div>
        {agent.lastRunSummary && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{agent.lastRunSummary}</p>
        )}
      </td>
      <td className="px-5 py-3 text-foreground">{agent.totalRuns}</td>
      <td className="px-5 py-3">
        <div className="flex items-center gap-1.5">
          {agent.successRate >= 80 ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          ) : agent.successRate >= 50 ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
          ) : (
            <XCircle className="w-3.5 h-3.5 text-red-500" />
          )}
          <span className={
            agent.successRate >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
            agent.successRate >= 50 ? 'text-amber-600 dark:text-amber-400' :
            'text-red-600 dark:text-red-400'
          }>
            {agent.successRate}%
          </span>
        </div>
      </td>
      <td className="px-5 py-3 text-muted-foreground">{formatNumber(agent.creditsUsed)}</td>
      <td className="px-5 py-3 text-muted-foreground text-xs">
        {agent.lastRunAt ? formatRelativeTime(agent.lastRunAt) : 'Never'}
      </td>
    </tr>
  )
}

function MiniBarChart({ data }: { data: DayMetric[] }) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No data yet</p>

  const maxActivity = Math.max(...data.map(d => d.runs + (d.missionTicks || 0)), 1)
  const hasMissionTicks = data.some(d => (d.missionTicks || 0) > 0)

  return (
    <>
      {hasMissionTicks && (
        <div className="flex items-center gap-4 mb-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-primary/50" /> Agent runs</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-purple-500/50" /> Mission ticks</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400/40" /> Failures</span>
        </div>
      )}
      <div className="flex items-end gap-1 h-32">
        {data.map((day, i) => {
          const total = day.runs + (day.missionTicks || 0)
          const height = Math.max((total / maxActivity) * 100, 2)
          const missionHeight = total > 0 ? ((day.missionTicks || 0) / total) * height : 0
          const agentHeight = total > 0 ? (day.successes / total) * height : 0
          const failHeight = total > 0 ? (day.failures / total) * height : 0
          const isToday = i === data.length - 1

          return (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-0.5 group relative">
              <div className="w-full flex flex-col justify-end" style={{ height: '100px' }}>
                {failHeight > 0 && (
                  <div
                    className="w-full bg-red-400/40 dark:bg-red-500/30 rounded-t"
                    style={{ height: `${failHeight}%` }}
                  />
                )}
                {missionHeight > 0 && (
                  <div
                    className={`w-full ${isToday ? 'bg-purple-500' : 'bg-purple-500/30'}`}
                    style={{ height: `${missionHeight}%` }}
                  />
                )}
                <div
                  className={`w-full rounded-t ${isToday ? 'bg-primary' : 'bg-primary/30'}`}
                  style={{ height: `${agentHeight}%` }}
                />
              </div>
              {(i % Math.ceil(data.length / 7) === 0 || isToday) && (
                <span className="text-[10px] text-muted-foreground mt-1">
                  {isToday ? 'Today' : new Date(day.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                </span>
              )}
              <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                <div className="bg-popover text-popover-foreground text-xs rounded-lg px-2 py-1 whitespace-nowrap shadow-lg border border-border">
                  {day.runs} runs · {day.successes} ok · {day.failures} fail{(day.missionTicks || 0) > 0 ? ` · ${day.missionTicks} ticks` : ''}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en', { month: 'short', day: 'numeric' })
}
