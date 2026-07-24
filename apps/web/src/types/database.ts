export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          ai_name: string | null
          plan_type: 'free' | 'starter' | 'pro' | 'business'
          credits: number
          monthly_credits: number
          monthly_credit_cap: number
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: 'active' | 'past_due' | 'canceled' | null
          auto_refill_enabled: boolean
          auto_refill_threshold: number
          auto_refill_amount: number
          billing_period_start: string | null
          credits_reset_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          ai_name?: string | null
          plan_type?: 'free' | 'starter' | 'pro' | 'business'
          credits?: number
          monthly_credits?: number
          monthly_credit_cap?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: 'active' | 'past_due' | 'canceled' | null
          auto_refill_enabled?: boolean
          auto_refill_threshold?: number
          auto_refill_amount?: number
          billing_period_start?: string | null
          credits_reset_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          ai_name?: string | null
          plan_type?: 'free' | 'starter' | 'pro' | 'business'
          credits?: number
          monthly_credits?: number
          monthly_credit_cap?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: 'active' | 'past_due' | 'canceled' | null
          auto_refill_enabled?: boolean
          auto_refill_threshold?: number
          auto_refill_amount?: number
          billing_period_start?: string | null
          credits_reset_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      conversations: {
        Row: {
          id: string
          user_id: string
          title: string | null
          status: 'active' | 'archived'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title?: string | null
          status?: 'active' | 'archived'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string | null
          status?: 'active' | 'archived'
          created_at?: string
          updated_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          role: 'user' | 'assistant' | 'system'
          content: string
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          role: 'user' | 'assistant' | 'system'
          content: string
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          role?: 'user' | 'assistant' | 'system'
          content?: string
          metadata?: Json
          created_at?: string
        }
      }
      agents: {
        Row: {
          id: string
          user_id: string
          conversation_id: string | null
          name: string
          type: string
          status: 'initializing' | 'idle' | 'working' | 'completed' | 'failed' | 'terminated'
          vm_id: string | null
          vm_ip: string | null
          config: Json
          created_at: string
          last_active: string
          schedule_type: 'realtime' | 'scheduled' | 'once'
          schedule_cron: string | null
          schedule_timezone: string
          next_run_at: string | null
          last_run_at: string | null
          estimated_cost_per_run: number
          total_credits_used: number
        }
        Insert: {
          id?: string
          user_id: string
          conversation_id?: string | null
          name: string
          type: string
          status?: 'initializing' | 'idle' | 'working' | 'completed' | 'failed' | 'terminated'
          vm_id?: string | null
          vm_ip?: string | null
          config?: Json
          created_at?: string
          last_active?: string
          schedule_type?: 'realtime' | 'scheduled' | 'once'
          schedule_cron?: string | null
          schedule_timezone?: string
          next_run_at?: string | null
          last_run_at?: string | null
          estimated_cost_per_run?: number
          total_credits_used?: number
        }
        Update: {
          id?: string
          user_id?: string
          conversation_id?: string | null
          name?: string
          type?: string
          status?: 'initializing' | 'idle' | 'working' | 'completed' | 'failed' | 'terminated'
          vm_id?: string | null
          vm_ip?: string | null
          config?: Json
          created_at?: string
          last_active?: string
          schedule_type?: 'realtime' | 'scheduled' | 'once'
          schedule_cron?: string | null
          schedule_timezone?: string
          next_run_at?: string | null
          last_run_at?: string | null
          estimated_cost_per_run?: number
          total_credits_used?: number
        }
      }
      tasks: {
        Row: {
          id: string
          agent_id: string
          type: string
          description: string | null
          status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
          input: Json
          output: Json
          screenshots: string[] | null
          error: string | null
          priority: number
          started_at: string | null
          completed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          agent_id: string
          type: string
          description?: string | null
          status?: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
          input?: Json
          output?: Json
          screenshots?: string[] | null
          error?: string | null
          priority?: number
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          agent_id?: string
          type?: string
          description?: string | null
          status?: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
          input?: Json
          output?: Json
          screenshots?: string[] | null
          error?: string | null
          priority?: number
          started_at?: string | null
          completed_at?: string | null
          created_at?: string
        }
      }
      credentials: {
        Row: {
          id: string
          user_id: string
          service_name: string
          credential_type: 'password' | 'oauth' | 'api_key' | 'cookie'
          encrypted_data: string
          iv: string
          created_at: string
          expires_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          service_name: string
          credential_type: 'password' | 'oauth' | 'api_key' | 'cookie'
          encrypted_data: string
          iv: string
          created_at?: string
          expires_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          service_name?: string
          credential_type?: 'password' | 'oauth' | 'api_key' | 'cookie'
          encrypted_data?: string
          iv?: string
          created_at?: string
          expires_at?: string | null
        }
      }
      integration_connections: {
        Row: {
          id: string
          user_id: string
          provider: string
          status: string
          credential_id: string | null
          config: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          provider: string
          status?: string
          credential_id?: string | null
          config?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          provider?: string
          status?: string
          credential_id?: string | null
          config?: Json
          created_at?: string
          updated_at?: string
        }
      }
      integration_threads: {
        Row: {
          id: string
          user_id: string
          connection_id: string
          provider: string
          external_thread_id: string
          conversation_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          connection_id: string
          provider: string
          external_thread_id: string
          conversation_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          connection_id?: string
          provider?: string
          external_thread_id?: string
          conversation_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      inbound_event_dedupe: {
        Row: {
          id: string
          connection_id: string
          provider: string
          external_event_id: string
          created_at: string
        }
        Insert: {
          id?: string
          connection_id: string
          provider: string
          external_event_id: string
          created_at?: string
        }
        Update: {
          id?: string
          connection_id?: string
          provider?: string
          external_event_id?: string
          created_at?: string
        }
      }
      integration_delivery_log: {
        Row: {
          id: string
          connection_id: string
          provider: string
          idempotency_key: string | null
          external_thread_id: string | null
          conversation_id: string | null
          status: string
          attempt_count: number
          last_attempt_at: string | null
          next_attempt_at: string | null
          payload: Json
          response: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          connection_id: string
          provider: string
          idempotency_key?: string | null
          external_thread_id?: string | null
          conversation_id?: string | null
          status?: string
          attempt_count?: number
          last_attempt_at?: string | null
          next_attempt_at?: string | null
          payload?: Json
          response?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          connection_id?: string
          provider?: string
          idempotency_key?: string | null
          external_thread_id?: string | null
          conversation_id?: string | null
          status?: string
          attempt_count?: number
          last_attempt_at?: string | null
          next_attempt_at?: string | null
          payload?: Json
          response?: Json
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Conversation = Database['public']['Tables']['conversations']['Row']
export type Message = Database['public']['Tables']['messages']['Row']
export type Agent = Database['public']['Tables']['agents']['Row']
export type Task = Database['public']['Tables']['tasks']['Row']
export type Credential = Database['public']['Tables']['credentials']['Row']
