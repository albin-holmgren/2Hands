/**
 * Minimal App Store Connect API client.
 *
 * Exists so the TestFlight steps after an upload — waiting for processing,
 * clearing export compliance, putting the build in front of testers — can be
 * done from the terminal instead of by clicking through the console.
 *
 * Credentials come from the environment; nothing is written to disk.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'

const KEY_ID = process.env.ASC_KEY_ID
const ISSUER_ID = process.env.ASC_ISSUER_ID
const KEY_PATH = process.env.ASC_KEY_PATH

export function token() {
  if (!KEY_ID || !ISSUER_ID || !KEY_PATH) {
    throw new Error('Set ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_PATH')
  }
  const key = fs.readFileSync(KEY_PATH)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const header = b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })
  const payload = b64({ iss: ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' })
  const signature = crypto
    .sign('sha256', Buffer.from(`${header}.${payload}`), { key, dsaEncoding: 'ieee-p1363' })
    .toString('base64url')
  return `${header}.${payload}.${signature}`
}

export async function asc(method, path, body) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    const detail = (() => {
      try {
        return JSON.parse(text).errors?.map((e) => `${e.title}: ${e.detail}`).join('; ')
      } catch {
        return text.slice(0, 300)
      }
    })()
    throw new Error(`ASC ${method} ${path} → ${res.status}: ${detail}`)
  }
  return text ? JSON.parse(text) : undefined
}
