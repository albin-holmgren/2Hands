/**
 * Push-to-talk hook (IMPLEMENTATION_MAP Slice 9 voice, mobile).
 *
 * Toggle model mirroring the web hook: first mic press starts an expo-audio
 * recording (asks for mic permission), second press stops it and uploads the
 * capture to `${EXPO_PUBLIC_API_URL}/api/voice/transcribe` with the app's
 * Bearer-token auth pattern. The transcript is delivered via `onTranscript`
 * — there is NO fake transcript path: a 501 voice_not_configured response is
 * surfaced as its own state so the screen can show the "Voice transcription
 * not configured" banner.
 *
 * Privacy: the recording lives only in the app-sandboxed cache file
 * expo-audio writes (cleared by the OS with the cache); it is uploaded once
 * and never referenced again. The server transcribes in memory and retains
 * nothing.
 */

import { useCallback, useRef, useState } from 'react'
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio'
import { supabase } from '@/lib/supabase'

const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim() ?? ''

export type PushToTalkState = 'idle' | 'requesting_permission' | 'recording' | 'transcribing'

export type PushToTalkErrorCode =
  | 'not_configured_client'
  | 'permission_denied'
  | 'no_audio'
  | 'transcribe_failed'
  | 'voice_not_configured'

export interface PushToTalkError {
  code: PushToTalkErrorCode
  message: string
}

export interface UsePushToTalkOptions {
  onTranscript: (transcript: string) => void
  onError?: (error: PushToTalkError) => void
}

export interface UsePushToTalk {
  state: PushToTalkState
  isRecording: boolean
  error: PushToTalkError | null
  /** True after the server reported 501 voice_not_configured. */
  notConfigured: boolean
  start: () => Promise<void>
  stop: () => Promise<void>
  /** Mic-button behavior: start when idle, stop when recording. */
  toggle: () => void
}

export function usePushToTalk({ onTranscript, onError }: UsePushToTalkOptions): UsePushToTalk {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const [state, setState] = useState<PushToTalkState>('idle')
  const [error, setError] = useState<PushToTalkError | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)
  const busyRef = useRef(false)

  const fail = useCallback(
    (code: PushToTalkErrorCode, message: string) => {
      const failure: PushToTalkError = { code, message }
      setError(failure)
      if (code === 'voice_not_configured') setNotConfigured(true)
      setState('idle')
      onError?.(failure)
    },
    [onError]
  )

  const start = useCallback(async () => {
    if (busyRef.current || recorder.isRecording) return
    busyRef.current = true
    try {
      if (!API_URL) {
        fail('not_configured_client', 'EXPO_PUBLIC_API_URL is not set — voice input needs the API base URL.')
        return
      }
      setError(null)
      setState('requesting_permission')
      const permission = await requestRecordingPermissionsAsync()
      if (!permission.granted) {
        fail('permission_denied', 'Microphone access was denied. Allow the mic in Settings to use voice input.')
        return
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      await recorder.prepareToRecordAsync()
      recorder.record()
      setState('recording')
    } catch {
      fail('transcribe_failed', 'Could not start recording. Try again.')
    } finally {
      busyRef.current = false
    }
  }, [recorder, fail])

  const stop = useCallback(async () => {
    if (busyRef.current || !recorder.isRecording) return
    busyRef.current = true
    try {
      await recorder.stop()
      // Recording is done — leave the audio session available for playback.
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined)
      const uri = recorder.uri
      if (!uri) {
        fail('no_audio', 'No audio was captured — try again.')
        return
      }
      setState('transcribing')

      const {
        data: { session },
      } = await supabase.auth.getSession()
      const headers: Record<string, string> = {}
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`

      const form = new FormData()
      // React Native FormData file descriptor — the recording preset is m4a.
      form.append('audio', {
        uri,
        name: 'capture.m4a',
        type: 'audio/mp4',
      } as unknown as Blob)

      const response = await fetch(`${API_URL}/api/voice/transcribe`, {
        method: 'POST',
        headers,
        body: form,
      })
      const body = await response.json().catch(() => null)

      if (response.status === 501) {
        fail(
          'voice_not_configured',
          body?.error?.message ?? 'Voice transcription is not configured on the server.'
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
      setState('idle')
      onTranscript(transcript)
    } catch {
      fail('transcribe_failed', 'Could not reach the transcription service.')
    } finally {
      busyRef.current = false
    }
  }, [recorder, fail, onTranscript])

  const toggle = useCallback(() => {
    if (recorder.isRecording) void stop()
    else void start()
  }, [recorder, start, stop])

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
