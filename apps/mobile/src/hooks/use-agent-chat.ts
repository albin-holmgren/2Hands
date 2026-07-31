// Mobile Agent Chat Hook - Handles agent-specific conversations
// Similar to useChat but for individual agent conversations

import { useEffect, useCallback, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth-context'

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface Agent {
  id: string
  name: string
  type: string
  status: 'idle' | 'initializing' | 'working' | 'completed' | 'failed' | 'terminated'
  config?: { description?: string }
  conversation_id?: string
  schedule_type?: 'once' | 'scheduled' | 'realtime'
  last_run_at?: string
  next_run_at?: string
  created_at: string
}

// Get API URL - use env var if set, otherwise production
// ChatGPT/Claude pattern: same API for mobile and web, no special mobile logic
const getApiUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL
  
  // If explicitly set (including local dev URLs), use it
  if (envUrl && envUrl.trim()) {
    return envUrl.trim()
  }
  
  // Default to production
  return 'https://2hands.ai'
}
const API_URL = getApiUrl()

export function useAgentChat(agentId: string) {
  const { user } = useAuth()
  
  const [agent, setAgent] = useState<Agent | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Generate status message based on agent state - make it feel like an employee
  const getStatusMessage = useCallback((agentInfo: Agent): Message => {
    const taskDesc = agentInfo.config?.description || 'your task'
    const name = agentInfo.name
    let content = ''
    
    if (agentInfo.status === 'working' || agentInfo.status === 'initializing') {
      content = `Hey, I'm on it right now. I'll update you as I make progress.`
    } else if (agentInfo.status === 'completed') {
      content = `All done! I've finished the task and shared my findings above.`
    } else if (agentInfo.status === 'failed') {
      content = `I ran into some trouble and couldn't complete the task. Your AI Manager has the details.`
    } else {
      // Idle - introduce themselves
      const nextRun = agentInfo.next_run_at ? new Date(agentInfo.next_run_at) : null
      const scheduleText = nextRun 
        ? `I'm scheduled to start on ${nextRun.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${nextRun.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
        : `I'm ready whenever you need me.`
      
      content = `Hey, I'm ${name}. ${scheduleText}\n\nYou can message me here if you have questions or want to adjust anything.`
    }
    
    return {
      id: 'status-' + agentInfo.id,
      conversation_id: agentInfo.conversation_id || agentInfo.id,
      role: 'assistant',
      content,
      metadata: { type: 'status' },
      created_at: new Date().toISOString(),
    }
  }, [])

  // Initialize agent and conversation
  useEffect(() => {
    if (!agentId) return
    
    loadAgent()
  }, [agentId])

  // Real-time subscription for agent updates
  useEffect(() => {
    if (!agentId) return

    const channel = supabase
      .channel(`mobile-agent:${agentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agents',
          filter: `id=eq.${agentId}`,
        },
        (payload) => {
          const updated = payload.new as Agent
          setAgent(prev => prev ? { ...prev, ...updated } : null)
          
          // Refresh messages when status changes to update status message
          if (updated.conversation_id) {
            supabase
              .from('messages')
              .select('*')
              .eq('conversation_id', updated.conversation_id)
              .order('created_at', { ascending: false })
              .limit(20)
              .then(({ data }) => {
                if (data && data.length > 0) {
                  setMessages(data.reverse() as Message[])
                } else {
                  // No messages - show status message
                  setMessages([getStatusMessage(updated)])
                }
              })
          } else {
            // No conversation - show status message
            setMessages([getStatusMessage(updated)])
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [agentId])

  // Real-time subscription for messages
  useEffect(() => {
    if (!agent?.conversation_id) return

    const channel = supabase
      .channel(`mobile-agent-messages:${agent.conversation_id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${agent.conversation_id}`,
        },
        (payload) => {
          const newMessage = payload.new as Message
          setMessages(prev => {
            if (prev.some(m => m.id === newMessage.id)) return prev
            return [...prev, newMessage]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [agent?.conversation_id])

  const loadAgent = async () => {
    if (!agentId) return

    setIsLoading(true)
    try {
      // Load agent
      const { data: agentData, error: agentError } = await supabase
        .from('agents')
        .select('*')
        .eq('id', agentId)
        .single()

      if (agentError || !agentData) {
        console.error('Error loading agent:', agentError)
        setIsLoading(false)
        return
      }

      const agentInfo = agentData as Agent
      setAgent(agentInfo)

      // Load messages if conversation exists
      if (agentInfo.conversation_id) {
        const { data: messagesData } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', agentInfo.conversation_id)
          .order('created_at', { ascending: false })
          .limit(20)

        if (messagesData && messagesData.length > 0) {
          setMessages(messagesData.reverse() as Message[])
          setHasMoreMessages(messagesData.length === 20)
        } else {
          // No messages - show status message
          setMessages([getStatusMessage(agentInfo)])
        }
      } else {
        // No conversation - show status message
        setMessages([getStatusMessage(agentInfo)])
      }
    } catch (error) {
      console.error('Error loading agent:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadMoreMessages = useCallback(async () => {
    if (!agent?.conversation_id || isLoadingMore || !hasMoreMessages) return

    setIsLoadingMore(true)
    try {
      const oldestMessage = messages[0]
      
      const { data: olderMessages } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', agent.conversation_id)
        .lt('created_at', oldestMessage?.created_at || new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(20)

      if (olderMessages && olderMessages.length > 0) {
        setMessages(prev => [...olderMessages.reverse() as Message[], ...prev])
        setHasMoreMessages(olderMessages.length === 20)
      } else {
        setHasMoreMessages(false)
      }
    } catch (error) {
      console.error('Error loading more messages:', error)
    } finally {
      setIsLoadingMore(false)
    }
  }, [agent?.conversation_id, messages, isLoadingMore, hasMoreMessages])

  const sendMessage = useCallback(async (content: string, images?: Array<{ base64: string; mediaType: string }>) => {
    if (!agent || (!content.trim() && (!images || images.length === 0)) || isLoading || isStreaming) return

    setIsLoading(true)
    setStreamingContent('')

    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('Not authenticated')
      }

      // If agent doesn't have a conversation_id, create one
      let conversationId = agent.conversation_id
      if (!conversationId) {
        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert({
            user_id: user?.id,
            title: agent.name,
          } as never)
          .select()
          .single()

        if (convError || !newConv) {
          throw new Error('Failed to create conversation')
        }

        conversationId = (newConv as { id: string }).id

        // Update agent with conversation_id
        await supabase
          .from('agents')
          .update({ conversation_id: conversationId } as never)
          .eq('id', agent.id)

        // Update local agent state
        setAgent(prev => prev ? { ...prev, conversation_id: conversationId } : null)
      }

      // Create user message (optimistic update)
      const userMessage: Message = {
        id: `temp-${Date.now()}`,
        conversation_id: conversationId,
        role: 'user',
        content: content || (images && images.length > 0 ? '[Image attached]' : ''),
        created_at: new Date().toISOString(),
      }
      setMessages(prev => [...prev, userMessage])

      // Save user message to database
      const { data: savedUserMsg, error: saveError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          role: 'user',
          content: content || '[Image attached]',
        } as never)
        .select()
        .single()

      if (saveError) {
        throw saveError
      }

      if (savedUserMsg) {
        setMessages(prev => {
          const withoutTempOrSaved = prev.filter(
            (m) => m.id !== userMessage.id && m.id !== (savedUserMsg as Message).id
          )
          return [...withoutTempOrSaved, savedUserMsg as Message]
        })
      }

      // Trigger the agent to run immediately when user sends a message
      // Start a real agent run (VM actions) via the run endpoint
      try {
        const triggerResp = await fetch(`${API_URL}/api/agents/run`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ agentId: agent.id, reset: true, taskDescription: content, queue_mode: 'collect' }),
        })
        const triggerData = await triggerResp.json()
        console.log('[AgentChat] Triggered agent execution:', triggerData)
      } catch (err) {
        console.log('[AgentChat] Could not trigger agent:', err)
      }

      // Agent execution is now triggered - responses come from agent executor progress updates
      // Do NOT call /api/chat as that's for AI Manager, not agents
      // The agent executor will post progress updates to /api/agents/progress which writes 
      // messages to the agent's conversation - we poll for those below
      
      setIsLoading(false)
      
      // Poll for new messages from agent executor progress updates
      // The agent executor writes insights/actions to the conversation via /api/agents/progress
      const pollForUpdates = async () => {
        if (!agent.conversation_id) return
        
        let lastMessageCount = messages.length + 1 // +1 for user message we just added
        let pollCount = 0
        const maxPolls = 60 // Poll for up to 2 minutes
        
        while (pollCount < maxPolls) {
          await new Promise(resolve => setTimeout(resolve, 2000)) // Poll every 2 seconds
          pollCount++
          
          const { data: latestMessages } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', agent.conversation_id)
            .order('created_at', { ascending: false })
            .limit(30)
          
          if (latestMessages && latestMessages.length > lastMessageCount) {
            console.log('[AgentChat] New messages from agent:', latestMessages.length - lastMessageCount)
            setMessages(latestMessages.reverse() as Message[])
            lastMessageCount = latestMessages.length
          }
          
          // Check if agent completed
          const { data: agentStatus } = await supabase
            .from('agents')
            .select('status')
            .eq('id', agent.id)
            .single()
          
          if (agentStatus?.status === 'completed' || agentStatus?.status === 'failed' || agentStatus?.status === 'idle') {
            console.log('[AgentChat] Agent finished with status:', agentStatus.status)
            break
          }
        }
      }
      
      // Start polling in background
      pollForUpdates().catch(err => console.log('[AgentChat] Polling error:', err))
    } catch (error) {
      console.error('Error sending message:', error)
      setIsLoading(false)
      setIsStreaming(false)
    }
  }, [agent, messages, isLoading, isStreaming])

  const deleteMessage = useCallback(async (messageId: string) => {
    try {
      await supabase
        .from('messages')
        .delete()
        .eq('id', messageId)

      setMessages(prev => prev.filter(m => m.id !== messageId))
    } catch (error) {
      console.error('Error deleting message:', error)
    }
  }, [])

  return {
    agent,
    messages,
    isLoading,
    isStreaming,
    streamingContent,
    hasMoreMessages,
    isLoadingMore,
    sendMessage,
    loadMoreMessages,
    deleteMessage,
    refresh: loadAgent,
  }
}
