import { create } from 'zustand'
import type { Conversation, Message, Agent } from '@/types/database'

interface ChatState {
  // AI Manager - single continuous conversation
  managerConversationId: string | null
  initializedForWorkspaceId: string | null
  messages: Message[]
  hasMoreMessages: boolean
  isLoadingMore: boolean
  
  // Agents
  agents: Agent[]
  agentsHydrated: boolean
  currentAgent: Agent | null
  agentMessages: Message[]
  hasMoreAgentMessages: boolean
  isLoadingMoreAgent: boolean
  
  // UI State
  isLoading: boolean
  isStreaming: boolean
  
  // Legacy (for compatibility)
  conversations: Conversation[]
  currentConversation: Conversation | null
  
  // Actions - Manager
  setManagerConversationId: (id: string | null) => void
  setInitializedForWorkspaceId: (id: string | null) => void
  setMessages: (messages: Message[]) => void
  prependMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  updateMessage: (id: string, content: string) => void
  patchMessage: (id: string, updates: Partial<Message>) => void
  setHasMoreMessages: (hasMore: boolean) => void
  setIsLoadingMore: (loading: boolean) => void
  
  // Actions - Agents
  setAgents: (agents: Agent[]) => void
  addAgent: (agent: Agent) => void
  updateAgent: (id: string, updates: Partial<Agent>) => void
  deleteAgent: (id: string) => void
  setCurrentAgent: (agent: Agent | null) => void
  setAgentMessages: (messages: Message[]) => void
  prependAgentMessages: (messages: Message[]) => void
  addAgentMessage: (message: Message) => void
  setHasMoreAgentMessages: (hasMore: boolean) => void
  setIsLoadingMoreAgent: (loading: boolean) => void
  
  // Actions - UI
  setIsLoading: (loading: boolean) => void
  setIsStreaming: (streaming: boolean) => void
  
  // Actions - Legacy
  setConversations: (conversations: Conversation[]) => void
  setCurrentConversation: (conversation: Conversation | null) => void
  addConversation: (conversation: Conversation) => void
  
  reset: () => void
}

const initialState = {
  // AI Manager
  managerConversationId: null as string | null,
  initializedForWorkspaceId: null as string | null,
  messages: [] as Message[],
  hasMoreMessages: true,
  isLoadingMore: false,
  
  // Agents
  agents: [] as Agent[],
  agentsHydrated: false,
  currentAgent: null as Agent | null,
  agentMessages: [] as Message[],
  hasMoreAgentMessages: false,
  isLoadingMoreAgent: false,
  
  // UI
  isLoading: false,
  isStreaming: false,
  
  // Legacy
  conversations: [] as Conversation[],
  currentConversation: null as Conversation | null,
}

export const useChatStore = create<ChatState>((set) => ({
  ...initialState,

  // Manager actions
  setManagerConversationId: (id) => set({ managerConversationId: id }),
  setInitializedForWorkspaceId: (id) => set({ initializedForWorkspaceId: id }),
  
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
      // Deduplicate
      const unique = all.filter((msg, index, self) => 
        index === self.findIndex(m => m.id === msg.id)
      )
      return { messages: unique }
    }),
  
  addMessage: (message) =>
    set((state) => {
      // Don't add if already exists
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

  patchMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, ...updates } : msg
      ),
    })),
  
  setHasMoreMessages: (hasMore) => set({ hasMoreMessages: hasMore }),
  
  setIsLoadingMore: (loading) => set({ isLoadingMore: loading }),
  
  // Agent actions
  setAgents: (agents) => set({ agents, agentsHydrated: true }),
  
  addAgent: (agent) =>
    set((state) => ({ agents: [...state.agents, agent] })),
  
  updateAgent: (id, updates) =>
    set((state) => ({
      agents: state.agents.map((agent) =>
        agent.id === id ? { ...agent, ...updates } : agent
      ),
      currentAgent: state.currentAgent?.id === id 
        ? { ...state.currentAgent, ...updates } 
        : state.currentAgent
    })),
  
  deleteAgent: (id) =>
    set((state) => ({
      agents: state.agents.filter((agent) => agent.id !== id),
      currentAgent: state.currentAgent?.id === id ? null : state.currentAgent,
    })),
  
  setCurrentAgent: (agent) => set({ currentAgent: agent }),
  
  setAgentMessages: (messages) => set({ agentMessages: messages }),
  
  prependAgentMessages: (messages) =>
    set((state) => ({ agentMessages: [...messages, ...state.agentMessages] })),
  
  addAgentMessage: (message) =>
    set((state) => ({ agentMessages: [...state.agentMessages, message] })),
  
  setHasMoreAgentMessages: (hasMore) => set({ hasMoreAgentMessages: hasMore }),
  
  setIsLoadingMoreAgent: (loading) => set({ isLoadingMoreAgent: loading }),
  
  // UI actions
  setIsLoading: (isLoading) => set({ isLoading }),
  
  setIsStreaming: (isStreaming) => set({ isStreaming }),
  
  // Legacy actions
  setConversations: (conversations) => set({ conversations }),
  
  setCurrentConversation: (conversation) => set({ currentConversation: conversation }),
  
  addConversation: (conversation) =>
    set((state) => ({ conversations: [conversation, ...state.conversations] })),
  
  reset: () => set(initialState),
}))
