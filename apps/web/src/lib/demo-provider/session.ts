/**
 * Demo Account Provider — HMAC-signed cookie state.
 *
 * All demo-provider state is carried in signed, HttpOnly, `demo_provider_*`
 * namespaced cookies so the fake backend is deterministic and needs no product
 * auth or server-side session table. Passwords are only ever stored as SHA-256
 * digests; no plaintext secret is written to cookies, tables, or logs.
 */
import crypto from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'
import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'

export const DEMO_COOKIE_SESSION = 'demo_provider_session'
export const DEMO_COOKIE_ACCOUNT = 'demo_provider_account'
export const DEMO_COOKIE_PENDING = 'demo_provider_pending'

export const DEMO_SESSION_TTL_MS = 8 * 60 * 60 * 1000 // 8 hours
export const DEMO_PENDING_TTL_MS = 10 * 60 * 1000 // 10 minutes

export interface DemoSession {
  email: string
  plan: 'free' | 'demo_pro'
  /** Terms version accepted by this account, absent until accepted. */
  termsVersion?: string
  createdAt: string
  expiresAt: string
}

/** A signup-created fixture account (the static fixture user is not stored). */
export interface DemoAccount {
  email: string
  passwordSha256: string
  termsVersion?: string
  plan: 'free' | 'demo_pro'
  createdAt: string
}

/** In-flight OTP / magic-link challenge. Stores only a digest of the proof. */
export interface DemoPending {
  kind: 'otp' | 'magic_link'
  email: string
  proofSha256: string
  expiresAt: string
}

/** Payload of the HMAC-signed magic-link token (transported in the link URL). */
export interface DemoMagicToken {
  email: string
  nonce: string
  expiresAt: string
}

function signingKey(): Buffer {
  // Dev/CI fixture site: a deterministic default is acceptable; env-overridable.
  const secret = process.env.DEMO_PROVIDER_SIGNING_SECRET || 'demo-provider-local-signing-secret'
  return crypto.createHash('sha256').update(secret).digest()
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

/** Constant-time comparison of two hex digests. */
export function digestsEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  if (bufA.length === 0 || bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function hmac(data: string): string {
  return crypto.createHmac('sha256', signingKey()).update(data).digest('base64url')
}

/** Serialize + sign a payload for cookie/token transport. */
export function encodeSigned(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${body}.${hmac(body)}`
}

/** Verify + parse a signed value. Returns null on any tampering/parse failure. */
export function decodeSigned<T>(raw: string | undefined | null): T | null {
  if (!raw) return null
  const dot = raw.lastIndexOf('.')
  if (dot <= 0) return null
  const body = raw.slice(0, dot)
  const signature = raw.slice(dot + 1)
  const expected = hmac(body)
  const sigBuf = Buffer.from(signature)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}

function isExpired(expiresAt: string | undefined): boolean {
  if (!expiresAt) return true
  const at = Date.parse(expiresAt)
  return Number.isNaN(at) || at <= Date.now()
}

type CookieSource = NextRequest['cookies'] | ReadonlyRequestCookies

/** Read the session cookie; returns null when missing, tampered, or expired. */
export function readDemoSession(cookies: CookieSource): DemoSession | null {
  const session = decodeSigned<DemoSession>(cookies.get(DEMO_COOKIE_SESSION)?.value)
  if (!session || isExpired(session.expiresAt)) return null
  return session
}

export function readDemoAccount(cookies: CookieSource): DemoAccount | null {
  return decodeSigned<DemoAccount>(cookies.get(DEMO_COOKIE_ACCOUNT)?.value)
}

/** Read the pending OTP/magic-link challenge; null when missing or expired. */
export function readDemoPending(cookies: CookieSource): DemoPending | null {
  const pending = decodeSigned<DemoPending>(cookies.get(DEMO_COOKIE_PENDING)?.value)
  if (!pending || isExpired(pending.expiresAt)) return null
  return pending
}

export function setSignedCookie(
  response: NextResponse,
  name: string,
  payload: object,
  maxAgeSeconds: number,
): void {
  response.cookies.set(name, encodeSigned(payload), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  })
}

export function clearDemoCookie(response: NextResponse, name: string): void {
  response.cookies.set(name, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
}
