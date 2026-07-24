// Shared types for 2Hands monorepo
// These types are used by both web and mobile apps

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  ai_name: string | null
  credits: number
  plan_type: 'free' | 'starter' | 'pro' | 'enterprise'
  subscription_status: 'active' | 'canceled' | 'past_due' | null
  stripe_customer_id: string | null
  referral_code: string | null
  referral_count: number
  referred_by: string | null
  created_at: string
  updated_at: string
}

export type AgentType = 'task' | 'monitor' | 'research'

export interface Agent {
  id: string
  user_id: string
  conversation_id: string | null
  name: string
  type: string
  agent_type: AgentType
  status: 'idle' | 'initializing' | 'working' | 'completed' | 'failed' | 'terminated'
  config: Record<string, unknown> | null
  monitor_config: MonitorConfig | null
  schedule_type: 'one-time' | 'scheduled' | null
  schedule_cron: string | null
  next_run_at: string | null
  last_run_at: string | null
  vm_ip: string | null
  created_at: string
  updated_at: string
}

// Monitor agent configuration for proactive behavior
export interface MonitorConfig {
  checkIntervalMinutes: number
  activeHours: {
    start: string // "HH:MM" format
    end: string
  }
  conditions: MonitorCondition[]
  notifyOnlyOnChange: boolean
  quietIfNothing: boolean
}

export interface MonitorCondition {
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  lastStatus?: 'ok' | 'alert' | 'unknown'
  lastCheckedAt?: string
}

// Heartbeat configuration for periodic agent checks
export interface HeartbeatConfig {
  name: string
  checklist: string
  intervalMinutes: number
  activeHoursStart: string
  activeHoursEnd: string
  timezone: string
  isEnabled: boolean
}

// Structured memory document types (Moltbot-inspired)
export type MemoryDocumentType = 'soul' | 'user_context' | 'long_term_memory' | 'workspace'

export interface MemoryDocument {
  id: string
  agent_id: string
  document_type: MemoryDocumentType
  content: string
  version: number
  created_at: string
  updated_at: string
}

export interface DailyLog {
  id: string
  agent_id: string
  log_date: string
  content: string
  run_count: number
  insights_count: number
  created_at: string
  updated_at: string
}

export interface Conversation {
  id: string
  user_id: string
  title: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface Referral {
  id: string
  referrer_id: string
  referee_id: string | null
  referral_code: string
  status: 'pending' | 'completed' | 'expired'
  credits_awarded: number
  created_at: string
  completed_at: string | null
  expires_at: string | null
}

export interface UserSettings {
  id: string
  user_id: string
  theme: 'light' | 'dark' | 'system'
  language: string
  timezone: string
  voice_profile: VoiceProfile | null
  voice_mirroring_level: 'off' | 'low' | 'medium' | 'high'
  preferred_style: 'operator' | 'consultant' | 'friendly'
  created_at: string
  updated_at: string
}

// Voice Profile - extracted from user's communication patterns
export interface VoiceProfile {
  brevity: 'concise' | 'detailed' | 'balanced'
  directness: 'direct' | 'exploratory' | 'balanced'
  tone: 'calm' | 'energetic' | 'playful' | 'formal'
  structure_preference: 'bullets' | 'numbered' | 'prose' | 'mixed'
  wants_reassurance: boolean
  common_phrases: string[]
  analyzed_at: string
  message_count: number
}

// Message types for the "employee replacement" messaging system
export type MessageType = 
  | 'chat'           // Regular conversation
  | 'assignment'     // AI Manager assigns task to agent
  | 'acknowledgement'// Agent confirms receipt and shares plan
  | 'progress'       // Structured update (done/found/next/eta)
  | 'blocker'        // Agent needs a decision
  | 'access_request' // Agent needs credentials
  | 'completion'     // Task finished with deliverables
  | 'handoff'        // System note about cross-posting

export type MessageSender = 'user' | 'agent' | 'manager' | 'system'

// Structured message metadata for employee-like communication
export interface MessageMetadata {
  type?: MessageType
  sender?: MessageSender
  agent_id?: string
  agent_name?: string
  
  // For assignment messages
  goal?: string
  constraints?: string[]
  deliverable?: string
  
  // For progress messages
  done?: string[]
  found?: string[]
  next?: string[]
  eta_seconds?: number
  
  // For blocker messages
  blocker_question?: string
  options?: { label: string; value: string; impact: string }[]
  requires_user_action?: boolean
  
  // For completion messages
  summary?: string[]
  deliverables?: { name: string; url?: string; type: string }[]
  next_steps?: string[]
  
  // For handoff messages
  source_conversation_id?: string
  target_conversation_id?: string
  handoff_reason?: string
  
  // For cross-posting
  cross_posted_to?: string[]
  cross_posted_from?: string
}

// API Response types
export interface ApiResponse<T> {
  data?: T
  error?: string
  message?: string
}

export interface ReferralInfo {
  referralCode: string
  referralUrl: string
  referralCount: number
  totalCreditsEarned: number
  currentCredits: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamingChatRequest {
  messages: ChatMessage[]
  agentId?: string
}
