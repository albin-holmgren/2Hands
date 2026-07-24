'use client'

/**
 * Push-to-talk hook (IMPLEMENTATION_MAP Slice 9 voice, web).
 *
 * Toggle model: first mic press starts a MediaRecorder capture (browser
 * permission prompt included), second press stops it and POSTs the recorded
 * audio to /api/voice/transcribe. The final transcript is delivered via
 * `onTranscript` — there is NO fake/dev transcript path: when the server
 * responds 501 voice_not_configured the hook surfaces that state and nothing
 * is transcribed.
 *
 * Privacy: audio lives only in this hook's in-memory chunks and the request
 * body; the server transcribes in memory and retains nothing. Chunks are
 * dropped as soon as the request settles.
 */

import * as React from 'react'

export type PushToTalkState =
  | 'idle'
  | 'requesting_permission'
  | 'recording'
  | 'transcribing'

export type PushToTalkErrorCode =
  | 'unsupported'
  | 'permission_denied'
  | 'no_audio'
  | 'transcribe_failed'
  | 'voice_not_configured'

export interface PushToTalkError {
  code: PushToTalkErrorCode
  message: string
}

export interface UsePushToTalkOptions {
  /** Called with the final transcript after a successful stop+transcribe. */
  onTranscript: (transcript: string) => void
  /** Optional error/not-configured surface (banner, toast, …). */
  onError?: (error: PushToTalkError) => void
}

export interface UsePushToTalk {
  state: PushToTalkState
  /** Convenience flag — true while audio is being captured. */
  isRecording: boolean
  /** Last error; cleared on the next successful start. */
  error: PushToTalkError | null
  /** True after the server reported 501 voice_not_configured. */
  notConfigured: boolean
  /** Start capturing (prompts for mic permission on first use). */
  start: () => Promise<void>
  /** Stop capturing and transcribe. */
  stop: () => void
  /** Mic-button behavior: start when idle, stop when recording. */
  toggle: () => void
}

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
]

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
}

export function usePushToTalk({ onTranscript, onError }: UsePushToTalkOptions): UsePushToTalk {
  const [state, setState] = React.useState<PushToTalkState>('idle')
  const [error, setError] = React.useState<PushToTalkError | null>(null)
  const [notConfigured, setNotConfigured] = React.useState(false)

  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const chunksRef = React.useRef<Blob[]>([])
  const mountedRef = React.useRef(true)

  const onTranscriptRef = React.useRef(onTranscript)
  const onErrorRef = React.useRef(onError)
  onTranscriptRef.current = onTranscript
  onErrorRef.current = onError

  const releaseStream = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    recorderRef.current = null
  }, [])

  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      try {
        recorderRef.current?.stop()
      } catch {
        /* already inactive */
      }
      releaseStream()
      chunksRef.current = []
    }
  }, [releaseStream])

  const fail = React.useCallback((code: PushToTalkErrorCode, message: string) => {
    const failure: PushToTalkError = { code, message }
    if (mountedRef.current) {
      setError(failure)
      if (code === 'voice_not_configured') setNotConfigured(true)
      setState('idle')
    }
    onErrorRef.current?.(failure)
  }, [])

  const transcribe = React.useCallback(
    async (blob: Blob) => {
      if (blob.size === 0) {
        fail('no_audio', 'No audio was captured — try holding the mic a moment longer.')
        return
      }
      if (mountedRef.current) setState('transcribing')
      try {
        const form = new FormData()
        const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
        form.append('audio', blob, `capture.${extension}`)

        const response = await fetch('/api/voice/transcribe', { method: 'POST', body: form })
        const body = await response.json().catch(() => null)

        if (response.status === 501) {
          fail(
            'voice_not_configured',
            body?.error?.message ??
              'Voice transcription is not configured on this server.'
          )
          return
        }
        if (!response.ok || !body?.ok) {
          fail('transcribe_failed', body?.error?.message ?? 'Transcription failed. Try again.')
          return
        }

        const transcript = typeof body.data?.transcript === 'string' ? body.data.transcript.trim() : ''
        if (!transcript) {
          fail('no_audio', 'Nothing was heard — try again closer to the microphone.')
          return
        }
        if (mountedRef.current) setState('idle')
        onTranscriptRef.current(transcript)
      } catch {
        fail('transcribe_failed', 'Could not reach the transcription service.')
      } finally {
        chunksRef.current = []
      }
    },
    [fail]
  )

  const start = React.useCallback(async () => {
    if (recorderRef.current) return // already recording
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      fail('unsupported', 'Voice capture is not supported in this browser.')
      return
    }

    setError(null)
    setState('requesting_permission')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      fail('permission_denied', 'Microphone access was denied. Allow the mic to use voice input.')
      return
    }
    if (!mountedRef.current) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }

    const mimeType = pickMimeType()
    let recorder: MediaRecorder
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    } catch {
      stream.getTracks().forEach((track) => track.stop())
      fail('unsupported', 'Voice capture is not supported in this browser.')
      return
    }

    chunksRef.current = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      releaseStream()
      void transcribe(blob)
    }
    recorder.onerror = () => {
      releaseStream()
      chunksRef.current = []
      fail('transcribe_failed', 'Recording failed. Try again.')
    }

    streamRef.current = stream
    recorderRef.current = recorder
    recorder.start()
    setState('recording')
  }, [fail, releaseStream, transcribe])

  const stop = React.useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder) return
    if (recorder.state !== 'inactive') recorder.stop()
    else releaseStream()
  }, [releaseStream])

  const toggle = React.useCallback(() => {
    if (recorderRef.current) stop()
    else void start()
  }, [start, stop])

  return {
    state,
    isRecording: state === 'recording',
    error,
    notConfigured,
    start,
    stop,
    toggle,
  }
}
