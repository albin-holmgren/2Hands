'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { AgentDetailView } from '@/components/agent/agent-detail-view'
import { useChatStore } from '@/store/chat-store'
import { createClient } from '@/lib/supabase/client'
import type { Agent } from '@/types/database'

export default function AgentPage() {
  const params = useParams()
  const agentId = params.id as string
  const supabase = createClient()
  
  const { 
    currentAgent, 
    setCurrentAgent, 
    agents, 
    setAgentMessages 
  } = useChatStore()

  useEffect(() => {
    const loadAgent = async () => {
      const existingAgent = agents.find(a => a.id === agentId)
      if (existingAgent) {
        setCurrentAgent(existingAgent)
        return
      }

      // Otherwise fetch from database
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .eq('id', agentId)
        .single()

      if (data && !error) {
        setCurrentAgent(data as Agent)
      }
    }

    loadAgent()
    
    // Clear agent messages when switching agents
    setAgentMessages([])
  }, [agentId, agents, setCurrentAgent, setAgentMessages, supabase])

  if (!currentAgent) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading agent...</p>
        </div>
      </div>
    )
  }

  return <AgentDetailView agent={currentAgent} />
}
