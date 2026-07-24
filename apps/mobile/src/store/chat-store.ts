// Mobile Chat Store - Zustand state management
// Matches web app architecture for consistency

import { create } from 'zustand'

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  metadata?: Record<string, unknown>
  created_at: string
}

// Activity step type for chain-of-thought trace - matches web's ActivityStep
export interface ActivityStep {
  id: string
  label: string
  description?: string
  status: 'active' | 'complete' | 'pending'
  kind?: 'thinking' | 'search' | 'browse' | 'tool' | 'work' | 'image'
  data?: {
    url?: string
    query?: string
    results?: string[]
    results_v2?: Array<{
      title: string
      url?: string
      favicon?: string
      source?: string
      description?: string
    }>
    toolName?: string
    imageUrl?: string
    imageCaption?: string
  }
}

export interface Agent {
  id: string
  name: string
  type: string
  status: 'idle' | 'initializing' | 'working' | 'completed' | 'failed' | 'terminated'
  config?: { description?: string }
  schedule_type?: 'once' | 'scheduled' | 'realtime'
  last_run_at?: string
  next_run_at?: string
  created_at: string
}

interface ChatState {
  // AI Manager conversation
  managerConversationId: string | null
  messages: Message[]
  hasMoreMessages: boolean
  isLoadingMore: boolean
  
  // Agents
  agents: Agent[]
  
  // UI State
  isLoading: boolean
  isStreaming: boolean
  streamingContent: string
  thinkingContent: string
  isThinking: boolean
  executingTool: { name: string; type: 'create' | 'modify' | 'delete' | 'report' | 'search' } | null
  activitySteps: ActivityStep[]
  
  // Profile
  aiName: string
  userName: string
  credits: number
  planType: string | null
  
  // Actions - Manager
  setManagerConversationId: (id: string | null) => void
  setMessages: (messages: Message[]) => void
  prependMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  updateMessage: (id: string, content: string) => void
  setHasMoreMessages: (hasMore: boolean) => void
  setIsLoadingMore: (loading: boolean) => void
  
  // Actions - Agents
  setAgents: (agents: Agent[]) => void
  addAgent: (agent: Agent) => void
  updateAgent: (id: string, updates: Partial<Agent>) => void
  deleteAgent: (id: string) => void
  
  // Actions - UI
  setIsLoading: (loading: boolean) => void
  setIsStreaming: (streaming: boolean) => void
  setStreamingContent: (content: string) => void
  appendStreamingContent: (text: string) => void
  setThinkingContent: (content: string) => void
  appendThinkingContent: (text: string) => void
  setIsThinking: (thinking: boolean) => void
  setExecutingTool: (tool: { name: string; type: 'create' | 'modify' | 'delete' | 'report' | 'search' } | null) => void
  setActivitySteps: (steps: ActivityStep[]) => void
  updateActivityStep: (id: string, updates: Partial<ActivityStep>) => void
  addActivityStep: (step: ActivityStep) => void
  
  // Actions - Profile
  setAiName: (name: string) => void
  setUserName: (name: string) => void
  setCredits: (credits: number) => void
  setPlanType: (planType: string | null) => void
  
  // Reset
  reset: () => void
}

const initialState = {
  managerConversationId: null as string | null,
  messages: [] as Message[],
  hasMoreMessages: false,
  isLoadingMore: false,
  agents: [] as Agent[],
  isLoading: false,
  isStreaming: false,
  streamingContent: '',
  thinkingContent: '',
  isThinking: false,
  executingTool: null as { name: string; type: 'create' | 'modify' | 'delete' | 'report' | 'search' } | null,
  activitySteps: [] as ActivityStep[],
  aiName: '2Hands',
  userName: '',
  credits: 0,
  planType: null as string | null,
}

export const useChatStore = create<ChatState>((set, get) => ({
  ...initialState,

  // Manager actions
  setManagerConversationId: (id) => set({ managerConversationId: id }),
  
  setMessages: (messages) => {
    // Deduplicate messages by id
    const unique = messages.filter((msg, index, self) => 
      index === self.findIndex(m => m.id === msg.id)
    )
    set({ messages: unique })
  },
  
  prependMessages: (messages) =>
    set((state) => {
      const all = [...messages, ...state.messages]
      const unique = all.filter((msg, index, self) => 
        index === self.findIndex(m => m.id === msg.id)
      )
      return { messages: unique }
    }),
  
  addMessage: (message) =>
    set((state) => {
      if (state.messages.some(m => m.id === message.id)) {
        return state
      }
      return { messages: [...state.messages, message] }
    }),
  
  updateMessage: (id, content) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, content } : msg
      ),
    })),
  
  setHasMoreMessages: (hasMore) => set({ hasMoreMessages: hasMore }),
  setIsLoadingMore: (loading) => set({ isLoadingMore: loading }),
  
  // Agent actions
  setAgents: (agents) => set({ agents }),
  
  addAgent: (agent) =>
    set((state) => ({ agents: [...state.agents, agent] })),
  
  updateAgent: (id, updates) =>
    set((state) => ({
      agents: state.agents.map((agent) =>
        agent.id === id ? { ...agent, ...updates } : agent
      ),
    })),
  
  deleteAgent: (id) =>
    set((state) => ({
      agents: state.agents.filter((agent) => agent.id !== id),
    })),
  
  // UI actions
  setIsLoading: (isLoading) => set({ isLoading }),
  setIsStreaming: (isStreaming) => set({ isStreaming }),
  setStreamingContent: (streamingContent) => set({ streamingContent }),
  appendStreamingContent: (text) => 
    set((state) => ({ streamingContent: state.streamingContent + text })),
  setThinkingContent: (thinkingContent) => set({ thinkingContent }),
  appendThinkingContent: (text) =>
    set((state) => ({ thinkingContent: state.thinkingContent + text })),
  setIsThinking: (isThinking) => set({ isThinking }),
  setExecutingTool: (executingTool) => set({ executingTool }),
  setActivitySteps: (activitySteps) => set({ activitySteps }),
  updateActivityStep: (id, updates) =>
    set((state) => ({
      activitySteps: state.activitySteps.map((step) =>
        step.id === id ? { ...step, ...updates } : step
      ),
    })),
  addActivityStep: (step) =>
    set((state) => {
      const existing = state.activitySteps.findIndex(s => s.id === step.id)
      if (existing >= 0) {
        const updated = [...state.activitySteps]
        updated[existing] = step
        return { activitySteps: updated }
      }
      return { activitySteps: [...state.activitySteps, step] }
    }),
  
  // Profile actions
  setAiName: (aiName) => set({ aiName }),
  setUserName: (userName) => set({ userName }),
  setCredits: (credits) => set({ credits }),
  setPlanType: (planType) => set({ planType }),
  
  reset: () => set(initialState),
}))
