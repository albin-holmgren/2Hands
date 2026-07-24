export interface NemoClawRunParams {
  task: string
  tools?: any[]
  env?: Record<string, string>
}

export interface NemoClawRunResponse {
  runId: string
  status: 'running' | 'completed' | 'failed'
}

export class NemoClawClient {
  private baseUrl: string

  constructor(vmIp: string, port = 8000) {
    this.baseUrl = `http://${vmIp}:${port}`
  }

  async startRun(params: NemoClawRunParams): Promise<NemoClawRunResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NVIDIA_API_KEY || ''}`
      },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      throw new Error(`Failed to start NemoClaw run: ${response.statusText}`)
    }

    return response.json()
  }

  async getRunStatus(runId: string) {
    const response = await fetch(`${this.baseUrl}/api/v1/runs/${runId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.NVIDIA_API_KEY || ''}`
      }
    })
    
    if (!response.ok) {
      throw new Error(`Failed to get run status: ${response.statusText}`)
    }

    return response.json()
  }
}
