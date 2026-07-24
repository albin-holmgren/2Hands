import { type AgentIntegrationToolset } from '@/lib/integrations/agent-tools-bridge'

export interface NemoClawBlueprint {
  name: string
  version: string
  description: string
  agent: {
    model: string
    temperature: number
    system_prompt?: string
  }
  permissions: {
    network: {
      allowed_domains: string[]
      block_local_network: boolean
    }
    filesystem: {
      read_paths: string[]
      write_paths: string[]
    }
  }
  tools: any[]
}

export function generateBlueprintForTask(
  taskId: string, 
  taskDescription: string, 
  integrationToolset: AgentIntegrationToolset
): NemoClawBlueprint {
  return {
    name: `blueprint-${taskId}`,
    version: '1.0.0',
    description: taskDescription,
    agent: {
      model: 'nvidia/nemotron-3-super-120b',
      temperature: 0.2,
      system_prompt: `You are an autonomous agent running inside NVIDIA OpenShell. 
Your task: ${taskDescription}

You have access to specific integrations. Ensure you strictly adhere to the guardrails.`
    },
    permissions: {
      network: {
        allowed_domains: ['*'], // By default allow external web
        block_local_network: true
      },
      filesystem: {
        read_paths: ['/home/agent/downloads'],
        write_paths: ['/home/agent/downloads']
      }
    },
    // Map our Next.js/Anthropic tools to OpenClaw tools
    tools: [
      {
        name: 'web_search',
        description: 'Search the web',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } }
        }
      },
      // Insert mapped integration tools here
      ...integrationToolset.tools.map(t => ({
        name: t.name,
        description: t.description || '',
        parameters: t.input_schema
      }))
    ]
  }
}
