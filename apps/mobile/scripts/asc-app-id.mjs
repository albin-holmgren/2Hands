// Resolve an App Store Connect app id from a bundle identifier.
//
// Prints the numeric id on stdout, or explains what is missing on stderr and
// exits non-zero. Used by submit-ios.sh so a stale hand-written ascAppId in
// eas.json can never point a submission at the wrong app.
//
// Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH, BUNDLE_ID
import { createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'

const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH, BUNDLE_ID } = process.env

for (const [name, value] of Object.entries({
  ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH, BUNDLE_ID,
})) {
  if (!value) {
    console.error(`${name} is not set`)
    process.exit(2)
  }
}

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o))
  .toString('base64url')

const now = Math.floor(Date.now() / 1000)
const signingInput = [
  b64({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' }),
  b64({ iss: ASC_ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' }),
].join('.')

const signer = createSign('SHA256')
signer.update(signingInput)
// App Store Connect expects JOSE-style raw R||S, not Node's default DER.
const jwt = `${signingInput}.${signer
  .sign({ key: readFileSync(ASC_KEY_PATH, 'utf8'), dsaEncoding: 'ieee-p1363' })
  .toString('base64url')}`

const res = await fetch(
  `https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}`,
  { headers: { Authorization: `Bearer ${jwt}` } },
)

if (!res.ok) {
  console.error(`App Store Connect returned HTTP ${res.status}`)
  console.error(await res.text())
  process.exit(1)
}

const { data } = await res.json()

if (!data?.length) {
  console.error(`No App Store Connect app record for ${BUNDLE_ID}.`)
  console.error('')
  console.error("Apple's API cannot create app records — this is a one-time")
  console.error('manual step at https://appstoreconnect.apple.com/apps')
  console.error(`("+" → New App, bundle id ${BUNDLE_ID}). Re-run afterwards.`)
  process.exit(1)
}

console.log(data[0].id)
