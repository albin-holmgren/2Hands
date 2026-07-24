'use client'

import { create } from 'zustand'
import type { Profile } from '@/types/database'
import type { User } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  loading: boolean
  profile: Profile | null
  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void
  setProfile: (profile: Profile | null) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  profile: null,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  setProfile: (profile) => {
    // Only update if profile actually changed to prevent unnecessary re-renders
    const current = get().profile
    if (current?.id === profile?.id && 
        current?.ai_name === profile?.ai_name && 
        current?.full_name === profile?.full_name &&
        current?.credits === profile?.credits &&
        current?.plan_type === profile?.plan_type) {
      return // No change, skip update
    }
    set({ profile })
  },
}))
