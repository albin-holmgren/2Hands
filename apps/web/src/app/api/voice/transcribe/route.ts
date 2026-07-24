import { NextRequest } from 'next/server'
import { checkRateLimit, createRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import { resolveV3Scope, success, failure, failureFromError } from '@/lib/v3/route-helpers'

/**
 * POST /api/voice/transcribe — speech-to-text for the v3 push-to-talk flow
 * (IMPLEMENTATION_MAP Slice 9 voice).
 *
 * Privacy contract: the uploaded audio is processed entirely in memory —
 * never written to disk, never stored, never logged — and only the resulting
 * transcript is returned. No transcript is ever fabricated: without a real
 * transcription backend this route answers 501 `voice_not_configured`.
 *
 * Backend selection (installed deps only — the `ai` v6 SDK is present but no
 * transcription-capable provider package is; `@ai-sdk/gateway` has no
 * transcription support, so `AI_GATEWAY_API_KEY` alone is not a viable path):
 * - `OPENAI_API_KEY` set → OpenAI `whisper-1` via the official REST endpoint
 *   (multipart, in-memory).
 * - otherwise → 501 with precise setup instructions.
 */

export const runtime = 'nodejs'

const MAX_AUDIO_BYTES = 15 * 1024 * 1024 // 15 MB ≈ several minutes of opus

const NOT_CONFIGURED_MESSAGE =
  'Voice transcription is not configured. Set OPENAI_API_KEY in apps/web (used for Whisper speech-to-text). ' +
  'AI_GATEWAY_API_KEY alone is not sufficient — the AI Gateway provider does not expose transcription models. ' +
  'After setting the key, restart the dev server.'

export async function POST(request: NextRequest) {
  const scoped = await resolveV3Scope(request)
  if (!scoped.ok) return scoped.response
  const { scope } = scoped

  try {
    const rateKey = createRateLimitKey(scope.userId, 'v3-voice-transcribe')
    const rateCheck = await checkRateLimit(rateKey, RATE_LIMITS.general)
    if (!rateCheck.allowed) {
      return failure(429, 'rate_limited', 'Too many requests', scope.requestId, true)
    }

    const openAiKey = process.env.OPENAI_API_KEY?.trim()
    if (!openAiKey) {
      return failure(501, 'voice_not_configured', NOT_CONFIGURED_MESSAGE, scope.requestId)
    }

    const form = await request.formData().catch(() => null)
    const audio = form?.get('audio')
    if (!(audio instanceof Blob) || audio.size === 0) {
      return failure(400, 'missing_audio', "multipart field 'audio' (non-empty) is required", scope.requestId)
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return failure(413, 'audio_too_large', 'Audio exceeds the 15 MB limit', scope.requestId)
    }

    // In-memory pass-through to OpenAI Whisper. The blob is only ever held in
    // this request's memory; nothing is persisted or logged.
    const upstreamForm = new FormData()
    const filename = audio instanceof File && audio.name ? audio.name : 'capture.webm'
    upstreamForm.append('file', audio, filename)
    upstreamForm.append('model', 'whisper-1')
    upstreamForm.append('response_format', 'json')

    const upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAiKey}` },
      body: upstreamForm,
      signal: AbortSignal.timeout(60_000),
    })

    if (!upstream.ok) {
      // Do not forward provider error bodies (may echo request details).
      const code = upstream.status === 401 ? 'voice_backend_auth_failed' : 'transcription_failed'
      return failure(502, code, `Transcription backend returned ${upstream.status}`, scope.requestId, true)
    }

    const payload = (await upstream.json().catch(() => null)) as { text?: unknown } | null
    const transcript = typeof payload?.text === 'string' ? payload.text.trim() : ''
    return success({ transcript, provider: 'openai:whisper-1' }, scope.requestId)
  } catch (error) {
    return failureFromError(error, scope.requestId)
  }
}
