// 2Hands API Client
// Shared client for web and mobile apps

import type {
  Agent,
  Profile,
  ReferralInfo,
  ApiResponse,
  ChatMessage,
  UserSettings,
} from '@2hands/types'

export interface ApiClientConfig {
  baseUrl: string
  getAccessToken: () => Promise<string | null>
}

export class TwoHandsApiClient {
  private config: ApiClientConfig

  constructor(config: ApiClientConfig) {
    this.config = config
  }

  private async getHeaders(): Promise<HeadersInit> {
    const token = await this.config.getAccessToken()
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return headers
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const headers = await this.getHeaders()
      const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          ...headers,
          ...options.headers,
        },
      })

      const data = await response.json()

      if (!response.ok) {
        return { error: data.error || 'Request failed' }
      }

      return { data }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Network error' }
    }
  }

  // Profile
  async getProfile(): Promise<ApiResponse<Profile>> {
    return this.request<Profile>('/api/profile')
  }

  async updateProfile(updates: Partial<Profile>): Promise<ApiResponse<Profile>> {
    return this.request<Profile>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
  }

  // Agents
  async getAgents(): Promise<ApiResponse<Agent[]>> {
    return this.request<Agent[]>('/api/agents')
  }

  async getAgent(id: string): Promise<ApiResponse<Agent>> {
    return this.request<Agent>(`/api/agents/${id}`)
  }

  async createAgent(data: Partial<Agent>): Promise<ApiResponse<Agent>> {
    return this.request<Agent>('/api/agents', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateAgent(id: string, updates: Partial<Agent>): Promise<ApiResponse<Agent>> {
    return this.request<Agent>(`/api/agents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
  }

  async deleteAgent(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/agents/${id}`, {
      method: 'DELETE',
    })
  }

  // Referrals
  async getReferralInfo(): Promise<ApiResponse<ReferralInfo>> {
    return this.request<ReferralInfo>('/api/referral')
  }

  async applyReferralCode(code: string): Promise<ApiResponse<{ success: boolean; message: string }>> {
    return this.request('/api/referral', {
      method: 'POST',
      body: JSON.stringify({ referralCode: code }),
    })
  }

  // Settings
  async getSettings(): Promise<ApiResponse<UserSettings>> {
    return this.request<UserSettings>('/api/settings')
  }

  async updateSettings(updates: Partial<UserSettings>): Promise<ApiResponse<UserSettings>> {
    return this.request<UserSettings>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
  }

  // Chat (non-streaming for mobile MVP)
  async sendMessage(messages: ChatMessage[], agentId?: string): Promise<ApiResponse<{ content: string }>> {
    return this.request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ messages, agentId }),
    })
  }

  // Notifications
  async getNotifications(limit = 20, unreadOnly = false): Promise<ApiResponse<{
    notifications: Array<{
      id: string
      type: string
      title: string
      body: string | null
      agent_id: string | null
      is_read: boolean
      requires_action: boolean
      created_at: string
    }>
    unreadCount: number
  }>> {
    const params = new URLSearchParams({ limit: String(limit) })
    if (unreadOnly) params.set('unread', 'true')
    return this.request(`/api/notifications?${params}`)
  }

  async markNotificationsRead(): Promise<ApiResponse<{ success: boolean }>> {
    return this.request('/api/notifications', {
      method: 'POST',
      body: JSON.stringify({ action: 'mark_read' }),
    })
  }

  // Health check
  async healthCheck(): Promise<ApiResponse<{ status: string }>> {
    return this.request('/api/health')
  }
}

// Factory function
export function createApiClient(config: ApiClientConfig): TwoHandsApiClient {
  return new TwoHandsApiClient(config)
}

// Re-export types
export * from '@2hands/types'

// v3 client (tasks, safe events, approvals, receipts)
export { V3ApiClient, createV3ApiClient } from './v3'
export type { V3TaskDto, V3ApprovalDto, V3ReceiptDto } from './v3'
