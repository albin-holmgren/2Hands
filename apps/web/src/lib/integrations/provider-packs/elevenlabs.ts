import type { ProviderPack } from '../types'

export const elevenlabsProviderPack: ProviderPack = {
  id: 'elevenlabs',
  name: 'ElevenLabs',
  description: 'AI voice generation, text-to-speech, and speech-to-text',
  icon: 'mic',
  apiKeyAuth: {
    headerName: 'xi-api-key',
  },
  credentialKeyField: 'api_key',
  verifyEndpoint: {
    path: '/user',
    method: 'GET',
  },
  baseUrl: 'https://api.elevenlabs.io/v1',
  rateLimits: {
    requestsPerMinute: 30,
  },
}
