'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { MessageList } from '@/components/chat/message-list'
import { ChatInput, ImageAttachment } from '@/components/chat/chat-input'
import { Settings2, ArrowLeft, Trash2, Clock, Calendar, History, CheckCircle2, XCircle, Play } from 'lucide-react'
import { TwoHandsLoader } from '@/components/ui/loader'
import { toast } from 'sonner'
import { useChatStore } from '@/store/chat-store'
import { useAuth } from '@/hooks/use-auth'
import type { Agent, Message } from '@/types/database'
import type { ActivityStep } from '@/components/chat/message-list'
import type { AIState, AIStateMetadata } from '@/components/chat/ai-states'

interface AgentDetailViewProps {
  agent: Agent
}

export function AgentDetailView({ agent: initialAgent }: AgentDetailViewProps) {
  const { profile } = useAuth()
  const router = useRouter()
  const [agent, setAgent] = useState(initialAgent)
  const [view, setView] = useState<'chat' | 'settings' | 'history'>('chat')
  const [_isLoading, setIsLoading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  
  const [name, setName] = useState(agent.name)
  const [mission, setMission] = useState((agent.config as { description?: string })?.description || '')
  const [credentials] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [_saveError, setSaveError] = useState<string | null>(null)
  
  // Refs for auto-save timer management to prevent race conditions
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isUserEditingRef = useRef(false)

  const { 
    agentMessages, 
    setAgentMessages, 
    prependAgentMessages,
    addAgentMessage, 
    isStreaming, 
    setIsStreaming,
    hasMoreAgentMessages,
    setHasMoreAgentMessages,
    isLoadingMoreAgent,
    setIsLoadingMoreAgent,
    updateAgent,
    deleteAgent
  } = useChatStore()

  useEffect(() => {
    setName(agent.name)
    setMission((agent.config as { description?: string })?.description || '')
  }, [agent])

  const handleSave = useCallback(async (silent = false) => {
    // Clear any pending auto-save timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }

    if (!silent) setIsLoading(true)
    setIsSaving(true)
    setSaveError(null)

    try {
      const response = await fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          config: { 
            ...(agent.config as object),
            description: mission,
            credentials: Object.keys(credentials).length > 0 ? credentials : undefined
          },
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to update agent')
      }

      const updatedAgent = await response.json()
      updateAgent(agent.id, updatedAgent)
      
      if (!silent) {
        toast.success('Agent settings saved')
        setAgent(updatedAgent)
        setView('chat')
      } else {
        setAgent(updatedAgent)
        setLastSaved(new Date())
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save settings'
      setSaveError(errorMessage)
      // Always notify user of save failures, even in silent mode
      if (!silent) {
        toast.error(errorMessage)
      } else {
        // Show a subtle error indicator for silent save failures
        console.error('[AgentSettings] Auto-save failed:', errorMessage)
      }
    } finally {
      setIsLoading(false)
      setIsSaving(false)
    }
  }, [agent.id, agent.config, name, mission, credentials, updateAgent])

  // Auto-save logic with proper timer cleanup
  useEffect(() => {
    if (view !== 'settings') return
    
    // Don't auto-save if values haven't changed from current agent state
    const currentMission = (agent.config as { description?: string })?.description || ''
    if (name === agent.name && mission === currentMission) return

    // Clear any existing timer before setting a new one
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    // Set new timer with debounce
    autoSaveTimerRef.current = setTimeout(() => {
      // Don't auto-save if user is actively typing (checked via ref)
      if (!isUserEditingRef.current) {
        handleSave(true)
      }
      autoSaveTimerRef.current = null
    }, 1500) // Increased debounce to 1.5s for better UX

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
    }
  }, [name, mission, view, agent.name, agent.config, handleSave])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [])

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/agents/${agent.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        let message = 'Failed to delete agent'
        try {
          const errorBody = await response.json() as { error?: string }
          if (errorBody?.error) message = errorBody.error
        } catch {
          // Ignore JSON parse errors and keep default message
        }
        throw new Error(message)
      }

      // Remove from store immediately
      deleteAgent(agent.id)
      
      toast.success(`Agent "${agent.name}" deleted`)
      router.push('/app')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete agent'
      toast.error(message)
      console.error(error)
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }
  
  const [streamingContent, setStreamingContent] = useState('')
  const [thinkingContent, setThinkingContent] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [activitySteps, setActivitySteps] = useState<ActivityStep[]>([])
  const [aiState, setAiState] = useState<{ state: AIState; context?: string; metadata?: AIStateMetadata; startTime?: number } | null>(null)
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [lastProgress, setLastProgress] = useState<{ type: string; message: string; timestamp: string; data?: Record<string, unknown> } | null>(null)
  const [progressLog, setProgressLog] = useState<Array<{ timestamp: string; type: string; message: string }>>([])
  const [runEvents, setRunEvents] = useState<Array<Record<string, unknown>>>([])
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  
  // Agent is active when working or initializing (non-scheduled that's starting up)
  const isAgentActive = agent.status === 'working' || agent.status === 'initializing'
  const _isCompleted = agent.status === 'completed'
  const _isFailed = agent.status === 'failed'

  // Poll for screenshots and agent status when agent is active
  useEffect(() => {
    if (!agent.id) return

    const fetchAgentData = async () => {
      try {
        const res = await fetch(`/api/agents/screenshot?agentId=${agent.id}`)
        if (res.ok) {
          const data = await res.json()
          if (data.screenshot) {
            setScreenshot(data.screenshot)
          }
          // Update agent data if it changed (status, schedule times)
          if (data.status !== agent.status || 
              data.next_run_at !== agent.next_run_at || 
              data.last_run_at !== agent.last_run_at) {
            setAgent(prev => ({ 
              ...prev, 
              status: data.status || prev.status,
              next_run_at: data.next_run_at || prev.next_run_at,
              last_run_at: data.last_run_at || prev.last_run_at,
            }))
          }
        }
      } catch (error) {
        console.error('Error fetching agent data:', error)
      }
    }

    // Poll screenshots when agent is active (working or initializing)
    if (isAgentActive) {
      fetchAgentData()
      const interval = setInterval(fetchAgentData, 3000)
      return () => clearInterval(interval)
    } else {
      // One-time check for completed/failed agents to update messages
      fetchAgentData()
    }
  }, [agent.id, agent.status, isAgentActive])

  useEffect(() => {
    if (!agent.id) return

    const fetchProgress = async () => {
      try {
        const res = await fetch(`/api/agents/progress?agentId=${agent.id}`)
        if (!res.ok) return
        const data = (await res.json()) as {
          progress_log?: Array<{ timestamp: string; type: string; message: string }>
          last_progress?: { type: string; message: string; timestamp: string; data?: Record<string, unknown> } | null
          run_events?: Array<Record<string, unknown>>
          active_run_id?: string | null
        }
        const progressLog = data.progress_log || []
        const runEvents = Array.isArray(data.run_events) ? data.run_events : []
        const lastProgress = data.last_progress || null
        
        setProgressLog(progressLog)
        setLastProgress(lastProgress)
        setRunEvents(runEvents)
        setActiveRunId(typeof data.active_run_id === 'string' && data.active_run_id.trim() ? data.active_run_id.trim() : null)
        
        // Build activity steps from progress log and run events (similar to AI Manager)
        if (isAgentActive) {
          setIsThinking(true)
          setAiState({ state: 'working', startTime: Date.now() })
          
          // Build thinking content from progress log
          const lastStartIndex = progressLog.findLastIndex(p => p.type === 'started')
          const runProgress = lastStartIndex >= 0 ? progressLog.slice(lastStartIndex) : progressLog
          const thinkingLog = runProgress.filter(p => p.type !== 'completed' && p.type !== 'failed')
          const thinkingText = thinkingLog.map(p => `[${new Date(p.timestamp).toLocaleTimeString()}] ${p.message}`).join('\n')
          setThinkingContent(thinkingText)
          
          // Build activity steps
          const steps: ActivityStep[] = []
          
          // Add steps from progress log
          thinkingLog.slice(-6).forEach((p, idx) => {
            steps.push({
              id: `progress-${idx}`,
              label: p.message,
              status: 'complete',
              kind: 'thinking'
            })
          })
          
          // Add active step from last progress
          if (lastProgress && lastProgress.type !== 'completed' && lastProgress.type !== 'failed') {
            steps.push({
              id: 'current',
              label: lastProgress.message,
              status: 'active',
              kind: 'work'
            })
          }
          
          // Add tool events as steps
          const toolEvents = runEvents
            .filter(e => e.kind === 'tool' || ['computer_click', 'computer_type', 'navigate', 'browser_navigate', 'screenshot'].includes(e.name?.toString() || ''))
            .slice(-4)
          
          toolEvents.forEach((e, idx) => {
            const name = typeof e.name === 'string' ? e.name : ''
            const data = e.data as Record<string, unknown> | undefined
            let label = name.replace(/_/g, ' ')
            let kind: ActivityStep['kind'] = 'tool'
            
            if (name.includes('click')) {
              label = `Clicked ${data?.target || 'element'}`
              kind = 'work'
            } else if (name.includes('type')) {
              label = `Typed "${(data?.text as string || '').slice(0, 20)}..."`
              kind = 'work'
            } else if (name.includes('navigate')) {
              label = `Navigating to ${(data?.url as string || '').slice(0, 30)}`
              kind = 'browse'
            } else if (name.includes('screenshot')) {
              label = 'Captured screenshot'
              kind = 'image'
            }
            
            steps.push({
              id: `tool-${idx}`,
              label,
              status: 'complete',
              kind
            })
          })
          
          setActivitySteps(steps)
        } else {
          // Clear thinking state when agent is not active
          setIsThinking(false)
          setThinkingContent('')
          setActivitySteps([])
          setAiState(null)
        }
      } catch (error) {
        console.error('Error fetching agent progress:', error)
      }
    }

    if (isAgentActive) {
      fetchProgress()
      const interval = setInterval(fetchProgress, 4000)
      return () => clearInterval(interval)
    } else {
      fetchProgress()
    }
  }, [agent.id, isAgentActive])

  // Fetch and poll for agent messages - poll more frequently when agent is active
  useEffect(() => {
    const fetchMessages = async () => {
      // Generate status message based on agent state
      const getStatusMessage = () => {
        const config = agent.config as Record<string, unknown> | null
        const taskDesc = config?.description as string || agent.name
        
        if (isAgentActive) {
          return `**Working on task...**\n\nCurrently executing: ${taskDesc}\n\nI'll report my findings as I discover them.`
        } else if (agent.status === 'failed') {
          return `**Task failed**\n\nI encountered an issue while working on: ${taskDesc}\n\nCheck with your AI Manager for details.`
        } else {
          return `**Idle**\n\nTask: ${taskDesc}\n\nWaiting to be started.`
        }
      }
      
      if (!agent.conversation_id) {
        const statusMessage: Message = {
          id: 'status-' + agent.id,
          conversation_id: agent.id,
          role: 'assistant',
          content: getStatusMessage(),
          metadata: { type: 'status' },
          created_at: new Date().toISOString(),
        }
        setAgentMessages([statusMessage])
        setHasMoreAgentMessages(false)
        return
      }
      
      try {
        const res = await fetch(`/api/messages?conversation_id=${agent.conversation_id}&limit=20`)
        if (res.ok) {
          const data = await res.json()
          // If no messages exist, show status message
          if (!data.messages || data.messages.length === 0) {
            const statusMessage: Message = {
              id: 'status-' + agent.id,
              conversation_id: agent.conversation_id,
              role: 'assistant',
              content: getStatusMessage(),
              metadata: { type: 'status' },
              created_at: new Date().toISOString(),
            }
            setAgentMessages([statusMessage])
          } else {
            setAgentMessages(data.messages)
          }
          setHasMoreAgentMessages(data.hasMore || false)
        }
      } catch (error) {
        console.error('Error fetching agent messages:', error)
      }
    }

    fetchMessages()
    
    // Poll for new messages while agent is active (staggered from screenshot/progress)
    if (isAgentActive) {
      const interval = setInterval(fetchMessages, 5000)
      return () => clearInterval(interval)
    }
  }, [agent.conversation_id, agent.id, agent.name, agent.status, isAgentActive, setAgentMessages, setHasMoreAgentMessages])

  const handleLoadMore = useCallback(async () => {
    if (!agent.conversation_id || isLoadingMoreAgent || !hasMoreAgentMessages) return
    
    setIsLoadingMoreAgent(true)
    try {
      const oldestMessage = agentMessages[0]
      const cursor = oldestMessage?.id
      
      const res = await fetch(
        `/api/messages?conversation_id=${agent.conversation_id}&limit=20${cursor ? `&cursor=${cursor}` : ''}`
      )
      
      if (res.ok) {
        const data = await res.json()
        if (data.messages && data.messages.length > 0) {
          prependAgentMessages(data.messages)
        }
        setHasMoreAgentMessages(data.hasMore ?? false)
      }
    } catch (error) {
      console.error('Error loading more agent messages:', error)
    } finally {
      setIsLoadingMoreAgent(false)
    }
  }, [agent.conversation_id, agentMessages, isLoadingMoreAgent, hasMoreAgentMessages, prependAgentMessages, setHasMoreAgentMessages, setIsLoadingMoreAgent])

  const handleSend = async (content: string, images?: ImageAttachment[]) => {
    if (!agent.conversation_id) return

    const trimmed = content.trim()
    const lowered = trimmed.toLowerCase()
    const isRunCommand = /^(run|start|go|execute|resume)(\s+(it|the\s+agent|this|task))?(\s+(now|again|please))*[.!?]*$/.test(lowered)
    const isStopCommand = /^(stop|cancel|abort|halt|quit)(\s+(it|the\s+agent|this|task|running|execution))?(\s+(now|please))*[.!?]*$/.test(lowered)
    const savedMission = mission.trim() || ((agent.config as { description?: string })?.description || '').trim()

    const userMessage: Message = {
      id: crypto.randomUUID(),
      conversation_id: agent.conversation_id,
      role: 'user',
      content,
      metadata: {},
      created_at: new Date().toISOString(),
    }
    
    addAgentMessage(userMessage)
    
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: agent.conversation_id,
          role: 'user',
          content,
        }),
      })

      // Handle stop command
      if (isStopCommand && isAgentActive) {
        try {
          const stopResp = await fetch('/api/agents/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId: agent.id }),
          })
          if (stopResp.ok) {
            setAgent(prev => ({ ...prev, status: 'idle' }))
            toast.success('Agent stop signal sent')
          } else {
            toast.error('Failed to stop agent')
          }
        } catch {
          toast.error('Failed to stop agent')
        }
        return
      }

      if (isRunCommand && !savedMission) {
        toast.error('This agent has no mission. Add a mission in Settings, then run again.')
        setView('settings')
        return
      }

      const runResp = await fetch('/api/agents/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: agent.id,
          reset: !isAgentActive,
          // For run commands, send the saved mission; otherwise send the user's message
          taskDescription: isRunCommand ? savedMission : trimmed,
          ...(isAgentActive ? { queue_mode: 'collect' } : {}),
        }),
      })

      if (!runResp.ok) {
        const data = await runResp.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || 'Failed to start agent run')
      }

      const runData = (await runResp.json().catch(() => ({}))) as { queued?: boolean }
      if (runData.queued) {
        toast.message('Queued message for the running agent')
        return
      }

      if (!isAgentActive) {
        setAgent(prev => ({ ...prev, status: 'working' }))
      }
    } catch (error) {
      console.error('Error in agent chat:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to start agent')
    } finally {
      setIsStreaming(false)
    }
  }

  // Derive run history from progressLog
  const runHistory = useMemo(() => {
    if (progressLog.length === 0) return []

    type Run = {
      id: string
      startedAt: string
      endedAt: string | null
      status: 'completed' | 'failed' | 'running' | 'unknown'
      duration: string | null
      eventCount: number
      lastMessage: string
    }

    const runs: Run[] = []
    let currentRun: { startIdx: number; startTime: string } | null = null

    for (let i = 0; i < progressLog.length; i++) {
      const entry = progressLog[i]
      if (entry.type === 'started') {
        currentRun = { startIdx: i, startTime: entry.timestamp }
      } else if ((entry.type === 'completed' || entry.type === 'failed') && currentRun) {
        const startTime = new Date(currentRun.startTime).getTime()
        const endTime = new Date(entry.timestamp).getTime()
        const diffMs = endTime - startTime
        const mins = Math.floor(diffMs / 60000)
        const secs = Math.floor((diffMs % 60000) / 1000)
        const duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`

        runs.push({
          id: `run-${currentRun.startIdx}`,
          startedAt: currentRun.startTime,
          endedAt: entry.timestamp,
          status: entry.type as 'completed' | 'failed',
          duration,
          eventCount: i - currentRun.startIdx + 1,
          lastMessage: entry.message,
        })
        currentRun = null
      }
    }

    // If there's an active run in progress
    if (currentRun && isAgentActive) {
      const startTime = new Date(currentRun.startTime).getTime()
      const diffMs = Date.now() - startTime
      const mins = Math.floor(diffMs / 60000)
      const secs = Math.floor((diffMs % 60000) / 1000)
      const duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
      const lastEntry = progressLog[progressLog.length - 1]

      runs.push({
        id: `run-${currentRun.startIdx}`,
        startedAt: currentRun.startTime,
        endedAt: null,
        status: 'running',
        duration,
        eventCount: progressLog.length - currentRun.startIdx,
        lastMessage: lastEntry?.message || 'Running...',
      })
    }

    return runs.reverse() // Most recent first
  }, [progressLog, isAgentActive])

  // Show monitor when agent is active (working or initializing)
  const showMonitor = isAgentActive

  const _activeRunEvents = useMemo(() => {
    if (!Array.isArray(runEvents) || runEvents.length === 0) return [] as Array<Record<string, unknown>>

    const preferredRunId = typeof activeRunId === 'string' && activeRunId.trim() ? activeRunId.trim() : null
    if (preferredRunId) {
      return runEvents.filter(e => (typeof e.run_id === 'string' ? e.run_id : null) === preferredRunId)
    }

    for (let i = runEvents.length - 1; i >= 0; i--) {
      const rid = runEvents[i] && typeof runEvents[i].run_id === 'string' ? String(runEvents[i].run_id) : ''
      if (rid.trim()) {
        return runEvents.filter(e => (typeof e.run_id === 'string' ? e.run_id : null) === rid)
      }
    }

    return runEvents
  }, [activeRunId, runEvents])

  const displayAgentMessages = useMemo(() => agentMessages, [agentMessages])

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">
      {/* Shared header — persists across chat / history / settings */}
      <div className="px-4 py-2.5 flex items-center justify-between shrink-0 border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          {view !== 'chat' && (
            <button
              onClick={() => setView('chat')}
              className="p-1.5 rounded-md hover:bg-foreground/5 text-muted-foreground hover:text-foreground transition-all shrink-0"
              title="Back"
            >
              <ArrowLeft size={14} />
            </button>
          )}
          <span className="text-[13px] font-medium text-foreground truncate">
            {view === 'settings' ? name : view === 'history' ? 'Run History' : agent.name}
          </span>
          {view === 'settings' && isSaving && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground animate-pulse shrink-0">
              <TwoHandsLoader size="sm" />
              Saving
            </div>
          )}
          {view === 'settings' && !isSaving && lastSaved && (
            <span className="text-[11px] text-muted-foreground shrink-0">Saved</span>
          )}
          {view === 'history' && (
            <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
              {runHistory.length} {runHistory.length === 1 ? 'run' : 'runs'}
            </span>
          )}
          {view === 'chat' && agent.schedule_type === 'scheduled' && agent.next_run_at && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
              <Clock size={11} />
              <span>{new Date(agent.next_run_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            </div>
          )}
          {view === 'chat' && agent.last_run_at && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
              <Calendar size={11} />
              <span>{new Date(agent.last_run_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {view === 'settings' && (
            showDeleteConfirm ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-bold bg-red-500 text-white hover:bg-red-600 transition-all disabled:opacity-50"
                >
                  {isDeleting ? <TwoHandsLoader size="sm" /> : <Trash2 size={12} />}
                  Confirm
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-2.5 py-1 rounded-lg text-[12px] text-muted-foreground hover:text-foreground transition-all"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-1.5 rounded-md hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-all"
                title="Delete Agent"
              >
                <Trash2 size={14} />
              </button>
            )
          )}
          <button
            onClick={() => setView('history')}
            className={cn(
              "p-1.5 rounded-md hover:bg-foreground/5 transition-all",
              view === 'history' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            title="Run History"
          >
            <History size={14} />
          </button>
          <button
            onClick={() => setView('settings')}
            className={cn(
              "p-1.5 rounded-md hover:bg-foreground/5 transition-all",
              view === 'settings' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            title="Agent Settings"
          >
            <Settings2 size={14} />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {view === 'chat' ? (
          <motion.div
            key="chat-view"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-col flex-1 min-h-0 overflow-hidden"
          >
            {/* Agent Chat - matches AI Manager layout when no monitor */}
            <div className={cn(
              "flex-1 flex flex-col min-h-0 overflow-hidden",
              showMonitor && "lg:flex-row"
            )}>
              {/* Chat Area - full width like AI Manager, shrinks when monitor active */}
              <div className={cn(
                "flex flex-col h-full overflow-hidden bg-background",
                showMonitor 
                  ? "w-full lg:w-[33.333%] lg:min-w-[400px]" 
                  : "w-full"
              )}>
                <MessageList 
                  messages={displayAgentMessages} 
                  isStreaming={isStreaming}
                  streamingContent={streamingContent}
                  hasMoreMessages={hasMoreAgentMessages} 
                  isLoadingMore={isLoadingMoreAgent}
                  onLoadMore={handleLoadMore}
                  aiName={agent.name}
                />
                
                <div className="shrink-0 px-4 pb-4">
                  <ChatInput 
                    onSend={handleSend} 
                    placeholder={`Message ${agent.name}...`}
                    isStreaming={isStreaming}
                  />
                </div>
              </div>

              {/* Right 2/3 - Monitor Area - Only visible when agent is actively working */}
              <AnimatePresence>
                {showMonitor && (
                  <motion.div 
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 50 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="flex-1 h-full flex items-center justify-center p-6 sm:p-12 lg:p-20 relative overflow-hidden bg-background"
                  >
                    <div className="w-full max-w-5xl aspect-[16/10] relative z-10">
                      {/* Physical Monitor Frame - Minimalist, subtle border and shadow */}
                      <div className={cn(
                        "relative z-10 h-full w-full bg-background rounded-[32px] overflow-hidden border border-border transition-all duration-1000",
                        isAgentActive ? "shadow-[0px_0px_40px_rgba(59,130,246,0.08)]" : "shadow-[0px_2px_24px_0px_rgba(0,0,0,0.06)]"
                      )}>
                        {/* Screen content - live feed or loading state */}
                        <div className="w-full h-full relative flex items-center justify-center overflow-hidden rounded-[32px] bg-card border border-border">
                          {screenshot ? (
                            <motion.div
                              key="screenshot"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="w-full h-full relative"
                            >
                              <img
                                src={`data:image/png;base64,${screenshot}`}
                                alt="Agent VM Screen"
                                className="absolute inset-0 w-full h-full object-cover"
                              />
                              {/* Pulsing deep blue border glow */}
                              <motion.div 
                                animate={{ opacity: [0.6, 1, 0.6] }}
                                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                className="absolute inset-0 pointer-events-none rounded-[32px] z-20 shadow-[inset_0_0_40px_10px_rgba(37,99,235,0.7),inset_0_0_20px_rgba(37,99,235,1)]"
                              />
                            </motion.div>
                          ) : (
                            <motion.div
                              key="loading"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="flex flex-col items-center justify-center gap-4 text-center p-8"
                            >
                              <TwoHandsLoader size="md" />
                              <div className="space-y-2">
                                <p className="text-[15px] font-medium text-foreground">
                                  {agent.status === 'initializing' ? 'Waiting in queue...' : 'Connecting to VM...'}
                                </p>
                                <p className="text-[13px] text-muted-foreground">
                                  {agent.status === 'initializing' ? 'Your agent will start shortly' : 'Waiting for the agent\'s workspace to become available'}
                                </p>
                              </div>
                              {/* Pulsing border glow while connecting */}
                              <motion.div 
                                animate={{ opacity: [0.3, 0.6, 0.3] }}
                                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                className="absolute inset-0 pointer-events-none rounded-[32px] z-20 shadow-[inset_0_0_40px_10px_rgba(37,99,235,0.4),inset_0_0_20px_rgba(37,99,235,0.6)]"
                              />
                            </motion.div>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : view === 'history' ? (
          <motion.div
            key="history-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex-1 h-full flex flex-col bg-background overflow-y-auto"
          >
            {/* History Content */}
            <div className="max-w-[850px] mx-auto w-full px-8 py-6">
              {runHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <History size={40} className="text-muted-foreground/20 mb-4" />
                  <p className="text-[15px] font-medium text-muted-foreground">No runs yet</p>
                  <p className="text-[13px] text-muted-foreground/60 mt-1">Run the agent to see history here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {runHistory.map((run) => {
                    const statusConfig = {
                      running: { 
                        icon: <Play size={14} strokeWidth={1.5} />, 
                        color: 'text-primary', 
                        bg: 'bg-primary/10', 
                        border: 'border-primary/20',
                        label: 'Running' 
                      },
                      completed: { 
                        icon: <CheckCircle2 size={14} strokeWidth={1.5} />, 
                        color: 'text-[#10b981]', 
                        bg: 'bg-[#10b981]/10', 
                        border: 'border-[#10b981]/20',
                        label: 'Completed' 
                      },
                      failed: { 
                        icon: <XCircle size={14} strokeWidth={1.5} />, 
                        color: 'text-[#ef4444]', 
                        bg: 'bg-[#ef4444]/10', 
                        border: 'border-[#ef4444]/20',
                        label: 'Failed' 
                      },
                      unknown: { 
                        icon: <Clock size={14} strokeWidth={1.5} />, 
                        color: 'text-muted-foreground', 
                        bg: 'bg-muted', 
                        border: 'border-border',
                        label: 'Unknown' 
                      },
                    }[run.status]

                    return (
                      <div
                        key={run.id}
                        className={cn(
                          "flex items-center gap-4 px-5 py-4 rounded-[16px] border bg-card transition-colors",
                          run.status === 'running'
                            ? statusConfig.border
                            : "border-border hover:bg-foreground/[0.02]"
                        )}
                      >
                        <div className={cn("shrink-0 p-2 rounded-lg", statusConfig.bg, statusConfig.color)}>
                          {statusConfig.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn("text-[11px] font-semibold uppercase tracking-[0.05em]", statusConfig.color)}>
                              {statusConfig.label}
                            </span>
                            {run.status === 'running' && (
                              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            )}
                          </div>
                          <p className="text-[13px] text-muted-foreground truncate mt-0.5">
                            {run.lastMessage}
                          </p>
                        </div>
                        <div className="shrink-0 text-right space-y-0.5">
                          {run.duration && (
                            <p className="text-[13px] font-medium text-foreground tabular-nums">{run.duration}</p>
                          )}
                          <p className="text-[11px] text-muted-foreground tabular-nums" suppressHydrationWarning>
                            {new Date(run.startedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="settings-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex-1 h-full flex flex-col bg-background overflow-y-auto"
          >
            {/* Settings Content */}
            <div className="max-w-[850px] mx-auto w-full px-8 py-4" style={{ maxWidth: '850px' }}>
              {/* Agent Name */}
              <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-8 py-12 border-b border-border items-start">
                <div className="space-y-1.5 pt-1">
                  <label className="text-[13px] font-semibold text-foreground uppercase tracking-[0.2em]">
                    Agent Name
                  </label>
                  <p className="text-[13px] text-muted-foreground leading-relaxed pr-8">The primary identifier for your AI manager within the workspace.</p>
                </div>
                <div className="w-full">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      updateAgent(agent.id, { name: e.target.value })
                    }}
                    placeholder="Nova"
                    className="w-full bg-transparent border-none p-0 text-[22px] font-medium focus:outline-none text-foreground placeholder:text-muted-foreground/20"
                  />
                </div>
              </div>

              {/* Mission / Description */}
              <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-8 py-12 border-b border-border items-start">
                <div className="space-y-1.5 pt-1">
                  <label className="text-[13px] font-semibold text-foreground uppercase tracking-[0.2em]">
                    Mission
                  </label>
                  <p className="text-[13px] text-muted-foreground leading-relaxed pr-8">Define the high-level goal and behavior instructions for this agent.</p>
                </div>
                <div className="w-full">
                  <textarea
                    value={mission}
                    onChange={(e) => setMission(e.target.value)}
                    rows={5}
                    placeholder="What should this agent do?"
                    className="w-full bg-transparent border-none p-0 text-[17px] leading-relaxed focus:outline-none text-foreground resize-none placeholder:text-muted-foreground/20"
                  />
                </div>
              </div>

              {/* Credentials Section */}
              <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-8 py-12 items-start">
                <div className="space-y-1.5 pt-1">
                  <label className="text-[13px] font-semibold text-foreground uppercase tracking-[0.2em]">
                    Credentials
                  </label>
                  <p className="text-[13px] text-muted-foreground leading-relaxed pr-8">Encrypted access keys and authentication tokens for external services.</p>
                </div>
                <div className="text-[16px] text-muted-foreground leading-relaxed pt-0.5">
                  {(agent.config as { credentials?: Record<string, string> })?.credentials 
                    ? 'Credentials are securely stored for this agent.'
                    : 'No credentials saved. The AI Manager will request them when needed.'}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
