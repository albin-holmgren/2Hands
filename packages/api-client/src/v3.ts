// 2Hands v3 API client — tasks, safe events, approvals, receipts.
// Server responses use the ApiSuccess/ApiFailure envelope with requestId.

import type { ApiResult, EventEnvelope, Task, TaskStatus } from '@2hands/types/v3'
import type { ApiClientConfig } from './index'

export interface V3TaskDto {
  id: string
  workspace_id: string
  user_id: string
  conversation_id: string | null
  goal: string
  status: TaskStatus
  waiting_reason: string | null
  safe_error: { code: string; message: string; retryable: boolean } | null
  created_at: string
  updated_at: string
}

export interface V3ApprovalDto {
  id: string
  task_id: string | null
  risk_class: string
  category: string | null
  title: string
  summary: string
  canonical_action: Record<string, unknown>
  canonical_action_hash: string
  reversibility: string
  estimated_max_cost_credits: number | null
  status: string
  challenge: string
  expires_at: string
  created_at: string
}

export interface V3ReceiptDto {
  id: string
  task_id: string | null
  kind: string
  title: string
  summary: string
  evidence: Array<{ kind: string; ref: string; label?: string }>
  outcome: string
  created_at: string
}

export class V3ApiClient {
  constructor(private config: ApiClientConfig) {}

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResult<T>> {
    const token = await this.config.getAccessToken()
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
    try {
      const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
        ...options,
        headers: { ...headers, ...options.headers },
      })
      const body = (await response.json()) as ApiResult<T>
      return body
    } catch (error) {
      return {
        ok: false,
        error: {
          code: 'network_error',
          message: error instanceof Error ? error.message : 'Network error',
          retryable: true,
        },
        requestId: 'client',
      }
    }
  }

  async createTask(input: { goal: string; conversationId?: string }): Promise<ApiResult<{ task: V3TaskDto }>> {
    return this.request('/api/tasks', { method: 'POST', body: JSON.stringify(input) })
  }

  async listTasks(): Promise<ApiResult<{ tasks: V3TaskDto[] }>> {
    return this.request('/api/tasks')
  }

  async getTask(taskId: string): Promise<ApiResult<{ task: V3TaskDto }>> {
    return this.request(`/api/tasks/${taskId}`)
  }

  async cancelTask(taskId: string): Promise<ApiResult<{ transition: unknown }>> {
    return this.request(`/api/tasks/${taskId}/cancel`, { method: 'POST' })
  }

  /** Cursor replay; pass the last rendered sequence to resume. */
  async getTaskEvents(
    taskId: string,
    cursor = 0,
  ): Promise<ApiResult<{ events: EventEnvelope[]; nextCursor: number | null; taskStatus: TaskStatus }>> {
    return this.request(`/api/tasks/${taskId}/events?cursor=${cursor}`)
  }

  /**
   * Respond to an exact approval. `challenge` and `actionHash` must be the
   * values rendered to the user; the server rejects on any drift.
   */
  async respondApproval(input: {
    approvalId: string
    response: 'approved' | 'denied'
    challenge: string
    actionHash: string
    idempotencyKey: string
  }): Promise<ApiResult<{ result: { approvalId: string; status: string } }>> {
    const { approvalId, ...body } = input
    return this.request(`/api/approvals/${approvalId}/respond`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  async listReceipts(taskId?: string): Promise<ApiResult<{ receipts: V3ReceiptDto[] }>> {
    const suffix = taskId ? `?taskId=${taskId}` : ''
    return this.request(`/api/receipts${suffix}`)
  }
}

export function createV3ApiClient(config: ApiClientConfig): V3ApiClient {
  return new V3ApiClient(config)
}

export type { Task as V3Task, TaskStatus as V3TaskStatus, EventEnvelope as V3EventEnvelope }
