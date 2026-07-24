import type { McpTool, McpToolResult } from '../types'

async function elevenlabsApiCall(
  path: string,
  apiKey: string,
  body: Record<string, unknown>,
  expectJson = true
): Promise<McpToolResult> {
  const res = await fetch(`https://api.elevenlabs.io/v1${path}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!expectJson) {
    // Audio response — return metadata only
    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error')
      return { success: false, error: errText, statusCode: res.status }
    }
    return {
      success: true,
      data: {
        contentType: res.headers.get('content-type'),
        message: 'Audio generated successfully. Content-Type: ' + res.headers.get('content-type'),
      },
      statusCode: res.status,
    }
  }

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!data) {
    return { success: false, error: 'Invalid response from ElevenLabs', statusCode: res.status }
  }

  if (!res.ok) {
    return { success: false, error: String(data.detail || JSON.stringify(data)), statusCode: res.status, data }
  }

  return { success: true, data, statusCode: res.status }
}

async function elevenlabsGetCall(
  path: string,
  apiKey: string
): Promise<McpToolResult> {
  const res = await fetch(`https://api.elevenlabs.io/v1${path}`, {
    method: 'GET',
    headers: { 'xi-api-key': apiKey },
  })

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!data) {
    return { success: false, error: 'Invalid response from ElevenLabs', statusCode: res.status }
  }

  if (!res.ok) {
    return { success: false, error: String(data.detail || JSON.stringify(data)), statusCode: res.status, data }
  }

  return { success: true, data, statusCode: res.status }
}

export const elevenlabsTextToSpeech: McpTool = {
  name: 'elevenlabs_text_to_speech',
  description: 'Convert text to speech using ElevenLabs AI voices. Returns audio generation confirmation.',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The text to convert to speech',
      },
      voice_id: {
        type: 'string',
        description: 'Voice ID to use. Use elevenlabs_list_voices to find available voices.',
      },
      model_id: {
        type: 'string',
        description: 'Model to use (default: eleven_multilingual_v2)',
      },
    },
    required: ['text'],
  },
  execute: async (input, ctx) => {
    const apiKey = ctx.credentials.apiKey
    if (!apiKey) return { success: false, error: 'ElevenLabs API key not configured' }

    const voiceId = String(input.voice_id || '21m00Tcm4TlvDq8ikWAM') // Rachel default
    return elevenlabsApiCall(
      `/text-to-speech/${voiceId}`,
      apiKey,
      {
        text: String(input.text),
        model_id: String(input.model_id || 'eleven_multilingual_v2'),
      },
      false // Returns audio binary, not JSON
    )
  },
}

export const elevenlabsListVoices: McpTool = {
  name: 'elevenlabs_list_voices',
  description: 'List all available ElevenLabs voices including their IDs, names, and descriptions.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  execute: async (_input, ctx) => {
    const apiKey = ctx.credentials.apiKey
    if (!apiKey) return { success: false, error: 'ElevenLabs API key not configured' }

    return elevenlabsGetCall('/voices', apiKey)
  },
}

export const elevenlabsTools: McpTool[] = [elevenlabsTextToSpeech, elevenlabsListVoices]
