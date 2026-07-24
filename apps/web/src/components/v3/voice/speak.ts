/**
 * Tiny spoken-reply util over the browser's built-in speechSynthesis
 * (IMPLEMENTATION_MAP Slice 9 voice; no external TTS, no audio retained).
 *
 * Callers gate on the user's "voice replies" toggle — this module never
 * decides on its own to speak. `speak()` cancels any in-flight utterance so
 * replies never overlap.
 */

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export interface SpeakOptions {
  /** 0.1–10; default 1. */
  rate?: number
  /** 0–2; default 1. */
  pitch?: number
  /** BCP-47 tag, e.g. "en-US". Defaults to the browser voice. */
  lang?: string
  onEnd?: () => void
}

/** Speak `text` aloud. No-op when speechSynthesis is unavailable or text is empty. */
export function speak(text: string, options: SpeakOptions = {}): void {
  if (!isSpeechSupported()) return
  const trimmed = text.trim()
  if (!trimmed) return

  // One reply at a time — cancel anything still speaking.
  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(trimmed)
  if (options.rate !== undefined) utterance.rate = options.rate
  if (options.pitch !== undefined) utterance.pitch = options.pitch
  if (options.lang) utterance.lang = options.lang
  if (options.onEnd) utterance.onend = options.onEnd
  window.speechSynthesis.speak(utterance)
}

/** Stop any in-flight speech immediately. */
export function stopSpeaking(): void {
  if (!isSpeechSupported()) return
  window.speechSynthesis.cancel()
}
