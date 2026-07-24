/**
 * Executor Utilities
 * Helper functions for the agent executor
 */

import type { ActionInfo, ProgressType } from './types'
import { createSignedHeaders } from '@/lib/security/hmac'

/**
 * Generate action info for user-visible action indicators
 */
export function getActionInfo(
  toolName: string,
  input: Record<string, unknown>
): ActionInfo | null {
  switch (toolName) {
    case 'type_text': {
      const text = String(input.text || '')
      // Check if typing a URL (browsing)
      if (
        text.startsWith('http://') ||
        text.startsWith('https://') ||
        text.startsWith('www.')
      ) {
        const url = text
          .replace(/^https?:\/\//, '')
          .replace(/^www\./, '')
          .split('/')[0]
        return { type: 'browse', target: text, message: `Browsed ${url}` }
      }
      // Check if typing in a search box (searching)
      if (text.length > 3 && text.length < 100 && !text.includes('\n')) {
        return {
          type: 'search',
          target: text,
          message: `Searched "${text.slice(0, 40)}${text.length > 40 ? '...' : ''}"`,
        }
      }
      return null
    }
    case 'screenshot':
      return { type: 'read', target: 'screen', message: 'Reading page content' }
    case 'get_page_state':
      return { type: 'read', target: 'page', message: 'Reading page content' }
    case 'scroll':
      return {
        type: 'scroll',
        target: String(input.direction || 'down'),
        message: `Scrolled ${input.direction || 'down'}`,
      }
    case 'click':
      return {
        type: 'click',
        target: `${input.x},${input.y}`,
        message: 'Clicked on screen',
      }
    default:
      return null
  }
}

/**
 * Send progress update to the agent progress endpoint
 */
export async function sendProgressUpdate(
  agentId: string,
  runId: string,
  type: ProgressType,
  message: string,
  data?: Record<string, unknown>
): Promise<void> {
  const configuredBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim()
  const baseUrl =
    process.env.NODE_ENV === 'production'
      ? configuredBaseUrl || 'http://localhost:3000'
      : 'http://localhost:3000'

  const url = `${baseUrl}/api/agents/progress`

  try {
    const payload = JSON.stringify({ agentId, runId, type, message, data })
    const signedHeaders = createSignedHeaders(payload)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...signedHeaders,
      },
      body: payload,
    })

    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      console.error('[AgentExecutor] Progress update failed:', {
        status: response.status,
        result,
      })
    }
  } catch (error) {
    console.error('[AgentExecutor] Failed to send progress update:', error)
  }
}

/**
 * Sanitize VM IP for logging (privacy/security)
 */
export function sanitizeVmIp(ip: string): string {
  if (!ip || ip === 'localhost' || ip === '127.0.0.1' || ip === 'api-only') {
    return ip
  }
  // Return first 2 octets only for privacy
  const parts = ip.split('.')
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.*.*`
  }
  return '***'
}

/**
 * Format duration for human-readable display
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

/**
 * Check if a URL is the same as previous (for stuck detection)
 */
export function isSameUrl(url1: string, url2: string | null): boolean {
  if (!url2) return false
  // Normalize URLs for comparison
  const normalize = (url: string) =>
    url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()
  return normalize(url1) === normalize(url2)
}
