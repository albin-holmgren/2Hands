import { createApiClient } from '@2hands/api-client'
import { supabase } from './supabase'

// API URL must be explicitly configured - no fallback to prevent accidental production requests
const API_URL = process.env.EXPO_PUBLIC_API_URL

if (!API_URL) {
  throw new Error(
    'EXPO_PUBLIC_API_URL environment variable is required. ' +
    'Set it in your .env file or app.config.js'
  )
}

export const api = createApiClient({
  baseUrl: API_URL,
  getAccessToken: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  },
})
