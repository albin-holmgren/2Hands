// Mobile Chat Hook - Handles conversation initialization, real-time sync, and messaging
// Mirrors web app architecture for consistency

import { useEffect, useCallback, useRef } from 'react'
import { useChatStore, Message, ActivityStep } from '../store/chat-store'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'
import EventSource from 'react-native-sse'

const MANAGER_CONVERSATION_TITLE = 'AI Manager'

// Get API URL - use env var if set, otherwise production
// ChatGPT/Claude pattern: same API for mobile and web, no special mobile logic
const getApiUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL
  
  // If explicitly set (including local dev URLs), use it
  if (envUrl && envUrl.trim()) {
    console.log('[Chat] Using configured API URL:', envUrl)
    return envUrl.trim()
  }
  
  // Default to production
  return 'https://2hands.ai'
}
const API_URL = getApiUrl()

export function useChat() {
  const { user } = useAuth()
  const initialized = useRef(false)
  const eventSourceRef = useRef<EventSource<any> | null>(null)
  const activityStepsRef = useRef<ActivityStep[]>([])
  const allThinkingContentRef = useRef('')
  
  const {
    managerConversationId,
    setManagerConversationId,
    messages,
    setMessages,
    prependMessages,
    addMessage,
    hasMoreMessages,
    setHasMoreMessages,
    isLoadingMore,
    setIsLoadingMore,
    isLoading,
    setIsLoading,
    isStreaming,
    setIsStreaming,
    streamingContent,
    setStreamingContent,
    appendStreamingContent,
    setThinkingContent,
    appendThinkingContent,
    setIsThinking,
    setExecutingTool,
    executingTool,
    thinkingContent,
    isThinking,
    setActivitySteps,
    addActivityStep,
    activitySteps,
    aiName,
    setAiName,
    userName,
    setUserName,
    credits,
    setCredits,
    setPlanType,
    agents,
    setAgents,
    addAgent,
    updateAgent,
    deleteAgent,
  } = useChatStore()

  // Initialize conversation on mount
  useEffect(() => {
    if (!user || initialized.current) return
    initialized.current = true
    
    initializeConversation()
  }, [user])

  // Real-time subscription for new messages
  useEffect(() => {
    if (!managerConversationId) return

    const channel = supabase
      .channel(`mobile-messages:${managerConversationId}`)
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
          addMessage(newMessage)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [managerConversationId, addMessage])

  // Real-time subscription for agent updates
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`mobile-agents:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agents',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            addAgent(payload.new as any)
          } else if (payload.eventType === 'UPDATE') {
            updateAgent(payload.new.id, payload.new as any)
          } else if (payload.eventType === 'DELETE') {
            useChatStore.getState().deleteAgent(payload.old.id)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, addAgent, updateAgent])

  // Real-time subscription for credit changes
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`mobile-credits:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const newData = payload.new as { credits?: number }
          if (newData.credits !== undefined) {
            console.log('[Credits] Real-time update:', newData.credits)
            setCredits(newData.credits)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, setCredits])

  const initializeConversation = async () => {
    if (!user) return

    try {
      // Load profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('ai_name, full_name, credits, plan_type')
        .eq('id', user.id)
        .single()

      if (profile) {
        if (profile.ai_name) setAiName(profile.ai_name)
        if (profile.full_name) setUserName(profile.full_name)
        if (profile.credits) setCredits(profile.credits)
        setPlanType(profile.plan_type || 'free')
      }

      // Load agents
      const { data: agentsData } = await supabase
        .from('agents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (agentsData) {
        setAgents(agentsData as any[])
      }

      // Find or create AI Manager conversation
      const { data: conversations } = await supabase
        .from('conversations')
        .select('id')
        .eq('user_id', user.id)
        .eq('title', MANAGER_CONVERSATION_TITLE)
        .order('created_at', { ascending: true })

      let conversationId: string

      if (conversations && conversations.length > 0) {
        conversationId = conversations[0].id
        
        // Clean up duplicates
        if (conversations.length > 1) {
          const duplicateIds = conversations.slice(1).map(c => c.id)
          await supabase.from('conversations').delete().in('id', duplicateIds)
        }
      } else {
        // Create new conversation
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({
            user_id: user.id,
            title: MANAGER_CONVERSATION_TITLE,
            status: 'active',
          } as never)
          .select()
          .single()

        if (!newConv) return
        conversationId = newConv.id
      }

      setManagerConversationId(conversationId)

      // Load recent messages
      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(20)

      console.log('[Chat] Loaded messages from DB:', {
        conversationId,
        messagesCount: messagesData?.length || 0,
        error: messagesError?.message,
        firstMessageRole: messagesData?.[0]?.role,
      })

      if (messagesData && messagesData.length > 0) {
        setMessages(messagesData.reverse() as Message[])
        setHasMoreMessages(messagesData.length === 20)
      }
    } catch (error) {
      console.error('Error initializing conversation:', error)
    }
  }

  const loadMoreMessages = useCallback(async () => {
    if (!managerConversationId || isLoadingMore || !hasMoreMessages) return

    setIsLoadingMore(true)
    try {
      const oldestMessage = messages[0]
      
      const { data: olderMessages } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', managerConversationId)
        .lt('created_at', oldestMessage?.created_at || new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(20)

      if (olderMessages && olderMessages.length > 0) {
        prependMessages(olderMessages.reverse() as Message[])
        setHasMoreMessages(olderMessages.length === 20)
      } else {
        setHasMoreMessages(false)
      }
    } catch (error) {
      console.error('Error loading more messages:', error)
    } finally {
      setIsLoadingMore(false)
    }
  }, [managerConversationId, messages, isLoadingMore, hasMoreMessages])

  // Refresh credits from server
  const refreshCredits = useCallback(async () => {
    if (!user?.id) return
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits, plan_type')
      .eq('id', user.id)
      .single()
    
    if (profile?.credits !== undefined) {
      setCredits(profile.credits)
      console.log('[Chat] Credits refreshed:', profile.credits)
    }
    if (profile?.plan_type !== undefined) {
      setPlanType(profile.plan_type || 'free')
    }
  }, [user, setCredits, setPlanType])

  const sendMessage = useCallback(async (content: string, images?: Array<{ base64: string; mediaType: string }>) => {
    if (!managerConversationId || (!content.trim() && (!images || images.length === 0)) || isLoading || isStreaming) return

    setIsLoading(true)
    setStreamingContent('')
    setThinkingContent('')
    setIsThinking(false)
    setActivitySteps([])
    activityStepsRef.current = []
    allThinkingContentRef.current = ''

    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('Not authenticated')
      }

      // Create user message (optimistic update)
      const userMessage: Message = {
        id: `temp-${Date.now()}`,
        conversation_id: managerConversationId,
        role: 'user',
        content: content || (images && images.length > 0 ? '[Image attached]' : ''),
        created_at: new Date().toISOString(),
      }
      addMessage(userMessage)

      // Save user message to database
      const { data: savedUserMsg, error: saveError } = await supabase
        .from('messages')
        .insert({
          conversation_id: managerConversationId,
          role: 'user',
          content: content || '[Image attached]',
        } as never)
        .select()
        .single()

      if (saveError) {
        throw saveError
      }

      // Update temp message with real ID
      if (savedUserMsg) {
        const state = useChatStore.getState()
        const withoutTempOrSaved = state.messages.filter(
          (m) => m.id !== userMessage.id && m.id !== (savedUserMsg as Message).id
        )
        state.setMessages([...withoutTempOrSaved, savedUserMsg as Message])
      }

      // Stream AI response
      setIsLoading(false)
      setIsStreaming(true)
      setIsThinking(true)

      // Initialize activity trace with first step - matches web
      const summaryLabel = content.length > 80 ? content.slice(0, 80) + '...' : content
      const initialSteps: ActivityStep[] = [{ id: 'understand', label: summaryLabel, status: 'active', kind: 'thinking' }]
      setActivitySteps(initialSteps)
      activityStepsRef.current = initialSteps

      // Get fresh messages from store (avoid stale closure)
      const currentMessages = useChatStore.getState().messages
      
      // Send recent messages for context
      const recentMessages: Array<{ role: string; content: string | object[] }> = [...currentMessages.slice(-9), userMessage].map(m => ({
        role: m.role,
        content: m.content,
      }))
      
      console.log('[Chat] Sending messages to API:', {
        totalMessagesInState: currentMessages.length,
        recentMessagesCount: recentMessages.length,
        messageRoles: recentMessages.map(m => m.role),
        conversationId: managerConversationId,
      })

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

      // Use react-native-sse EventSource for real-time streaming
      // Important: handle done/close/exception too, otherwise UI can get stuck "thinking".
      let fullContent = ''
      let receivedAnyChunk = false
      let lastHttpError: { status: number; body: string } | null = null
      const convId = managerConversationId // capture for closure

      // Ensure we don't leak connections
      if (eventSourceRef.current) {
        try {
          eventSourceRef.current.removeAllEventListeners()
          eventSourceRef.current.close()
        } catch {
          // ignore
        }
        eventSourceRef.current = null
      }

      const refreshConversationMessages = async () => {
        const { data: refreshedMessages } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', convId)
          .order('created_at', { ascending: false })
          .limit(20)

        if (refreshedMessages) {
          setMessages(refreshedMessages.reverse() as Message[])
        }
      }

      let finished = false
      const finish = async (reason: string) => {
        if (finished) return
        finished = true

        console.log('[Chat] SSE finish:', reason, { receivedAnyChunk, fullLength: fullContent.length })

        // Always attempt refresh: even if streaming parsing failed, the server may have saved the assistant message.
        try {
          await refreshConversationMessages()
        } catch (e) {
          console.error('[Chat] Refresh messages failed:', e)
        }

        // Refresh credits after AI response completes
        try {
          await refreshCredits()
        } catch (e) {
          console.error('[Chat] Refresh credits failed:', e)
        }

        // If the server didn't save an assistant message, show an inline error so user isn't left confused.
        try {
          const state = useChatStore.getState()
          const last = state.messages[state.messages.length - 1]
          const noAssistantReply = !last || last.role === 'user'

          if (!receivedAnyChunk && fullContent.trim().length === 0 && noAssistantReply) {
            let errorText = 'Something went wrong. Please try again.'

            if (lastHttpError?.status === 401) {
              errorText = 'You were signed out. Please log in again and retry.'
            } else if (lastHttpError?.status === 429) {
              errorText = 'Too many requests. Please wait a moment and try again.'
            } else if (lastHttpError?.status && lastHttpError.status >= 500) {
              errorText = 'The AI service is having trouble right now. Please try again in a minute.'
            }

            addMessage({
              id: `local-error-${Date.now()}`,
              conversation_id: convId,
              role: 'assistant',
              content: errorText,
              created_at: new Date().toISOString(),
            })
          }
        } catch {
          // ignore
        }

        try {
          eventSourceRef.current?.removeAllEventListeners()
          eventSourceRef.current?.close()
        } catch {
          // ignore
        }
        eventSourceRef.current = null

        // Persist thinking metadata to the latest assistant message (matches web behavior)
        const finalThinking = allThinkingContentRef.current
        const finalActivitySteps = activityStepsRef.current
        if (finalThinking || finalActivitySteps.length > 0) {
          try {
            const { data: { session: currentSession } } = await supabase.auth.getSession()
            if (currentSession?.access_token) {
              const metadataToSave = JSON.parse(JSON.stringify({
                ...(finalThinking ? { thinking_content: finalThinking } : {}),
                ...(finalActivitySteps.length > 0 ? { activity_trace: finalActivitySteps } : {})
              }))
              // Use the same PATCH endpoint as web to persist metadata
              const persistUrl = `${API_URL}/api/messages`
              fetch(persistUrl, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${currentSession.access_token}`,
                },
                body: JSON.stringify({
                  conversation_id: convId,
                  metadata: metadataToSave,
                }),
              }).catch(err => console.error('[Chat] Metadata persist failed:', err))
            }
          } catch (e) {
            console.error('[Chat] Metadata persist error:', e)
          }
        }

        setStreamingContent('')
        setThinkingContent('')
        setIsThinking(false)
        setExecutingTool(null)
        setActivitySteps([])
        activityStepsRef.current = []
        allThinkingContentRef.current = ''
        setIsStreaming(false)
      }

      // Shared SSE data processor - handles all event types matching web behavior
      const processSSEData = (data: any) => {
        if (data?.type === 'ai_state') {
          // Update activity steps based on state transitions - matches web exactly
          const nextState = data.state as string
          const currentSteps = activityStepsRef.current
          let newSteps = [...currentSteps]

          // Mark previous active step as complete when state changes
          const activeIndex = newSteps.findIndex(s => s.status === 'active')
          if (activeIndex >= 0 && nextState !== 'thinking') {
            newSteps[activeIndex] = { ...newSteps[activeIndex], status: 'complete' as const }
          }

          // Add new step based on state
          if (nextState === 'browsing' && data.context) {
            const url = data.metadata?.url || data.context
            let hostname = url
            try { hostname = new URL(url).hostname.replace(/^www\./, '') } catch {}
            const existingBrowse = newSteps.find(s => s.kind === 'browse' && s.data?.url === url)
            if (!existingBrowse) {
              newSteps.push({
                id: `browse-${Date.now()}`,
                label: `Browsing ${hostname}`,
                status: 'active',
                kind: 'browse',
                data: { url }
              })
            }
          } else if (nextState === 'searching' && data.context) {
            const query = data.metadata?.query || data.context
            const existingSearch = newSteps.find(s => s.kind === 'search' && s.data?.query === query)
            if (!existingSearch) {
              newSteps.push({
                id: `search-${Date.now()}`,
                label: query,
                status: 'active',
                kind: 'search',
                data: { query }
              })
            }
          } else if (nextState === 'working') {
            const existingWork = newSteps.find(s => s.kind === 'work')
            if (!existingWork) {
              newSteps.push({
                id: `work-${Date.now()}`,
                label: data.context || 'Working...',
                status: 'active',
                kind: 'work'
              })
            }
          } else if (nextState === 'thinking' && !newSteps.some(s => s.status === 'active')) {
            newSteps.push({
              id: `think-${Date.now()}`,
              label: 'Processing...',
              status: 'active',
              kind: 'thinking'
            })
          } else if (nextState === 'idle') {
            newSteps = newSteps.map(s => s.status === 'active' ? { ...s, status: 'complete' as const } : s)
          }

          activityStepsRef.current = newSteps
          setActivitySteps(newSteps)

          if (nextState === 'thinking') {
            setIsThinking(true)
          } else {
            setIsThinking(false)
          }
        } else if (data?.type === 'cot_step') {
          // Handle explicit chain-of-thought step events
          const step: ActivityStep = {
            id: data.id || `step-${Date.now()}`,
            label: data.label || 'Working...',
            description: data.description,
            status: data.status || 'active',
            kind: data.kind || 'thinking',
            data: data.data
          }
          addActivityStep(step)
          const existing = activityStepsRef.current.findIndex(s => s.id === step.id)
          if (existing >= 0) {
            const updated = [...activityStepsRef.current]
            updated[existing] = step
            activityStepsRef.current = updated
          } else {
            activityStepsRef.current = [...activityStepsRef.current, step]
          }
        } else if (data?.type === 'activity_step_upsert') {
          // Handle new structured activity step from server
          const step = data.step as ActivityStep
          if (step?.id) {
            const steps = [...activityStepsRef.current]
            const idx = steps.findIndex(s => s.id === step.id)
            if (idx >= 0) {
              steps[idx] = { ...steps[idx], ...step }
            } else {
              steps.push(step)
            }
            activityStepsRef.current = steps
            setActivitySteps(steps)
          }
        } else if (data?.type === 'activity_step_patch') {
          // Handle partial update to an existing activity step
          const { stepId, patch } = data as { stepId: string; patch: Partial<ActivityStep> }
          if (stepId && patch) {
            const steps = [...activityStepsRef.current]
            const idx = steps.findIndex(s => s.id === stepId)
            if (idx >= 0) {
              steps[idx] = { ...steps[idx], ...patch, data: { ...steps[idx].data, ...patch.data } }
              if ((patch as any).sources && Array.isArray((patch as any).sources)) {
                steps[idx].data = { ...steps[idx].data, results_v2: (patch as any).sources }
              }
              activityStepsRef.current = steps
              setActivitySteps(steps)
            }
          }
        } else if (data?.type === 'progress_update') {
          const msg = typeof data.message === 'string' ? data.message : ''
          if (msg) {
            appendThinkingContent('\n' + msg)
            allThinkingContentRef.current += (allThinkingContentRef.current ? '\n' : '') + msg
          }
        } else if (data?.type === 'thinking_start') {
          setIsThinking(true)
        } else if (data?.type === 'thinking') {
          appendThinkingContent(data.thinking || '')
          allThinkingContentRef.current += data.thinking || ''
        } else if (data?.text) {
          receivedAnyChunk = true
          fullContent += data.text
          setStreamingContent(fullContent)
          // Once we get text, thinking phase is over
          setIsThinking(false)
        } else if (data?.content) {
          receivedAnyChunk = true
          fullContent += data.content
          setStreamingContent(fullContent)
        } else if (data?.type === 'tool_call') {
          const toolType = data.tool === 'create_agent' ? 'create'
            : data.tool === 'delete_agent' ? 'delete'
            : data.tool === 'update_agent' ? 'modify'
            : data.tool === 'web_search' ? 'search'
            : data.tool === 'create_visual_report' ? 'report'
            : 'search'
          setExecutingTool({ name: data.name || data.tool, type: toolType as any })
        } else if (data?.type === 'tool_result') {
          setExecutingTool(null)
          receivedAnyChunk = true
          if (data.tool === 'set_ai_name' && data.name) {
            setAiName(data.name)
          } else if (data.tool === 'create_agent' && data.agent) {
            addAgent(data.agent)
          } else if (data.tool === 'delete_agent' && data.agentName) {
            const agentToRemove = useChatStore.getState().agents.find(a => a.name === data.agentName)
            if (agentToRemove) {
              deleteAgent(agentToRemove.id)
            }
          }

          // Capture search/browse results into activity steps - matches web
          if (data.tool === 'web_search' && data.result === 'success' && data.data) {
            const searchData = data.data as any
            const results: Array<{ title: string; url?: string; description?: string }> = []
            if (searchData.abstract && searchData.abstractURL) {
              results.push({ title: searchData.abstractSource || 'Search Result', url: searchData.abstractURL, description: searchData.abstract })
            }
            searchData.relatedTopics?.forEach((topic: any) => {
              if (topic.url) results.push({ title: topic.text?.slice(0, 80) || 'Related', url: topic.url, description: topic.text })
            })
            if (results.length > 0) {
              const steps = [...activityStepsRef.current]
              for (let i = steps.length - 1; i >= 0; i--) {
                if (steps[i].kind === 'search') {
                  steps[i] = { ...steps[i], status: 'complete', data: { ...steps[i].data, results_v2: results } }
                  break
                }
              }
              activityStepsRef.current = steps
              setActivitySteps(steps)
            }
          } else if (data.tool === 'analyze_url' && data.result === 'success' && data.data) {
            const urlData = data.data as any
            if (urlData.url) {
              const result = { title: urlData.title || urlData.url, url: urlData.url, description: urlData.description || undefined }
              const steps = [...activityStepsRef.current]
              for (let i = steps.length - 1; i >= 0; i--) {
                if (steps[i].kind === 'browse') {
                  const existing = steps[i].data?.results_v2 || []
                  steps[i] = { ...steps[i], status: 'complete', data: { ...steps[i].data, results_v2: [...existing, result] } }
                  break
                }
              }
              activityStepsRef.current = steps
              setActivitySteps(steps)
            }
          }
        }
      }

      const requestUrl = `${API_URL}/api/chat`
      console.log('[Chat] Using API URL:', requestUrl)
      const requestBody = JSON.stringify({
        messages: recentMessages,
        conversationId: convId,
      })

      const tryFetchStream = async (): Promise<boolean> => {
        // If the runtime supports ReadableStream (RN 0.76+/Expo 52+), this is the most reliable way.
        const abortController = new AbortController()
        const abortTimeout = setTimeout(() => abortController.abort(), 60_000)
        try {
          const response = await fetch(requestUrl, {
            method: 'POST',
            headers: {
              Accept: 'text/event-stream',
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: requestBody,
            signal: abortController.signal,
          })

          if (!response.ok) {
            const errorText = await response.text().catch(() => '')
            console.error('[Chat] HTTP error:', response.status, errorText)
            lastHttpError = { status: response.status, body: errorText }
            await finish('http_error')
            return true
          }

          const reader = (response.body as any)?.getReader?.()
          if (!reader) return false

          const decoder = new TextDecoder()
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            let newlineIndex = buffer.indexOf('\n')
            while (newlineIndex !== -1) {
              const line = buffer.slice(0, newlineIndex).trimEnd()
              buffer = buffer.slice(newlineIndex + 1)
              newlineIndex = buffer.indexOf('\n')

              if (!line.startsWith('data: ')) continue
              const dataStr = line.slice(6)
              if (dataStr === '[DONE]') {
                await finish('fetch_stream_done')
                return true
              }

              try {
                const data = JSON.parse(dataStr)
                processSSEData(data)
              } catch {
                // ignore parse errors
              }
            }
          }

          await finish('fetch_stream_eof')
          return true
        } catch (e: any) {
          console.error('[Chat] fetch stream failed:', e?.message || e)
          // Don't call finish here - let EventSource try as fallback
          return false
        } finally {
          clearTimeout(abortTimeout)
        }
      }

      // Skip fetch stream - EventSource is more reliable for long-running AI responses
      // const fetchStreamHandled = await tryFetchStream()
      // if (fetchStreamHandled) return

      console.log('[Chat] Using EventSource for streaming to:', requestUrl)
      const es = new EventSource<any>(requestUrl, {
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
          // react-native-sse docs recommend a toString wrapper for Bearer tokens
          Authorization: {
            toString: function () {
              return `Bearer ${session.access_token}`
            },
          },
        } as any,
        method: 'POST',
        body: requestBody,
        pollingInterval: 0,
        timeout: 60_000,
        timeoutBeforeConnection: 500,
        lineEndingCharacter: '\n',
        debug: true,
      })

      eventSourceRef.current = es

      const handleEvent = (event: any) => {
        if (event.type === 'open') {
          console.log('[Chat] SSE connection opened')
          return
        }

        if (event.type === 'message') {
          const raw = event.data
          if (raw === '[DONE]') {
            void finish('done_marker')
            return
          }

          if (typeof raw !== 'string' || !raw) return

          try {
            const data = JSON.parse(raw)
            processSSEData(data)
          } catch (parseErr) {
            console.log('[Chat] SSE parse error:', parseErr)
          }
          return
        }

        // react-native-sse emits these depending on platform/network conditions
        if (event.type === 'done') {
          void finish('done_event')
          return
        }

        if (event.type === 'close') {
          void finish('close_event')
          return
        }

        if (event.type === 'exception') {
          console.error('[Chat] SSE exception:', event.message, event.error)
          void finish('exception')
          return
        }

        if (event.type === 'error') {
          console.error('[Chat] SSE error:', event.message)
          void finish('error')
        }
      }

      es.addEventListener('open', handleEvent)
      es.addEventListener('message', handleEvent)
      ;(es as any).addEventListener('done', handleEvent)
      es.addEventListener('close', handleEvent)
      ;(es as any).addEventListener('exception', handleEvent)
      es.addEventListener('error', handleEvent)

      // Safety timeout: if we never receive anything, don't leave user stuck.
      setTimeout(() => {
        if (!finished && !receivedAnyChunk) {
          void finish('timeout_no_chunks')
        }
      }, 20_000)
    } catch (error) {
      console.error('Error sending message:', error)
      setIsLoading(false)
      setIsStreaming(false)
    }
  }, [managerConversationId, messages, isLoading, isStreaming])

  return {
    // State
    messages,
    isLoading,
    isStreaming,
    streamingContent,
    thinkingContent,
    isThinking,
    executingTool,
    activitySteps,
    hasMoreMessages,
    isLoadingMore,
    aiName,
    userName,
    credits,
    agents,
    initialized: !!managerConversationId,
    
    // Actions
    sendMessage,
    loadMoreMessages,
    refresh: initializeConversation,
    refreshCredits,
  }
}
