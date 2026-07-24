'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { readStreamableValue } from '@ai-sdk/rsc'
import { MessageList } from '@/components/chat/message-list'
import { ChatInput, ImageAttachment } from '@/components/chat/chat-input'
import { useChatStore } from '@/store/chat-store'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { useWorkspaceStore } from '@/store/workspace-store'
import { toast } from 'sonner'
import { streamChat } from './actions'
import type { Message } from '@/types/database'
import type { AIState, AIStateMetadata } from '@/components/chat/ai-states'
import type { ActivityStep } from '@/components/chat/message-list'

const MANAGER_CONVERSATION_TITLE = 'AI Manager'

export default function AppPage() {
  const router = useRouter()
  const supabase = createClient()
  const { user, profile, loading: authLoading, refreshProfile } = useAuth()
  const { activeWorkspace, setWorkspaceAiName, initialized: wsInitialized } = useWorkspaceStore()
  const {
    messages,
    setMessages,
    prependMessages,
    addMessage,
    setAgents,
    managerConversationId,
    setManagerConversationId,
    initializedForWorkspaceId,
    setInitializedForWorkspaceId,
    hasMoreMessages,
    setHasMoreMessages,
    isLoadingMore,
    setIsLoadingMore,
    isLoading,
    setIsLoading,
    isStreaming,
    setIsStreaming,
    updateMessage,
    patchMessage,
  } = useChatStore()

  const [pageDragImages, setPageDragImages] = useState<ImageAttachment[]>([])
  const [isPageDragging, setIsPageDragging] = useState(false)
  const pageDragCounterRef = useRef(0)
  // Tracks consecutive realtime channel errors — only toast after 2+ to avoid noise from momentary blips
  const realtimeErrorCountRef = useRef(0)

  const [streamingContent, setStreamingContent] = useState('')
  const [thinkingContent, setThinkingContent] = useState('')
  const thinkingContentRef = useRef('')
  const allThinkingContentRef = useRef('') // Never cleared during streaming - used for final persistence
  const pendingSetupCardRef = useRef<{ connector_id: string; connector_name: string; fields: unknown[]; logo_url?: string | null } | null>(null)

  // Stable ID for the in-progress assistant message inserted into the store on first text chunk
  const streamingMessageIdRef = useRef<string | null>(null)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  
  // Throttled flush for streaming text — accumulate in ref, flush at ~30fps
  // Note: we only update streamingContent state (passed as streamingText prop to MessageBubble).
  // The Zustand store message is NOT updated per-flush — that reduces broadcast cost dramatically.
  // The store entry gets its final content in the persist path at stream completion.
  const streamingContentRef = useRef('')
  const streamingFlushRafRef = useRef<number | null>(null)
  const flushStreamingContent = useCallback(() => {
    if (streamingFlushRafRef.current !== null) return // already scheduled
    streamingFlushRafRef.current = requestAnimationFrame(() => {
      streamingFlushRafRef.current = null
      setStreamingContent(streamingContentRef.current)
    })
  }, [])
  const [isThinking, setIsThinking] = useState(false)
  const [aiState, setAiState] = useState<{ state: AIState; context?: string; metadata?: AIStateMetadata; startTime?: number } | null>(null)
  const [activitySteps, setActivitySteps] = useState<ActivityStep[]>([])
  const activityStepsRef = useRef<ActivityStep[]>([])
  const [complexity, setComplexity] = useState<{ level: 'simple' | 'medium' | 'complex'; shouldShowThinking: boolean } | null>(null)
  const [initialized, setInitialized] = useState(false)
  const hasGreetedRef = useRef(false) // useRef avoids stale-closure double-fire in StrictMode
  const [activeMissions, setActiveMissions] = useState<Array<{ id: string; goal: string; status: string }>>([])
  const [model, setModel] = useState('google/gemini-2.5-flash')
  
  // Track recently sent optimistic message IDs to prevent realtime subscription from adding duplicates
  // Uses a Map with timestamps for TTL-based cleanup (30s expiry)
  const recentlySentIdsRef = useRef<Map<string, number>>(new Map())
  // Queue of messages sent while a stream was active — drained as soon as streaming ends
  const pendingQueueRef = useRef<Array<{ content: string; images?: ImageAttachment[] }>>([])
  // Track the most recent optimistic assistant message content to prevent realtime duplication
  const pendingAssistantContentRef = useRef<string | null>(null)
  // Track usage data from last SSE response to attach to final message
  const lastUsageRef = useRef<{ inputTokens: number; outputTokens: number; creditsUsed: number; model: string } | null>(null)
  // Track memory labels used in the last response
  const lastMemoryLabelsRef = useRef<Array<{ type: string; label: string }> | null>(null)
  // IDs of messages the client has already finalized via the streaming path.
  // Used to prevent the realtime DB UPDATE from overwriting locally-finalized content.
  const locallyFinalizedRef = useRef<Set<string>>(new Set())
  
  // Fetch active missions for the current workspace banner
  useEffect(() => {
    if (!activeWorkspace?.id) return
    let cancelled = false
    const fetch_ = async () => {
      try {
        const res = await fetch(`/api/missions?status=active&workspaceId=${activeWorkspace.id}`)
        if (!res.ok || cancelled) return
        const data = await res.json()
        setActiveMissions(data.missions ?? [])
      } catch {}
    }
    fetch_()
    const interval = setInterval(fetch_, 90_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [activeWorkspace?.id])

  // Reset UI-only state on mount — prevents loading/streaming flags getting stuck
  // when navigating away mid-stream and back.
  // Do NOT clear managerConversationId or messages here — the Zustand store persists
  // them intentionally across navigations. Only the workspace-change effect (below)
  // should reset conversation data.
  useEffect(() => {
    setIsLoading(false)
    setIsStreaming(false)
    setStreamingContent('')
    setThinkingContent('')
    setExecutingTool(null)
    setActivitySteps([])
    activityStepsRef.current = []
    setIsThinking(false)
    setAiState(null)
    setComplexity(null)
    pendingSetupCardRef.current = null
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time subscription for new messages
  useEffect(() => {
    if (!managerConversationId) return

    const channel = supabase
      .channel(`messages:${managerConversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${managerConversationId}`,
        },
        (payload) => {
          const newMessage = payload.new as Message
          // Skip if this is a message we just sent optimistically
          if (recentlySentIdsRef.current.has(newMessage.id)) {
            recentlySentIdsRef.current.delete(newMessage.id)
            return
          }
          // Skip if this is the assistant message we already rendered optimistically.
          // Normalize whitespace before comparing: streaming content may have " " where
          // the DB has "\n" (e.g. sentence-final newlines), causing exact match to fail.
          if (newMessage.role === 'assistant') {
            const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
            const pendingContent = normalize(pendingAssistantContentRef.current || '')
            const incomingContent = normalize(newMessage.content || '')
            if (pendingContent && incomingContent && (
              pendingContent === incomingContent ||
              (pendingContent.length > 20 && incomingContent.startsWith(pendingContent.slice(0, 30))) ||
              (incomingContent.length > 20 && pendingContent.startsWith(incomingContent.slice(0, 30)))
            )) {
              pendingAssistantContentRef.current = null
              return
            }
          }
          // Skip handoff cards we inserted ourselves (already in local store)
          const newMsgMeta = newMessage.metadata as { type?: string; _selfInserted?: boolean } | null
          if (newMsgMeta?.type === 'agent_handoff' && newMsgMeta?._selfInserted) return
          // Show toast for server-inserted mission progress updates
          const msgMeta = newMessage.metadata as { type?: string; goal?: string; agents_created?: number; agent_name?: string } | null
          if (msgMeta?.type === 'mission_progress') {
            const goal = msgMeta.goal ? msgMeta.goal.slice(0, 40) + (msgMeta.goal.length > 40 ? '…' : '') : 'Mission'
            const agentNote = msgMeta.agents_created && msgMeta.agents_created > 0
              ? ` · ${msgMeta.agents_created} agent${msgMeta.agents_created > 1 ? 's' : ''} delegated`
              : ''
            toast(`🎯 ${goal}${agentNote}`, { description: 'Mission tick completed — scroll down to see the update' })
          } else if (msgMeta?.type === 'agent_finding') {
            const name = msgMeta.agent_name || 'Agent'
            toast(`🔍 ${name} — findings ready`, { description: 'New research from your mission — scroll down to read' })
          } else if (msgMeta?.type === 'agent_completion') {
            const name = (msgMeta as { agent_name?: string }).agent_name || 'Agent'
            toast(`✅ ${name} finished`, { description: 'Scroll down to see the results' })
          }
          // Use store's addMessage which handles duplicates internally
          addMessage(newMessage)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${managerConversationId}`,
        },
        (payload) => {
          const updatedMessage = payload.new as Message
          const meta = updatedMessage.metadata as { type?: string } | null
          if (meta?.type === 'agent_handoff') {
            // Live-update handoff cards when completion path updates their metadata
            addMessage(updatedMessage)
          } else if (meta?.type === 'manager_turn') {
            // Live-update the manager-turn card when the server finishes processing.
            // Merge metadata so client-side fields (thinking_content etc.) are not lost.
            // Do NOT overwrite content if the client already finalized it from the stream —
            // the DB version may differ due to server-side content mutations made after streaming.
            const existingMsg = useChatStore.getState().messages.find(m => m.id === updatedMessage.id)
            const mergedMeta = { ...(existingMsg?.metadata as object || {}), ...(updatedMessage.metadata as object || {}) }
            const patch: Partial<Message> = { metadata: mergedMeta }
            if (!locallyFinalizedRef.current.has(updatedMessage.id)) {
              patch.content = updatedMessage.content
            }
            patchMessage(updatedMessage.id, patch)
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          realtimeErrorCountRef.current += 1
          console.warn('[Realtime] Channel error/timeout, messages may be delayed (consecutive:', realtimeErrorCountRef.current, ')')
          // Only surface the toast after 2+ consecutive errors — a single blip is normal on mobile/flaky networks
          if (realtimeErrorCountRef.current >= 2) {
            toast.warning('Connection interrupted — messages may be delayed', { id: 'realtime-error', duration: 5000 })
          }
        } else if (status === 'SUBSCRIBED') {
          realtimeErrorCountRef.current = 0
          toast.dismiss('realtime-error')
          // Catch-up: fetch the latest messages to bridge the window between
          // page load and subscription setup. Any INSERT/UPDATE that fired
          // during that gap (e.g. a manager turn completing right after refresh)
          // is recovered here so the conversation never appears stuck.
          const wsId = useWorkspaceStore.getState().activeWorkspace?.id
          if (managerConversationId && wsId) {
            fetch(`/api/messages?conversation_id=${managerConversationId}&workspaceId=${wsId}&limit=20`)
              .then(r => r.ok ? r.json() : null)
              .then((data: { messages?: Message[] } | null) => {
                if (!data?.messages) return
                const state = useChatStore.getState()
                const existingIds = new Set(state.messages.map((m: Message) => m.id))
                data.messages.forEach((m: Message) => {
                  if (!existingIds.has(m.id)) addMessage(m)
                })
              })
              .catch(() => {})
          }
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [managerConversationId, supabase, addMessage])
  
  const [executingTool, setExecutingTool] = useState<{ name: string; type: 'create' | 'modify' | 'delete' | 'report' | 'search' } | null>(null)

  // Reset initialization when workspace ACTUALLY changes (not on every re-mount).
  // initializedForWorkspaceId persists in Zustand across navigations, so we can
  // tell the difference between a genuine workspace switch and a page re-mount.
  useEffect(() => {
    if (!activeWorkspace?.id) return
    // Same workspace as last time — just a re-mount, don't clear anything.
    if (initializedForWorkspaceId === activeWorkspace.id) return
    
    // Workspace genuinely changed — reset all state.
    setInitialized(false)
    hasGreetedRef.current = false
    setStreamingContent('')
    setThinkingContent('')
    setAiState(null)
    setActivitySteps([])
    activityStepsRef.current = []
    pendingSetupCardRef.current = null
    pendingAssistantContentRef.current = ''
    recentlySentIdsRef.current.clear()
    
    setComplexity(null)
    setManagerConversationId(null)
    setInitializedForWorkspaceId(null)
    setMessages([])
    setHasMoreMessages(false)
  }, [activeWorkspace?.id, initializedForWorkspaceId, setManagerConversationId, setInitializedForWorkspaceId, setMessages, setHasMoreMessages])

  // Initialize: Load or create workspace-scoped manager conversation
  useEffect(() => {
    // Skip if already initialized or still loading auth/workspace
    if (initialized || authLoading) return
    // Wait for user and workspace to be available
    // If workspace store is done initializing but still no workspace, bail — WorkspaceProvider will redirect
    if (!user || (!activeWorkspace && wsInitialized)) return
    if (!activeWorkspace) return
    // Skip re-initialization if we already have a conversation ID in the store.
    // This handles navigating back to this page without re-fetching.
    // Do a silent background catch-up to pull in any messages that arrived
    // while the user was on a different page.
    if (managerConversationId) {
      setInitialized(true)
      fetch(`/api/messages?conversation_id=${managerConversationId}&workspaceId=${activeWorkspace!.id}&limit=20`)
        .then(r => r.json())
        .then(d => {
          const msgs = (d.messages as Message[]) ?? []
          if (msgs.length > 0) {
            setMessages(msgs)
            setHasMoreMessages(d.hasMore ?? false)
          }
        })
        .catch(() => {})
      return
    }
    
    let isMounted = true
    const initManagerConversation = async () => {
      setIsLoading(true)
      try {
        // Fetch workspace-scoped manager conversation via API
        const res = await fetch(`/api/conversations?workspaceId=${activeWorkspace.id}`, {
          cache: 'no-store',
        })
        
        if (!isMounted) return
        
        if (!res.ok) {
          console.error('Failed to fetch conversations:', res.status)
          setIsLoading(false)
          // Do NOT set initialized=true here — leave it false so the effect
          // retries when deps change (e.g. workspace reload / re-auth).
          return
        }
        
        const allConvs = await res.json()
        const managerConvs = (allConvs as Array<{ id: string; title: string; created_at: string }>)
          .filter(c => c.title === MANAGER_CONVERSATION_TITLE)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        
        if (managerConvs.length > 0) {
          const convData = managerConvs[0]
          setManagerConversationId(convData.id)
          
          // Load recent messages via API
          const msgRes = await fetch(`/api/messages?conversation_id=${convData.id}&workspaceId=${activeWorkspace.id}&limit=20`, {
            cache: 'no-store',
          })
          if (msgRes.ok) {
            const data = await msgRes.json()
            if (data.messages && data.messages.length > 0) {
              setMessages(data.messages)
              setHasMoreMessages(data.hasMore || false)
              hasGreetedRef.current = true
            } else {
              setMessages([])
              setHasMoreMessages(false)
              hasGreetedRef.current = false
            }
          }
        } else {
          // Create workspace-scoped manager conversation via API
          const createRes = await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: MANAGER_CONVERSATION_TITLE,
              workspaceId: activeWorkspace.id,
            }),
          })

          if (createRes.ok) {
            const newConv = await createRes.json() as { id: string }
            setManagerConversationId(newConv.id)
            setMessages([])
            setHasMoreMessages(false)
            hasGreetedRef.current = false
          } else {
            console.error('Failed to create manager conversation:', createRes.status)
            setIsLoading(false)
            // Leave initialized=false so a retry can happen.
            return
          }
        }
      } catch (error) {
        console.error('Manager conversation init error:', error)
        if (isMounted) {
          setIsLoading(false)
          // Leave initialized=false on error so the next dep change triggers a retry.
          // Also schedule a 3s auto-retry so a transient network/auth blip self-heals.
          setTimeout(() => { if (isMounted) setInitialized(false) }, 3000)
        }
        return
      }
      if (isMounted) {
        setIsLoading(false)
        setInitialized(true)
        // Record which workspace we initialized for so the workspace-change effect
        // can skip the reset on future re-mounts of this same workspace.
        setInitializedForWorkspaceId(activeWorkspace.id)
      }
    }

    initManagerConversation()
    
    return () => {
      isMounted = false
    }
  }, [initialized, authLoading, user, activeWorkspace, setManagerConversationId, setInitializedForWorkspaceId, setMessages, setHasMoreMessages])

  // Auto-greet when conversation is initialized with no messages
  useEffect(() => {
    // Only send auto-greeting if this is a brand new conversation with no messages
    if (!initialized || !managerConversationId || hasGreetedRef.current || messages.length > 0 || isLoading || isStreaming) {
      return
    }
    
    const sendAutoGreeting = async () => {
      hasGreetedRef.current = true // Set synchronously via ref to prevent any double-fire
      setIsLoading(true)
      setIsStreaming(true)

      try {
        // Send empty conversation to trigger AI greeting via server action
        const { output } = await streamChat(
          [{ role: 'user', content: 'Hello' }],
          managerConversationId!
        )

        let fullContent = ''
        let deltaCount = 0
        let hadAuthError = false

        for await (const delta of readStreamableValue(output)) {
          deltaCount++
          if (!delta) continue
          try {
            const parsed = JSON.parse(delta)
            if (parsed.text) {
              fullContent += parsed.text
              setStreamingContent(fullContent)
              pendingAssistantContentRef.current = fullContent.trim()
            }
            if (parsed.type === 'error') {
              console.error('[Auto-Greet] Stream error:', parsed.message)
              if (parsed.message?.includes('OIDC') || parsed.message?.includes('token')) {
                hadAuthError = true
              }
            }
          } catch {
            // Ignore parse errors
          }
        }

        // Add assistant greeting message
        if (fullContent) {
          const greetingMessage: Message = {
            id: crypto.randomUUID(),
            conversation_id: managerConversationId,
            role: 'assistant',
            content: fullContent,
            metadata: {},
            created_at: new Date().toISOString(),
          }
          pendingAssistantContentRef.current = fullContent.trim()
          addMessage(greetingMessage)
          
          // Note: API already saves the message, so we don't save it again here to avoid duplicates
        } else {
          // Dev mode fallback: Show a mock greeting if we're in development and auth failed
          const isDevMode = process.env.NODE_ENV === 'development'
          
          if (isDevMode && hadAuthError) {
            const devGreeting = `Hi there! 👋

I'm your AI Manager. I help you get things done - whether that's creating agents, researching topics, or managing your workspace.

**⚠️ Development Mode Notice:**
The AI Gateway authentication token has expired. To get real AI responses, run:
\`\`\`
vercel env pull
\`\`\`
Then restart your dev server.

In the meantime, this is a mock greeting for UI testing. The workspace creation flow is working correctly!`
            
            const devGreetingMessage: Message = {
              id: crypto.randomUUID(),
              conversation_id: managerConversationId,
              role: 'assistant',
              content: devGreeting,
              metadata: { isDevMock: true },
              created_at: new Date().toISOString(),
            }
            addMessage(devGreetingMessage)
            // Note: Mock greeting is not saved to database - it's only for UI testing
          }
        }
        setStreamingContent('')
        setIsStreaming(false)
        setIsLoading(false)
      } catch (error) {
        console.error('[Auto-Greet] Error:', error)
        setIsLoading(false)
        setIsStreaming(false)
      }
    }

    sendAutoGreeting()
  }, [initialized, managerConversationId, messages.length, isLoading, isStreaming]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load older messages (cursor-based pagination using message ID)
  const handleLoadMore = useCallback(async () => {
    if (!managerConversationId || isLoadingMore || !hasMoreMessages) return
    
    setIsLoadingMore(true)
    try {
      const oldestMessage = messages[0]
      const cursor = oldestMessage?.id
      const url = `/api/messages?conversation_id=${managerConversationId}&limit=20${cursor ? `&cursor=${cursor}` : ''}`
      
      const res = await fetch(url)
      
      if (!res.ok) {
        throw new Error(`Failed to load messages (${res.status})`)
      }

      const data = await res.json()
      
      if (data.messages && data.messages.length > 0) {
        prependMessages(data.messages)
        setHasMoreMessages(data.hasMore ?? false)
      } else {
        setHasMoreMessages(false)
      }
    } catch (error) {
      console.error('Error loading more messages:', error)
      toast.error('Failed to load older messages. Scroll up to retry.')
    } finally {
      setIsLoadingMore(false)
    }
  }, [managerConversationId, messages, isLoadingMore, hasMoreMessages, prependMessages, setHasMoreMessages, setIsLoadingMore])

  const handleSend = useCallback(
    async (content: string, images?: ImageAttachment[]) => {
      if (!managerConversationId) {
        // Silently drop — either still initializing or init hasn't completed yet.
        return
      }

      // If the AI is currently streaming, show the user message immediately and queue
      // the AI reply — it will fire automatically the moment the current stream ends.
      if (useChatStore.getState().isStreaming) {
        if (!user) { router.push('/sign-in'); return }
        const queuedMsgId = crypto.randomUUID()
        recentlySentIdsRef.current.set(queuedMsgId, Date.now())
        const attachMeta = images && images.length > 0
          ? images.map(img => ({ base64: img.base64, mediaType: img.mediaType, name: img.name }))
          : undefined
        addMessage({
          id: queuedMsgId,
          conversation_id: managerConversationId,
          role: 'user',
          content: content || (attachMeta ? '[Image]' : ''),
          metadata: attachMeta ? { attachments: attachMeta } : {},
          created_at: new Date().toISOString(),
        })
        fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: managerConversationId,
            role: 'user',
            content: content || '(empty)',
            id: queuedMsgId,
            ...(attachMeta ? { metadata: { attachments: attachMeta } } : {}),
          }),
        }).catch(err => console.error('[MessageSave] Queue save error:', err))
        pendingQueueRef.current.push({ content, images })
        return
      }

      setIsLoading(true)

      try {
        if (!user) {
          router.push('/sign-in')
          return
        }

        const messageId = crypto.randomUUID()

        // Track this ID so realtime subscription doesn't add it again (TTL: 30s)
        recentlySentIdsRef.current.set(messageId, Date.now())
        // Cleanup expired IDs older than 30s
        const now = Date.now()
        recentlySentIdsRef.current.forEach((ts, id) => {
          if (now - ts > 30_000) recentlySentIdsRef.current.delete(id)
        })

        // Build image attachment metadata (base64 stored for in-chat display)
        const attachmentMeta = images && images.length > 0
          ? images.map(img => ({ base64: img.base64, mediaType: img.mediaType, name: img.name }))
          : undefined

        // Create user message (optimistic update)
        const userMessage: Message = {
          id: messageId,
          conversation_id: managerConversationId,
          role: 'user',
          content: content || (attachmentMeta ? '[Image]' : ''),
          metadata: attachmentMeta ? { attachments: attachmentMeta } : {},
          created_at: new Date().toISOString(),
        }

        addMessage(userMessage)

        // Save user message to database (retry once on failure)
        const savePayload = {
          conversation_id: managerConversationId,
          role: 'user',
          content: content || (attachmentMeta ? '[Image]' : '(empty)'),
          id: messageId,
          ...(attachmentMeta ? { metadata: { attachments: attachmentMeta } } : {}),
        }
        const saveMsg = async (attempt = 1) => {
          try {
            const res = await fetch('/api/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(savePayload),
            })
            if (!res.ok && attempt < 2) {
              console.warn(`[MessageSave] Attempt ${attempt} failed (${res.status}), retrying...`)
              await new Promise(r => setTimeout(r, 1000))
              return saveMsg(attempt + 1)
            }
            if (!res.ok) {
              console.error(`[MessageSave] Failed after ${attempt} attempts (${res.status})`)
              toast.error('Message may not have been saved. Check your connection.')
            }
          } catch (err) {
            if (attempt < 2) {
              console.warn('[MessageSave] Network error, retrying...', err)
              await new Promise(r => setTimeout(r, 1000))
              return saveMsg(attempt + 1)
            }
            console.error('[MessageSave] Failed after retry:', err)
            toast.error('Message may not have been saved. Check your connection.')
          }
        }
        await saveMsg()

        // Get AI response
        setIsLoading(false)
        setIsStreaming(true)
        setStreamingContent('')
        setThinkingContent('')
        setIsThinking(false)
        setAiState(null)
        setExecutingTool(null)
        setActivitySteps([])
        activityStepsRef.current = []
        pendingSetupCardRef.current = null

        // ── Client-side plan-first detection ──────────────────────────────
        // Mirror the server's isPlanFirstRequest logic so the planning UI
        // appears immediately before the first SSE event arrives.
        const msgLower = content.toLowerCase()
        const _hasCompanyCtx = /\b(my company|our company|my business|our business)\b/i.test(content) || /\b\w+\.(com|dev|io|co|ai|se|net|org|app|xyz)\b/i.test(content)
        const _hasLeadIntent = /\b(lead|leads|prospect|prospects|customer|customers|client|clients|companies|contacts)\b/i.test(msgLower)
        const _hasDest = /\b(attio|hubspot|salesforce|pipedrive|notion|sheets|airtable|monday|asana|jira|linear|clickup|crm|spreadsheet)\b/i.test(msgLower)
        const _hasEnrich = /\b(enrich|qualify|score|dedupe|deduplicate|validate|verify)\b/i.test(msgLower)
        const _isPlanFirst = (_hasCompanyCtx && _hasLeadIntent) || (_hasLeadIntent && _hasDest) || (_hasLeadIntent && _hasEnrich) || (_hasDest && /\b(find|research|monitor|add|save|collect)\b/i.test(msgLower))

        if (_isPlanFirst) {
          const earlySteps: Array<{ id: string; label: string; status: string; kind: string }> = [
            { id: 'plan-init', label: 'Understanding your request', status: 'active', kind: 'plan' },
          ]
          if (_hasCompanyCtx) earlySteps.push({ id: 'plan-company', label: 'Analyzing your company', status: 'pending', kind: 'plan' })
          if (_hasLeadIntent) earlySteps.push({ id: 'plan-icp', label: 'Deriving ideal customer profile', status: 'pending', kind: 'plan' })
          if (_hasDest) earlySteps.push({ id: 'plan-integration', label: 'Checking integration readiness', status: 'pending', kind: 'plan' })
          if (_hasEnrich) earlySteps.push({ id: 'plan-enrich', label: 'Setting up enrichment workflow', status: 'pending', kind: 'plan' })
          earlySteps.push({ id: 'plan-compile', label: 'Compiling operation plan', status: 'pending', kind: 'plan' })
          activityStepsRef.current = earlySteps as any
          setActivitySteps(earlySteps as any)
        }
        // Send recent messages for context (last 10) — only LLM-safe roles
        const currentMessages = useChatStore.getState().messages
        const recentMessages: Array<{ role: string; content: string | object[] }> = [
          ...currentMessages.filter(m => m.role === 'user' || m.role === 'assistant').slice(-9),
          userMessage,
        ].map(m => ({
          role: m.role,
          content: m.content,
        }))

        // If images are attached, format the last message with image content
        if (images && images.length > 0) {
          const lastMsg = recentMessages[recentMessages.length - 1]
          const imageContent = images.map(img => ({
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: img.mediaType,
              data: img.base64,
            },
          }))
          lastMsg.content = [
            ...imageContent,
            { type: 'text' as const, text: content || 'What is in this image?' },
          ]
        }

        lastUsageRef.current = null

        // Generate a stable UUID shared between client and server.
        // The server inserts a placeholder message using this ID so state survives
        // a page refresh. We also prime streamingMessageIdRef here so text chunks
        // update this same record instead of creating a second orphan message.
        const assistantPlaceholderId = crypto.randomUUID()
        recentlySentIdsRef.current.set(assistantPlaceholderId, Date.now())
        streamingMessageIdRef.current = assistantPlaceholderId
        setStreamingMessageId(assistantPlaceholderId)
        addMessage({
          id: assistantPlaceholderId,
          conversation_id: managerConversationId,
          role: 'assistant',
          content: '',
          metadata: { type: 'manager_turn', status: 'running', started_at: new Date().toISOString() },
          created_at: new Date().toISOString(),
        })

        console.log('[handleSend] Calling streamChat with', recentMessages.length, 'messages')
        const { output } = await streamChat(recentMessages, managerConversationId, model, assistantPlaceholderId)
        console.log('[handleSend] streamChat returned, reading stream...')

        let fullContent = ''
        let deltaCount = 0
        let hadError = false

        for await (const delta of readStreamableValue(output)) {
          if (!delta) continue
          deltaCount++

          try {
                const parsed = JSON.parse(delta)
                
                // Check for error events from the stream
                if (parsed.type === 'error') {
                  console.error('[Stream] Error event received:', parsed.message)
                  hadError = true
                  if (parsed.isTimeout) {
                    toast.error('Request timed out — this task took longer than expected. Try again and it should pick up faster.', { duration: 8000 })
                  } else {
                    toast.error(parsed.message || 'An error occurred')
                  }
                  break
                }
                if (process.env.NODE_ENV !== 'production') console.log('[Stream] Event:', parsed.type || (parsed.text ? 'text' : 'unknown'), parsed.type === 'ai_state' ? parsed.state : '')
                if (parsed.type === 'ai_state') {
                  const nextState = parsed.state as AIState
                  setAiState({
                    state: nextState,
                    context: typeof parsed.context === 'string' ? parsed.context : undefined,
                    metadata: (parsed.metadata || undefined) as AIStateMetadata | undefined,
                    startTime: typeof parsed.startTime === 'number' ? parsed.startTime : Date.now(),
                  })

                  // Update activity steps based on state transitions
                  // Compute new steps synchronously first
                  const currentSteps = activityStepsRef.current
                  let newSteps = [...currentSteps]
                  
                  // Mark previous active step as complete when state changes
                  const activeIndex = newSteps.findIndex(s => s.status === 'active')
                  if (activeIndex >= 0 && nextState !== 'thinking') {
                    newSteps[activeIndex] = { ...newSteps[activeIndex], status: 'complete' }
                  }
                  
                  // Capture thinking content for the step description
                  const currentThinking = thinkingContentRef.current.trim()
                  
                  // Add new step based on state
                  if (nextState === 'browsing' && parsed.context) {
                    const url = parsed.metadata?.url || parsed.context
                    const hostname = (() => {
                      try {
                        return new URL(url).hostname.replace(/^www\./, '')
                      } catch {
                        return url
                      }
                    })()
                    const existingBrowse = newSteps.find(s => s.kind === 'browse' && s.data?.url === url)
                    if (!existingBrowse) {
                      newSteps.push({
                        id: `browse-${Date.now()}`,
                        label: `Browsing ${hostname}`,
                        description: currentThinking || undefined,
                        status: 'active',
                        kind: 'browse',
                        data: { url }
                      })
                    }
                  } else if (nextState === 'searching' && parsed.context) {
                    const query = parsed.metadata?.query || parsed.context
                    const existingSearch = newSteps.find(s => s.kind === 'search' && s.data?.query === query)
                    if (!existingSearch) {
                      newSteps.push({
                        id: `search-${Date.now()}`,
                        label: query,
                        description: currentThinking || undefined,
                        status: 'active',
                        kind: 'search',
                        data: { 
                          query,
                          results: parsed.metadata?.results as string[] | undefined
                        }
                      })
                    }
                  } else if (nextState === 'working') {
                    const existingWork = newSteps.find(s => s.kind === 'work')
                    if (!existingWork) {
                      newSteps.push({
                        id: `work-${Date.now()}`,
                        label: parsed.context || 'Working...',
                        description: currentThinking || undefined,
                        status: 'active',
                        kind: 'work'
                      })
                    }
                  } else if (nextState === 'thinking' && !newSteps.some(s => s.status === 'active')) {
                    // Add a thinking step if nothing is active
                    newSteps.push({
                      id: `think-${Date.now()}`,
                      label: 'Processing...',
                      description: currentThinking || undefined,
                      status: 'active',
                      kind: 'thinking'
                    })
                  } else if (nextState === 'idle') {
                    // Mark all active steps as complete
                    newSteps = newSteps.map(s => s.status === 'active' ? { ...s, status: 'complete' } : s)
                  }
                  
                  // Update ref immediately (synchronous)
                  activityStepsRef.current = newSteps
                  // Trigger React state update (may be batched)
                  setActivitySteps(newSteps)

                  // Track thinking state for UI
                  if (nextState === 'thinking') {
                    setIsThinking(true)
                  } else if (nextState === 'idle') {
                    setIsThinking(false)
                  } else {
                    // For other states (browsing, searching, working), we're not thinking
                    setIsThinking(false)
                  }
                } else if (parsed.type === 'cot_step') {
                  // Handle explicit chain-of-thought step events
                  const step: ActivityStep = {
                    id: parsed.id || `step-${Date.now()}`,
                    label: parsed.label || 'Working...',
                    description: parsed.description,
                    status: parsed.status || 'active',
                    kind: parsed.kind || 'thinking',
                    data: parsed.data
                  }
                  setActivitySteps(prev => {
                    const existing = prev.findIndex(s => s.id === step.id)
                    if (existing >= 0) {
                      // Update existing step
                      const updated = [...prev]
                      updated[existing] = step
                      return updated
                    }
                    // Add new step
                    return [...prev, step]
                  })
                } else if (parsed.type === 'activity_step_upsert') {
                  // Handle new structured activity step from server
                  const step = parsed.step as ActivityStep
                  if (step?.id) {
                    const steps = [...activityStepsRef.current]
                    const existing = steps.findIndex(s => s.id === step.id)
                    if (existing >= 0) {
                      steps[existing] = { ...steps[existing], ...step }
                    } else {
                      steps.push(step)
                    }
                    activityStepsRef.current = steps
                    setActivitySteps(steps)
                  }
                } else if (parsed.type === 'activity_step_patch') {
                  // Handle partial update to an existing activity step
                  const { stepId, patch } = parsed as { stepId: string; patch: Partial<ActivityStep> }
                  if (stepId && patch) {
                    const steps = [...activityStepsRef.current]
                    const idx = steps.findIndex(s => s.id === stepId)
                    if (idx >= 0) {
                      steps[idx] = { ...steps[idx], ...patch, data: { ...steps[idx].data, ...patch.data } }
                      // Merge sources into data.results_v2 for backward compatibility
                      if ((patch as any).sources && Array.isArray((patch as any).sources)) {
                        steps[idx].data = {
                          ...steps[idx].data,
                          results_v2: (patch as any).sources,
                        }
                      }
                      activityStepsRef.current = steps
                      setActivitySteps(steps)
                    }
                  }
                } else if (parsed.type === 'complexity') {
                  // Handle complexity detection for adaptive UI
                  const level = parsed.level as 'simple' | 'medium' | 'complex'
                  const shouldShow = parsed.shouldShowThinking as boolean
                  setComplexity({ level, shouldShowThinking: shouldShow })
                } else if (parsed.type === 'progress_update') {
                  // progress_update = operational activity (tool calls, API status, etc.)
                  // Do NOT feed into thinkingContent — that is reserved for actual model reasoning.
                  // The AI state and activity steps already handle operational progress display.
                } else if (parsed.type === 'thinking_start') {
                  setIsThinking(true)
                } else if (parsed.type === 'thinking') {
                  if (typeof parsed.thinking === 'string' && parsed.thinking) {
                    // Update both state and ref
                    setThinkingContent(prev => {
                      const next = prev + parsed.thinking
                      thinkingContentRef.current = next
                      return next
                    })
                    // Also accumulate in persistent ref (never cleared during streaming)
                    allThinkingContentRef.current += parsed.thinking
                  }
                } else if (parsed.text) {
                  // Accumulate in ref, flush at ~30fps to reduce rerenders
                  fullContent += parsed.text
                  streamingContentRef.current = fullContent
                  // Track content as it arrives to prevent realtime duplicate race
                  pendingAssistantContentRef.current = fullContent.trim()
                  // On first text chunk, insert the message into the store so it renders progressively
                  if (!streamingMessageIdRef.current && managerConversationId) {
                    const msgId = crypto.randomUUID()
                    streamingMessageIdRef.current = msgId
                    setStreamingMessageId(msgId)
                    addMessage({
                      id: msgId,
                      conversation_id: managerConversationId,
                      role: 'assistant',
                      content: fullContent,
                      metadata: {},
                      created_at: new Date().toISOString(),
                    })
                  }
                  flushStreamingContent()
                } else if (parsed.type === 'error') {
                  console.error('[Stream] Server error:', parsed.message)
                  toast.error(parsed.message || 'An error occurred while generating the response.')
                } else if (parsed.type === 'tool_call') {
                  // ai_state events are authoritative for UI; tool_call is kept for compatibility
                } else if (parsed.type === 'integration_setup') {
                  // Store card data — it will be attached to the final text message as setup_card
                  // so it renders BELOW the assistant text, not as a separate preceding message
                  pendingSetupCardRef.current = {
                    connector_id: parsed.connector_id as string,
                    connector_name: parsed.connector_name as string,
                    fields: parsed.fields as unknown[],
                    logo_url: (parsed.logo_url as string | null) || null,
                  }
                } else if (parsed.type === 'mission_proposal') {
                  const proposal = parsed.proposal as { goal: string; why: string; first_steps: string; autonomy_level: string; tick_timebox_minutes: number }
                  const cardMsg: Message = {
                    id: `mission-proposal-${Date.now()}`,
                    conversation_id: managerConversationId!,
                    role: 'assistant',
                    content: '',
                    metadata: { type: 'mission_proposal', proposal },
                    created_at: new Date().toISOString(),
                  }
                  addMessage(cardMsg)
                } else if (parsed.type === 'mission_started') {
                  const mission = parsed.mission as { id: string; goal: string; status: string; next_tick_at: string }
                  toast.success(`Mission started: "${mission.goal.slice(0, 50)}${mission.goal.length > 50 ? '…' : ''}"`)
                  const cardMsg: Message = {
                    id: `mission-started-${mission.id}`,
                    conversation_id: managerConversationId!,
                    role: 'assistant',
                    content: '',
                    metadata: { type: 'mission_started', mission },
                    created_at: new Date().toISOString(),
                  }
                  addMessage(cardMsg)
                } else if (parsed.type === 'mission_paused') {
                  toast.success('Mission paused')
                } else if (parsed.type === 'mission_resumed') {
                  toast.success('Mission resumed')
                } else if (parsed.type === 'mission_status') {
                  // Let AI describe the status — no special card needed
                } else if (parsed.type === 'used_memories') {
                  lastMemoryLabelsRef.current = parsed.memories as Array<{ type: string; label: string }>
                } else if (parsed.type === 'usage') {
                  lastUsageRef.current = {
                    inputTokens: parsed.inputTokens as number,
                    outputTokens: parsed.outputTokens as number,
                    creditsUsed: parsed.creditsUsed as number,
                    model: parsed.model as string,
                  }
                } else if (parsed.type === 'agent_handoff' && managerConversationId) {
                  // Insert a persistent in-progress card that survives after the stream ends.
                  // This gives the user visible confirmation the agent is queued/running,
                  // and the card will update to completed/failed when the run finishes.
                  const handoffId = crypto.randomUUID()
                  const handoffMeta = {
                    type: 'agent_handoff' as const,
                    agentId: parsed.agentId as string,
                    agentName: parsed.agentName as string,
                    scheduleType: parsed.scheduleType as string,
                    status: 'queued' as const,
                    _selfInserted: true,
                  }
                  const handoffMsg: Message = {
                    id: handoffId,
                    conversation_id: managerConversationId,
                    role: 'assistant',
                    content: '',
                    metadata: handoffMeta,
                    created_at: new Date().toISOString(),
                  }
                  addMessage(handoffMsg)
                  supabase.from('messages').insert({
                    id: handoffId,
                    conversation_id: managerConversationId,
                    role: 'assistant',
                    content: '',
                    metadata: handoffMeta,
                  } as never).then(({ error }: { error: unknown }) => {
                    if (error) console.error('[Chat] Failed to persist handoff card:', error)
                  })
                } else if (parsed.type === 'tool_result') {
                  setExecutingTool(null)
                  
                  if (parsed.tool === 'create_agent') {
                    toast.success(`${parsed.agentName || 'Agent'} is starting up`)
                    if (parsed.agent) {
                      useChatStore.getState().addAgent(parsed.agent)
                    }
                    if (activeWorkspace?.id) {
                      fetch(`/api/agents?workspaceId=${activeWorkspace.id}`)
                        .then(res => res.ok ? res.json() : null)
                        .then(data => {
                          if (data?.agents) {
                            setAgents(data.agents)
                          }
                        })
                        .catch(() => {})
                    }
                  } else if (parsed.tool === 'delete_agent') {
                    if (parsed.agentId) {
                      useChatStore.getState().deleteAgent(parsed.agentId)
                    }
                    if (parsed.agentName) {
                      toast.success(`Agent "${parsed.agentName}" deleted`)
                    }
                  } else if (parsed.tool === 'delete_all_agents') {
                    const deletedAgents = parsed.deletedAgents as Array<{ id: string; name: string }> | undefined
                    if (deletedAgents && deletedAgents.length > 0) {
                      for (const agent of deletedAgents) {
                        useChatStore.getState().deleteAgent(agent.id)
                      }
                      toast.success(`${deletedAgents.length} agent${deletedAgents.length > 1 ? 's' : ''} deleted`)
                    }
                  } else if (parsed.tool === 'update_agent') {
                    if (parsed.agentId && parsed.updates) {
                      useChatStore.getState().updateAgent(parsed.agentId, parsed.updates)
                    }
                  } else if (parsed.tool === 'set_ai_name') {
                    toast.success(`Nice to meet you! I'll remember that my name is ${parsed.name}`)
                    if (parsed.name) setWorkspaceAiName(parsed.name as string)
                  }
                  
                  // Capture search/browse results into activity steps for ThinkingDisplay search bar
                  if (parsed.tool === 'web_search' && parsed.result === 'success' && parsed.data) {
                    const searchData = parsed.data as { query?: string; abstract?: string; abstractSource?: string; abstractURL?: string; relatedTopics?: Array<{ text?: string; url?: string; title?: string }> }
                    const results: Array<{ title: string; url?: string; description?: string }> = []
                    
                    if (searchData.abstract && searchData.abstractURL) {
                      results.push({
                        title: searchData.abstractSource || 'Search Result',
                        url: searchData.abstractURL,
                        description: searchData.abstract,
                      })
                    }
                    searchData.relatedTopics?.forEach(topic => {
                      if (topic.url) {
                        results.push({
                          title: topic.title || topic.text?.slice(0, 80) || 'Related',
                          url: topic.url,
                          description: topic.text,
                        })
                      }
                    })
                    
                    if (results.length > 0) {
                      const steps = [...activityStepsRef.current]
                      // Find the latest search step and add results_v2
                      for (let i = steps.length - 1; i >= 0; i--) {
                        if (steps[i].kind === 'search') {
                          steps[i] = {
                            ...steps[i],
                            status: 'complete',
                            data: { ...steps[i].data, results_v2: results }
                          }
                          break
                        }
                      }
                      activityStepsRef.current = steps
                      setActivitySteps(steps)
                    }
                  } else if (parsed.tool === 'analyze_url' && parsed.result === 'success' && parsed.data) {
                    const urlData = parsed.data as { url?: string; title?: string; description?: string }
                    if (urlData.url) {
                      const result = {
                        title: urlData.title || urlData.url,
                        url: urlData.url,
                        description: urlData.description || undefined,
                      }
                      const steps = [...activityStepsRef.current]
                      // Find latest browse step and add results_v2
                      for (let i = steps.length - 1; i >= 0; i--) {
                        if (steps[i].kind === 'browse') {
                          const existing = steps[i].data?.results_v2 || []
                          steps[i] = {
                            ...steps[i],
                            status: 'complete',
                            data: { ...steps[i].data, results_v2: [...existing, result] }
                          }
                          break
                        }
                      }
                      activityStepsRef.current = steps
                      setActivitySteps(steps)
                    }
                  }
                }
          } catch (parseErr) {
            console.warn('[Stream] Parse error:', parseErr, 'delta:', delta?.slice(0, 100))
          }
        }

        console.log('[Stream] Done. deltaCount:', deltaCount, 'fullContent length:', fullContent.length, 'hadError:', hadError)
        
        // If we got no content and no error was shown, something failed silently
        if (!fullContent.trim() && !hadError && deltaCount === 0) {
          console.error('[Stream] No content received from AI - silent failure detected')
          toast.error('No response received from AI. Please check the console and try again.')
          throw new Error('No content received from stream')
        }

        // Handle tool-only streams that produced deltas but no final text content.
        // Patch the manager_turn placeholder so it doesn't stay stuck as 'running'.
        if (!fullContent.trim() && deltaCount > 0 && !hadError) {
          console.warn('[Stream] Tool-only response — no final text. deltaCount:', deltaCount)
          const finalActivitySteps = activityStepsRef.current
          const finalThinking = allThinkingContentRef.current
          const capturedSetupCard = pendingSetupCardRef.current
          pendingSetupCardRef.current = null
          if (streamingMessageIdRef.current) {
            const completedMeta = JSON.parse(JSON.stringify({
              type: 'manager_turn',
              status: 'completed',
              ...(finalThinking ? { thinking_content: finalThinking } : {}),
              ...(finalActivitySteps.length > 0 ? { activity_trace_v2: finalActivitySteps } : {}),
              ...(capturedSetupCard ? { setup_card: capturedSetupCard } : {}),
            }))
            patchMessage(streamingMessageIdRef.current, {
              content: '',
              metadata: completedMeta,
            })
            locallyFinalizedRef.current.add(streamingMessageIdRef.current)
          }
        }
        
        if (fullContent.trim()) {
          pendingAssistantContentRef.current = fullContent.trim()
          // Capture thinkingContent and activitySteps from persistent ref (never cleared during phase transitions)
          const finalThinking = allThinkingContentRef.current
          const finalActivitySteps = activityStepsRef.current
          if (process.env.NODE_ENV !== 'production') console.log('[Stream] finalThinking length:', finalThinking.length, 'preview:', finalThinking.slice(0, 100))
          const capturedUsage = lastUsageRef.current
          const capturedMemoryLabels = lastMemoryLabelsRef.current
          const capturedSetupCard = pendingSetupCardRef.current
          pendingSetupCardRef.current = null
          const finalMetadata = JSON.parse(JSON.stringify({
            ...(finalThinking ? { thinking_content: finalThinking } : {}),
            ...(finalActivitySteps.length > 0 ? { activity_trace: finalActivitySteps } : {}),
            ...(finalActivitySteps.length > 0 ? { activity_trace_v2: finalActivitySteps } : {}),
            ...(capturedUsage ? { usage: capturedUsage } : {}),
            ...(capturedMemoryLabels && capturedMemoryLabels.length > 0 ? { memory_labels: capturedMemoryLabels } : {}),
            ...(capturedSetupCard ? { setup_card: capturedSetupCard } : {}),
          }))
          if (streamingMessageIdRef.current) {
            // Message already in store — patch it with final content + metadata in one update
            patchMessage(streamingMessageIdRef.current, { content: fullContent, metadata: finalMetadata })
            // Mark as locally finalized so the realtime DB UPDATE does not overwrite this content
            locallyFinalizedRef.current.add(streamingMessageIdRef.current)
          } else {
            // Fallback: no streaming message was inserted (tool-only or very fast responses)
            const assistantId = crypto.randomUUID()
            addMessage({
              id: assistantId,
              conversation_id: managerConversationId,
              role: 'assistant',
              content: fullContent,
              metadata: finalMetadata,
              created_at: new Date().toISOString(),
            })
          }

          // Persist thinking metadata to DB via API PATCH (uses admin client to bypass RLS)
          if (finalThinking || finalActivitySteps.length > 0) {
            const metadataToSave = JSON.parse(JSON.stringify({
              ...(finalThinking ? { thinking_content: finalThinking } : {}),
              ...(finalActivitySteps.length > 0 ? { activity_trace: finalActivitySteps } : {}),
              ...(finalActivitySteps.length > 0 ? { activity_trace_v2: finalActivitySteps } : {}),
            }))
            console.log('[Metadata persist] Will save:', Object.keys(metadataToSave), 'activity_trace steps:', finalActivitySteps.length)
            
            const persistMetadata = async (attempt = 1): Promise<void> => {
              try {
                const res = await fetch('/api/messages', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    conversation_id: managerConversationId,
                    metadata: metadataToSave
                  }),
                })
                const data = await res.json()
                if (!res.ok) {
                  if (attempt < 6) {
                    console.warn(`[Metadata persist] Attempt ${attempt} failed (${res.status}): ${data.error}, retrying in ${attempt}s...`)
                    setTimeout(() => persistMetadata(attempt + 1), attempt * 1000)
                  } else {
                    console.error('[Metadata persist] Failed after 6 attempts:', data.error)
                  }
                } else {
                  console.log('[Metadata persist] Success on attempt', attempt, 'msgId:', data.messageId)
                }
              } catch (err) {
                if (attempt < 6) {
                  console.warn(`[Metadata persist] Attempt ${attempt} error:`, err)
                  setTimeout(() => persistMetadata(attempt + 1), attempt * 1000)
                } else {
                  console.error('[Metadata persist] Failed after 6 attempts:', err)
                }
              }
            }
            // Start after short delay to ensure server has saved the message
            setTimeout(() => persistMetadata(1), 1000)
          }
        }
        // Clear streaming state — cancel any pending RAF flush first
        if (streamingFlushRafRef.current !== null) { cancelAnimationFrame(streamingFlushRafRef.current); streamingFlushRafRef.current = null }
        streamingContentRef.current = ''
        streamingMessageIdRef.current = null
        setStreamingMessageId(null)
        setIsStreaming(false)
        setStreamingContent('')
        setThinkingContent('')
        thinkingContentRef.current = ''
        allThinkingContentRef.current = ''
        setIsThinking(false)
        setAiState(null)
        setExecutingTool(null)
        setActivitySteps([])
        activityStepsRef.current = []
        setComplexity(null)
      } catch (error) {
        console.error('[Stream] Error:', error)
        // Patch the manager_turn placeholder to 'failed' so it doesn't stay stuck as 'running'
        if (streamingMessageIdRef.current) {
          patchMessage(streamingMessageIdRef.current, {
            content: '',
            metadata: JSON.parse(JSON.stringify({ type: 'manager_turn', status: 'failed' })),
          })
          locallyFinalizedRef.current.add(streamingMessageIdRef.current)
        }
        // Add inline error message with retry instead of just a toast
        const errorMsg: Message = {
          id: `error-${Date.now()}`,
          conversation_id: managerConversationId,
          role: 'assistant',
          content: 'Sorry, I couldn\'t generate a response. Please try sending your message again.',
          metadata: { type: 'error' },
          created_at: new Date().toISOString(),
        }
        addMessage(errorMsg)
        if (streamingFlushRafRef.current !== null) { cancelAnimationFrame(streamingFlushRafRef.current); streamingFlushRafRef.current = null }
        streamingContentRef.current = ''
        streamingMessageIdRef.current = null
        setStreamingMessageId(null)
        setIsLoading(false)
        setStreamingContent('')
        setThinkingContent('')
        thinkingContentRef.current = ''
        allThinkingContentRef.current = ''
        setIsThinking(false)
        setAiState(null)
        setExecutingTool(null)
        setActivitySteps([])
        activityStepsRef.current = []
        setComplexity(null)
        setIsStreaming(false)
      }
    },
    [
      user,
      router,
      managerConversationId,
      messages,
      setIsLoading,
      setIsStreaming,
      addMessage,
      patchMessage,
    ]
  )

  // Drain the pending message queue as soon as streaming finishes.
  // This handles all exit paths: natural completion, error, and manual stop.
  useEffect(() => {
    if (!isStreaming && pendingQueueRef.current.length > 0) {
      const next = pendingQueueRef.current.shift()!
      handleSend(next.content, next.images)
    }
  }, [isStreaming, handleSend])

  const handleSlashCommand = useCallback(async (cmd: string) => {
    if (cmd === '/new') {
      if (!activeWorkspace?.id || !user) return
      try {
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: MANAGER_CONVERSATION_TITLE, workspaceId: activeWorkspace.id }),
        })
        if (res.ok) {
          const newConv = await res.json() as { id: string }
          setManagerConversationId(newConv.id)
          setMessages([])
          setHasMoreMessages(false)
          hasGreetedRef.current = false
          toast.success('Started a fresh conversation')
        }
      } catch { toast.error('Failed to start new conversation') }
    } else if (cmd === '/compact') {
      if (!managerConversationId) return
      try {
        toast.info('Compacting conversation...')
        const res = await fetch(`/api/conversations/${managerConversationId}/compact`, { method: 'POST' })
        if (res.ok) {
          const data = await res.json() as { summary?: string; removed?: number }
          // Reload messages after compaction
          const msgRes = await fetch(`/api/messages?conversation_id=${managerConversationId}&limit=20`)
          if (msgRes.ok) {
            const msgData = await msgRes.json() as { messages: Message[]; hasMore: boolean }
            setMessages(msgData.messages)
            setHasMoreMessages(msgData.hasMore ?? false)
          }
          toast.success(`Compacted — removed ${data.removed ?? 'old'} messages`)
        } else {
          toast.error('Compaction failed')
        }
      } catch { toast.error('Failed to compact') }
    } else if (cmd === '/status') {
      try {
        const [missionsRes, agentsRes] = await Promise.all([
          fetch('/api/missions?status=active'),
          fetch('/api/agents?status=working&limit=5'),
        ])
        const missionsData = missionsRes.ok ? await missionsRes.json() as { missions: Array<{ id: string; goal: string }> } : { missions: [] }
        const agentsData = agentsRes.ok ? await agentsRes.json() as { agents: Array<{ id: string; name: string; status: string }> } : { agents: [] }
        const missionList = missionsData.missions.slice(0, 3).map((m: { goal: string }) => `• ${m.goal}`).join('\n')
        const agentList = agentsData.agents.slice(0, 5).map((a: { name: string; status: string }) => `• ${a.name} (${a.status})`).join('\n')
        const statusContent = [
          `**Workspace Status**`,
          '',
          `**Active missions (${missionsData.missions.length}):**`,
          missionList || '  None',
          '',
          `**Running agents (${agentsData.agents.length}):**`,
          agentList || '  None',
        ].join('\n')
        const statusMsg: Message = {
          id: `status-${Date.now()}`,
          conversation_id: managerConversationId ?? '',
          role: 'assistant',
          content: statusContent,
          metadata: { type: 'status_report' },
          created_at: new Date().toISOString(),
        }
        addMessage(statusMsg)
      } catch { toast.error('Failed to fetch status') }
    } else if (cmd === '/agents') {
      try {
        const res = await fetch('/api/agents?limit=20')
        const data = res.ok ? await res.json() as { agents: Array<{ name: string; status: string; type: string }> } : { agents: [] }
        const lines = data.agents.length > 0
          ? data.agents.map((a: { name: string; status: string }) => `• **${a.name}** — ${a.status}`).join('\n')
          : 'No agents created yet.'
        addMessage({
          id: `agents-${Date.now()}`,
          conversation_id: managerConversationId ?? '',
          role: 'assistant',
          content: `**Your Agents (${data.agents.length})**\n\n${lines}`,
          metadata: { type: 'status_report' },
          created_at: new Date().toISOString(),
        })
      } catch { toast.error('Failed to fetch agents') }
    } else if (cmd === '/missions') {
      try {
        const res = await fetch('/api/missions?status=active')
        const data = res.ok ? await res.json() as { missions: Array<{ goal: string; status: string; last_tick_at: string | null; goal_tree?: { projects: Array<{ tasks: Array<{ status: string }> }> } }> } : { missions: [] }
        const lines = data.missions.length > 0
          ? data.missions.map((m: { goal: string; status: string; goal_tree?: { projects: Array<{ tasks: Array<{ status: string }> }> } }) => {
              const gt = m.goal_tree
              const total = gt ? gt.projects.reduce((s, p) => s + p.tasks.length, 0) : 0
              const done = gt ? gt.projects.reduce((s, p) => s + p.tasks.filter(t => t.status === 'completed').length, 0) : 0
              const pct = total > 0 ? Math.round((done / total) * 100) : 0
              return `• **${m.goal.slice(0, 80)}** — ${m.status}${total > 0 ? ` (${pct}%)` : ''}`
            }).join('\n')
          : 'No active missions.'
        addMessage({
          id: `missions-${Date.now()}`,
          conversation_id: managerConversationId ?? '',
          role: 'assistant',
          content: `**Active Missions (${data.missions.length})**\n\n${lines}`,
          metadata: { type: 'status_report' },
          created_at: new Date().toISOString(),
        })
      } catch { toast.error('Failed to fetch missions') }
    } else if (cmd === '/memory') {
      try {
        const res = await fetch('/api/memory?limit=20')
        const data = res.ok ? await res.json() as { memories: Array<{ content: string; memory_type: string }> } : { memories: [] }
        const lines = data.memories.length > 0
          ? data.memories.map((m: { content: string; memory_type: string }) => `• **${m.memory_type.replace('_', ' ')}**: ${m.content}`).join('\n')
          : 'No memories stored yet. Chat with me and I\'ll start learning!'
        addMessage({
          id: `memory-${Date.now()}`,
          conversation_id: managerConversationId ?? '',
          role: 'assistant',
          content: `**What I Remember About You**\n\n${lines}`,
          metadata: { type: 'status_report' },
          created_at: new Date().toISOString(),
        })
      } catch { toast.error('Failed to fetch memories') }
    } else if (cmd === '/doctor') {
      try {
        const checks: Array<{ label: string; status: '✅' | '⚠️' | '❌'; detail: string }> = []

        // Check workspace credits
        const creditsVal = activeWorkspace?.credits ?? 0
        checks.push({
          label: 'Credits',
          status: creditsVal > 100 ? '✅' : creditsVal > 0 ? '⚠️' : '❌',
          detail: creditsVal > 100 ? `${creditsVal} credits available` : creditsVal > 0 ? `Low: ${creditsVal} credits remaining` : 'No credits — agents cannot run',
        })

        // Check agents
        const agentsRes = await fetch('/api/agents?limit=50')
        const agentsData = agentsRes.ok ? await agentsRes.json() as { agents: Array<{ status: string; name: string }> } : { agents: [] }
        const working = agentsData.agents.filter((a: { status: string }) => a.status === 'working').length
        const failed = agentsData.agents.filter((a: { status: string }) => a.status === 'failed').length
        checks.push({
          label: 'Agents',
          status: failed > 0 ? '⚠️' : '✅',
          detail: `${agentsData.agents.length} total, ${working} working${failed > 0 ? `, ${failed} failed` : ''}`,
        })

        // Check missions
        const missionsRes = await fetch('/api/missions?status=active')
        const missionsData = missionsRes.ok ? await missionsRes.json() as { missions: Array<{ goal: string; next_tick_at: string | null }> } : { missions: [] }
        const overdue = missionsData.missions.filter((m: { next_tick_at: string | null }) => m.next_tick_at && new Date(m.next_tick_at).getTime() < Date.now()).length
        checks.push({
          label: 'Missions',
          status: overdue > 0 ? '⚠️' : '✅',
          detail: `${missionsData.missions.length} active${overdue > 0 ? `, ${overdue} overdue` : ''}`,
        })

        // Check integrations
        try {
          const intRes = await fetch('/api/integrations/connections')
          const intData = intRes.ok ? await intRes.json() as { connections: Array<{ provider: string; status: string }> } : { connections: [] }
          const active = intData.connections.filter((c: { status: string }) => c.status === 'active').length
          checks.push({
            label: 'Integrations',
            status: active > 0 ? '✅' : '⚠️',
            detail: active > 0 ? `${active} connected` : 'No integrations connected',
          })
        } catch {
          checks.push({ label: 'Integrations', status: '✅', detail: 'No integrations configured' })
        }

        // Check conversation
        checks.push({
          label: 'Conversation',
          status: managerConversationId ? '✅' : '⚠️',
          detail: managerConversationId ? `Active (${messages.length} messages)` : 'No active conversation',
        })

        const allGood = checks.every(c => c.status === '✅')
        const content = [
          `**🩺 Workspace Health Check**`,
          '',
          ...checks.map(c => `${c.status} **${c.label}** — ${c.detail}`),
          '',
          allGood ? '**All systems operational.** Your workspace is healthy.' : '**Some items need attention.** Review the warnings above.',
        ].join('\n')

        addMessage({
          id: `doctor-${Date.now()}`,
          conversation_id: managerConversationId ?? '',
          role: 'assistant',
          content,
          metadata: { type: 'status_report' },
          created_at: new Date().toISOString(),
        })
      } catch { toast.error('Health check failed') }
    } else if (cmd === '/think') {
      // Toggle deep thinking mode
      const currentModel = model
      const isDeepThinking = currentModel.includes('think') || currentModel.includes('reasoning')
      // For now, show a message about the current thinking mode
      addMessage({
        id: `think-${Date.now()}`,
        conversation_id: managerConversationId ?? '',
        role: 'assistant',
        content: `**💭 Thinking Mode**\n\nDeep thinking is currently **${complexity?.shouldShowThinking ? 'active' : 'adaptive'}**.\n\nThe AI automatically adjusts reasoning depth based on your question complexity:\n• **Simple questions** → fast, direct answers\n• **Complex questions** → extended reasoning with step-by-step thinking\n\nFor complex tasks, try phrasing your request with more detail to trigger deeper analysis.`,
        metadata: { type: 'status_report' },
        created_at: new Date().toISOString(),
      })
    }
  }, [activeWorkspace, user, managerConversationId, setManagerConversationId, setMessages, setHasMoreMessages, addMessage, messages, model, complexity])

  const handlePageDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    pageDragCounterRef.current += 1
    setIsPageDragging(true)
  }, [])

  const handlePageDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    pageDragCounterRef.current -= 1
    if (pageDragCounterRef.current <= 0) {
      pageDragCounterRef.current = 0
      setIsPageDragging(false)
    }
  }, [])

  const handlePageDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) e.preventDefault()
  }, [])

  const handlePageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    pageDragCounterRef.current = 0
    setIsPageDragging(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length === 0) return
    const newImages: ImageAttachment[] = []
    let loaded = 0
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]
        newImages.push({ base64, mediaType: file.type as ImageAttachment['mediaType'], name: file.name })
        loaded += 1
        if (loaded === files.length) {
          setPageDragImages([...newImages])
        }
      }
      reader.readAsDataURL(file)
    })
  }, [])

  return (
    <div
      className="flex flex-col h-full overflow-hidden relative"
      onDragEnter={handlePageDragEnter}
      onDragLeave={handlePageDragLeave}
      onDragOver={handlePageDragOver}
      onDrop={handlePageDrop}
    >
      {isPageDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-none bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary/40 rounded-xl">
          <div className="text-primary font-semibold text-lg">Drop image here</div>
          <div className="text-muted-foreground text-sm mt-1">JPEG, PNG, GIF or WebP · max 5 MB</div>
        </div>
      )}
      <MessageList
        messages={messages}
        isLoading={isLoading}
        isStreaming={isStreaming}
        streamingContent={streamingContent}
        streamingMessageId={streamingMessageId ?? undefined}
        thinkingContent={thinkingContent}
        isThinking={isThinking}
        aiState={aiState}
        hasMoreMessages={hasMoreMessages}
        isLoadingMore={isLoadingMore}
        onLoadMore={handleLoadMore}
        aiName={activeWorkspace?.ai_name || '2Hands'}
        executingTool={executingTool}
        activitySteps={activitySteps}
        shouldShowThinking={complexity?.shouldShowThinking ?? false}
        onIntegrationConnected={(connectorId, connectorName) => {
          handleSend(`Connected ${connectorName}. Run a full readiness check: verify the connection, inspect the workspace/account to discover live facts (stages, lists, repos, scopes), and confirm what this integration is ready to do.`)
        }}
        workspaceId={activeWorkspace?.id}
      />
      <div className="shrink-0 w-full">
        <div className="w-full max-w-[850px] mx-auto px-4 sm:px-0 pb-4 sm:pb-6">
          <ChatInput
            onSend={handleSend}
            isLoading={isLoading}
            isStreaming={isStreaming}
            externalImages={pageDragImages}
            onStop={() => {
              if (streamingFlushRafRef.current !== null) {
                cancelAnimationFrame(streamingFlushRafRef.current)
                streamingFlushRafRef.current = null
              }
              streamingContentRef.current = ''
              setIsLoading(false)
              setIsStreaming(false)
              streamingMessageIdRef.current = null
              setStreamingMessageId(null)
              setStreamingContent('')
              setThinkingContent('')
              thinkingContentRef.current = ''
              allThinkingContentRef.current = ''
              setIsThinking(false)
              setAiState(null)
              setExecutingTool(null)
              setActivitySteps([])
              activityStepsRef.current = []
              setComplexity(null)
            }}
            onSlashCommand={handleSlashCommand}
            model={model}
            onModelChange={setModel}
            messageCount={messages.length}
            draftKey={managerConversationId ? `chat-draft:${managerConversationId}` : undefined}
          />
        </div>
      </div>
    </div>
  )
}
